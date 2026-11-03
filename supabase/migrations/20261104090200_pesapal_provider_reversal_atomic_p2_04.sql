-- StayNas Finance P2-04 — atomic Pesapal provider reversal.
-- Provider reversals are distinct from operator-issued cash refunds. They link
-- to the original Pesapal settlement and reverse booking balances atomically.

begin;

create unique index if not exists payment_events_provider_reversal_once_idx
  on public.payment_events (provider_reverses_event_id)
  where provider_reverses_event_id is not null;

create index if not exists payment_events_provider_reversal_booking_idx
  on public.payment_events (booking_id, order_tracking_id)
  where event_type = 'provider_reversal';

create or replace function public.finalize_pesapal_reversal(
  _booking_id uuid,
  _order_tracking_id text,
  _amount numeric,
  _currency text,
  _source text,
  _raw jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_booking public.bookings%rowtype;
  v_payment public.payment_events%rowtype;
  v_existing public.payment_events%rowtype;
  v_reversal public.payment_events%rowtype;
  v_paid numeric(14,2);
  v_balance numeric(14,2);
  v_status public.payment_status;
  v_key text;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception using errcode = '42501',
      message = 'Pesapal reversal is restricted to the server service role';
  end if;
  if _booking_id is null
     or nullif(btrim(_order_tracking_id), '') is null
     or length(_order_tracking_id) > 128 then
    raise exception using errcode = '22023',
      message = 'Invalid booking or Pesapal tracking reference';
  end if;
  if _amount is null or _amount <= 0 or _amount <> round(_amount, 2) then
    raise exception using errcode = '22023',
      message = 'Pesapal reversal amount must be positive and limited to two decimal places';
  end if;
  if nullif(btrim(_currency), '') is null or length(_currency) <> 3 then
    raise exception using errcode = '22023',
      message = 'A valid ISO currency code is required for Pesapal reversal';
  end if;
  if _source not in ('ipn','status_check') then
    raise exception using errcode = '22023',
      message = 'Unsupported Pesapal reversal source';
  end if;

  select b.* into v_booking
  from public.bookings b
  where b.id = _booking_id
    and b.pesapal_order_tracking_id = _order_tracking_id
  for update;
  if not found then
    raise exception using errcode = '42501',
      message = 'Booking and Pesapal tracking reference do not match';
  end if;

  select e.* into v_payment
  from public.payment_events e
  where e.booking_id = _booking_id
    and e.provider = 'pesapal'
    and e.event_type = 'payment_completed'
    and e.order_tracking_id = _order_tracking_id
    and e.amount > 0
  for update;
  if not found then
    raise exception using errcode = '22023',
      message = 'No successful Pesapal settlement exists to reverse';
  end if;
  if round(v_payment.amount,2) <> round(_amount,2)
     or upper(coalesce(v_payment.currency,'')) <> upper(_currency)
     or upper(coalesce(v_booking.currency,'')) <> upper(_currency) then
    raise exception using errcode = '22023',
      message = 'Pesapal reversal amount or currency does not match the original settlement';
  end if;

  v_key := 'pesapal:' || _order_tracking_id || ':reversed';
  select e.* into v_existing
  from public.payment_events e
  where e.booking_id = _booking_id
    and e.idempotency_key = v_key;
  if found then
    if v_existing.event_type <> 'provider_reversal'
       or v_existing.provider_reverses_event_id is distinct from v_payment.id
       or round(abs(v_existing.amount),2) <> round(_amount,2)
       or upper(coalesce(v_existing.currency,'')) <> upper(_currency) then
      raise exception using errcode = '23505',
        message = 'Pesapal reversal idempotency key was reused with a different payload';
    end if;
    return jsonb_build_object(
      'ok', true, 'duplicate', true, 'event_id', v_existing.id,
      'paid_amount', coalesce(v_booking.paid_amount,0),
      'balance_amount', v_booking.balance_amount,
      'payment_status', v_booking.payment_status
    );
  end if;

  if exists (
    select 1 from public.payment_events e
    where e.provider_reverses_event_id = v_payment.id
  ) then
    raise exception using errcode = '23505',
      message = 'The original Pesapal settlement has already been reversed';
  end if;

  if exists (
    select 1 from public.payment_events e
    where e.event_type = 'refund'
      and e.reverses_event_id = v_payment.id
  ) then
    raise exception using errcode = '55000',
      message = 'The Pesapal settlement has a cash refund; provider reversal requires manual reconciliation';
  end if;

  v_paid := round(coalesce(v_booking.paid_amount,0) - v_payment.amount, 2);
  if v_paid < 0 then
    raise exception using errcode = '55000',
      message = 'Pesapal reversal would make booking net paid negative; manual reconciliation is required';
  end if;

  v_balance := greatest(0, round(v_booking.total - v_paid, 2));
  if v_paid = 0 then
    v_status := 'unpaid';
  elsif v_paid >= v_booking.total then
    v_status := 'paid';
  elsif v_paid >= coalesce(v_booking.deposit_amount,0) then
    v_status := 'deposit_paid';
  else
    v_status := 'unpaid';
  end if;

  perform set_config('staynas.payment_rpc', 'on', true);

  insert into public.payment_events (
    booking_id, provider, event_type, amount, currency, order_tracking_id,
    status_code, idempotency_key, provider_reverses_event_id, raw
  ) values (
    _booking_id, 'pesapal', 'provider_reversal', -v_payment.amount,
    upper(v_booking.currency), _order_tracking_id, 3, v_key,
    v_payment.id,
    coalesce(_raw, '{}'::jsonb) || jsonb_build_object(
      'source', _source,
      'original_payment_event_id', v_payment.id,
      'reversal_amount', _amount,
      'reversal_currency', upper(_currency)
    )
  ) returning * into v_reversal;

  update public.bookings
  set paid_amount = v_paid,
      balance_amount = v_balance,
      payment_status = v_status
  where id = _booking_id;

  return jsonb_build_object(
    'ok', true, 'duplicate', false, 'event_id', v_reversal.id,
    'paid_amount', v_paid, 'balance_amount', v_balance,
    'payment_status', v_status
  );
end;
$function$;

revoke all on function public.finalize_pesapal_reversal(uuid,text,numeric,text,text,jsonb)
  from public, anon, authenticated;
grant execute on function public.finalize_pesapal_reversal(uuid,text,numeric,text,text,jsonb)
  to service_role;

commit;
