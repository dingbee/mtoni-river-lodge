-- LB-03.02 — controlled reversal requests and hotel-approved compensating folio credits.
-- The adjustment is an append-only extension of the existing PMS folio, not a parallel folio.
BEGIN;

CREATE TABLE IF NOT EXISTS public.pms_folio_adjustments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 booking_id uuid NOT NULL REFERENCES public.bookings(id) ON DELETE RESTRICT,
 source_posting_id uuid NOT NULL REFERENCES public.pms_folio_postings(id) ON DELETE RESTRICT,
 adjustment_reference text NOT NULL UNIQUE,
 idempotency_key text NOT NULL UNIQUE,
 adjustment_type text NOT NULL CHECK(adjustment_type='credit'),
 amount numeric(14,2) NOT NULL CHECK(amount>0 AND amount=round(amount,2)),
 currency text NOT NULL CHECK(currency ~ '^[A-Z]{3}$'),
 source_system text NOT NULL CHECK(source_system='lexibite'),
 source_transaction_id uuid NOT NULL,
 reason_code text NOT NULL,
 approved_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
 approved_at timestamptz NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK(jsonb_typeof(metadata)='object')
);
CREATE INDEX IF NOT EXISTS pms_folio_adjustments_booking_idx
 ON public.pms_folio_adjustments(booking_id,created_at DESC);
ALTER TABLE public.pms_folio_adjustments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.pms_folio_adjustments FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.pms_folio_adjustments TO service_role;
DROP TRIGGER IF EXISTS pms_folio_adjustments_immutable ON public.pms_folio_adjustments;
CREATE TRIGGER pms_folio_adjustments_immutable BEFORE UPDATE OR DELETE ON public.pms_folio_adjustments
 FOR EACH ROW EXECUTE FUNCTION public.lb03_reject_audit_mutation();

CREATE TABLE IF NOT EXISTS public.lb03_room_charge_reversal_requests (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 operation_id uuid NOT NULL REFERENCES public.lb03_room_charge_operations(id) ON DELETE RESTRICT,
 idempotency_key text NOT NULL CHECK(length(idempotency_key) BETWEEN 8 AND 200),
 request_fingerprint text NOT NULL CHECK(request_fingerprint ~ '^[a-f0-9]{64}$'),
 amount numeric(14,2) NOT NULL CHECK(amount>0 AND amount=round(amount,2)),
 reason_code text NOT NULL CHECK(reason_code IN ('pos_void','incorrect_amount','duplicate_charge','guest_dispute','service_recovery','other')),
 reason text NOT NULL CHECK(length(btrim(reason)) BETWEEN 3 AND 500),
 requested_by_product text NOT NULL CHECK(requested_by_product='lexibite'),
 state text NOT NULL DEFAULT 'PENDING_APPROVAL' CHECK(state IN ('PENDING_APPROVAL','REJECTED','APPROVED','POSTED')),
 requested_at timestamptz NOT NULL DEFAULT now(),
 approved_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
 approved_at timestamptz,
 adjustment_id uuid REFERENCES public.pms_folio_adjustments(id) ON DELETE RESTRICT,
 created_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT lb03_reversal_idempotency_uq UNIQUE(operation_id,idempotency_key)
);
CREATE UNIQUE INDEX IF NOT EXISTS lb03_one_pending_reversal_per_operation
 ON public.lb03_room_charge_reversal_requests(operation_id) WHERE state='PENDING_APPROVAL';
ALTER TABLE public.lb03_room_charge_reversal_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.lb03_room_charge_reversal_requests FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.lb03_room_charge_reversal_requests TO service_role;

