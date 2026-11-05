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
      -- Authenticated clients may only evaluate their own membership. Trusted
      -- service-role callers may evaluate another user for server workflows.
      and (_uid = auth.uid() or auth.role() = 'service_role')
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
-- New SECURITY DEFINER helpers are not anonymous RPC surfaces. Their
-- property/founder predicates are evaluated only for authenticated staff or
-- trusted service-role callers; do not inherit PostgreSQL's PUBLIC default.
revoke all on function public.staynas_user_has_property_access(uuid, uuid) from public, anon;
grant execute on function public.staynas_user_has_property_access(uuid, uuid) to authenticated, service_role;

revoke all on function public.staynas_current_property_role() from public, anon;
grant execute on function public.staynas_current_property_role() to authenticated, service_role;

revoke all on function public.is_staynas_founder_ai_admin() from public, anon;
grant execute on function public.is_staynas_founder_ai_admin() to authenticated, service_role;


-- Active-property resolution must not accept another user's ID from an
-- authenticated client. Trusted service-role workflows may resolve another user.
CREATE OR REPLACE FUNCTION public.staynas_active_property_id(_uid uuid DEFAULT auth.uid())
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
  SELECT CASE
    WHEN _uid IS NULL OR (_uid <> auth.uid() AND auth.role() <> 'service_role')
      THEN NULL::uuid
    ELSE COALESCE(
      (
        SELECT c.property_id
        FROM public.staynas_user_property_context c
        WHERE c.user_id = _uid
          AND public.staynas_user_has_property_access(_uid, c.property_id)
        LIMIT 1
      ),
      (
        SELECT pm.property_id
        FROM public.staynas_property_members pm
        JOIN public.staynas_properties p ON p.id = pm.property_id
        JOIN public.staynas_organisations o ON o.id = p.organisation_id
        WHERE pm.user_id = _uid
          AND pm.status = 'active'
          AND p.status = 'active'
          AND o.status = 'active'
        ORDER BY p.created_at, p.id
        LIMIT 1
      )
    )
  END;
$function$;

