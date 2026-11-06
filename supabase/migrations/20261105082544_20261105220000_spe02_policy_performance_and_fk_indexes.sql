-- SPE-02: optimize property-scoped policy auth lookups and cover new foreign keys.
BEGIN;

ALTER POLICY "Property finance manage pricing rules" ON public.pricing_rules
USING (
  public.staynas_user_has_property_access((select auth.uid()), property_id)
  AND public.has_any_role((select auth.uid()), ARRAY['owner','manager','finance','admin']::public.app_role[])
)
WITH CHECK (
  public.staynas_user_has_property_access((select auth.uid()), property_id)
  AND public.has_any_role((select auth.uid()), ARRAY['owner','manager','finance','admin']::public.app_role[])
);

ALTER POLICY "Property staff read AI pricing recommendations" ON public.ai_pricing_recommendations
USING (
  public.staynas_user_has_property_access((select auth.uid()), property_id)
  AND public.has_any_role((select auth.uid()), ARRAY['owner','manager','finance','admin']::public.app_role[])
);

ALTER POLICY "Property staff create AI pricing recommendations" ON public.ai_pricing_recommendations
WITH CHECK (
  public.staynas_user_has_property_access((select auth.uid()), property_id)
  AND public.has_any_role((select auth.uid()), ARRAY['owner','manager','finance','admin']::public.app_role[])
);

ALTER POLICY "Property staff action AI pricing recommendations" ON public.ai_pricing_recommendations
USING (
  public.staynas_user_has_property_access((select auth.uid()), property_id)
  AND public.has_any_role((select auth.uid()), ARRAY['owner','manager','finance','admin']::public.app_role[])
)
WITH CHECK (
  public.staynas_user_has_property_access((select auth.uid()), property_id)
  AND public.has_any_role((select auth.uid()), ARRAY['owner','manager','finance','admin']::public.app_role[])
);

ALTER POLICY "Property finance manage tax rules" ON public.staynas_property_tax_rules
USING (
  public.staynas_user_has_property_access((select auth.uid()), property_id)
  AND public.has_any_role((select auth.uid()), ARRAY['owner','manager','finance','admin']::public.app_role[])
)
WITH CHECK (
  public.staynas_user_has_property_access((select auth.uid()), property_id)
  AND public.has_any_role((select auth.uid()), ARRAY['owner','manager','finance','admin']::public.app_role[])
);

CREATE INDEX IF NOT EXISTS pricing_rules_room_property_spe02_idx
  ON public.pricing_rules (room_id, property_id);
CREATE INDEX IF NOT EXISTS ai_pricing_recommendations_room_property_spe02_idx
  ON public.ai_pricing_recommendations (room_id, property_id);
CREATE INDEX IF NOT EXISTS ai_pricing_recommendations_actioned_by_spe02_idx
  ON public.ai_pricing_recommendations (actioned_by);

COMMIT;
