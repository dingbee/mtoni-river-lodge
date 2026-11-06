-- SPE-02 policy cleanup: scoped FOR ALL policies already cover SELECT for the same role set.
BEGIN;
DROP POLICY IF EXISTS "Property staff read pricing rules" ON public.pricing_rules;
DROP POLICY IF EXISTS "Property staff read tax rules" ON public.staynas_property_tax_rules;
COMMIT;
