-- LB-03.01 — StayNas financial authority: authorization, atomic posting and durable correlation.
-- Additive. Uses the existing PMS folio and booking models; does not create a second folio.
BEGIN;

CREATE TABLE IF NOT EXISTS public.lb03_room_charge_operations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id uuid NOT NULL REFERENCES public.staynas_product_connections(id) ON DELETE RESTRICT,
  request_id uuid NOT NULL,
  idempotency_key text NOT NULL CHECK (length(idempotency_key) BETWEEN 8 AND 200),
  request_fingerprint text NOT NULL CHECK (request_fingerprint ~ '^[a-f0-9]{64}$'),
  pos_transaction_id uuid NOT NULL,
  pos_tenant_id uuid NOT NULL,
  pos_property_id uuid NOT NULL,
  integration_property_id uuid NOT NULL,
  outlet_reference uuid NOT NULL,
  guest_reference uuid NOT NULL,
  stay_reference uuid NOT NULL,
  booking_id uuid NOT NULL REFERENCES public.bookings(id) ON DELETE RESTRICT,
  guest_id uuid NOT NULL REFERENCES public.guests(id) ON DELETE RESTRICT,
  currency text NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  amount numeric(14,2) NOT NULL CHECK (amount > 0 AND amount = round(amount,2)),
  tax_breakdown jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(tax_breakdown)='array'),
  service_charge numeric(14,2) NOT NULL DEFAULT 0 CHECK (service_charge >= 0),
  discount_amount numeric(14,2) NOT NULL DEFAULT 0 CHECK (discount_amount >= 0),
  correlation_id text NOT NULL,
  state text NOT NULL DEFAULT 'AUTHORIZED' CHECK (state IN (
    'AUTHORIZED','REJECTED','EXPIRED','POSTING_PENDING','POSTED','POSTING_FAILED',
    'REVERSAL_PENDING','PARTIALLY_REVERSED','REVERSED','RECONCILIATION_REQUIRED','RECONCILED'
  )),
  authorization_reference text NOT NULL UNIQUE,
  authorized_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  expires_at timestamptz NOT NULL,
  posting_id uuid REFERENCES public.pms_folio_postings(id) ON DELETE RESTRICT,
  posting_reference text,
  posted_at timestamptz,
  reversed_amount numeric(14,2) NOT NULL DEFAULT 0 CHECK (reversed_amount>=0 AND reversed_amount<=amount),
  reversal_posting_id uuid REFERENCES public.pms_folio_postings(id) ON DELETE RESTRICT,
  reversal_reference text,
  reversed_at timestamptz,
  last_error_code text,
  last_error_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT lb03_room_charge_connection_idempotency_uq UNIQUE(connection_id,idempotency_key),
  CONSTRAINT lb03_room_charge_pos_transaction_uq UNIQUE(connection_id,pos_transaction_id),
  CONSTRAINT lb03_room_charge_posting_ref_uq UNIQUE(posting_reference),
  CONSTRAINT lb03_room_charge_reversal_ref_uq UNIQUE(reversal_reference),
  CONSTRAINT lb03_room_charge_tax_allowlist_ck CHECK (
    tax_breakdown <@ '[]'::jsonb OR jsonb_typeof(tax_breakdown)='array'
  )
);
CREATE INDEX IF NOT EXISTS lb03_room_charge_recovery_idx
 ON public.lb03_room_charge_operations(state,updated_at)
 WHERE state IN ('POSTING_PENDING','POSTING_FAILED','REVERSAL_PENDING','RECONCILIATION_REQUIRED');

CREATE TABLE IF NOT EXISTS public.lb03_room_charge_audit (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  operation_id uuid NOT NULL REFERENCES public.lb03_room_charge_operations(id) ON DELETE RESTRICT,
  event_type text NOT NULL,
  prior_state text,
  next_state text,
  actor_product text NOT NULL CHECK (actor_product IN ('lexibite','staynAS','system')),
  actor_id uuid,
  correlation_id text NOT NULL,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(evidence)='object'),
  occurred_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX IF NOT EXISTS lb03_room_charge_audit_operation_idx
 ON public.lb03_room_charge_audit(operation_id,occurred_at,id);

CREATE OR REPLACE FUNCTION public.lb03_reject_audit_mutation()
RETURNS trigger LANGUAGE plpgsql SET search_path=public
AS $lb03$ BEGIN RAISE EXCEPTION 'LB-03 financial audit evidence is immutable' USING ERRCODE='55000'; END; $lb03$;
DROP TRIGGER IF EXISTS lb03_room_charge_audit_immutable ON public.lb03_room_charge_audit;
CREATE TRIGGER lb03_room_charge_audit_immutable BEFORE UPDATE OR DELETE ON public.lb03_room_charge_audit
 FOR EACH ROW EXECUTE FUNCTION public.lb03_reject_audit_mutation();

ALTER TABLE public.lb03_room_charge_operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lb03_room_charge_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.lb03_room_charge_operations,public.lb03_room_charge_audit FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.lb03_room_charge_operations,public.lb03_room_charge_audit TO service_role;
GRANT USAGE,SELECT ON SEQUENCE public.lb03_room_charge_audit_id_seq TO service_role;

