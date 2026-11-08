-- SPE-05 — property-scoped tax, fee and promotion engine.
-- Additive only. Existing booking/finance records and legacy tax rows are preserved.
BEGIN;

ALTER TABLE public.staynas_property_tax_rules
  ADD COLUMN IF NOT EXISTS tax_mode text NOT NULL DEFAULT 'exclusive',
  ADD COLUMN IF NOT EXISTS taxable_components text[] NOT NULL DEFAULT ARRAY['accommodation','extras']::text[],
  ADD COLUMN IF NOT EXISTS jurisdiction_code text,
  ADD COLUMN IF NOT EXISTS display_label text,
  ADD COLUMN IF NOT EXISTS priority integer NOT NULL DEFAULT 100,
  ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS created_by uuid,
  ADD COLUMN IF NOT EXISTS updated_by uuid;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='staynas_tax_mode_check') THEN
    ALTER TABLE public.staynas_property_tax_rules
      ADD CONSTRAINT staynas_tax_mode_check CHECK (tax_mode IN ('inclusive','exclusive'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='staynas_tax_rate_check') THEN
    ALTER TABLE public.staynas_property_tax_rules
      ADD CONSTRAINT staynas_tax_rate_check CHECK (rate >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='staynas_tax_validity_check') THEN
    ALTER TABLE public.staynas_property_tax_rules
      ADD CONSTRAINT staynas_tax_validity_check CHECK (valid_to IS NULL OR valid_from IS NULL OR valid_to >= valid_from);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.staynas_property_fee_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES public.staynas_properties(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  description text,
  calculation_type text NOT NULL CHECK (calculation_type IN ('fixed','percentage','per_night','per_guest','per_booking','per_room')),
  amount numeric(14,4) NOT NULL CHECK (amount >= 0),
  currency text,
  applies_to text[] NOT NULL DEFAULT ARRAY['accommodation']::text[],
  taxable boolean NOT NULL DEFAULT false,
  tax_rule_ids uuid[] NOT NULL DEFAULT '{}'::uuid[],
  minimum_amount numeric(14,2),
  maximum_amount numeric(14,2),
  valid_from date,
  valid_to date,
  priority integer NOT NULL DEFAULT 100,
  active boolean NOT NULL DEFAULT true,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT staynas_fee_code_unique UNIQUE(property_id, code),
  CONSTRAINT staynas_fee_validity_check CHECK(valid_to IS NULL OR valid_from IS NULL OR valid_to >= valid_from),
  CONSTRAINT staynas_fee_bounds_check CHECK(maximum_amount IS NULL OR minimum_amount IS NULL OR maximum_amount >= minimum_amount)
);

CREATE TABLE IF NOT EXISTS public.staynas_property_promotions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES public.staynas_properties(id) ON DELETE CASCADE,
  code text,
  name text NOT NULL,
  description text,
  discount_type text NOT NULL CHECK(discount_type IN ('percentage','fixed')),
  discount_value numeric(14,4) NOT NULL CHECK(discount_value > 0),
  currency text,
  eligible_room_ids uuid[] NOT NULL DEFAULT '{}'::uuid[],
  eligible_rate_plan_ids uuid[] NOT NULL DEFAULT '{}'::uuid[],
  minimum_nights integer NOT NULL DEFAULT 1 CHECK(minimum_nights > 0),
  minimum_booking_value numeric(14,2) NOT NULL DEFAULT 0 CHECK(minimum_booking_value >= 0),
  booking_window_from date,
  booking_window_to date,
  stay_from date,
  stay_to date,
  valid_from timestamptz,
  valid_to timestamptz,
  usage_limit integer CHECK(usage_limit IS NULL OR usage_limit > 0),
  per_guest_limit integer CHECK(per_guest_limit IS NULL OR per_guest_limit > 0),
  usage_count integer NOT NULL DEFAULT 0 CHECK(usage_count >= 0),
  auto_apply boolean NOT NULL DEFAULT false,
  stackable boolean NOT NULL DEFAULT false,
  priority integer NOT NULL DEFAULT 100,
  status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','scheduled','active','suspended','revoked','expired')),
  version integer NOT NULL DEFAULT 1 CHECK(version > 0),
  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT staynas_promotion_code_unique UNIQUE(property_id, code),
  CONSTRAINT staynas_promotion_dates_check CHECK(
    (booking_window_to IS NULL OR booking_window_from IS NULL OR booking_window_to >= booking_window_from)
    AND (stay_to IS NULL OR stay_from IS NULL OR stay_to >= stay_from)
    AND (valid_to IS NULL OR valid_from IS NULL OR valid_to >= valid_from)
  )
);

