-- SN-IQ-04.6 — atomic inbound conversation materialization.
-- ARTIFACT ONLY. Apply and verify on an isolated Supabase database before any release.
BEGIN;

CREATE OR REPLACE FUNCTION public.staynas_process_provider_inbound(
  p_property_id uuid,
  p_channel text,
  p_provider text,
  p_provider_message_id text,
  p_provider_event_id text,
  p_external_contact text,
  p_guest_name text,
  p_body text,
  p_subject text,
  p_message_type text,
  p_occurred_at timestamptz,
  p_safe_payload jsonb
)
RETURNS TABLE(session_id uuid, message_id uuid, duplicate boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_session_id uuid;
  v_message_id uuid;
  v_lock_key text;
BEGIN
  IF p_channel NOT IN ('whatsapp','email')
     OR p_provider NOT IN ('meta_cloud_api','resend')
     OR p_provider_message_id IS NULL
     OR p_external_contact IS NULL OR length(trim(p_external_contact)) = 0
     OR p_message_type NOT IN ('text','media') THEN
    RAISE EXCEPTION 'Invalid inbound provider message contract';
  END IF;

  -- Serialize all first/repeat messages for this property + channel + contact.
  v_lock_key := p_property_id::text || ':' || p_channel || ':' || lower(trim(p_external_contact));
  PERFORM pg_advisory_xact_lock(hashtextextended(v_lock_key, 0));

  SELECT m.id, m.session_id INTO v_message_id, v_session_id
  FROM public.ai_omnichannel_messages m
  WHERE m.channel = p_channel
    AND m.provider = p_provider
    AND m.provider_message_id = p_provider_message_id
  LIMIT 1;

  IF v_message_id IS NOT NULL THEN
    RETURN QUERY SELECT v_session_id, v_message_id, true;
    RETURN;
  END IF;

  IF p_channel = 'whatsapp' THEN
    SELECT s.id INTO v_session_id
    FROM public.ai_concierge_sessions s
    WHERE s.property_id = p_property_id
      AND s.channel = p_channel
      AND s.guest_phone = p_external_contact
    ORDER BY s.last_active_at DESC NULLS LAST, s.created_at DESC
    LIMIT 1
    FOR UPDATE;
  ELSE
    SELECT s.id INTO v_session_id
    FROM public.ai_concierge_sessions s
    WHERE s.property_id = p_property_id
      AND s.channel = p_channel
      AND lower(s.guest_email) = lower(p_external_contact)
    ORDER BY s.last_active_at DESC NULLS LAST, s.created_at DESC
    LIMIT 1
    FOR UPDATE;
  END IF;

  IF v_session_id IS NULL THEN
    INSERT INTO public.ai_concierge_sessions (
      session_token, property_id, locale, channel, guest_name,
      guest_phone, guest_email, referer, page_context, message_count, last_active_at
    ) VALUES (
      'cnc_' || translate(rtrim(encode(gen_random_bytes(32), 'base64'), '='), '+/', '-_'),
      p_property_id, 'en', p_channel, nullif(left(p_guest_name, 160), ''),
      CASE WHEN p_channel = 'whatsapp' THEN p_external_contact ELSE NULL END,
      CASE WHEN p_channel = 'email' THEN p_external_contact ELSE NULL END,
      'provider:' || p_provider,
      jsonb_build_object('channel', p_channel, 'provider', p_provider),
      1, p_occurred_at
    ) RETURNING id INTO v_session_id;
  ELSE
    UPDATE public.ai_concierge_sessions
    SET message_count = coalesce(message_count, 0) + 1,
        last_active_at = greatest(coalesce(last_active_at, p_occurred_at), p_occurred_at)
    WHERE id = v_session_id AND property_id = p_property_id;
  END IF;

  INSERT INTO public.ai_omnichannel_messages (
    property_id, session_id, guest_id, channel, direction, actor_type,
    message_type, subject, body, provider, provider_message_id, status,
    occurred_at, metadata
  ) VALUES (
    p_property_id, v_session_id, NULL, p_channel, 'inbound', 'provider',
    p_message_type, p_subject, p_body, p_provider, p_provider_message_id,
    'recorded', p_occurred_at,
    jsonb_build_object('externalContact', p_external_contact,
      'providerEventId', p_provider_event_id, 'safePayload', coalesce(p_safe_payload, '{}'::jsonb))
  ) RETURNING id INTO v_message_id;

  RETURN QUERY SELECT v_session_id, v_message_id, false;
END;
$$;

REVOKE ALL ON FUNCTION public.staynas_process_provider_inbound(uuid,text,text,text,text,text,text,text,text,text,timestamptz,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.staynas_process_provider_inbound(uuid,text,text,text,text,text,text,text,text,text,timestamptz,jsonb) TO service_role;

COMMIT;
