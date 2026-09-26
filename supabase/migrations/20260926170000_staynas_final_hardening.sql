-- Final StayNas production hardening: establish Nolmark CDMA as the current owner/property context.
UPDATE public.staynas_organisations SET slug='nolmark-cdma', name='Nolmark CDMA', updated_at=now() WHERE slug='staynas-demo';
UPDATE public.staynas_properties SET slug='nolmark-cdma-staynas', code='NOLMARK', name='Nolmark CDMA', updated_at=now() WHERE slug='staynas-demo-property';
CREATE OR REPLACE FUNCTION public.staynas_bootstrap_property_membership() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE _property_id uuid; BEGIN
IF NEW.role NOT IN ('owner','manager','reception','housekeeping','finance','admin','reservations','editor','marketing') THEN RETURN NEW; END IF;
SELECT id INTO _property_id FROM public.staynas_properties WHERE slug='nolmark-cdma-staynas' LIMIT 1;
IF _property_id IS NOT NULL THEN INSERT INTO public.staynas_property_members(property_id,user_id,role) VALUES(_property_id,NEW.user_id,NEW.role) ON CONFLICT DO NOTHING; END IF;
RETURN NEW; END; $$;
DROP TRIGGER IF EXISTS staynas_user_role_property_bootstrap ON public.user_roles;
CREATE TRIGGER staynas_user_role_property_bootstrap AFTER INSERT ON public.user_roles FOR EACH ROW EXECUTE FUNCTION public.staynas_bootstrap_property_membership();