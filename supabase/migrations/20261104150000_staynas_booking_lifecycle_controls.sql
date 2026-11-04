-- Keep confirmation's existing room-preparation side effect inside the property boundary.
create or replace function public.handle_booking_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_event text;
begin
  if new.status is distinct from old.status then
    v_event := 'status_' || new.status::text;
    update public.guest_threads
      set timeline = timeline || jsonb_build_object(
        'at', now(), 'type', v_event,
        'message', 'Status changed: ' || old.status || ' → ' || new.status),
        last_updated = now()
      where booking_id = new.id;
    insert into public.pending_notifications (booking_id, event_type, payload)
    values (new.id, v_event, jsonb_build_object('from', old.status, 'to', new.status));

    if new.status::text = 'confirmed' then
      insert into public.ops_tasks (property_id, booking_id, task_type, title, description, due_at, priority)
      values (new.property_id, new.id, 'room_prep',
        'Prepare room for ' || new.guest_name,
        'Check-in on ' || new.check_in,
        (new.check_in - interval '1 day')::timestamptz, 2);
    end if;
  end if;

  if new.payment_status is distinct from old.payment_status then
    v_event := 'payment_' || new.payment_status::text;
    update public.guest_threads
      set timeline = timeline || jsonb_build_object(
        'at', now(), 'type', v_event,
        'message', 'Payment ' || old.payment_status || ' → ' || new.payment_status),
        last_updated = now()
      where booking_id = new.id;
    insert into public.pending_notifications (booking_id, event_type, payload)
    values (new.id, v_event, jsonb_build_object('from', old.payment_status, 'to', new.payment_status));
  end if;

  return new;
end;
$function$;

-- StayNas Phase 3: Booking Lifecycle Controls
-- One database-enforced transition contract for every booking status writer.
begin;

create or replace function public.staynas_enforce_booking_lifecycle()
returns trigger
language plpgsql
security invoker
set search_path = public
as $function$
declare
  v_actor uuid := auth.uid();
begin
  if new.status is not distinct from old.status then
    return new;
  end if;

  if new.status::text = 'confirmed' then
    if old.status::text <> 'pending'
      or (v_actor is not null and not public.has_any_role(v_actor, array['owner','manager','admin','reservations','reception']::public.app_role[])) then
      raise exception using errcode = '42501', message = 'Only authorized reservations staff may confirm a pending booking';
    end if;
    new.confirmed_at := coalesce(new.confirmed_at, now());
  elsif new.status::text = 'checked_in' then
    if old.status::text <> 'confirmed'
      or (v_actor is not null and not public.has_any_role(v_actor, array['owner','manager','admin','reception']::public.app_role[])) then
      raise exception using errcode = '42501', message = 'Only front-desk staff may check in a confirmed booking';
    end if;
    new.checked_in_at := coalesce(new.checked_in_at, now());
  elsif new.status::text = 'completed' then
    if old.status::text <> 'checked_in'
      or (v_actor is not null and not public.has_any_role(v_actor, array['owner','manager','admin','reception']::public.app_role[])) then
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
      or (v_actor is not null and not public.has_any_role(v_actor, array['owner','manager','admin','reservations']::public.app_role[])) then
      raise exception using errcode = '42501', message = 'Cancellation is permitted only for pending or confirmed bookings by reservations managers';
    end if;
    new.cancelled_at := coalesce(new.cancelled_at, now());
  elsif new.status::text = 'no_show' then
    if old.status::text <> 'confirmed'
      or (now() at time zone coalesce((select sp.timezone from public.staynas_properties sp where sp.id = old.property_id), 'Africa/Dar_es_Salaam'))::date <= old.check_in
      or (v_actor is not null and not public.has_any_role(v_actor, array['owner','manager','admin','reservations']::public.app_role[])) then
      raise exception using errcode = '42501', message = 'No-show requires an unarrived confirmed booking after its check-in date and reservations authorization';
    end if;
  else
    raise exception using errcode = '22023', message = 'Unsupported booking lifecycle transition';
  end if;

  return new;
end;
$function$;

drop trigger if exists staynas_booking_lifecycle_guard on public.bookings;
create trigger staynas_booking_lifecycle_guard
before update of status on public.bookings
for each row execute function public.staynas_enforce_booking_lifecycle();

