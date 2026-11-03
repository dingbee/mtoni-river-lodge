-- StayNas Finance Phase 1B — atomic Pesapal settlement finalization.
-- Provider callbacks use the server-only service_role RPC. The browser-facing
-- authenticated payment RPC remains separate and property-scoped.

begin;

-- SECURITY DEFINER provider settlement must be recognized by the write guards
-- through the verified Supabase JWT role, not current_user (the definer owner).
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
    and coalesce(auth.role(), '') <> 'service_role' then
    raise exception using errcode = '42501',
      message = 'Financial booking fields must be changed through an authorized payment transaction';
  end if;
  return new;
end;
$trigger$;

create or replace function public.enforce_finance_payment_audit_context()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $trigger$
begin
  if (new.module = 'finance.payments' or new.action like 'finance.%')
     and coalesce(auth.role(), '') <> 'service_role' then
    if current_setting('staynas.payment_rpc', true) is distinct from 'on' then
      raise exception using errcode = '42501',
        message = 'Finance payment audit rows must be written by the atomic payment RPC';
    end if;
    if new.actor_id is distinct from auth.uid()
       or new.entity_type <> 'booking'
       or not public.has_any_role(
         auth.uid(), array['owner','manager','finance']::public.app_role[]
       )
       or not exists (
         select 1 from public.bookings b
         where b.id = new.entity_id
           and public.staynas_user_has_property_access(auth.uid(), b.property_id)
       ) then
      raise exception using errcode = '42501',
        message = 'Finance audit actor or property scope is invalid';
    end if;
  end if;
  return new;
end;
$trigger$;

create or replace function public.finalize_pesapal_payment(
  _booking_id uuid,
  _order_tracking_id text,
  _amount numeric,
  _currency text,
  _method text,
  _source text,
  _invoice_number text,
  _raw jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_booking public.bookings%rowtype;
  v_event public.payment_events%rowtype;
  v_key text;
  v_paid numeric(14,2);
  v_balance numeric(14,2);
  v_status public.payment_status;
  v_method text := nullif(btrim(_method), '');
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception using errcode = '42501',
      message = 'Pesapal settlement is restricted to the server service role';
  end if;
  if _booking_id is null
     or nullif(btrim(_order_tracking_id), '') is null
     or length(_order_tracking_id) > 128 then
    raise exception using errcode = '22023', message = 'Invalid booking or Pesapal tracking reference';
  end if;
  if _amount is null or _amount <= 0 or _amount <> round(_amount, 2) then
    raise exception using errcode = '22023', message = 'Pesapal amount must be positive and limited to two decimal places';
  end if;
  if nullif(btrim(_currency), '') is null or length(_currency) <> 3 then
    raise exception using errcode = '22023', message = 'A valid ISO currency code is required';
  end if;
  if _source not in ('ipn','status_check') then
    raise exception using errcode = '22023', message = 'Unsupported Pesapal settlement source';
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

  v_key := 'pesapal:' || _order_tracking_id || ':completed';

  select e.* into v_event
  from public.payment_events e
  where e.booking_id = _booking_id
    and e.idempotency_key = v_key;

  if found then
    if v_event.provider <> 'pesapal'
       or v_event.amount <> _amount
       or upper(coalesce(v_event.currency,'')) <> upper(_currency)
       or coalesce(v_event.order_tracking_id,'') <> _order_tracking_id then
      raise exception using errcode = '23505',
        message = 'Pesapal idempotency key was reused with a different settlement payload';
    end if;
    return jsonb_build_object(
      'ok', true, 'duplicate', true, 'event_id', v_event.id,
      'paid_amount', coalesce(v_booking.paid_amount,0),
      'balance_amount', v_booking.balance_amount,
      'payment_status', v_booking.payment_status
    );
  end if;

  if v_booking.payment_status in ('paid','deposit_paid') then
    return jsonb_build_object(
      'ok', true, 'duplicate', true, 'event_id', null,
      'paid_amount', coalesce(v_booking.paid_amount,0),
      'balance_amount', v_booking.balance_amount,
      'payment_status', v_booking.payment_status
    );
  end if;

  if round(coalesce(v_booking.deposit_amount,0),2) <> round(_amount,2)
     or upper(coalesce(v_booking.currency,'')) <> upper(_currency) then
    raise exception using errcode = '22023',
      message = 'Pesapal settlement does not match the booking deposit and currency';
  end if;

  v_paid := round(coalesce(v_booking.paid_amount,0) + _amount, 2);
  if v_paid > v_booking.total then
    raise exception using errcode = '22023',
      message = 'Pesapal settlement exceeds the outstanding booking amount';
  end if;

  v_balance := greatest(0, round(v_booking.total - v_paid, 2));
  if v_paid >= v_booking.total then
    v_status := 'paid';
  elsif v_paid >= v_booking.deposit_amount then
    v_status := 'deposit_paid';
  else
    v_status := 'unpaid';
  end if;

  perform set_config('staynas.payment_rpc', 'on', true);

  insert into public.payment_events (
    booking_id, provider, event_type, amount, currency,
    payment_method, order_tracking_id, merchant_reference,
    idempotency_key, raw
  ) values (
    _booking_id, 'pesapal', 'payment_completed', _amount, upper(_currency),
    v_method, _order_tracking_id, v_booking.pesapal_merchant_reference,
    v_key, coalesce(_raw, '{}'::jsonb)
  )
  returning * into v_event;

  update public.bookings
  set paid_amount = v_paid,
      balance_amount = v_balance,
      payment_status = v_status,
      payment_method = coalesce(v_method, payment_method),
      payment_completed_at = now(),
      confirmed_at = coalesce(confirmed_at, now()),
      invoice_number = coalesce(invoice_number, nullif(_invoice_number,''))
  where id = _booking_id;

  return jsonb_build_object(
    'ok', true, 'duplicate', false, 'event_id', v_event.id,
    'paid_amount', v_paid, 'balance_amount', v_balance,
    'payment_status', v_status
  );
end;
$function$;

revoke all on function public.finalize_pesapal_payment(uuid,text,numeric,text,text,text,text,jsonb)
  from public, anon, authenticated;
grant execute on function public.finalize_pesapal_payment(uuid,text,numeric,text,text,text,text,jsonb)
  to service_role;

commit;
