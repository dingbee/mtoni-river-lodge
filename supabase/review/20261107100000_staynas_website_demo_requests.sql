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
  source text NOT NULL DEFAULT 'staynas.com',
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'contacted', 'qualified', 'converted', 'closed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS staynas_website_demo_requests_created_idx
  ON public.staynas_website_demo_requests (created_at DESC);
CREATE INDEX IF NOT EXISTS staynas_website_demo_requests_email_created_idx
  ON public.staynas_website_demo_requests (email, created_at DESC);

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