REVOKE ALL ON FUNCTION public.staynas_active_property_id(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.staynas_active_property_id(uuid) TO authenticated, service_role;

-- These are internal workflow helpers. Security-definer callers execute as
-- their owner; direct client RPC execution is neither needed nor permitted.
REVOKE ALL ON FUNCTION public.checkin_log_activity(uuid, uuid, text, text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.checkin_sync_reservation(uuid, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.log_calendar_event(text, uuid, uuid, uuid, date, date, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.is_guest_pii_staff(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.restaurant_is_platform_admin(uuid) FROM PUBLIC, anon, authenticated;

-- AI/knowledge access must inherit organisation lifecycle checks as well
-- as active-property membership and role checks.
CREATE OR REPLACE FUNCTION public.staynas_ai_property_in_active_context(
  p_property_id uuid,
  p_allowed_roles public.app_role[]
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.staynas_property_members AS member
    JOIN public.staynas_user_property_context AS active_context
      ON active_context.user_id = member.user_id
     AND active_context.property_id = member.property_id
    JOIN public.staynas_properties AS property
      ON property.id = member.property_id
    WHERE member.user_id = auth.uid()
      AND member.property_id = p_property_id
      AND member.status = 'active'
      AND member.role = ANY (p_allowed_roles)
      AND property.status = 'active'
      AND public.staynas_user_has_property_access(auth.uid(), p_property_id)
  );
$function$;

REVOKE ALL ON FUNCTION public.staynas_ai_property_in_active_context(uuid, public.app_role[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.staynas_ai_property_in_active_context(uuid, public.app_role[]) TO authenticated, service_role;

-- Restaurant-domain predicates are authenticated membership helpers, not
-- anonymous RPC surfaces. Preserve authenticated and service-role access.
revoke all on function public.restaurant_can_read(uuid) from public, anon;
grant execute on function public.restaurant_can_read(uuid) to authenticated, service_role;
revoke all on function public.restaurant_can_write(uuid, public.restaurant_role[]) from public, anon;
grant execute on function public.restaurant_can_write(uuid, public.restaurant_role[]) to authenticated, service_role;


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


-- Tenant lifecycle predicate used by public booking entry points and insert guards.
CREATE OR REPLACE FUNCTION public.staynas_property_is_operational(_property_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.staynas_properties p
    JOIN public.staynas_organisations o ON o.id = p.organisation_id
    WHERE p.id = _property_id
      AND p.status = 'active'
      AND o.status = 'active'
  );
$function$;

REVOKE ALL ON FUNCTION public.staynas_property_is_operational(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.staynas_property_is_operational(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.staynas_enforce_booking_property()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
DECLARE
  _room_property uuid;
BEGIN
  SELECT r.property_id INTO _room_property
  FROM public.rooms r
  WHERE r.id = NEW.room_id;

  IF _room_property IS NULL THEN
    RAISE EXCEPTION 'Room property is required';
  END IF;
  IF NOT public.staynas_property_is_operational(_room_property) THEN
    RAISE EXCEPTION 'Property or organisation is inactive';
  END IF;
  IF NEW.property_id IS NULL THEN
    NEW.property_id := _room_property;
  END IF;
  IF NEW.property_id <> _room_property THEN
    RAISE EXCEPTION 'Booking property does not match room property';
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.staynas_enforce_hold_property()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
DECLARE
  _room_property uuid;
BEGIN
  SELECT r.property_id INTO _room_property
  FROM public.rooms r
  WHERE r.id = NEW.room_id;

  IF _room_property IS NULL THEN
    RAISE EXCEPTION 'Room property is required';
  END IF;
  IF NOT public.staynas_property_is_operational(_room_property) THEN
    RAISE EXCEPTION 'Property or organisation is inactive';
  END IF;
  IF NEW.property_id IS NULL THEN
    NEW.property_id := _room_property;
  END IF;
  IF NEW.property_id <> _room_property THEN
    RAISE EXCEPTION 'Hold property does not match room property';
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.staynas_enforce_booking_property() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.staynas_enforce_hold_property() FROM PUBLIC, anon, authenticated;

-- Resolve public booking tenants only through verified domains of active tenants.
CREATE OR REPLACE FUNCTION public.staynas_booking_property_id(_hostname text)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
DECLARE
  _property uuid;
  _host text;
BEGIN
  _host := lower(trim(split_part(COALESCE(_hostname, ''), ':', 1)));
  IF _host = '' OR _host !~ '^[a-z0-9.-]+$' THEN
    RAISE EXCEPTION 'Valid property hostname is required';
  END IF;

  SELECT d.property_id INTO _property
  FROM public.staynas_property_domains d
  JOIN public.staynas_properties p ON p.id = d.property_id
  JOIN public.staynas_organisations o ON o.id = p.organisation_id
  WHERE d.hostname = _host
    AND d.verified_at IS NOT NULL
    AND p.status = 'active'
    AND o.status = 'active';

  IF _property IS NULL THEN
    RAISE EXCEPTION 'No active property is configured for this hostname';
  END IF;
  RETURN _property;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_booking_hold_for_property(_property_id uuid, _hold_id uuid, _session_id text)
 RETURNS TABLE(id uuid, room_id uuid, check_in date, check_out date, expires_at timestamp with time zone, status text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog, public, pg_temp'
AS $function$
 SELECT h.id,h.room_id,h.check_in,h.check_out,h.expires_at,h.status::text
 FROM public.booking_holds h JOIN public.rooms r ON r.id=h.room_id
 WHERE _property_id IS NOT NULL AND r.property_id=_property_id AND public.staynas_property_is_operational(r.property_id) AND h.id=_hold_id
   AND _session_id IS NOT NULL AND length(trim(_session_id))>=6 AND h.session_id=_session_id
$function$;


CREATE OR REPLACE FUNCTION public.get_room_availability_for_property(_property_id uuid, _check_in date, _check_out date)
 RETURNS TABLE(room_id uuid, slug text, name text, base_price numeric, currency text, capacity_adults integer, capacity_children integer, max_occupancy integer, nights integer, nightly_total numeric, min_available integer, is_available boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog, public, pg_temp'
AS $function$
DECLARE _nights integer;
BEGIN
  IF _property_id IS NULL THEN RAISE EXCEPTION 'property_id is required'; END IF;
  IF _check_out <= _check_in THEN RAISE EXCEPTION 'check_out must be after check_in'; END IF;
  IF NOT public.staynas_property_is_operational(_property_id) THEN
    RAISE EXCEPTION 'Property not found or inactive';
  END IF;
  _nights := _check_out - _check_in;
  RETURN QUERY
  WITH date_range AS (
    SELECT generate_series(_check_in, _check_out - interval '1 day', interval '1 day')::date d
  ), per_night AS (
    SELECT r.id room_id, dr.d, COALESCE(i.available_units,r.total_units) units,
      COALESCE(i.is_blocked,false) blocked, COALESCE(i.price_override,r.base_price) rate,
      (SELECT count(*) FROM public.booking_holds h WHERE h.room_id=r.id AND h.status='active'
        AND h.expires_at>now() AND h.check_in<=dr.d AND h.check_out>dr.d) hold_count
    FROM public.rooms r CROSS JOIN date_range dr
    LEFT JOIN public.room_inventory i ON i.room_id=r.id AND i.date=dr.d
    WHERE r.status='active' AND r.property_id=_property_id
  )
  SELECT r.id,r.slug,r.name,r.base_price,r.currency,r.capacity_adults,r.capacity_children,r.max_occupancy,
    _nights,COALESCE(sum(pn.rate),0)::numeric,
    COALESCE(min(GREATEST(pn.units-pn.hold_count,0)),0)::integer,
    (count(*) FILTER (WHERE pn.blocked OR pn.units-pn.hold_count<=0)=0)
  FROM public.rooms r JOIN per_night pn ON pn.room_id=r.id
  WHERE r.status='active' AND r.property_id=_property_id
  GROUP BY r.id;
END $function$;


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
create policy "Founder admins manage global pricing rules" on public.pricing_rules
  for all to authenticated
  using (public.is_staynas_founder_ai_admin())
  with check (public.is_staynas_founder_ai_admin());

create policy "Property finance staff manage room pricing rules" on public.pricing_rules
  for all to authenticated
  using (
    scope = 'room' AND room_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.rooms r
      WHERE r.id = pricing_rules.room_id
        AND public.staynas_user_has_property_access(auth.uid(), r.property_id)
        AND public.staynas_current_user_has_property_role(
          r.property_id, ARRAY['owner'::public.app_role,'manager'::public.app_role,'finance'::public.app_role,'admin'::public.app_role]
        )
    )
  )
  with check (
    scope = 'room' AND room_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.rooms r
      WHERE r.id = pricing_rules.room_id
        AND public.staynas_user_has_property_access(auth.uid(), r.property_id)
        AND public.staynas_current_user_has_property_role(
          r.property_id, ARRAY['owner'::public.app_role,'manager'::public.app_role,'finance'::public.app_role,'admin'::public.app_role]
        )
    )
  );

create policy "Property finance staff read global pricing defaults" on public.pricing_rules
  for select to authenticated
  using (
    scope = 'all'
    AND cardinality(public.staynas_current_property_roles()) > 0
  );


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


CREATE OR REPLACE FUNCTION public.checkin_eligibility(_booking_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog, public, pg_temp'
AS $function$
DECLARE
  _b public.bookings%ROWTYPE;
  _r public.rooms%ROWTYPE;
  _fp text;
  _snap jsonb;
  _open_from date;
BEGIN
  SELECT * INTO _b FROM public.bookings WHERE id = _booking_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'not_found', 'message', 'We could not find this reservation.');
  END IF;

  -- Authenticated callers must belong to the reservation's active property.
  -- Anonymous guest flows call this only from token-validating SECURITY DEFINER
  -- functions; direct anonymous execution is revoked below.
  IF auth.uid() IS NOT NULL
     AND NOT public.staynas_user_has_property_access(auth.uid(), _b.property_id) THEN
    RAISE EXCEPTION USING errcode = '42501', message = 'Reservation access required';
  END IF;

  SELECT * INTO _r FROM public.rooms WHERE id = _b.room_id;

  _fp := md5(coalesce(_b.status::text,'') || '|' || coalesce(_b.room_id::text,'') || '|' ||
             coalesce(_b.check_in::text,'') || '|' || coalesce(_b.check_out::text,''));
  _snap := jsonb_build_object(
    'fingerprint', _fp, 'status', _b.status, 'room_id', _b.room_id,
    'room_name', COALESCE(_r.name, 'Room'), 'check_in', _b.check_in, 'check_out', _b.check_out);

  IF _b.status = 'cancelled' THEN
    RETURN jsonb_build_object('ok', false, 'code','cancelled','message','This reservation has been cancelled. Please contact the lodge.','snapshot',_snap);
  END IF;
  IF _b.status = 'checked_in' THEN
    RETURN jsonb_build_object('ok', false, 'code','already_checked_in','message','This reservation is already checked in.','snapshot',_snap);
  END IF;
  IF _b.status IN ('completed','no_show') THEN
    RETURN jsonb_build_object('ok', false, 'code','ineligible','message','This reservation is no longer eligible for online check-in.','snapshot',_snap);
  END IF;
  IF _b.status <> 'confirmed' THEN
    RETURN jsonb_build_object('ok', false, 'code','not_confirmed','message','Your reservation is not confirmed yet. Online check-in opens once it is confirmed.','snapshot',_snap);
  END IF;
  IF _r.id IS NULL OR _r.status <> 'active' THEN
    RETURN jsonb_build_object('ok', false, 'code','room_invalid','message','Your room assignment is being updated. Please contact the lodge.','snapshot',_snap);
  END IF;

  _open_from := _b.check_in - 3;
  IF current_date < _open_from THEN
    RETURN jsonb_build_object('ok', false, 'code','too_early',
      'message','Online check-in opens 3 days before arrival (' || to_char(_open_from,'DD Mon YYYY') || ').',
      'snapshot',_snap, 'opens_on', _open_from);
  END IF;
  IF current_date > _b.check_out THEN
    RETURN jsonb_build_object('ok', false, 'code','window_closed','message','The online check-in window for this stay has closed.','snapshot',_snap);
  END IF;

  RETURN jsonb_build_object('ok', true, 'code','eligible','message','Eligible for online check-in','snapshot',_snap);
END $function$;


REVOKE ALL ON FUNCTION public.checkin_eligibility(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.arrival_pass_validate_unscoped(text, jsonb) FROM PUBLIC, anon, authenticated;

-- Staff booking creation is distinct from the public guest booking endpoint.
CREATE OR REPLACE FUNCTION public.create_booking(_room_slug text, _check_in date, _check_out date, _adults integer, _children integer, _guest_name text, _guest_email text, _guest_phone text, _country text, _special_requests text, _extras jsonb, _children_below_6 integer, _children_7_plus integer, _hold_id uuid, _session_id text, _property_id uuid)
 RETURNS TABLE(booking_id uuid, reference text, total numeric, currency text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO pg_catalog, public, pg_temp
AS $function$
DECLARE
  _room public.rooms%ROWTYPE;
  _nights int; _subtotal numeric := 0; _extras_total numeric := 0;
  _total numeric := 0; _deposit numeric := 0; _balance numeric := 0;
  _reference text; _booking_id uuid; _d date; _rate numeric; _units int; _blocked boolean;
  _extra_row record; _extra public.extras%ROWTYPE; _line numeric;
  _below6 int := COALESCE(_children_below_6, 0);
  _plus7 int := COALESCE(_children_7_plus, GREATEST(0, COALESCE(_children,0)));
  _children_total int; _total_occupants int; _paid_occupants int; _extra_occupants int;
  _hold public.booking_holds%ROWTYPE;
  _jwt_role text := COALESCE(NULLIF(current_setting('request.jwt.claim.role', true), ''), (NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'), '');
BEGIN
  IF _check_out <= _check_in THEN RAISE EXCEPTION 'check_out must be after check_in'; END IF;
  IF _adults IS NULL OR _adults < 1 THEN RAISE EXCEPTION 'At least one adult required'; END IF;
  IF _guest_name IS NULL OR length(trim(_guest_name)) < 2 THEN RAISE EXCEPTION 'Guest name required'; END IF;
  IF _guest_email IS NULL OR _guest_email !~* '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$' THEN RAISE EXCEPTION 'Valid email required'; END IF;
  IF _property_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.staynas_properties p WHERE p.id=_property_id AND p.status='active') THEN
    RAISE EXCEPTION 'Property is required and must be active';
  END IF;
  IF _jwt_role <> 'service_role' AND (auth.uid() IS NULL OR NOT public.staynas_user_has_property_access(auth.uid(),_property_id)) THEN
    RAISE EXCEPTION 'Not authorized for requested property';
  END IF;
  IF _jwt_role <> 'service_role' AND NOT public.staynas_current_user_has_property_role(_property_id, ARRAY['owner','manager','admin','reservations','reception']::public.app_role[]) THEN
    RAISE EXCEPTION 'Reservation permission required for this property';
  END IF;
  SELECT * INTO _room FROM public.rooms WHERE slug=_room_slug AND status='active' AND property_id=_property_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Room not found for selected property: %',_room_slug; END IF;
  _children_total:=_below6+_plus7; _total_occupants:=_adults+_children_total;
  IF _total_occupants<1 THEN RAISE EXCEPTION 'At least one occupant required'; END IF;
  IF _total_occupants>_room.max_occupancy THEN RAISE EXCEPTION 'Room % allows up to % occupants',_room.name,_room.max_occupancy; END IF;
  _paid_occupants:=_adults+_plus7; _nights:=_check_out-_check_in;
  _extra_occupants:=GREATEST(0,_paid_occupants-_room.included_guests);
  IF _hold_id IS NOT NULL THEN
    SELECT * INTO _hold FROM public.booking_holds WHERE id=_hold_id FOR UPDATE;
    IF NOT FOUND OR _hold.status<>'active' OR _hold.expires_at<=now() THEN RAISE EXCEPTION 'Booking hold is not active'; END IF;
    IF _hold.room_id<>_room.id THEN RAISE EXCEPTION 'Hold room mismatch'; END IF;
    IF _session_id IS NOT NULL AND _hold.session_id<>_session_id THEN RAISE EXCEPTION 'Hold session mismatch'; END IF;
  END IF;
  _reference:='MR-'||to_char(now(),'YYMMDD')||'-'||upper(substr(md5(random()::text),1,5));
  INSERT INTO public.bookings(reference,room_id,check_in,check_out,nights,adults,children,children_below_6,children_7_plus,
    guest_name,guest_email,guest_phone,country,special_requests,currency,source,property_id)
  VALUES(_reference,_room.id,_check_in,_check_out,_nights,_adults,_children_total,_below6,_plus7,
    trim(_guest_name),lower(trim(_guest_email)),_guest_phone,_country,_special_requests,_room.currency,'website',_property_id)
  RETURNING id INTO _booking_id;
  _d:=_check_in;
  WHILE _d<_check_out LOOP
    INSERT INTO public.room_inventory(room_id,date,available_units) VALUES(_room.id,_d,_room.total_units) ON CONFLICT(room_id,date) DO NOTHING;
    SELECT available_units,is_blocked INTO _units,_blocked FROM public.room_inventory WHERE room_id=_room.id AND date=_d FOR UPDATE;
    IF _blocked THEN RAISE EXCEPTION 'Room blocked on %',_d; END IF;
    IF _units<=0 AND _hold_id IS NULL THEN RAISE EXCEPTION 'No availability for % on %',_room.name,_d; END IF;
    SELECT COALESCE(price_override,_room.base_price)+(_extra_occupants*_room.extra_guest_fee) INTO _rate
      FROM public.room_inventory WHERE room_id=_room.id AND date=_d;
    UPDATE public.room_inventory SET available_units=GREATEST(available_units-1,0) WHERE room_id=_room.id AND date=_d;
    INSERT INTO public.booking_nights(booking_id,room_id,date,nightly_rate) VALUES(_booking_id,_room.id,_d,_rate);
    _subtotal:=_subtotal+_rate; _d:=_d+INTERVAL '1 day';
  END LOOP;
  IF jsonb_array_length(COALESCE(_extras,'[]'::jsonb))>0 THEN
    FOR _extra_row IN SELECT (e->>'slug') slug,COALESCE((e->>'quantity')::int,1) quantity FROM jsonb_array_elements(COALESCE(_extras,'[]'::jsonb)) e LOOP
      SELECT * INTO _extra FROM public.extras WHERE slug=_extra_row.slug AND active=true AND property_id=_property_id;
      IF NOT FOUND THEN RAISE EXCEPTION 'Extra not found for selected property: %',_extra_row.slug; END IF;
      _line:=_extra.price*_extra_row.quantity*CASE _extra.unit
        WHEN 'per_stay' THEN 1 WHEN 'per_night' THEN _nights WHEN 'per_person' THEN _total_occupants
        WHEN 'per_person_per_night' THEN _total_occupants*_nights ELSE 1 END;
      INSERT INTO public.booking_extras(booking_id,extra_id,quantity,unit_price,line_total) VALUES(_booking_id,_extra.id,_extra_row.quantity,_extra.price,_line);
      _extras_total:=_extras_total+_line;
    END LOOP;
  END IF;
  _total:=_subtotal+_extras_total; _deposit:=ROUND((_total/2.0)::numeric,2); _balance:=_total; -- Deposit is required, not received; unpaid bookings owe the full total.
  UPDATE public.bookings SET subtotal=_subtotal,extras_total=_extras_total,total=_total,deposit_amount=_deposit,balance_amount=_balance,balance_due=_balance WHERE id=_booking_id;
  IF _hold_id IS NOT NULL THEN UPDATE public.booking_holds SET status='converted',converted_booking_id=_booking_id,updated_at=now() WHERE id=_hold_id; END IF;
  PERFORM public.log_calendar_event('reservation.created',_room.id,_booking_id,_hold_id,_check_in,_check_out,jsonb_build_object('reference',_reference,'total',_total));
  RETURN QUERY SELECT _booking_id,_reference,_total,_room.currency;
END
$function$;-- Payment RPCs authorize against the locked booking's property and attach that
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
$function$;


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
$function$;


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
$function$;




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
$function$;


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
END $function$;


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
END $function$;


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
$function$;




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
END $function$;


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
$function$;



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
$function$;


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
$function$;


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
$function$;



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
$function$;


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
$function$;


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
$function$;


CREATE OR REPLACE FUNCTION public.housekeeping_is_supervisor(_uid uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT _uid IS NOT NULL AND _uid = auth.uid() AND public.staynas_current_user_has_property_role(public.staynas_active_property_id(_uid), ARRAY['owner','manager','admin']::public.app_role[])
$function$;

REVOKE ALL ON FUNCTION public.housekeeping_is_supervisor(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.housekeeping_is_supervisor(uuid) TO authenticated, service_role;


CREATE OR REPLACE FUNCTION public.housekeeping_get_dashboard()
 RETURNS TABLE(active_tasks bigint, unassigned_tasks bigint, in_progress_tasks bigint, overdue_tasks bigint, inspection_pending bigint, exceptions_open bigint, rooms_ready bigint, failed_inspections_today bigint, avg_cleaning_minutes numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _uid uuid:=auth.uid(); _property_id uuid;
BEGIN
 IF _uid IS NULL OR NOT public.staynas_current_user_has_property_role(public.staynas_active_property_id(_uid), ARRAY['housekeeping','owner','manager','admin']::public.app_role[])
 THEN RAISE EXCEPTION 'Housekeeping access required'; END IF;
 _property_id:=public.staynas_active_property_id(_uid);
 IF _property_id IS NULL OR NOT public.staynas_user_has_property_access(_uid,_property_id)
 THEN RAISE EXCEPTION 'Active property access required'; END IF;
 RETURN QUERY SELECT
 (SELECT count(*) FROM public.ops_tasks t WHERE t.property_id=_property_id AND t.category='housekeeping' AND t.status IN('pending','in_progress')),
 (SELECT count(*) FROM public.ops_tasks t WHERE t.property_id=_property_id AND t.category='housekeeping' AND t.status IN('pending','in_progress') AND t.assignee_id IS NULL),
 (SELECT count(*) FROM public.ops_tasks t WHERE t.property_id=_property_id AND t.category='housekeeping' AND t.status='in_progress'),
 (SELECT count(*) FROM public.ops_tasks t WHERE t.property_id=_property_id AND t.category='housekeeping' AND t.status IN('pending','in_progress') AND t.due_at<now()),
 (SELECT count(*) FROM public.housekeeping_inspections i JOIN public.room_states rs ON rs.id=i.room_state_id WHERE rs.property_id=_property_id AND i.status='pending'),
 (SELECT count(*) FROM public.housekeeping_exceptions e JOIN public.room_states rs ON rs.id=e.room_state_id WHERE rs.property_id=_property_id AND e.status='open'),
 (SELECT count(*) FROM public.room_states rs WHERE rs.property_id=_property_id AND rs.state='vacant_clean'),
 (SELECT count(*) FROM public.housekeeping_inspections i JOIN public.room_states rs ON rs.id=i.room_state_id WHERE rs.property_id=_property_id AND i.status='failed' AND i.inspected_at>=date_trunc('day',now())),
 COALESCE((SELECT ROUND(AVG(EXTRACT(EPOCH FROM(t.completed_at-t.started_at))/60.0)::numeric,1)
 FROM public.ops_tasks t WHERE t.property_id=_property_id AND t.category='housekeeping'
 AND t.completed_at IS NOT NULL AND t.started_at IS NOT NULL AND t.completed_at>=now()-interval '7 days'),0);
END;
$function$;


CREATE OR REPLACE FUNCTION public.housekeeping_list_exceptions(_room_state_id uuid DEFAULT NULL::uuid, _open_only boolean DEFAULT true)
 RETURNS TABLE(id uuid, room_state_id uuid, task_id uuid, exception_type text, status text, severity integer, title text, notes text, evidence jsonb, reported_by uuid, assigned_to uuid, resolved_by uuid, resolved_at timestamp with time zone, created_at timestamp with time zone, unit_label text, room_name text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _uid uuid:=auth.uid(); _property_id uuid;
BEGIN
 IF _uid IS NULL OR NOT public.staynas_current_user_has_property_role(public.staynas_active_property_id(_uid), ARRAY['housekeeping','owner','manager','admin']::public.app_role[])
 THEN RAISE EXCEPTION 'Housekeeping access required'; END IF;
 _property_id:=public.staynas_active_property_id(_uid);
 IF _property_id IS NULL OR NOT public.staynas_user_has_property_access(_uid,_property_id)
 THEN RAISE EXCEPTION 'Active property access required'; END IF;
 RETURN QUERY SELECT e.id,e.room_state_id,e.task_id,e.exception_type,e.status,e.severity,e.title,e.notes,e.evidence,
 e.reported_by,e.assigned_to,e.resolved_by,e.resolved_at,e.created_at,rs.unit_label,r.name
 FROM public.housekeeping_exceptions e JOIN public.room_states rs ON rs.id=e.room_state_id AND rs.property_id=_property_id
 JOIN public.rooms r ON r.id=rs.room_id AND r.property_id=_property_id
 WHERE (_room_state_id IS NULL OR e.room_state_id=_room_state_id) AND (NOT _open_only OR e.status='open')
 ORDER BY e.severity,e.created_at DESC;
END;
$function$;


CREATE OR REPLACE FUNCTION public.housekeeping_list_intelligence()
 RETURNS TABLE(signal_type text, priority text, title text, reasoning text, room_id uuid, booking_id uuid, confidence numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _uid uuid:=auth.uid(); _property_id uuid;
BEGIN
 IF _uid IS NULL OR NOT public.staynas_current_user_has_property_role(public.staynas_active_property_id(_uid), ARRAY['housekeeping','owner','manager','admin']::public.app_role[])
 THEN RAISE EXCEPTION 'Housekeeping access required'; END IF;
 _property_id:=public.staynas_active_property_id(_uid);
 IF _property_id IS NULL OR NOT public.staynas_user_has_property_access(_uid,_property_id)
 THEN RAISE EXCEPTION 'Active property access required'; END IF;
 RETURN QUERY SELECT i.insight_type,i.priority,i.title,i.reasoning,i.room_id,i.booking_id,i.confidence
 FROM public.ai_room_readiness_insights i JOIN public.rooms r ON r.id=i.room_id AND r.property_id=_property_id
 WHERE i.status='pending' AND i.priority IN('critical','high')
 ORDER BY CASE i.priority WHEN 'critical' THEN 1 WHEN 'high' THEN 2 ELSE 3 END,i.created_at DESC LIMIT 20;
END;
$function$;


CREATE OR REPLACE FUNCTION public.housekeeping_list_inspection_queue()
 RETURNS TABLE(inspection_id uuid, room_state_id uuid, cleaning_task_id uuid, attempt_no integer, status text, unit_label text, room_name text, room_id uuid, booking_id uuid, booking_reference text, guest_name text, completed_at timestamp with time zone, checklist jsonb, notes text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _uid uuid:=auth.uid(); _property_id uuid;
BEGIN
 IF _uid IS NULL OR NOT public.staynas_current_user_has_property_role(public.staynas_active_property_id(_uid), ARRAY['owner','manager','admin']::public.app_role[])
 THEN RAISE EXCEPTION 'Supervisor access required'; END IF;
 _property_id:=public.staynas_active_property_id(_uid);
 IF _property_id IS NULL OR NOT public.staynas_user_has_property_access(_uid,_property_id)
 THEN RAISE EXCEPTION 'Active property access required'; END IF;
 RETURN QUERY SELECT i.id,i.room_state_id,i.cleaning_task_id,i.attempt_no,i.status,rs.unit_label,r.name,r.id,
 t.booking_id,b.reference,b.guest_name,t.completed_at,i.checklist,i.notes
 FROM public.housekeeping_inspections i
 JOIN public.room_states rs ON rs.id=i.room_state_id AND rs.property_id=_property_id
 JOIN public.rooms r ON r.id=rs.room_id AND r.property_id=_property_id
 JOIN public.ops_tasks t ON t.id=i.cleaning_task_id AND t.property_id=_property_id
 LEFT JOIN public.bookings b ON b.id=t.booking_id AND b.property_id=_property_id
 WHERE i.status='pending' ORDER BY t.completed_at NULLS LAST,i.created_at;
END;
$function$;


CREATE OR REPLACE FUNCTION public.housekeeping_list_work(_mine_only boolean DEFAULT false, _include_completed boolean DEFAULT false)
 RETURNS TABLE(id uuid, room_state_id uuid, unit_label text, room_id uuid, room_name text, booking_id uuid, booking_reference text, guest_name text, status ops_task_status, priority integer, due_at timestamp with time zone, assignee_id uuid, claimed_at timestamp with time zone, started_at timestamp with time zone, completed_at timestamp with time zone, title text, description text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _uid uuid:=auth.uid(); _property_id uuid;
BEGIN
 IF _uid IS NULL OR NOT public.staynas_current_user_has_property_role(public.staynas_active_property_id(_uid), ARRAY['housekeeping','owner','manager','admin']::public.app_role[])
 THEN RAISE EXCEPTION 'Housekeeping access required'; END IF;
 _property_id:=public.staynas_active_property_id(_uid);
 IF _property_id IS NULL OR NOT public.staynas_user_has_property_access(_uid,_property_id)
 THEN RAISE EXCEPTION 'Active property access required'; END IF;
 RETURN QUERY SELECT t.id,rs.id,rs.unit_label,r.id,r.name,t.booking_id,b.reference,b.guest_name,
 t.status,t.priority,t.due_at,t.assignee_id,t.claimed_at,t.started_at,t.completed_at,t.title,t.description
 FROM public.ops_tasks t
 JOIN public.room_states rs ON rs.id=t.room_state_id AND rs.property_id=_property_id
 JOIN public.rooms r ON r.id=rs.room_id AND r.property_id=_property_id
 LEFT JOIN public.bookings b ON b.id=t.booking_id AND b.property_id=_property_id
 WHERE t.property_id=_property_id AND t.category='housekeeping'
 AND (_include_completed OR t.status IN('pending','in_progress'))
 AND (NOT _mine_only OR t.assignee_id=_uid)
 ORDER BY CASE WHEN t.priority=1 THEN 0 WHEN t.priority=2 THEN 1 ELSE 2 END,t.due_at NULLS LAST,t.created_at;
END;
$function$;


CREATE OR REPLACE FUNCTION public.housekeeping_report_exception(_room_state_id uuid, _task_id uuid, _exception_type text, _title text, _notes text DEFAULT NULL::text, _severity integer DEFAULT 2, _evidence jsonb DEFAULT '[]'::jsonb)
 RETURNS housekeeping_exceptions
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _uid uuid := auth.uid(); _row public.housekeeping_exceptions%ROWTYPE; _task public.ops_tasks%ROWTYPE;
BEGIN
  IF _uid IS NULL OR NOT public.staynas_current_user_has_property_role(public.staynas_active_property_id(_uid), ARRAY['housekeeping','owner','manager','admin']::public.app_role[])
    THEN RAISE EXCEPTION 'Housekeeping access required'; END IF;
  IF _exception_type NOT IN ('dnd','discrepancy','damage','maintenance','lost_found','linen_amenity')
    THEN RAISE EXCEPTION 'Invalid housekeeping exception type'; END IF;
  IF _severity NOT BETWEEN 1 AND 3 THEN RAISE EXCEPTION 'Invalid severity'; END IF;
  IF jsonb_typeof(COALESCE(_evidence,'[]'::jsonb)) <> 'array' THEN RAISE EXCEPTION 'Evidence must be an array'; END IF;

  IF _task_id IS NOT NULL THEN
    SELECT * INTO _task FROM public.ops_tasks WHERE id = _task_id AND category = 'housekeeping' AND property_id = public.staynas_active_property_id(_uid);
    IF NOT FOUND THEN RAISE EXCEPTION 'Housekeeping task not found'; END IF;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.room_states rs WHERE rs.id = _room_state_id AND rs.property_id = public.staynas_active_property_id(_uid)) THEN RAISE EXCEPTION 'Room state is outside the active property'; END IF;

  INSERT INTO public.housekeeping_exceptions (
    room_state_id, task_id, exception_type, title, notes, severity, evidence, reported_by
  ) VALUES (
    _room_state_id, _task_id, _exception_type, trim(_title),
    NULLIF(trim(COALESCE(_notes,'')), ''), _severity, _evidence, _uid
  ) RETURNING * INTO _row;

  IF _exception_type = 'maintenance' THEN
    INSERT INTO public.ops_tasks (
      booking_id, task_type, category, title, description, priority, due_at, room_state_id
    )
    SELECT _task.booking_id, 'housekeeping_maintenance', 'maintenance',
           'Maintenance: ' || trim(_title),
           concat_ws(E'\n', NULLIF(trim(COALESCE(_notes,'')), ''), 'Reported from Housekeeping.'),
           _severity, now() + CASE WHEN _severity = 1 THEN interval '30 minutes' ELSE interval '2 hours' END,
           _room_state_id
    WHERE _task_id IS NOT NULL;
  END IF;

  RETURN _row;
END;
$function$;


CREATE OR REPLACE FUNCTION public.housekeeping_resolve_exception(_exception_id uuid, _resolution text DEFAULT NULL::text)
 RETURNS housekeeping_exceptions
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _uid uuid := auth.uid(); _row public.housekeeping_exceptions%ROWTYPE;
BEGIN
  IF _uid IS NULL OR NOT public.staynas_current_user_has_property_role(public.staynas_active_property_id(_uid), ARRAY['housekeeping','owner','manager','admin']::public.app_role[])
    THEN RAISE EXCEPTION 'Housekeeping access required'; END IF;
  SELECT * INTO _row FROM public.housekeeping_exceptions WHERE id=_exception_id AND EXISTS (SELECT 1 FROM public.room_states rs WHERE rs.id=housekeeping_exceptions.room_state_id AND rs.property_id=public.staynas_active_property_id(_uid)) FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Exception not found'; END IF;
  IF _row.status <> 'open' THEN RETURN _row; END IF;

  UPDATE public.housekeeping_exceptions
  SET status='resolved',
      notes=CASE WHEN NULLIF(trim(COALESCE(_resolution,'')),'') IS NULL THEN notes
                 ELSE concat_ws(E'\n',NULLIF(notes,''),'Resolution: '||trim(_resolution)) END,
      resolved_by=_uid,resolved_at=now(),updated_at=now()
  WHERE id=_exception_id RETURNING * INTO _row;
  RETURN _row;
END;
$function$;


CREATE OR REPLACE FUNCTION public.housekeeping_submit_inspection(_inspection_id uuid, _checklist jsonb, _passed boolean, _notes text DEFAULT NULL::text, _idempotency_key text DEFAULT NULL::text)
 RETURNS housekeeping_inspections
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _inspection public.housekeeping_inspections%ROWTYPE;
  _rs public.room_states%ROWTYPE;
  _task public.ops_tasks%ROWTYPE;
  _required text[] := ARRAY['bedroom','bathroom','linen','amenities','floor','fixtures','waste','overall'];
  _key text;
  _snapshot jsonb := '[]'::jsonb;
  _all_passed boolean := true;
  _item jsonb;
BEGIN
  IF _uid IS NULL OR NOT public.staynas_current_user_has_property_role(public.staynas_active_property_id(_uid), ARRAY['owner','manager','admin']::public.app_role[])
  THEN RAISE EXCEPTION 'Supervisor access required'; END IF;
  IF _idempotency_key IS NULL OR length(trim(_idempotency_key)) < 8
    THEN RAISE EXCEPTION 'Idempotency key is required'; END IF;
  IF jsonb_typeof(_checklist) <> 'array' OR jsonb_array_length(_checklist) <> 8
    THEN RAISE EXCEPTION 'Complete inspection checklist is required'; END IF;

  SELECT * INTO _inspection FROM public.housekeeping_inspections
  WHERE id = _inspection_id AND EXISTS (SELECT 1 FROM public.room_states rs WHERE rs.id=housekeeping_inspections.room_state_id AND rs.property_id=public.staynas_active_property_id(_uid)) FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Inspection not found'; END IF;
  IF _inspection.status <> 'pending' THEN RETURN _inspection; END IF;

  IF EXISTS (SELECT 1 FROM public.housekeeping_inspections WHERE idempotency_key = _idempotency_key) THEN
    SELECT * INTO _inspection FROM public.housekeeping_inspections WHERE idempotency_key = _idempotency_key;
    RETURN _inspection;
  END IF;

  SELECT * INTO _rs FROM public.room_states WHERE id = _inspection.room_state_id FOR UPDATE;
  SELECT * INTO _task FROM public.ops_tasks WHERE id = _inspection.cleaning_task_id AND property_id=public.staynas_active_property_id(_uid) FOR UPDATE;
  IF NOT FOUND OR _rs.state <> 'inspection' THEN RAISE EXCEPTION 'Room is not awaiting inspection'; END IF;
  IF _task.status <> 'completed' THEN RAISE EXCEPTION 'Cleaning task is not complete'; END IF;

  FOREACH _key IN ARRAY _required LOOP
    _item := NULL;
    SELECT x INTO _item
    FROM jsonb_array_elements(_checklist) x
    WHERE x->>'key' = _key;
    IF _item IS NULL OR (_item ? 'passed') = false OR jsonb_typeof(_item->'passed') <> 'boolean'
      THEN RAISE EXCEPTION 'Invalid inspection checklist'; END IF;
    _snapshot := _snapshot || jsonb_build_array(
      jsonb_build_object(
        'key', _key,
        'label', (SELECT value->>'label' FROM jsonb_array_elements(public.housekeeping_checklist_template()) value WHERE value->>'key' = _key),
        'passed', (_item->>'passed')::boolean
      )
    );
    IF (_item->>'passed')::boolean = false THEN _all_passed := false; END IF;
  END LOOP;

  IF _passed AND NOT _all_passed THEN RAISE EXCEPTION 'All checklist items must pass before room can be ready'; END IF;
  IF NOT _passed THEN _all_passed := false; END IF;

  IF _passed THEN
    PERFORM public.housekeeping_transition_room_state(
      _rs.id, 'vacant_clean',
      NULLIF(trim(COALESCE(_notes,'')), ''),
      'inspection:' || _idempotency_key
    );

    UPDATE public.housekeeping_inspections
    SET status = 'passed', checklist = _snapshot, notes = NULLIF(trim(COALESCE(_notes,'')), ''),
        inspector_id = _uid, inspected_at = now(), idempotency_key = _idempotency_key, updated_at = now()
    WHERE id = _inspection.id
    RETURNING * INTO _inspection;
  ELSE
    PERFORM public.housekeeping_transition_room_state(
      _rs.id, 'vacant_dirty',
      NULLIF(trim(COALESCE(_notes,'')), ''),
      'inspection:' || _idempotency_key
    );

    UPDATE public.housekeeping_inspections
    SET status = 'failed', checklist = _snapshot, notes = NULLIF(trim(COALESCE(_notes,'')), ''),
        inspector_id = _uid, inspected_at = now(), idempotency_key = _idempotency_key, updated_at = now()
    WHERE id = _inspection.id
    RETURNING * INTO _inspection;

    INSERT INTO public.ops_tasks (
      booking_id, task_type, category, title, description, priority, due_at, room_state_id
    )
    VALUES (
      _task.booking_id, 'housekeeping_reclean', 'housekeeping',
      'Re-clean ' || _rs.unit_label,
      concat_ws(E'\\n', 'Inspection failed — re-clean required', NULLIF(trim(COALESCE(_notes,'')), '')),
      1, now() + interval '1 hour', _rs.id
    );
  END IF;

  RETURN _inspection;
END;
$function$;


CREATE OR REPLACE FUNCTION public.housekeeping_transition_room_state(_room_state_id uuid, _to_state room_state, _note text DEFAULT NULL::text, _idempotency_key text DEFAULT NULL::text)
 RETURNS room_states
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _current public.room_states%ROWTYPE;
  _existing public.housekeeping_transition_log%ROWTYPE;
  _result public.room_states%ROWTYPE;
  _is_supervisor boolean;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF NOT public.staynas_current_user_has_property_role(public.staynas_active_property_id(_uid), ARRAY['housekeeping','owner','manager','admin']::public.app_role[]) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  IF _idempotency_key IS NULL OR length(trim(_idempotency_key)) < 8 THEN
    RAISE EXCEPTION 'Idempotency key is required';
  END IF;

  SELECT *
    INTO _existing
  FROM public.housekeeping_transition_log
  WHERE idempotency_key = _idempotency_key AND room_state_id = _room_state_id AND actor_id = _uid;

  IF FOUND THEN
    SELECT * INTO _result
    FROM public.room_states
    WHERE id = _existing.room_state_id;
    RETURN _result;
  END IF;

  SELECT *
    INTO _current
  FROM public.room_states
  WHERE id = _room_state_id AND property_id = public.staynas_active_property_id(_uid)
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Room state not found';
  END IF;

  _is_supervisor := public.staynas_current_user_has_property_role(
    _current.property_id,
    ARRAY['admin'::public.app_role, 'owner'::public.app_role, 'manager'::public.app_role]
  );

  -- Housekeeping staff may only execute housekeeping lifecycle transitions.
  IF NOT _is_supervisor
     AND NOT public.staynas_current_user_has_property_role(_current.property_id, ARRAY['housekeeping'::public.app_role])
  THEN
    RAISE EXCEPTION 'Housekeeping transition requires housekeeping or supervisor role';
  END IF;

  IF NOT _is_supervisor THEN
    IF NOT (
      (_current.state = 'vacant_dirty' AND _to_state = 'inspection')
      OR (_current.state = 'inspection' AND _to_state IN ('vacant_clean', 'vacant_dirty'))
    ) THEN
      RAISE EXCEPTION 'Invalid housekeeping transition: % -> %', _current.state, _to_state;
    END IF;
  ELSE
    IF NOT (
      (_current.state = 'vacant_dirty' AND _to_state IN ('inspection', 'maintenance', 'out_of_service'))
      OR (_current.state = 'inspection' AND _to_state IN ('vacant_clean', 'vacant_dirty', 'maintenance', 'out_of_service'))
      OR (_current.state = 'vacant_clean' AND _to_state IN ('vacant_dirty', 'maintenance', 'out_of_service'))
      OR (_current.state = 'maintenance' AND _to_state IN ('vacant_dirty', 'vacant_clean', 'out_of_service'))
      OR (_current.state = 'out_of_service' AND _to_state IN ('maintenance', 'vacant_dirty', 'vacant_clean'))
    ) THEN
      RAISE EXCEPTION 'Invalid room-readiness transition: % -> %', _current.state, _to_state;
    END IF;
  END IF;

  UPDATE public.room_states
  SET state = _to_state,
      state_note = NULLIF(trim(COALESCE(_note, '')), ''),
      updated_by = _uid,
      updated_at = now()
  WHERE id = _room_state_id
  RETURNING * INTO _result;

  INSERT INTO public.housekeeping_transition_log (
    room_state_id, from_state, to_state, actor_id, idempotency_key, note
  ) VALUES (
    _room_state_id, _current.state, _to_state, _uid, _idempotency_key, _note
  );

  RETURN _result;
END;
$function$;


CREATE OR REPLACE FUNCTION public.housekeeping_assign_task(_task_id uuid, _assignee_id uuid)
 RETURNS ops_tasks
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _task public.ops_tasks%ROWTYPE;
BEGIN
  IF _uid IS NULL OR NOT public.housekeeping_is_supervisor(_uid)
    THEN RAISE EXCEPTION 'Supervisor access required'; END IF;
  SELECT * INTO _task FROM public.ops_tasks WHERE id = _task_id AND category = 'housekeeping' AND property_id = public.staynas_active_property_id(_uid) FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Housekeeping task not found'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.staynas_property_members pm JOIN public.staynas_properties p ON p.id=pm.property_id JOIN public.staynas_organisations o ON o.id=p.organisation_id WHERE pm.user_id=_assignee_id AND pm.property_id=_task.property_id AND pm.status='active' AND pm.role='housekeeping' AND p.status <> 'suspended' AND o.status='active') THEN RAISE EXCEPTION 'Assignee must have an active housekeeping role in this property'; END IF;
  IF _task.status IN ('completed','cancelled') THEN RAISE EXCEPTION 'Task is closed'; END IF;

  UPDATE public.ops_tasks
  SET assignee_id = _assignee_id,
      claimed_at = NULL,
      started_at = NULL,
      status = CASE WHEN status = 'in_progress' THEN 'pending'::public.ops_task_status ELSE status END,
      updated_at = now()
  WHERE id = _task_id
  RETURNING * INTO _task;
  RETURN _task;
END;
$function$;


CREATE OR REPLACE FUNCTION public.housekeeping_claim_task(_task_id uuid)
 RETURNS ops_tasks
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _task public.ops_tasks%ROWTYPE;
BEGIN
  IF _uid IS NULL OR NOT public.staynas_current_user_has_property_role(public.staynas_active_property_id(_uid), ARRAY['housekeeping']::public.app_role[])
    THEN RAISE EXCEPTION 'Housekeeping staff access required'; END IF;

  SELECT * INTO _task FROM public.ops_tasks WHERE id = _task_id AND category = 'housekeeping' AND property_id = public.staynas_active_property_id(_uid) FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Housekeeping task not found'; END IF;
  IF _task.status IN ('completed','cancelled') THEN RAISE EXCEPTION 'Task is closed'; END IF;
  IF _task.assignee_id IS NOT NULL AND _task.assignee_id <> _uid THEN
    RAISE EXCEPTION 'Task is assigned to another housekeeper';
  END IF;

  UPDATE public.ops_tasks
  SET assignee_id = _uid,
      claimed_at = COALESCE(claimed_at, now()),
      status = 'pending',
      updated_at = now()
  WHERE id = _task_id
  RETURNING * INTO _task;
  RETURN _task;
END;
$function$;


CREATE OR REPLACE FUNCTION public.housekeeping_claim_task(_task_id uuid, _idempotency_key text DEFAULT NULL::text)
 RETURNS ops_tasks
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _task public.ops_tasks%ROWTYPE;
  _existing public.housekeeping_action_idempotency%ROWTYPE;
BEGIN
  IF _uid IS NULL OR NOT public.staynas_current_user_has_property_role(public.staynas_active_property_id(_uid), ARRAY['housekeeping']::public.app_role[])
    THEN RAISE EXCEPTION 'Housekeeping staff access required'; END IF;
  IF _idempotency_key IS NULL OR length(trim(_idempotency_key)) < 8
    THEN RAISE EXCEPTION 'Idempotency key is required'; END IF;

  SELECT * INTO _task
  FROM public.ops_tasks
  WHERE id = _task_id AND category = 'housekeeping' AND property_id = public.staynas_active_property_id(_uid)
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'Housekeeping task not found'; END IF;

  SELECT * INTO _existing
  FROM public.housekeeping_action_idempotency
  WHERE action_type = 'claim'
    AND idempotency_key = _idempotency_key
    AND task_id = _task_id AND actor_id = _uid
  LIMIT 1;

  IF FOUND THEN
    SELECT * INTO _task FROM public.ops_tasks WHERE id = _existing.task_id;
    RETURN _task;
  END IF;

  IF _task.status IN ('completed','cancelled') THEN
    RAISE EXCEPTION 'Task is closed';
  END IF;
  IF _task.assignee_id IS NOT NULL AND _task.assignee_id <> _uid THEN
    RAISE EXCEPTION 'Task is assigned to another housekeeper';
  END IF;

  UPDATE public.ops_tasks
  SET assignee_id = _uid,
      claimed_at = COALESCE(claimed_at, now()),
      status = 'pending',
      updated_at = now()
  WHERE id = _task_id
  RETURNING * INTO _task;

  INSERT INTO public.housekeeping_action_idempotency(
    action_type, idempotency_key, task_id, actor_id, result
  )
  VALUES ('claim', _idempotency_key, _task.id, _uid, to_jsonb(_task))
  ON CONFLICT (action_type, idempotency_key) DO NOTHING;

  RETURN _task;
END;
$function$;


CREATE OR REPLACE FUNCTION public.housekeeping_complete_task(_task_id uuid, _note text DEFAULT NULL::text, _idempotency_key text DEFAULT NULL::text)
 RETURNS ops_tasks
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _task public.ops_tasks%ROWTYPE;
  _rs public.room_states%ROWTYPE;
BEGIN
  IF _uid IS NULL OR NOT public.staynas_current_user_has_property_role(public.staynas_active_property_id(_uid), ARRAY['housekeeping']::public.app_role[])
    THEN RAISE EXCEPTION 'Housekeeping staff access required'; END IF;
  IF _idempotency_key IS NULL OR length(trim(_idempotency_key)) < 8
    THEN RAISE EXCEPTION 'Idempotency key is required'; END IF;

  SELECT * INTO _task
  FROM public.ops_tasks
  WHERE id = _task_id AND category = 'housekeeping' AND property_id = public.staynas_active_property_id(_uid)
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'Housekeeping task not found'; END IF;
  IF _task.assignee_id <> _uid THEN RAISE EXCEPTION 'Task is assigned to another housekeeper'; END IF;
  IF _task.status = 'completed' THEN RETURN _task; END IF;
  IF _task.status <> 'in_progress' THEN RAISE EXCEPTION 'Start the task before completing it'; END IF;
  IF EXISTS (
    SELECT 1 FROM public.housekeeping_transition_log
    WHERE idempotency_key = _idempotency_key AND room_state_id = _task.room_state_id AND actor_id = _uid
  ) THEN
    RETURN _task;
  END IF;

  SELECT * INTO _rs
  FROM public.room_states
  WHERE id = _task.room_state_id
  FOR UPDATE;

  IF NOT FOUND OR _rs.state <> 'vacant_dirty' THEN
    RAISE EXCEPTION 'Room is not awaiting cleaning';
  END IF;

  PERFORM public.housekeeping_transition_room_state(
    _rs.id,
    'inspection',
    _note,
    _idempotency_key
  );

  UPDATE public.ops_tasks
  SET status = 'completed',
      completed_at = now(),
      completed_by = _uid,
      updated_at = now(),
      description = CASE
        WHEN NULLIF(trim(COALESCE(_note,'')), '') IS NULL THEN description
        ELSE concat_ws(E'\n', NULLIF(description,''), 'Cleaning note: ' || trim(_note))
      END
  WHERE id = _task_id
  RETURNING * INTO _task;

  INSERT INTO public.housekeeping_inspections (
    room_state_id, cleaning_task_id, status, checklist
  )
  VALUES (
    _rs.id, _task.id, 'pending', public.housekeeping_checklist_template()
  )
  ON CONFLICT (room_state_id) WHERE status = 'pending' DO NOTHING;

  RETURN _task;
END;
$function$;


CREATE OR REPLACE FUNCTION public.housekeeping_start_task(_task_id uuid)
 RETURNS ops_tasks
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _task public.ops_tasks%ROWTYPE;
  _rs public.room_states%ROWTYPE;
BEGIN
  IF _uid IS NULL OR NOT public.staynas_current_user_has_property_role(public.staynas_active_property_id(_uid), ARRAY['housekeeping']::public.app_role[])
    THEN RAISE EXCEPTION 'Housekeeping staff access required'; END IF;

  SELECT * INTO _task FROM public.ops_tasks WHERE id = _task_id AND category = 'housekeeping' AND property_id = public.staynas_active_property_id(_uid) FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Housekeeping task not found'; END IF;
  IF _task.assignee_id <> _uid THEN RAISE EXCEPTION 'Claim the task before starting'; END IF;
  IF _task.status <> 'pending' THEN RAISE EXCEPTION 'Task is not pending'; END IF;
  IF _task.room_state_id IS NULL THEN RAISE EXCEPTION 'Housekeeping task has no room'; END IF;

  SELECT * INTO _rs FROM public.room_states WHERE id = _task.room_state_id FOR UPDATE;
  IF NOT FOUND OR _rs.state <> 'vacant_dirty' THEN
    RAISE EXCEPTION 'Room is not awaiting cleaning';
  END IF;

  UPDATE public.ops_tasks
  SET status = 'in_progress',
      started_at = COALESCE(started_at, now()),
      claimed_at = COALESCE(claimed_at, now()),
      updated_at = now()
  WHERE id = _task_id
  RETURNING * INTO _task;
  RETURN _task;
END;
$function$;


CREATE OR REPLACE FUNCTION public.housekeeping_start_task(_task_id uuid, _idempotency_key text DEFAULT NULL::text)
 RETURNS ops_tasks
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _task public.ops_tasks%ROWTYPE;
  _rs public.room_states%ROWTYPE;
  _existing public.housekeeping_action_idempotency%ROWTYPE;
BEGIN
  IF _uid IS NULL OR NOT public.staynas_current_user_has_property_role(public.staynas_active_property_id(_uid), ARRAY['housekeeping']::public.app_role[])
    THEN RAISE EXCEPTION 'Housekeeping staff access required'; END IF;
  IF _idempotency_key IS NULL OR length(trim(_idempotency_key)) < 8
    THEN RAISE EXCEPTION 'Idempotency key is required'; END IF;

  SELECT * INTO _task
  FROM public.ops_tasks
  WHERE id = _task_id AND category = 'housekeeping' AND property_id = public.staynas_active_property_id(_uid)
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'Housekeeping task not found'; END IF;

  SELECT * INTO _existing
  FROM public.housekeeping_action_idempotency
  WHERE action_type = 'start'
    AND idempotency_key = _idempotency_key
    AND task_id = _task_id AND actor_id = _uid
  LIMIT 1;

  IF FOUND THEN
    SELECT * INTO _task FROM public.ops_tasks WHERE id = _existing.task_id;
    RETURN _task;
  END IF;

  IF _task.assignee_id <> _uid THEN RAISE EXCEPTION 'Claim the task before starting'; END IF;
  IF _task.status = 'in_progress' THEN
    INSERT INTO public.housekeeping_action_idempotency(
      action_type, idempotency_key, task_id, actor_id, result
    )
    VALUES ('start', _idempotency_key, _task.id, _uid, to_jsonb(_task))
    ON CONFLICT (action_type, idempotency_key) DO NOTHING;
    RETURN _task;
  END IF;
  IF _task.status <> 'pending' THEN RAISE EXCEPTION 'Task is not pending'; END IF;
  IF _task.room_state_id IS NULL THEN RAISE EXCEPTION 'Housekeeping task has no room'; END IF;

  SELECT * INTO _rs
  FROM public.room_states
  WHERE id = _task.room_state_id
  FOR UPDATE;

  IF NOT FOUND OR _rs.state <> 'vacant_dirty' THEN
    RAISE EXCEPTION 'Room is not awaiting cleaning';
  END IF;

  UPDATE public.ops_tasks
  SET status = 'in_progress',
      started_at = COALESCE(started_at, now()),
      claimed_at = COALESCE(claimed_at, now()),
      updated_at = now()
  WHERE id = _task_id
  RETURNING * INTO _task;

  INSERT INTO public.housekeeping_action_idempotency(
    action_type, idempotency_key, task_id, actor_id, result
  )
  VALUES ('start', _idempotency_key, _task.id, _uid, to_jsonb(_task))
  ON CONFLICT (action_type, idempotency_key) DO NOTHING;

  RETURN _task;
END;
$function$;


CREATE OR REPLACE FUNCTION public.knowledge_can_read_document(_doc_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.knowledge_documents d
    LEFT JOIN public.knowledge_categories c ON c.id = d.category_id
    WHERE d.id = _doc_id
      AND d.property_id IS NOT NULL
      AND public.staynas_user_has_property_access(auth.uid(), d.property_id)
      AND (c.property_id IS NULL OR c.property_id = d.property_id)
      AND public.staynas_current_user_has_property_role(d.property_id, ARRAY['owner','manager','admin','reception','housekeeping','finance','marketing','editor','reservations']::public.app_role[])
      AND (
        public.staynas_current_user_has_property_role(d.property_id, ARRAY['owner','manager','admin']::public.app_role[])
        OR d.status = 'published'
      )
      AND (
        d.allowed_roles IS NULL
        OR array_length(d.allowed_roles, 1) IS NULL
        OR public.staynas_current_user_has_property_role(d.property_id, d.allowed_roles)
        OR public.staynas_current_user_has_property_role(d.property_id, ARRAY['owner','manager','admin']::public.app_role[])
      )
      AND (
        c.id IS NULL
        OR array_length(c.allowed_roles, 1) IS NULL
        OR public.staynas_current_user_has_property_role(d.property_id, c.allowed_roles)
        OR public.staynas_current_user_has_property_role(d.property_id, ARRAY['owner','manager','admin']::public.app_role[])
      )
  );
$function$;


CREATE OR REPLACE FUNCTION public.set_room_block(_room_id uuid, _from date, _to date, _blocked boolean, _reason text DEFAULT NULL::text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _d date; _n int := 0; _room public.rooms%ROWTYPE;
BEGIN
  IF _to <= _from THEN RAISE EXCEPTION 'to must be after from'; END IF;

  SELECT * INTO _room FROM public.rooms WHERE id = _room_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Room not found'; END IF;
  IF auth.uid() IS NULL OR NOT public.staynas_user_has_property_access(auth.uid(), _room.property_id) OR NOT public.staynas_current_user_has_property_role(_room.property_id, ARRAY['owner','manager','admin']::public.app_role[]) THEN RAISE EXCEPTION 'Forbidden'; END IF;

  _d := _from;
  WHILE _d < _to LOOP
    INSERT INTO public.room_inventory (room_id, date, available_units, is_blocked)
    VALUES (_room_id, _d, _room.total_units, _blocked)
    ON CONFLICT (room_id, date) DO UPDATE SET is_blocked = EXCLUDED.is_blocked, updated_at = now();
    _n := _n + 1;
    _d := _d + INTERVAL '1 day';
  END LOOP;

  PERFORM public.log_calendar_event(
    CASE WHEN _blocked THEN 'room.blocked' ELSE 'room.unblocked' END,
    _room_id, NULL, NULL, _from, _to,
    jsonb_build_object('reason', COALESCE(_reason,''))
  );
  RETURN _n;
END $function$;


CREATE OR REPLACE FUNCTION public.save_room_type_configuration(
  _property_id uuid,
  _id uuid,
  _slug text,
  _name text,
  _category_id uuid,
  _short_description text,
  _capacity_adults integer,
  _capacity_children integer,
  _max_occupancy integer,
  _total_units integer,
  _base_price numeric,
  _currency text,
  _included_guests integer,
  _extra_guest_fee numeric,
  _status text,
  _sort_order integer,
  _hero_line text DEFAULT NULL,
  _image_url text DEFAULT NULL,
  _gallery_urls text[] DEFAULT '{}',
  _size_label text DEFAULT NULL,
  _view_label text DEFAULT NULL,
  _bed_label text DEFAULT NULL,
  _bathroom_label text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  _room_id uuid;
  _old_units integer := 0;
  _remove_count integer := 0;
  _available integer := 0;
BEGIN
  IF auth.uid() IS NULL
     OR NOT public.staynas_user_has_property_access(auth.uid(), _property_id)
     OR NOT public.staynas_current_user_has_property_role(
       _property_id, ARRAY['owner','manager','admin']::public.app_role[]
     )
  THEN
    RAISE EXCEPTION 'Room configuration requires property manager access';
  END IF;

  IF _slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' THEN RAISE EXCEPTION 'Invalid room slug'; END IF;
  IF _name IS NULL OR btrim(_name) = '' THEN RAISE EXCEPTION 'Room name is required'; END IF;
  IF _total_units < 1 THEN RAISE EXCEPTION 'Room quantity must be at least 1'; END IF;
  IF _base_price < 0 OR _extra_guest_fee < 0 THEN RAISE EXCEPTION 'Pricing cannot be negative'; END IF;
  IF _capacity_adults < 1 OR _max_occupancy < _capacity_adults THEN RAISE EXCEPTION 'Invalid occupancy configuration'; END IF;
  IF _included_guests < 1 OR _included_guests > _max_occupancy THEN RAISE EXCEPTION 'Invalid included guest count'; END IF;
  IF _currency !~ '^[A-Z]{3}$' THEN RAISE EXCEPTION 'Currency must be a 3-letter ISO code'; END IF;

  IF _category_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.room_categories
    WHERE id = _category_id AND property_id = _property_id AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'Room category not found in the selected property';
  END IF;

  IF _id IS NULL THEN
    IF EXISTS (SELECT 1 FROM public.rooms WHERE property_id = _property_id AND slug = _slug) THEN
      RAISE EXCEPTION 'Room slug already exists in this property';
    END IF;

    INSERT INTO public.rooms (
      property_id, slug, name, category_id, short_description,
      capacity_adults, capacity_children, max_occupancy, total_units,
      base_price, currency, status, sort_order, included_guests, extra_guest_fee,
      hero_line, image_url, gallery_urls, size_label, view_label, bed_label, bathroom_label
    ) VALUES (
      _property_id, _slug, btrim(_name), _category_id, NULLIF(btrim(_short_description),''),
      _capacity_adults, _capacity_children, _max_occupancy, _total_units,
      _base_price, _currency, COALESCE(NULLIF(_status,''),'active'), COALESCE(_sort_order,0),
      _included_guests, _extra_guest_fee, NULLIF(btrim(_hero_line),''), NULLIF(btrim(_image_url),''),
      COALESCE(_gallery_urls,'{}'), NULLIF(btrim(_size_label),''), NULLIF(btrim(_view_label),''),
      NULLIF(btrim(_bed_label),''), NULLIF(btrim(_bathroom_label),'')
    )
    RETURNING id INTO _room_id;
  ELSE
    SELECT total_units INTO _old_units
    FROM public.rooms
    WHERE id = _id AND property_id = _property_id
    FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Room not found in selected property'; END IF;

    IF EXISTS (
      SELECT 1 FROM public.rooms
      WHERE property_id = _property_id AND slug = _slug AND id <> _id
    ) THEN
      RAISE EXCEPTION 'Room slug already exists in this property';
    END IF;

    UPDATE public.rooms SET
      slug = _slug, name = btrim(_name), category_id = _category_id,
      short_description = NULLIF(btrim(_short_description),''),
      capacity_adults = _capacity_adults, capacity_children = _capacity_children,
      max_occupancy = _max_occupancy, total_units = _total_units,
      base_price = _base_price, currency = _currency,
      status = COALESCE(NULLIF(_status,''),'active'), sort_order = COALESCE(_sort_order,0),
      included_guests = _included_guests, extra_guest_fee = _extra_guest_fee,
      hero_line = NULLIF(btrim(_hero_line),''), image_url = NULLIF(btrim(_image_url),''),
      gallery_urls = COALESCE(_gallery_urls,'{}'), size_label = NULLIF(btrim(_size_label),''),
      view_label = NULLIF(btrim(_view_label),''), bed_label = NULLIF(btrim(_bed_label),''),
      bathroom_label = NULLIF(btrim(_bathroom_label),'')
    WHERE id = _id AND property_id = _property_id
    RETURNING id INTO _room_id;
  END IF;

  IF _total_units > _old_units THEN
    INSERT INTO public.room_states(property_id, room_id, unit_label)
    SELECT _property_id, _room_id, _slug || '-' || lpad(gs::text,2,'0')
    FROM generate_series(GREATEST(_old_units,0)+1,_total_units) gs;
  ELSIF _total_units < _old_units THEN
    _remove_count := _old_units - _total_units;
    SELECT count(*) INTO _available
    FROM public.room_states
    WHERE property_id = _property_id AND room_id = _room_id
      AND booking_id IS NULL AND state IN ('vacant_clean','vacant_dirty');
    IF _available < _remove_count THEN
      RAISE EXCEPTION 'Cannot reduce quantity: protected physical room units are still in use';
    END IF;
    DELETE FROM public.room_states
    WHERE id IN (
      SELECT id FROM public.room_states
      WHERE property_id = _property_id AND room_id = _room_id
        AND booking_id IS NULL AND state IN ('vacant_clean','vacant_dirty')
      ORDER BY unit_label DESC LIMIT _remove_count
    );
  END IF;

  RETURN _room_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.save_room_type_configuration(
  uuid,uuid,text,text,uuid,text,integer,integer,integer,integer,numeric,text,integer,numeric,text,integer,text,text,text[],text,text,text,text
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_room_type_configuration(
  uuid,uuid,text,text,uuid,text,integer,integer,integer,integer,numeric,text,integer,numeric,text,integer,text,text,text[],text,text,text,text
) TO authenticated, service_role;

-- Retire the legacy global-role room configuration overload. Leaving it executable
-- would bypass the property-scoped contract introduced above.
REVOKE ALL ON FUNCTION public.save_room_type_configuration(
  uuid,text,text,uuid,text,integer,integer,integer,integer,numeric,text,integer,numeric,text,integer,text,text,text[],text,text,text,text
) FROM PUBLIC, anon, authenticated;

-- Storage objects for guest documents inherit the exact document property
-- and staff roles; no global staff role can read another tenant's files.
drop policy if exists "guest documents property staff read" on storage.objects;
create policy "guest documents property staff read" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'guest-documents'
    and exists (
      select 1 from public.guest_documents d
      where d.storage_path = objects.name
        and d.property_id is not null
        and public.staynas_user_has_property_access(auth.uid(), d.property_id)
        and public.staynas_current_user_has_property_role(d.property_id, ARRAY['owner','manager','reception']::public.app_role[])
    )
  );


-- Clear the remaining mutable search_path advisor findings. These routines
-- use schema-qualified application objects and built-in PostgreSQL functions.
ALTER FUNCTION public.housekeeping_checklist_template()
  SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.housekeeping_list_notifications(integer)
  SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.housekeeping_mark_notification_read(uuid)
  SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.enforce_room_category_property()
  SET search_path = pg_catalog, public, pg_temp;

-- Shared guest tag catalogue is readable by active property staff; only
-- platform administrators may mutate the cross-tenant catalogue.
create policy "Active property staff read shared guest tags" on public.guest_tags
  for select to authenticated
  using (cardinality(public.staynas_current_property_roles()) > 0);

-- These platform-wide tables have no property key. Keep their CRUD surfaces
-- founder-only until tenant-aware data contracts are implemented.
create policy "Founder admins manage workflows" on public.workflows
  for all to authenticated
  using (public.is_staynas_founder_ai_admin())
  with check (public.is_staynas_founder_ai_admin());
create policy "Founder admins manage workflow runs" on public.workflow_runs
  for all to authenticated
  using (public.is_staynas_founder_ai_admin())
  with check (public.is_staynas_founder_ai_admin());
drop policy if exists "Managers decide approvals" on public.approval_requests;
create policy "Founder admins manage approval requests" on public.approval_requests
  for all to authenticated
  using (public.is_staynas_founder_ai_admin())
  with check (public.is_staynas_founder_ai_admin());
create policy "Founder admins manage campaigns" on public.campaigns
  for all to authenticated
  using (public.is_staynas_founder_ai_admin())
  with check (public.is_staynas_founder_ai_admin());
create policy "Public can read published journal articles" on public.journal_articles
  for select to anon, authenticated
  using (status = 'published');
create policy "Founder admins manage journal articles" on public.journal_articles
  for all to authenticated
  using (public.is_staynas_founder_ai_admin())
  with check (public.is_staynas_founder_ai_admin());
create policy "Founder admins manage scheduled jobs" on public.scheduled_jobs
  for all to authenticated
  using (public.is_staynas_founder_ai_admin())
  with check (public.is_staynas_founder_ai_admin());
create policy "Founder admins read email send log" on public.email_send_log
  for select to authenticated
  using (public.is_staynas_founder_ai_admin());
create policy "Founder admins manage service recovery insights" on public.ai_service_recovery_insights
  for all to authenticated
  using (public.is_staynas_founder_ai_admin())
  with check (public.is_staynas_founder_ai_admin());
create policy "Founder admins manage room readiness insights" on public.ai_room_readiness_insights
  for all to authenticated
  using (public.is_staynas_founder_ai_admin())
  with check (public.is_staynas_founder_ai_admin());
create policy "Founder admins manage guest alerts" on public.ai_guest_alerts
  for all to authenticated
  using (public.is_staynas_founder_ai_admin())
  with check (public.is_staynas_founder_ai_admin());
create policy "Founder admins manage revenue alerts" on public.ai_revenue_alerts
  for all to authenticated
  using (public.is_staynas_founder_ai_admin())
  with check (public.is_staynas_founder_ai_admin());
create policy "Founder admins manage strategic risks" on public.ai_strategic_risks
  for all to authenticated
  using (public.is_staynas_founder_ai_admin())
  with check (public.is_staynas_founder_ai_admin());

-- Operational alerts are linked to their owning booking or room, never global.
create policy "Property staff read operational alerts" on public.ops_alerts
  for select to authenticated
  using (
    (booking_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.bookings b
      WHERE b.id = ops_alerts.booking_id
        AND public.staynas_user_has_property_access(auth.uid(), b.property_id)
    ))
    OR
    (room_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.rooms r
      WHERE r.id = ops_alerts.room_id
        AND public.staynas_user_has_property_access(auth.uid(), r.property_id)
    ))
  );
create policy "Property supervisors resolve operational alerts" on public.ops_alerts
  for update to authenticated
  using (
    (booking_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.bookings b
      WHERE b.id = ops_alerts.booking_id
        AND public.staynas_current_user_has_property_role(
          b.property_id, ARRAY['owner'::public.app_role,'manager'::public.app_role,'admin'::public.app_role,'housekeeping'::public.app_role,'reception'::public.app_role]
        )
    ))
    OR
    (room_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.rooms r
      WHERE r.id = ops_alerts.room_id
        AND public.staynas_current_user_has_property_role(
          r.property_id, ARRAY['owner'::public.app_role,'manager'::public.app_role,'admin'::public.app_role,'housekeeping'::public.app_role,'reception'::public.app_role]
        )
    ))
  )
  with check (
    (booking_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.bookings b
      WHERE b.id = ops_alerts.booking_id
        AND public.staynas_current_user_has_property_role(
          b.property_id, ARRAY['owner'::public.app_role,'manager'::public.app_role,'admin'::public.app_role,'housekeeping'::public.app_role,'reception'::public.app_role]
        )
    ))
    OR
    (room_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.rooms r
      WHERE r.id = ops_alerts.room_id
        AND public.staynas_current_user_has_property_role(
          r.property_id, ARRAY['owner'::public.app_role,'manager'::public.app_role,'admin'::public.app_role,'housekeeping'::public.app_role,'reception'::public.app_role]
        )
    ))
  );

-- AI recommendation and feedback stores currently lack a property key.
-- Keep their access aligned with the founder-only analytics and executive APIs.
create policy "Founder admins manage guest recommendations" on public.ai_guest_recommendations
  for all to authenticated
  using (public.is_staynas_founder_ai_admin())
  with check (public.is_staynas_founder_ai_admin());
create policy "Founder admins manage pricing recommendations" on public.ai_pricing_recommendations
  for all to authenticated
  using (public.is_staynas_founder_ai_admin())
  with check (public.is_staynas_founder_ai_admin());
create policy "Founder admins manage revenue opportunities" on public.ai_revenue_opportunities
  for all to authenticated
  using (public.is_staynas_founder_ai_admin())
  with check (public.is_staynas_founder_ai_admin());
create policy "Founder admins manage marketing recommendations" on public.ai_marketing_recommendations
  for all to authenticated
  using (public.is_staynas_founder_ai_admin())
  with check (public.is_staynas_founder_ai_admin());
create policy "Founder admins manage AI feedback" on public.ai_feedback
  for all to authenticated
  using (public.is_staynas_founder_ai_admin())
  with check (public.is_staynas_founder_ai_admin());

create policy "Users submit own AI feedback" on public.ai_feedback
  for insert to authenticated
  with check (user_id = auth.uid());

-- Trigger-only SECURITY DEFINER functions are not PostgREST RPC surfaces.
-- Remove inherited direct grants while preserving automatic trigger execution.
REVOKE ALL ON FUNCTION public.bookings_link_guest() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.hk_exception_events() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.hk_inspection_events() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.hk_room_state_events() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.hk_task_events() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.staynas_enforce_hold_property() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.staynas_enforce_ops_task_property() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.staynas_set_guest_child_property() FROM PUBLIC, anon, authenticated;

-- Prevent authenticated clients from probing legacy global role assignments.
-- The remaining restaurant platform-admin SECURITY DEFINER routine executes as
-- its owner and retains its internal compatibility check.
revoke all on function public.has_any_role(uuid, public.app_role[]) from public, anon, authenticated;
revoke all on function public.has_role(uuid, public.app_role) from public, anon, authenticated;
revoke all on function public.is_any_staff(uuid) from public, anon, authenticated;
revoke all on function public.is_staff(uuid) from public, anon, authenticated;
revoke all on function public.current_user_roles() from public, anon, authenticated;

grant execute on function public.has_any_role(uuid, public.app_role[]) to service_role;
grant execute on function public.has_role(uuid, public.app_role) to service_role;
grant execute on function public.is_any_staff(uuid) to service_role;
grant execute on function public.is_staff(uuid) to service_role;
grant execute on function public.current_user_roles() to service_role;

CREATE OR REPLACE FUNCTION public.create_booking(_room_slug text, _check_in date, _check_out date, _adults integer, _children integer, _guest_name text, _guest_email text, _guest_phone text, _country text, _special_requests text, _extras jsonb, _children_below_6 integer, _children_7_plus integer, _hold_id uuid, _session_id text, _property_id uuid)
 RETURNS TABLE(booking_id uuid, reference text, total numeric, currency text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO pg_catalog, public, pg_temp
AS $function$
DECLARE
  _room public.rooms%ROWTYPE;
  _nights int; _subtotal numeric := 0; _extras_total numeric := 0;
  _total numeric := 0; _deposit numeric := 0; _balance numeric := 0;
  _reference text; _booking_id uuid; _d date; _rate numeric; _units int; _blocked boolean;
  _extra_row record; _extra public.extras%ROWTYPE; _line numeric;
  _below6 int := COALESCE(_children_below_6, 0);
  _plus7 int := COALESCE(_children_7_plus, GREATEST(0, COALESCE(_children,0)));
  _children_total int; _total_occupants int; _paid_occupants int; _extra_occupants int;
  _hold public.booking_holds%ROWTYPE;
  _jwt_role text := COALESCE(NULLIF(current_setting('request.jwt.claim.role', true), ''), (NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'), '');
BEGIN
  IF _check_out <= _check_in THEN RAISE EXCEPTION 'check_out must be after check_in'; END IF;
  IF _adults IS NULL OR _adults < 1 THEN RAISE EXCEPTION 'At least one adult required'; END IF;
  IF _guest_name IS NULL OR length(trim(_guest_name)) < 2 THEN RAISE EXCEPTION 'Guest name required'; END IF;
  IF _guest_email IS NULL OR _guest_email !~* '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$' THEN RAISE EXCEPTION 'Valid email required'; END IF;
  IF _property_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.staynas_properties p WHERE p.id=_property_id AND p.status='active') THEN
    RAISE EXCEPTION 'Property is required and must be active';
  END IF;
  IF _jwt_role <> 'service_role' AND (
    auth.uid() IS NULL OR NOT public.staynas_current_user_has_property_role(
      _property_id,
      ARRAY['owner','manager','admin','reception','reservations']::public.app_role[]
    )
  ) THEN
    RAISE EXCEPTION 'Not authorized for requested property';
  END IF;
  SELECT * INTO _room FROM public.rooms WHERE slug=_room_slug AND status='active' AND property_id=_property_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Room not found for selected property: %',_room_slug; END IF;
  _children_total:=_below6+_plus7; _total_occupants:=_adults+_children_total;
  IF _total_occupants<1 THEN RAISE EXCEPTION 'At least one occupant required'; END IF;
  IF _total_occupants>_room.max_occupancy THEN RAISE EXCEPTION 'Room % allows up to % occupants',_room.name,_room.max_occupancy; END IF;
  _paid_occupants:=_adults+_plus7; _nights:=_check_out-_check_in;
  _extra_occupants:=GREATEST(0,_paid_occupants-_room.included_guests);
  IF _hold_id IS NOT NULL THEN
    SELECT * INTO _hold FROM public.booking_holds WHERE id=_hold_id FOR UPDATE;
    IF NOT FOUND OR _hold.status<>'active' OR _hold.expires_at<=now() THEN RAISE EXCEPTION 'Booking hold is not active'; END IF;
    IF _hold.room_id<>_room.id THEN RAISE EXCEPTION 'Hold room mismatch'; END IF;
    IF _session_id IS NOT NULL AND _hold.session_id<>_session_id THEN RAISE EXCEPTION 'Hold session mismatch'; END IF;
  END IF;
  _reference:='MR-'||to_char(now(),'YYMMDD')||'-'||upper(substr(md5(random()::text),1,5));
  INSERT INTO public.bookings(reference,room_id,check_in,check_out,nights,adults,children,children_below_6,children_7_plus,
    guest_name,guest_email,guest_phone,country,special_requests,currency,source,property_id)
  VALUES(_reference,_room.id,_check_in,_check_out,_nights,_adults,_children_total,_below6,_plus7,
    trim(_guest_name),lower(trim(_guest_email)),_guest_phone,_country,_special_requests,_room.currency,'website',_property_id)
  RETURNING id INTO _booking_id;
  _d:=_check_in;
  WHILE _d<_check_out LOOP
    INSERT INTO public.room_inventory(room_id,date,available_units) VALUES(_room.id,_d,_room.total_units) ON CONFLICT(room_id,date) DO NOTHING;
    SELECT available_units,is_blocked INTO _units,_blocked FROM public.room_inventory WHERE room_id=_room.id AND date=_d FOR UPDATE;
    IF _blocked THEN RAISE EXCEPTION 'Room blocked on %',_d; END IF;
    IF _units<=0 AND _hold_id IS NULL THEN RAISE EXCEPTION 'No availability for % on %',_room.name,_d; END IF;
    SELECT COALESCE(price_override,_room.base_price)+(_extra_occupants*_room.extra_guest_fee) INTO _rate
      FROM public.room_inventory WHERE room_id=_room.id AND date=_d;
    UPDATE public.room_inventory SET available_units=GREATEST(available_units-1,0) WHERE room_id=_room.id AND date=_d;
    INSERT INTO public.booking_nights(booking_id,room_id,date,nightly_rate) VALUES(_booking_id,_room.id,_d,_rate);
    _subtotal:=_subtotal+_rate; _d:=_d+INTERVAL '1 day';
  END LOOP;
  IF jsonb_array_length(COALESCE(_extras,'[]'::jsonb))>0 THEN
    FOR _extra_row IN SELECT (e->>'slug') slug,COALESCE((e->>'quantity')::int,1) quantity FROM jsonb_array_elements(COALESCE(_extras,'[]'::jsonb)) e LOOP
      SELECT * INTO _extra FROM public.extras WHERE slug=_extra_row.slug AND active=true AND property_id=_property_id;
      IF NOT FOUND THEN RAISE EXCEPTION 'Extra not found for selected property: %',_extra_row.slug; END IF;
      _line:=_extra.price*_extra_row.quantity*CASE _extra.unit
        WHEN 'per_stay' THEN 1 WHEN 'per_night' THEN _nights WHEN 'per_person' THEN _total_occupants
        WHEN 'per_person_per_night' THEN _total_occupants*_nights ELSE 1 END;
      INSERT INTO public.booking_extras(booking_id,extra_id,quantity,unit_price,line_total) VALUES(_booking_id,_extra.id,_extra_row.quantity,_extra.price,_line);
      _extras_total:=_extras_total+_line;
    END LOOP;
  END IF;
  _total:=_subtotal+_extras_total; _deposit:=ROUND((_total/2.0)::numeric,2); _balance:=_total; -- Deposit is required, not received; unpaid bookings owe the full total.
  UPDATE public.bookings SET subtotal=_subtotal,extras_total=_extras_total,total=_total,deposit_amount=_deposit,balance_amount=_balance,balance_due=_balance WHERE id=_booking_id;
  IF _hold_id IS NOT NULL THEN UPDATE public.booking_holds SET status='converted',converted_booking_id=_booking_id,updated_at=now() WHERE id=_hold_id; END IF;
  PERFORM public.log_calendar_event('reservation.created',_room.id,_booking_id,_hold_id,_check_in,_check_out,jsonb_build_object('reference',_reference,'total',_total));
  RETURN QUERY SELECT _booking_id,_reference,_total,_room.currency;
END
$function$;
REVOKE ALL ON FUNCTION public.create_booking(text, date, date, integer, integer, text, text, text, text, text, jsonb, integer, integer, uuid, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_booking(text, date, date, integer, integer, text, text, text, text, text, jsonb, integer, integer, uuid, text, uuid) TO authenticated, service_role;


-- Room reassignment is authenticated and must stay within the booking's property.
CREATE OR REPLACE FUNCTION public.reassign_booking_room(_booking_id uuid, _new_room_id uuid, _actor uuid DEFAULT NULL::uuid, _reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = pg_catalog, public, pg_temp
AS $function$
DECLARE
  _b public.bookings%ROWTYPE;
  _new_room public.rooms%ROWTYPE;
  _d date;
  _units int;
  _blocked boolean;
  _occupants int;
BEGIN
  IF _booking_id IS NULL OR _new_room_id IS NULL THEN
    RAISE EXCEPTION 'booking_id and new_room_id are required';
  END IF;

  SELECT * INTO _b FROM public.bookings WHERE id = _booking_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Booking not found'; END IF;

  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    IF auth.uid() IS NULL OR (_actor IS NOT NULL AND _actor <> auth.uid()) THEN
      RAISE EXCEPTION 'Not authorized to reassign booking';
    END IF;
    IF NOT public.staynas_current_user_has_property_role(
      _b.property_id,
      ARRAY['owner','manager','admin','reception','reservations']::public.app_role[]
    ) THEN
      RAISE EXCEPTION 'Reservation role required for booking property';
    END IF;
    _actor := auth.uid();
  END IF;
  IF _b.status IN ('cancelled','no_show') THEN
    RAISE EXCEPTION 'Cannot reassign a % booking', _b.status;
  END IF;
  IF _b.room_id = _new_room_id THEN
    RAISE EXCEPTION 'Booking is already assigned to this room';
  END IF;

  SELECT * INTO _new_room FROM public.rooms
    WHERE id = _new_room_id AND status = 'active';
  IF NOT FOUND THEN RAISE EXCEPTION 'Target room not found or inactive'; END IF;
  IF _new_room.property_id IS DISTINCT FROM _b.property_id THEN
    RAISE EXCEPTION 'Target room must belong to the booking property';
  END IF;

  _occupants := COALESCE(_b.adults,0) + COALESCE(_b.children,0);
  IF _occupants > _new_room.max_occupancy THEN
    RAISE EXCEPTION 'Target room % allows up to % guests', _new_room.name, _new_room.max_occupancy;
  END IF;

  -- Validate every night has capacity in the target room, and lock the rows.
  _d := _b.check_in;
  WHILE _d < _b.check_out LOOP
    INSERT INTO public.room_inventory (room_id, date, available_units)
      VALUES (_new_room_id, _d, _new_room.total_units)
      ON CONFLICT (room_id, date) DO NOTHING;

    SELECT available_units, is_blocked INTO _units, _blocked
      FROM public.room_inventory
      WHERE room_id = _new_room_id AND date = _d
      FOR UPDATE;

    IF _blocked OR _units <= 0 THEN
      RAISE EXCEPTION 'Target room % has no availability on %', _new_room.name, _d;
    END IF;
    _d := _d + INTERVAL '1 day';
  END LOOP;

  -- Consume target inventory, restore original.
  UPDATE public.room_inventory
     SET available_units = available_units - 1
   WHERE room_id = _new_room_id
     AND date >= _b.check_in AND date < _b.check_out;

  UPDATE public.room_inventory
     SET available_units = available_units + 1
   WHERE room_id = _b.room_id
     AND date >= _b.check_in AND date < _b.check_out;

  -- Reassign booking + per-night rows.
  UPDATE public.bookings
     SET room_id = _new_room_id, updated_at = now()
   WHERE id = _booking_id;

  UPDATE public.booking_nights
     SET room_id = _new_room_id
   WHERE booking_id = _booking_id;

  -- Audit trail (feeds the calendar events feed).
  INSERT INTO public.calendar_events (
    event_type, room_id, booking_id, date_from, date_to, actor_id, payload
  ) VALUES (
    'booking.reassigned',
    _new_room_id,
    _booking_id,
    _b.check_in,
    _b.check_out,
    _actor,
    jsonb_build_object(
      'from_room_id', _b.room_id,
      'to_room_id', _new_room_id,
      'reason', _reason
    )
  );

  RETURN jsonb_build_object(
    'ok', true,
    'booking_id', _booking_id,
    'from_room_id', _b.room_id,
    'to_room_id', _new_room_id
  );
END $function$;
REVOKE ALL ON FUNCTION public.reassign_booking_room(uuid, uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reassign_booking_room(uuid, uuid, uuid, text) TO authenticated, service_role;


-- Staff eligibility reads are property-role scoped; the raw booking-id primitive stays internal.
CREATE OR REPLACE FUNCTION public.checkin_eligibility_for_property(_booking_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
DECLARE
  _property_id uuid;
BEGIN
  SELECT b.property_id INTO _property_id
  FROM public.bookings b
  WHERE b.id = _booking_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Booking not found';
  END IF;

  IF NOT public.staynas_current_user_has_property_role(
    _property_id,
    ARRAY['owner','manager','admin','reception','reservations']::public.app_role[]
  ) THEN
    RAISE EXCEPTION 'Reservation role required for check-in eligibility';
  END IF;

  RETURN public.checkin_eligibility(_booking_id);
END;
$function$;

REVOKE ALL ON FUNCTION public.checkin_eligibility_for_property(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.checkin_eligibility_for_property(uuid) TO authenticated, service_role;




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
$function$;


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
$function$;


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
$function$;




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
$function$;


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
END $function$;


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
END $function$;


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
$function$;




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
END $function$;


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
$function$;



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
$function$;


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
$function$;


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
$function$;



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
$function$;


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
$function$;


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
$function$;


CREATE OR REPLACE FUNCTION public.housekeeping_is_supervisor(_uid uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT _uid IS NOT NULL AND _uid = auth.uid() AND public.staynas_current_user_has_property_role(public.staynas_active_property_id(_uid), ARRAY['owner','manager','admin']::public.app_role[])
$function$;

REVOKE ALL ON FUNCTION public.housekeeping_is_supervisor(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.housekeeping_is_supervisor(uuid) TO authenticated, service_role;


CREATE OR REPLACE FUNCTION public.housekeeping_get_dashboard()
 RETURNS TABLE(active_tasks bigint, unassigned_tasks bigint, in_progress_tasks bigint, overdue_tasks bigint, inspection_pending bigint, exceptions_open bigint, rooms_ready bigint, failed_inspections_today bigint, avg_cleaning_minutes numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _uid uuid:=auth.uid(); _property_id uuid;
BEGIN
 IF _uid IS NULL OR NOT public.staynas_current_user_has_property_role(public.staynas_active_property_id(_uid), ARRAY['housekeeping','owner','manager','admin']::public.app_role[])
 THEN RAISE EXCEPTION 'Housekeeping access required'; END IF;
 _property_id:=public.staynas_active_property_id(_uid);
 IF _property_id IS NULL OR NOT public.staynas_user_has_property_access(_uid,_property_id)
 THEN RAISE EXCEPTION 'Active property access required'; END IF;
 RETURN QUERY SELECT
 (SELECT count(*) FROM public.ops_tasks t WHERE t.property_id=_property_id AND t.category='housekeeping' AND t.status IN('pending','in_progress')),
 (SELECT count(*) FROM public.ops_tasks t WHERE t.property_id=_property_id AND t.category='housekeeping' AND t.status IN('pending','in_progress') AND t.assignee_id IS NULL),
 (SELECT count(*) FROM public.ops_tasks t WHERE t.property_id=_property_id AND t.category='housekeeping' AND t.status='in_progress'),
 (SELECT count(*) FROM public.ops_tasks t WHERE t.property_id=_property_id AND t.category='housekeeping' AND t.status IN('pending','in_progress') AND t.due_at<now()),
 (SELECT count(*) FROM public.housekeeping_inspections i JOIN public.room_states rs ON rs.id=i.room_state_id WHERE rs.property_id=_property_id AND i.status='pending'),
 (SELECT count(*) FROM public.housekeeping_exceptions e JOIN public.room_states rs ON rs.id=e.room_state_id WHERE rs.property_id=_property_id AND e.status='open'),
 (SELECT count(*) FROM public.room_states rs WHERE rs.property_id=_property_id AND rs.state='vacant_clean'),
 (SELECT count(*) FROM public.housekeeping_inspections i JOIN public.room_states rs ON rs.id=i.room_state_id WHERE rs.property_id=_property_id AND i.status='failed' AND i.inspected_at>=date_trunc('day',now())),
 COALESCE((SELECT ROUND(AVG(EXTRACT(EPOCH FROM(t.completed_at-t.started_at))/60.0)::numeric,1)
 FROM public.ops_tasks t WHERE t.property_id=_property_id AND t.category='housekeeping'
 AND t.completed_at IS NOT NULL AND t.started_at IS NOT NULL AND t.completed_at>=now()-interval '7 days'),0);
END;
$function$;


CREATE OR REPLACE FUNCTION public.housekeeping_list_exceptions(_room_state_id uuid DEFAULT NULL::uuid, _open_only boolean DEFAULT true)
 RETURNS TABLE(id uuid, room_state_id uuid, task_id uuid, exception_type text, status text, severity integer, title text, notes text, evidence jsonb, reported_by uuid, assigned_to uuid, resolved_by uuid, resolved_at timestamp with time zone, created_at timestamp with time zone, unit_label text, room_name text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _uid uuid:=auth.uid(); _property_id uuid;
BEGIN
 IF _uid IS NULL OR NOT public.staynas_current_user_has_property_role(public.staynas_active_property_id(_uid), ARRAY['housekeeping','owner','manager','admin']::public.app_role[])
 THEN RAISE EXCEPTION 'Housekeeping access required'; END IF;
 _property_id:=public.staynas_active_property_id(_uid);
 IF _property_id IS NULL OR NOT public.staynas_user_has_property_access(_uid,_property_id)
 THEN RAISE EXCEPTION 'Active property access required'; END IF;
 RETURN QUERY SELECT e.id,e.room_state_id,e.task_id,e.exception_type,e.status,e.severity,e.title,e.notes,e.evidence,
 e.reported_by,e.assigned_to,e.resolved_by,e.resolved_at,e.created_at,rs.unit_label,r.name
 FROM public.housekeeping_exceptions e JOIN public.room_states rs ON rs.id=e.room_state_id AND rs.property_id=_property_id
 JOIN public.rooms r ON r.id=rs.room_id AND r.property_id=_property_id
 WHERE (_room_state_id IS NULL OR e.room_state_id=_room_state_id) AND (NOT _open_only OR e.status='open')
 ORDER BY e.severity,e.created_at DESC;
END;
$function$;


CREATE OR REPLACE FUNCTION public.housekeeping_list_intelligence()
 RETURNS TABLE(signal_type text, priority text, title text, reasoning text, room_id uuid, booking_id uuid, confidence numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _uid uuid:=auth.uid(); _property_id uuid;
BEGIN
 IF _uid IS NULL OR NOT public.staynas_current_user_has_property_role(public.staynas_active_property_id(_uid), ARRAY['housekeeping','owner','manager','admin']::public.app_role[])
 THEN RAISE EXCEPTION 'Housekeeping access required'; END IF;
 _property_id:=public.staynas_active_property_id(_uid);
 IF _property_id IS NULL OR NOT public.staynas_user_has_property_access(_uid,_property_id)
 THEN RAISE EXCEPTION 'Active property access required'; END IF;
 RETURN QUERY SELECT i.insight_type,i.priority,i.title,i.reasoning,i.room_id,i.booking_id,i.confidence
 FROM public.ai_room_readiness_insights i JOIN public.rooms r ON r.id=i.room_id AND r.property_id=_property_id
 WHERE i.status='pending' AND i.priority IN('critical','high')
 ORDER BY CASE i.priority WHEN 'critical' THEN 1 WHEN 'high' THEN 2 ELSE 3 END,i.created_at DESC LIMIT 20;
END;
$function$;


CREATE OR REPLACE FUNCTION public.housekeeping_list_inspection_queue()
 RETURNS TABLE(inspection_id uuid, room_state_id uuid, cleaning_task_id uuid, attempt_no integer, status text, unit_label text, room_name text, room_id uuid, booking_id uuid, booking_reference text, guest_name text, completed_at timestamp with time zone, checklist jsonb, notes text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _uid uuid:=auth.uid(); _property_id uuid;
BEGIN
 IF _uid IS NULL OR NOT public.staynas_current_user_has_property_role(public.staynas_active_property_id(_uid), ARRAY['owner','manager','admin']::public.app_role[])
 THEN RAISE EXCEPTION 'Supervisor access required'; END IF;
 _property_id:=public.staynas_active_property_id(_uid);
 IF _property_id IS NULL OR NOT public.staynas_user_has_property_access(_uid,_property_id)
 THEN RAISE EXCEPTION 'Active property access required'; END IF;
 RETURN QUERY SELECT i.id,i.room_state_id,i.cleaning_task_id,i.attempt_no,i.status,rs.unit_label,r.name,r.id,
 t.booking_id,b.reference,b.guest_name,t.completed_at,i.checklist,i.notes
 FROM public.housekeeping_inspections i
 JOIN public.room_states rs ON rs.id=i.room_state_id AND rs.property_id=_property_id
 JOIN public.rooms r ON r.id=rs.room_id AND r.property_id=_property_id
 JOIN public.ops_tasks t ON t.id=i.cleaning_task_id AND t.property_id=_property_id
 LEFT JOIN public.bookings b ON b.id=t.booking_id AND b.property_id=_property_id
 WHERE i.status='pending' ORDER BY t.completed_at NULLS LAST,i.created_at;
END;
$function$;


CREATE OR REPLACE FUNCTION public.housekeeping_list_work(_mine_only boolean DEFAULT false, _include_completed boolean DEFAULT false)
 RETURNS TABLE(id uuid, room_state_id uuid, unit_label text, room_id uuid, room_name text, booking_id uuid, booking_reference text, guest_name text, status ops_task_status, priority integer, due_at timestamp with time zone, assignee_id uuid, claimed_at timestamp with time zone, started_at timestamp with time zone, completed_at timestamp with time zone, title text, description text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _uid uuid:=auth.uid(); _property_id uuid;
BEGIN
 IF _uid IS NULL OR NOT public.staynas_current_user_has_property_role(public.staynas_active_property_id(_uid), ARRAY['housekeeping','owner','manager','admin']::public.app_role[])
 THEN RAISE EXCEPTION 'Housekeeping access required'; END IF;
 _property_id:=public.staynas_active_property_id(_uid);
 IF _property_id IS NULL OR NOT public.staynas_user_has_property_access(_uid,_property_id)
 THEN RAISE EXCEPTION 'Active property access required'; END IF;
 RETURN QUERY SELECT t.id,rs.id,rs.unit_label,r.id,r.name,t.booking_id,b.reference,b.guest_name,
 t.status,t.priority,t.due_at,t.assignee_id,t.claimed_at,t.started_at,t.completed_at,t.title,t.description
 FROM public.ops_tasks t
 JOIN public.room_states rs ON rs.id=t.room_state_id AND rs.property_id=_property_id
 JOIN public.rooms r ON r.id=rs.room_id AND r.property_id=_property_id
 LEFT JOIN public.bookings b ON b.id=t.booking_id AND b.property_id=_property_id
 WHERE t.property_id=_property_id AND t.category='housekeeping'
 AND (_include_completed OR t.status IN('pending','in_progress'))
 AND (NOT _mine_only OR t.assignee_id=_uid)
 ORDER BY CASE WHEN t.priority=1 THEN 0 WHEN t.priority=2 THEN 1 ELSE 2 END,t.due_at NULLS LAST,t.created_at;
END;
$function$;


CREATE OR REPLACE FUNCTION public.housekeeping_report_exception(_room_state_id uuid, _task_id uuid, _exception_type text, _title text, _notes text DEFAULT NULL::text, _severity integer DEFAULT 2, _evidence jsonb DEFAULT '[]'::jsonb)
 RETURNS housekeeping_exceptions
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _uid uuid := auth.uid(); _row public.housekeeping_exceptions%ROWTYPE; _task public.ops_tasks%ROWTYPE;
BEGIN
  IF _uid IS NULL OR NOT public.staynas_current_user_has_property_role(public.staynas_active_property_id(_uid), ARRAY['housekeeping','owner','manager','admin']::public.app_role[])
    THEN RAISE EXCEPTION 'Housekeeping access required'; END IF;
  IF _exception_type NOT IN ('dnd','discrepancy','damage','maintenance','lost_found','linen_amenity')
    THEN RAISE EXCEPTION 'Invalid housekeeping exception type'; END IF;
  IF _severity NOT BETWEEN 1 AND 3 THEN RAISE EXCEPTION 'Invalid severity'; END IF;
  IF jsonb_typeof(COALESCE(_evidence,'[]'::jsonb)) <> 'array' THEN RAISE EXCEPTION 'Evidence must be an array'; END IF;

  IF _task_id IS NOT NULL THEN
    SELECT * INTO _task FROM public.ops_tasks WHERE id = _task_id AND category = 'housekeeping' AND property_id = public.staynas_active_property_id(_uid);
    IF NOT FOUND THEN RAISE EXCEPTION 'Housekeeping task not found'; END IF;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.room_states rs WHERE rs.id = _room_state_id AND rs.property_id = public.staynas_active_property_id(_uid)) THEN RAISE EXCEPTION 'Room state is outside the active property'; END IF;

  INSERT INTO public.housekeeping_exceptions (
    room_state_id, task_id, exception_type, title, notes, severity, evidence, reported_by
  ) VALUES (
    _room_state_id, _task_id, _exception_type, trim(_title),
    NULLIF(trim(COALESCE(_notes,'')), ''), _severity, _evidence, _uid
  ) RETURNING * INTO _row;

  IF _exception_type = 'maintenance' THEN
    INSERT INTO public.ops_tasks (
      booking_id, task_type, category, title, description, priority, due_at, room_state_id
    )
    SELECT _task.booking_id, 'housekeeping_maintenance', 'maintenance',
           'Maintenance: ' || trim(_title),
           concat_ws(E'\n', NULLIF(trim(COALESCE(_notes,'')), ''), 'Reported from Housekeeping.'),
           _severity, now() + CASE WHEN _severity = 1 THEN interval '30 minutes' ELSE interval '2 hours' END,
           _room_state_id
    WHERE _task_id IS NOT NULL;
  END IF;

  RETURN _row;
END;
$function$;


CREATE OR REPLACE FUNCTION public.housekeeping_resolve_exception(_exception_id uuid, _resolution text DEFAULT NULL::text)
 RETURNS housekeeping_exceptions
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _uid uuid := auth.uid(); _row public.housekeeping_exceptions%ROWTYPE;
BEGIN
  IF _uid IS NULL OR NOT public.staynas_current_user_has_property_role(public.staynas_active_property_id(_uid), ARRAY['housekeeping','owner','manager','admin']::public.app_role[])
    THEN RAISE EXCEPTION 'Housekeeping access required'; END IF;
  SELECT * INTO _row FROM public.housekeeping_exceptions WHERE id=_exception_id AND EXISTS (SELECT 1 FROM public.room_states rs WHERE rs.id=housekeeping_exceptions.room_state_id AND rs.property_id=public.staynas_active_property_id(_uid)) FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Exception not found'; END IF;
  IF _row.status <> 'open' THEN RETURN _row; END IF;

  UPDATE public.housekeeping_exceptions
  SET status='resolved',
      notes=CASE WHEN NULLIF(trim(COALESCE(_resolution,'')),'') IS NULL THEN notes
                 ELSE concat_ws(E'\n',NULLIF(notes,''),'Resolution: '||trim(_resolution)) END,
      resolved_by=_uid,resolved_at=now(),updated_at=now()
  WHERE id=_exception_id RETURNING * INTO _row;
  RETURN _row;
END;
$function$;


CREATE OR REPLACE FUNCTION public.housekeeping_submit_inspection(_inspection_id uuid, _checklist jsonb, _passed boolean, _notes text DEFAULT NULL::text, _idempotency_key text DEFAULT NULL::text)
 RETURNS housekeeping_inspections
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _inspection public.housekeeping_inspections%ROWTYPE;
  _rs public.room_states%ROWTYPE;
  _task public.ops_tasks%ROWTYPE;
  _required text[] := ARRAY['bedroom','bathroom','linen','amenities','floor','fixtures','waste','overall'];
  _key text;
  _snapshot jsonb := '[]'::jsonb;
  _all_passed boolean := true;
  _item jsonb;
BEGIN
  IF _uid IS NULL OR NOT public.staynas_current_user_has_property_role(public.staynas_active_property_id(_uid), ARRAY['owner','manager','admin']::public.app_role[])
  THEN RAISE EXCEPTION 'Supervisor access required'; END IF;
  IF _idempotency_key IS NULL OR length(trim(_idempotency_key)) < 8
    THEN RAISE EXCEPTION 'Idempotency key is required'; END IF;
  IF jsonb_typeof(_checklist) <> 'array' OR jsonb_array_length(_checklist) <> 8
    THEN RAISE EXCEPTION 'Complete inspection checklist is required'; END IF;

  SELECT * INTO _inspection FROM public.housekeeping_inspections
  WHERE id = _inspection_id AND EXISTS (SELECT 1 FROM public.room_states rs WHERE rs.id=housekeeping_inspections.room_state_id AND rs.property_id=public.staynas_active_property_id(_uid)) FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Inspection not found'; END IF;
  IF _inspection.status <> 'pending' THEN RETURN _inspection; END IF;

  IF EXISTS (SELECT 1 FROM public.housekeeping_inspections WHERE idempotency_key = _idempotency_key) THEN
    SELECT * INTO _inspection FROM public.housekeeping_inspections WHERE idempotency_key = _idempotency_key;
    RETURN _inspection;
  END IF;

  SELECT * INTO _rs FROM public.room_states WHERE id = _inspection.room_state_id FOR UPDATE;
  SELECT * INTO _task FROM public.ops_tasks WHERE id = _inspection.cleaning_task_id AND property_id=public.staynas_active_property_id(_uid) FOR UPDATE;
  IF NOT FOUND OR _rs.state <> 'inspection' THEN RAISE EXCEPTION 'Room is not awaiting inspection'; END IF;
  IF _task.status <> 'completed' THEN RAISE EXCEPTION 'Cleaning task is not complete'; END IF;

  FOREACH _key IN ARRAY _required LOOP
    _item := NULL;
    SELECT x INTO _item
    FROM jsonb_array_elements(_checklist) x
    WHERE x->>'key' = _key;
    IF _item IS NULL OR (_item ? 'passed') = false OR jsonb_typeof(_item->'passed') <> 'boolean'
      THEN RAISE EXCEPTION 'Invalid inspection checklist'; END IF;
    _snapshot := _snapshot || jsonb_build_array(
      jsonb_build_object(
        'key', _key,
        'label', (SELECT value->>'label' FROM jsonb_array_elements(public.housekeeping_checklist_template()) value WHERE value->>'key' = _key),
        'passed', (_item->>'passed')::boolean
      )
    );
    IF (_item->>'passed')::boolean = false THEN _all_passed := false; END IF;
  END LOOP;

  IF _passed AND NOT _all_passed THEN RAISE EXCEPTION 'All checklist items must pass before room can be ready'; END IF;
  IF NOT _passed THEN _all_passed := false; END IF;

  IF _passed THEN
    PERFORM public.housekeeping_transition_room_state(
      _rs.id, 'vacant_clean',
      NULLIF(trim(COALESCE(_notes,'')), ''),
      'inspection:' || _idempotency_key
    );

    UPDATE public.housekeeping_inspections
    SET status = 'passed', checklist = _snapshot, notes = NULLIF(trim(COALESCE(_notes,'')), ''),
        inspector_id = _uid, inspected_at = now(), idempotency_key = _idempotency_key, updated_at = now()
    WHERE id = _inspection.id
    RETURNING * INTO _inspection;
  ELSE
    PERFORM public.housekeeping_transition_room_state(
      _rs.id, 'vacant_dirty',
      NULLIF(trim(COALESCE(_notes,'')), ''),
      'inspection:' || _idempotency_key
    );

    UPDATE public.housekeeping_inspections
    SET status = 'failed', checklist = _snapshot, notes = NULLIF(trim(COALESCE(_notes,'')), ''),
        inspector_id = _uid, inspected_at = now(), idempotency_key = _idempotency_key, updated_at = now()
    WHERE id = _inspection.id
    RETURNING * INTO _inspection;

    INSERT INTO public.ops_tasks (
      booking_id, task_type, category, title, description, priority, due_at, room_state_id
    )
    VALUES (
      _task.booking_id, 'housekeeping_reclean', 'housekeeping',
      'Re-clean ' || _rs.unit_label,
      concat_ws(E'\\n', 'Inspection failed — re-clean required', NULLIF(trim(COALESCE(_notes,'')), '')),
      1, now() + interval '1 hour', _rs.id
    );
  END IF;

  RETURN _inspection;
END;
$function$;


CREATE OR REPLACE FUNCTION public.housekeeping_transition_room_state(_room_state_id uuid, _to_state room_state, _note text DEFAULT NULL::text, _idempotency_key text DEFAULT NULL::text)
 RETURNS room_states
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _current public.room_states%ROWTYPE;
  _existing public.housekeeping_transition_log%ROWTYPE;
  _result public.room_states%ROWTYPE;
  _is_supervisor boolean;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF NOT public.staynas_current_user_has_property_role(public.staynas_active_property_id(_uid), ARRAY['housekeeping','owner','manager','admin']::public.app_role[]) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  IF _idempotency_key IS NULL OR length(trim(_idempotency_key)) < 8 THEN
    RAISE EXCEPTION 'Idempotency key is required';
  END IF;

  SELECT *
    INTO _existing
  FROM public.housekeeping_transition_log
  WHERE idempotency_key = _idempotency_key AND room_state_id = _room_state_id AND actor_id = _uid;

  IF FOUND THEN
    SELECT * INTO _result
    FROM public.room_states
    WHERE id = _existing.room_state_id;
    RETURN _result;
  END IF;

  SELECT *
    INTO _current
  FROM public.room_states
  WHERE id = _room_state_id AND property_id = public.staynas_active_property_id(_uid)
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Room state not found';
  END IF;

  _is_supervisor := public.staynas_current_user_has_property_role(
    _current.property_id,
    ARRAY['admin'::public.app_role, 'owner'::public.app_role, 'manager'::public.app_role]
  );

  -- Housekeeping staff may only execute housekeeping lifecycle transitions.
  IF NOT _is_supervisor
     AND NOT public.staynas_current_user_has_property_role(_current.property_id, ARRAY['housekeeping'::public.app_role])
  THEN
    RAISE EXCEPTION 'Housekeeping transition requires housekeeping or supervisor role';
  END IF;

  IF NOT _is_supervisor THEN
    IF NOT (
      (_current.state = 'vacant_dirty' AND _to_state = 'inspection')
      OR (_current.state = 'inspection' AND _to_state IN ('vacant_clean', 'vacant_dirty'))
    ) THEN
      RAISE EXCEPTION 'Invalid housekeeping transition: % -> %', _current.state, _to_state;
    END IF;
  ELSE
    IF NOT (
      (_current.state = 'vacant_dirty' AND _to_state IN ('inspection', 'maintenance', 'out_of_service'))
      OR (_current.state = 'inspection' AND _to_state IN ('vacant_clean', 'vacant_dirty', 'maintenance', 'out_of_service'))
      OR (_current.state = 'vacant_clean' AND _to_state IN ('vacant_dirty', 'maintenance', 'out_of_service'))
      OR (_current.state = 'maintenance' AND _to_state IN ('vacant_dirty', 'vacant_clean', 'out_of_service'))
      OR (_current.state = 'out_of_service' AND _to_state IN ('maintenance', 'vacant_dirty', 'vacant_clean'))
    ) THEN
      RAISE EXCEPTION 'Invalid room-readiness transition: % -> %', _current.state, _to_state;
    END IF;
  END IF;

  UPDATE public.room_states
  SET state = _to_state,
      state_note = NULLIF(trim(COALESCE(_note, '')), ''),
      updated_by = _uid,
      updated_at = now()
  WHERE id = _room_state_id
  RETURNING * INTO _result;

  INSERT INTO public.housekeeping_transition_log (
    room_state_id, from_state, to_state, actor_id, idempotency_key, note
  ) VALUES (
    _room_state_id, _current.state, _to_state, _uid, _idempotency_key, _note
  );

  RETURN _result;
END;
$function$;


CREATE OR REPLACE FUNCTION public.housekeeping_assign_task(_task_id uuid, _assignee_id uuid)
 RETURNS ops_tasks
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _task public.ops_tasks%ROWTYPE;
BEGIN
  IF _uid IS NULL OR NOT public.housekeeping_is_supervisor(_uid)
    THEN RAISE EXCEPTION 'Supervisor access required'; END IF;
  SELECT * INTO _task FROM public.ops_tasks WHERE id = _task_id AND category = 'housekeeping' AND property_id = public.staynas_active_property_id(_uid) FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Housekeeping task not found'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.staynas_property_members pm JOIN public.staynas_properties p ON p.id=pm.property_id JOIN public.staynas_organisations o ON o.id=p.organisation_id WHERE pm.user_id=_assignee_id AND pm.property_id=_task.property_id AND pm.status='active' AND pm.role='housekeeping' AND p.status <> 'suspended' AND o.status='active') THEN RAISE EXCEPTION 'Assignee must have an active housekeeping role in this property'; END IF;
  IF _task.status IN ('completed','cancelled') THEN RAISE EXCEPTION 'Task is closed'; END IF;

  UPDATE public.ops_tasks
  SET assignee_id = _assignee_id,
      claimed_at = NULL,
      started_at = NULL,
      status = CASE WHEN status = 'in_progress' THEN 'pending'::public.ops_task_status ELSE status END,
      updated_at = now()
  WHERE id = _task_id
  RETURNING * INTO _task;
  RETURN _task;
END;
$function$;


CREATE OR REPLACE FUNCTION public.housekeeping_claim_task(_task_id uuid)
 RETURNS ops_tasks
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _task public.ops_tasks%ROWTYPE;
BEGIN
  IF _uid IS NULL OR NOT public.staynas_current_user_has_property_role(public.staynas_active_property_id(_uid), ARRAY['housekeeping']::public.app_role[])
    THEN RAISE EXCEPTION 'Housekeeping staff access required'; END IF;

  SELECT * INTO _task FROM public.ops_tasks WHERE id = _task_id AND category = 'housekeeping' AND property_id = public.staynas_active_property_id(_uid) FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Housekeeping task not found'; END IF;
  IF _task.status IN ('completed','cancelled') THEN RAISE EXCEPTION 'Task is closed'; END IF;
  IF _task.assignee_id IS NOT NULL AND _task.assignee_id <> _uid THEN
    RAISE EXCEPTION 'Task is assigned to another housekeeper';
  END IF;

  UPDATE public.ops_tasks
  SET assignee_id = _uid,
      claimed_at = COALESCE(claimed_at, now()),
      status = 'pending',
      updated_at = now()
  WHERE id = _task_id
  RETURNING * INTO _task;
  RETURN _task;
END;
$function$;


CREATE OR REPLACE FUNCTION public.housekeeping_claim_task(_task_id uuid, _idempotency_key text DEFAULT NULL::text)
 RETURNS ops_tasks
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _task public.ops_tasks%ROWTYPE;
  _existing public.housekeeping_action_idempotency%ROWTYPE;
BEGIN
  IF _uid IS NULL OR NOT public.staynas_current_user_has_property_role(public.staynas_active_property_id(_uid), ARRAY['housekeeping']::public.app_role[])
    THEN RAISE EXCEPTION 'Housekeeping staff access required'; END IF;
  IF _idempotency_key IS NULL OR length(trim(_idempotency_key)) < 8
    THEN RAISE EXCEPTION 'Idempotency key is required'; END IF;

  SELECT * INTO _task
  FROM public.ops_tasks
  WHERE id = _task_id AND category = 'housekeeping' AND property_id = public.staynas_active_property_id(_uid)
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'Housekeeping task not found'; END IF;

  SELECT * INTO _existing
  FROM public.housekeeping_action_idempotency
  WHERE action_type = 'claim'
    AND idempotency_key = _idempotency_key
    AND task_id = _task_id AND actor_id = _uid
  LIMIT 1;

  IF FOUND THEN
    SELECT * INTO _task FROM public.ops_tasks WHERE id = _existing.task_id;
    RETURN _task;
  END IF;

  IF _task.status IN ('completed','cancelled') THEN
    RAISE EXCEPTION 'Task is closed';
  END IF;
  IF _task.assignee_id IS NOT NULL AND _task.assignee_id <> _uid THEN
    RAISE EXCEPTION 'Task is assigned to another housekeeper';
  END IF;

  UPDATE public.ops_tasks
  SET assignee_id = _uid,
      claimed_at = COALESCE(claimed_at, now()),
      status = 'pending',
      updated_at = now()
  WHERE id = _task_id
  RETURNING * INTO _task;

  INSERT INTO public.housekeeping_action_idempotency(
    action_type, idempotency_key, task_id, actor_id, result
  )
  VALUES ('claim', _idempotency_key, _task.id, _uid, to_jsonb(_task))
  ON CONFLICT (action_type, idempotency_key) DO NOTHING;

  RETURN _task;
END;
$function$;


CREATE OR REPLACE FUNCTION public.housekeeping_complete_task(_task_id uuid, _note text DEFAULT NULL::text, _idempotency_key text DEFAULT NULL::text)
 RETURNS ops_tasks
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _task public.ops_tasks%ROWTYPE;
  _rs public.room_states%ROWTYPE;
BEGIN
  IF _uid IS NULL OR NOT public.staynas_current_user_has_property_role(public.staynas_active_property_id(_uid), ARRAY['housekeeping']::public.app_role[])
    THEN RAISE EXCEPTION 'Housekeeping staff access required'; END IF;
  IF _idempotency_key IS NULL OR length(trim(_idempotency_key)) < 8
    THEN RAISE EXCEPTION 'Idempotency key is required'; END IF;

  SELECT * INTO _task
  FROM public.ops_tasks
  WHERE id = _task_id AND category = 'housekeeping' AND property_id = public.staynas_active_property_id(_uid)
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'Housekeeping task not found'; END IF;
  IF _task.assignee_id <> _uid THEN RAISE EXCEPTION 'Task is assigned to another housekeeper'; END IF;
  IF _task.status = 'completed' THEN RETURN _task; END IF;
  IF _task.status <> 'in_progress' THEN RAISE EXCEPTION 'Start the task before completing it'; END IF;
  IF EXISTS (
    SELECT 1 FROM public.housekeeping_transition_log
    WHERE idempotency_key = _idempotency_key AND room_state_id = _task.room_state_id AND actor_id = _uid
  ) THEN
    RETURN _task;
  END IF;

  SELECT * INTO _rs
  FROM public.room_states
  WHERE id = _task.room_state_id
  FOR UPDATE;

  IF NOT FOUND OR _rs.state <> 'vacant_dirty' THEN
    RAISE EXCEPTION 'Room is not awaiting cleaning';
  END IF;

  PERFORM public.housekeeping_transition_room_state(
    _rs.id,
    'inspection',
    _note,
    _idempotency_key
  );

  UPDATE public.ops_tasks
  SET status = 'completed',
      completed_at = now(),
      completed_by = _uid,
      updated_at = now(),
      description = CASE
        WHEN NULLIF(trim(COALESCE(_note,'')), '') IS NULL THEN description
        ELSE concat_ws(E'\n', NULLIF(description,''), 'Cleaning note: ' || trim(_note))
      END
  WHERE id = _task_id
  RETURNING * INTO _task;

  INSERT INTO public.housekeeping_inspections (
    room_state_id, cleaning_task_id, status, checklist
  )
  VALUES (
    _rs.id, _task.id, 'pending', public.housekeeping_checklist_template()
  )
  ON CONFLICT (room_state_id) WHERE status = 'pending' DO NOTHING;

  RETURN _task;
END;
$function$;


CREATE OR REPLACE FUNCTION public.housekeeping_start_task(_task_id uuid)
 RETURNS ops_tasks
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _task public.ops_tasks%ROWTYPE;
  _rs public.room_states%ROWTYPE;
BEGIN
  IF _uid IS NULL OR NOT public.staynas_current_user_has_property_role(public.staynas_active_property_id(_uid), ARRAY['housekeeping']::public.app_role[])
    THEN RAISE EXCEPTION 'Housekeeping staff access required'; END IF;

  SELECT * INTO _task FROM public.ops_tasks WHERE id = _task_id AND category = 'housekeeping' AND property_id = public.staynas_active_property_id(_uid) FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Housekeeping task not found'; END IF;
  IF _task.assignee_id <> _uid THEN RAISE EXCEPTION 'Claim the task before starting'; END IF;
  IF _task.status <> 'pending' THEN RAISE EXCEPTION 'Task is not pending'; END IF;
  IF _task.room_state_id IS NULL THEN RAISE EXCEPTION 'Housekeeping task has no room'; END IF;

  SELECT * INTO _rs FROM public.room_states WHERE id = _task.room_state_id FOR UPDATE;
  IF NOT FOUND OR _rs.state <> 'vacant_dirty' THEN
    RAISE EXCEPTION 'Room is not awaiting cleaning';
  END IF;

  UPDATE public.ops_tasks
  SET status = 'in_progress',
      started_at = COALESCE(started_at, now()),
      claimed_at = COALESCE(claimed_at, now()),
      updated_at = now()
  WHERE id = _task_id
  RETURNING * INTO _task;
  RETURN _task;
END;
$function$;


CREATE OR REPLACE FUNCTION public.housekeeping_start_task(_task_id uuid, _idempotency_key text DEFAULT NULL::text)
 RETURNS ops_tasks
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _task public.ops_tasks%ROWTYPE;
  _rs public.room_states%ROWTYPE;
  _existing public.housekeeping_action_idempotency%ROWTYPE;
BEGIN
  IF _uid IS NULL OR NOT public.staynas_current_user_has_property_role(public.staynas_active_property_id(_uid), ARRAY['housekeeping']::public.app_role[])
    THEN RAISE EXCEPTION 'Housekeeping staff access required'; END IF;
  IF _idempotency_key IS NULL OR length(trim(_idempotency_key)) < 8
    THEN RAISE EXCEPTION 'Idempotency key is required'; END IF;

  SELECT * INTO _task
  FROM public.ops_tasks
  WHERE id = _task_id AND category = 'housekeeping' AND property_id = public.staynas_active_property_id(_uid)
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'Housekeeping task not found'; END IF;

  SELECT * INTO _existing
  FROM public.housekeeping_action_idempotency
  WHERE action_type = 'start'
    AND idempotency_key = _idempotency_key
    AND task_id = _task_id AND actor_id = _uid
  LIMIT 1;

  IF FOUND THEN
    SELECT * INTO _task FROM public.ops_tasks WHERE id = _existing.task_id;
    RETURN _task;
  END IF;

  IF _task.assignee_id <> _uid THEN RAISE EXCEPTION 'Claim the task before starting'; END IF;
  IF _task.status = 'in_progress' THEN
    INSERT INTO public.housekeeping_action_idempotency(
      action_type, idempotency_key, task_id, actor_id, result
    )
    VALUES ('start', _idempotency_key, _task.id, _uid, to_jsonb(_task))
    ON CONFLICT (action_type, idempotency_key) DO NOTHING;
    RETURN _task;
  END IF;
  IF _task.status <> 'pending' THEN RAISE EXCEPTION 'Task is not pending'; END IF;
  IF _task.room_state_id IS NULL THEN RAISE EXCEPTION 'Housekeeping task has no room'; END IF;

  SELECT * INTO _rs
  FROM public.room_states
  WHERE id = _task.room_state_id
  FOR UPDATE;

  IF NOT FOUND OR _rs.state <> 'vacant_dirty' THEN
    RAISE EXCEPTION 'Room is not awaiting cleaning';
  END IF;

  UPDATE public.ops_tasks
  SET status = 'in_progress',
      started_at = COALESCE(started_at, now()),
      claimed_at = COALESCE(claimed_at, now()),
      updated_at = now()
  WHERE id = _task_id
  RETURNING * INTO _task;

  INSERT INTO public.housekeeping_action_idempotency(
    action_type, idempotency_key, task_id, actor_id, result
  )
  VALUES ('start', _idempotency_key, _task.id, _uid, to_jsonb(_task))
  ON CONFLICT (action_type, idempotency_key) DO NOTHING;

  RETURN _task;
END;
$function$;


CREATE OR REPLACE FUNCTION public.knowledge_can_read_document(_doc_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.knowledge_documents d
    LEFT JOIN public.knowledge_categories c ON c.id = d.category_id
    WHERE d.id = _doc_id
      AND d.property_id IS NOT NULL
      AND public.staynas_user_has_property_access(auth.uid(), d.property_id)
      AND (c.property_id IS NULL OR c.property_id = d.property_id)
      AND public.staynas_current_user_has_property_role(d.property_id, ARRAY['owner','manager','admin','reception','housekeeping','finance','marketing','editor','reservations']::public.app_role[])
      AND (
        public.staynas_current_user_has_property_role(d.property_id, ARRAY['owner','manager','admin']::public.app_role[])
        OR d.status = 'published'
      )
      AND (
        d.allowed_roles IS NULL
        OR array_length(d.allowed_roles, 1) IS NULL
        OR public.staynas_current_user_has_property_role(d.property_id, d.allowed_roles)
        OR public.staynas_current_user_has_property_role(d.property_id, ARRAY['owner','manager','admin']::public.app_role[])
      )
      AND (
        c.id IS NULL
        OR array_length(c.allowed_roles, 1) IS NULL
        OR public.staynas_current_user_has_property_role(d.property_id, c.allowed_roles)
        OR public.staynas_current_user_has_property_role(d.property_id, ARRAY['owner','manager','admin']::public.app_role[])
      )
  );
$function$;


CREATE OR REPLACE FUNCTION public.set_room_block(_room_id uuid, _from date, _to date, _blocked boolean, _reason text DEFAULT NULL::text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _d date; _n int := 0; _room public.rooms%ROWTYPE;
BEGIN
  IF _to <= _from THEN RAISE EXCEPTION 'to must be after from'; END IF;

  SELECT * INTO _room FROM public.rooms WHERE id = _room_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Room not found'; END IF;
  IF auth.uid() IS NULL OR NOT public.staynas_user_has_property_access(auth.uid(), _room.property_id) OR NOT public.staynas_current_user_has_property_role(_room.property_id, ARRAY['owner','manager','admin']::public.app_role[]) THEN RAISE EXCEPTION 'Forbidden'; END IF;

  _d := _from;
  WHILE _d < _to LOOP
    INSERT INTO public.room_inventory (room_id, date, available_units, is_blocked)
    VALUES (_room_id, _d, _room.total_units, _blocked)
    ON CONFLICT (room_id, date) DO UPDATE SET is_blocked = EXCLUDED.is_blocked, updated_at = now();
    _n := _n + 1;
    _d := _d + INTERVAL '1 day';
  END LOOP;

  PERFORM public.log_calendar_event(
    CASE WHEN _blocked THEN 'room.blocked' ELSE 'room.unblocked' END,
    _room_id, NULL, NULL, _from, _to,
    jsonb_build_object('reason', COALESCE(_reason,''))
  );
  RETURN _n;
END $function$;


CREATE OR REPLACE FUNCTION public.save_room_type_configuration(
  _property_id uuid,
  _id uuid,
  _slug text,
  _name text,
  _category_id uuid,
  _short_description text,
  _capacity_adults integer,
  _capacity_children integer,
  _max_occupancy integer,
  _total_units integer,
  _base_price numeric,
  _currency text,
  _included_guests integer,
  _extra_guest_fee numeric,
  _status text,
  _sort_order integer,
  _hero_line text DEFAULT NULL,
  _image_url text DEFAULT NULL,
  _gallery_urls text[] DEFAULT '{}',
  _size_label text DEFAULT NULL,
  _view_label text DEFAULT NULL,
  _bed_label text DEFAULT NULL,
  _bathroom_label text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  _room_id uuid;
  _old_units integer := 0;
  _remove_count integer := 0;
  _available integer := 0;
BEGIN
  IF auth.uid() IS NULL
     OR NOT public.staynas_user_has_property_access(auth.uid(), _property_id)
     OR NOT public.staynas_current_user_has_property_role(
       _property_id, ARRAY['owner','manager','admin']::public.app_role[]
     )
  THEN
    RAISE EXCEPTION 'Room configuration requires property manager access';
  END IF;

  IF _slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' THEN RAISE EXCEPTION 'Invalid room slug'; END IF;
  IF _name IS NULL OR btrim(_name) = '' THEN RAISE EXCEPTION 'Room name is required'; END IF;
  IF _total_units < 1 THEN RAISE EXCEPTION 'Room quantity must be at least 1'; END IF;
  IF _base_price < 0 OR _extra_guest_fee < 0 THEN RAISE EXCEPTION 'Pricing cannot be negative'; END IF;
  IF _capacity_adults < 1 OR _max_occupancy < _capacity_adults THEN RAISE EXCEPTION 'Invalid occupancy configuration'; END IF;
  IF _included_guests < 1 OR _included_guests > _max_occupancy THEN RAISE EXCEPTION 'Invalid included guest count'; END IF;
  IF _currency !~ '^[A-Z]{3}$' THEN RAISE EXCEPTION 'Currency must be a 3-letter ISO code'; END IF;

  IF _category_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.room_categories
    WHERE id = _category_id AND property_id = _property_id AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'Room category not found in the selected property';
  END IF;

  IF _id IS NULL THEN
    IF EXISTS (SELECT 1 FROM public.rooms WHERE property_id = _property_id AND slug = _slug) THEN
      RAISE EXCEPTION 'Room slug already exists in this property';
    END IF;

    INSERT INTO public.rooms (
      property_id, slug, name, category_id, short_description,
      capacity_adults, capacity_children, max_occupancy, total_units,
      base_price, currency, status, sort_order, included_guests, extra_guest_fee,
      hero_line, image_url, gallery_urls, size_label, view_label, bed_label, bathroom_label
    ) VALUES (
      _property_id, _slug, btrim(_name), _category_id, NULLIF(btrim(_short_description),''),
      _capacity_adults, _capacity_children, _max_occupancy, _total_units,
      _base_price, _currency, COALESCE(NULLIF(_status,''),'active'), COALESCE(_sort_order,0),
      _included_guests, _extra_guest_fee, NULLIF(btrim(_hero_line),''), NULLIF(btrim(_image_url),''),
      COALESCE(_gallery_urls,'{}'), NULLIF(btrim(_size_label),''), NULLIF(btrim(_view_label),''),
      NULLIF(btrim(_bed_label),''), NULLIF(btrim(_bathroom_label),'')
    )
    RETURNING id INTO _room_id;
  ELSE
    SELECT total_units INTO _old_units
    FROM public.rooms
    WHERE id = _id AND property_id = _property_id
    FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Room not found in selected property'; END IF;

    IF EXISTS (
      SELECT 1 FROM public.rooms
      WHERE property_id = _property_id AND slug = _slug AND id <> _id
    ) THEN
      RAISE EXCEPTION 'Room slug already exists in this property';
    END IF;

    UPDATE public.rooms SET
      slug = _slug, name = btrim(_name), category_id = _category_id,
      short_description = NULLIF(btrim(_short_description),''),
      capacity_adults = _capacity_adults, capacity_children = _capacity_children,
      max_occupancy = _max_occupancy, total_units = _total_units,
      base_price = _base_price, currency = _currency,
      status = COALESCE(NULLIF(_status,''),'active'), sort_order = COALESCE(_sort_order,0),
      included_guests = _included_guests, extra_guest_fee = _extra_guest_fee,
      hero_line = NULLIF(btrim(_hero_line),''), image_url = NULLIF(btrim(_image_url),''),
      gallery_urls = COALESCE(_gallery_urls,'{}'), size_label = NULLIF(btrim(_size_label),''),
      view_label = NULLIF(btrim(_view_label),''), bed_label = NULLIF(btrim(_bed_label),''),
      bathroom_label = NULLIF(btrim(_bathroom_label),'')
    WHERE id = _id AND property_id = _property_id
    RETURNING id INTO _room_id;
  END IF;

  IF _total_units > _old_units THEN
    INSERT INTO public.room_states(property_id, room_id, unit_label)
    SELECT _property_id, _room_id, _slug || '-' || lpad(gs::text,2,'0')
    FROM generate_series(GREATEST(_old_units,0)+1,_total_units) gs;
  ELSIF _total_units < _old_units THEN
    _remove_count := _old_units - _total_units;
    SELECT count(*) INTO _available
    FROM public.room_states
    WHERE property_id = _property_id AND room_id = _room_id
      AND booking_id IS NULL AND state IN ('vacant_clean','vacant_dirty');
    IF _available < _remove_count THEN
      RAISE EXCEPTION 'Cannot reduce quantity: protected physical room units are still in use';
    END IF;
    DELETE FROM public.room_states
    WHERE id IN (
      SELECT id FROM public.room_states
      WHERE property_id = _property_id AND room_id = _room_id
        AND booking_id IS NULL AND state IN ('vacant_clean','vacant_dirty')
      ORDER BY unit_label DESC LIMIT _remove_count
    );
  END IF;

  RETURN _room_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.save_room_type_configuration(
  uuid,uuid,text,text,uuid,text,integer,integer,integer,integer,numeric,text,integer,numeric,text,integer,text,text,text[],text,text,text,text
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_room_type_configuration(
  uuid,uuid,text,text,uuid,text,integer,integer,integer,integer,numeric,text,integer,numeric,text,integer,text,text,text[],text,text,text,text
) TO authenticated, service_role;

-- Retire the legacy global-role room configuration overload. Leaving it executable
-- would bypass the property-scoped contract introduced above.
REVOKE ALL ON FUNCTION public.save_room_type_configuration(
  uuid,text,text,uuid,text,integer,integer,integer,integer,numeric,text,integer,numeric,text,integer,text,text,text[],text,text,text,text
) FROM PUBLIC, anon, authenticated;

COMMIT;