create or replace function public.staynas_transition_booking(
  _booking_id uuid,
  _target_status text,
  _notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_actor uuid := auth.uid();
  v_booking public.bookings%rowtype;
  v_room_state public.room_states%rowtype;
  v_room_count integer := 0;
  v_previous_status text;
begin
  if v_actor is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;
  if _booking_id is null or _target_status not in ('confirmed','checked_in','completed','cancelled','no_show') then
    raise exception using errcode = '22023', message = 'Invalid booking lifecycle request';
  end if;
  if _notes is not null and length(_notes) > 1000 then
    raise exception using errcode = '22023', message = 'Lifecycle notes must not exceed 1000 characters';
  end if;

  select b.* into v_booking
  from public.bookings b
  where b.id = _booking_id
  for update;
  if not found or not public.staynas_user_has_property_access(v_actor, v_booking.property_id) then
    raise exception using errcode = '42501', message = 'Booking not found or property access denied';
  end if;

  v_previous_status := v_booking.status::text;

  if v_booking.status::text = _target_status then
    return jsonb_build_object('ok', true, 'duplicate', true, 'booking_id', v_booking.id, 'status', v_booking.status::text);
  end if;

  -- Enforce the exact transition graph before any side effects.
  if not (
    (v_booking.status::text = 'pending' and _target_status in ('confirmed','cancelled')) or
    (v_booking.status::text = 'confirmed' and _target_status in ('checked_in','cancelled','no_show')) or
    (v_booking.status::text = 'checked_in' and _target_status = 'completed')
  ) then
    raise exception using errcode = '22023',
      message = format('Invalid booking transition: %s -> %s', v_booking.status::text, _target_status);
  end if;

  if _target_status = 'no_show' and (now() at time zone coalesce((select sp.timezone from public.staynas_properties sp where sp.id = v_booking.property_id), 'Africa/Dar_es_Salaam'))::date <= v_booking.check_in then
    raise exception using errcode = '22023', message = 'No-show can be recorded only after the scheduled check-in date';
  end if;

  if _target_status = 'checked_in' then
    select count(*) into v_room_count from public.room_states rs where rs.room_id = v_booking.room_id;
    select rs.* into v_room_state
    from public.room_states rs
    where rs.room_id = v_booking.room_id
      and rs.state in ('vacant_clean','reserved','inspection')
      and (rs.booking_id = v_booking.id or rs.booking_id is null)
    order by (rs.booking_id = v_booking.id) desc, rs.unit_label
    limit 1
    for update skip locked;

    if v_room_count > 0 and v_room_state.id is null then
      raise exception using errcode = '55000', message = 'No eligible physical room unit is available for check-in';
    end if;
  end if;

  update public.bookings
  set status = _target_status::public.booking_status,
      notes = case when nullif(btrim(_notes),'') is null then notes
                   else concat_ws(E'\n', notes, '[' || _target_status || ' ' || now()::text || '] ' || btrim(_notes)) end
  where id = _booking_id
  returning * into v_booking;

  if _target_status = 'checked_in' and v_room_state.id is not null then
    update public.room_states
    set state = 'occupied', booking_id = v_booking.id, updated_by = v_actor
    where id = v_room_state.id;
  elsif _target_status = 'completed' then
    select rs.* into v_room_state
    from public.room_states rs
    where rs.booking_id = v_booking.id
    order by rs.unit_label
    limit 1
    for update;

    if v_room_state.id is not null then
      update public.room_states
      set state = 'vacant_dirty', booking_id = null, updated_by = v_actor
      where id = v_room_state.id;

      insert into public.ops_tasks (
        property_id, booking_id, room_state_id, task_type, category, title, priority, status, due_at
      ) values (
        v_booking.property_id, v_booking.id, v_room_state.id, 'housekeeping', 'housekeeping',
        'Clean ' || v_room_state.unit_label || ' after ' || v_booking.guest_name,
        2, 'pending', now() + interval '3 hours'
      );
    end if;
  elsif _target_status in ('cancelled','no_show') then
    update public.room_states
    set state = case when state = 'reserved' then 'vacant_clean' else state end,
        booking_id = null, updated_by = v_actor
    where booking_id = v_booking.id and state = 'reserved';
  end if;

  insert into public.activity_logs (
    actor_id, action, entity_type, entity_id, entity_label, module, metadata, severity
  ) values (
    v_actor, 'reservation.status_changed', 'booking', v_booking.id, v_booking.reference,
    'reservations',
    jsonb_build_object('from', v_previous_status, 'to', _target_status,
                       'notes', nullif(btrim(_notes),''), 'property_id', v_booking.property_id),
    'audit'
  );

  return jsonb_build_object('ok', true, 'duplicate', false, 'booking_id', v_booking.id, 'status', _target_status);
end;
$function$;

revoke all on function public.staynas_transition_booking(uuid,text,text) from public, anon;
grant execute on function public.staynas_transition_booking(uuid,text,text) to authenticated;

commit;
