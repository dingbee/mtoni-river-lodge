-- StayNas public website demo requests.
-- Public visitors submit through the server route only; founder users can review
-- submissions through the authenticated website-demo inbox.
CREATE TABLE IF NOT EXISTS public.staynas_website_demo_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (char_length(name) BETWEEN 2 AND 120),
  email text NOT NULL CHECK (char_length(email) BETWEEN 3 AND 255),
  phone text,
  company text,
  country text,
  property_type text NOT NULL,
  property_count_band text NOT NULL CHECK (property_count_band IN ('1', '2-5', '6-20', '21+')),
  interests text[] NOT NULL DEFAULT '{}',
  message text,
  ip_hash text,
  consent_at timestamptz NOT NULL DEFAULT now(),
  source text NOT NULL DEFAULT 'staynas.com',
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'contacted', 'qualified', 'converted', 'closed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS staynas_website_demo_requests_created_idx
  ON public.staynas_website_demo_requests (created_at DESC);
CREATE INDEX IF NOT EXISTS staynas_website_demo_requests_email_created_idx
  ON public.staynas_website_demo_requests (email, created_at DESC);
CREATE INDEX IF NOT EXISTS staynas_website_demo_requests_ip_created_idx
  ON public.staynas_website_demo_requests (ip_hash, created_at DESC)
  WHERE ip_hash IS NOT NULL;

ALTER TABLE public.staynas_website_demo_requests ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.staynas_website_demo_requests FROM PUBLIC, anon;
GRANT SELECT ON TABLE public.staynas_website_demo_requests TO authenticated;
GRANT ALL ON TABLE public.staynas_website_demo_requests TO service_role;

DROP POLICY IF EXISTS "Founder can read StayNas website demo requests"
  ON public.staynas_website_demo_requests;
CREATE POLICY "Founder can read StayNas website demo requests"
  ON public.staynas_website_demo_requests
  FOR SELECT TO authenticated
  USING (public.is_staynas_founder_ai_admin());

-- Submission, email deduplication and IP rate limiting are serialised in one
-- transaction. The endpoint invokes this only through the server-side client.
CREATE OR REPLACE FUNCTION public.submit_staynas_website_demo_request(
  p_request jsonb,
  p_ip_hash text DEFAULT NULL
)
RETURNS TABLE (
  request_id uuid,
  created_at timestamptz,
  duplicate boolean,
  rate_limited boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_lock_key text;
  v_existing record;
  v_saved record;
BEGIN
  IF p_request IS NULL OR COALESCE(trim(p_request->>'email'), '') = '' THEN
    RAISE EXCEPTION 'A valid request payload is required';
  END IF;

  -- Acquire email and IP locks in deterministic order to avoid deadlocks.
  FOR v_lock_key IN
    SELECT DISTINCT lock_key
    FROM unnest(ARRAY[p_ip_hash, lower(trim(p_request->>'email'))]) AS keys(lock_key)
    WHERE lock_key IS NOT NULL AND lock_key <> ''
    ORDER BY lock_key
  LOOP
    PERFORM pg_advisory_xact_lock(hashtextextended(v_lock_key, 0));
  END LOOP;

  IF p_ip_hash IS NOT NULL AND (
    SELECT count(*)
    FROM public.staynas_website_demo_requests r
    WHERE r.ip_hash = p_ip_hash
      AND r.created_at >= now() - interval '1 hour'
  ) >= 5 THEN
    RETURN QUERY SELECT NULL::uuid, NULL::timestamptz, false, true;
    RETURN;
  END IF;

  SELECT r.id, r.created_at
  INTO v_existing
  FROM public.staynas_website_demo_requests r
  WHERE r.email = lower(trim(p_request->>'email'))
    AND r.created_at >= now() - interval '10 minutes'
  ORDER BY r.created_at DESC
  LIMIT 1;

  IF FOUND THEN
    RETURN QUERY SELECT v_existing.id, v_existing.created_at, true, false;
    RETURN;
  END IF;

  INSERT INTO public.staynas_website_demo_requests (
    name, email, phone, company, country, property_type,
    property_count_band, interests, message, ip_hash, source, status
  )
  VALUES (
    trim(p_request->>'name'),
    lower(trim(p_request->>'email')),
    NULLIF(trim(p_request->>'phone'), ''),
    NULLIF(trim(p_request->>'company'), ''),
    NULLIF(trim(p_request->>'country'), ''),
    trim(p_request->>'property_type'),
    p_request->>'property_count_band',
    ARRAY(SELECT jsonb_array_elements_text(COALESCE(p_request->'interests', '[]'::jsonb))),
    NULLIF(trim(p_request->>'message'), ''),
    p_ip_hash,
    COALESCE(NULLIF(trim(p_request->>'source'), ''), 'staynas.com'),
    'new'
  )
  RETURNING id, staynas_website_demo_requests.created_at
  INTO v_saved;

  RETURN QUERY SELECT v_saved.id, v_saved.created_at, false, false;
END;
$$;

REVOKE ALL ON FUNCTION public.submit_staynas_website_demo_request(jsonb, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_staynas_website_demo_request(jsonb, text)
  TO service_role;
