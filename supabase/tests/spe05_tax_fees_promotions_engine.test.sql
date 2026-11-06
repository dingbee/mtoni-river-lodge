-- SPE-05 contract tests. Transaction is rolled back; no property data is written.
BEGIN;
SELECT plan(26);

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
    LIKE '%PROMOTION_STACKING_CONFLICT%'
  AND pg_get_functiondef('public.calculate_staynas_spe05_adjustments(uuid,date,date,text,jsonb,uuid,uuid,text,text,date)'::regprocedure)
    LIKE '%v_promotions%',
  'Stacked promotions require explicit compatibility and produce per-promotion breakdowns');


SELECT has_column('public','bookings','fee_total','Booking records fee totals');
SELECT has_column('public','bookings','discount_total','Booking records discount totals');

SELECT ok(
  pg_get_functiondef('public.calculate_staynas_booking_quote(uuid,uuid,date,date,integer,integer,integer,jsonb)'::regprocedure)
    LIKE '%calculate_staynas_spe05_adjustments%'
  AND pg_get_functiondef('public.calculate_staynas_booking_quote(uuid,uuid,date,date,integer,integer,integer,jsonb)'::regprocedure)
    LIKE '%fee_total%'
  AND pg_get_functiondef('public.calculate_staynas_booking_quote(uuid,uuid,date,date,integer,integer,integer,jsonb)'::regprocedure)
    LIKE '%discount_total%',
  'Canonical quote path consumes SPE-05 and exposes fee/discount breakdowns');

SELECT ok(
  pg_get_functiondef('public.create_booking_for_property(uuid,text,date,date,integer,integer,text,text,text,text,text,jsonb,integer,integer,uuid,text,text)'::regprocedure)
    LIKE '%redeem_staynas_promotion%'
  AND pg_get_functiondef('public.create_booking_for_property(uuid,text,date,date,integer,integer,text,text,text,text,text,jsonb,integer,integer,uuid,text,text)'::regprocedure)
    LIKE '%fee_total%'
  AND pg_get_functiondef('public.create_booking_for_property(uuid,text,date,date,integer,integer,text,text,text,text,text,jsonb,integer,integer,uuid,text,text)'::regprocedure)
    LIKE '%pricing_snapshot%' AND
  pg_get_functiondef('public.create_booking_for_property(uuid,text,date,date,integer,integer,text,text,text,text,text,jsonb,integer,integer,uuid,text,text)'::regprocedure)
    LIKE '%v_quote%',
  'Booking transaction redeems promotions and snapshots adjustment totals');

SELECT has_function(
  'public','get_staynas_booking_quote_with_rate_plan_and_promo',
  ARRAY['uuid','text','date','date','integer','integer','integer','jsonb','uuid','text','text'],
  'Guest quote accepts a promotion code through the canonical rate-plan path');

SELECT has_function(
  'public','create_booking_for_property_with_rate_plan_and_promo',
  ARRAY['uuid','text','date','date','integer','integer','text','text','text','text','text','jsonb','integer','integer','uuid','text','text','uuid','text'],
  'Transactional booking accepts a promotion code without bypassing the existing booking transaction');


SELECT ok(
  pg_get_functiondef('public.calculate_staynas_spe05_adjustments(uuid,date,date,text,jsonb,uuid,uuid,text,text,date)'::regprocedure)
    LIKE '%v_tax_base*v_tax.rate/(100+v_tax.rate)%'
  AND pg_get_functiondef('public.calculate_staynas_spe05_adjustments(uuid,date,date,text,jsonb,uuid,uuid,text,text,date)'::regprocedure)
    LIKE '%v_tax.applies_to=''all''%',
  'Inclusive tax is extracted from gross and legacy tax applicability remains respected');

SELECT ok(
  pg_get_functiondef('public.create_booking_for_property(uuid,text,date,date,integer,integer,text,text,text,text,text,jsonb,integer,integer,uuid,text,text)'::regprocedure)
    LIKE '%jsonb_array_elements(v_promotions)%'
  AND pg_get_functiondef('public.create_booking_for_property(uuid,text,date,date,integer,integer,text,text,text,text,text,jsonb,integer,integer,uuid,text,text)'::regprocedure)
    LIKE '%redeem_staynas_promotion%',
  'Every accepted stacked promotion is redeemed inside the booking transaction');


SELECT ok(
  pg_get_functiondef('public.preview_staynas_pricing_adjustments(uuid,uuid,date,date,integer,integer,integer,jsonb,uuid,text,text)'::regprocedure)
    LIKE '%staynas_active_property_id%'
  AND pg_get_functiondef('public.preview_staynas_pricing_adjustments(uuid,uuid,date,date,integer,integer,integer,jsonb,uuid,text,text)'::regprocedure)
    LIKE '%has_any_role%'
  AND pg_get_functiondef('public.preview_staynas_pricing_adjustments(uuid,uuid,date,date,integer,integer,integer,jsonb,uuid,text,text)'::regprocedure)
    LIKE '%calculate_staynas_booking_quote%',
  'Pricing preview is property-authorized and reuses the canonical quote pipeline');


SELECT ok(
  NOT has_function_privilege('anon','public.preview_staynas_pricing_adjustments(uuid,uuid,date,date,integer,integer,integer,jsonb,uuid,text,text)','EXECUTE')
  AND has_function_privilege('authenticated','public.preview_staynas_pricing_adjustments(uuid,uuid,date,date,integer,integer,integer,jsonb,uuid,text,text)','EXECUTE'),
  'Pricing preview is available to authenticated property staff but not anonymous callers');


SELECT ok(
  EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.staynas_property_promotions'::regclass AND conname='staynas_promotion_percentage_max_check')
  AND EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.staynas_property_promotions'::regclass AND conname='staynas_promotion_booking_window_check')
  AND EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.staynas_property_promotions'::regclass AND conname='staynas_promotion_stay_window_check'),
  'Promotion discount and date-window invariants are enforced by database constraints');

SELECT * FROM finish();
ROLLBACK;
