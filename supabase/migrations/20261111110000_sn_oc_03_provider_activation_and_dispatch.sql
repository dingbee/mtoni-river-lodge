-- SN-OC-03 — provider activation, approval-bound dispatch and webhook recovery.
-- Additive UAT migration. Do not apply to production without explicit release authorization.
BEGIN;

-- SN-RT-01 owns the property-scoped escalation RPC used by Concierge.
-- Fail closed rather than silently deploying omnichannel routing without
-- the existing runtime escalation contract.
DO $sn_oc_03_prereq$
BEGIN
  IF to_regprocedure('public.staynas_create_concierge_escalation(uuid,uuid,uuid,text,text,text,numeric,smallint,text)') IS NULL THEN
    RAISE EXCEPTION 'SN-RT-01 prerequisite missing: migrate staynas_create_concierge_escalation before SN-OC-03';
  END IF;
END $sn_oc_03_prereq$;

ALTER TABLE public.ai_provider_property_bindings
  ADD COLUMN IF NOT EXISTS credential_secret_ref text,
  ADD COLUMN IF NOT EXISTS inbound_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS outbound_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS verification_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS verified_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS configuration_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS max_attempts integer NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.ai_provider_property_bindings
  DROP CONSTRAINT IF EXISTS ai_provider_property_bindings_verification_status_check;
ALTER TABLE public.ai_provider_property_bindings
  ADD CONSTRAINT ai_provider_property_bindings_verification_status_check
  CHECK (verification_status IN ('pending','verified','error','revoked'));
ALTER TABLE public.ai_provider_property_bindings
  DROP CONSTRAINT IF EXISTS ai_provider_property_bindings_credential_secret_ref_check;
ALTER TABLE public.ai_provider_property_bindings
  ADD CONSTRAINT ai_provider_property_bindings_credential_secret_ref_check
  CHECK (credential_secret_ref IS NULL OR credential_secret_ref ~ '^STAYNAS_PROVIDER_[A-Z0-9_]{3,100}$');
ALTER TABLE public.ai_provider_property_bindings
  DROP CONSTRAINT IF EXISTS ai_provider_property_bindings_max_attempts_check;
ALTER TABLE public.ai_provider_property_bindings
  ADD CONSTRAINT ai_provider_property_bindings_max_attempts_check
  CHECK (max_attempts BETWEEN 1 AND 5);

