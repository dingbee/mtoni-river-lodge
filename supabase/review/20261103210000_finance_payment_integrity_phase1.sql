-- StayNas Finance Phase 1 — atomic, property-scoped payment recording.
-- REVIEW ARTIFACT: intentionally outside supabase/migrations/ until reviewed.
-- No production data is modified by this file.

begin;

alter table public.payment_events
  add column if not exists idempotency_key text;

create unique index if not exists payment_events_booking_idempotency_uidx
  on public.payment_events (booking_id, idempotency_key)
  where idempotency_key is not null;

-- Keep privileges narrow: authenticated users can only update the four
-- financial summary columns used by the RPC, not arbitrary booking fields.
grant select on public.bookings to authenticated;
grant update (paid_amount, balance_amount, payment_status, payment_method, updated_at)
  on public.bookings to authenticated;
grant select, insert on public.payment_events to authenticated;
grant insert on public.activity_logs to authenticated;

-- Authenticated direct writes must not bypass the atomic RPC. The transaction-
-- local flag is set only inside record_booking_payment; service-role provider
-- callbacks retain their existing server-only path.
create or replace function public.enforce_finance_rpc_booking_update()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $trigger$
begin
  if (
    new.paid_amount is distinct from old.paid_amount
    or new.balance_amount is distinct from old.balance_amount
    or new.payment_status is distinct from old.payment_status
    or new.payment_method is distinct from old.payment_method
  ) and current_setting('staynas.payment_rpc', true) is distinct from 'on'
    and current_user <> 'service_role' then
    raise exception using errcode = '42501',
      message = 'Financial booking fields must be changed through the atomic payment RPC';
  end if;
  return new;
end;
$trigger$;

drop trigger if exists enforce_finance_rpc_booking_update on public.bookings;
create trigger enforce_finance_rpc_booking_update
before update of paid_amount, balance_amount, payment_status, payment_method
on public.bookings
for each row execute function public.enforce_finance_rpc_booking_update();

drop policy if exists "Finance staff insert payment events for accessible properties"
  on public.payment_events;
create policy "Finance staff insert payment events for accessible properties"
  on public.payment_events
  for insert to authenticated
  with check (
    booking_id is not null
    and exists (
      select 1
      from public.bookings b
      where b.id = payment_events.booking_id
        and public.staynas_user_has_property_access(auth.uid(), b.property_id)
    )
    and current_setting('staynas.payment_rpc', true) = 'on'
    and public.has_any_role(
      auth.uid(),
      array['owner','manager','finance']::public.app_role[]
    )
  );

drop policy if exists "Finance staff insert own payment audit logs"
  on public.activity_logs;
create policy "Finance staff insert own payment audit logs"
  on public.activity_logs
  for insert to authenticated
  with check (
    actor_id = auth.uid()
    and entity_type = 'booking'
    and module = 'finance.payments'
    and exists (
      select 1 from public.bookings b
      where b.id = activity_logs.entity_id
        and public.staynas_user_has_property_access(auth.uid(), b.property_id)
    )
    and current_setting('staynas.payment_rpc', true) = 'on'
    and public.has_any_role(
      auth.uid(),
      array['owner','manager','finance']::public.app_role[]
    )
  );

create or replace function public.record_booking_payment(
  _booking_id uuid,
  _amount numeric,
  _event_type text,
  _method text,
  _note text,
  _idempotency_key text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $function$
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
  if not public.has_any_role(
    v_actor, array['owner','manager','finance']::public.app_role[]
  ) then
    raise exception using errcode = '42501', message = 'Finance permission required';
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

  -- Restrict the transaction-local write context to this atomic RPC.
  perform set_config('staynas.payment_rpc', 'on', true);

  -- Retries with the same key and same payload return the original result.
  select e.* into v_event
  from public.payment_events e
  where e.booking_id = _booking_id
    and e.idempotency_key = _idempotency_key;

  if found then
    if v_event.event_type <> _event_type
       or v_event.amount <> case when _event_type = 'refund' then -_amount else _amount end
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

  v_signed_amount := case when _event_type = 'refund' then -_amount else _amount end;
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
      payment_method = _method,
      updated_at = now()
  where id = _booking_id;

  insert into public.activity_logs (
    actor_id, action, entity_type, entity_id, entity_label,
    module, metadata, severity
  ) values (
    v_actor, 'finance.' || _event_type, 'booking', _booking_id,
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

revoke all on function public.record_booking_payment(uuid,numeric,text,text,text,text) from public, anon;
grant execute on function public.record_booking_payment(uuid,numeric,text,text,text,text) to authenticated;

commit;
