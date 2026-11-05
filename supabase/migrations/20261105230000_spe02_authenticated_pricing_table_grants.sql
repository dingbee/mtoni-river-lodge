-- SPE-02 grants: enable authenticated server-function access while RLS enforces tenant boundaries.
BEGIN;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.pricing_rules TO authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.ai_pricing_recommendations TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.staynas_property_tax_rules TO authenticated;
COMMIT;
