CREATE OR REPLACE FUNCTION public.enforce_purchase_order_transition()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  old_status text := OLD.status::text;
  new_status text := NEW.status::text;
  allowed text[];
BEGIN
  IF new_status IS NOT DISTINCT FROM old_status THEN
    RETURN NEW;
  END IF;

  IF old_status IN ('received','cancelled') THEN
    RAISE EXCEPTION 'A % purchase order is final and cannot move to "%".', old_status, new_status
      USING ERRCODE = 'check_violation';
  END IF;

  allowed := CASE old_status
    WHEN 'draft' THEN ARRAY['submitted','cancelled']
    WHEN 'submitted' THEN ARRAY['approved','cancelled']
    WHEN 'approved' THEN ARRAY['partially_received','received','cancelled']
    WHEN 'partially_received' THEN ARRAY['received','cancelled']
    ELSE ARRAY[]::text[]
  END;

  IF NOT (new_status = ANY (allowed)) THEN
    RAISE EXCEPTION 'Invalid purchase order transition: % -> %.', old_status, new_status
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;