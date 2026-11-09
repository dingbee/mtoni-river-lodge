-- LB-01R / LB-02.01R: enforce organisation/property pairing at database boundary.
BEGIN;
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM public.staynas_product_connections c JOIN public.staynas_properties p ON p.id=c.local_property_id WHERE c.local_organisation_id<>p.organisation_id) THEN
  RAISE EXCEPTION 'LB-01R: StayNas connection contains mismatched organisation/property ownership';
 END IF;
END $$;
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.staynas_product_connections'::regclass AND conname='staynas_product_connections_local_org_property_fk') THEN
  ALTER TABLE public.staynas_product_connections ADD CONSTRAINT staynas_product_connections_local_org_property_fk FOREIGN KEY(local_organisation_id,local_property_id) REFERENCES public.staynas_properties(organisation_id,id) ON UPDATE RESTRICT ON DELETE RESTRICT NOT VALID;
 END IF;
END $$;
ALTER TABLE public.staynas_product_connections VALIDATE CONSTRAINT staynas_product_connections_local_org_property_fk;
COMMIT;