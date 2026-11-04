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
create or replace function public.staynas_current_user_has_property_role(
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
    where pm.user_id = auth.uid()
      and pm.property_id = _property_id
      and pm.status = 'active'
      and p.status <> 'suspended'
      and o.status = 'active'
      and pm.role = any(_roles)
  );
$function$;

revoke all on function public.staynas_current_user_has_property_role(uuid, public.app_role[]) from public, anon;
grant execute on function public.staynas_current_user_has_property_role(uuid, public.app_role[]) to authenticated, service_role;

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
        and public.staynas_current_user_has_property_role(
          b.property_id,
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
     or not public.staynas_current_user_has_property_role(
       _booking.property_id,
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



-- Replace legacy global-role gates with membership checks against the exact
-- property owning each row (or its parent booking/room).

drop policy if exists "Staff manage own property booking extras" on public.booking_extras;
create policy "Staff manage own property booking extras" on public.booking_extras
  for all to authenticated
  using (
    exists (
      select 1 from public.bookings b
      where b.id = booking_extras.booking_id
        and public.staynas_user_has_property_access(auth.uid(), b.property_id)
        and public.staynas_current_user_has_property_role(b.property_id, array['owner'::public.app_role,'manager'::public.app_role,'admin'::public.app_role])
    )
  )
  with check (
    exists (
      select 1 from public.bookings b
      where b.id = booking_extras.booking_id
        and public.staynas_user_has_property_access(auth.uid(), b.property_id)
        and public.staynas_current_user_has_property_role(b.property_id, array['owner'::public.app_role,'manager'::public.app_role,'admin'::public.app_role])
    )
  );

drop policy if exists "Staff manage own property extras" on public.extras;
create policy "Staff manage own property extras" on public.extras
  for all to authenticated
  using (
    public.staynas_user_has_property_access(auth.uid(), property_id)
    and public.staynas_current_user_has_property_role(property_id, array['owner'::public.app_role,'manager'::public.app_role,'admin'::public.app_role])
  )
  with check (
    public.staynas_user_has_property_access(auth.uid(), property_id)
    and public.staynas_current_user_has_property_role(property_id, array['owner'::public.app_role,'manager'::public.app_role,'admin'::public.app_role])
  );

drop policy if exists "Admins delete own property holds" on public.booking_holds;
create policy "Admins delete own property holds" on public.booking_holds
  for delete to authenticated
  using (
    public.staynas_user_has_property_access(auth.uid(), property_id)
    and public.staynas_current_user_has_property_role(property_id, array['owner'::public.app_role,'manager'::public.app_role,'admin'::public.app_role])
  );

drop policy if exists "Room admins manage own property categories" on public.room_categories;
create policy "Room admins manage own property categories" on public.room_categories
  for all to authenticated
  using (
    public.staynas_user_has_property_access(auth.uid(), property_id)
    and public.staynas_current_user_has_property_role(property_id, array['owner'::public.app_role,'manager'::public.app_role,'admin'::public.app_role])
  )
  with check (
    public.staynas_user_has_property_access(auth.uid(), property_id)
    and public.staynas_current_user_has_property_role(property_id, array['owner'::public.app_role,'manager'::public.app_role,'admin'::public.app_role])
  );

drop policy if exists "Supervisors delete own property room_states" on public.room_states;
create policy "Supervisors delete own property room_states" on public.room_states
  for delete to authenticated
  using (
    public.staynas_user_has_property_access(auth.uid(), property_id)
    and public.staynas_current_user_has_property_role(property_id, array['owner'::public.app_role,'manager'::public.app_role,'admin'::public.app_role])
  );

drop policy if exists "Supervisors insert own property room_states" on public.room_states;
create policy "Supervisors insert own property room_states" on public.room_states
  for insert to authenticated
  with check (
    public.staynas_user_has_property_access(auth.uid(), property_id)
    and public.staynas_current_user_has_property_role(property_id, array['owner'::public.app_role,'manager'::public.app_role,'admin'::public.app_role])
  );

drop policy if exists "Supervisors update own property room_states" on public.room_states;
create policy "Supervisors update own property room_states" on public.room_states
  for update to authenticated
  using (
    public.staynas_user_has_property_access(auth.uid(), property_id)
    and public.staynas_current_user_has_property_role(property_id, array['owner'::public.app_role,'manager'::public.app_role,'admin'::public.app_role,'reception'::public.app_role,'finance'::public.app_role,'marketing'::public.app_role,'editor'::public.app_role,'reservations'::public.app_role])
    and not public.staynas_current_user_has_property_role(property_id, array['housekeeping'::public.app_role])
  )
  with check (
    public.staynas_user_has_property_access(auth.uid(), property_id)
    and public.staynas_current_user_has_property_role(property_id, array['owner'::public.app_role,'manager'::public.app_role,'admin'::public.app_role,'reception'::public.app_role,'finance'::public.app_role,'marketing'::public.app_role,'editor'::public.app_role,'reservations'::public.app_role])
    and not public.staynas_current_user_has_property_role(property_id, array['housekeeping'::public.app_role])
  );

drop policy if exists "Staff manage own property inventory" on public.room_inventory;
create policy "Staff manage own property inventory" on public.room_inventory
  for all to authenticated
  using (
    exists (
      select 1 from public.rooms r
      where r.id = room_inventory.room_id
        and public.staynas_user_has_property_access(auth.uid(), r.property_id)
        and public.staynas_current_user_has_property_role(r.property_id, array['owner'::public.app_role,'manager'::public.app_role,'admin'::public.app_role])
    )
  )
  with check (
    exists (
      select 1 from public.rooms r
      where r.id = room_inventory.room_id
        and public.staynas_user_has_property_access(auth.uid(), r.property_id)
        and public.staynas_current_user_has_property_role(r.property_id, array['owner'::public.app_role,'manager'::public.app_role,'admin'::public.app_role])
    )
  );

drop policy if exists "Managers manage accessible schedules" on public.staynas_staff_schedules;
create policy "Managers manage accessible schedules" on public.staynas_staff_schedules
  for all to authenticated
  using (
    public.staynas_user_has_property_access(auth.uid(), property_id)
    and public.staynas_current_user_has_property_role(property_id, array['owner'::public.app_role,'manager'::public.app_role,'admin'::public.app_role])
  )
  with check (
    public.staynas_user_has_property_access(auth.uid(), property_id)
    and public.staynas_current_user_has_property_role(property_id, array['owner'::public.app_role,'manager'::public.app_role,'admin'::public.app_role])
    and public.staynas_user_has_property_access(staff_user_id, property_id)
  );

drop policy if exists "Staff read accessible schedules" on public.staynas_staff_schedules;
create policy "Staff read accessible schedules" on public.staynas_staff_schedules
  for select to authenticated
  using (
    public.staynas_user_has_property_access(auth.uid(), property_id)
    and (
      staff_user_id = auth.uid()
      or public.staynas_current_user_has_property_role(property_id, array['owner'::public.app_role,'manager'::public.app_role,'admin'::public.app_role])
    )
  );

drop policy if exists "guest_communications_property_staff_all" on public.guest_communications;
create policy "guest_communications_property_staff_all" on public.guest_communications
  for all to authenticated
  using (
    public.staynas_user_has_property_access(auth.uid(), property_id)
    and public.staynas_current_user_has_property_role(property_id, array['owner'::public.app_role,'manager'::public.app_role,'reception'::public.app_role,'marketing'::public.app_role,'housekeeping'::public.app_role,'finance'::public.app_role,'admin'::public.app_role,'reservations'::public.app_role,'editor'::public.app_role])
  )
  with check (
    public.staynas_user_has_property_access(auth.uid(), property_id)
    and public.staynas_current_user_has_property_role(property_id, array['owner'::public.app_role,'manager'::public.app_role,'reception'::public.app_role,'marketing'::public.app_role,'housekeeping'::public.app_role,'finance'::public.app_role,'admin'::public.app_role,'reservations'::public.app_role,'editor'::public.app_role])
  );

drop policy if exists "guest_documents_property_staff_read" on public.guest_documents;
create policy "guest_documents_property_staff_read" on public.guest_documents
  for select to authenticated
  using (
    public.staynas_user_has_property_access(auth.uid(), property_id)
    and public.staynas_current_user_has_property_role(property_id, array['owner'::public.app_role,'manager'::public.app_role,'reception'::public.app_role])
  );

drop policy if exists "guest_documents_property_staff_update" on public.guest_documents;
create policy "guest_documents_property_staff_update" on public.guest_documents
  for update to authenticated
  using (
    public.staynas_user_has_property_access(auth.uid(), property_id)
    and public.staynas_current_user_has_property_role(property_id, array['owner'::public.app_role,'manager'::public.app_role,'reception'::public.app_role])
  )
  with check (
    public.staynas_user_has_property_access(auth.uid(), property_id)
    and public.staynas_current_user_has_property_role(property_id, array['owner'::public.app_role,'manager'::public.app_role,'reception'::public.app_role])
  );

drop policy if exists "guest_notes_property_staff_all" on public.guest_notes;
create policy "guest_notes_property_staff_all" on public.guest_notes
  for all to authenticated
  using (
    public.staynas_user_has_property_access(auth.uid(), property_id)
    and public.staynas_current_user_has_property_role(property_id, array['owner'::public.app_role,'manager'::public.app_role,'reception'::public.app_role,'marketing'::public.app_role,'housekeeping'::public.app_role,'finance'::public.app_role,'admin'::public.app_role,'reservations'::public.app_role,'editor'::public.app_role])
  )
  with check (
    public.staynas_user_has_property_access(auth.uid(), property_id)
    and public.staynas_current_user_has_property_role(property_id, array['owner'::public.app_role,'manager'::public.app_role,'reception'::public.app_role,'marketing'::public.app_role,'housekeeping'::public.app_role,'finance'::public.app_role,'admin'::public.app_role,'reservations'::public.app_role,'editor'::public.app_role])
  );

drop policy if exists "guest_preferences_property_staff_all" on public.guest_preferences;
create policy "guest_preferences_property_staff_all" on public.guest_preferences
  for all to authenticated
  using (
    public.staynas_user_has_property_access(auth.uid(), property_id)
    and public.staynas_current_user_has_property_role(property_id, array['owner'::public.app_role,'manager'::public.app_role,'reception'::public.app_role,'marketing'::public.app_role,'housekeeping'::public.app_role,'finance'::public.app_role,'admin'::public.app_role,'reservations'::public.app_role,'editor'::public.app_role])
  )
  with check (
    public.staynas_user_has_property_access(auth.uid(), property_id)
    and public.staynas_current_user_has_property_role(property_id, array['owner'::public.app_role,'manager'::public.app_role,'reception'::public.app_role,'marketing'::public.app_role,'housekeeping'::public.app_role,'finance'::public.app_role,'admin'::public.app_role,'reservations'::public.app_role,'editor'::public.app_role])
  );

drop policy if exists "guest_tag_assignments_property_staff_all" on public.guest_tag_assignments;
create policy "guest_tag_assignments_property_staff_all" on public.guest_tag_assignments
  for all to authenticated
  using (
    public.staynas_user_has_property_access(auth.uid(), property_id)
    and public.staynas_current_user_has_property_role(property_id, array['owner'::public.app_role,'manager'::public.app_role,'reception'::public.app_role,'marketing'::public.app_role,'housekeeping'::public.app_role,'finance'::public.app_role,'admin'::public.app_role,'reservations'::public.app_role,'editor'::public.app_role])
  )
  with check (
    public.staynas_user_has_property_access(auth.uid(), property_id)
    and public.staynas_current_user_has_property_role(property_id, array['owner'::public.app_role,'manager'::public.app_role,'reception'::public.app_role,'marketing'::public.app_role,'housekeeping'::public.app_role,'finance'::public.app_role,'admin'::public.app_role,'reservations'::public.app_role,'editor'::public.app_role])
  );

drop policy if exists "guest_threads_property_staff_read" on public.guest_threads;
create policy "guest_threads_property_staff_read" on public.guest_threads
  for select to authenticated
  using (
    exists (
      select 1 from public.bookings b
      where b.id = guest_threads.booking_id
        and public.staynas_user_has_property_access(auth.uid(), b.property_id)
        and public.staynas_current_user_has_property_role(b.property_id, array['owner'::public.app_role,'manager'::public.app_role,'reception'::public.app_role,'marketing'::public.app_role,'housekeeping'::public.app_role,'finance'::public.app_role,'admin'::public.app_role,'reservations'::public.app_role,'editor'::public.app_role])
    )
  );

drop policy if exists "email_events_property_staff_read" on public.email_events;
create policy "email_events_property_staff_read" on public.email_events
  for select to authenticated
  using (
    exists (
      select 1 from public.bookings b
      where b.id = email_events.booking_id
        and public.staynas_user_has_property_access(auth.uid(), b.property_id)
        and public.staynas_current_user_has_property_role(b.property_id, array['owner'::public.app_role,'manager'::public.app_role,'reception'::public.app_role,'marketing'::public.app_role,'housekeeping'::public.app_role,'finance'::public.app_role,'admin'::public.app_role,'reservations'::public.app_role,'editor'::public.app_role])
    )
  );

drop policy if exists "arrival_information_property_staff_read" on public.arrival_information;
create policy "arrival_information_property_staff_read" on public.arrival_information
  for select to authenticated
  using (
    exists (
      select 1 from public.bookings b
      where b.id = arrival_information.booking_id
        and public.staynas_user_has_property_access(auth.uid(), b.property_id)
        and public.staynas_current_user_has_property_role(b.property_id, array['owner'::public.app_role,'manager'::public.app_role,'reception'::public.app_role])
    )
  );

drop policy if exists "arrival_information_property_staff_update" on public.arrival_information;
create policy "arrival_information_property_staff_update" on public.arrival_information
  for update to authenticated
  using (
    exists (
      select 1 from public.bookings b
      where b.id = arrival_information.booking_id
        and public.staynas_user_has_property_access(auth.uid(), b.property_id)
        and public.staynas_current_user_has_property_role(b.property_id, array['owner'::public.app_role,'manager'::public.app_role,'reception'::public.app_role])
    )
  )
  with check (
    exists (
      select 1 from public.bookings b
      where b.id = arrival_information.booking_id
        and public.staynas_user_has_property_access(auth.uid(), b.property_id)
        and public.staynas_current_user_has_property_role(b.property_id, array['owner'::public.app_role,'manager'::public.app_role,'reception'::public.app_role])
    )
  );

drop policy if exists "arrival_passes_property_staff_read" on public.arrival_passes;
create policy "arrival_passes_property_staff_read" on public.arrival_passes
  for select to authenticated
  using (
    exists (
      select 1 from public.bookings b
      where b.id = arrival_passes.booking_id
        and public.staynas_user_has_property_access(auth.uid(), b.property_id)
        and public.staynas_current_user_has_property_role(b.property_id, array['owner'::public.app_role,'manager'::public.app_role,'reception'::public.app_role])
    )
  );

drop policy if exists "guest_checkin_activity_property_staff_read" on public.guest_checkin_activity;
create policy "guest_checkin_activity_property_staff_read" on public.guest_checkin_activity
  for select to authenticated
  using (
    exists (
      select 1 from public.bookings b
      where b.id = guest_checkin_activity.booking_id
        and public.staynas_user_has_property_access(auth.uid(), b.property_id)
        and public.staynas_current_user_has_property_role(b.property_id, array['owner'::public.app_role,'manager'::public.app_role,'reception'::public.app_role])
    )
  );

drop policy if exists "guest_checkins_property_staff_read" on public.guest_checkins;
create policy "guest_checkins_property_staff_read" on public.guest_checkins
  for select to authenticated
  using (
    exists (
      select 1 from public.bookings b
      where b.id = guest_checkins.booking_id
        and public.staynas_user_has_property_access(auth.uid(), b.property_id)
        and public.staynas_current_user_has_property_role(b.property_id, array['owner'::public.app_role,'manager'::public.app_role,'reception'::public.app_role])
    )
  );

drop policy if exists "guest_checkins_property_staff_update" on public.guest_checkins;
create policy "guest_checkins_property_staff_update" on public.guest_checkins
  for update to authenticated
  using (
    exists (
      select 1 from public.bookings b
      where b.id = guest_checkins.booking_id
        and public.staynas_user_has_property_access(auth.uid(), b.property_id)
        and public.staynas_current_user_has_property_role(b.property_id, array['owner'::public.app_role,'manager'::public.app_role,'reception'::public.app_role])
    )
  )
  with check (
    exists (
      select 1 from public.bookings b
      where b.id = guest_checkins.booking_id
        and public.staynas_user_has_property_access(auth.uid(), b.property_id)
        and public.staynas_current_user_has_property_role(b.property_id, array['owner'::public.app_role,'manager'::public.app_role,'reception'::public.app_role])
    )
  );

drop policy if exists "whatsapp_alerts_property_staff_read" on public.whatsapp_alerts;
create policy "whatsapp_alerts_property_staff_read" on public.whatsapp_alerts
  for select to authenticated
  using (
    exists (
      select 1 from public.bookings b
      where b.id = whatsapp_alerts.booking_id
        and public.staynas_user_has_property_access(auth.uid(), b.property_id)
        and public.staynas_current_user_has_property_role(b.property_id, array['owner'::public.app_role,'manager'::public.app_role,'reception'::public.app_role,'marketing'::public.app_role,'housekeeping'::public.app_role,'finance'::public.app_role,'admin'::public.app_role,'reservations'::public.app_role,'editor'::public.app_role])
    )
  );

drop policy if exists "Staff delete non-housekeeping ops_tasks" on public.ops_tasks;
create policy "Staff delete non-housekeeping ops_tasks" on public.ops_tasks
  for delete to authenticated
  using (
    public.staynas_user_has_property_access(auth.uid(), property_id)
    and public.staynas_current_user_has_property_role(property_id, array['owner'::public.app_role,'manager'::public.app_role,'reception'::public.app_role,'marketing'::public.app_role,'housekeeping'::public.app_role,'finance'::public.app_role,'admin'::public.app_role,'reservations'::public.app_role,'editor'::public.app_role])
    and coalesce(category, '') <> 'housekeeping'
  );

drop policy if exists "Staff manage non-housekeeping ops_tasks" on public.ops_tasks;
create policy "Staff manage non-housekeeping ops_tasks" on public.ops_tasks
  for insert to authenticated
  with check (
    public.staynas_user_has_property_access(auth.uid(), property_id)
    and public.staynas_current_user_has_property_role(property_id, array['owner'::public.app_role,'manager'::public.app_role,'reception'::public.app_role,'marketing'::public.app_role,'housekeeping'::public.app_role,'finance'::public.app_role,'admin'::public.app_role,'reservations'::public.app_role,'editor'::public.app_role])
    and coalesce(category, '') <> 'housekeeping'
  );

drop policy if exists "Staff update non-housekeeping ops_tasks" on public.ops_tasks;
create policy "Staff update non-housekeeping ops_tasks" on public.ops_tasks
  for update to authenticated
  using (
    public.staynas_user_has_property_access(auth.uid(), property_id)
    and public.staynas_current_user_has_property_role(property_id, array['owner'::public.app_role,'manager'::public.app_role,'reception'::public.app_role,'marketing'::public.app_role,'housekeeping'::public.app_role,'finance'::public.app_role,'admin'::public.app_role,'reservations'::public.app_role,'editor'::public.app_role])
    and coalesce(category, '') <> 'housekeeping'
  )
  with check (
    public.staynas_user_has_property_access(auth.uid(), property_id)
    and public.staynas_current_user_has_property_role(property_id, array['owner'::public.app_role,'manager'::public.app_role,'reception'::public.app_role,'marketing'::public.app_role,'housekeeping'::public.app_role,'finance'::public.app_role,'admin'::public.app_role,'reservations'::public.app_role,'editor'::public.app_role])
    and coalesce(category, '') <> 'housekeeping'
  );

drop policy if exists "Finance manage financial alerts" on public.financial_alerts;
create policy "Finance manage financial alerts" on public.financial_alerts
  for all to authenticated
  using (
    exists (
      select 1 from public.bookings b
      where b.id = financial_alerts.booking_id
        and public.staynas_user_has_property_access(auth.uid(), b.property_id)
        and public.staynas_current_user_has_property_role(b.property_id, array['owner'::public.app_role,'manager'::public.app_role,'finance'::public.app_role,'admin'::public.app_role])
    )
  )
  with check (
    exists (
      select 1 from public.bookings b
      where b.id = financial_alerts.booking_id
        and public.staynas_user_has_property_access(auth.uid(), b.property_id)
        and public.staynas_current_user_has_property_role(b.property_id, array['owner'::public.app_role,'manager'::public.app_role,'finance'::public.app_role,'admin'::public.app_role])
    )
  );

drop policy if exists "Finance staff can read payment events for accessible properties" on public.payment_events;
create policy "Finance staff can read payment events for accessible properties" on public.payment_events
  for select to authenticated
  using (
    booking_id is not null
    and exists (
      select 1 from public.bookings b
      where b.id = payment_events.booking_id
        and public.staynas_user_has_property_access(auth.uid(), b.property_id)
        and public.staynas_current_user_has_property_role(b.property_id, array['owner'::public.app_role,'manager'::public.app_role,'finance'::public.app_role])
    )
  );

drop policy if exists "Finance staff insert payment events for accessible properties" on public.payment_events;
create policy "Finance staff insert payment events for accessible properties" on public.payment_events
  for insert to authenticated
  with check (
    booking_id is not null
    and exists (
      select 1 from public.bookings b
      where b.id = payment_events.booking_id
        and public.staynas_user_has_property_access(auth.uid(), b.property_id)
        and public.staynas_current_user_has_property_role(b.property_id, array['owner'::public.app_role,'manager'::public.app_role,'finance'::public.app_role])
    )
    and current_setting('staynas.payment_rpc', true) = 'on'
  );



-- Housekeeping audit/event rows are scoped through their owning room state or task.
drop policy if exists "Housekeeping staff read action idempotency" on public.housekeeping_action_idempotency;
create policy "Housekeeping staff read action idempotency" on public.housekeeping_action_idempotency
  for select to authenticated
  using (
    exists (
      select 1 from public.ops_tasks t
      where t.id = housekeeping_action_idempotency.task_id
        and public.staynas_user_has_property_access(auth.uid(), t.property_id)
        and public.staynas_current_user_has_property_role(t.property_id, array['housekeeping'::public.app_role,'owner'::public.app_role,'manager'::public.app_role,'admin'::public.app_role])
    )
  );

drop policy if exists "Housekeeping staff read events" on public.housekeeping_events;
create policy "Housekeeping staff read events" on public.housekeeping_events
  for select to authenticated
  using (
    exists (
      select 1 from public.room_states rs
      where rs.id = housekeeping_events.room_state_id
        and public.staynas_user_has_property_access(auth.uid(), rs.property_id)
        and public.staynas_current_user_has_property_role(rs.property_id, array['housekeeping'::public.app_role,'owner'::public.app_role,'manager'::public.app_role,'admin'::public.app_role])
    )
    or exists (
      select 1 from public.ops_tasks t
      where t.id = housekeeping_events.task_id
        and public.staynas_user_has_property_access(auth.uid(), t.property_id)
        and public.staynas_current_user_has_property_role(t.property_id, array['housekeeping'::public.app_role,'owner'::public.app_role,'manager'::public.app_role,'admin'::public.app_role])
    )
    or exists (
      select 1 from public.housekeeping_exceptions ex
      join public.room_states rs on rs.id = ex.room_state_id
      where ex.id = housekeeping_events.exception_id
        and public.staynas_user_has_property_access(auth.uid(), rs.property_id)
        and public.staynas_current_user_has_property_role(rs.property_id, array['housekeeping'::public.app_role,'owner'::public.app_role,'manager'::public.app_role,'admin'::public.app_role])
    )
    or exists (
      select 1 from public.housekeeping_inspections i
      join public.room_states rs on rs.id = i.room_state_id
      where i.id = housekeeping_events.inspection_id
        and public.staynas_user_has_property_access(auth.uid(), rs.property_id)
        and public.staynas_current_user_has_property_role(rs.property_id, array['housekeeping'::public.app_role,'owner'::public.app_role,'manager'::public.app_role,'admin'::public.app_role])
    )
  );

drop policy if exists "Housekeeping staff read own property exceptions" on public.housekeeping_exceptions;
create policy "Housekeeping staff read own property exceptions" on public.housekeeping_exceptions
  for select to authenticated
  using (
    exists (
      select 1 from public.room_states rs
      where rs.id = housekeeping_exceptions.room_state_id
        and public.staynas_user_has_property_access(auth.uid(), rs.property_id)
        and public.staynas_current_user_has_property_role(rs.property_id, array['housekeeping'::public.app_role,'owner'::public.app_role,'manager'::public.app_role,'admin'::public.app_role])
    )
  );

drop policy if exists "Housekeeping staff read own property inspections" on public.housekeeping_inspections;
create policy "Housekeeping staff read own property inspections" on public.housekeeping_inspections
  for select to authenticated
  using (
    exists (
      select 1 from public.room_states rs
      where rs.id = housekeeping_inspections.room_state_id
        and public.staynas_user_has_property_access(auth.uid(), rs.property_id)
        and public.staynas_current_user_has_property_role(rs.property_id, array['housekeeping'::public.app_role,'owner'::public.app_role,'manager'::public.app_role,'admin'::public.app_role])
    )
  );

drop policy if exists "Staff read housekeeping transition log" on public.housekeeping_transition_log;
create policy "Staff read housekeeping transition log" on public.housekeeping_transition_log
  for select to authenticated
  using (
    exists (
      select 1 from public.room_states rs
      where rs.id = housekeeping_transition_log.room_state_id
        and public.staynas_user_has_property_access(auth.uid(), rs.property_id)
        and public.staynas_current_user_has_property_role(rs.property_id, array['housekeeping'::public.app_role,'owner'::public.app_role,'manager'::public.app_role,'admin'::public.app_role])
    )
  );



-- Room catalogue administration follows the owning property's membership.
drop policy if exists "Staff manage own property rooms" on public.rooms;
create policy "Staff manage own property rooms" on public.rooms
  for all to authenticated
  using (
    public.staynas_user_has_property_access(auth.uid(), property_id)
    and public.staynas_current_user_has_property_role(property_id, array['owner'::public.app_role,'manager'::public.app_role,'admin'::public.app_role])
  )
  with check (
    public.staynas_user_has_property_access(auth.uid(), property_id)
    and public.staynas_current_user_has_property_role(property_id, array['owner'::public.app_role,'manager'::public.app_role,'admin'::public.app_role])
  );

-- Public guests see only active room categories. Authenticated property staff
-- may also see inactive/draft categories for their own property.
drop policy if exists "Public read active room categories" on public.room_categories;
create policy "Public read active room categories" on public.room_categories
  for select to anon, authenticated
  using (status = 'active');

create policy "Property staff read all room categories" on public.room_categories
  for select to authenticated
  using (
    public.staynas_user_has_property_access(auth.uid(), property_id)
    and public.staynas_current_user_has_property_role(property_id, array['owner'::public.app_role,'manager'::public.app_role,'admin'::public.app_role,'reception'::public.app_role,'housekeeping'::public.app_role,'finance'::public.app_role,'marketing'::public.app_role,'reservations'::public.app_role,'editor'::public.app_role])
  );

-- These are platform-wide controls, not tenant-level configuration surfaces.
drop policy if exists "Admins manage pesapal settings" on public.pesapal_settings;
create policy "Founder admins manage pesapal settings" on public.pesapal_settings
  for all to authenticated
  using (public.is_staynas_founder_ai_admin())
  with check (public.is_staynas_founder_ai_admin());

drop policy if exists "Owners and admins update errors" on public.system_errors;
create policy "Founder admins update system errors" on public.system_errors
  for update to authenticated
  using (public.is_staynas_founder_ai_admin())
  with check (public.is_staynas_founder_ai_admin());

drop policy if exists "Owners and admins view errors" on public.system_errors;
create policy "Founder admins view system errors" on public.system_errors
  for select to authenticated
  using (public.is_staynas_founder_ai_admin());

drop policy if exists "Owners and admins view probes" on public.system_health_probes;
create policy "Founder admins view system probes" on public.system_health_probes
  for select to authenticated
  using (public.is_staynas_founder_ai_admin());

drop policy if exists "Staff managers can read all role assignments" on public.user_roles;
create policy "Founder admins can read all legacy role assignments" on public.user_roles
  for select to authenticated
  using (public.is_staynas_founder_ai_admin());



-- Global analytics and approval tables have no tenant key and remain platform-admin only.
drop policy if exists "Managers write analytics_recs" on public.ai_analytics_recommendations;
create policy "Managers write analytics_recs" on public.ai_analytics_recommendations for all to authenticated
using (public.is_staynas_founder_ai_admin()) with check (public.is_staynas_founder_ai_admin());

drop policy if exists "Managers write trend_snapshots" on public.ai_trend_snapshots;
create policy "Managers write trend_snapshots" on public.ai_trend_snapshots for all to authenticated
using (public.is_staynas_founder_ai_admin()) with check (public.is_staynas_founder_ai_admin());

drop policy if exists "Managers write dashboards" on public.analytics_dashboards;
create policy "Managers write dashboards" on public.analytics_dashboards for all to authenticated
using (public.is_staynas_founder_ai_admin()) with check (public.is_staynas_founder_ai_admin());

drop policy if exists "Managers write reports" on public.analytics_reports;
create policy "Managers write reports" on public.analytics_reports for all to authenticated
using (public.is_staynas_founder_ai_admin()) with check (public.is_staynas_founder_ai_admin());

drop policy if exists "Managers can write analytics_snapshots" on public.analytics_snapshots;
create policy "Managers can write analytics_snapshots" on public.analytics_snapshots for all to authenticated
using (public.is_staynas_founder_ai_admin()) with check (public.is_staynas_founder_ai_admin());

drop policy if exists "Staff can read analytics_snapshots" on public.analytics_snapshots;
create policy "Staff can read analytics_snapshots" on public.analytics_snapshots for select to authenticated
using (public.is_staynas_founder_ai_admin());

drop policy if exists "Managers write widgets" on public.analytics_widgets;
create policy "Managers write widgets" on public.analytics_widgets for all to authenticated
using (public.is_staynas_founder_ai_admin()) with check (public.is_staynas_founder_ai_admin());

drop policy if exists "Managers decide approvals" on public.approval_requests;
create policy "Managers decide approvals" on public.approval_requests for update to authenticated
using (public.is_staynas_founder_ai_admin()) with check (public.is_staynas_founder_ai_admin());


drop policy if exists "guest_tags_staff_catalog_all" on public.guest_tags;
create policy "guest_tags_staff_catalog_all" on public.guest_tags for all to authenticated
using (public.is_staynas_founder_ai_admin()) with check (public.is_staynas_founder_ai_admin());

drop policy if exists "Finance manage pricing rules" on public.pricing_rules;
create policy "Finance manage pricing rules" on public.pricing_rules for all to authenticated
using (public.is_staynas_founder_ai_admin()) with check (public.is_staynas_founder_ai_admin());


drop policy if exists "Owners and managers manage respad migration files" on public.respad_migration_files;
create policy "Owners and managers manage respad migration files" on public.respad_migration_files for all to authenticated
using (public.is_staynas_founder_ai_admin()) with check (public.is_staynas_founder_ai_admin());

drop policy if exists "Staff can manage review statistics" on public.review_statistics;
create policy "Staff can manage review statistics" on public.review_statistics for all to authenticated
using (public.is_staynas_founder_ai_admin()) with check (public.is_staynas_founder_ai_admin());

drop policy if exists "Staff can manage all reviews" on public.reviews;
create policy "Staff can manage all reviews" on public.reviews for all to authenticated
using (public.is_staynas_founder_ai_admin()) with check (public.is_staynas_founder_ai_admin());


-- Activity logs lack a property_id. Permit self-attributed inserts only for a
-- user with an active selected-property role; reads stay founder-only except
-- finance payment entries that resolve through their booking.
drop policy if exists "Staff can insert activity logs" on public.activity_logs;
create policy "Property staff can insert own activity logs" on public.activity_logs
  for insert to authenticated
  with check (
    actor_id = auth.uid()
    and cardinality(public.staynas_current_property_roles()) > 0
  );

drop policy if exists "Finance staff insert own payment audit logs" on public.activity_logs;
create policy "Finance staff insert own payment audit logs" on public.activity_logs
  for insert to authenticated
  with check (
    actor_id = auth.uid()
    and entity_type = 'booking'
    and module = 'finance.payments'
    and exists (
      select 1 from public.bookings b
      where b.id = activity_logs.entity_id
        and public.staynas_user_has_property_access(auth.uid(), b.property_id)
        and public.staynas_current_user_has_property_role(b.property_id, array['owner'::public.app_role,'manager'::public.app_role,'finance'::public.app_role])
    )
    and current_setting('staynas.payment_rpc', true) = 'on'
  );

drop policy if exists "Staff can view activity logs" on public.activity_logs;
create policy "Founder admins and property finance staff read activity logs" on public.activity_logs
  for select to authenticated
  using (
    public.is_staynas_founder_ai_admin()
    or (
      module = 'finance.payments'
      and entity_type = 'booking'
      and exists (
        select 1 from public.bookings b
        where b.id = activity_logs.entity_id
          and public.staynas_user_has_property_access(auth.uid(), b.property_id)
          and public.staynas_current_user_has_property_role(b.property_id, array['owner'::public.app_role,'manager'::public.app_role,'finance'::public.app_role])
      )
    )
  );


-- Give activity events an explicit tenant owner. The table is currently empty,
-- so this is a safe additive column; new server writes populate it from the
-- authenticated user's selected property context.
alter table public.activity_logs
  add column if not exists property_id uuid references public.staynas_properties(id) on delete set null;
create index if not exists activity_logs_property_created_idx
  on public.activity_logs(property_id, created_at desc);

drop policy if exists "Property staff can insert own activity logs" on public.activity_logs;
drop policy if exists "Finance staff insert own payment audit logs" on public.activity_logs;
drop policy if exists "Founder admins and property finance staff read activity logs" on public.activity_logs;

create policy "Property staff can insert own activity logs" on public.activity_logs
  for insert to authenticated
  with check (
    actor_id = auth.uid()
    and (
      public.is_staynas_founder_ai_admin()
      or (
        property_id is not null
        and public.staynas_user_has_property_access(auth.uid(), property_id)
        and public.staynas_current_user_has_property_role(property_id, array['owner'::public.app_role,'manager'::public.app_role,'reception'::public.app_role,'marketing'::public.app_role,'housekeeping'::public.app_role,'finance'::public.app_role,'admin'::public.app_role,'reservations'::public.app_role,'editor'::public.app_role])
        and coalesce(module, '') <> 'finance.payments'
      )
    )
  );

create policy "Finance staff insert own payment audit logs" on public.activity_logs
  for insert to authenticated
  with check (
    actor_id = auth.uid()
    and entity_type = 'booking'
    and module = 'finance.payments'
    and exists (
      select 1 from public.bookings b
      where b.id = activity_logs.entity_id
        and b.property_id = activity_logs.property_id
        and public.staynas_user_has_property_access(auth.uid(), b.property_id)
        and public.staynas_current_user_has_property_role(b.property_id, array['owner'::public.app_role,'manager'::public.app_role,'finance'::public.app_role])
    )
    and current_setting('staynas.payment_rpc', true) = 'on'
  );

create policy "Founder admins and property staff read activity logs" on public.activity_logs
  for select to authenticated
  using (
    public.is_staynas_founder_ai_admin()
    or (
      property_id is not null
      and public.staynas_user_has_property_access(auth.uid(), property_id)
      and public.staynas_current_user_has_property_role(property_id, array['owner'::public.app_role,'manager'::public.app_role,'reception'::public.app_role,'marketing'::public.app_role,'housekeeping'::public.app_role,'finance'::public.app_role,'admin'::public.app_role,'reservations'::public.app_role,'editor'::public.app_role])
    )
  );


-- Housekeeping event fan-out is tenant-local. The legacy implementation
-- notified every global owner/manager from user_roles regardless of property.
create or replace function public.housekeeping_record_event(
  _event_type text,
  _room_state_id uuid default null,
  _task_id uuid default null,
  _inspection_id uuid default null,
  _exception_id uuid default null,
  _actor_id uuid default null,
  _assignee_id uuid default null,
  _payload jsonb default '{}'::jsonb,
  _correlation_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  eid uuid;
  r uuid;
  title text;
  _property_id uuid;
begin
  select coalesce(
    (select rs.property_id from public.room_states rs where rs.id = _room_state_id),
    (select t.property_id from public.ops_tasks t where t.id = _task_id),
    (select rs.property_id from public.housekeeping_inspections i join public.room_states rs on rs.id = i.room_state_id where i.id = _inspection_id),
    (select rs.property_id from public.housekeeping_exceptions ex join public.room_states rs on rs.id = ex.room_state_id where ex.id = _exception_id)
  ) into _property_id;

  if _property_id is null then
    raise exception 'Housekeeping event must resolve to an owning property.';
  end if;

  if _assignee_id is not null and not exists (
    select 1 from public.staynas_property_members pm
    where pm.property_id = _property_id
      and pm.user_id = _assignee_id
      and pm.status = 'active'
  ) then
    raise exception 'Housekeeping assignee is not an active member of the event property.';
  end if;

  insert into public.housekeeping_events(
    event_type, room_state_id, task_id, inspection_id, exception_id,
    actor_id, assignee_id, payload, correlation_id
  )
  values(
    _event_type, _room_state_id, _task_id, _inspection_id, _exception_id,
    coalesce(_actor_id, auth.uid()), _assignee_id, coalesce(_payload, '{}'::jsonb), _correlation_id
  )
  returning id into eid;

  title := initcap(replace(_event_type, '_', ' '));

  if _assignee_id is not null
     and _event_type in (
       'task_assigned','cleaning_started','cleaning_completed',
       'inspection_requested','inspection_passed','inspection_failed',
       'exception_reported','exception_resolved','maintenance_escalated'
     )
  then
    insert into public.housekeeping_notifications(
      recipient_user_id, event_id, kind, title, body, href
    )
    values(
      _assignee_id, eid, _event_type, title,
      _payload->>'summary', '/admin/operations/housekeeping'
    )
    on conflict do nothing;
  end if;

  if _event_type in (
    'task_created','task_assigned','inspection_requested','inspection_passed',
    'inspection_failed','exception_reported','exception_resolved',
    'room_ready','maintenance_escalated'
  )
  then
    for r in
      select distinct pm.user_id
      from public.staynas_property_members pm
      where pm.property_id = _property_id
        and pm.status = 'active'
        and pm.role = any(array['owner'::public.app_role,'manager'::public.app_role,'admin'::public.app_role])
    loop
      insert into public.housekeeping_notifications(
        recipient_user_id, event_id, kind, title, body, href
      )
      values(
        r, eid, _event_type, title,
        _payload->>'summary', '/admin/operations/housekeeping'
      )
      on conflict do nothing;
    end loop;
  end if;

  return eid;
end;
$function$;

revoke all on function public.housekeeping_record_event(text, uuid, uuid, uuid, uuid, uuid, uuid, jsonb, uuid) from public, anon, authenticated;
grant execute on function public.housekeeping_record_event(text, uuid, uuid, uuid, uuid, uuid, uuid, jsonb, uuid) to service_role;



-- The application now provisions property memberships directly. Stop the
-- legacy global-role trigger from silently granting Nolmark property access.
drop trigger if exists staynas_user_role_property_bootstrap on public.user_roles;


-- Payment RPCs authorize against the locked booking's property and attach that
-- property to their immutable audit entries.
CREATE OR REPLACE FUNCTION public.record_booking_payment(_booking_id uuid, _amount numeric, _event_type text, _method text, _note text, _idempotency_key text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_actor uuid := auth.uid();
  v_booking public.bookings%rowtype;
  v_event public.payment_events%rowtype;
  v_signed_amount numeric(14,2);
  v_new_paid numeric(14,2);
  v_new_balance numeric(14,2);
  v_new_status public.payment_status;
begin
  if v_actor is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;
  if _booking_id is null then
    raise exception using errcode = '22023', message = 'Booking is required';
  end if;
  if _amount is null or _amount <= 0 or _amount <> round(_amount, 2) then
    raise exception using errcode = '22023', message = 'Amount must be positive and limited to two decimal places';
  end if;
  if _event_type is null or _event_type not in ('manual_payment','refund') then
    raise exception using errcode = '22023', message = 'Unsupported payment event type';
  end if;
  if nullif(btrim(_method), '') is null or _method <> btrim(_method) or length(_method) > 40 then
    raise exception using errcode = '22023', message = 'A valid payment method is required';
  end if;
  if _note is not null and length(_note) > 500 then
    raise exception using errcode = '22023', message = 'Note must be 500 characters or fewer';
  end if;
  if nullif(btrim(_idempotency_key), '') is null
     or length(_idempotency_key) < 8
     or length(_idempotency_key) > 128 then
    raise exception using errcode = '22023', message = 'A valid idempotency key is required';
  end if;

  select b.* into v_booking
  from public.bookings b
  where b.id = _booking_id
    and public.staynas_user_has_property_access(v_actor, b.property_id)
  for update;

  if not found then
    raise exception using errcode = '42501', message = 'Booking not found or property access denied';
  end if;
  if not public.staynas_current_user_has_property_role(
    v_booking.property_id, array['owner','manager','finance']::public.app_role[]
  ) then
    raise exception using errcode = '42501', message = 'Finance permission required for this property';
  end if;

  -- Restrict the transaction-local write context to this atomic RPC.
  perform set_config('staynas.payment_rpc', 'on', true);

  -- Retries with the same key and same payload return the original result.
  select e.* into v_event
  from public.payment_events e
  where e.booking_id = _booking_id
    and e.idempotency_key = _idempotency_key;

  if found then
    if v_event.event_type <> _event_type
       or v_event.amount <> (case when _event_type = 'refund' then -_amount else _amount end)
       or coalesce(v_event.payment_method,'') <> _method
       or coalesce(v_event.currency,'') <> v_booking.currency then
      raise exception using errcode = '23505', message = 'Idempotency key was already used with a different payment payload';
    end if;
    return jsonb_build_object(
      'ok', true, 'duplicate', true, 'event_id', v_event.id,
      'paid_amount', coalesce(v_booking.paid_amount,0),
      'balance_amount', v_booking.balance_amount,
      'payment_status', v_booking.payment_status
    );
  end if;

  v_signed_amount := (case when _event_type = 'refund' then -_amount else _amount end);
  v_new_paid := round(coalesce(v_booking.paid_amount,0) + v_signed_amount, 2);

  if v_new_paid < 0 then
    raise exception using errcode = '22023', message = 'Refund exceeds the amount previously paid';
  end if;
  if _event_type = 'manual_payment' and v_new_paid > v_booking.total then
    raise exception using errcode = '22023', message = 'Payment exceeds the outstanding booking amount';
  end if;

  v_new_balance := greatest(0, round(v_booking.total - v_new_paid, 2));
  if v_new_paid >= v_booking.total then
    v_new_status := 'paid';
  elsif v_new_paid > 0 and v_new_paid >= v_booking.deposit_amount then
    v_new_status := 'deposit_paid';
  elsif v_new_paid = 0 and _event_type = 'refund' then
    v_new_status := 'refunded';
  else
    v_new_status := 'unpaid';
  end if;

  insert into public.payment_events (
    booking_id, provider, event_type, amount, currency,
    payment_method, idempotency_key, raw
  ) values (
    _booking_id, 'manual', _event_type, v_signed_amount, v_booking.currency,
    _method, _idempotency_key,
    jsonb_build_object('note', nullif(_note,''), 'actor_id', v_actor)
  )
  returning * into v_event;

  update public.bookings
  set paid_amount = v_new_paid,
      balance_amount = v_new_balance,
      payment_status = v_new_status,
      payment_method = _method
  where id = _booking_id;

  insert into public.activity_logs (
    property_id, actor_id, action, entity_type, entity_id, entity_label,
    module, metadata, severity
  ) values (
    v_booking.property_id, v_actor, 'finance.' || _event_type, 'booking', _booking_id,
    v_booking.reference, 'finance.payments',
    jsonb_build_object(
      'event_id', v_event.id, 'amount', v_signed_amount,
      'currency', v_booking.currency, 'method', _method,
      'note', nullif(_note,''), 'idempotency_key', _idempotency_key
    ),
    'audit'
  );

  return jsonb_build_object(
    'ok', true, 'duplicate', false, 'event_id', v_event.id,
    'paid_amount', v_new_paid, 'balance_amount', v_new_balance,
    'payment_status', v_new_status
  );
end;
$function$


CREATE OR REPLACE FUNCTION public.record_booking_refund(_booking_id uuid, _payment_event_id uuid, _amount numeric, _method text, _note text, _idempotency_key text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_actor uuid := auth.uid();
  v_booking public.bookings%rowtype;
  v_payment public.payment_events%rowtype;
  v_refund public.payment_events%rowtype;
  v_already_refunded numeric(14,2);
  v_paid numeric(14,2);
  v_balance numeric(14,2);
  v_status public.payment_status;
  v_signed numeric(14,2);
begin
  if v_actor is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;
  if _booking_id is null or _payment_event_id is null then
    raise exception using errcode = '22023', message = 'Booking and original payment are required';
  end if;
  if _amount is null or _amount <= 0 or _amount <> round(_amount, 2) then
    raise exception using errcode = '22023', message = 'Refund amount must be positive and limited to two decimal places';
  end if;
  if nullif(btrim(_method), '') is null or _method <> btrim(_method) or length(_method) > 40 then
    raise exception using errcode = '22023', message = 'A valid refund method is required';
  end if;
  if nullif(btrim(_note), '') is null then
    raise exception using errcode = '22023', message = 'A refund reason is required';
  end if;
  if length(_note) > 500 then
    raise exception using errcode = '22023', message = 'Note must be 500 characters or fewer';
  end if;
  if nullif(btrim(_idempotency_key), '') is null or length(_idempotency_key) < 8 or length(_idempotency_key) > 128 then
    raise exception using errcode = '22023', message = 'A valid idempotency key is required';
  end if;

  select b.* into v_booking
  from public.bookings b
  where b.id = _booking_id
    and public.staynas_user_has_property_access(v_actor, b.property_id)
  for update;
  if not found then
    raise exception using errcode = '42501', message = 'Booking not found or property access denied';
  end if;
  if not public.staynas_current_user_has_property_role(
    v_booking.property_id, array['owner','manager','finance']::public.app_role[]
  ) then
    raise exception using errcode = '42501', message = 'Finance permission required for this property';
  end if;

  -- The booking row is already locked above. That lock serializes every
  -- refund on this booking, so do not request UPDATE privilege on the
  -- tenant-readable payment_events table just to lock the source event.
  select e.* into v_payment
  from public.payment_events e
  where e.id = _payment_event_id
    and e.booking_id = _booking_id
    and e.amount > 0
    and e.event_type in ('manual_payment','payment_completed');
  if not found then
    raise exception using errcode = '22023', message = 'Original payment event is not refundable';
  end if;
  if upper(coalesce(v_payment.currency,'')) <> upper(coalesce(v_booking.currency,'')) then
    raise exception using errcode = '22023', message = 'Original payment currency does not match booking currency';
  end if;
  if exists (
    select 1 from public.payment_events e
    where e.provider_reverses_event_id = _payment_event_id
  ) then
    raise exception using errcode = '55000',
      message = 'This Pesapal settlement was provider-reversed and cannot receive a cash refund';
  end if;

  perform set_config('staynas.payment_rpc', 'on', true);

  select e.* into v_refund
  from public.payment_events e
  where e.booking_id = _booking_id
    and e.idempotency_key = _idempotency_key;
  if found then
    if v_refund.event_type <> 'refund'
       or v_refund.reverses_event_id is distinct from _payment_event_id
       or abs(v_refund.amount) <> _amount
       or coalesce(v_refund.payment_method,'') <> _method
       or upper(coalesce(v_refund.currency,'')) <> upper(coalesce(v_booking.currency,'')) then
      raise exception using errcode = '23505', message = 'Idempotency key was already used with a different refund payload';
    end if;
    return jsonb_build_object(
      'ok', true, 'duplicate', true, 'event_id', v_refund.id,
      'paid_amount', coalesce(v_booking.paid_amount,0),
      'balance_amount', v_booking.balance_amount,
      'payment_status', v_booking.payment_status
    );
  end if;

  -- Legacy refunds without an original-event link cannot safely be allocated
  -- to this payment. Fail closed instead of risking a duplicate cash refund.
  if exists (
    select 1 from public.payment_events e
    where e.booking_id = _booking_id
      and e.event_type = 'refund'
      and e.reverses_event_id is null
  ) then
    raise exception using errcode = '55000',
      message = 'This booking has legacy unlinked refunds; reconcile them before issuing another refund';
  end if;

  select coalesce(sum(abs(e.amount)),0) into v_already_refunded
  from public.payment_events e
  where e.reverses_event_id = _payment_event_id
    and e.event_type = 'refund';

  if v_already_refunded + _amount > v_payment.amount then
    raise exception using errcode = '22023', message = 'Refund exceeds the remaining refundable amount for this payment';
  end if;

  v_paid := round(coalesce(v_booking.paid_amount,0) - _amount, 2);
  if v_paid < 0 then
    raise exception using errcode = '22023', message = 'Refund exceeds net amount paid on this booking';
  end if;
  v_balance := greatest(0, round(v_booking.total - v_paid, 2));
  if v_paid = 0 then
    v_status := 'refunded';
  elsif v_paid >= v_booking.total then
    v_status := 'paid';
  elsif v_paid >= coalesce(v_booking.deposit_amount,0) then
    v_status := 'deposit_paid';
  else
    v_status := 'unpaid';
  end if;

  v_signed := -_amount;
  insert into public.payment_events (
    booking_id, provider, event_type, amount, currency, payment_method,
    reverses_event_id, idempotency_key, raw
  ) values (
    _booking_id, 'manual', 'refund', v_signed, upper(v_booking.currency), _method,
    _payment_event_id, _idempotency_key,
    jsonb_build_object('note', btrim(_note), 'actor_id', v_actor, 'original_payment_event_id', _payment_event_id)
  ) returning * into v_refund;

  update public.bookings
  set paid_amount = v_paid,
      balance_amount = v_balance,
      payment_status = v_status
  where id = _booking_id;

  insert into public.activity_logs (
    property_id, actor_id, action, entity_type, entity_id, entity_label, module, metadata, severity
  ) values (
    v_booking.property_id, v_actor, 'finance.refund', 'booking', _booking_id, v_booking.reference, 'finance.payments',
    jsonb_build_object(
      'event_id', v_refund.id, 'original_payment_event_id', _payment_event_id,
      'amount', v_signed, 'currency', v_booking.currency, 'method', _method,
      'note', nullif(_note,''), 'idempotency_key', _idempotency_key
    ), 'audit'
  );

  return jsonb_build_object(
    'ok', true, 'duplicate', false, 'event_id', v_refund.id,
    'paid_amount', v_paid, 'balance_amount', v_balance, 'payment_status', v_status
  );
end;
$function$


CREATE OR REPLACE FUNCTION public.enforce_finance_payment_audit_context()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  if (new.module = 'finance.payments' or new.action like 'finance.%')
     and coalesce(auth.role(), '') <> 'service_role' then
    if current_setting('staynas.payment_rpc', true) is distinct from 'on' then
      raise exception using errcode = '42501',
        message = 'Finance payment audit rows must be written by the atomic payment RPC';
    end if;
    if new.actor_id is distinct from auth.uid()
       or new.entity_type <> 'booking'
       or not public.staynas_current_user_has_property_role(
         new.property_id, array['owner','manager','finance']::public.app_role[]
       )
       or not exists (
         select 1 from public.bookings b
         where b.id = new.entity_id
           and b.property_id = new.property_id
           and public.staynas_user_has_property_access(auth.uid(), b.property_id)
       ) then
      raise exception using errcode = '42501',
        message = 'Finance audit actor or property scope is invalid';
    end if;
  end if;
  return new;
end;
$function$




-- Booking and arrival RPCs authorize against the target booking property.
CREATE OR REPLACE FUNCTION public.arrival_pass_validate(_pass_token text, _client jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _property_id uuid;
BEGIN
  SELECT b.property_id INTO _property_id
  FROM public.arrival_passes p
  JOIN public.bookings b ON b.id = p.booking_id
  WHERE p.token = _pass_token;

  IF _property_id IS NULL
     OR NOT public.staynas_user_has_property_access(auth.uid(), _property_id)
     OR NOT public.staynas_current_user_has_property_role(_property_id, ARRAY['owner','manager','reception']::public.app_role[]) THEN
    RAISE EXCEPTION 'Arrival pass not found or property access denied';
  END IF;

  RETURN public.arrival_pass_validate_unscoped(_pass_token, COALESCE(_client, '{}'::jsonb));
END;
$function$


CREATE OR REPLACE FUNCTION public.arrival_pass_validate_unscoped(_pass_token text, _client jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _p public.arrival_passes%ROWTYPE;
  _b public.bookings%ROWTYPE;
  _r public.rooms%ROWTYPE;
  _c public.guest_checkins%ROWTYPE;
  _a public.arrival_information%ROWTYPE;
  _unit text;
  _e jsonb;
  _fp_before text;
  _code text := 'valid';
  _msg text := 'Arrival pass verified';
  _ok boolean := true;
  _docs jsonb;
BEGIN
  IF _pass_token IS NULL OR length(_pass_token) < 24 THEN
    RETURN jsonb_build_object('ok', false, 'code','invalid','message','This code is not a Mtoni arrival pass.');
  END IF;

  SELECT * INTO _p FROM public.arrival_passes WHERE token = _pass_token FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code','invalid','message','No arrival pass matches this code.');
  END IF;

  SELECT * INTO _b FROM public.bookings WHERE id = _p.booking_id;
  SELECT * INTO _r FROM public.rooms WHERE id = _b.room_id;
  SELECT * INTO _c FROM public.guest_checkins WHERE id = _p.checkin_id;
  SELECT * INTO _a FROM public.arrival_information WHERE checkin_id = _p.checkin_id;
  SELECT unit_label INTO _unit FROM public.room_states WHERE booking_id = _b.id LIMIT 1;

  SELECT jsonb_build_object(
           'total', count(*),
           'verified', count(*) FILTER (WHERE status = 'verified'),
           'rejected', count(*) FILTER (WHERE status = 'rejected'))
    INTO _docs FROM public.guest_documents WHERE booking_id = _b.id;

  _e := public.checkin_eligibility(_b.id);
  _fp_before := _p.reservation_snapshot->>'fingerprint';

  IF _p.status = 'revoked' THEN
    _ok := false; _code := 'revoked'; _msg := 'This arrival pass was revoked. Continue at the front desk.';
  ELSIF _p.status = 'used' THEN
    _ok := false; _code := 'used'; _msg := 'This arrival pass has already been used for arrival.';
  ELSIF _p.status = 'expired' OR _p.expires_at <= now() THEN
    _ok := false; _code := 'expired'; _msg := 'This arrival pass has expired.';
  ELSIF _b.status = 'cancelled' THEN
    _ok := false; _code := 'cancelled'; _msg := 'This reservation has been cancelled.';
  ELSIF _b.status IN ('completed','no_show') THEN
    _ok := false; _code := 'ineligible'; _msg := 'This reservation is closed.';
  ELSIF _fp_before IS NOT NULL AND _e->'snapshot'->>'fingerprint' IS DISTINCT FROM _fp_before THEN
    _ok := false; _code := 'reservation_changed';
    _msg := 'The reservation changed after this pass was issued. Review before confirming arrival.';
  END IF;

  UPDATE public.arrival_passes
     SET scan_count = scan_count + 1, last_scanned_at = now(),
         status = CASE WHEN status = 'active' AND expires_at <= now() THEN 'expired'::public.arrival_pass_status ELSE status END,
         updated_at = now()
   WHERE id = _p.id;

  PERFORM public.checkin_log_activity(_p.checkin_id, _b.id, 'arrival_pass_scanned', NULL,
    jsonb_build_object('pass_id', _p.id, 'result', _code, 'device', _client->>'device'));

  INSERT INTO public.activity_logs (actor_id, action, module, entity_type, entity_id, entity_label,
                                    severity, metadata, ip_address, user_agent)
  VALUES (auth.uid(), 'arrival_pass.scanned', 'operations', 'booking', _b.id, _b.reference,
          'audit', jsonb_build_object('pass_id', _p.id, 'result', _code,
                                      'guest_id', _b.guest_id, 'device', _client->>'device',
                                      'timezone', _client->>'timezone'),
          NULLIF(_client->>'ip',''), NULLIF(_client->>'user_agent',''));

  RETURN jsonb_build_object(
    'ok', _ok, 'code', _code, 'message', _msg,
    'pass', jsonb_build_object('id', _p.id, 'token', _p.token, 'status', _p.status,
                               'issued_at', _p.issued_at, 'expires_at', _p.expires_at,
                               'used_at', _p.used_at, 'scan_count', _p.scan_count + 1),
    'reservation', jsonb_build_object('id', _b.id, 'reference', _b.reference, 'status', _b.status,
                                      'guest_name', _b.guest_name, 'guest_email', _b.guest_email,
                                      'check_in', _b.check_in, 'check_out', _b.check_out,
                                      'nights', _b.nights, 'adults', _b.adults, 'children', _b.children,
                                      'room_name', COALESCE(_r.name,'Room'), 'unit_label', _unit,
                                      'payment_status', _b.payment_status,
                                      'balance_amount', _b.balance_amount, 'currency', _b.currency,
                                      'checked_in_at', _b.checked_in_at,
                                      'special_requests', COALESCE(_a.special_requests, _b.special_requests),
                                      'estimated_arrival_time', _a.estimated_arrival_time),
    'checkin', jsonb_build_object('id', _c.id, 'status', _c.status, 'submitted_at', _c.submitted_at),
    'documents', COALESCE(_docs, '{}'::jsonb),
    'eligibility', _e);
END $function$


CREATE OR REPLACE FUNCTION public.checkin_ensure_for_booking(_booking_id uuid)
 RETURNS TABLE(id uuid, token text, status checkin_status, expires_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _b public.bookings%ROWTYPE;
BEGIN
  SELECT * INTO _b FROM public.bookings WHERE bookings.id = _booking_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Reservation not found'; END IF;
  IF auth.uid() IS NULL
     OR NOT public.staynas_user_has_property_access(auth.uid(), _b.property_id)
     OR NOT public.staynas_current_user_has_property_role(_b.property_id, ARRAY['owner','manager','reception']::public.app_role[]) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  INSERT INTO public.guest_checkins (booking_id, guest_id, expires_at)
  VALUES (_b.id, _b.guest_id, (_b.check_out + interval '1 day')::timestamptz)
  ON CONFLICT (booking_id) DO UPDATE SET updated_at = now();

  RETURN QUERY
    SELECT c.id, c.token, c.status, c.expires_at
      FROM public.guest_checkins c WHERE c.booking_id = _b.id;
END $function$


CREATE OR REPLACE FUNCTION public.staynas_enforce_booking_lifecycle()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_actor uuid := auth.uid();
begin
  if new.status is not distinct from old.status then
    return new;
  end if;

  if new.status::text = 'confirmed' then
    if old.status::text <> 'pending'
      or (v_actor is not null and not public.staynas_current_user_has_property_role(new.property_id, array['owner','manager','admin','reservations','reception']::public.app_role[])) then
      raise exception using errcode = '42501', message = 'Only authorized reservations staff may confirm a pending booking';
    end if;
    new.confirmed_at := coalesce(new.confirmed_at, now());
  elsif new.status::text = 'checked_in' then
    if old.status::text <> 'confirmed'
      or (v_actor is not null and not public.staynas_current_user_has_property_role(new.property_id, array['owner','manager','admin','reception']::public.app_role[])) then
      raise exception using errcode = '42501', message = 'Only front-desk staff may check in a confirmed booking';
    end if;
    new.checked_in_at := coalesce(new.checked_in_at, now());
  elsif new.status::text = 'completed' then
    if old.status::text <> 'checked_in'
      or (v_actor is not null and not public.staynas_current_user_has_property_role(new.property_id, array['owner','manager','admin','reception']::public.app_role[])) then
      raise exception using errcode = '42501', message = 'A booking must be checked in by authorized front-desk staff before completion';
    end if;
    if exists (select 1 from public.room_states rs where rs.room_id = old.room_id)
      and not exists (
        select 1 from public.room_states rs
        where rs.booking_id = old.id and rs.room_id = old.room_id and rs.state = 'occupied'
      ) then
      raise exception using errcode = '55000', message = 'Checkout requires the assigned physical room to be in occupied state';
    end if;
  elsif new.status::text = 'cancelled' then
    if old.status::text not in ('pending','confirmed')
      or (v_actor is not null and not public.staynas_current_user_has_property_role(new.property_id, array['owner','manager','admin','reservations']::public.app_role[])) then
      raise exception using errcode = '42501', message = 'Cancellation is permitted only for pending or confirmed bookings by reservations managers';
    end if;
    new.cancelled_at := coalesce(new.cancelled_at, now());
  elsif new.status::text = 'no_show' then
    if old.status::text <> 'confirmed'
      or (now() at time zone coalesce((select sp.timezone from public.staynas_properties sp where sp.id = old.property_id), 'Africa/Dar_es_Salaam'))::date <= old.check_in
      or (v_actor is not null and not public.staynas_current_user_has_property_role(new.property_id, array['owner','manager','admin','reservations']::public.app_role[])) then
      raise exception using errcode = '42501', message = 'No-show requires an unarrived confirmed booking after its check-in date and reservations authorization';
    end if;
  else
    raise exception using errcode = '22023', message = 'Unsupported booking lifecycle transition';
  end if;

  return new;
end;
$function$




-- Public booking-hold release remains session-bound; staff override is scoped
-- to the exact property. Retire the old hard-coded Mtoni property id.
CREATE OR REPLACE FUNCTION public.release_booking_hold_for_property(_property_id uuid, _hold_id uuid, _session_id text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _h public.booking_holds%ROWTYPE;
BEGIN
 IF _property_id IS NULL THEN RAISE EXCEPTION 'property_id is required'; END IF;
 SELECT h.* INTO _h FROM public.booking_holds h JOIN public.rooms r ON r.id=h.room_id
 WHERE h.id=_hold_id AND r.property_id=_property_id FOR UPDATE OF h;
 IF NOT FOUND OR _h.status<>'active' THEN RETURN false; END IF;
 IF _session_id IS NULL OR (_h.session_id<>_session_id AND NOT public.staynas_current_user_has_property_role(_property_id, ARRAY['owner','manager','reception','reservations']::public.app_role[])) THEN
   RAISE EXCEPTION 'Not authorized to release this hold';
 END IF;
 UPDATE public.booking_holds SET status='released',updated_at=now() WHERE id=_hold_id;
 PERFORM public.log_calendar_event('hold.released',_h.room_id,NULL,_h.id,_h.check_in,_h.check_out,jsonb_build_object('property_id',_property_id));
 RETURN true;
END $function$


CREATE OR REPLACE FUNCTION public.release_booking_hold(_hold_id uuid, _session_id text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  _property_id uuid;
BEGIN
  SELECT r.property_id INTO _property_id
  FROM public.booking_holds h
  JOIN public.rooms r ON r.id = h.room_id
  WHERE h.id = _hold_id;

  IF NOT FOUND OR _property_id IS NULL THEN
    RETURN false;
  END IF;

  RETURN public.release_booking_hold_for_property(_property_id, _hold_id, _session_id);
END;
$function$



-- Calendar RPCs authorize the actor against the requested property.
CREATE OR REPLACE FUNCTION public.staynas_calendar_audit_events(_property_id uuid, _from date, _to date, _limit integer DEFAULT 100)
 RETURNS TABLE(id uuid, event_type text, room_id uuid, booking_id uuid, hold_id uuid, date_from date, date_to date, actor_id uuid, payload jsonb, created_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _timezone text;
  _uid uuid := auth.uid();
BEGIN
  IF _uid IS NULL OR NOT public.staynas_current_user_has_property_role(_property_id, ARRAY['owner','manager','admin','reception','housekeeping']::public.app_role[]) THEN
    RAISE EXCEPTION 'Operations calendar access required';
  END IF;
  IF NOT public.staynas_user_has_property_access(_uid, _property_id) THEN
    RAISE EXCEPTION 'Property access denied';
  END IF;
  IF _to <= _from OR (_to - _from) > 93 THEN
    RAISE EXCEPTION 'Invalid calendar range';
  END IF;
  IF _limit < 1 OR _limit > 200 THEN
    RAISE EXCEPTION 'Invalid event limit';
  END IF;

  SELECT p.timezone INTO _timezone
  FROM public.staynas_properties p
  WHERE p.id = _property_id AND p.status = 'active';
  IF _timezone IS NULL THEN RAISE EXCEPTION 'Active property not found'; END IF;

  RETURN QUERY
  SELECT e.id, e.event_type, e.room_id, e.booking_id, e.hold_id,
         e.date_from, e.date_to, e.actor_id, e.payload, e.created_at
  FROM public.calendar_events e
  WHERE (
    (e.room_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.rooms r
      WHERE r.id = e.room_id AND r.property_id = _property_id
    ))
    OR (e.booking_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.bookings b
      WHERE b.id = e.booking_id AND b.property_id = _property_id
    ))
    OR (e.hold_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.booking_holds h
      WHERE h.id = e.hold_id AND h.property_id = _property_id
    ))
  )
  AND (
    (
      (e.date_from IS NOT NULL OR e.date_to IS NOT NULL)
      AND COALESCE(e.date_to, e.date_from) >= _from
      AND COALESCE(e.date_from, e.date_to) < _to
    )
    OR (
      e.date_from IS NULL AND e.date_to IS NULL
      AND (e.created_at AT TIME ZONE _timezone)::date >= _from
      AND (e.created_at AT TIME ZONE _timezone)::date < _to
    )
  )
  ORDER BY e.created_at DESC
  LIMIT _limit;
END;
$function$


CREATE OR REPLACE FUNCTION public.staynas_calendar_list_staff(_property_id uuid)
 RETURNS TABLE(user_id uuid, email text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _uid uuid := auth.uid();
BEGIN
  IF _uid IS NULL OR NOT public.staynas_current_user_has_property_role(_property_id, ARRAY['owner','manager','admin','reception','housekeeping','finance','marketing','editor','reservations']::public.app_role[]) THEN
    RAISE EXCEPTION 'Staff access required';
  END IF;
  IF NOT public.staynas_user_has_property_access(_uid, _property_id) THEN
    RAISE EXCEPTION 'Property access denied';
  END IF;
  IF NOT public.staynas_current_user_has_property_role(_property_id, ARRAY['owner','manager','admin']::public.app_role[]) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT DISTINCT pm.user_id, COALESCE(u.email, 'Staff member')::text
  FROM public.staynas_property_members pm
  JOIN auth.users u ON u.id = pm.user_id
  WHERE pm.property_id = _property_id
    AND pm.status = 'active'
    AND public.staynas_user_has_property_access(pm.user_id, _property_id)
  ORDER BY 2;
END;
$function$


CREATE OR REPLACE FUNCTION public.staynas_calendar_operational_events(_property_id uuid, _from date, _to date)
 RETURNS TABLE(id uuid, event_kind text, title text, starts_at timestamp with time zone, ends_at timestamp with time zone, all_day boolean, status text, room_id uuid, room_state_id uuid, booking_id uuid, assignee_id uuid, source_type text, source_id uuid, description text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _timezone text;
  _uid uuid := auth.uid();
BEGIN
  IF _uid IS NULL OR NOT public.staynas_current_user_has_property_role(_property_id, ARRAY['owner','manager','admin','reception','housekeeping']::public.app_role[]) THEN
    RAISE EXCEPTION 'Operations calendar access required';
  END IF;
  IF NOT public.staynas_user_has_property_access(_uid, _property_id) THEN
    RAISE EXCEPTION 'Property access denied';
  END IF;
  IF _to <= _from OR (_to - _from) > 93 THEN
    RAISE EXCEPTION 'Invalid calendar range';
  END IF;

  SELECT p.timezone INTO _timezone
  FROM public.staynas_properties p
  WHERE p.id = _property_id AND p.status = 'active';
  IF _timezone IS NULL THEN RAISE EXCEPTION 'Active property not found'; END IF;

  RETURN QUERY
  SELECT
    t.id,
    CASE WHEN t.category = 'maintenance' OR t.task_type ILIKE '%maintenance%' THEN 'maintenance' ELSE 'housekeeping' END,
    t.title,
    CASE
      WHEN t.status::text = 'in_progress'
        AND COALESCE(t.due_at, t.created_at) < (_from::timestamp AT TIME ZONE _timezone)
      THEN (_from::timestamp AT TIME ZONE _timezone)
      ELSE COALESCE(t.due_at, t.created_at)
    END,
    COALESCE(t.completed_at, CASE WHEN t.status::text = 'in_progress' THEN now() ELSE COALESCE(t.due_at, t.created_at, t.created_at) + interval '30 minutes' END),
    false,
    t.status::text,
    b.room_id,
    NULL::uuid,
    t.booking_id,
    COALESCE(t.assignee_id, t.assigned_to),
    'ops_task'::text,
    t.id,
    t.description
  FROM public.ops_tasks t
  JOIN public.bookings b ON b.id = t.booking_id AND b.property_id = _property_id
  WHERE t.booking_id IS NOT NULL
    AND t.category IN ('housekeeping','maintenance')
    AND t.status::text <> 'cancelled'
    AND COALESCE(t.due_at, t.created_at) < (_to::timestamp AT TIME ZONE _timezone)
    AND (
      (
        (COALESCE(t.due_at, t.created_at) AT TIME ZONE _timezone)::date >= _from
        AND (COALESCE(t.due_at, t.created_at) AT TIME ZONE _timezone)::date < _to
      )
      OR (
        t.status::text = 'in_progress'
        AND COALESCE(t.completed_at, now()) > (_from::timestamp AT TIME ZONE _timezone)
      )
    )

  UNION ALL

  SELECT
    s.id,
    'staff'::text,
    s.title,
    s.starts_at,
    s.ends_at,
    false,
    s.status,
    NULL::uuid,
    NULL::uuid,
    NULL::uuid,
    s.staff_user_id,
    'staff_schedule'::text,
    s.id,
    s.notes
  FROM public.staynas_staff_schedules s
  WHERE s.property_id = _property_id
    AND s.status <> 'cancelled'
    AND s.starts_at < (_to::timestamp AT TIME ZONE _timezone)
    AND s.ends_at > (_from::timestamp AT TIME ZONE _timezone)
    AND public.staynas_user_has_property_access(s.staff_user_id, _property_id)
    AND (
      s.staff_user_id = _uid
      OR public.staynas_current_user_has_property_role(_property_id, ARRAY['owner','manager','admin']::public.app_role[])
    )

  UNION ALL

  SELECT
    rs.id,
    'maintenance'::text,
    'Room unavailable: ' || replace(rs.state::text, '_', ' '),
    ((now() AT TIME ZONE _timezone)::date::timestamp AT TIME ZONE _timezone),
    (((now() AT TIME ZONE _timezone)::date + 1)::timestamp AT TIME ZONE _timezone),
    true,
    rs.state::text,
    rs.room_id,
    rs.id,
    rs.booking_id,
    NULL::uuid,
    'room_state'::text,
    rs.id,
    rs.state_note
  FROM public.room_states rs
  WHERE rs.property_id = _property_id
    AND rs.state::text IN ('maintenance','out_of_service')
    AND (_from <= (now() AT TIME ZONE _timezone)::date)
    AND (_to > (now() AT TIME ZONE _timezone)::date)

  ORDER BY 4;
END;
$function$



CREATE OR REPLACE FUNCTION public.is_guest_pii_staff(_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT _user_id IS NOT NULL
    AND _user_id = auth.uid()
    AND public.staynas_current_user_has_property_role(
      public.staynas_active_property_id(auth.uid()),
      ARRAY['owner','manager','admin','reception','reservations']::public.app_role[]
    )
$function$


CREATE OR REPLACE FUNCTION public.staynas_guest_is_accessible(_uid uuid, _guest_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT _uid IS NOT NULL
    AND _uid = auth.uid()
    AND _guest_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.bookings b
      WHERE b.guest_id = _guest_id
        AND b.property_id IS NOT NULL
        AND public.staynas_user_has_property_access(_uid, b.property_id)
        AND public.staynas_current_user_has_property_role(b.property_id, ARRAY['owner','manager','admin','reception','reservations']::public.app_role[])
    )
$function$


CREATE OR REPLACE FUNCTION public.staynas_set_guest_child_property()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _row jsonb := to_jsonb(NEW);
  _uid uuid := auth.uid();
  _guest_id uuid;
  _booking_id uuid;
  _checkin_id uuid;
  _property_id uuid;
  _derived_property_id uuid;
  _checkin_booking_id uuid;
  _checkin_guest_id uuid;
BEGIN
  _guest_id := NULLIF(_row ->> 'guest_id', '')::uuid;
  _booking_id := NULLIF(_row ->> 'booking_id', '')::uuid;
  _checkin_id := NULLIF(_row ->> 'checkin_id', '')::uuid;
  _property_id := NULLIF(_row ->> 'property_id', '')::uuid;

  IF _booking_id IS NOT NULL THEN
    SELECT b.property_id INTO _derived_property_id
    FROM public.bookings b
    WHERE b.id = _booking_id
      AND (_guest_id IS NULL OR b.guest_id = _guest_id);
    IF _derived_property_id IS NULL THEN
      RAISE EXCEPTION 'Guest record booking does not match the guest';
    END IF;
    IF _property_id IS NOT NULL AND _property_id <> _derived_property_id THEN
      RAISE EXCEPTION 'Guest record cannot be moved across properties';
    END IF;
    _property_id := _derived_property_id;
  END IF;

  IF _checkin_id IS NOT NULL THEN
    SELECT b.property_id, gc.booking_id, gc.guest_id
      INTO _derived_property_id, _checkin_booking_id, _checkin_guest_id
    FROM public.guest_checkins gc
    JOIN public.bookings b ON b.id = gc.booking_id
    WHERE gc.id = _checkin_id;
    IF _derived_property_id IS NULL
       OR (_guest_id IS NOT NULL AND _checkin_guest_id <> _guest_id)
       OR (_booking_id IS NOT NULL AND _checkin_booking_id <> _booking_id) THEN
      RAISE EXCEPTION 'Guest record check-in does not match the guest booking';
    END IF;
    IF _property_id IS NOT NULL AND _property_id <> _derived_property_id THEN
      RAISE EXCEPTION 'Guest record cannot be moved across properties';
    END IF;
    _property_id := _derived_property_id;
  END IF;

  IF _property_id IS NULL THEN
    _property_id := public.staynas_active_property_id(_uid);
  END IF;

  IF auth.role() = 'service_role' THEN
    IF _property_id IS NULL THEN
      RAISE EXCEPTION 'A property must be resolved for service guest records';
    END IF;
  ELSIF _uid IS NULL
     OR _property_id IS NULL
     OR NOT public.staynas_user_has_property_access(_uid, _property_id)
     OR NOT public.staynas_current_user_has_property_role(_property_id, ARRAY['owner','manager','admin','reception','reservations','housekeeping','finance','marketing','editor']::public.app_role[]) THEN
    RAISE EXCEPTION 'Active property staff access required for guest records';
  END IF;

  IF _guest_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.bookings b
    WHERE b.guest_id = _guest_id AND b.property_id = _property_id
  ) THEN
    RAISE EXCEPTION 'Guest is not associated with the selected property';
  END IF;

  NEW := jsonb_populate_record(NEW, jsonb_build_object('property_id', _property_id));
  RETURN NEW;
END;
$function$


commit;
