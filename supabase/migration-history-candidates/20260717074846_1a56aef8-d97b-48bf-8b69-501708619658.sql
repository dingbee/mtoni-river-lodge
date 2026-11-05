
-- pricing_rules -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.pricing_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  rule_type TEXT NOT NULL CHECK (rule_type IN ('seasonal','weekend','promo','corporate','package','child','extra_guest','min_stay','blackout')),
  scope TEXT NOT NULL DEFAULT 'all' CHECK (scope IN ('all','room')),
  room_id UUID REFERENCES public.rooms(id) ON DELETE CASCADE,
  starts_on DATE,
  ends_on DATE,
  weekdays INT[],
  adjust_kind TEXT CHECK (adjust_kind IN ('percent','fixed','override')),
  adjust_value NUMERIC(10,2),
  min_stay_nights INT,
  code TEXT,
  priority INT NOT NULL DEFAULT 100,
  active BOOLEAN NOT NULL DEFAULT true,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pricing_rules TO authenticated;
GRANT ALL ON public.pricing_rules TO service_role;

ALTER TABLE public.pricing_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff read pricing rules" ON public.pricing_rules
  FOR SELECT TO authenticated USING (public.is_any_staff(auth.uid()));

CREATE POLICY "Finance manage pricing rules" ON public.pricing_rules
  FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['owner','manager','finance','admin']::app_role[]))
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['owner','manager','finance','admin']::app_role[]));

CREATE TRIGGER trg_pricing_rules_updated
  BEFORE UPDATE ON public.pricing_rules
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS pricing_rules_active_idx ON public.pricing_rules(active, rule_type);
CREATE INDEX IF NOT EXISTS pricing_rules_date_idx ON public.pricing_rules(starts_on, ends_on);

-- financial_alerts --------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.financial_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_type TEXT NOT NULL CHECK (alert_type IN ('overdue_balance','failed_payment','unreconciled','high_refund','missing_invoice','revenue_anomaly')),
  severity TEXT NOT NULL DEFAULT 'warn' CHECK (severity IN ('info','warn','error','critical')),
  title TEXT NOT NULL,
  detail TEXT,
  booking_id UUID REFERENCES public.bookings(id) ON DELETE CASCADE,
  reference TEXT,
  amount NUMERIC(10,2),
  currency TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','acknowledged','resolved','dismissed')),
  resolved_at TIMESTAMPTZ,
  resolved_by UUID,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.financial_alerts TO authenticated;
GRANT ALL ON public.financial_alerts TO service_role;

ALTER TABLE public.financial_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff read financial alerts" ON public.financial_alerts
  FOR SELECT TO authenticated USING (public.is_any_staff(auth.uid()));

CREATE POLICY "Finance manage financial alerts" ON public.financial_alerts
  FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['owner','manager','finance','admin']::app_role[]))
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['owner','manager','finance','admin']::app_role[]));

CREATE TRIGGER trg_financial_alerts_updated
  BEFORE UPDATE ON public.financial_alerts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS financial_alerts_status_idx ON public.financial_alerts(status, severity);
CREATE INDEX IF NOT EXISTS financial_alerts_type_idx ON public.financial_alerts(alert_type);
