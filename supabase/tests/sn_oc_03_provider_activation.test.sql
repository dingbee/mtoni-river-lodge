-- SN-OC-03 integrated database acceptance fixture.
-- Run only after the complete supabase/migrations chain has been applied to an isolated database.
BEGIN;

DO $sn_oc_03$
DECLARE
  v_org uuid := gen_random_uuid();
  v_property_a uuid := gen_random_uuid();
  v_property_b uuid := gen_random_uuid();
  v_user uuid := gen_random_uuid();
  v_whatsapp_channel uuid;
  v_email_channel uuid;
  v_binding_a uuid := gen_random_uuid();
  v_binding_b uuid := gen_random_uuid();
  v_email_binding uuid := gen_random_uuid();
  v_session_a uuid := gen_random_uuid();
  v_session_b uuid := gen_random_uuid();
  v_email_session uuid := gen_random_uuid();
  v_inbound_a uuid := gen_random_uuid();
  v_draft_a uuid := gen_random_uuid();
  v_draft_retry uuid := gen_random_uuid();
  v_draft_reconsent uuid := gen_random_uuid();
  v_draft_auto uuid := gen_random_uuid();
  v_draft_cross_property uuid := gen_random_uuid();
  v_draft_email uuid := gen_random_uuid();
  v_claim jsonb;
  v_attempt_id uuid;
  v_message_id uuid;
  v_fingerprint text := repeat('a',64);
  v_key text;
  v_status text;
  v_attempt_number integer;
