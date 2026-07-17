-- Sprint 8E: Marketing Intelligence AI

CREATE TABLE public.ai_marketing_recommendations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('seo','content','campaign')),
  action text NOT NULL,
  target_route text,
  target_id uuid,
  target_label text,
  title text NOT NULL,
  reasoning text NOT NULL,
  suggested_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  expected_impact text,
  impact_score numeric,
  confidence numeric NOT NULL DEFAULT 0.5,
  evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','dismissed','converted')),
  action_task_id uuid,
  actioned_by uuid,
  actioned_at timestamptz,
  model text,
  generated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_marketing_recommendations TO authenticated;
GRANT ALL ON public.ai_marketing_recommendations TO service_role;
ALTER TABLE public.ai_marketing_recommendations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "mkt_reco_read" ON public.ai_marketing_recommendations FOR SELECT TO authenticated
USING (
  public.has_any_role(auth.uid(), ARRAY['owner','manager','admin','marketing']::public.app_role[])
  OR (public.has_role(auth.uid(),'reception'::public.app_role))
  OR (kind='campaign' AND public.has_role(auth.uid(),'finance'::public.app_role))
);
CREATE POLICY "mkt_reco_write" ON public.ai_marketing_recommendations FOR ALL TO authenticated
USING (public.has_any_role(auth.uid(), ARRAY['owner','manager','admin','marketing']::public.app_role[]))
WITH CHECK (public.has_any_role(auth.uid(), ARRAY['owner','manager','admin','marketing']::public.app_role[]));

CREATE INDEX ai_marketing_recommendations_kind_status_idx ON public.ai_marketing_recommendations(kind, status, created_at DESC);

CREATE TRIGGER trg_ai_marketing_recommendations_updated
BEFORE UPDATE ON public.ai_marketing_recommendations
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Reputation insights
CREATE TABLE public.ai_reputation_insights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope text NOT NULL DEFAULT 'overall',
  source text,
  period_from date,
  period_to date,
  sentiment_score numeric,
  compliments jsonb NOT NULL DEFAULT '[]'::jsonb,
  complaints jsonb NOT NULL DEFAULT '[]'::jsonb,
  themes jsonb NOT NULL DEFAULT '[]'::jsonb,
  summary text NOT NULL,
  recommendations jsonb NOT NULL DEFAULT '[]'::jsonb,
  response_drafts jsonb NOT NULL DEFAULT '[]'::jsonb,
  evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
  confidence numeric NOT NULL DEFAULT 0.5,
  model text,
  generated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_reputation_insights TO authenticated;
GRANT ALL ON public.ai_reputation_insights TO service_role;
ALTER TABLE public.ai_reputation_insights ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rep_ins_read" ON public.ai_reputation_insights FOR SELECT TO authenticated
USING (public.has_any_role(auth.uid(), ARRAY['owner','manager','admin','marketing','reception']::public.app_role[]));
CREATE POLICY "rep_ins_write" ON public.ai_reputation_insights FOR ALL TO authenticated
USING (public.has_any_role(auth.uid(), ARRAY['owner','manager','admin','marketing']::public.app_role[]))
WITH CHECK (public.has_any_role(auth.uid(), ARRAY['owner','manager','admin','marketing']::public.app_role[]));

-- Brand reviews
CREATE TABLE public.ai_brand_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_type text NOT NULL,
  subject_id uuid,
  subject_label text,
  content_sample text NOT NULL,
  brand_score numeric NOT NULL DEFAULT 0,
  tone_score numeric NOT NULL DEFAULT 0,
  readability_score numeric NOT NULL DEFAULT 0,
  consistency_score numeric NOT NULL DEFAULT 0,
  issues jsonb NOT NULL DEFAULT '[]'::jsonb,
  suggestions jsonb NOT NULL DEFAULT '[]'::jsonb,
  evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
  model text,
  generated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_brand_reviews TO authenticated;
GRANT ALL ON public.ai_brand_reviews TO service_role;
ALTER TABLE public.ai_brand_reviews ENABLE ROW LEVEL SECURITY;
CREATE POLICY "brand_rev_read" ON public.ai_brand_reviews FOR SELECT TO authenticated
USING (public.has_any_role(auth.uid(), ARRAY['owner','manager','admin','marketing']::public.app_role[]));
CREATE POLICY "brand_rev_write" ON public.ai_brand_reviews FOR ALL TO authenticated
USING (public.has_any_role(auth.uid(), ARRAY['owner','manager','admin','marketing']::public.app_role[]))
WITH CHECK (public.has_any_role(auth.uid(), ARRAY['owner','manager','admin','marketing']::public.app_role[]));

-- Weekly marketing priorities
CREATE TABLE public.ai_marketing_priorities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  week_start date NOT NULL,
  priorities jsonb NOT NULL DEFAULT '[]'::jsonb,
  summary text,
  confidence numeric NOT NULL DEFAULT 0.5,
  evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
  model text,
  generated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_marketing_priorities TO authenticated;
GRANT ALL ON public.ai_marketing_priorities TO service_role;
ALTER TABLE public.ai_marketing_priorities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mkt_prio_read" ON public.ai_marketing_priorities FOR SELECT TO authenticated
USING (public.has_any_role(auth.uid(), ARRAY['owner','manager','admin','marketing','reception','finance']::public.app_role[]));
CREATE POLICY "mkt_prio_write" ON public.ai_marketing_priorities FOR ALL TO authenticated
USING (public.has_any_role(auth.uid(), ARRAY['owner','manager','admin','marketing']::public.app_role[]))
WITH CHECK (public.has_any_role(auth.uid(), ARRAY['owner','manager','admin','marketing']::public.app_role[]));