-- CC-01 P0 remediation: enforce tenant lifecycle in property access and
-- make the platform-admin registry the canonical founder authority.
-- This migration is intentionally staged for review; it has NOT been applied.

begin;

create or replace function public.staynas_user_has_property_access(
  _uid uuid,
  _property_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $function$
  select exists (
    select 1
    from public.staynas_property_members pm
    join public.staynas_properties p
      on p.id = pm.property_id
    join public.staynas_organisations o
      on o.id = p.organisation_id
    where pm.user_id = _uid
      and pm.property_id = _property_id
      and pm.status = 'active'
      and p.status <> 'suspended'
      and o.status = 'active'
  );
$function$;

create or replace function public.staynas_current_property_role()
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $function$
  select pm.role::text
  from public.staynas_user_property_context c
  join public.staynas_property_members pm
    on pm.property_id = c.property_id
   and pm.user_id = c.user_id
  join public.staynas_properties p
    on p.id = c.property_id
  join public.staynas_organisations o
    on o.id = p.organisation_id
  where c.user_id = auth.uid()
    and pm.status = 'active'
    and p.status <> 'suspended'
    and o.status = 'active'
  limit 1;
$function$;

-- Founder/platform authority is independent of operational property ownership.
-- The registry is service-role managed and self-readable under its existing RLS.
create or replace function public.is_staynas_founder_ai_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $function$
  select exists (
    select 1
    from public.staynas_platform_admins platform_admin
    where platform_admin.user_id = auth.uid()
  );
$function$;


-- Return every active role in the explicitly selected property. The previous
-- scalar helper could silently discard roles for multi-role property members.
create or replace function public.staynas_current_property_roles()
returns text[]
language sql
stable
security definer
set search_path = public, pg_temp
as $function$
  select coalesce(array_agg(distinct pm.role::text order by pm.role::text), array[]::text[])
  from public.staynas_user_property_context c
  join public.staynas_property_members pm
    on pm.property_id = c.property_id
   and pm.user_id = c.user_id
  join public.staynas_properties p
    on p.id = c.property_id
  join public.staynas_organisations o
    on o.id = p.organisation_id
  where c.user_id = auth.uid()
    and pm.status = 'active'
    and p.status <> 'suspended'
    and o.status = 'active';
$function$;

revoke all on function public.staynas_current_property_roles() from public, anon;
grant execute on function public.staynas_current_property_roles() to authenticated, service_role;


-- Folio access is always anchored to the booking's owning property. A caller
-- must have an allowed role in that same active property.
create or replace function public.staynas_user_has_property_role(
  _uid uuid,
  _property_id uuid,
  _roles public.app_role[]
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $function$
  select exists (
    select 1
    from public.staynas_property_members pm
    join public.staynas_properties p on p.id = pm.property_id
    join public.staynas_organisations o on o.id = p.organisation_id
    where pm.user_id = _uid
      and pm.property_id = _property_id
      and pm.status = 'active'
      and p.status <> 'suspended'
      and o.status = 'active'
      and pm.role = any(_roles)
  );
$function$;

drop policy if exists "Staff can read folio postings" on public.pms_folio_postings;
drop policy if exists "Staff can record folio postings" on public.pms_folio_postings;
drop policy if exists "Staff can update folio postings" on public.pms_folio_postings;

create policy "Property finance staff read folio postings"
  on public.pms_folio_postings for select to authenticated
  using (
    exists (
      select 1
      from public.bookings b
      where b.id = pms_folio_postings.booking_id
        and public.staynas_user_has_property_access(auth.uid(), b.property_id)
        and public.staynas_user_has_property_role(
          auth.uid(), b.property_id,
          array['owner'::public.app_role,'manager'::public.app_role,'finance'::public.app_role,'reception'::public.app_role]
        )
    )
  );

-- Folio mutations are only permitted through the atomic SECURITY DEFINER RPC.
revoke insert, update on public.pms_folio_postings from authenticated;

create or replace function public.pms_post_folio_charge(
  _idempotency_key text,
  _booking_id uuid,
  _amount numeric,
  _currency text,
  _description text,
  _source jsonb default '{}'::jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  _actor uuid := auth.uid();
  _existing public.pms_folio_postings%rowtype;
  _booking public.bookings%rowtype;
  _unit text;
  _ref text;
  _row public.pms_folio_postings%rowtype;
begin
  if _actor is null then
    raise exception 'Forbidden — folio posting requires property authorisation.';
  end if;

  -- Resolve and lock the booking before reading any idempotency record. This
  -- prevents cross-property callers from probing keys or retrieving postings.
  select * into _booking
  from public.bookings
  where id = _booking_id
  for update;

  if not found then
    return jsonb_build_object('status','failed','duplicate',false,'failure_code','guest_not_found','failure_message','No reservation found for this room.');
  end if;

  if not public.staynas_user_has_property_access(_actor, _booking.property_id)
     or not public.staynas_user_has_property_role(
       _actor, _booking.property_id,
       array['owner'::public.app_role,'manager'::public.app_role,'finance'::public.app_role,'reception'::public.app_role]
     ) then
    raise exception 'Forbidden — folio posting requires access to the booking property.';
  end if;

  select * into _existing
  from public.pms_folio_postings
  where idempotency_key = _idempotency_key;

  if found then
    if _existing.booking_id <> _booking_id then
      raise exception 'Idempotency key is already associated with another booking.';
    end if;
    if _existing.status = 'posted' then
      return jsonb_build_object(
        'status', 'posted', 'duplicate', true, 'posting_id', _existing.id,
        'posting_reference', _existing.posting_reference, 'folio_reference', _existing.folio_reference,
        'amount', _existing.amount, 'currency', _existing.currency
      );
    end if;
  end if;

  if _booking.status <> 'checked_in' then
    return jsonb_build_object('status','failed','duplicate',false,'failure_code','stay_not_active','failure_message','The stay is not currently checked in, so its folio is closed.');
  end if;

  if upper(coalesce(_currency,'')) <> upper(coalesce(_booking.currency,'')) then
    return jsonb_build_object('status','failed','duplicate',false,'failure_code','currency_mismatch',
      'failure_message', format('The folio is held in %s and cannot accept a charge in %s.', _booking.currency, _currency));
  end if;

  if _amount is null or _amount <= 0 then
    return jsonb_build_object('status','failed','duplicate',false,'failure_code','posting_rejected','failure_message','A folio charge must be greater than zero.');
  end if;

  select unit_label into _unit from public.room_states
   where booking_id = _booking_id order by updated_at desc limit 1;

  _ref := 'FOL-' || upper(coalesce(_booking.reference, substr(_booking_id::text, 1, 8))) || '-' ||
          to_char(now(), 'YYYYMMDDHH24MISS') || '-' || upper(substr(md5(_idempotency_key), 1, 6));

  update public.bookings set
    extras_total = coalesce(extras_total, 0) + _amount,
    total = coalesce(total, 0) + _amount,
    balance_due = coalesce(balance_due, 0) + _amount,
    balance_amount = coalesce(balance_amount, 0) + _amount,
    updated_at = now()
  where id = _booking_id;

  if found and _existing.id is not null then
    update public.pms_folio_postings set
      status = 'posted', posting_reference = _ref, folio_reference = _booking.reference,
      posted_at = now(), failure_code = null, failure_message = null
    where id = _existing.id returning * into _row;
  else
    insert into public.pms_folio_postings (
      booking_id, guest_id, room_id, unit_label, source_system, source_tenant_id, source_property_id,
      source_location_id, source_order_id, source_payment_id, idempotency_key, correlation_id,
      amount, currency, description, status, folio_reference, posting_reference, posted_at, created_by, metadata
    ) values (
      _booking_id, _booking.guest_id, _booking.room_id, _unit,
      coalesce(_source->>'source_system','restaurant_pos'),
      nullif(_source->>'tenant_id','')::uuid, _booking.property_id,
      nullif(_source->>'location_id','')::uuid, nullif(_source->>'order_id','')::uuid,
      nullif(_source->>'payment_id','')::uuid, _idempotency_key, _source->>'correlation_id',
      _amount, upper(_currency), coalesce(_description,'Outlet charge'), 'posted',
      _booking.reference, _ref, now(), _actor, coalesce(_source,'{}'::jsonb)
    ) returning * into _row;
  end if;

  return jsonb_build_object(
    'status','posted','duplicate',false,'posting_id',_row.id,
    'posting_reference',_row.posting_reference,'folio_reference',_row.folio_reference,
    'amount',_row.amount,'currency',_row.currency,'unit_label',_row.unit_label
  );
end;
$function$;

revoke all on function public.pms_post_folio_charge(text, uuid, numeric, text, text, jsonb) from public, anon;
grant execute on function public.pms_post_folio_charge(text, uuid, numeric, text, text, jsonb) to authenticated, service_role;


commit;