CREATE TABLE IF NOT EXISTS public.staynas_promotion_redemptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES public.staynas_properties(id) ON DELETE CASCADE,
  promotion_id uuid NOT NULL REFERENCES public.staynas_property_promotions(id) ON DELETE RESTRICT,
  booking_id uuid,
  guest_key text,
  discount_amount numeric(14,2) NOT NULL CHECK(discount_amount >= 0),
  currency text NOT NULL,
  redeemed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(promotion_id, booking_id)
);

CREATE INDEX IF NOT EXISTS staynas_fee_rules_active_idx
  ON public.staynas_property_fee_rules(property_id, active, priority);
CREATE INDEX IF NOT EXISTS staynas_promotions_eligible_idx
  ON public.staynas_property_promotions(property_id, status, valid_from, valid_to);
CREATE INDEX IF NOT EXISTS staynas_promotion_redemptions_guest_idx
  ON public.staynas_promotion_redemptions(promotion_id, guest_key);

ALTER TABLE public.staynas_property_fee_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staynas_property_promotions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staynas_promotion_redemptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Property staff manage fee rules" ON public.staynas_property_fee_rules;
CREATE POLICY "Property staff manage fee rules"
  ON public.staynas_property_fee_rules FOR ALL TO authenticated
  USING (public.staynas_user_has_property_access((select auth.uid()), property_id)
    AND public.has_any_role((select auth.uid()), ARRAY['owner','manager','finance','admin']::public.app_role[]))
  WITH CHECK (public.staynas_user_has_property_access((select auth.uid()), property_id)
    AND public.has_any_role((select auth.uid()), ARRAY['owner','manager','finance','admin']::public.app_role[]));

DROP POLICY IF EXISTS "Property staff manage promotions" ON public.staynas_property_promotions;
CREATE POLICY "Property staff manage promotions"
  ON public.staynas_property_promotions FOR ALL TO authenticated
  USING (public.staynas_user_has_property_access((select auth.uid()), property_id)
    AND public.has_any_role((select auth.uid()), ARRAY['owner','manager','finance','admin']::public.app_role[]))
  WITH CHECK (public.staynas_user_has_property_access((select auth.uid()), property_id)
    AND public.has_any_role((select auth.uid()), ARRAY['owner','manager','finance','admin']::public.app_role[]));

DROP POLICY IF EXISTS "Property staff read promotion redemptions" ON public.staynas_promotion_redemptions;
CREATE POLICY "Property staff read promotion redemptions"
  ON public.staynas_promotion_redemptions FOR SELECT TO authenticated
  USING (public.staynas_user_has_property_access((select auth.uid()), property_id)
    AND public.has_any_role((select auth.uid()), ARRAY['owner','manager','finance','admin']::public.app_role[]));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.staynas_property_fee_rules TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.staynas_property_promotions TO authenticated;
GRANT SELECT ON public.staynas_promotion_redemptions TO authenticated;
REVOKE ALL ON public.staynas_promotion_redemptions FROM anon, authenticated;
GRANT SELECT ON public.staynas_promotion_redemptions TO authenticated;

