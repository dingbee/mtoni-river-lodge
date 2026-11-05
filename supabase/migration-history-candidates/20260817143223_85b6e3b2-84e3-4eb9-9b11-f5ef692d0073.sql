CREATE OR REPLACE FUNCTION public.enforce_purchase_order_transition()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  allowed text[];
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  allowed := CASE OLD.status
    WHEN 'draft' THEN ARRAY['submitted','cancelled']
    WHEN 'submitted' THEN ARRAY['approved','cancelled']
    WHEN 'approved' THEN ARRAY['partially_received','received','cancelled']
    WHEN 'partially_received' THEN ARRAY['received','cancelled']
    ELSE ARRAY[]::text[]
  END;

  IF OLD.status IN ('received','cancelled') THEN
    RAISE EXCEPTION 'A % purchase order is final and cannot move to "%".', OLD.status, NEW.status
      USING ERRCODE = 'check_violation';
  END IF;

  IF NOT (NEW.status = ANY (allowed)) THEN
    RAISE EXCEPTION 'Invalid purchase order transition: % -> %.', OLD.status, NEW.status
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_purchase_order_transition ON public.restaurant_purchase_orders;
CREATE TRIGGER enforce_purchase_order_transition
BEFORE UPDATE OF status ON public.restaurant_purchase_orders
FOR EACH ROW
EXECUTE FUNCTION public.enforce_purchase_order_transition();