ALTER TABLE public.ai_concierge_messages
  ADD COLUMN IF NOT EXISTS source_omnichannel_message_id uuid
    REFERENCES public.ai_omnichannel_messages(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ai_concierge_messages_source_omnichannel_uidx
  ON public.ai_concierge_messages(source_omnichannel_message_id,role)
  WHERE source_omnichannel_message_id IS NOT NULL;

ALTER TABLE public.ai_communication_drafts
  ADD COLUMN IF NOT EXISTS approved_content_hash text,
  ADD COLUMN IF NOT EXISTS content_version integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS approved_content_version integer,
  ADD COLUMN IF NOT EXISTS approved_by_system boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS provider_template_name text,
  ADD COLUMN IF NOT EXISTS provider_template_language text,
  ADD COLUMN IF NOT EXISTS provider_template_components jsonb,
  ADD COLUMN IF NOT EXISTS source_message_id uuid REFERENCES public.ai_omnichannel_messages(id) ON DELETE SET NULL;
ALTER TABLE public.ai_communication_drafts
  DROP CONSTRAINT IF EXISTS ai_communication_drafts_draft_type_check;
ALTER TABLE public.ai_communication_drafts
  ADD CONSTRAINT ai_communication_drafts_draft_type_check
  CHECK (draft_type IN ('welcome','pre_arrival','activity_intro','transfer_info','follow_up','custom','concierge_response'));
CREATE UNIQUE INDEX IF NOT EXISTS ai_communication_drafts_source_message_uidx
  ON public.ai_communication_drafts (source_message_id);

ALTER TABLE public.ai_communication_dispatch_attempts
  ADD COLUMN IF NOT EXISTS dispatched_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.ai_communication_dispatch_attempts
  ADD COLUMN IF NOT EXISTS manual_retry_authorized boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS recovery_requested_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS recovery_requested_at timestamptz,
  ADD COLUMN IF NOT EXISTS recovery_reason text;
ALTER TABLE public.ai_communication_dispatch_attempts
  DROP CONSTRAINT IF EXISTS ai_communication_dispatch_attempts_approval_status_check;
ALTER TABLE public.ai_communication_dispatch_attempts
  ADD CONSTRAINT ai_communication_dispatch_attempts_approval_status_check
  CHECK (approval_status IN ('not_required','pending','approved','auto_approved','rejected'));

ALTER TABLE public.ai_guest_channel_preferences
  ALTER COLUMN guest_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS session_id uuid REFERENCES public.ai_concierge_sessions(id) ON DELETE CASCADE;
ALTER TABLE public.ai_guest_channel_preferences
  DROP CONSTRAINT IF EXISTS ai_guest_channel_preferences_identity_check;
ALTER TABLE public.ai_guest_channel_preferences
  ADD CONSTRAINT ai_guest_channel_preferences_identity_check
  CHECK ((guest_id IS NOT NULL AND session_id IS NULL) OR (guest_id IS NULL AND session_id IS NOT NULL));
CREATE UNIQUE INDEX IF NOT EXISTS ai_guest_channel_preferences_session_uidx
  ON public.ai_guest_channel_preferences (property_id,session_id,channel,purpose)
  WHERE session_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.ai_guest_channel_contact_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES public.staynas_properties(id) ON DELETE CASCADE,
  channel text NOT NULL CHECK (channel IN ('whatsapp','email')),
  external_contact text NOT NULL,
  purpose text NOT NULL CHECK (purpose IN ('*','transactional','service','marketing')),
  consent_status text NOT NULL CHECK (consent_status IN ('granted','denied','withdrawn','unknown')),
  consent_source text NOT NULL CHECK (consent_source IN ('guest_action','provider_suppression','imported','booking_flow','staff_recorded')),
  evidence_message_id uuid REFERENCES public.ai_omnichannel_messages(id) ON DELETE SET NULL,
  captured_at timestamptz NOT NULL DEFAULT now(),
  withdrawn_at timestamptz,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (property_id,channel,external_contact,purpose),
  CHECK ((consent_status<>'withdrawn') OR withdrawn_at IS NOT NULL)
);
ALTER TABLE public.ai_guest_channel_contact_preferences ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ai_guest_channel_contact_preferences FROM anon,authenticated;
GRANT ALL ON public.ai_guest_channel_contact_preferences TO service_role;
CREATE INDEX IF NOT EXISTS ai_guest_channel_contact_preferences_lookup_idx
  ON public.ai_guest_channel_contact_preferences (property_id,channel,external_contact);

CREATE TABLE IF NOT EXISTS public.ai_provider_account_suppressions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL CHECK (provider IN ('meta_cloud_api','resend')),
  external_account_id text NOT NULL,
  channel text NOT NULL CHECK (channel IN ('whatsapp','email')),
  external_contact text NOT NULL,
  purpose text NOT NULL CHECK (purpose IN ('*','transactional','service','marketing')),
  consent_status text NOT NULL CHECK (consent_status IN ('granted','withdrawn')),
  source text NOT NULL CHECK (source IN ('guest_action','provider_suppression','imported')),
  provider_event_id text,
  captured_at timestamptz NOT NULL DEFAULT now(),
  withdrawn_at timestamptz,
  UNIQUE (provider,external_account_id,channel,external_contact,purpose)
);
ALTER TABLE public.ai_provider_account_suppressions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ai_provider_account_suppressions FROM anon,authenticated;
GRANT ALL ON public.ai_provider_account_suppressions TO service_role;
CREATE INDEX IF NOT EXISTS ai_provider_account_suppressions_lookup_idx
  ON public.ai_provider_account_suppressions (provider,external_account_id,channel,external_contact);

ALTER TABLE public.ai_provider_webhook_inbox
  ADD COLUMN IF NOT EXISTS attempt_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS next_retry_at timestamptz,
  ADD COLUMN IF NOT EXISTS dead_lettered_at timestamptz,
  ADD COLUMN IF NOT EXISTS recovery_requested_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS recovery_requested_at timestamptz,
  ADD COLUMN IF NOT EXISTS recovery_reason text;
ALTER TABLE public.ai_provider_webhook_inbox
  DROP CONSTRAINT IF EXISTS ai_provider_webhook_inbox_processing_status_check;
