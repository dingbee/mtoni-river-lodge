-- Sprint 3: Context Intelligence Layer

-- 1. Memory hierarchy: observed facts, learned patterns, strategic preferences.
ALTER TABLE public.intelligence_memory
  ADD COLUMN IF NOT EXISTS memory_tier text NOT NULL DEFAULT 'observed';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'intelligence_memory_tier_check'
  ) THEN
    ALTER TABLE public.intelligence_memory
      ADD CONSTRAINT intelligence_memory_tier_check
      CHECK (memory_tier IN ('observed', 'learned', 'strategic'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS intelligence_memory_tier_idx
  ON public.intelligence_memory (memory_tier, status);

-- 2. Business context attached to reasoning output.
ALTER TABLE public.intelligence_insights
  ADD COLUMN IF NOT EXISTS context jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.intelligence_recommendations
  ADD COLUMN IF NOT EXISTS context jsonb NOT NULL DEFAULT '{}'::jsonb;
