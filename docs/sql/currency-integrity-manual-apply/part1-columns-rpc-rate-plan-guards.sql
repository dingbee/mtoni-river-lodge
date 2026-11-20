-- Part 1 of 4 for manual application in the Supabase SQL editor (phone-clipboard sized).
-- Identical statements to supabase/migrations/20261120120000_staynas_currency_integrity.sql.
-- Run parts 1-4 in order; each part is atomic and safe to re-run.
-- StayNas currency integrity (P0): the property's ISO 4217 currency is the single
-- authoritative currency for sellable pricing, quotes and booking persistence.
--
-- Corrects, without touching any existing reservation, payment, folio or audit row:
--  1. staynas_update_property_currency wrote updated_at without column privilege, so
--     the invoker RPC failed with "permission denied"; the BEFORE UPDATE trigger owns it.
--  2. After a property currency change, old-currency rate plans could not be suspended
--     or archived (context/daily/seasonal guards rejected every update), so they kept
--     selling in the old currency next to new-currency plans.
--  3. The published resolver sold plans whose currency differs from the property
--     currency; discovery listed them and the quote then failed (CURRENCY_MISMATCH).
--  4. Priced availability paired the quote total with the legacy rooms.currency.
--  5. create_booking_for_property persisted bookings.currency from rooms.currency
--     instead of the priced quote currency (silent reinterpretation of the amount).
--  6. Legacy create_booking overloads priced from rooms.base_price/rooms.currency and
--     were executable by anon/authenticated, bypassing canonical server pricing.
--  7. Adds a read-only reconciliation report; mismatched history is classified, never rewritten.
-- Rollback: re-apply the previous definitions from 20261119130000, 20261110130000,
-- 20261105171131/20261106100141, 20261109190000 and 20261106151259; the report function
-- and split triggers can be dropped/recreated. No data is modified by this migration.
BEGIN;

-- Production parity: generated database types (production) carry these columns but no
-- repository migration creates them. Idempotent; a no-op where they already exist.
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS tax_addition numeric(14,2) NOT NULL DEFAULT 0;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS tax_breakdown jsonb NOT NULL DEFAULT '[]'::jsonb;

-- 1. Invoker RPC updates only the granted column; staynas_properties_updated_at maintains updated_at.
CREATE OR REPLACE FUNCTION public.staynas_update_property_currency(_currency text)
 RETURNS TABLE(property_id uuid, currency text, updated_at timestamp with time zone)
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_property_id uuid;
  v_currency text := upper(trim(_currency));
  v_updated_at timestamptz;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF v_currency IS NULL OR v_currency !~ '^[A-Z]{3}$' THEN
    RAISE EXCEPTION 'Currency must be a three-letter ISO 4217 code';
  END IF;
  v_property_id := public.staynas_active_property_id(v_uid);
  IF v_property_id IS NULL
     OR NOT public.staynas_user_has_property_access(v_uid, v_property_id)
     OR NOT public.has_any_role(v_uid, ARRAY['owner','manager','admin']::public.app_role[]) THEN
    RAISE EXCEPTION 'Property owner or manager access is required to change operating currency';
  END IF;
  UPDATE public.staynas_properties AS p
  SET currency = v_currency
  WHERE p.id = v_property_id AND p.status IN ('active','setup')
  RETURNING p.updated_at INTO v_updated_at;
  IF NOT FOUND THEN RAISE EXCEPTION 'Active property configuration was not found'; END IF;
  RETURN QUERY SELECT v_property_id, v_currency, v_updated_at;
END;
$function$;