ALTER TABLE public.ai_provider_webhook_inbox
  ADD CONSTRAINT ai_provider_webhook_inbox_processing_status_check
  CHECK (processing_status IN ('received','processing','processed','ignored','failed','dead_letter'));
CREATE INDEX IF NOT EXISTS ai_provider_webhook_inbox_recovery_idx
  ON public.ai_provider_webhook_inbox (next_retry_at,received_at)
  WHERE processing_status IN ('received','failed','processing');

ALTER TABLE public.ai_omnichannel_delivery_events
  DROP CONSTRAINT IF EXISTS ai_omnichannel_delivery_events_event_type_check;
ALTER TABLE public.ai_omnichannel_delivery_events
  ADD CONSTRAINT ai_omnichannel_delivery_events_event_type_check
  CHECK (event_type IN ('queued','sent','delivered','read','bounced','rejected','failed','complained','unsubscribed','delivery_delayed','suppressed'));

CREATE TABLE IF NOT EXISTS public.ai_provider_webhook_rejections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL CHECK (provider IN ('meta_cloud_api','resend')),
  provider_event_id text NOT NULL,
  event_type text NOT NULL,
  rejection_code text NOT NULL CHECK (rejection_code IN ('invalid_endpoint','unmapped_endpoint','binding_not_enabled')),
  received_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider,provider_event_id)
);
ALTER TABLE public.ai_provider_webhook_rejections ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ai_provider_webhook_rejections FROM anon,authenticated;
GRANT ALL ON public.ai_provider_webhook_rejections TO service_role;

