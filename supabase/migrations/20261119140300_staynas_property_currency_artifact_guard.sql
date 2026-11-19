-- Ensure every new property-owned monetary artifact uses the property's current operating currency.
-- Existing records retain their original currency; status/metadata updates remain permitted.
BEGIN;

CREATE OR REPLACE FUNCTION public.staynas_guard_property_currency_artifact()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $property_currency_artifact$
DECLARE v_property_currency text;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF OLD.property_id IS DISTINCT FROM NEW.property_id
       OR OLD.currency IS DISTINCT FROM NEW.currency THEN
      RAISE EXCEPTION 'Property attribution and recorded currency are immutable for historical monetary artifacts';
    END IF;
    RETURN NEW;
  END IF;

  NEW.currency := upper(btrim(COALESCE(NEW.currency,'')));
  IF NEW.property_id IS NULL OR NEW.currency !~ '^[A-Z]{3}$' THEN
    RAISE EXCEPTION 'New monetary artifacts require an explicit property and ISO 4217 currency';
  END IF;
  SELECT upper(p.currency) INTO v_property_currency
  FROM public.staynas_properties p WHERE p.id = NEW.property_id;
  IF v_property_currency IS NULL OR NEW.currency IS DISTINCT FROM v_property_currency THEN
    RAISE EXCEPTION 'New monetary artifact currency must match the authoritative property operating currency';
  END IF;
  RETURN NEW;
END;
$property_currency_artifact$;

DO $artifact_triggers$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'ai_revenue_forecasts','ai_revenue_opportunities','ai_revenue_alerts',
    'ai_pricing_recommendations','financial_alerts','ai_guest_recommendations',
    'analytics_reports','ai_trend_snapshots','ai_analytics_recommendations',
    'ai_executive_briefings','ai_marketing_recommendations','ai_marketing_priorities',
    'ai_executive_kpi_snapshots','campaigns'
  ]
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_staynas_property_currency_artifact ON public.%I',t);
    EXECUTE format(
      'CREATE TRIGGER trg_staynas_property_currency_artifact BEFORE INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.staynas_guard_property_currency_artifact()',
      t
    );
  END LOOP;
END
$artifact_triggers$;

REVOKE ALL ON FUNCTION public.staynas_guard_property_currency_artifact() FROM PUBLIC,anon,authenticated;

COMMIT;
