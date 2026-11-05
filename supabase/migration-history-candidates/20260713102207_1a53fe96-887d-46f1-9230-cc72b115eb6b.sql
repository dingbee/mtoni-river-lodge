
CREATE EXTENSION IF NOT EXISTS citext WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS fuzzystrmatch WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION public.is_any_staff(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND role IN ('owner','manager','reception','marketing','housekeeping','finance','admin','reservations','editor')
  )
$$;

CREATE TYPE public.guest_status AS ENUM ('new','returning','vip');
CREATE TYPE public.communication_preference AS ENUM ('email','whatsapp','sms','none');

CREATE TABLE public.guests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email extensions.citext,
  phone_e164 text,
  full_name text NOT NULL,
  country text,
  preferred_language text,
  nationality text,
  time_zone text,
  communication_preference public.communication_preference NOT NULL DEFAULT 'email',
  avatar_url text,
  status public.guest_status NOT NULL DEFAULT 'new',
  status_override boolean NOT NULL DEFAULT false,
  internal_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  merged_into uuid REFERENCES public.guests(id) ON DELETE SET NULL,
  is_deleted boolean NOT NULL DEFAULT false
);
CREATE UNIQUE INDEX guests_email_uniq ON public.guests (lower(email::text)) WHERE email IS NOT NULL AND is_deleted = false;
CREATE INDEX guests_phone_idx ON public.guests (phone_e164) WHERE phone_e164 IS NOT NULL;
CREATE INDEX guests_status_idx ON public.guests (status);
CREATE INDEX guests_name_trgm ON public.guests USING gin (full_name extensions.gin_trgm_ops);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.guests TO authenticated;
GRANT ALL ON public.guests TO service_role;
ALTER TABLE public.guests ENABLE ROW LEVEL SECURITY;
CREATE POLICY guests_staff_all ON public.guests FOR ALL TO authenticated
  USING (public.is_any_staff(auth.uid())) WITH CHECK (public.is_any_staff(auth.uid()));

CREATE TRIGGER guests_updated_at BEFORE UPDATE ON public.guests
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.guest_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  label text NOT NULL,
  color text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.guest_tags TO authenticated;
GRANT ALL ON public.guest_tags TO service_role;
ALTER TABLE public.guest_tags ENABLE ROW LEVEL SECURITY;
CREATE POLICY guest_tags_staff_all ON public.guest_tags FOR ALL TO authenticated
  USING (public.is_any_staff(auth.uid())) WITH CHECK (public.is_any_staff(auth.uid()));

