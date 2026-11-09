-- CC-06: founder-managed commercial account contact record.
-- Tenant operational identities and membership rows are not modified.
CREATE TABLE IF NOT EXISTS public.commercial_account_contacts (
  account_id uuid PRIMARY KEY REFERENCES public.commercial_accounts(id) ON DELETE RESTRICT,
  contact_name text NOT NULL CHECK (length(btrim(contact_name)) BETWEEN 2 AND 120),
  contact_email text NOT NULL CHECK (length(btrim(contact_email)) BETWEEN 3 AND 255),
  contact_phone text,
  contact_role text NOT NULL DEFAULT 'billing' CHECK (contact_role IN ('primary','billing','technical','finance')),
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS commercial_account_contacts_email_idx
  ON public.commercial_account_contacts(lower(contact_email));
ALTER TABLE public.commercial_account_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commercial_account_contacts FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.commercial_account_contacts FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE public.commercial_account_contacts TO service_role;

CREATE OR REPLACE FUNCTION public.guard_commercial_account_contact_mutation()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
  IF TG_OP='DELETE' THEN
    RAISE EXCEPTION 'Commercial account contact history cannot be deleted' USING ERRCODE='55000';
  END IF;
  IF NEW.account_id IS DISTINCT FROM OLD.account_id
    OR NEW.created_by IS DISTINCT FROM OLD.created_by
    OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Commercial account contact identity is immutable' USING ERRCODE='55000';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.guard_commercial_account_contact_mutation() FROM PUBLIC, anon, authenticated, service_role;
DROP TRIGGER IF EXISTS commercial_account_contact_guard ON public.commercial_account_contacts;
CREATE TRIGGER commercial_account_contact_guard
  BEFORE UPDATE OR DELETE ON public.commercial_account_contacts
  FOR EACH ROW EXECUTE FUNCTION public.guard_commercial_account_contact_mutation();

CREATE OR REPLACE FUNCTION public.commercial_is_founder_admin_service(_principal_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $
BEGIN
  IF coalesce(auth.role(),'') <> 'service_role' OR _principal_id IS NULL THEN RETURN false; END IF;
  RETURN EXISTS (
    SELECT 1 FROM public.commercial_founder_tenant_config cfg
    JOIN public.commercial_founder_admin_memberships fam
      ON fam.organisation_id=cfg.founder_organisation_id AND fam.principal_id=_principal_id AND fam.status='active'
    WHERE cfg.singleton=true AND EXISTS (
      SELECT 1 FROM public.staynas_properties p
      JOIN public.staynas_organisations o ON o.id=p.organisation_id
      JOIN public.staynas_property_members pm ON pm.property_id=p.id
      WHERE p.organisation_id=cfg.founder_organisation_id AND o.status='active' AND p.status='active'
        AND pm.user_id=_principal_id AND pm.status='active'
    )
  );
END $;
REVOKE ALL ON FUNCTION public.commercial_is_founder_admin_service(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.commercial_is_founder_admin_service(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.commercial_register_account(
  _organisation_id uuid,_contact_name text,_contact_email text,_contact_phone text,
  _contact_role text,_reason_code text,_idempotency_key text,_actor_user_id uuid,_actor_organisation_id uuid
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE v_organisation public.staynas_organisations%ROWTYPE; v_account public.commercial_accounts%ROWTYPE; v_existing_ref text; v_existing_organisation_id text;
BEGIN
  IF coalesce(auth.role(),'') <> 'service_role' THEN
    RAISE EXCEPTION 'Commercial account registration requires a trusted server principal' USING ERRCODE='42501';
  END IF;
  IF _actor_user_id IS NULL OR _actor_organisation_id IS NULL OR _organisation_id IS NULL
    OR _contact_name IS NULL OR length(btrim(_contact_name)) NOT BETWEEN 2 AND 120
    OR _contact_email IS NULL OR length(btrim(_contact_email)) NOT BETWEEN 3 AND 255
    OR _contact_role NOT IN ('primary','billing','technical','finance')
    OR _reason_code IS NULL OR length(btrim(_reason_code)) NOT BETWEEN 2 AND 200
    OR _idempotency_key IS NULL OR length(btrim(_idempotency_key)) NOT BETWEEN 8 AND 200
    OR NOT public.commercial_is_founder_admin_service(_actor_user_id)
    OR NOT EXISTS (SELECT 1 FROM public.commercial_founder_tenant_config cfg WHERE cfg.singleton=true AND cfg.founder_organisation_id=_actor_organisation_id)
    OR _organisation_id=_actor_organisation_id THEN
    RAISE EXCEPTION 'Founder authority and complete commercial registration evidence are required' USING ERRCODE='42501';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(_idempotency_key,0));
  SELECT resource_ref, metadata->>'organisationId' INTO v_existing_ref, v_existing_organisation_id
    FROM public.commercial_audit_events
    WHERE request_id=_idempotency_key AND action='commercial_account.registered' LIMIT 1;
  IF FOUND THEN
    IF v_existing_organisation_id IS DISTINCT FROM _organisation_id::text THEN
      RAISE EXCEPTION 'Commercial registration idempotency key was already used for another organisation' USING ERRCODE='23505';
    END IF;
    RETURN jsonb_build_object('ok',true,'replayed',true,'accountId',v_existing_ref,'organisationId',_organisation_id);
  END IF;
  SELECT * INTO v_organisation FROM public.staynas_organisations WHERE id=_organisation_id FOR UPDATE;
  IF NOT FOUND OR v_organisation.status <> 'active' THEN
    RAISE EXCEPTION 'Only an active StayNas organisation can be registered commercially' USING ERRCODE='P0002';
  END IF;
  SELECT * INTO v_account FROM public.commercial_accounts WHERE organisation_id=_organisation_id;
  IF FOUND THEN RAISE EXCEPTION 'A commercial account already exists for this organisation' USING ERRCODE='23505'; END IF;
  INSERT INTO public.commercial_accounts(organisation_id,status) VALUES (_organisation_id,'active') RETURNING * INTO v_account;
  INSERT INTO public.commercial_account_contacts(account_id,contact_name,contact_email,contact_phone,contact_role,created_by)
  VALUES (v_account.id,btrim(_contact_name),lower(btrim(_contact_email)),nullif(btrim(_contact_phone),''),_contact_role,_actor_user_id);
  INSERT INTO public.commercial_audit_events(request_id,actor_user_id,actor_organisation_id,actor_role,action,resource_type,resource_ref,outcome,reason_code,occurred_at,metadata)
  VALUES (_idempotency_key,_actor_user_id,_actor_organisation_id,'founder_admin','commercial_account.registered','commercial_account',v_account.id::text,'succeeded',_reason_code,now(),jsonb_build_object('organisationId',_organisation_id,'contactRole',_contact_role));
  RETURN jsonb_build_object('ok',true,'replayed',false,'accountId',v_account.id,'organisationId',_organisation_id);
END $$;
REVOKE ALL ON FUNCTION public.commercial_register_account(uuid,text,text,text,text,text,text,uuid,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.commercial_register_account(uuid,text,text,text,text,text,text,uuid,uuid) TO service_role;
COMMENT ON TABLE public.commercial_account_contacts IS 'Founder-only commercial account contacts; isolated from tenant operational memberships and identities.';