CREATE OR REPLACE FUNCTION public.lb03_authorize_room_charge(
 _connection_id uuid,_request_id uuid,_idempotency_key text,_pos_transaction_id uuid,
 _pos_tenant_id uuid,_pos_property_id uuid,_integration_property_id uuid,_outlet_reference uuid,_guest_reference uuid,
 _stay_reference uuid,_currency text,_amount numeric,_tax_breakdown jsonb,
 _service_charge numeric,_discount_amount numeric,_correlation_id text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public
AS $lb03$
DECLARE
 v_connection public.staynas_product_connections%ROWTYPE;
 v_stay public.lb02_guest_stay_references%ROWTYPE;
 v_booking public.bookings%ROWTYPE;
 v_operation public.lb03_room_charge_operations%ROWTYPE;
 v_fingerprint text;
 v_auth_ref text;
BEGIN
 IF coalesce(auth.role(),'')<>'service_role' THEN RAISE EXCEPTION 'Service authentication required' USING ERRCODE='42501'; END IF;
 IF _connection_id IS NULL OR _request_id IS NULL OR _pos_transaction_id IS NULL
   OR _pos_tenant_id IS NULL OR _pos_property_id IS NULL OR _integration_property_id IS NULL OR _outlet_reference IS NULL
   OR _guest_reference IS NULL OR _stay_reference IS NULL
   OR _idempotency_key IS NULL OR length(_idempotency_key) NOT BETWEEN 8 AND 200
   OR _correlation_id IS NULL OR length(_correlation_id) NOT BETWEEN 8 AND 128
   OR _currency IS NULL OR _currency !~ '^[A-Z]{3} OR _amount IS NULL OR _amount<=0 OR _amount<>round(_amount,2)
   OR coalesce(_service_charge,0)<0 OR coalesce(_discount_amount,0)<0
   OR jsonb_typeof(_tax_breakdown)<>'array'
 THEN RAISE EXCEPTION 'Invalid room-charge authorization contract' USING ERRCODE='22023'; END IF;

 v_fingerprint:=encode(extensions.digest(jsonb_build_object(
   'connectionId',_connection_id,'posTransactionId',_pos_transaction_id,
   'posTenantId',_pos_tenant_id,'posPropertyId',_pos_property_id,'integrationPropertyId',_integration_property_id,
   'outletReference',_outlet_reference,'guestReference',_guest_reference,
   'stayReference',_stay_reference,'currency',_currency,'amount',_amount,
   'taxBreakdown',_tax_breakdown,'serviceCharge',_service_charge,
   'discountAmount',_discount_amount,'correlationId',_correlation_id
 )::text,'sha256'),'hex');

 PERFORM pg_advisory_xact_lock(hashtextextended(_connection_id::text||':'||_idempotency_key,0));
 SELECT * INTO v_operation FROM public.lb03_room_charge_operations
  WHERE connection_id=_connection_id AND idempotency_key=_idempotency_key FOR UPDATE;
 IF FOUND THEN
   IF v_operation.request_fingerprint<>v_fingerprint THEN
     RAISE EXCEPTION 'Idempotency key reused with a different financial payload' USING ERRCODE='23505';
   END IF;
   RETURN jsonb_build_object('status',v_operation.state,'duplicate',true,
    'authorizationReference',v_operation.authorization_reference,
    'requestReference',v_operation.request_id,'decisionAt',v_operation.authorized_at,
    'expiresAt',v_operation.expires_at,'correlationId',v_operation.correlation_id,
    'postingId',v_operation.posting_id,'postingReference',v_operation.posting_reference,
    'amount',v_operation.amount,'currency',v_operation.currency,
    'folioReference',(SELECT b.reference FROM public.bookings b WHERE b.id=v_operation.booking_id));
 END IF;

 SELECT * INTO v_connection FROM public.staynas_product_connections
  WHERE id=_connection_id FOR SHARE;
 IF NOT FOUND OR v_connection.remote_product<>'lexibite' OR v_connection.status<>'active'
   OR v_connection.local_approved_at IS NULL OR v_connection.remote_approved_at IS NULL
   OR v_connection.remote_tenant_id<>_pos_tenant_id
   OR v_connection.remote_property_id<>_pos_property_id
   OR v_connection.integration_property_id<>_integration_property_id
   OR v_connection.correlation_id<>_correlation_id
 THEN RAISE EXCEPTION 'Integration connection, tenant or property scope rejected' USING ERRCODE='42501'; END IF;

 IF NOT EXISTS (SELECT 1 FROM public.lb02_outlet_projections o
   WHERE o.connection_id=_connection_id AND o.integration_property_id=_integration_property_id
    AND o.outlet_reference=_outlet_reference AND o.guest_visible_status='open' AND o.revoked_at IS NULL)
 THEN RAISE EXCEPTION 'Outlet is not authorized for room charges' USING ERRCODE='42501'; END IF;

 SELECT * INTO v_stay FROM public.lb02_guest_stay_references
  WHERE connection_id=_connection_id AND property_id=v_connection.local_property_id
   AND guest_reference=_guest_reference AND stay_reference=_stay_reference
   AND revoked_at IS NULL FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Guest or stay reference is invalid' USING ERRCODE='42501'; END IF;

 SELECT * INTO v_booking FROM public.bookings WHERE id=v_stay.booking_id FOR UPDATE;
 IF NOT FOUND OR v_booking.property_id<>v_connection.local_property_id
   OR v_booking.guest_id IS DISTINCT FROM v_stay.guest_id
   OR v_booking.status<>'checked_in' OR v_booking.checked_in_at IS NULL
   OR v_booking.check_out<=current_date
 THEN RAISE EXCEPTION 'Guest is not checked in to an eligible stay' USING ERRCODE='22023'; END IF;
 IF upper(v_booking.currency)<>_currency THEN
   RAISE EXCEPTION 'Currency mismatch: folio currency is %, requested currency is %',v_booking.currency,_currency USING ERRCODE='22023';
 END IF;

 v_auth_ref:='LBA-'||upper(replace(gen_random_uuid()::text,'-',''));
 INSERT INTO public.lb03_room_charge_operations(
  connection_id,request_id,idempotency_key,request_fingerprint,pos_transaction_id,
  pos_tenant_id,pos_property_id,integration_property_id,outlet_reference,guest_reference,stay_reference,
  booking_id,guest_id,currency,amount,tax_breakdown,service_charge,discount_amount,
  correlation_id,state,authorization_reference,expires_at
 ) VALUES (
  _connection_id,_request_id,_idempotency_key,v_fingerprint,_pos_transaction_id,
  _pos_tenant_id,_pos_property_id,_integration_property_id,_outlet_reference,_guest_reference,_stay_reference,
  v_booking.id,v_booking.guest_id,_currency,_amount,_tax_breakdown,
  coalesce(_service_charge,0),coalesce(_discount_amount,0),_correlation_id,
  'AUTHORIZED',v_auth_ref,clock_timestamp()+interval '5 minutes'
 ) RETURNING * INTO v_operation;

 INSERT INTO public.lb03_room_charge_audit(operation_id,event_type,next_state,actor_product,correlation_id,evidence)
 VALUES(v_operation.id,'room_charge.authorized','AUTHORIZED','lexibite',_correlation_id,
  jsonb_build_object('posTransactionId',_pos_transaction_id,'amount',_amount,'currency',_currency));

 RETURN jsonb_build_object('status','AUTHORIZED','duplicate',false,
  'authorizationReference',v_auth_ref,'requestReference',_request_id,
  'decisionAt',v_operation.authorized_at,'expiresAt',v_operation.expires_at,
  'correlationId',_correlation_id);
END;
$lb03$;

CREATE OR REPLACE FUNCTION public.lb03_post_room_charge(
 _connection_id uuid,_authorization_reference text,_idempotency_key text,_description text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public
AS $lb03$
DECLARE
 v_op public.lb03_room_charge_operations%ROWTYPE;
 v_booking public.bookings%ROWTYPE;
 v_posting public.pms_folio_postings%ROWTYPE;
 v_ref text;
BEGIN
 IF coalesce(auth.role(),'')<>'service_role' THEN RAISE EXCEPTION 'Service authentication required' USING ERRCODE='42501'; END IF;
 SELECT * INTO v_op FROM public.lb03_room_charge_operations
  WHERE connection_id=_connection_id AND authorization_reference=_authorization_reference
   AND idempotency_key=_idempotency_key FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Authorization not found' USING ERRCODE='P0002'; END IF;
 IF v_op.state='POSTED' THEN
  SELECT * INTO v_booking FROM public.bookings WHERE id=v_op.booking_id;
  RETURN jsonb_build_object('status','POSTED','duplicate',true,
   'postingId',v_op.posting_id,'postingReference',v_op.posting_reference,
   'folioReference',v_booking.reference,'amount',v_op.amount,'currency',v_op.currency);
 END IF;
 IF v_op.state<>'AUTHORIZED' OR v_op.expires_at<=clock_timestamp() THEN
  UPDATE public.lb03_room_charge_operations SET state='EXPIRED',updated_at=now()
   WHERE id=v_op.id AND state='AUTHORIZED';
  RAISE EXCEPTION 'Authorization is not active' USING ERRCODE='22023';
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(v_op.connection_id::text||':'||v_op.pos_transaction_id::text,0));
 SELECT * INTO v_booking FROM public.bookings WHERE id=v_op.booking_id FOR UPDATE;
 IF NOT FOUND OR v_booking.status<>'checked_in' OR v_booking.checked_in_at IS NULL
   OR v_booking.check_out<=current_date OR upper(v_booking.currency)<>v_op.currency THEN
  UPDATE public.lb03_room_charge_operations SET state='POSTING_FAILED',
   last_error_code='stay_or_currency_changed',last_error_at=now(),updated_at=now() WHERE id=v_op.id;
  RAISE EXCEPTION 'Stay or folio currency is no longer eligible' USING ERRCODE='22023';
 END IF;
 v_ref:='FOL-LB03-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,20));
 INSERT INTO public.pms_folio_postings(
  booking_id,guest_id,room_id,source_system,source_tenant_id,source_property_id,
  source_location_id,source_order_id,idempotency_key,correlation_id,amount,currency,
  description,status,folio_reference,posting_reference,posted_at,metadata
 ) VALUES (
  v_op.booking_id,v_op.guest_id,v_booking.room_id,'lexibite',v_op.pos_tenant_id,
  v_op.pos_property_id,v_op.outlet_reference,v_op.pos_transaction_id,
  'lb03:'||v_op.connection_id::text||':'||v_op.pos_transaction_id::text,
  v_op.correlation_id,v_op.amount,v_op.currency,coalesce(nullif(_description,''),'LexiBite POS room charge'),
  'posted',v_booking.reference,v_ref,clock_timestamp(),
  jsonb_build_object('integration','LB-03','operationId',v_op.id,'authorizationReference',v_op.authorization_reference,
   'posTransactionId',v_op.pos_transaction_id,'taxBreakdown',v_op.tax_breakdown,
   'serviceCharge',v_op.service_charge,'discountAmount',v_op.discount_amount)
 ) RETURNING * INTO v_posting;

 UPDATE public.bookings SET extras_total=coalesce(extras_total,0)+v_op.amount,
  total=coalesce(total,0)+v_op.amount,balance_due=coalesce(balance_due,0)+v_op.amount,
  balance_amount=coalesce(balance_amount,0)+v_op.amount,updated_at=now()
 WHERE id=v_booking.id;

 UPDATE public.lb03_room_charge_operations SET state='POSTED',posting_id=v_posting.id,
  posting_reference=v_ref,posted_at=clock_timestamp(),updated_at=now() WHERE id=v_op.id;

 INSERT INTO public.lb03_room_charge_audit(operation_id,event_type,prior_state,next_state,actor_product,correlation_id,evidence)
 VALUES(v_op.id,'room_charge.posted','AUTHORIZED','POSTED','staynAS',v_op.correlation_id,
  jsonb_build_object('postingId',v_posting.id,'postingReference',v_ref,'amount',v_op.amount,'currency',v_op.currency));

 RETURN jsonb_build_object('status','POSTED','duplicate',false,'postingId',v_posting.id,
  'postingReference',v_ref,'folioReference',v_booking.reference,'amount',v_op.amount,'currency',v_op.currency);
END;
$lb03$;


-- A credit adjustment extends the existing StayNas folio. It is not a second folio ledger.
CREATE TABLE IF NOT EXISTS public.pms_folio_adjustments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 booking_id uuid NOT NULL REFERENCES public.bookings(id) ON DELETE RESTRICT,
 source_posting_id uuid NOT NULL REFERENCES public.pms_folio_postings(id) ON DELETE RESTRICT,
 adjustment_reference text NOT NULL UNIQUE,
 idempotency_key text NOT NULL UNIQUE,
 adjustment_type text NOT NULL CHECK(adjustment_type='credit'),
 amount numeric(14,2) NOT NULL CHECK(amount>0 AND amount=round(amount,2)),
 currency text NOT NULL CHECK(currency ~ '^[A-Z]{3}(uuid,uuid,text,uuid,uuid,uuid,uuid,uuid,uuid,uuid,text,numeric,jsonb,numeric,numeric,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.lb03_post_room_charge(uuid,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.lb03_authorize_room_charge(uuid,uuid,text,uuid,uuid,uuid,uuid,uuid,uuid,text,numeric,jsonb,numeric,numeric,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.lb03_post_room_charge(uuid,text,text,text) TO service_role;
COMMIT;
 OR _amount IS NULL OR _amount<=0 OR _amount<>round(_amount,2)
   OR coalesce(_service_charge,0)<0 OR coalesce(_discount_amount,0)<0
   OR jsonb_typeof(_tax_breakdown)<>'array'
 THEN RAISE EXCEPTION 'Invalid room-charge authorization contract' USING ERRCODE='22023'; END IF;

 v_fingerprint:=encode(extensions.digest(jsonb_build_object(
   'connectionId',_connection_id,'posTransactionId',_pos_transaction_id,
   'posTenantId',_pos_tenant_id,'posPropertyId',_pos_property_id,'integrationPropertyId',_integration_property_id,
   'outletReference',_outlet_reference,'guestReference',_guest_reference,
   'stayReference',_stay_reference,'currency',_currency,'amount',_amount,
   'taxBreakdown',_tax_breakdown,'serviceCharge',_service_charge,
   'discountAmount',_discount_amount,'correlationId',_correlation_id
 )::text,'sha256'),'hex');

 PERFORM pg_advisory_xact_lock(hashtextextended(_connection_id::text||':'||_idempotency_key,0));
 SELECT * INTO v_operation FROM public.lb03_room_charge_operations
  WHERE connection_id=_connection_id AND idempotency_key=_idempotency_key FOR UPDATE;
 IF FOUND THEN
   IF v_operation.request_fingerprint<>v_fingerprint THEN
     RAISE EXCEPTION 'Idempotency key reused with a different financial payload' USING ERRCODE='23505';
   END IF;
   RETURN jsonb_build_object('status',v_operation.state,'duplicate',true,
    'authorizationReference',v_operation.authorization_reference,
    'requestReference',v_operation.request_id,'decisionAt',v_operation.authorized_at,
    'expiresAt',v_operation.expires_at,'correlationId',v_operation.correlation_id,
    'postingReference',v_operation.posting_reference);
 END IF;

 SELECT * INTO v_connection FROM public.staynas_product_connections
  WHERE id=_connection_id FOR SHARE;
 IF NOT FOUND OR v_connection.remote_product<>'lexibite' OR v_connection.status<>'active'
   OR v_connection.local_approved_at IS NULL OR v_connection.remote_approved_at IS NULL
   OR v_connection.remote_tenant_id<>_pos_tenant_id
   OR v_connection.remote_property_id<>_pos_property_id
   OR v_connection.integration_property_id<>_integration_property_id
   OR v_connection.correlation_id<>_correlation_id
 THEN RAISE EXCEPTION 'Integration connection, tenant or property scope rejected' USING ERRCODE='42501'; END IF;

 IF NOT EXISTS (SELECT 1 FROM public.lb02_outlet_projections o
   WHERE o.connection_id=_connection_id AND o.integration_property_id=_integration_property_id
    AND o.outlet_reference=_outlet_reference AND o.guest_visible_status='open' AND o.revoked_at IS NULL)
 THEN RAISE EXCEPTION 'Outlet is not authorized for room charges' USING ERRCODE='42501'; END IF;

 SELECT * INTO v_stay FROM public.lb02_guest_stay_references
  WHERE connection_id=_connection_id AND property_id=v_connection.local_property_id
   AND guest_reference=_guest_reference AND stay_reference=_stay_reference
   AND revoked_at IS NULL FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Guest or stay reference is invalid' USING ERRCODE='42501'; END IF;

 SELECT * INTO v_booking FROM public.bookings WHERE id=v_stay.booking_id FOR UPDATE;
 IF NOT FOUND OR v_booking.property_id<>v_connection.local_property_id
   OR v_booking.guest_id IS DISTINCT FROM v_stay.guest_id
   OR v_booking.status<>'checked_in' OR v_booking.checked_in_at IS NULL
   OR v_booking.check_out<=current_date
 THEN RAISE EXCEPTION 'Guest is not checked in to an eligible stay' USING ERRCODE='22023'; END IF;
 IF upper(v_booking.currency)<>_currency THEN
   RAISE EXCEPTION 'Currency mismatch: folio currency is %, requested currency is %',v_booking.currency,_currency USING ERRCODE='22023';
 END IF;

 v_auth_ref:='LBA-'||upper(replace(gen_random_uuid()::text,'-',''));
 INSERT INTO public.lb03_room_charge_operations(
  connection_id,request_id,idempotency_key,request_fingerprint,pos_transaction_id,
  pos_tenant_id,pos_property_id,integration_property_id,outlet_reference,guest_reference,stay_reference,
  booking_id,guest_id,currency,amount,tax_breakdown,service_charge,discount_amount,
  correlation_id,state,authorization_reference,expires_at
 ) VALUES (
  _connection_id,_request_id,_idempotency_key,v_fingerprint,_pos_transaction_id,
  _pos_tenant_id,_pos_property_id,_integration_property_id,_outlet_reference,_guest_reference,_stay_reference,
  v_booking.id,v_booking.guest_id,_currency,_amount,_tax_breakdown,
  coalesce(_service_charge,0),coalesce(_discount_amount,0),_correlation_id,
  'AUTHORIZED',v_auth_ref,clock_timestamp()+interval '5 minutes'
 ) RETURNING * INTO v_operation;

 INSERT INTO public.lb03_room_charge_audit(operation_id,event_type,next_state,actor_product,correlation_id,evidence)
 VALUES(v_operation.id,'room_charge.authorized','AUTHORIZED','lexibite',_correlation_id,
  jsonb_build_object('posTransactionId',_pos_transaction_id,'amount',_amount,'currency',_currency));

 RETURN jsonb_build_object('status','AUTHORIZED','duplicate',false,
  'authorizationReference',v_auth_ref,'requestReference',_request_id,
  'decisionAt',v_operation.authorized_at,'expiresAt',v_operation.expires_at,
  'correlationId',_correlation_id);
END;
$lb03$;

CREATE OR REPLACE FUNCTION public.lb03_post_room_charge(
 _connection_id uuid,_authorization_reference text,_idempotency_key text,_description text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public
AS $lb03$
DECLARE
 v_op public.lb03_room_charge_operations%ROWTYPE;
 v_booking public.bookings%ROWTYPE;
 v_posting public.pms_folio_postings%ROWTYPE;
 v_ref text;
BEGIN
 IF coalesce(auth.role(),'')<>'service_role' THEN RAISE EXCEPTION 'Service authentication required' USING ERRCODE='42501'; END IF;
 SELECT * INTO v_op FROM public.lb03_room_charge_operations
  WHERE connection_id=_connection_id AND authorization_reference=_authorization_reference
   AND idempotency_key=_idempotency_key FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Authorization not found' USING ERRCODE='P0002'; END IF;
 IF v_op.state='POSTED' THEN
  RETURN jsonb_build_object('status','POSTED','duplicate',true,
   'postingReference',v_op.posting_reference,'folioReference',v_op.booking_id,
   'amount',v_op.amount,'currency',v_op.currency);
 END IF;
 IF v_op.state<>'AUTHORIZED' OR v_op.expires_at<=clock_timestamp() THEN
  UPDATE public.lb03_room_charge_operations SET state='EXPIRED',updated_at=now()
   WHERE id=v_op.id AND state='AUTHORIZED';
  RAISE EXCEPTION 'Authorization is not active' USING ERRCODE='22023';
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(v_op.connection_id::text||':'||v_op.pos_transaction_id::text,0));
 SELECT * INTO v_booking FROM public.bookings WHERE id=v_op.booking_id FOR UPDATE;
 IF NOT FOUND OR v_booking.status<>'checked_in' OR v_booking.checked_in_at IS NULL
   OR v_booking.check_out<=current_date OR upper(v_booking.currency)<>v_op.currency THEN
  UPDATE public.lb03_room_charge_operations SET state='POSTING_FAILED',
   last_error_code='stay_or_currency_changed',last_error_at=now(),updated_at=now() WHERE id=v_op.id;
  RAISE EXCEPTION 'Stay or folio currency is no longer eligible' USING ERRCODE='22023';
 END IF;
 v_ref:='FOL-LB03-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,20));
 INSERT INTO public.pms_folio_postings(
  booking_id,guest_id,room_id,source_system,source_tenant_id,source_property_id,
  source_location_id,source_order_id,idempotency_key,correlation_id,amount,currency,
  description,status,folio_reference,posting_reference,posted_at,metadata
 ) VALUES (
  v_op.booking_id,v_op.guest_id,v_booking.room_id,'lexibite',v_op.pos_tenant_id,
  v_op.pos_property_id,v_op.outlet_reference,v_op.pos_transaction_id,
  'lb03:'||v_op.connection_id::text||':'||v_op.pos_transaction_id::text,
  v_op.correlation_id,v_op.amount,v_op.currency,coalesce(nullif(_description,''),'LexiBite POS room charge'),
  'posted',v_booking.reference,v_ref,clock_timestamp(),
  jsonb_build_object('integration','LB-03','operationId',v_op.id,'authorizationReference',v_op.authorization_reference,
   'posTransactionId',v_op.pos_transaction_id,'taxBreakdown',v_op.tax_breakdown,
   'serviceCharge',v_op.service_charge,'discountAmount',v_op.discount_amount)
 ) RETURNING * INTO v_posting;

 UPDATE public.bookings SET extras_total=coalesce(extras_total,0)+v_op.amount,
  total=coalesce(total,0)+v_op.amount,balance_due=coalesce(balance_due,0)+v_op.amount,
  balance_amount=coalesce(balance_amount,0)+v_op.amount,updated_at=now()
 WHERE id=v_booking.id;

 UPDATE public.lb03_room_charge_operations SET state='POSTED',posting_id=v_posting.id,
  posting_reference=v_ref,posted_at=clock_timestamp(),updated_at=now() WHERE id=v_op.id;

 INSERT INTO public.lb03_room_charge_audit(operation_id,event_type,prior_state,next_state,actor_product,correlation_id,evidence)
 VALUES(v_op.id,'room_charge.posted','AUTHORIZED','POSTED','staynAS',v_op.correlation_id,
  jsonb_build_object('postingId',v_posting.id,'postingReference',v_ref,'amount',v_op.amount,'currency',v_op.currency));

 RETURN jsonb_build_object('status','POSTED','duplicate',false,'postingId',v_posting.id,
  'postingReference',v_ref,'folioReference',v_booking.reference,'amount',v_op.amount,'currency',v_op.currency);
END;
$lb03$;

REVOKE ALL ON FUNCTION public.lb03_authorize_room_charge(uuid,uuid,text,uuid,uuid,uuid,uuid,uuid,uuid,uuid,text,numeric,jsonb,numeric,numeric,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.lb03_post_room_charge(uuid,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.lb03_authorize_room_charge(uuid,uuid,text,uuid,uuid,uuid,uuid,uuid,uuid,text,numeric,jsonb,numeric,numeric,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.lb03_post_room_charge(uuid,text,text,text) TO service_role;
COMMIT;
),
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

CREATE TABLE IF NOT EXISTS public.lb03_room_charge_reversal_requests (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 operation_id uuid NOT NULL REFERENCES public.lb03_room_charge_operations(id) ON DELETE RESTRICT,
 idempotency_key text NOT NULL CHECK(length(idempotency_key) BETWEEN 8 AND 200),
 request_fingerprint text NOT NULL CHECK(request_fingerprint ~ '^[a-f0-9]{64}(uuid,uuid,text,uuid,uuid,uuid,uuid,uuid,uuid,uuid,text,numeric,jsonb,numeric,numeric,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.lb03_post_room_charge(uuid,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.lb03_authorize_room_charge(uuid,uuid,text,uuid,uuid,uuid,uuid,uuid,uuid,text,numeric,jsonb,numeric,numeric,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.lb03_post_room_charge(uuid,text,text,text) TO service_role;
COMMIT;
 OR _amount IS NULL OR _amount<=0 OR _amount<>round(_amount,2)
   OR coalesce(_service_charge,0)<0 OR coalesce(_discount_amount,0)<0
   OR jsonb_typeof(_tax_breakdown)<>'array'
 THEN RAISE EXCEPTION 'Invalid room-charge authorization contract' USING ERRCODE='22023'; END IF;

 v_fingerprint:=encode(extensions.digest(jsonb_build_object(
   'connectionId',_connection_id,'posTransactionId',_pos_transaction_id,
   'posTenantId',_pos_tenant_id,'posPropertyId',_pos_property_id,'integrationPropertyId',_integration_property_id,
   'outletReference',_outlet_reference,'guestReference',_guest_reference,
   'stayReference',_stay_reference,'currency',_currency,'amount',_amount,
   'taxBreakdown',_tax_breakdown,'serviceCharge',_service_charge,
   'discountAmount',_discount_amount,'correlationId',_correlation_id
 )::text,'sha256'),'hex');

 PERFORM pg_advisory_xact_lock(hashtextextended(_connection_id::text||':'||_idempotency_key,0));
 SELECT * INTO v_operation FROM public.lb03_room_charge_operations
  WHERE connection_id=_connection_id AND idempotency_key=_idempotency_key FOR UPDATE;
 IF FOUND THEN
   IF v_operation.request_fingerprint<>v_fingerprint THEN
     RAISE EXCEPTION 'Idempotency key reused with a different financial payload' USING ERRCODE='23505';
   END IF;
   RETURN jsonb_build_object('status',v_operation.state,'duplicate',true,
    'authorizationReference',v_operation.authorization_reference,
    'requestReference',v_operation.request_id,'decisionAt',v_operation.authorized_at,
    'expiresAt',v_operation.expires_at,'correlationId',v_operation.correlation_id,
    'postingReference',v_operation.posting_reference);
 END IF;

 SELECT * INTO v_connection FROM public.staynas_product_connections
  WHERE id=_connection_id FOR SHARE;
 IF NOT FOUND OR v_connection.remote_product<>'lexibite' OR v_connection.status<>'active'
   OR v_connection.local_approved_at IS NULL OR v_connection.remote_approved_at IS NULL
   OR v_connection.remote_tenant_id<>_pos_tenant_id
   OR v_connection.remote_property_id<>_pos_property_id
   OR v_connection.integration_property_id<>_integration_property_id
   OR v_connection.correlation_id<>_correlation_id
 THEN RAISE EXCEPTION 'Integration connection, tenant or property scope rejected' USING ERRCODE='42501'; END IF;

 IF NOT EXISTS (SELECT 1 FROM public.lb02_outlet_projections o
   WHERE o.connection_id=_connection_id AND o.integration_property_id=_integration_property_id
    AND o.outlet_reference=_outlet_reference AND o.guest_visible_status='open' AND o.revoked_at IS NULL)
 THEN RAISE EXCEPTION 'Outlet is not authorized for room charges' USING ERRCODE='42501'; END IF;

 SELECT * INTO v_stay FROM public.lb02_guest_stay_references
  WHERE connection_id=_connection_id AND property_id=v_connection.local_property_id
   AND guest_reference=_guest_reference AND stay_reference=_stay_reference
   AND revoked_at IS NULL FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Guest or stay reference is invalid' USING ERRCODE='42501'; END IF;

 SELECT * INTO v_booking FROM public.bookings WHERE id=v_stay.booking_id FOR UPDATE;
 IF NOT FOUND OR v_booking.property_id<>v_connection.local_property_id
   OR v_booking.guest_id IS DISTINCT FROM v_stay.guest_id
   OR v_booking.status<>'checked_in' OR v_booking.checked_in_at IS NULL
   OR v_booking.check_out<=current_date
 THEN RAISE EXCEPTION 'Guest is not checked in to an eligible stay' USING ERRCODE='22023'; END IF;
 IF upper(v_booking.currency)<>_currency THEN
   RAISE EXCEPTION 'Currency mismatch: folio currency is %, requested currency is %',v_booking.currency,_currency USING ERRCODE='22023';
 END IF;

 v_auth_ref:='LBA-'||upper(replace(gen_random_uuid()::text,'-',''));
 INSERT INTO public.lb03_room_charge_operations(
  connection_id,request_id,idempotency_key,request_fingerprint,pos_transaction_id,
  pos_tenant_id,pos_property_id,integration_property_id,outlet_reference,guest_reference,stay_reference,
  booking_id,guest_id,currency,amount,tax_breakdown,service_charge,discount_amount,
  correlation_id,state,authorization_reference,expires_at
 ) VALUES (
  _connection_id,_request_id,_idempotency_key,v_fingerprint,_pos_transaction_id,
  _pos_tenant_id,_pos_property_id,_integration_property_id,_outlet_reference,_guest_reference,_stay_reference,
  v_booking.id,v_booking.guest_id,_currency,_amount,_tax_breakdown,
  coalesce(_service_charge,0),coalesce(_discount_amount,0),_correlation_id,
  'AUTHORIZED',v_auth_ref,clock_timestamp()+interval '5 minutes'
 ) RETURNING * INTO v_operation;

 INSERT INTO public.lb03_room_charge_audit(operation_id,event_type,next_state,actor_product,correlation_id,evidence)
 VALUES(v_operation.id,'room_charge.authorized','AUTHORIZED','lexibite',_correlation_id,
  jsonb_build_object('posTransactionId',_pos_transaction_id,'amount',_amount,'currency',_currency));

 RETURN jsonb_build_object('status','AUTHORIZED','duplicate',false,
  'authorizationReference',v_auth_ref,'requestReference',_request_id,
  'decisionAt',v_operation.authorized_at,'expiresAt',v_operation.expires_at,
  'correlationId',_correlation_id);
END;
$lb03$;

CREATE OR REPLACE FUNCTION public.lb03_post_room_charge(
 _connection_id uuid,_authorization_reference text,_idempotency_key text,_description text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public
AS $lb03$
DECLARE
 v_op public.lb03_room_charge_operations%ROWTYPE;
 v_booking public.bookings%ROWTYPE;
 v_posting public.pms_folio_postings%ROWTYPE;
 v_ref text;
BEGIN
 IF coalesce(auth.role(),'')<>'service_role' THEN RAISE EXCEPTION 'Service authentication required' USING ERRCODE='42501'; END IF;
 SELECT * INTO v_op FROM public.lb03_room_charge_operations
  WHERE connection_id=_connection_id AND authorization_reference=_authorization_reference
   AND idempotency_key=_idempotency_key FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Authorization not found' USING ERRCODE='P0002'; END IF;
 IF v_op.state='POSTED' THEN
  RETURN jsonb_build_object('status','POSTED','duplicate',true,
   'postingReference',v_op.posting_reference,'folioReference',v_op.booking_id,
   'amount',v_op.amount,'currency',v_op.currency);
 END IF;
 IF v_op.state<>'AUTHORIZED' OR v_op.expires_at<=clock_timestamp() THEN
  UPDATE public.lb03_room_charge_operations SET state='EXPIRED',updated_at=now()
   WHERE id=v_op.id AND state='AUTHORIZED';
  RAISE EXCEPTION 'Authorization is not active' USING ERRCODE='22023';
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(v_op.connection_id::text||':'||v_op.pos_transaction_id::text,0));
 SELECT * INTO v_booking FROM public.bookings WHERE id=v_op.booking_id FOR UPDATE;
 IF NOT FOUND OR v_booking.status<>'checked_in' OR v_booking.checked_in_at IS NULL
   OR v_booking.check_out<=current_date OR upper(v_booking.currency)<>v_op.currency THEN
  UPDATE public.lb03_room_charge_operations SET state='POSTING_FAILED',
   last_error_code='stay_or_currency_changed',last_error_at=now(),updated_at=now() WHERE id=v_op.id;
  RAISE EXCEPTION 'Stay or folio currency is no longer eligible' USING ERRCODE='22023';
 END IF;
 v_ref:='FOL-LB03-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,20));
 INSERT INTO public.pms_folio_postings(
  booking_id,guest_id,room_id,source_system,source_tenant_id,source_property_id,
  source_location_id,source_order_id,idempotency_key,correlation_id,amount,currency,
  description,status,folio_reference,posting_reference,posted_at,metadata
 ) VALUES (
  v_op.booking_id,v_op.guest_id,v_booking.room_id,'lexibite',v_op.pos_tenant_id,
  v_op.pos_property_id,v_op.outlet_reference,v_op.pos_transaction_id,
  'lb03:'||v_op.connection_id::text||':'||v_op.pos_transaction_id::text,
  v_op.correlation_id,v_op.amount,v_op.currency,coalesce(nullif(_description,''),'LexiBite POS room charge'),
  'posted',v_booking.reference,v_ref,clock_timestamp(),
  jsonb_build_object('integration','LB-03','operationId',v_op.id,'authorizationReference',v_op.authorization_reference,
   'posTransactionId',v_op.pos_transaction_id,'taxBreakdown',v_op.tax_breakdown,
   'serviceCharge',v_op.service_charge,'discountAmount',v_op.discount_amount)
 ) RETURNING * INTO v_posting;

 UPDATE public.bookings SET extras_total=coalesce(extras_total,0)+v_op.amount,
  total=coalesce(total,0)+v_op.amount,balance_due=coalesce(balance_due,0)+v_op.amount,
  balance_amount=coalesce(balance_amount,0)+v_op.amount,updated_at=now()
 WHERE id=v_booking.id;

 UPDATE public.lb03_room_charge_operations SET state='POSTED',posting_id=v_posting.id,
  posting_reference=v_ref,posted_at=clock_timestamp(),updated_at=now() WHERE id=v_op.id;

 INSERT INTO public.lb03_room_charge_audit(operation_id,event_type,prior_state,next_state,actor_product,correlation_id,evidence)
 VALUES(v_op.id,'room_charge.posted','AUTHORIZED','POSTED','staynAS',v_op.correlation_id,
  jsonb_build_object('postingId',v_posting.id,'postingReference',v_ref,'amount',v_op.amount,'currency',v_op.currency));

 RETURN jsonb_build_object('status','POSTED','duplicate',false,'postingId',v_posting.id,
  'postingReference',v_ref,'folioReference',v_booking.reference,'amount',v_op.amount,'currency',v_op.currency);
END;
$lb03$;

REVOKE ALL ON FUNCTION public.lb03_authorize_room_charge(uuid,uuid,text,uuid,uuid,uuid,uuid,uuid,uuid,uuid,text,numeric,jsonb,numeric,numeric,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.lb03_post_room_charge(uuid,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.lb03_authorize_room_charge(uuid,uuid,text,uuid,uuid,uuid,uuid,uuid,uuid,text,numeric,jsonb,numeric,numeric,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.lb03_post_room_charge(uuid,text,text,text) TO service_role;
COMMIT;
),
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
DECLARE v_op public.lb03_room_charge_operations%ROWTYPE; v_req public.lb03_room_charge_reversal_requests%ROWTYPE; v_fp text;
BEGIN
 IF coalesce(auth.role(),'')<>'service_role' THEN RAISE EXCEPTION 'Service authentication required' USING ERRCODE='42501'; END IF;
 IF _amount IS NULL OR _amount<=0 OR _amount<>round(_amount,2)
  OR _reason_code NOT IN ('pos_void','incorrect_amount','duplicate_charge','guest_dispute','service_recovery','other')
  OR length(btrim(coalesce(_reason,''))) NOT BETWEEN 3 AND 500
  OR length(coalesce(_idempotency_key,'')) NOT BETWEEN 8 AND 200
 THEN RAISE EXCEPTION 'Invalid reversal request' USING ERRCODE='22023'; END IF;
 SELECT * INTO v_op FROM public.lb03_room_charge_operations
  WHERE connection_id=_connection_id AND posting_reference=_posting_reference FOR UPDATE;
 IF NOT FOUND OR v_op.state NOT IN ('POSTED','PARTIALLY_REVERSED') THEN
  RAISE EXCEPTION 'Original folio posting is not eligible for reversal' USING ERRCODE='22023';
 END IF;
 v_fp:=encode(extensions.digest(jsonb_build_object('operationId',v_op.id,'amount',_amount,'reasonCode',_reason_code,'reason',btrim(_reason))::text,'sha256'),'hex');
 SELECT * INTO v_req FROM public.lb03_room_charge_reversal_requests
  WHERE operation_id=v_op.id AND idempotency_key=_idempotency_key FOR UPDATE;
 IF FOUND THEN
  IF v_req.request_fingerprint<>v_fp THEN RAISE EXCEPTION 'Reversal idempotency conflict' USING ERRCODE='23505'; END IF;
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
DECLARE v_actor uuid:=auth.uid(); v_req public.lb03_room_charge_reversal_requests%ROWTYPE;
 v_op public.lb03_room_charge_operations%ROWTYPE; v_booking public.bookings%ROWTYPE;
 v_adjustment public.pms_folio_adjustments%ROWTYPE; v_ref text; v_role public.app_role;
BEGIN
 IF v_actor IS NULL THEN RAISE EXCEPTION 'Hotel staff authentication required' USING ERRCODE='42501'; END IF;
 SELECT * INTO v_req FROM public.lb03_room_charge_reversal_requests WHERE id=_request_id FOR UPDATE;
 IF NOT FOUND OR v_req.state<>'PENDING_APPROVAL' THEN RAISE EXCEPTION 'Reversal request is not awaiting approval' USING ERRCODE='55000'; END IF;
 SELECT * INTO v_op FROM public.lb03_room_charge_operations WHERE id=v_req.operation_id FOR UPDATE;
 SELECT * INTO v_booking FROM public.bookings WHERE id=v_op.booking_id FOR UPDATE;
 SELECT m.role INTO v_role FROM public.staynas_property_members m
  WHERE m.user_id=v_actor AND m.property_id=v_booking.property_id AND m.status='active'
   AND m.role IN ('owner','manager','admin','finance','reception') LIMIT 1;
 IF v_role IS NULL THEN RAISE EXCEPTION 'Hotel finance/front-office approval permission required' USING ERRCODE='42501'; END IF;
 IF v_req.amount>v_op.amount-v_op.reversed_amount THEN RAISE EXCEPTION 'Reversal exceeds remaining original charge' USING ERRCODE='22023'; END IF;
 v_ref:='ADJ-LB03-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,20));
 INSERT INTO public.pms_folio_adjustments(
  booking_id,source_posting_id,adjustment_reference,idempotency_key,adjustment_type,
  amount,currency,source_system,source_transaction_id,reason_code,approved_by,approved_at,metadata
 ) VALUES(
  v_op.booking_id,v_op.posting_id,v_ref,'lb03-reversal:'||v_req.id::text,'credit',
  v_req.amount,v_op.currency,'lexibite',v_op.pos_transaction_id,v_req.reason_code,
  v_actor,clock_timestamp(),jsonb_build_object('lb03OperationId',v_op.id,'reversalRequestId',v_req.id,
   'originalPostingReference',v_op.posting_reference,'reason',v_req.reason)
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
DECLARE v_actor uuid:=auth.uid(); v_req public.lb03_room_charge_reversal_requests%ROWTYPE;
 v_op public.lb03_room_charge_operations%ROWTYPE; v_booking public.bookings%ROWTYPE; v_role public.app_role;
BEGIN
 IF v_actor IS NULL OR length(btrim(coalesce(_reason,''))) NOT BETWEEN 3 AND 500 THEN
  RAISE EXCEPTION 'Authenticated hotel actor and rejection reason required' USING ERRCODE='42501';
 END IF;
 SELECT * INTO v_req FROM public.lb03_room_charge_reversal_requests WHERE id=_request_id FOR UPDATE;
 IF NOT FOUND OR v_req.state<>'PENDING_APPROVAL' THEN RAISE EXCEPTION 'Reversal request is not awaiting approval' USING ERRCODE='55000'; END IF;
 SELECT * INTO v_op FROM public.lb03_room_charge_operations WHERE id=v_req.operation_id FOR UPDATE;
 SELECT * INTO v_booking FROM public.bookings WHERE id=v_op.booking_id;
 SELECT m.role INTO v_role FROM public.staynas_property_members m
  WHERE m.user_id=v_actor AND m.property_id=v_booking.property_id AND m.status='active'
   AND m.role IN ('owner','manager','admin','finance','reception') LIMIT 1;
 IF v_role IS NULL THEN RAISE EXCEPTION 'Hotel finance/front-office approval permission required' USING ERRCODE='42501'; END IF;
 UPDATE public.lb03_room_charge_reversal_requests SET state='REJECTED',approved_by=v_actor,approved_at=now()
  WHERE id=_request_id;
 UPDATE public.lb03_room_charge_operations SET state=CASE WHEN reversed_amount>0 THEN 'PARTIALLY_REVERSED' ELSE 'POSTED' END,
  updated_at=now() WHERE id=v_op.id;
 INSERT INTO public.lb03_room_charge_audit(operation_id,event_type,prior_state,next_state,actor_product,actor_id,correlation_id,evidence)
 VALUES(v_op.id,'room_charge.reversal_rejected','REVERSAL_PENDING',
  CASE WHEN v_op.reversed_amount>0 THEN 'PARTIALLY_REVERSED' ELSE 'POSTED' END,
  'staynAS',v_actor,v_op.correlation_id,jsonb_build_object('requestId',_request_id,'reason',_reason,'approverRole',v_role));
 RETURN true;
END;
$lb03$;

REVOKE ALL ON FUNCTION public.lb03_request_room_charge_reversal(uuid,text,text,numeric,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.lb03_request_room_charge_reversal(uuid,text,text,numeric,text,text) TO service_role;
REVOKE ALL ON FUNCTION public.lb03_approve_room_charge_reversal(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.lb03_approve_room_charge_reversal(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.lb03_reject_room_charge_reversal(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.lb03_reject_room_charge_reversal(uuid,text) TO authenticated;

REVOKE ALL ON FUNCTION public.lb03_authorize_room_charge(uuid,uuid,text,uuid,uuid,uuid,uuid,uuid,uuid,uuid,text,numeric,jsonb,numeric,numeric,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.lb03_post_room_charge(uuid,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.lb03_authorize_room_charge(uuid,uuid,text,uuid,uuid,uuid,uuid,uuid,uuid,text,numeric,jsonb,numeric,numeric,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.lb03_post_room_charge(uuid,text,text,text) TO service_role;
COMMIT;
 OR _amount IS NULL OR _amount<=0 OR _amount<>round(_amount,2)
   OR coalesce(_service_charge,0)<0 OR coalesce(_discount_amount,0)<0
   OR jsonb_typeof(_tax_breakdown)<>'array'
 THEN RAISE EXCEPTION 'Invalid room-charge authorization contract' USING ERRCODE='22023'; END IF;

 v_fingerprint:=encode(extensions.digest(jsonb_build_object(
   'connectionId',_connection_id,'posTransactionId',_pos_transaction_id,
   'posTenantId',_pos_tenant_id,'posPropertyId',_pos_property_id,'integrationPropertyId',_integration_property_id,
   'outletReference',_outlet_reference,'guestReference',_guest_reference,
   'stayReference',_stay_reference,'currency',_currency,'amount',_amount,
   'taxBreakdown',_tax_breakdown,'serviceCharge',_service_charge,
   'discountAmount',_discount_amount,'correlationId',_correlation_id
 )::text,'sha256'),'hex');

 PERFORM pg_advisory_xact_lock(hashtextextended(_connection_id::text||':'||_idempotency_key,0));
 SELECT * INTO v_operation FROM public.lb03_room_charge_operations
  WHERE connection_id=_connection_id AND idempotency_key=_idempotency_key FOR UPDATE;
 IF FOUND THEN
   IF v_operation.request_fingerprint<>v_fingerprint THEN
     RAISE EXCEPTION 'Idempotency key reused with a different financial payload' USING ERRCODE='23505';
   END IF;
   RETURN jsonb_build_object('status',v_operation.state,'duplicate',true,
    'authorizationReference',v_operation.authorization_reference,
    'requestReference',v_operation.request_id,'decisionAt',v_operation.authorized_at,
    'expiresAt',v_operation.expires_at,'correlationId',v_operation.correlation_id,
    'postingReference',v_operation.posting_reference);
 END IF;

 SELECT * INTO v_connection FROM public.staynas_product_connections
  WHERE id=_connection_id FOR SHARE;
 IF NOT FOUND OR v_connection.remote_product<>'lexibite' OR v_connection.status<>'active'
   OR v_connection.local_approved_at IS NULL OR v_connection.remote_approved_at IS NULL
   OR v_connection.remote_tenant_id<>_pos_tenant_id
   OR v_connection.remote_property_id<>_pos_property_id
   OR v_connection.integration_property_id<>_integration_property_id
   OR v_connection.correlation_id<>_correlation_id
 THEN RAISE EXCEPTION 'Integration connection, tenant or property scope rejected' USING ERRCODE='42501'; END IF;

 IF NOT EXISTS (SELECT 1 FROM public.lb02_outlet_projections o
   WHERE o.connection_id=_connection_id AND o.integration_property_id=_integration_property_id
    AND o.outlet_reference=_outlet_reference AND o.guest_visible_status='open' AND o.revoked_at IS NULL)
 THEN RAISE EXCEPTION 'Outlet is not authorized for room charges' USING ERRCODE='42501'; END IF;

 SELECT * INTO v_stay FROM public.lb02_guest_stay_references
  WHERE connection_id=_connection_id AND property_id=v_connection.local_property_id
   AND guest_reference=_guest_reference AND stay_reference=_stay_reference
   AND revoked_at IS NULL FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Guest or stay reference is invalid' USING ERRCODE='42501'; END IF;

 SELECT * INTO v_booking FROM public.bookings WHERE id=v_stay.booking_id FOR UPDATE;
 IF NOT FOUND OR v_booking.property_id<>v_connection.local_property_id
   OR v_booking.guest_id IS DISTINCT FROM v_stay.guest_id
   OR v_booking.status<>'checked_in' OR v_booking.checked_in_at IS NULL
   OR v_booking.check_out<=current_date
 THEN RAISE EXCEPTION 'Guest is not checked in to an eligible stay' USING ERRCODE='22023'; END IF;
 IF upper(v_booking.currency)<>_currency THEN
   RAISE EXCEPTION 'Currency mismatch: folio currency is %, requested currency is %',v_booking.currency,_currency USING ERRCODE='22023';
 END IF;

 v_auth_ref:='LBA-'||upper(replace(gen_random_uuid()::text,'-',''));
 INSERT INTO public.lb03_room_charge_operations(
  connection_id,request_id,idempotency_key,request_fingerprint,pos_transaction_id,
  pos_tenant_id,pos_property_id,integration_property_id,outlet_reference,guest_reference,stay_reference,
  booking_id,guest_id,currency,amount,tax_breakdown,service_charge,discount_amount,
  correlation_id,state,authorization_reference,expires_at
 ) VALUES (
  _connection_id,_request_id,_idempotency_key,v_fingerprint,_pos_transaction_id,
  _pos_tenant_id,_pos_property_id,_integration_property_id,_outlet_reference,_guest_reference,_stay_reference,
  v_booking.id,v_booking.guest_id,_currency,_amount,_tax_breakdown,
  coalesce(_service_charge,0),coalesce(_discount_amount,0),_correlation_id,
  'AUTHORIZED',v_auth_ref,clock_timestamp()+interval '5 minutes'
 ) RETURNING * INTO v_operation;

 INSERT INTO public.lb03_room_charge_audit(operation_id,event_type,next_state,actor_product,correlation_id,evidence)
 VALUES(v_operation.id,'room_charge.authorized','AUTHORIZED','lexibite',_correlation_id,
  jsonb_build_object('posTransactionId',_pos_transaction_id,'amount',_amount,'currency',_currency));

 RETURN jsonb_build_object('status','AUTHORIZED','duplicate',false,
  'authorizationReference',v_auth_ref,'requestReference',_request_id,
  'decisionAt',v_operation.authorized_at,'expiresAt',v_operation.expires_at,
  'correlationId',_correlation_id);
END;
$lb03$;

CREATE OR REPLACE FUNCTION public.lb03_post_room_charge(
 _connection_id uuid,_authorization_reference text,_idempotency_key text,_description text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public
AS $lb03$
DECLARE
 v_op public.lb03_room_charge_operations%ROWTYPE;
 v_booking public.bookings%ROWTYPE;
 v_posting public.pms_folio_postings%ROWTYPE;
 v_ref text;
BEGIN
 IF coalesce(auth.role(),'')<>'service_role' THEN RAISE EXCEPTION 'Service authentication required' USING ERRCODE='42501'; END IF;
 SELECT * INTO v_op FROM public.lb03_room_charge_operations
  WHERE connection_id=_connection_id AND authorization_reference=_authorization_reference
   AND idempotency_key=_idempotency_key FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Authorization not found' USING ERRCODE='P0002'; END IF;
 IF v_op.state='POSTED' THEN
  RETURN jsonb_build_object('status','POSTED','duplicate',true,
   'postingReference',v_op.posting_reference,'folioReference',v_op.booking_id,
   'amount',v_op.amount,'currency',v_op.currency);
 END IF;
 IF v_op.state<>'AUTHORIZED' OR v_op.expires_at<=clock_timestamp() THEN
  UPDATE public.lb03_room_charge_operations SET state='EXPIRED',updated_at=now()
   WHERE id=v_op.id AND state='AUTHORIZED';
  RAISE EXCEPTION 'Authorization is not active' USING ERRCODE='22023';
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(v_op.connection_id::text||':'||v_op.pos_transaction_id::text,0));
 SELECT * INTO v_booking FROM public.bookings WHERE id=v_op.booking_id FOR UPDATE;
 IF NOT FOUND OR v_booking.status<>'checked_in' OR v_booking.checked_in_at IS NULL
   OR v_booking.check_out<=current_date OR upper(v_booking.currency)<>v_op.currency THEN
  UPDATE public.lb03_room_charge_operations SET state='POSTING_FAILED',
   last_error_code='stay_or_currency_changed',last_error_at=now(),updated_at=now() WHERE id=v_op.id;
  RAISE EXCEPTION 'Stay or folio currency is no longer eligible' USING ERRCODE='22023';
 END IF;
 v_ref:='FOL-LB03-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,20));
 INSERT INTO public.pms_folio_postings(
  booking_id,guest_id,room_id,source_system,source_tenant_id,source_property_id,
  source_location_id,source_order_id,idempotency_key,correlation_id,amount,currency,
  description,status,folio_reference,posting_reference,posted_at,metadata
 ) VALUES (
  v_op.booking_id,v_op.guest_id,v_booking.room_id,'lexibite',v_op.pos_tenant_id,
  v_op.pos_property_id,v_op.outlet_reference,v_op.pos_transaction_id,
  'lb03:'||v_op.connection_id::text||':'||v_op.pos_transaction_id::text,
  v_op.correlation_id,v_op.amount,v_op.currency,coalesce(nullif(_description,''),'LexiBite POS room charge'),
  'posted',v_booking.reference,v_ref,clock_timestamp(),
  jsonb_build_object('integration','LB-03','operationId',v_op.id,'authorizationReference',v_op.authorization_reference,
   'posTransactionId',v_op.pos_transaction_id,'taxBreakdown',v_op.tax_breakdown,
   'serviceCharge',v_op.service_charge,'discountAmount',v_op.discount_amount)
 ) RETURNING * INTO v_posting;

 UPDATE public.bookings SET extras_total=coalesce(extras_total,0)+v_op.amount,
  total=coalesce(total,0)+v_op.amount,balance_due=coalesce(balance_due,0)+v_op.amount,
  balance_amount=coalesce(balance_amount,0)+v_op.amount,updated_at=now()
 WHERE id=v_booking.id;

 UPDATE public.lb03_room_charge_operations SET state='POSTED',posting_id=v_posting.id,
  posting_reference=v_ref,posted_at=clock_timestamp(),updated_at=now() WHERE id=v_op.id;

 INSERT INTO public.lb03_room_charge_audit(operation_id,event_type,prior_state,next_state,actor_product,correlation_id,evidence)
 VALUES(v_op.id,'room_charge.posted','AUTHORIZED','POSTED','staynAS',v_op.correlation_id,
  jsonb_build_object('postingId',v_posting.id,'postingReference',v_ref,'amount',v_op.amount,'currency',v_op.currency));

 RETURN jsonb_build_object('status','POSTED','duplicate',false,'postingId',v_posting.id,
  'postingReference',v_ref,'folioReference',v_booking.reference,'amount',v_op.amount,'currency',v_op.currency);
END;
$lb03$;

REVOKE ALL ON FUNCTION public.lb03_authorize_room_charge(uuid,uuid,text,uuid,uuid,uuid,uuid,uuid,uuid,uuid,text,numeric,jsonb,numeric,numeric,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.lb03_post_room_charge(uuid,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.lb03_authorize_room_charge(uuid,uuid,text,uuid,uuid,uuid,uuid,uuid,uuid,text,numeric,jsonb,numeric,numeric,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.lb03_post_room_charge(uuid,text,text,text) TO service_role;
COMMIT;