CREATE TABLE public.guest_tag_assignments (
  guest_id uuid NOT NULL REFERENCES public.guests(id) ON DELETE CASCADE,
  tag_id uuid NOT NULL REFERENCES public.guest_tags(id) ON DELETE CASCADE,
  assigned_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (guest_id, tag_id)
);
CREATE INDEX guest_tag_assignments_tag_idx ON public.guest_tag_assignments (tag_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.guest_tag_assignments TO authenticated;
GRANT ALL ON public.guest_tag_assignments TO service_role;
ALTER TABLE public.guest_tag_assignments ENABLE ROW LEVEL SECURITY;
CREATE POLICY guest_tag_assign_staff_all ON public.guest_tag_assignments FOR ALL TO authenticated
  USING (public.is_any_staff(auth.uid())) WITH CHECK (public.is_any_staff(auth.uid()));

CREATE TABLE public.guest_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  guest_id uuid NOT NULL REFERENCES public.guests(id) ON DELETE CASCADE,
  author_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  body text NOT NULL,
  history jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_deleted boolean NOT NULL DEFAULT false,
  deleted_at timestamptz,
  deleted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX guest_notes_guest_idx ON public.guest_notes (guest_id, created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.guest_notes TO authenticated;
GRANT ALL ON public.guest_notes TO service_role;
ALTER TABLE public.guest_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY guest_notes_staff_all ON public.guest_notes FOR ALL TO authenticated
  USING (public.is_any_staff(auth.uid())) WITH CHECK (public.is_any_staff(auth.uid()));
CREATE TRIGGER guest_notes_updated_at BEFORE UPDATE ON public.guest_notes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.guest_communications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  guest_id uuid NOT NULL REFERENCES public.guests(id) ON DELETE CASCADE,
  booking_id uuid REFERENCES public.bookings(id) ON DELETE SET NULL,
  channel text NOT NULL CHECK (channel IN ('email','whatsapp','sms','note','system','call')),
  direction text NOT NULL CHECK (direction IN ('in','out','internal')),
  subject text,
  body text,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  author_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX guest_comms_guest_idx ON public.guest_communications (guest_id, occurred_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.guest_communications TO authenticated;
GRANT ALL ON public.guest_communications TO service_role;
ALTER TABLE public.guest_communications ENABLE ROW LEVEL SECURITY;
CREATE POLICY guest_comms_staff_all ON public.guest_communications FOR ALL TO authenticated
  USING (public.is_any_staff(auth.uid())) WITH CHECK (public.is_any_staff(auth.uid()));

ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS guest_id uuid REFERENCES public.guests(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS bookings_guest_id_idx ON public.bookings (guest_id);

CREATE OR REPLACE FUNCTION public.bookings_link_guest()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _gid uuid;
  _norm_email extensions.citext := NULLIF(lower(trim(NEW.guest_email)), '')::extensions.citext;
BEGIN
  IF _norm_email IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT id INTO _gid FROM public.guests
   WHERE email = _norm_email AND is_deleted = false
   LIMIT 1;

  IF _gid IS NULL THEN
    INSERT INTO public.guests (email, phone_e164, full_name, country)
    VALUES (_norm_email, NEW.guest_phone, NEW.guest_name, NEW.country)
    RETURNING id INTO _gid;
  ELSE
    UPDATE public.guests
       SET full_name = COALESCE(NULLIF(trim(NEW.guest_name), ''), full_name),
           phone_e164 = COALESCE(phone_e164, NEW.guest_phone),
           country = COALESCE(country, NEW.country),
           updated_at = now()
     WHERE id = _gid;
  END IF;

  NEW.guest_id := _gid;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS bookings_link_guest_trg ON public.bookings;
CREATE TRIGGER bookings_link_guest_trg
  BEFORE INSERT OR UPDATE OF guest_email, guest_name, guest_phone, country ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.bookings_link_guest();

-- Backfill guests from bookings: pick the most recent booking per normalized email
WITH latest AS (
  SELECT DISTINCT ON (lower(trim(b.guest_email)))
         lower(trim(b.guest_email)) AS norm_email,
         b.guest_phone, b.guest_name, b.country, b.created_at
    FROM public.bookings b
   WHERE b.guest_email IS NOT NULL AND trim(b.guest_email) <> ''
   ORDER BY lower(trim(b.guest_email)), b.created_at DESC
)
INSERT INTO public.guests (email, phone_e164, full_name, country, created_at)
SELECT norm_email::extensions.citext, guest_phone, guest_name, country, created_at
  FROM latest
ON CONFLICT DO NOTHING;

UPDATE public.bookings b
   SET guest_id = g.id
  FROM public.guests g
 WHERE b.guest_id IS NULL
   AND g.email = lower(trim(b.guest_email))::extensions.citext
   AND g.is_deleted = false;

UPDATE public.guests g
   SET status = 'returning'
  FROM (SELECT guest_id, COUNT(*) c FROM public.bookings WHERE guest_id IS NOT NULL GROUP BY guest_id) s
 WHERE s.guest_id = g.id
   AND s.c >= 2
   AND g.status_override = false
   AND g.status = 'new';

CREATE OR REPLACE VIEW public.guest_directory
WITH (security_invoker = true) AS
SELECT
  g.id,
  g.email,
  g.phone_e164,
  g.full_name,
  g.country,
  g.preferred_language,
  g.nationality,
  g.time_zone,
  g.communication_preference,
  g.avatar_url,
  g.status,
  g.internal_notes,
  g.created_at,
  g.updated_at,
  COALESCE(s.total_stays, 0) AS total_stays,
  COALESCE(s.total_nights, 0) AS total_nights,
  COALESCE(s.lifetime_spend, 0) AS lifetime_spend,
  s.first_stay,
  s.last_stay,
  COALESCE(s.cancelled_count, 0) AS cancelled_count,
  COALESCE(t.tag_ids, ARRAY[]::uuid[]) AS tag_ids
FROM public.guests g
LEFT JOIN LATERAL (
  SELECT
    COUNT(*) FILTER (WHERE status NOT IN ('cancelled'))::int AS total_stays,
    SUM(nights) FILTER (WHERE status NOT IN ('cancelled'))::int AS total_nights,
    SUM(total) FILTER (WHERE payment_status IN ('paid','deposit_paid'))::numeric AS lifetime_spend,
    MIN(check_in) FILTER (WHERE status NOT IN ('cancelled')) AS first_stay,
    MAX(check_in) FILTER (WHERE status NOT IN ('cancelled')) AS last_stay,
    COUNT(*) FILTER (WHERE status = 'cancelled')::int AS cancelled_count
  FROM public.bookings b WHERE b.guest_id = g.id
) s ON true
LEFT JOIN LATERAL (
  SELECT array_agg(tag_id) AS tag_ids FROM public.guest_tag_assignments WHERE guest_id = g.id
) t ON true
WHERE g.is_deleted = false;

GRANT SELECT ON public.guest_directory TO authenticated;

CREATE OR REPLACE FUNCTION public.find_duplicate_guests()
RETURNS TABLE(cluster_key text, match_type text, guest_ids uuid[], sample_names text[], sample_emails text[])
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, extensions AS $$
  SELECT phone_e164::text, 'phone'::text,
         array_agg(id), array_agg(full_name), array_agg(email::text)
    FROM public.guests
   WHERE phone_e164 IS NOT NULL AND is_deleted = false
   GROUP BY phone_e164
  HAVING COUNT(*) > 1
  UNION ALL
  SELECT extensions.soundex(full_name) || ':' || COALESCE(country,''),
         'name_country'::text,
         array_agg(id), array_agg(full_name), array_agg(email::text)
    FROM public.guests
   WHERE is_deleted = false AND length(full_name) > 2
   GROUP BY extensions.soundex(full_name) || ':' || COALESCE(country,'')
  HAVING COUNT(*) > 1
$$;

GRANT EXECUTE ON FUNCTION public.find_duplicate_guests() TO authenticated;