BEGIN
  INSERT INTO auth.users (id,aud,role,email,encrypted_password,created_at,updated_at)
  VALUES (v_user,'authenticated','authenticated','sn-oc-03-'||v_user::text||'@example.test','test-only',now(),now());

  INSERT INTO public.staynas_organisations (id,slug,name,status)
  VALUES (v_org,'sn-oc-03-'||v_org::text,'SN-OC-03 isolated test organisation','active');

  INSERT INTO public.staynas_properties (id,organisation_id,slug,code,name,status)
  VALUES
    (v_property_a,v_org,'sn-oc-03-a-'||v_property_a::text,'OC3A-'||left(v_property_a::text,8),'SN-OC-03 Property A','active'),
    (v_property_b,v_org,'sn-oc-03-b-'||v_property_b::text,'OC3B-'||left(v_property_b::text,8),'SN-OC-03 Property B','active');

  SELECT id INTO STRICT v_whatsapp_channel FROM public.ai_concierge_channels WHERE channel='whatsapp';
  SELECT id INTO STRICT v_email_channel FROM public.ai_concierge_channels WHERE channel='email';
  UPDATE public.ai_concierge_channels
    SET status='active',outbound_enabled=true,requires_approval=true
    WHERE id IN (v_whatsapp_channel,v_email_channel);

  INSERT INTO public.ai_property_channel_settings
    (property_id,channel,enabled,inbound_enabled,outbound_enabled,require_human_approval,sender_email)
  VALUES
    (v_property_a,'whatsapp',true,true,true,true,NULL),
    (v_property_b,'whatsapp',true,true,true,true,NULL),
    (v_property_b,'email',true,true,true,true,'uat-b@example.test');

  INSERT INTO public.ai_provider_property_bindings
    (id,provider,external_account_id,external_endpoint_id,property_id,channel_id,enabled,
     credential_secret_ref,inbound_enabled,outbound_enabled,verification_status,verified_at,
     verified_by,max_attempts,created_by,updated_by)
  VALUES
    (v_binding_a,'meta_cloud_api','waba-uat-a','phone-uat-a',v_property_a,v_whatsapp_channel,true,
     'STAYNAS_PROVIDER_META_UAT_A',true,true,'verified',now(),v_user,3,v_user,v_user),
    (v_binding_b,'meta_cloud_api','waba-uat-b','phone-uat-b',v_property_b,v_whatsapp_channel,true,
     'STAYNAS_PROVIDER_META_UAT_B',true,true,'verified',now(),v_user,3,v_user,v_user),
    (v_email_binding,'resend','resend-uat-account','uat-b@example.test',v_property_b,v_email_channel,true,
     'STAYNAS_PROVIDER_RESEND_UAT_B',true,true,'verified',now(),v_user,3,v_user,v_user);

  INSERT INTO public.ai_concierge_sessions
    (id,property_id,session_token,guest_phone,channel,message_count,last_active_at)
  VALUES
    (v_session_a,v_property_a,'sn-oc-03-session-a-'||v_session_a::text,'+255700000001','whatsapp',1,now()),
    (v_session_b,v_property_b,'sn-oc-03-session-b-'||v_session_b::text,'+255700000002','whatsapp',1,now()),
    (v_email_session,v_property_b,'sn-oc-03-session-email-'||v_email_session::text,NULL,'email',1,now());
  UPDATE public.ai_concierge_sessions SET guest_email='guest-b@example.test' WHERE id=v_email_session;

  INSERT INTO public.ai_omnichannel_messages
    (id,property_id,session_id,channel,direction,actor_type,message_type,body,provider,provider_message_id,status,occurred_at)
  VALUES
    (v_inbound_a,v_property_a,v_session_a,'whatsapp','inbound','guest','text','Hello StayNas','meta_cloud_api',
     'wamid.sn-oc-03-inbound-a','recorded',now());

  PERFORM public.staynas_record_guest_channel_preference(
    v_property_a,NULL,v_session_a,'whatsapp','service','granted','inbound_message',v_inbound_a,now()
  );
  PERFORM public.staynas_record_guest_channel_preference(
    v_property_b,NULL,v_session_b,'whatsapp','service','granted','inbound_message',NULL,now()
  );
  PERFORM public.staynas_record_guest_channel_preference(
    v_property_b,NULL,v_email_session,'email','service','granted','inbound_message',NULL,now()
  );

  INSERT INTO public.ai_communication_drafts
    (id,session_id,channel,draft_type,body,status,created_by,approved_by,approved_at,
     approved_content_hash,content_version,approved_content_version,approved_by_system,source_message_id)
  VALUES
    (v_draft_a,v_session_a,'whatsapp','concierge_response','Thank you. How may we assist?','approved',
     v_user,v_user,now(),v_fingerprint,1,1,false,v_inbound_a);

  v_key := repeat('b',64);
  SELECT public.staynas_claim_communication_dispatch(
    v_property_a,v_binding_a,v_session_a,v_draft_a,'meta_cloud_api','whatsapp','service',
    '+255700000001',v_key,v_fingerprint,3,v_user
  ) INTO v_claim;
  IF v_claim->>'state' <> 'claimed' THEN
    RAISE EXCEPTION 'SN-OC-03: first approved dispatch was not claimed: %',v_claim;
  END IF;
  v_attempt_id := (v_claim->>'attempt_id')::uuid;
  v_message_id := (v_claim->>'message_id')::uuid;

  SELECT public.staynas_claim_communication_dispatch(
    v_property_a,v_binding_a,v_session_a,v_draft_a,'meta_cloud_api','whatsapp','service',
    '+255700000001',v_key,v_fingerprint,3,v_user
  ) INTO v_claim;
  IF v_claim->>'state' <> 'processing' THEN
    RAISE EXCEPTION 'SN-OC-03: duplicate dispatch was not suppressed: %',v_claim;
  END IF;

  PERFORM public.staynas_complete_communication_dispatch(
    v_property_a,v_attempt_id,v_message_id,v_draft_a,'wamid.sn-oc-03-outbound-a',now(),v_fingerprint
  );
  SELECT status INTO v_status FROM public.ai_communication_dispatch_attempts WHERE id=v_attempt_id;
  IF v_status <> 'accepted' THEN RAISE EXCEPTION 'SN-OC-03: accepted dispatch attempt was not reconciled.'; END IF;
  SELECT status INTO v_status FROM public.ai_omnichannel_messages WHERE id=v_message_id;
  IF v_status <> 'accepted' THEN RAISE EXCEPTION 'SN-OC-03: outbound message was not marked accepted.'; END IF;
  SELECT status INTO v_status FROM public.ai_communication_drafts WHERE id=v_draft_a;
  IF v_status <> 'sent' THEN RAISE EXCEPTION 'SN-OC-03: completed draft was not marked sent.'; END IF;

  -- Retry scheduling, attempt increment and terminal failure.
  INSERT INTO public.ai_communication_drafts
    (id,session_id,channel,draft_type,body,status,created_by,approved_by,approved_at,
     approved_content_hash,content_version,approved_content_version,approved_by_system)
  VALUES
    (v_draft_retry,v_session_a,'whatsapp','concierge_response','A retryable test response.','approved',
     v_user,v_user,now(),v_fingerprint,1,1,false);
  v_key := repeat('c',64);
  SELECT public.staynas_claim_communication_dispatch(
    v_property_a,v_binding_a,v_session_a,v_draft_retry,'meta_cloud_api','whatsapp','service',
    '+255700000001',v_key,v_fingerprint,3,v_user
  ) INTO v_claim;
  v_attempt_id := (v_claim->>'attempt_id')::uuid;
  v_message_id := (v_claim->>'message_id')::uuid;
  PERFORM public.staynas_fail_communication_dispatch(
    v_property_a,v_attempt_id,v_message_id,'retryable_failure',now()-interval '1 second',
    'TEMPORARY_PROVIDER_ERROR','retry fixture',false
  );
  SELECT public.staynas_claim_communication_dispatch(
    v_property_a,v_binding_a,v_session_a,v_draft_retry,'meta_cloud_api','whatsapp','service',
    '+255700000001',v_key,v_fingerprint,3,v_user
  ) INTO v_claim;
  IF v_claim->>'state' <> 'claimed' OR (v_claim->>'attempt_number')::integer <> 2 THEN
    RAISE EXCEPTION 'SN-OC-03: due retry did not create attempt 2: %',v_claim;
  END IF;
  v_attempt_id := (v_claim->>'attempt_id')::uuid;
  PERFORM public.staynas_fail_communication_dispatch(
    v_property_a,v_attempt_id,v_message_id,'permanent_failure',NULL,
    'PERMANENT_PROVIDER_ERROR','terminal fixture',true
  );
  SELECT status INTO v_status FROM public.ai_omnichannel_messages WHERE id=v_message_id;
  IF v_status <> 'failed' THEN RAISE EXCEPTION 'SN-OC-03: permanent failure was not reflected on message.'; END IF;

  -- One manager-authorized recovery bypasses the configured attempt limit exactly once.
  UPDATE public.ai_communication_dispatch_attempts
    SET status='retryable_failure',next_retry_at=now()-interval '1 second',
        manual_retry_authorized=true,recovery_requested_by=v_user,
        recovery_requested_at=now(),recovery_reason='CI fixture: approved one-time recovery'
    WHERE id=v_attempt_id AND status='permanent_failure';
  SELECT public.staynas_claim_communication_dispatch(
    v_property_a,v_binding_a,v_session_a,v_draft_retry,'meta_cloud_api','whatsapp','service',
    '+255700000001',v_key,v_fingerprint,2,v_user
  ) INTO v_claim;
  IF v_claim->>'state' <> 'claimed' OR (v_claim->>'attempt_number')::integer <> 3 THEN
    RAISE EXCEPTION 'SN-OC-03: one-time recovery did not bypass the exhausted retry limit: %',v_claim;
  END IF;
  v_attempt_id := (v_claim->>'attempt_id')::uuid;
  IF (SELECT manual_retry_authorized FROM public.ai_communication_dispatch_attempts WHERE id=v_attempt_id) THEN
    RAISE EXCEPTION 'SN-OC-03: manual recovery authorization was not consumed.';
  END IF;
  PERFORM public.staynas_fail_communication_dispatch(
    v_property_a,v_attempt_id,v_message_id,'permanent_failure',NULL,
    'PERMANENT_PROVIDER_ERROR','recovery terminal fixture',true
  );

  -- STOP blocks dispatch; START records new service consent without granting marketing.
  PERFORM public.staynas_record_guest_channel_preference(
    v_property_a,NULL,v_session_a,'whatsapp','service','withdrawn','guest_action',v_inbound_a,now()
  );
  INSERT INTO public.ai_communication_drafts
    (id,session_id,channel,draft_type,body,status,created_by,approved_by,approved_at,
     approved_content_hash,content_version,approved_content_version,approved_by_system)
  VALUES
    (v_draft_reconsent,v_session_a,'whatsapp','concierge_response','This must remain blocked until re-consent.','approved',
     v_user,v_user,now(),v_fingerprint,1,1,false);
  BEGIN
    PERFORM public.staynas_claim_communication_dispatch(
      v_property_a,v_binding_a,v_session_a,v_draft_reconsent,'meta_cloud_api','whatsapp','service',
      '+255700000001',repeat('d',64),v_fingerprint,3,v_user
    );
    RAISE EXCEPTION 'SN-OC-03: dispatch unexpectedly bypassed STOP.';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%CHANNEL_OPT_OUT_ACTIVE%' THEN RAISE; END IF;
  END;
  PERFORM public.staynas_record_guest_channel_preference(
    v_property_a,NULL,v_session_a,'whatsapp','service','granted','guest_action',v_inbound_a,now()
  );
  SELECT public.staynas_claim_communication_dispatch(
    v_property_a,v_binding_a,v_session_a,v_draft_reconsent,'meta_cloud_api','whatsapp','service',
    '+255700000001',repeat('e',64),v_fingerprint,3,v_user
  ) INTO v_claim;
  IF v_claim->>'state' <> 'claimed' THEN RAISE EXCEPTION 'SN-OC-03: explicit service re-consent did not restore service dispatch.'; END IF;

  -- A property cannot dispatch using another property's provider binding.
  INSERT INTO public.ai_communication_drafts
    (id,session_id,channel,draft_type,body,status,created_by,approved_by,approved_at,
     approved_content_hash,content_version,approved_content_version,approved_by_system)
  VALUES
    (v_draft_cross_property,v_session_b,'whatsapp','concierge_response','Cross-property test.','approved',
     v_user,v_user,now(),v_fingerprint,1,1,false);
  BEGIN
    PERFORM public.staynas_claim_communication_dispatch(
      v_property_b,v_binding_a,v_session_b,v_draft_cross_property,'meta_cloud_api','whatsapp','service',
      '+255700000002',repeat('f',64),v_fingerprint,3,v_user
    );
    RAISE EXCEPTION 'SN-OC-03: cross-property provider binding was accepted.';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%VERIFIED_PROPERTY_PROVIDER_BINDING_REQUIRED%' THEN RAISE; END IF;
  END;

  -- Shared Resend account suppression must block every property binding on that account.
  INSERT INTO public.ai_provider_account_suppressions
    (provider,external_account_id,channel,external_contact,purpose,consent_status,source,provider_event_id,captured_at,withdrawn_at)
  VALUES
    ('resend','resend-uat-account','email','guest-b@example.test','*','withdrawn','provider_suppression',
     'svix-sn-oc-03-suppression',now(),now());
  INSERT INTO public.ai_communication_drafts
    (id,session_id,channel,draft_type,body,status,created_by,approved_by,approved_at,
     approved_content_hash,content_version,approved_content_version,approved_by_system)
  VALUES
    (v_draft_email,v_email_session,'email','concierge_response','Email suppression test.','approved',
     v_user,v_user,now(),v_fingerprint,1,1,false);
  BEGIN
    PERFORM public.staynas_claim_communication_dispatch(
      v_property_b,v_email_binding,v_email_session,v_draft_email,'resend','email','service',
      'guest-b@example.test',repeat('1',64),v_fingerprint,3,v_user
    );
    RAISE EXCEPTION 'SN-OC-03: account-level Resend suppression was bypassed.';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%CHANNEL_OPT_OUT_ACTIVE%' THEN RAISE; END IF;
  END;

  -- System approval is accepted only when both property and platform channel policies permit it.
  UPDATE public.ai_property_channel_settings SET require_human_approval=false
    WHERE property_id=v_property_a AND channel='whatsapp';
  UPDATE public.ai_concierge_channels SET requires_approval=false WHERE id=v_whatsapp_channel;
  INSERT INTO public.ai_communication_drafts
    (id,session_id,channel,draft_type,body,supporting_context,status,created_by,approved_by,approved_at,
     approved_content_hash,content_version,approved_content_version,approved_by_system)
  VALUES
    (v_draft_auto,v_session_a,'whatsapp','concierge_response','A low-risk automated response.',
     jsonb_build_object('ai_confidence',0.95,'escalated',false),'approved',
     v_user,NULL,now(),v_fingerprint,1,1,true);
  SELECT public.staynas_claim_communication_dispatch(
    v_property_a,v_binding_a,v_session_a,v_draft_auto,'meta_cloud_api','whatsapp','service',
    '+255700000001',repeat('2',64),v_fingerprint,3,v_user
  ) INTO v_claim;
  IF v_claim->>'state' <> 'claimed' THEN RAISE EXCEPTION 'SN-OC-03: policy-authorized automatic approval did not dispatch.'; END IF;
  SELECT approval_status INTO v_status FROM public.ai_communication_dispatch_attempts
    WHERE id=(v_claim->>'attempt_id')::uuid;
  IF v_status <> 'auto_approved' THEN RAISE EXCEPTION 'SN-OC-03: automatic approval provenance was not recorded.'; END IF;

  -- Private operational tables must not be readable by anonymous or tenant clients.
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid='public.ai_guest_channel_contact_preferences'::regclass)
     OR has_table_privilege('anon','public.ai_guest_channel_contact_preferences','SELECT')
     OR has_table_privilege('authenticated','public.ai_guest_channel_contact_preferences','SELECT')
     OR NOT has_table_privilege('service_role','public.ai_guest_channel_contact_preferences','SELECT') THEN
    RAISE EXCEPTION 'SN-OC-03: contact preference table grants/RLS are unsafe.';
  END IF;
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid='public.ai_provider_account_suppressions'::regclass)
     OR has_table_privilege('anon','public.ai_provider_account_suppressions','SELECT')
     OR has_table_privilege('authenticated','public.ai_provider_account_suppressions','SELECT')
     OR NOT has_table_privilege('service_role','public.ai_provider_account_suppressions','SELECT') THEN
    RAISE EXCEPTION 'SN-OC-03: account suppression table grants/RLS are unsafe.';
  END IF;
END;
$sn_oc_03$;

ROLLBACK;
