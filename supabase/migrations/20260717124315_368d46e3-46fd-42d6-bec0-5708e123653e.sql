
-- Sprint 8G: AI Governance & Productisation Layer

-- Organisation / Property scaffolding (placeholders for future multi-property)
CREATE TABLE IF NOT EXISTS public.ai_organisations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE NOT NULL,
  name text NOT NULL,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.ai_organisations TO authenticated;
GRANT ALL ON public.ai_organisations TO service_role;
ALTER TABLE public.ai_organisations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org read staff" ON public.ai_organisations FOR SELECT TO authenticated USING (public.is_any_staff(auth.uid()));
CREATE POLICY "org manage owner" ON public.ai_organisations FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['owner','admin']::public.app_role[]))
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['owner','admin']::public.app_role[]));

CREATE TABLE IF NOT EXISTS public.ai_properties (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid REFERENCES public.ai_organisations(id) ON DELETE CASCADE,
  slug text UNIQUE NOT NULL,
  name text NOT NULL,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.ai_properties TO authenticated;
GRANT ALL ON public.ai_properties TO service_role;
ALTER TABLE public.ai_properties ENABLE ROW LEVEL SECURITY;
CREATE POLICY "prop read staff" ON public.ai_properties FOR SELECT TO authenticated USING (public.is_any_staff(auth.uid()));
CREATE POLICY "prop manage owner" ON public.ai_properties FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['owner','admin']::public.app_role[]))
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['owner','admin']::public.app_role[]));

INSERT INTO public.ai_organisations (slug, name, is_default)
VALUES ('mtoni', 'Mtoni River Lodge', true) ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.ai_properties (organisation_id, slug, name, is_default)
SELECT id, 'mtoni-river-lodge', 'Mtoni River Lodge', true FROM public.ai_organisations WHERE slug='mtoni'
ON CONFLICT (slug) DO NOTHING;

-- AI Configurations
CREATE TABLE IF NOT EXISTS public.ai_configurations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  module text NOT NULL,
  setting_key text NOT NULL,
  setting_value jsonb NOT NULL,
  description text,
  version integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'active',
  updated_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(module, setting_key)
);
GRANT SELECT, INSERT, UPDATE ON public.ai_configurations TO authenticated;
GRANT ALL ON public.ai_configurations TO service_role;
ALTER TABLE public.ai_configurations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cfg read staff" ON public.ai_configurations FOR SELECT TO authenticated USING (public.is_any_staff(auth.uid()));
CREATE POLICY "cfg manage admin" ON public.ai_configurations FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['owner','admin','manager']::public.app_role[]))
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['owner','admin','manager']::public.app_role[]));

-- AI Prompt versions
CREATE TABLE IF NOT EXISTS public.ai_prompt_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  module text NOT NULL,
  prompt_key text NOT NULL,
  prompt_text text NOT NULL,
  version integer NOT NULL DEFAULT 1,
  is_active boolean NOT NULL DEFAULT false,
  notes text,
  approved_by uuid REFERENCES auth.users(id),
  approved_at timestamptz,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.ai_prompt_versions TO authenticated;
GRANT ALL ON public.ai_prompt_versions TO service_role;
ALTER TABLE public.ai_prompt_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "prompts read staff" ON public.ai_prompt_versions FOR SELECT TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['owner','admin','manager']::public.app_role[]));
CREATE POLICY "prompts manage admin" ON public.ai_prompt_versions FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['owner','admin']::public.app_role[]))
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['owner','admin']::public.app_role[]));

-- AI Feedback
CREATE TABLE IF NOT EXISTS public.ai_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_log_id uuid REFERENCES public.ai_activity_logs(id) ON DELETE SET NULL,
  module text,
  rating text NOT NULL,
  comment text,
  user_id uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.ai_feedback TO authenticated;
GRANT ALL ON public.ai_feedback TO service_role;
ALTER TABLE public.ai_feedback ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fb insert own" ON public.ai_feedback FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND public.is_any_staff(auth.uid()));
CREATE POLICY "fb read own or manager" ON public.ai_feedback FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_any_role(auth.uid(), ARRAY['owner','admin','manager']::public.app_role[]));

-- AI Usage metrics (daily rollups)
CREATE TABLE IF NOT EXISTS public.ai_usage_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  day date NOT NULL,
  module text NOT NULL,
  requests integer NOT NULL DEFAULT 0,
  successful integer NOT NULL DEFAULT 0,
  failed integer NOT NULL DEFAULT 0,
  total_duration_ms bigint NOT NULL DEFAULT 0,
  estimated_tokens bigint NOT NULL DEFAULT 0,
  estimated_cost_usd numeric(10,4) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(day, module)
);
GRANT SELECT, INSERT, UPDATE ON public.ai_usage_metrics TO authenticated;
GRANT ALL ON public.ai_usage_metrics TO service_role;
ALTER TABLE public.ai_usage_metrics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "usage read manager" ON public.ai_usage_metrics FOR SELECT TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['owner','admin','manager','finance']::public.app_role[]));
CREATE POLICY "usage manage admin" ON public.ai_usage_metrics FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['owner','admin']::public.app_role[]))
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['owner','admin']::public.app_role[]));

-- AI Health events
CREATE TABLE IF NOT EXISTS public.ai_health_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  severity text NOT NULL DEFAULT 'info',
  category text NOT NULL,
  module text,
  message text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  resolved boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.ai_health_events TO authenticated;
GRANT ALL ON public.ai_health_events TO service_role;
ALTER TABLE public.ai_health_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "health read manager" ON public.ai_health_events FOR SELECT TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['owner','admin','manager']::public.app_role[]));
CREATE POLICY "health manage admin" ON public.ai_health_events FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['owner','admin']::public.app_role[]))
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['owner','admin']::public.app_role[]));

-- Timestamp triggers
CREATE TRIGGER ai_configurations_updated_at BEFORE UPDATE ON public.ai_configurations FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER ai_prompt_versions_updated_at BEFORE UPDATE ON public.ai_prompt_versions FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER ai_usage_metrics_updated_at BEFORE UPDATE ON public.ai_usage_metrics FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER ai_organisations_updated_at BEFORE UPDATE ON public.ai_organisations FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER ai_properties_updated_at BEFORE UPDATE ON public.ai_properties FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Seed default configurations
INSERT INTO public.ai_configurations (module, setting_key, setting_value, description) VALUES
  ('command',   'min_confidence',     '0.5'::jsonb, 'Minimum confidence threshold for Command Centre responses'),
  ('guest',     'min_confidence',     '0.6'::jsonb, 'Minimum confidence for guest recommendations'),
  ('revenue',   'min_confidence',     '0.7'::jsonb, 'Minimum confidence for revenue recommendations'),
  ('marketing', 'min_confidence',     '0.6'::jsonb, 'Minimum confidence for marketing recommendations'),
  ('executive', 'min_confidence',     '0.65'::jsonb,'Minimum confidence for executive briefings'),
  ('global',    'require_approval',   '["pricing_change","campaign_launch","guest_communication","operational_change"]'::jsonb, 'Actions requiring human approval'),
  ('global',    'response_max_tokens','4000'::jsonb,'Response length cap'),
  ('global',    'enabled_modules',    '["command","executive","guest","revenue","marketing","knowledge"]'::jsonb, 'Currently enabled AI modules')
ON CONFLICT (module, setting_key) DO NOTHING;
