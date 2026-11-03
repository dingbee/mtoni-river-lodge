-- StayNas Finance P2-04 — enforce cash-refund ledger semantics.
-- A refund is a negative cash movement with a booking-matched currency and
-- an auditable reason. Provider status callbacks (including "reversed") are
-- intentionally not treated as cash refunds by this trigger.

begin;

create or replace function public.enforce_payment_refund_event_integrity()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_booking_currency text;
  v_reason text;
begin
  if new.event_type <> 'refund' then
    return new;
  end if;

  if new.amount is null or new.amount >= 0 then
    raise exception using errcode = '22023',
      message = 'A cash refund must be recorded as a negative ledger amount';
  end if;

  if new.booking_id is null then
    raise exception using errcode = '22023',
      message = 'A cash refund must reference a booking';
  end if;

  select upper(b.currency)
    into v_booking_currency
  from public.bookings b
  where b.id = new.booking_id;

  if not found then
    raise exception using errcode = '23503',
      message = 'Refund booking does not exist';
  end if;

  if nullif(upper(btrim(new.currency)), '') is distinct from v_booking_currency then
    raise exception using errcode = '22023',
      message = 'Refund currency must match the booking currency';
  end if;

  v_reason := nullif(btrim(coalesce(new.raw->>'note', '')), '');
  if v_reason is null then
    raise exception using errcode = '22023',
      message = 'A refund reason is required for the audit trail';
  end if;

  return new;
end;
$function$;

drop trigger if exists enforce_payment_refund_event_integrity
  on public.payment_events;

create trigger enforce_payment_refund_event_integrity
before insert or update of event_type, amount, currency, booking_id, raw
on public.payment_events
for each row
execute function public.enforce_payment_refund_event_integrity();

commit;