CREATE OR REPLACE FUNCTION public.lb03_request_room_charge_reversal(
 _connection_id uuid,_posting_reference text,_idempotency_key text,_amount numeric,
 _reason_code text,_reason text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public
AS $lb03$
DECLARE
 v_op public.lb03_room_charge_operations%ROWTYPE;
 v_req public.lb03_room_charge_reversal_requests%ROWTYPE;
 v_fp text;
BEGIN
 IF coalesce(auth.role(),'')<>'service_role' THEN
  RAISE EXCEPTION 'Service authentication required' USING ERRCODE='42501';
 END IF;
 IF _amount IS NULL OR _amount<=0 OR _amount<>round(_amount,2)
  OR _reason_code IS NULL OR _reason_code NOT IN ('pos_void','incorrect_amount','duplicate_charge','guest_dispute','service_recovery','other')
  OR length(btrim(coalesce(_reason,''))) NOT BETWEEN 3 AND 500
  OR length(coalesce(_idempotency_key,'')) NOT BETWEEN 8 AND 200
 THEN RAISE EXCEPTION 'Invalid reversal request' USING ERRCODE='22023'; END IF;

 SELECT * INTO v_op FROM public.lb03_room_charge_operations
  WHERE connection_id=_connection_id AND posting_reference=_posting_reference FOR UPDATE;
 IF NOT FOUND OR v_op.state NOT IN ('POSTED','PARTIALLY_REVERSED') THEN
  RAISE EXCEPTION 'Original folio posting is not eligible for reversal' USING ERRCODE='22023';
 END IF;
 v_fp:=encode(extensions.digest(jsonb_build_object(
  'operationId',v_op.id,'amount',_amount,'reasonCode',_reason_code,'reason',btrim(_reason)
 )::text,'sha256'),'hex');
 SELECT * INTO v_req FROM public.lb03_room_charge_reversal_requests
  WHERE operation_id=v_op.id AND idempotency_key=_idempotency_key FOR UPDATE;
 IF FOUND THEN
  IF v_req.request_fingerprint<>v_fp THEN
   RAISE EXCEPTION 'Reversal idempotency conflict' USING ERRCODE='23505';
  END IF;
  RETURN jsonb_build_object('status',v_req.state,'requestId',v_req.id,'duplicate',true);
 END IF;
 IF _amount>v_op.amount-v_op.reversed_amount THEN
  RAISE EXCEPTION 'Reversal amount exceeds the unreversed original posting' USING ERRCODE='22023';
 END IF;

 INSERT INTO public.lb03_room_charge_reversal_requests(
  operation_id,idempotency_key,request_fingerprint,amount,reason_code,reason,requested_by_product
 ) VALUES(v_op.id,_idempotency_key,v_fp,_amount,_reason_code,btrim(_reason),'lexibite')
 RETURNING * INTO v_req;
 UPDATE public.lb03_room_charge_operations SET state='REVERSAL_PENDING',updated_at=now() WHERE id=v_op.id;
 INSERT INTO public.lb03_room_charge_audit(operation_id,event_type,prior_state,next_state,actor_product,correlation_id,evidence)
 VALUES(v_op.id,'room_charge.reversal_requested',v_op.state,'REVERSAL_PENDING','lexibite',v_op.correlation_id,
  jsonb_build_object('reversalRequestId',v_req.id,'amount',_amount,'reasonCode',_reason_code));
 RETURN jsonb_build_object('status','PENDING_APPROVAL','requestId',v_req.id,'duplicate',false);
END;
$lb03$;

CREATE OR REPLACE FUNCTION public.lb03_approve_room_charge_reversal(_request_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public
AS $lb03$
DECLARE
 v_actor uuid:=auth.uid();
 v_req public.lb03_room_charge_reversal_requests%ROWTYPE;
 v_op public.lb03_room_charge_operations%ROWTYPE;
 v_booking public.bookings%ROWTYPE;
 v_adjustment public.pms_folio_adjustments%ROWTYPE;
 v_ref text;
 v_role public.app_role;
BEGIN
 IF v_actor IS NULL THEN RAISE EXCEPTION 'Hotel staff authentication required' USING ERRCODE='42501'; END IF;
 SELECT * INTO v_req FROM public.lb03_room_charge_reversal_requests WHERE id=_request_id FOR UPDATE;
 IF NOT FOUND OR v_req.state<>'PENDING_APPROVAL' THEN
  RAISE EXCEPTION 'Reversal request is not awaiting approval' USING ERRCODE='55000';
 END IF;
 SELECT * INTO v_op FROM public.lb03_room_charge_operations WHERE id=v_req.operation_id FOR UPDATE;
 SELECT * INTO v_booking FROM public.bookings WHERE id=v_op.booking_id FOR UPDATE;
 SELECT m.role INTO v_role FROM public.staynas_property_members m
  WHERE m.user_id=v_actor AND m.property_id=v_booking.property_id AND m.status='active'
   AND m.role IN ('owner','manager','admin','finance','reception') LIMIT 1;
 IF v_role IS NULL THEN
  RAISE EXCEPTION 'Hotel finance/front-office approval permission required' USING ERRCODE='42501';
 END IF;
 IF v_op.state<>'REVERSAL_PENDING' OR v_req.amount>v_op.amount-v_op.reversed_amount THEN
  RAISE EXCEPTION 'Reversal is no longer eligible' USING ERRCODE='22023';
 END IF;

 v_ref:='ADJ-LB03-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,20));
 INSERT INTO public.pms_folio_adjustments(
  booking_id,source_posting_id,adjustment_reference,idempotency_key,adjustment_type,
  amount,currency,source_system,source_transaction_id,reason_code,approved_by,approved_at,metadata
 ) VALUES(
  v_op.booking_id,v_op.posting_id,v_ref,'lb03-reversal:'||v_req.id::text,'credit',
  v_req.amount,v_op.currency,'lexibite',v_op.pos_transaction_id,v_req.reason_code,
  v_actor,clock_timestamp(),jsonb_build_object('lb03OperationId',v_op.id,
   'reversalRequestId',v_req.id,'originalPostingReference',v_op.posting_reference,'reason',v_req.reason)
 ) RETURNING * INTO v_adjustment;

 UPDATE public.bookings SET
  total=greatest(0,total-v_req.amount),
  extras_total=greatest(0,extras_total-v_req.amount),
  balance_due=greatest(0,balance_due-v_req.amount),
  balance_amount=greatest(0,balance_amount-v_req.amount),
  updated_at=now()
 WHERE id=v_booking.id;

 UPDATE public.lb03_room_charge_operations SET
  reversed_amount=reversed_amount+v_req.amount,
  state=CASE WHEN reversed_amount+v_req.amount>=amount THEN 'REVERSED' ELSE 'PARTIALLY_REVERSED' END,
  reversal_reference=v_ref,reversed_at=clock_timestamp(),updated_at=now()
 WHERE id=v_op.id RETURNING * INTO v_op;

 UPDATE public.lb03_room_charge_reversal_requests SET state='POSTED',approved_by=v_actor,
  approved_at=clock_timestamp(),adjustment_id=v_adjustment.id WHERE id=v_req.id;
 INSERT INTO public.lb03_room_charge_audit(operation_id,event_type,prior_state,next_state,actor_product,actor_id,correlation_id,evidence)
 VALUES(v_op.id,'room_charge.reversal_approved_and_posted','REVERSAL_PENDING',v_op.state,'staynAS',v_actor,
  v_op.correlation_id,jsonb_build_object('adjustmentId',v_adjustment.id,'adjustmentReference',v_ref,
   'amount',v_req.amount,'currency',v_op.currency,'approverRole',v_role));
 RETURN jsonb_build_object('status',v_op.state,'adjustmentId',v_adjustment.id,
  'adjustmentReference',v_ref,'amount',v_req.amount,'currency',v_op.currency,'approvedBy',v_actor);
END;
$lb03$;

CREATE OR REPLACE FUNCTION public.lb03_reject_room_charge_reversal(_request_id uuid,_reason text)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public
AS $lb03$
DECLARE
 v_actor uuid:=auth.uid();
 v_req public.lb03_room_charge_reversal_requests%ROWTYPE;
 v_op public.lb03_room_charge_operations%ROWTYPE;
 v_booking public.bookings%ROWTYPE;
 v_role public.app_role;
 v_next text;
BEGIN
 IF v_actor IS NULL OR length(btrim(coalesce(_reason,''))) NOT BETWEEN 3 AND 500 THEN
  RAISE EXCEPTION 'Authenticated hotel actor and rejection reason required' USING ERRCODE='42501';
 END IF;
 SELECT * INTO v_req FROM public.lb03_room_charge_reversal_requests WHERE id=_request_id FOR UPDATE;
 IF NOT FOUND OR v_req.state<>'PENDING_APPROVAL' THEN
  RAISE EXCEPTION 'Reversal request is not awaiting approval' USING ERRCODE='55000';
 END IF;
 SELECT * INTO v_op FROM public.lb03_room_charge_operations WHERE id=v_req.operation_id FOR UPDATE;
 SELECT * INTO v_booking FROM public.bookings WHERE id=v_op.booking_id;
 SELECT m.role INTO v_role FROM public.staynas_property_members m
  WHERE m.user_id=v_actor AND m.property_id=v_booking.property_id AND m.status='active'
   AND m.role IN ('owner','manager','admin','finance','reception') LIMIT 1;
 IF v_role IS NULL THEN
  RAISE EXCEPTION 'Hotel finance/front-office approval permission required' USING ERRCODE='42501';
 END IF;
 v_next:=CASE WHEN v_op.reversed_amount>0 THEN 'PARTIALLY_REVERSED' ELSE 'POSTED' END;
 UPDATE public.lb03_room_charge_reversal_requests SET state='REJECTED',approved_by=v_actor,approved_at=now()
  WHERE id=_request_id;
 UPDATE public.lb03_room_charge_operations SET state=v_next,updated_at=now() WHERE id=v_op.id;
 INSERT INTO public.lb03_room_charge_audit(operation_id,event_type,prior_state,next_state,actor_product,actor_id,correlation_id,evidence)
 VALUES(v_op.id,'room_charge.reversal_rejected','REVERSAL_PENDING',v_next,'staynAS',v_actor,
  v_op.correlation_id,jsonb_build_object('requestId',_request_id,'reason',_reason,'approverRole',v_role));
 RETURN true;
END;
$lb03$;

REVOKE ALL ON FUNCTION public.lb03_request_room_charge_reversal(uuid,text,text,numeric,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.lb03_request_room_charge_reversal(uuid,text,text,numeric,text,text) TO service_role;
REVOKE ALL ON FUNCTION public.lb03_approve_room_charge_reversal(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.lb03_approve_room_charge_reversal(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.lb03_reject_room_charge_reversal(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.lb03_reject_room_charge_reversal(uuid,text) TO authenticated;

COMMIT;
