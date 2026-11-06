ALTER TABLE public.intelligence_insights ADD COLUMN IF NOT EXISTS reasoning_sources text[] NOT NULL DEFAULT '{}';
ALTER TABLE public.intelligence_recommendations ADD COLUMN IF NOT EXISTS reasoning_sources text[] NOT NULL DEFAULT '{}';
CREATE UNIQUE INDEX IF NOT EXISTS intelligence_recommendations_key_uniq
  ON public.intelligence_recommendations (module, recommendation_key)
  WHERE recommendation_key IS NOT NULL AND status IN ('new','reviewing');
CREATE UNIQUE INDEX IF NOT EXISTS intelligence_insights_key_uniq
  ON public.intelligence_insights (module, insight_key)
  WHERE insight_key IS NOT NULL AND status IN ('new','reviewing');