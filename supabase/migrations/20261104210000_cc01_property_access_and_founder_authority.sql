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



commit;
