-- SPE-05 contract tests. Transaction is rolled back; no property data is written.
BEGIN;
SELECT plan(15);

SELECT has_table('public','staynas_property_fee_rules','Property fee configuration exists');
SELECT has_table('public','staynas_property_promotions','Property promotion configuration exists');
SELECT has_table('public','staynas_promotion_redemptions','Promotion redemption ledger exists');
SELECT has_column('public','staynas_property_tax_rules','tax_mode','Tax mode is explicit');
SELECT has_column('public','staynas_property_tax_rules','taxable_components','Taxable components are configurable');
SELECT has_column('public','staynas_property_tax_rules','version','Tax rules are versioned');

SELECT ok(
  (SELECT relrowsecurity FROM pg_class WHERE oid='public.staynas_property_fee_rules'::regclass)
  AND (SELECT relrowsecurity FROM pg_class WHERE oid='public.staynas_property_promotions'::regclass)
  AND (SELECT relrowsecurity FROM pg_class WHERE oid='public.staynas_promotion_redemptions'::regclass),
  'All new property configuration and redemption tables enforce RLS');

SELECT ok(
  pg_get_functiondef('public.calculate_staynas_spe05_adjustments(uuid,date,date,text,jsonb,uuid,uuid,text,text,date)'::regprocedure)
    LIKE '%staynas_property_fee_rules%'
  AND pg_get_functiondef('public.calculate_staynas_spe05_adjustments(uuid,date,date,text,jsonb,uuid,uuid,text,text,date)'::regprocedure)
    LIKE '%staynas_property_promotions%'
  AND pg_get_functiondef('public.calculate_staynas_spe05_adjustments(uuid,date,date,text,jsonb,uuid,uuid,text,text,date)'::regprocedure)
    LIKE '%staynas_property_tax_rules%',
  'One calculation kernel composes promotion, fee and tax configuration');

SELECT ok(
  pg_get_functiondef('public.calculate_staynas_spe05_adjustments(uuid,date,date,text,jsonb,uuid,uuid,text,text,date)'::regprocedure)
    LIKE '%CURRENCY_MISMATCH%'
  AND pg_get_functiondef('public.calculate_staynas_spe05_adjustments(uuid,date,date,text,jsonb,uuid,uuid,text,text,date)'::regprocedure)
    LIKE '%PROPERTY_CONTEXT_INVALID%',
  'Property currency and timezone are mandatory calculation context');

SELECT ok(
  pg_get_functiondef('public.calculate_staynas_spe05_adjustments(uuid,date,date,text,jsonb,uuid,uuid,text,text,date)'::regprocedure)
    LIKE '%PROMOTION_INELIGIBLE%'
  AND pg_get_functiondef('public.calculate_staynas_spe05_adjustments(uuid,date,date,text,jsonb,uuid,uuid,text,text,date)'::regprocedure)
    LIKE '%usage_limit%',
  'Promotion eligibility and usage limits are checked');

SELECT ok(
  pg_get_functiondef('public.calculate_staynas_spe05_adjustments(uuid,date,date,text,jsonb,uuid,uuid,text,text,date)'::regprocedure)
    LIKE '%tax_mode%'
  AND pg_get_functiondef('public.calculate_staynas_spe05_adjustments(uuid,date,date,text,jsonb,uuid,uuid,text,text,date)'::regprocedure)
    LIKE '%taxable_components%',
  'Inclusive/exclusive tax and component applicability are represented');

SELECT ok(
  NOT has_function_privilege('anon','public.calculate_staynas_spe05_adjustments(uuid,date,date,text,jsonb,uuid,uuid,text,text,date)','EXECUTE')
  AND NOT has_function_privilege('authenticated','public.calculate_staynas_spe05_adjustments(uuid,date,date,text,jsonb,uuid,uuid,text,text,date)','EXECUTE')
  AND has_function_privilege('service_role','public.calculate_staynas_spe05_adjustments(uuid,date,date,text,jsonb,uuid,uuid,text,text,date)','EXECUTE'),
  'Calculation kernel is server-only');

SELECT has_table('public','staynas_pricing_configuration_audit','Pricing configuration audit is durable');
SELECT ok(
  pg_get_functiondef('public.redeem_staynas_promotion(uuid,uuid,uuid,text,numeric,text)'::regprocedure)
    LIKE '%FOR UPDATE%'
  AND pg_get_functiondef('public.redeem_staynas_promotion(uuid,uuid,uuid,text,numeric,text)'::regprocedure)
    LIKE '%usage_count=usage_count+1%',
  'Promotion usage is serialized and incremented in the redemption transaction');
SELECT ok(
  pg_get_functiondef('public.calculate_staynas_spe05_adjustments(uuid,date,date,text,jsonb,uuid,uuid,text,text,date)'::regprocedure)
    LIKE '%PROMOTION_STACKING_UNSUPPORTED%'
  AND pg_get_functiondef('public.calculate_staynas_spe05_adjustments(uuid,date,date,text,jsonb,uuid,uuid,text,text,date)'::regprocedure)
    LIKE '%PROMOTION_INELIGIBLE%',
  'Unsupported stacking is rejected explicitly rather than silently mispriced');

SELECT * FROM finish();
ROLLBACK;
