-- StayNas Finance P2-04: linked, atomic refunds.
-- A refund must reference the successful payment event being refunded. Provider
-- reversal notifications are not cash refunds and never reduce paid_amount.

begin;

alter table public.payment_events
  add column if not exists reverses_event_id uuid
    references public.payment_events(id) on delete restrict;

alter table public.payment_events
  add column if not exists provider_reverses_event_id uuid
    references public.payment_events(id) on delete restrict;

create index if not exists payment_events_reverses_event_idx
  on public.payment_events (reverses_event_id)
  where reverses_event_id is not null;

-- Prevent the legacy general payment RPC from creating unlinked refunds.
-- A refund event must identify the original successful payment event.
create or replace function public.enforce_linked_refund_event()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $trigger$
begin
  if new.event_type = 'refund' and new.reverses_event_id is null then
    raise exception using errcode = '22023',
      message = 'Refund events must reference the original payment event';
  end if;
  if new.reverses_event_id is not null and new.event_type <> 'refund' then
    raise exception using errcode = '22023',
      message = 'Only refund events may reference an original payment event';
  end if;
  return new;
end;
$trigger$;

drop trigger if exists enforce_linked_refund_event on public.payment_events;
create trigger enforce_linked_refund_event
before insert or update of event_type, reverses_event_id
on public.payment_events
for each row execute function public.enforce_linked_refund_event();

create or replace function public.record_booking_refund(
  _booking_id uuid,
  _payment_event_id uuid,
  _amount numeric,
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
  if not public.has_any_role(v_actor, array['owner','manager','finance']::public.app_role[]) then
    raise exception using errcode = '42501', message = 'Finance permission required';
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
    actor_id, action, entity_type, entity_id, entity_label, module, metadata, severity
  ) values (
    v_actor, 'finance.refund', 'booking', _booking_id, v_booking.reference, 'finance.payments',
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

revoke all on function public.record_booking_refund(uuid,uuid,numeric,text,text,text) from public, anon;
grant execute on function public.record_booking_refund(uuid,uuid,numeric,text,text,text) to authenticated;

commit;