CREATE OR REPLACE FUNCTION public.staynas_record_guest_channel_preference(
  p_property_id uuid,p_guest_id uuid,p_session_id uuid,p_channel text,
  p_purpose text,p_consent_status text,p_consent_source text,
  p_evidence_message_id uuid,p_captured_at timestamptz
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog,public
AS $function$
DECLARE
  v_captured_at timestamptz := COALESCE(p_captured_at,now());
BEGIN
  IF ((p_guest_id IS NOT NULL)::integer + (p_session_id IS NOT NULL)::integer) <> 1
     OR p_channel NOT IN ('web','whatsapp','email')
     OR p_purpose NOT IN ('transactional','service','marketing')
     OR p_consent_status NOT IN ('granted','denied','withdrawn','unknown')
     OR p_consent_source NOT IN ('guest_action','inbound_message','booking_flow','staff_recorded','imported') THEN
    RAISE EXCEPTION 'INVALID_CHANNEL_PREFERENCE';
  END IF;
  IF p_session_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.ai_concierge_sessions s WHERE s.id=p_session_id AND s.property_id=p_property_id
  ) THEN RAISE EXCEPTION 'PREFERENCE_SESSION_PROPERTY_MISMATCH'; END IF;
  IF p_evidence_message_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.ai_omnichannel_messages m
    WHERE m.id=p_evidence_message_id AND m.property_id=p_property_id
      AND (p_session_id IS NULL OR m.session_id=p_session_id)
  ) THEN RAISE EXCEPTION 'PREFERENCE_EVIDENCE_PROPERTY_MISMATCH'; END IF;

  IF p_guest_id IS NOT NULL THEN
    INSERT INTO public.ai_guest_channel_preferences (
      property_id,guest_id,session_id,channel,purpose,consent_status,
      consent_source,evidence_message_id,captured_at,withdrawn_at,updated_by
    ) VALUES (
      p_property_id,p_guest_id,NULL,p_channel,p_purpose,p_consent_status,
      p_consent_source,p_evidence_message_id,v_captured_at,
      CASE WHEN p_consent_status='withdrawn' THEN v_captured_at ELSE NULL END,NULL
    )
    ON CONFLICT (property_id,guest_id,channel,purpose) DO UPDATE SET
      consent_status=EXCLUDED.consent_status,consent_source=EXCLUDED.consent_source,
      evidence_message_id=EXCLUDED.evidence_message_id,captured_at=EXCLUDED.captured_at,
      withdrawn_at=EXCLUDED.withdrawn_at,updated_by=NULL;
  ELSE
    INSERT INTO public.ai_guest_channel_preferences (
      property_id,guest_id,session_id,channel,purpose,consent_status,
      consent_source,evidence_message_id,captured_at,withdrawn_at,updated_by
    ) VALUES (
      p_property_id,NULL,p_session_id,p_channel,p_purpose,p_consent_status,
      p_consent_source,p_evidence_message_id,v_captured_at,
      CASE WHEN p_consent_status='withdrawn' THEN v_captured_at ELSE NULL END,NULL
    )
    ON CONFLICT (property_id,session_id,channel,purpose) WHERE session_id IS NOT NULL DO UPDATE SET
      consent_status=EXCLUDED.consent_status,consent_source=EXCLUDED.consent_source,
      evidence_message_id=EXCLUDED.evidence_message_id,captured_at=EXCLUDED.captured_at,
      withdrawn_at=EXCLUDED.withdrawn_at,updated_by=NULL;
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.staynas_claim_communication_dispatch(
  p_property_id uuid,p_binding_id uuid,p_session_id uuid,p_draft_id uuid,
  p_provider text,p_channel text,p_purpose text,p_external_contact text,
  p_idempotency_key text,p_request_fingerprint text,p_max_attempts integer,p_actor_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog,public
AS $function$
DECLARE
  v_draft public.ai_communication_drafts%ROWTYPE;
  v_session public.ai_concierge_sessions%ROWTYPE;
  v_binding public.ai_provider_property_bindings%ROWTYPE;
  v_settings public.ai_property_channel_settings%ROWTYPE;
  v_existing public.ai_communication_dispatch_attempts%ROWTYPE;
  v_message_id uuid;
  v_attempt_id uuid;
  v_attempt_number integer := 1;
  v_guest_consent boolean := false;
BEGIN
  IF p_provider NOT IN ('meta_cloud_api','resend')
     OR p_channel NOT IN ('whatsapp','email')
     OR (p_provider='meta_cloud_api' AND p_channel<>'whatsapp')
     OR (p_provider='resend' AND p_channel<>'email')
     OR p_purpose NOT IN ('transactional','service','marketing')
     OR p_external_contact IS NULL OR length(trim(p_external_contact))=0
     OR p_idempotency_key !~ '^[a-f0-9]{64}$'
     OR p_request_fingerprint !~ '^[a-f0-9]{64}$'
     OR p_max_attempts IS NULL OR p_max_attempts NOT BETWEEN 1 AND 5 THEN
    RAISE EXCEPTION 'INVALID_DISPATCH_CONTRACT';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_property_id::text || ':' || p_idempotency_key,0));

  SELECT d.* INTO v_draft
  FROM public.ai_communication_drafts d
  JOIN public.ai_concierge_sessions s ON s.id=d.session_id AND s.property_id=p_property_id
  WHERE d.id=p_draft_id AND d.session_id=p_session_id
  FOR UPDATE OF d;
  IF NOT FOUND THEN RAISE EXCEPTION 'DRAFT_NOT_FOUND_IN_PROPERTY'; END IF;
  IF EXISTS (
    SELECT 1 FROM public.ai_communication_dispatch_attempts a
    WHERE a.property_id=p_property_id AND a.draft_id=p_draft_id
      AND a.idempotency_key<>p_idempotency_key
  ) THEN RAISE EXCEPTION 'DRAFT_ALREADY_HAS_DISPATCH_ATTEMPT'; END IF;
  IF v_draft.status<>'approved' OR v_draft.approved_at IS NULL
     OR (NOT v_draft.approved_by_system AND v_draft.approved_by IS NULL)
     OR (v_draft.approved_by_system AND v_draft.approved_by IS NOT NULL)
     OR v_draft.approved_content_hash IS DISTINCT FROM p_request_fingerprint
     OR v_draft.approved_content_version IS DISTINCT FROM v_draft.content_version THEN
    RAISE EXCEPTION 'DRAFT_APPROVAL_OR_CONTENT_MISMATCH';
  END IF;

  SELECT s.* INTO v_session FROM public.ai_concierge_sessions s
  WHERE s.id=p_session_id AND s.property_id=p_property_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'GUEST_SESSION_REQUIRED'; END IF;
  IF v_draft.guest_id IS NOT NULL AND v_session.guest_id IS NOT NULL AND v_draft.guest_id<>v_session.guest_id THEN
    RAISE EXCEPTION 'DRAFT_GUEST_MISMATCH';
  END IF;

  SELECT b.* INTO v_binding
  FROM public.ai_provider_property_bindings b
  JOIN public.ai_concierge_channels c ON c.id=b.channel_id
  WHERE b.id=p_binding_id AND b.property_id=p_property_id AND b.provider=p_provider
    AND b.enabled=true AND b.outbound_enabled=true AND b.verification_status='verified'
    AND b.credential_secret_ref IS NOT NULL AND c.channel=p_channel AND c.provider=p_provider
    AND c.status='active' AND c.outbound_enabled=true
  FOR UPDATE OF b;
  IF NOT FOUND THEN RAISE EXCEPTION 'VERIFIED_PROPERTY_PROVIDER_BINDING_REQUIRED'; END IF;

  SELECT s.* INTO v_settings FROM public.ai_property_channel_settings s
  WHERE s.property_id=p_property_id AND s.channel=p_channel AND s.enabled=true AND s.outbound_enabled=true;
  IF NOT FOUND THEN RAISE EXCEPTION 'PROPERTY_CHANNEL_OUTBOUND_DISABLED'; END IF;

  IF v_draft.approved_by_system AND (
    COALESCE(v_settings.require_human_approval,true) OR
    EXISTS (SELECT 1 FROM public.ai_concierge_channels c WHERE c.channel=p_channel AND c.requires_approval=true) OR
    COALESCE((v_draft.supporting_context->>'ai_confidence')::numeric,0)<0.85 OR
    COALESCE((v_draft.supporting_context->>'escalated')::boolean,false) OR
    v_draft.body ~* '(complaint|refund|chargeback|payment|medical|emergency|unsafe|safety|injury|cancellation|legal|dispute)'
  ) THEN RAISE EXCEPTION 'SYSTEM_APPROVAL_POLICY_NOT_SATISFIED'; END IF;

  IF EXISTS (
    SELECT 1 FROM public.ai_guest_channel_contact_preferences p
    WHERE p.property_id=p_property_id AND p.channel=p_channel
      AND p.external_contact=trim(p_external_contact)
      AND p.purpose IN ('*',p_purpose) AND p.consent_status='withdrawn'
  ) OR EXISTS (
    SELECT 1 FROM public.ai_provider_account_suppressions p
    WHERE p.provider=p_provider AND p.external_account_id=v_binding.external_account_id
      AND p.channel=p_channel AND p.external_contact=trim(p_external_contact)
      AND p.purpose IN ('*',p_purpose) AND p.consent_status='withdrawn'
  ) THEN RAISE EXCEPTION 'CHANNEL_OPT_OUT_ACTIVE'; END IF;

  IF EXISTS (
    SELECT 1 FROM public.ai_guest_channel_preferences p
    WHERE p.property_id=p_property_id AND p.channel=p_channel AND p.purpose=p_purpose
      AND p.consent_status='withdrawn' AND p.withdrawn_at IS NOT NULL
      AND ((v_session.guest_id IS NOT NULL AND p.guest_id=v_session.guest_id) OR p.session_id=p_session_id)
  ) THEN RAISE EXCEPTION 'CHANNEL_OPT_OUT_ACTIVE'; END IF;
  SELECT EXISTS (
    SELECT 1 FROM public.ai_guest_channel_preferences p
    WHERE p.property_id=p_property_id AND p.channel=p_channel AND p.purpose=p_purpose
      AND p.consent_status='granted' AND p.withdrawn_at IS NULL
      AND ((v_session.guest_id IS NOT NULL AND p.guest_id=v_session.guest_id) OR p.session_id=p_session_id)
  ) INTO v_guest_consent;
  IF NOT v_guest_consent THEN RAISE EXCEPTION 'CHANNEL_CONSENT_REQUIRED'; END IF;

  SELECT a.* INTO v_existing FROM public.ai_communication_dispatch_attempts a
  WHERE a.property_id=p_property_id AND a.provider=p_provider AND a.idempotency_key=p_idempotency_key
  ORDER BY a.attempt_number DESC LIMIT 1 FOR UPDATE;
  IF FOUND THEN
    v_message_id := v_existing.message_id;
    IF v_existing.status='accepted' THEN
      RETURN jsonb_build_object('state','accepted','message_id',v_message_id,'attempt_id',v_existing.id,'attempt_number',v_existing.attempt_number);
    ELSIF v_existing.status='processing' THEN
      RETURN jsonb_build_object('state','processing','message_id',v_message_id,'attempt_id',v_existing.id,'attempt_number',v_existing.attempt_number);
    ELSIF v_existing.status IN ('permanent_failure','cancelled') THEN
      RETURN jsonb_build_object('state',v_existing.status,'message_id',v_message_id,'attempt_id',v_existing.id,'attempt_number',v_existing.attempt_number);
    ELSIF v_existing.status='retryable_failure' THEN
      IF v_existing.next_retry_at IS NULL OR v_existing.next_retry_at>now() THEN
        RETURN jsonb_build_object('state','retry_scheduled','message_id',v_message_id,'attempt_id',v_existing.id,'attempt_number',v_existing.attempt_number,'next_retry_at',v_existing.next_retry_at);
      END IF;
      IF v_existing.attempt_number>=p_max_attempts AND NOT v_existing.manual_retry_authorized THEN
        RETURN jsonb_build_object('state','retry_exhausted','message_id',v_message_id,'attempt_id',v_existing.id,'attempt_number',v_existing.attempt_number);
      END IF;
      v_attempt_number := v_existing.attempt_number+1;
    ELSE
      RETURN jsonb_build_object('state','blocked','message_id',v_message_id,'attempt_id',v_existing.id,'attempt_number',v_existing.attempt_number);
    END IF;
  ELSE
    SELECT m.id INTO v_message_id FROM public.ai_omnichannel_messages m
    WHERE m.property_id=p_property_id AND m.client_message_id=p_idempotency_key LIMIT 1;
    IF v_message_id IS NULL THEN
      INSERT INTO public.ai_omnichannel_messages (
        property_id,session_id,guest_id,channel,direction,actor_type,actor_user_id,
        message_type,subject,body,provider,client_message_id,status,metadata
      ) VALUES (
        p_property_id,p_session_id,COALESCE(v_session.guest_id,v_draft.guest_id),p_channel,'outbound',CASE WHEN p_actor_id IS NULL THEN 'system' ELSE 'staff' END,p_actor_id,
        'text',v_draft.subject,v_draft.body,CASE WHEN p_provider='meta_cloud_api' THEN 'meta' ELSE 'resend' END,p_idempotency_key,'queued',
        jsonb_build_object('draft_id',p_draft_id,'approval_fingerprint',p_request_fingerprint)
      ) RETURNING id INTO v_message_id;
    END IF;
  END IF;

  INSERT INTO public.ai_communication_dispatch_attempts (
    property_id,session_id,message_id,draft_id,channel,provider,idempotency_key,
    attempt_number,approval_status,approved_by,approved_at,status,request_fingerprint,dispatched_by,started_at
  ) VALUES (
    p_property_id,p_session_id,v_message_id,p_draft_id,p_channel,p_provider,p_idempotency_key,
    v_attempt_number,CASE WHEN v_draft.approved_by_system THEN 'auto_approved' ELSE 'approved' END,
    v_draft.approved_by,v_draft.approved_at,'processing',p_request_fingerprint,p_actor_id,now()
  ) RETURNING id INTO v_attempt_id;
  RETURN jsonb_build_object('state','claimed','message_id',v_message_id,'attempt_id',v_attempt_id,'attempt_number',v_attempt_number);