REVOKE ALL ON FUNCTION public.staynas_update_property_currency(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.staynas_update_property_currency(text) TO authenticated, service_role;

-- 2. Rate-plan guards allow an old-currency plan to be suspended or archived.
CREATE OR REPLACE FUNCTION public.validate_staynas_rate_plan_context()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  property_currency text;
  parent_row public.staynas_rate_plans%ROWTYPE;
BEGIN
  SELECT upper(currency) INTO property_currency
  FROM public.staynas_properties
  WHERE id=NEW.property_id;
  IF property_currency IS NULL OR property_currency !~ '^[A-Z]{3}$' THEN
    RAISE EXCEPTION 'Rate plan property must have an explicit valid currency';
  END IF;
  -- A plan must be priced in the property currency whenever it is created, (re)published
  -- or its commercial terms change. Suspending/archiving a plan left in a previous property
  -- currency stays possible so it can be withdrawn; its amounts are never reinterpreted.
  IF TG_OP='INSERT'
     OR NEW.publication_status='published'
     OR upper(NEW.currency) IS DISTINCT FROM upper(OLD.currency)
     OR NEW.rate_plan_data IS DISTINCT FROM OLD.rate_plan_data
     OR NEW.pricing_basis IS DISTINCT FROM OLD.pricing_basis
     OR NEW.parent_rate_plan_id IS DISTINCT FROM OLD.parent_rate_plan_id THEN
    IF upper(NEW.currency) <> property_currency THEN
      RAISE EXCEPTION 'Rate plan currency % must match property currency %. Re-enter its rates in %.',NEW.currency,property_currency,property_currency;
    END IF;
    NEW.currency := property_currency;
  ELSE
    NEW.currency := upper(NEW.currency);
  END IF;
  NEW.code := upper(trim(NEW.code));
  NEW.name := trim(NEW.name);
  IF NEW.parent_rate_plan_id IS NOT NULL THEN
    SELECT * INTO parent_row FROM public.staynas_rate_plans
    WHERE id=NEW.parent_rate_plan_id AND property_id=NEW.property_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Parent rate plan must belong to the same property'; END IF;
    IF EXISTS (
      WITH RECURSIVE ancestors(id,parent_rate_plan_id,path,cycle) AS (
        SELECT p.id,p.parent_rate_plan_id,ARRAY[p.id],false
        FROM public.staynas_rate_plans p
        WHERE p.id=NEW.parent_rate_plan_id AND p.property_id=NEW.property_id
        UNION ALL
        SELECT p.id,p.parent_rate_plan_id,a.path||p.id,p.id=ANY(a.path)
        FROM public.staynas_rate_plans p
        JOIN ancestors a ON p.id=a.parent_rate_plan_id
        WHERE p.property_id=NEW.property_id AND NOT a.cycle
      )
      SELECT 1 FROM ancestors WHERE id=NEW.id OR cycle
    ) THEN
      RAISE EXCEPTION 'Circular rate-plan inheritance is not permitted';
    END IF;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS staynas_rate_plans_daily_rates_guard ON public.staynas_rate_plans;
DROP TRIGGER IF EXISTS staynas_rate_plans_daily_rates_guard_update ON public.staynas_rate_plans;
CREATE TRIGGER staynas_rate_plans_daily_rates_guard
  BEFORE INSERT ON public.staynas_rate_plans
  FOR EACH ROW EXECUTE FUNCTION public.validate_staynas_rate_plan_daily_rates();
CREATE TRIGGER staynas_rate_plans_daily_rates_guard_update
  BEFORE UPDATE OF property_id, parent_rate_plan_id, rate_plan_data, publication_status ON public.staynas_rate_plans
  FOR EACH ROW
  WHEN (NEW.publication_status = 'published'
        OR NEW.property_id IS DISTINCT FROM OLD.property_id
        OR NEW.parent_rate_plan_id IS DISTINCT FROM OLD.parent_rate_plan_id
        OR NEW.rate_plan_data IS DISTINCT FROM OLD.rate_plan_data)
  EXECUTE FUNCTION public.validate_staynas_rate_plan_daily_rates();
DROP TRIGGER IF EXISTS staynas_rate_plans_seasonal_rates_guard ON public.staynas_rate_plans;
DROP TRIGGER IF EXISTS staynas_rate_plans_seasonal_rates_guard_update ON public.staynas_rate_plans;
CREATE TRIGGER staynas_rate_plans_seasonal_rates_guard
  BEFORE INSERT ON public.staynas_rate_plans
  FOR EACH ROW EXECUTE FUNCTION public.validate_staynas_rate_plan_seasonal_rates();
CREATE TRIGGER staynas_rate_plans_seasonal_rates_guard_update
  BEFORE UPDATE OF property_id, parent_rate_plan_id, rate_plan_data, publication_status ON public.staynas_rate_plans
  FOR EACH ROW
  WHEN (NEW.publication_status = 'published'
        OR NEW.property_id IS DISTINCT FROM OLD.property_id
        OR NEW.parent_rate_plan_id IS DISTINCT FROM OLD.parent_rate_plan_id
        OR NEW.rate_plan_data IS DISTINCT FROM OLD.rate_plan_data)
  EXECUTE FUNCTION public.validate_staynas_rate_plan_seasonal_rates();

COMMIT;
select 'currency integrity part 1 of 4 applied' as status;
