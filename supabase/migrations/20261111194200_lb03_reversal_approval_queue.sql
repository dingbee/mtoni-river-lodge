-- LB-03.03 — hotel-side pending reversal approval queue, scoped to property membership.
BEGIN;
CREATE OR REPLACE FUNCTION public.lb03_list_pending_room_charge_reversals()
RETURNS TABLE(
 request_id uuid,operation_id uuid,property_id uuid,pos_transaction_id uuid,
 posting_reference text,amount numeric,currency text,reason_code text,reason text,requested_at timestamptz
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public
AS $lb03$
DECLARE v_actor uuid:=auth.uid();
BEGIN
 IF v_actor IS NULL THEN RAISE EXCEPTION 'Hotel staff authentication required' USING ERRCODE='42501'; END IF;
 RETURN QUERY
 SELECT r.id,r.operation_id,b.property_id,o.pos_transaction_id,o.posting_reference,
  r.amount,o.currency,r.reason_code,r.reason,r.requested_at
 FROM public.lb03_room_charge_reversal_requests r
 JOIN public.lb03_room_charge_operations o ON o.id=r.operation_id
 JOIN public.bookings b ON b.id=o.booking_id
 JOIN public.staynas_property_members m ON m.property_id=b.property_id
 WHERE r.state='PENDING_APPROVAL' AND m.user_id=v_actor AND m.status='active'
  AND m.role IN ('owner','manager','admin','finance','reception')
 ORDER BY r.requested_at ASC;
END;
$lb03$;
REVOKE ALL ON FUNCTION public.lb03_list_pending_room_charge_reversals() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.lb03_list_pending_room_charge_reversals() TO authenticated;
COMMIT;
