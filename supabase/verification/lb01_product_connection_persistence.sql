\set ON_ERROR_STOP on
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
DO $$ BEGIN CREATE ROLE anon NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE service_role NOLOGIN BYPASSRLS; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE SCHEMA IF NOT EXISTS auth;
CREATE TABLE auth.users(id uuid PRIMARY KEY);
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.test_user_id', true), '')::uuid $$;
CREATE OR REPLACE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$ SELECT coalesce(current_setting('request.test_role', true), current_user) $$;
DO $$ BEGIN CREATE TYPE public.app_role AS ENUM ('owner','manager','admin','reception'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE TABLE public.staynas_organisations(id uuid PRIMARY KEY, slug text UNIQUE NOT NULL, name text NOT NULL, status text NOT NULL DEFAULT 'active');
CREATE TABLE public.staynas_properties(id uuid PRIMARY KEY, organisation_id uuid NOT NULL REFERENCES public.staynas_organisations(id), slug text NOT NULL, status text NOT NULL DEFAULT 'active', UNIQUE (organisation_id,id));
CREATE TABLE public.staynas_property_members(property_id uuid NOT NULL REFERENCES public.staynas_properties(id), user_id uuid NOT NULL REFERENCES auth.users(id), role public.app_role NOT NULL, status text NOT NULL DEFAULT 'active');
CREATE OR REPLACE FUNCTION public.staynas_user_has_property_access(_uid uuid, _property_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT EXISTS(SELECT 1 FROM public.staynas_property_members m WHERE m.user_id=_uid AND m.property_id=_property_id AND m.status='active')
$$;
CREATE OR REPLACE FUNCTION public.has_any_role(_uid uuid, _roles public.app_role[])
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT EXISTS(SELECT 1 FROM public.staynas_property_members m WHERE m.user_id=_uid AND m.role=ANY(_roles) AND m.status='active')
$$;
INSERT INTO auth.users(id) VALUES
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'),
 ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2'),
 ('cccccccc-cccc-4ccc-8ccc-ccccccccccc3');
INSERT INTO public.staynas_organisations(id,slug,name) VALUES
 ('10000000-0000-4000-8000-000000000001','org-a','Org A'),
 ('10000000-0000-4000-8000-000000000002','org-b','Org B');
INSERT INTO public.staynas_properties(id,organisation_id,slug) VALUES
 ('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','property-a'),
 ('20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','property-b'),
 ('20000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000002','property-c');
INSERT INTO public.staynas_property_members(property_id,user_id,role) VALUES
 ('20000000-0000-4000-8000-000000000001','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1','owner'),
 ('20000000-0000-4000-8000-000000000002','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2','owner'),
 ('20000000-0000-4000-8000-000000000003','cccccccc-cccc-4ccc-8ccc-ccccccccccc3','owner');

\i supabase/migrations/20261109110846_lb01_product_connection_persistence.sql
\i supabase/migrations/20261109110948_lb01_product_connection_persistence_schema.sql
\i supabase/migrations/20261109111013_lb01_service_auth_nonce_ledger.sql
\i supabase/migrations/20261109111027_lb01_secure_handoff_and_delivery.sql

SET ROLE authenticated;
SELECT set_config('request.test_user_id','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',false);
SELECT set_config('request.test_role','authenticated',false);
SELECT public.staynas_request_lexibite_connection(
 '30000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001',
 '20000000-0000-4000-8000-000000000001',
 '50000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000001','lb01-test-connection-a'
) AS connection_id \gset
SELECT public.staynas_approve_lexibite_connection(:'connection_id');
RESET ROLE;

SET ROLE service_role;
SELECT set_config('request.test_role','service_role',false);
SELECT public.staynas_record_lexibite_approval(
 '30000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001',
 '50000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000001','lb01-test-connection-a'
);
RESET ROLE;

DO $lb01active$
BEGIN
 IF (SELECT status FROM public.staynas_product_connections WHERE correlation_id='lb01-test-connection-a') <> 'active' THEN
   RAISE EXCEPTION 'Connection must activate only after both approvals';
 END IF;
 IF (SELECT count(*) FROM public.staynas_product_connection_audit WHERE action IN ('requested','locally_approved','remotely_approved')) <> 3 THEN
   RAISE EXCEPTION 'Expected request and both approval audit records';
 END IF;
END $lb01active$;

SET ROLE authenticated;
SELECT set_config('request.test_user_id','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2',false);
DO $lb01property$
BEGIN
 IF (SELECT count(*) FROM public.staynas_product_connections) <> 0 THEN
   RAISE EXCEPTION 'Other property member must not read connection';
 END IF;
 BEGIN
   PERFORM public.staynas_request_lexibite_connection(
    '30000000-0000-4000-8000-000000000002','40000000-0000-4000-8000-000000000002',
    '20000000-0000-4000-8000-000000000001',
    '50000000-0000-4000-8000-000000000002','60000000-0000-4000-8000-000000000002','lb01-test-cross-property'
   );
   RAISE EXCEPTION 'Cross-property request should have been denied';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
END $lb01property$;
RESET ROLE;

SET ROLE authenticated;
SELECT set_config('request.test_user_id','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',false);
SELECT public.staynas_set_lexibite_connection_state(
 (SELECT id FROM public.staynas_product_connections WHERE correlation_id='lb01-test-connection-a'),'suspend',NULL
);
SELECT public.staynas_set_lexibite_connection_state(
 (SELECT id FROM public.staynas_product_connections WHERE correlation_id='lb01-test-connection-a'),'resume',NULL
);
SELECT public.staynas_set_lexibite_connection_state(
 (SELECT id FROM public.staynas_product_connections WHERE correlation_id='lb01-test-connection-a'),'revoke','test revocation'
);
DO $lb01revocation$
BEGIN
 IF (SELECT status FROM public.staynas_product_connections WHERE correlation_id='lb01-test-connection-a') <> 'revoked' THEN
   RAISE EXCEPTION 'Connection revocation did not persist';
 END IF;
 BEGIN
   PERFORM public.staynas_approve_lexibite_connection((SELECT id FROM public.staynas_product_connections WHERE correlation_id='lb01-test-connection-a'));
   RAISE EXCEPTION 'Revoked connection must not be re-approved';
 EXCEPTION WHEN raise_exception THEN
   IF SQLERRM = 'Revoked connection must not be re-approved' THEN RAISE; END IF;
 END;
END $lb01revocation$;

-- A single integration tenant may map multiple properties.
SELECT set_config('request.test_user_id','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2',false);
SELECT public.staynas_request_lexibite_connection(
 '30000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000002',
 '20000000-0000-4000-8000-000000000002',
 '50000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000002','lb01-test-second-property'
);
-- Revocation permits a fresh authorization with new canonical identifiers.
SELECT set_config('request.test_user_id','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',false);
SELECT public.staynas_request_lexibite_connection(
 '30000000-0000-4000-8000-000000000003','40000000-0000-4000-8000-000000000003',
 '20000000-0000-4000-8000-000000000001',
 '50000000-0000-4000-8000-000000000003','60000000-0000-4000-8000-000000000003','lb01-test-reauthorization'
);
-- A different organisation cannot enumerate or administer this property's mapping.
SELECT set_config('request.test_user_id','cccccccc-cccc-4ccc-8ccc-ccccccccccc3',false);
DO $lb01test$
BEGIN
 IF (SELECT count(*) FROM public.staynas_product_connections) <> 0 THEN
   RAISE EXCEPTION 'Other organisation must not read connection';
 END IF;
 BEGIN
   PERFORM public.staynas_request_lexibite_connection(
    '30000000-0000-4000-8000-000000000004','40000000-0000-4000-8000-000000000004',
    '20000000-0000-4000-8000-000000000001',
    '50000000-0000-4000-8000-000000000004','60000000-0000-4000-8000-000000000004','lb01-test-cross-tenant'
   );
   RAISE EXCEPTION 'Cross-tenant request should have been denied';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
END $lb01test$;
RESET ROLE;

-- LB-01.03B: scoped credential issue/rotation/revocation and durable nonce replay prevention.
SET ROLE authenticated;
SELECT set_config('request.test_user_id','cccccccc-cccc-4ccc-8ccc-ccccccccccc3',false);
SELECT set_config('request.test_role','authenticated',false);
SELECT public.staynas_request_lexibite_connection(
 '30000000-0000-4000-8000-000000000009','40000000-0000-4000-8000-000000000009',
 '20000000-0000-4000-8000-000000000003',
 '50000000-0000-4000-8000-000000000009','60000000-0000-4000-8000-000000000009','lb01-test-auth-active'
) AS service_connection_id \gset
SELECT public.staynas_approve_lexibite_connection(:'service_connection_id');
RESET ROLE;

SET ROLE service_role;
SELECT set_config('request.test_role','service_role',false);
SELECT public.staynas_record_lexibite_approval(
 '30000000-0000-4000-8000-000000000009','40000000-0000-4000-8000-000000000009',
 '50000000-0000-4000-8000-000000000009','60000000-0000-4000-8000-000000000009','lb01-test-auth-active'
);
RESET ROLE;

-- Only the property administrator may issue or rotate the connection credential.
SET ROLE authenticated;
SELECT set_config('request.test_user_id','cccccccc-cccc-4ccc-8ccc-ccccccccccc3',false);
SELECT public.lb01_issue_product_service_credential(
 :'service_connection_id','abcdef0123456789abcdef01',decode(repeat('aa',32),'hex'),now()+interval '1 day'
) AS first_credential_id \gset
SELECT public.lb01_issue_product_service_credential(
 :'service_connection_id','abcdef0123456789abcdef02',decode(repeat('bb',32),'hex'),now()+interval '1 day'
) AS active_credential_id \gset

RESET ROLE;

SET ROLE service_role;
SELECT set_config('request.test_role','service_role',false);
DO $lb01rotation$
DECLARE _old_status text; _new_status text; _audit_count integer;
BEGIN
 SELECT status INTO _old_status FROM public.product_service_credentials WHERE credential_prefix='abcdef0123456789abcdef01';
 SELECT status INTO _new_status FROM public.product_service_credentials WHERE credential_prefix='abcdef0123456789abcdef02';
 SELECT count(*) INTO _audit_count FROM public.product_service_credential_audit WHERE action IN ('issued','rotated');
 IF _old_status IS DISTINCT FROM 'revoked' OR _new_status IS DISTINCT FROM 'active' OR _audit_count < 2 THEN
   RAISE EXCEPTION 'Credential rotation assertion: old=%, new=%, audit=%', _old_status, _new_status, _audit_count;
 END IF;
END $lb01rotation$;
DO $lb01nonce$
DECLARE _first boolean; _replay boolean; _old_credential boolean; _expired boolean; _unknown boolean;
BEGIN
 _first := public.lb01_claim_service_nonce((SELECT id FROM public.product_service_credentials WHERE credential_prefix='abcdef0123456789abcdef02'),'0123456789abcdef0123456789abcdef',now()+interval '5 minutes');
 _replay := public.lb01_claim_service_nonce((SELECT id FROM public.product_service_credentials WHERE credential_prefix='abcdef0123456789abcdef02'),'0123456789abcdef0123456789abcdef',now()+interval '5 minutes');
 _old_credential := public.lb01_claim_service_nonce((SELECT id FROM public.product_service_credentials WHERE credential_prefix='abcdef0123456789abcdef01'),'fedcba9876543210fedcba9876543210',now()+interval '5 minutes');
 _expired := public.lb01_claim_service_nonce((SELECT id FROM public.product_service_credentials WHERE credential_prefix='abcdef0123456789abcdef02'),'fedcba9876543210fedcba9876543211',now()-interval '1 second');
 _unknown := public.lb01_claim_service_nonce('70000000-0000-4000-8000-000000000099','aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',now()+interval '5 minutes');
 IF NOT _first OR _replay OR _old_credential OR _expired OR _unknown THEN
   RAISE EXCEPTION 'Nonce ledger did not enforce first-use, replay, revoked/expired and credential binding';
 END IF;
 IF (SELECT count(*) FROM public.product_service_nonces WHERE credential_id=(SELECT id FROM public.product_service_credentials WHERE credential_prefix='abcdef0123456789abcdef02')) <> 1 THEN
   RAISE EXCEPTION 'Expected exactly one accepted nonce';
 END IF;
END $lb01nonce$;
RESET ROLE;

SET ROLE authenticated;
SELECT set_config('request.test_user_id','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',false);
DO $lb01deniedissue$
BEGIN
 BEGIN
   PERFORM public.lb01_issue_product_service_credential(
     (SELECT id FROM public.staynas_product_connections WHERE correlation_id='lb01-test-auth-active'),
     'abcdef0123456789abcdef03',decode(repeat('cc',32),'hex'),now()+interval '1 day'
   );
   RAISE EXCEPTION 'Cross-tenant credential issuance should be denied';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
END $lb01deniedissue$;
RESET ROLE;

SET ROLE authenticated;
SELECT set_config('request.test_user_id','cccccccc-cccc-4ccc-8ccc-ccccccccccc3',false);
SELECT public.lb01_revoke_product_service_credential(:'active_credential_id','test revocation');
RESET ROLE;

SET ROLE service_role;
SELECT set_config('request.test_role','service_role',false);
DO $lb01revoked$
BEGIN
 IF public.lb01_claim_service_nonce((SELECT id FROM public.product_service_credentials WHERE credential_prefix='abcdef0123456789abcdef02'),'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',now()+interval '5 minutes') THEN
   RAISE EXCEPTION 'Revoked credential must not claim new nonces';
 END IF;
END $lb01revoked$;
RESET ROLE;

SET ROLE authenticated;
DO $lb01credentialisolation$
BEGIN
 BEGIN
   PERFORM 1 FROM public.product_service_credentials;
   RAISE EXCEPTION 'Authenticated users must not read service credentials';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 BEGIN
   PERFORM 1 FROM public.product_service_nonces;
   RAISE EXCEPTION 'Authenticated users must not read service nonces';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
END $lb01credentialisolation$;
RESET ROLE;


-- LB-01.04: pending-state authentication, property authorization and encrypted handoff consumption.
SET ROLE authenticated;
SELECT set_config('request.test_user_id','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',false);
SELECT set_config('request.test_role','authenticated',false);
DO $lb01pending$
DECLARE _credential uuid; _connection uuid;
BEGIN
  SELECT id INTO _connection FROM public.staynas_product_connections
    WHERE correlation_id='lb01-test-reauthorization';
  IF _connection IS NULL OR NOT public.lb01_can_manage_product_connection(_connection) THEN
    RAISE EXCEPTION 'Authorized property owner must manage pending LB-01 connection';
  END IF;
  _credential := public.lb01_issue_product_service_credential(
    _connection,'abcdef0123456789abcdef04',decode(repeat('dd',32),'hex'),now()+interval '1 day'
  );
  IF _credential IS NULL THEN RAISE EXCEPTION 'Pending connection credential issuance failed'; END IF;
END $lb01pending$;
RESET ROLE;

SET ROLE service_role;
SELECT set_config('request.test_role','service_role',false);
INSERT INTO public.lb01_credential_handoffs(
  connection_id, credential_id, peer_product, correlation_id, code_hash,
  encrypted_token, encryption_iv, encryption_tag, expires_at, created_by
)
SELECT c.id, p.id, 'lexibite', c.correlation_id,
  decode(repeat('aa',32),'hex'), decode(repeat('cc',64),'hex'),
  decode(repeat('bb',12),'hex'), decode(repeat('ee',16),'hex'),
  now()+interval '10 minutes', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'
FROM public.staynas_product_connections c
JOIN public.product_service_credentials p ON p.connection_id=c.id
WHERE c.correlation_id='lb01-test-reauthorization'
  AND p.credential_prefix='abcdef0123456789abcdef04';
DO $lb01handoff$
DECLARE _first integer; _retry integer; _expired integer; _nonce boolean;
BEGIN
  _nonce := public.lb01_claim_service_nonce(
    (SELECT id FROM public.product_service_credentials WHERE credential_prefix='abcdef0123456789abcdef04'),
    'pending-connection-nonce-00000001', now()+interval '5 minutes'
  );
  IF NOT _nonce THEN RAISE EXCEPTION 'Pending connection must accept authenticated nonce'; END IF;

  SELECT count(*) INTO _first FROM public.lb01_consume_credential_handoff(
    decode(repeat('aa',32),'hex'),'lexibite','lb01-test-reauthorization'
  );
  SELECT count(*) INTO _retry FROM public.lb01_consume_credential_handoff(
    decode(repeat('aa',32),'hex'),'lexibite','lb01-test-reauthorization'
  );
  IF _first <> 1 OR _retry <> 1 THEN
    RAISE EXCEPTION 'Handoff exchange must be safely repeatable after a lost response';
  END IF;
  UPDATE public.lb01_credential_handoffs
    SET consumed_at = now()-interval '3 minutes'
    WHERE code_hash=decode(repeat('aa',32),'hex');
  SELECT count(*) INTO _expired FROM public.lb01_consume_credential_handoff(
    decode(repeat('aa',32),'hex'),'lexibite','lb01-test-reauthorization'
  );
  IF _expired <> 0 THEN RAISE EXCEPTION 'Consumed handoff must expire outside recovery window'; END IF;
  IF public.lb01_purge_expired_handoffs(100) < 1 THEN RAISE EXCEPTION 'Expired LB-01 handoff ciphertext was not purged'; END IF;
END $lb01handoff$;
RESET ROLE;

SET ROLE authenticated;
SELECT set_config('request.test_user_id','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2',false);
DO $lb01adminisolation$
BEGIN
  IF public.lb01_can_manage_product_connection(
    (SELECT id FROM public.staynas_product_connections WHERE correlation_id='lb01-test-reauthorization')
  ) THEN
    RAISE EXCEPTION 'Other property administrator must not manage this connection';
  END IF;
  IF public.staynas_can_manage_product_connection(
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
    (SELECT local_property_id FROM public.staynas_product_connections WHERE correlation_id='lb01-test-reauthorization')
  ) THEN
    RAISE EXCEPTION 'Authenticated users must not impersonate another property administrator';
  END IF;
  BEGIN
    PERFORM 1 FROM public.lb01_credential_handoffs;
    RAISE EXCEPTION 'Authenticated users must not read credential handoffs';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM 1 FROM public.lb01_peer_credentials;
    RAISE EXCEPTION 'Authenticated users must not read encrypted peer credentials';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $lb01adminisolation$;
RESET ROLE;

-- Revocation must erase both stored peer-token ciphertext and unused handoff ciphertext.
SET ROLE service_role;
SELECT set_config('request.test_role','service_role',false);
INSERT INTO public.lb01_peer_credentials(
  connection_id, peer_product, credential_prefix, encrypted_token,
  encryption_iv, encryption_tag, status, imported_by
)
SELECT c.id, 'lexibite', 'fedcba9876543210fedcba98',
  decode(repeat('cc',64),'hex'), decode(repeat('bb',12),'hex'),
  decode(repeat('ee',16),'hex'), 'active',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'
FROM public.staynas_product_connections c
WHERE c.correlation_id='lb01-test-reauthorization';
INSERT INTO public.lb01_credential_handoffs(
  connection_id, credential_id, peer_product, correlation_id, code_hash,
  encrypted_token, encryption_iv, encryption_tag, expires_at, created_by
)
SELECT c.id, p.id, 'lexibite', c.correlation_id,
  decode(repeat('bb',32),'hex'), decode(repeat('cc',64),'hex'),
  decode(repeat('bb',12),'hex'), decode(repeat('ee',16),'hex'),
  now()+interval '10 minutes', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'
FROM public.staynas_product_connections c
JOIN public.product_service_credentials p ON p.connection_id=c.id
WHERE c.correlation_id='lb01-test-reauthorization'
  AND p.credential_prefix='abcdef0123456789abcdef04';
RESET ROLE;

SET ROLE authenticated;
SELECT set_config('request.test_user_id','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',false);
SELECT set_config('request.test_role','authenticated',false);
SELECT public.staynas_set_lexibite_connection_state(
  (SELECT id FROM public.staynas_product_connections WHERE correlation_id='lb01-test-reauthorization'),
  'revoke',
  'LB-01 isolated revocation test'
);
RESET ROLE;

SET ROLE service_role;
SELECT set_config('request.test_role','service_role',false);
DO $lb01revocation$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.lb01_peer_credentials
    WHERE credential_prefix='fedcba9876543210fedcba98'
      AND status='revoked' AND octet_length(encrypted_token)=0
  ) THEN
    RAISE EXCEPTION 'Connection revocation must erase encrypted peer credentials';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.lb01_credential_handoffs
    WHERE code_hash=decode(repeat('bb',32),'hex')
      AND consumed_at IS NOT NULL AND octet_length(encrypted_token)=0
  ) THEN
    RAISE EXCEPTION 'Connection revocation must erase encrypted handoff material';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.product_service_credentials
    WHERE credential_prefix='abcdef0123456789abcdef04' AND status='active'
  ) THEN
    RAISE EXCEPTION 'Connection revocation must invalidate issued service credentials';
  END IF;
END $lb01revocation$;
RESET ROLE;


-- LB-01R: database-level ownership pairing must reject privileged inconsistent writes.
SET ROLE service_role;
DO $lb01r_org_pair$
BEGIN
  BEGIN
    INSERT INTO public.staynas_product_connections(
      integration_tenant_id,integration_property_id,local_organisation_id,local_property_id,
      remote_tenant_id,remote_property_id,requested_by,correlation_id
    ) VALUES (
      '30000000-0000-4000-8000-000000000099','40000000-0000-4000-8000-000000000099',
      '10000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000001',
      '50000000-0000-4000-8000-000000000099','60000000-0000-4000-8000-000000000099',
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1','lb01r-org-mismatch'
    );
    RAISE EXCEPTION 'LB-01R expected mismatched organisation/property insert to fail';
  EXCEPTION WHEN foreign_key_violation THEN NULL;
  END;
END $lb01r_org_pair$;
RESET ROLE;