-- Canonical deterministic calculation kernel. Inputs are quote components emitted
-- by the SPE-04 resolver; it never resolves or mutates accommodation pricing.
CREATE OR REPLACE FUNCTION public.calculate_staynas_spe05_adjustments(
  _property_id uuid,
  _check_in date,
  _check_out date,
  _currency text,
  _components jsonb,
  _room_id uuid DEFAULT NULL,
  _rate_plan_id uuid DEFAULT NULL,
  _promo_code text DEFAULT NULL,
  _guest_key text DEFAULT NULL,
  _booking_date date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_currency text;
  v_timezone text;
  v_nights integer;
  v_guests integer;
  v_booking_date date;
  v_component record;
  v_component_total numeric := 0;
  v_discount numeric := 0;
  v_fee_total numeric := 0;
  v_tax_total numeric := 0;
  v_tax_addition numeric := 0;
  v_fee_lines jsonb := '[]'::jsonb;
  v_tax_lines jsonb := '[]'::jsonb;
  v_promo jsonb := NULL;
  v_promotions jsonb := '[]'::jsonb;
  v_promo_row public.staynas_property_promotions%ROWTYPE;
  v_promo_codes text[];
  v_promo_count integer := 0;
  v_selected_count integer := 0;
  v_auto_primary_stackable boolean := false;
  v_discount_amount numeric := 0;
  v_promo_item jsonb;
  v_fee record;
  v_tax record;
  v_taxable numeric;
  v_tax_amount numeric;
  v_fee_amount numeric;
  v_discount_base numeric;
  v_applied_promo_id uuid;
  v_component_map jsonb := '{}'::jsonb;
  v_tax_fee_total numeric := 0;
  v_tax_component_base numeric := 0;
  v_tax_discount numeric := 0;
  v_tax_base numeric := 0;
BEGIN
  IF _property_id IS NULL OR _check_in IS NULL OR _check_out <= _check_in
     OR jsonb_typeof(COALESCE(_components,'[]'::jsonb)) <> 'array' THEN
    RETURN jsonb_build_object('ok',false,'error_code','INVALID_PRICING_CONTEXT','message','Property, stay and component array are required');
  END IF;

  SELECT upper(p.currency), p.timezone INTO v_currency,v_timezone
  FROM public.staynas_properties p WHERE p.id=_property_id AND p.status='active';
  IF v_currency IS NULL OR v_currency !~ '^[A-Z]{3}$' OR v_currency <> upper(COALESCE(_currency,'')) THEN
    RETURN jsonb_build_object('ok',false,'error_code','CURRENCY_MISMATCH','message','Quote currency must match the configured property currency');
  END IF;
  IF v_timezone IS NULL OR NOT EXISTS(SELECT 1 FROM pg_timezone_names WHERE name=v_timezone) THEN
    RETURN jsonb_build_object('ok',false,'error_code','PROPERTY_CONTEXT_INVALID','message','Property timezone is invalid');
  END IF;

  v_booking_date := COALESCE(_booking_date,(now() AT TIME ZONE v_timezone)::date);
  v_nights := _check_out-_check_in;
  SELECT COALESCE(max((x->>'quantity')::integer),0) INTO v_guests
  FROM jsonb_array_elements(_components) x
  WHERE x->>'component_type'='guest_count';
  FOR v_component IN SELECT value FROM jsonb_array_elements(_components)
  LOOP
    IF COALESCE(v_component.value->>'component_type','')='guest_count' THEN CONTINUE; END IF;
    IF jsonb_typeof(v_component.value->'amount') IS DISTINCT FROM 'number'
       OR (v_component.value->>'amount')::numeric < 0 THEN
      RETURN jsonb_build_object('ok',false,'error_code','INVALID_COMPONENT','message','Each pricing component requires a non-negative numeric amount');
    END IF;
    IF COALESCE(v_component.value->>'currency',v_currency) <> v_currency THEN
      RETURN jsonb_build_object('ok',false,'error_code','CURRENCY_MISMATCH','message','Component currency differs from property currency');
    END IF;
    v_component_total := round(v_component_total + (v_component.value->>'amount')::numeric,2);
    v_component_map := v_component_map || jsonb_build_object(
      COALESCE(v_component.value->>'component_type','accommodation'),
      COALESCE((v_component_map->>COALESCE(v_component.value->>'component_type','accommodation'))::numeric,0)
        + (v_component.value->>'amount')::numeric
    );
  END LOOP;

  -- Explicit codes may be comma-separated. Multiple explicit promotions are
  -- accepted only when every selected promotion is explicitly stackable.
  IF _promo_code IS NOT NULL AND btrim(_promo_code) <> '' THEN
    SELECT array_agg(upper(btrim(code_part)))
      INTO v_promo_codes
    FROM unnest(string_to_array(_promo_code,',')) AS codes(code_part)
    WHERE btrim(code_part)<>'';
    IF COALESCE(cardinality(v_promo_codes),0)=0
       OR cardinality(v_promo_codes)<>cardinality(string_to_array(_promo_code,','))
       OR cardinality(v_promo_codes)<>(SELECT count(DISTINCT code) FROM unnest(v_promo_codes) AS codes(code)) THEN
      RETURN jsonb_build_object('ok',false,'error_code','PROMOTION_INVALID','message','Promotion codes must be non-empty and unique');
    END IF;
    SELECT count(*) INTO v_promo_count
    FROM public.staynas_property_promotions p
    WHERE p.property_id=_property_id AND upper(p.code)=ANY(v_promo_codes);
    IF v_promo_count<>cardinality(v_promo_codes) THEN
      RETURN jsonb_build_object('ok',false,'error_code','PROMOTION_INVALID','message','One or more promotion codes are not recognised');
    END IF;
    IF v_promo_count>1 AND EXISTS(
      SELECT 1 FROM public.staynas_property_promotions p
      WHERE p.property_id=_property_id AND upper(p.code)=ANY(v_promo_codes) AND p.stackable=false
    ) THEN
      RETURN jsonb_build_object('ok',false,'error_code','PROMOTION_STACKING_CONFLICT',
        'message','Every promotion in a stacked code set must be configured as stackable');
    END IF;
  ELSE
    SELECT p.stackable INTO v_auto_primary_stackable
    FROM public.staynas_property_promotions p
    WHERE p.property_id=_property_id AND p.auto_apply=true AND p.status='active'
      AND (p.valid_from IS NULL OR p.valid_from<=now())
      AND (p.valid_to IS NULL OR p.valid_to>now())
      AND (p.booking_window_from IS NULL OR p.booking_window_from<=v_booking_date)
      AND (p.booking_window_to IS NULL OR p.booking_window_to>=v_booking_date)
      AND (p.stay_from IS NULL OR p.stay_from<=_check_in)
      AND (p.stay_to IS NULL OR p.stay_to>=_check_out-1)
      AND p.minimum_nights<=v_nights
      AND (cardinality(p.eligible_room_ids)=0 OR _room_id=ANY(p.eligible_room_ids))
      AND (cardinality(p.eligible_rate_plan_ids)=0 OR _rate_plan_id=ANY(p.eligible_rate_plan_ids))
      AND v_component_total>=p.minimum_booking_value
      AND (p.currency IS NULL OR upper(p.currency)=v_currency)
      AND (p.usage_limit IS NULL OR p.usage_count<p.usage_limit)
      AND (_guest_key IS NULL OR p.per_guest_limit IS NULL OR
        (SELECT count(*) FROM public.staynas_promotion_redemptions r
         WHERE r.promotion_id=p.id AND r.guest_key=_guest_key)<p.per_guest_limit)
    ORDER BY p.priority,p.id LIMIT 1;
  END IF;

  FOR v_promo_row IN
    SELECT p.* FROM public.staynas_property_promotions p
    WHERE p.property_id=_property_id
      AND (
        (_promo_codes IS NOT NULL AND upper(p.code)=ANY(v_promo_codes))
        OR
        (_promo_codes IS NULL AND p.auto_apply=true AND p.status='active'
          AND (p.valid_from IS NULL OR p.valid_from<=now())
          AND (p.valid_to IS NULL OR p.valid_to>now())
          AND (p.booking_window_from IS NULL OR p.booking_window_from<=v_booking_date)
          AND (p.booking_window_to IS NULL OR p.booking_window_to>=v_booking_date)
          AND (p.stay_from IS NULL OR p.stay_from<=_check_in)
          AND (p.stay_to IS NULL OR p.stay_to>=_check_out-1)
          AND p.minimum_nights<=v_nights
          AND (cardinality(p.eligible_room_ids)=0 OR _room_id=ANY(p.eligible_room_ids))
          AND (cardinality(p.eligible_rate_plan_ids)=0 OR _rate_plan_id=ANY(p.eligible_rate_plan_ids))
          AND v_component_total>=p.minimum_booking_value
          AND (p.currency IS NULL OR upper(p.currency)=v_currency)
          AND (p.usage_limit IS NULL OR p.usage_count<p.usage_limit)
          AND (_guest_key IS NULL OR p.per_guest_limit IS NULL OR
            (SELECT count(*) FROM public.staynas_promotion_redemptions r
             WHERE r.promotion_id=p.id AND r.guest_key=_guest_key)<p.per_guest_limit))
      )
    ORDER BY p.priority,p.id
    FOR SHARE
  LOOP
    IF _promo_codes IS NULL AND v_selected_count>0
       AND (NOT v_auto_primary_stackable OR NOT v_promo_row.stackable) THEN
      EXIT;
    END IF;
    IF v_promo_row.status <> 'active'
       OR (v_promo_row.valid_from IS NOT NULL AND v_promo_row.valid_from>now())
       OR (v_promo_row.valid_to IS NOT NULL AND v_promo_row.valid_to<=now())
       OR (v_promo_row.booking_window_from IS NOT NULL AND v_booking_date<v_promo_row.booking_window_from)
       OR (v_promo_row.booking_window_to IS NOT NULL AND v_booking_date>v_promo_row.booking_window_to)
       OR (_check_in < COALESCE(v_promo_row.stay_from,_check_in))
       OR (_check_out-1 > COALESCE(v_promo_row.stay_to,_check_out-1))
       OR v_nights < v_promo_row.minimum_nights
       OR (cardinality(v_promo_row.eligible_room_ids)>0 AND NOT (_room_id=ANY(v_promo_row.eligible_room_ids)))
       OR (cardinality(v_promo_row.eligible_rate_plan_ids)>0 AND NOT (_rate_plan_id=ANY(v_promo_row.eligible_rate_plan_ids)))
       OR v_component_total < v_promo_row.minimum_booking_value
       OR (v_promo_row.currency IS NOT NULL AND upper(v_promo_row.currency)<>v_currency)
       OR (v_promo_row.usage_limit IS NOT NULL AND v_promo_row.usage_count>=v_promo_row.usage_limit)
       OR (_guest_key IS NOT NULL AND v_promo_row.per_guest_limit IS NOT NULL AND
           (SELECT count(*) FROM public.staynas_promotion_redemptions r
            WHERE r.promotion_id=v_promo_row.id AND r.guest_key=_guest_key)>=v_promo_row.per_guest_limit) THEN
      RETURN jsonb_build_object('ok',false,'error_code','PROMOTION_INELIGIBLE','message','Promotion does not satisfy its configured eligibility rules',
        'promotion_id',v_promo_row.id,'promotion_version',v_promo_row.version);
    END IF;

    v_discount_base := GREATEST(0,v_component_total-v_discount);
    IF v_promo_row.discount_type='percentage' THEN
      v_discount_amount := round(v_discount_base*v_promo_row.discount_value/100,2);
    ELSE
      v_discount_amount := LEAST(v_discount_base,round(v_promo_row.discount_value,2));
    END IF;
    v_discount_amount := LEAST(v_discount_amount,v_discount_base);
    v_discount := round(v_discount+v_discount_amount,2);
    v_promo_item := jsonb_build_object('id',v_promo_row.id,'code',v_promo_row.code,'name',v_promo_row.name,
      'version',v_promo_row.version,'discount_type',v_promo_row.discount_type,
      'discount_value',v_promo_row.discount_value,'discount_amount',v_discount_amount,'currency',v_currency,
      'stackable',v_promo_row.stackable,'priority',v_promo_row.priority);
    v_promotions := v_promotions || jsonb_build_array(v_promo_item);
    IF v_promo IS NULL THEN v_promo:=v_promo_item; END IF;
    v_applied_promo_id := v_promo_row.id;
    v_selected_count := v_selected_count+1;
  END LOOP;

  -- Fees are calculated after discounts. The applicable base is explicitly
  -- derived from component tags; no hidden country or tax assumptions exist.
  FOR v_fee IN
    SELECT f.* FROM public.staynas_property_fee_rules f
    WHERE f.property_id=_property_id AND f.active=true
      AND (f.valid_from IS NULL OR f.valid_from<=_check_in)
      AND (f.valid_to IS NULL OR f.valid_to>=_check_out-1)
    ORDER BY f.priority,f.id
    FOR SHARE
  LOOP
    IF v_fee.currency IS NOT NULL AND upper(v_fee.currency)<>v_currency THEN
      RETURN jsonb_build_object('ok',false,'error_code','CURRENCY_MISMATCH','message','Fee currency differs from property currency','fee_id',v_fee.id);
    END IF;
    SELECT COALESCE(sum((x->>'amount')::numeric),0) INTO v_taxable
    FROM jsonb_array_elements(_components) x
    WHERE COALESCE(x->>'component_type','accommodation')=ANY(v_fee.applies_to);
    v_discount_base := CASE WHEN v_component_total>0
      THEN round(v_discount*v_taxable/v_component_total,2) ELSE 0 END;
    v_fee_amount := CASE v_fee.calculation_type
      WHEN 'fixed' THEN v_fee.amount
      WHEN 'percentage' THEN round(GREATEST(0,v_taxable-v_discount_base)*v_fee.amount/100,2)
      WHEN 'per_night' THEN v_fee.amount*v_nights
      WHEN 'per_guest' THEN v_fee.amount*v_guests
      WHEN 'per_booking' THEN v_fee.amount
      WHEN 'per_room' THEN v_fee.amount
      ELSE 0 END;
    v_fee_amount := round(GREATEST(COALESCE(v_fee.minimum_amount,0),v_fee_amount),2);
    IF v_fee.maximum_amount IS NOT NULL THEN v_fee_amount:=LEAST(v_fee_amount,v_fee.maximum_amount); END IF;
    v_fee_total:=round(v_fee_total+v_fee_amount,2);
    v_fee_lines:=v_fee_lines||jsonb_build_array(jsonb_build_object('id',v_fee.id,'code',v_fee.code,'name',v_fee.name,
      'version',v_fee.version,'amount',v_fee_amount,'currency',v_currency,'taxable',v_fee.taxable,
      'tax_rule_ids',to_jsonb(v_fee.tax_rule_ids),'included',false));
  END LOOP;

  -- Fee-to-tax mappings are explicit: an empty tax_rule_ids array means the
  -- fee is taxable under every property rule that declares the fee component.
  SELECT COALESCE(sum((x->>'amount')::numeric),0) INTO v_tax_fee_total
  FROM jsonb_array_elements(v_fee_lines) x
  WHERE x->>'taxable'='true';

  -- A configured tax rule in another currency is a configuration error, not
  -- a rule to silently skip. Property currency remains the sole quote currency.
  IF EXISTS(
    SELECT 1 FROM public.staynas_property_tax_rules t
    WHERE t.property_id=_property_id AND t.active=true
      AND (t.valid_from IS NULL OR t.valid_from<=_check_in)
      AND (t.valid_to IS NULL OR t.valid_to>=_check_out-1)
      AND t.currency IS NOT NULL AND upper(t.currency)<>v_currency
  ) THEN
    RETURN jsonb_build_object('ok',false,'error_code','CURRENCY_MISMATCH',
      'message','An active tax rule uses a currency different from the property currency');
  END IF;

  -- Tax rules run in deterministic priority order. Inclusive rules are
  -- disclosed in the total but do not increase payable; exclusive rules do.
  FOR v_tax IN
    SELECT t.* FROM public.staynas_property_tax_rules t
    WHERE t.property_id=_property_id AND t.active=true
      AND (t.valid_from IS NULL OR t.valid_from<=_check_in)
      AND (t.valid_to IS NULL OR t.valid_to>=_check_out-1)
      AND (t.currency IS NULL OR upper(t.currency)=v_currency)
    ORDER BY t.priority,t.id
    FOR SHARE
  LOOP
    SELECT COALESCE(sum((x->>'amount')::numeric),0) INTO v_tax_component_base
    FROM jsonb_array_elements(_components) x
    WHERE (
      (COALESCE(x->>'component_type','accommodation')='fee' AND 'fee'=ANY(v_tax.taxable_components))
      OR (
        COALESCE(x->>'component_type','accommodation')<>'fee'
        AND COALESCE(x->>'component_type','accommodation')=ANY(v_tax.taxable_components)
        AND (v_tax.applies_to='all' OR COALESCE(x->>'component_type','accommodation')=v_tax.applies_to)
      )
    );
    v_tax_discount := CASE WHEN v_component_total>0
      THEN round(v_discount*v_tax_component_base/v_component_total,2) ELSE 0 END;
    v_taxable := v_tax_component_base;
    IF 'fee'=ANY(v_tax.taxable_components) THEN
      SELECT COALESCE(sum((x->>'amount')::numeric),0) INTO v_tax_fee_total
      FROM jsonb_array_elements(v_fee_lines) x
      WHERE x->>'taxable'='true'
        AND (COALESCE(jsonb_array_length(x->'tax_rule_ids'),0)=0
          OR (x->'tax_rule_ids') @> jsonb_build_array(v_tax.id::text));
      v_taxable:=v_taxable+v_tax_fee_total;
    END IF;
    IF v_tax.is_compound THEN v_taxable:=v_taxable+v_tax_total; END IF;
    IF v_taxable=0 THEN CONTINUE; END IF;
    v_tax_base := GREATEST(0,v_taxable-v_tax_discount);
    IF v_tax.calculation_type IN ('percentage','percent','exclusive_percent','inclusive_percent') THEN
      IF v_tax.calculation_type='inclusive_percent'
         OR (v_tax.calculation_type<>'exclusive_percent' AND v_tax.tax_mode='inclusive') THEN
        v_tax_amount:=CASE WHEN v_tax.rate>=0
          THEN round(v_tax_base*v_tax.rate/(100+v_tax.rate),2) ELSE 0 END;
      ELSE
        v_tax_amount:=round(v_tax_base*v_tax.rate/100,2);
      END IF;
    ELSIF v_tax.calculation_type IN ('fixed','fixed_per_booking') THEN
      v_tax_amount:=round(v_tax.rate,2);
    ELSIF v_tax.calculation_type='fixed_per_night' THEN
      v_tax_amount:=round(v_tax.rate*v_nights,2);
    ELSE
      RETURN jsonb_build_object('ok',false,'error_code','INVALID_TAX_CONFIGURATION','message','Unsupported tax calculation type','tax_rule_id',v_tax.id);
    END IF;
    v_tax_total:=round(v_tax_total+v_tax_amount,2);
    IF (CASE
      WHEN v_tax.calculation_type='inclusive_percent' THEN false
      WHEN v_tax.calculation_type='exclusive_percent' THEN true
      ELSE v_tax.tax_mode='exclusive'
    END) THEN v_tax_addition:=round(v_tax_addition+v_tax_amount,2); END IF;
    v_tax_lines:=v_tax_lines||jsonb_build_array(jsonb_build_object('id',v_tax.id,'name',v_tax.name,
      'label',COALESCE(v_tax.display_label,v_tax.name),'tax_code',v_tax.tax_code,'version',v_tax.version,
      'rate',v_tax.rate,'calculation_type',v_tax.calculation_type,
      'tax_mode',CASE WHEN v_tax.calculation_type='inclusive_percent' THEN 'inclusive'
                      WHEN v_tax.calculation_type='exclusive_percent' THEN 'exclusive'
                      ELSE v_tax.tax_mode END,
      'taxable_amount',v_taxable,'amount',v_tax_amount,'currency',v_currency));
  END LOOP;

  RETURN jsonb_build_object('ok',true,'property_id',_property_id,'currency',v_currency,'timezone',v_timezone,
    'component_subtotal',v_component_total,'discount_total',v_discount,'promotion',v_promo,'promotions',v_promotions,
    'fees',v_fee_lines,'fee_total',v_fee_total,'taxes',v_tax_lines,'tax_total',v_tax_total,
    'tax_addition',v_tax_addition,'total',round(v_component_total-v_discount+v_fee_total+v_tax_addition,2),
    'check_in',_check_in,'check_out',_check_out,'nights',v_nights);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('ok',false,'error_code','SPE05_CALCULATION_FAILED','message','Tax, fee or promotion calculation failed closed');
END;
$function$;

REVOKE ALL ON FUNCTION public.calculate_staynas_spe05_adjustments(uuid,date,date,text,jsonb,uuid,uuid,text,text,date) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.calculate_staynas_spe05_adjustments(uuid,date,date,text,jsonb,uuid,uuid,text,text,date) TO service_role;

COMMIT;