END;
$function$;

CREATE OR REPLACE FUNCTION public.staynas_complete_communication_dispatch(
  p_property_id uuid,p_attempt_id uuid,p_message_id uuid,p_draft_id uuid,
  p_provider_message_id text,p_accepted_at timestamptz,p_fingerprint text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog,public
AS $function$
BEGIN
  IF p_provider_message_id IS NULL OR length(p_provider_message_id)=0 THEN RAISE EXCEPTION 'PROVIDER_MESSAGE_ID_REQUIRED'; END IF;
  UPDATE public.ai_communication_dispatch_attempts
    SET status='accepted',provider_message_id=p_provider_message_id,response_code=200,
        finished_at=p_accepted_at,error_code=NULL,error_summary=NULL
    WHERE id=p_attempt_id AND property_id=p_property_id AND message_id=p_message_id AND status='processing';
  IF NOT FOUND THEN RAISE EXCEPTION 'DISPATCH_ATTEMPT_NOT_PROCESSING'; END IF;
  UPDATE public.ai_omnichannel_messages
    SET status='accepted',provider_message_id=p_provider_message_id,occurred_at=p_accepted_at
    WHERE id=p_message_id AND property_id=p_property_id AND status='queued';
  IF NOT FOUND THEN RAISE EXCEPTION 'QUEUED_MESSAGE_NOT_FOUND'; END IF;
  UPDATE public.ai_communication_drafts d
    SET status='sent',sent_at=p_accepted_at
    FROM public.ai_concierge_sessions s
    WHERE d.id=p_draft_id AND d.session_id=s.id AND s.property_id=p_property_id
      AND d.status='approved' AND d.approved_content_hash=p_fingerprint
      AND d.approved_content_version=d.content_version;
  IF NOT FOUND THEN RAISE EXCEPTION 'APPROVED_DRAFT_CHANGED_BEFORE_COMPLETION'; END IF;
  INSERT INTO public.ai_omnichannel_delivery_events (
    property_id,message_id,channel,provider,provider_event_id,provider_message_id,
    event_type,occurred_at,payload
  )
  SELECT a.property_id,a.message_id,a.channel,
    CASE WHEN a.provider='meta_cloud_api' THEN 'meta' ELSE 'resend' END,
    'dispatch-accepted:' || a.id::text,p_provider_message_id,'sent',p_accepted_at,
    jsonb_build_object('source','server_dispatch_acceptance','attempt_id',a.id)
  FROM public.ai_communication_dispatch_attempts a
  WHERE a.id=p_attempt_id AND a.property_id=p_property_id
  ON CONFLICT (provider,provider_event_id) DO NOTHING;
END;
$function$;

CREATE OR REPLACE FUNCTION public.staynas_fail_communication_dispatch(
  p_property_id uuid,p_attempt_id uuid,p_message_id uuid,p_status text,
  p_next_retry_at timestamptz,p_error_code text,p_error_summary text,p_mark_message_failed boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog,public
AS $function$
BEGIN
  IF p_status NOT IN ('retryable_failure','permanent_failure') THEN RAISE EXCEPTION 'INVALID_DISPATCH_FAILURE_STATE'; END IF;
  UPDATE public.ai_communication_dispatch_attempts
    SET status=p_status,next_retry_at=p_next_retry_at,error_code=left(p_error_code,100),
        error_summary=left(p_error_summary,300),finished_at=now()
    WHERE id=p_attempt_id AND property_id=p_property_id AND message_id=p_message_id AND status='processing';
  IF NOT FOUND THEN RAISE EXCEPTION 'DISPATCH_ATTEMPT_NOT_PROCESSING'; END IF;
  IF p_mark_message_failed THEN
    UPDATE public.ai_omnichannel_messages SET status='failed'
      WHERE id=p_message_id AND property_id=p_property_id AND status='queued';
  END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.staynas_record_guest_channel_preference(uuid,uuid,uuid,text,text,text,text,uuid,timestamptz) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.staynas_claim_communication_dispatch(uuid,uuid,uuid,uuid,text,text,text,text,text,text,integer,uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.staynas_complete_communication_dispatch(uuid,uuid,uuid,uuid,text,timestamptz,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.staynas_fail_communication_dispatch(uuid,uuid,uuid,text,timestamptz,text,text,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.staynas_record_guest_channel_preference(uuid,uuid,uuid,text,text,text,text,uuid,timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.staynas_claim_communication_dispatch(uuid,uuid,uuid,uuid,text,text,text,text,text,text,integer,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.staynas_complete_communication_dispatch(uuid,uuid,uuid,uuid,text,timestamptz,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.staynas_fail_communication_dispatch(uuid,uuid,uuid,text,timestamptz,text,text,boolean) TO service_role;

-- Remove non-operational privileges found during the live security inspection.
-- Existing authenticated DML remains governed by the tables' property/founder RLS policies.
REVOKE ALL ON TABLE public.ai_communication_drafts FROM anon;
REVOKE REFERENCES,TRIGGER,TRUNCATE ON TABLE public.ai_communication_drafts FROM authenticated;
REVOKE ALL ON TABLE public.ai_concierge_channels FROM anon;
REVOKE REFERENCES,TRIGGER,TRUNCATE ON TABLE public.ai_concierge_channels FROM authenticated;

COMMIT;
