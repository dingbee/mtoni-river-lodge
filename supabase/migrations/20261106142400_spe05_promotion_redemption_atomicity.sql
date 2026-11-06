-- SPE-05 transactional redemption gate. Call inside the same booking transaction.
BEGIN;

CREATE OR REPLACE FUNCTION public.redeem_staynas_promotion(
  _property_id uuid,
  _promotion_id uuid,
  _booking_id uuid,
  _guest_key text,
  _discount_amount numeric,
  _currency text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_promo public.staynas_property_promotions%ROWTYPE;
  v_guest_uses integer;
BEGIN
  IF _property_id IS NULL OR _promotion_id IS NULL OR _booking_id IS NULL
     OR _discount_amount IS NULL OR _discount_amount < 0
     OR _currency IS NULL OR _currency !~ '^[A-Z]{3}$' THEN
    RETURN jsonb_build_object('ok',false,'error_code','INVALID_REDEMPTION','message','Invalid redemption request');
  END IF;

  SELECT * INTO v_promo
  FROM public.staynas_property_promotions p
  WHERE p.id=_promotion_id AND p.property_id=_property_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok',false,'error_code','PROMOTION_NOT_FOUND');
  END IF;

  IF v_promo.status <> 'active'
     OR (v_promo.valid_from IS NOT NULL AND v_promo.valid_from>now())
     OR (v_promo.valid_to IS NOT NULL AND v_promo.valid_to<=now())
     OR (v_promo.usage_limit IS NOT NULL AND v_promo.usage_count>=v_promo.usage_limit)
     OR (v_promo.currency IS NOT NULL AND upper(v_promo.currency)<>_currency) THEN
    RETURN jsonb_build_object('ok',false,'error_code','PROMOTION_LIMIT_REACHED_OR_INACTIVE');
  END IF;

  IF _guest_key IS NOT NULL AND v_promo.per_guest_limit IS NOT NULL THEN
    SELECT count(*) INTO v_guest_uses
    FROM public.staynas_promotion_redemptions r
    WHERE r.promotion_id=_promotion_id AND r.guest_key=_guest_key;
    IF v_guest_uses>=v_promo.per_guest_limit THEN
      RETURN jsonb_build_object('ok',false,'error_code','PROMOTION_GUEST_LIMIT_REACHED');
    END IF;
  END IF;

  INSERT INTO public.staynas_promotion_redemptions(
    property_id,promotion_id,booking_id,guest_key,discount_amount,currency
  ) VALUES (
    _property_id,_promotion_id,_booking_id,_guest_key,round(_discount_amount,2),_currency
  )
  ON CONFLICT(promotion_id,booking_id) DO NOTHING;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok',true,'already_redeemed',true,'promotion_id',_promotion_id);
  END IF;

  UPDATE public.staynas_property_promotions
  SET usage_count=usage_count+1,updated_at=now()
  WHERE id=_promotion_id AND property_id=_property_id;

  RETURN jsonb_build_object('ok',true,'already_redeemed',false,'promotion_id',_promotion_id,
    'promotion_version',v_promo.version,'discount_amount',round(_discount_amount,2),'currency',_currency);
END;
$function$;

REVOKE ALL ON FUNCTION public.redeem_staynas_promotion(uuid,uuid,uuid,text,numeric,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.redeem_staynas_promotion(uuid,uuid,uuid,text,numeric,text) TO service_role;
GRANT ALL ON public.staynas_promotion_redemptions TO service_role;

COMMIT;
