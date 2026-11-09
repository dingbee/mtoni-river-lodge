-- CC-06 founder notification privacy and evidence integrity contracts.
BEGIN;
DO $$
BEGIN
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid='public.commercial_founder_notifications'::regclass) THEN
    RAISE EXCEPTION 'Founder notifications must have RLS enabled';
  END IF;
  IF has_table_privilege('anon','public.commercial_founder_notifications','SELECT')
    OR has_table_privilege('authenticated','public.commercial_founder_notifications','SELECT')
    OR has_table_privilege('authenticated','public.commercial_founder_notifications','INSERT')
    OR has_table_privilege('authenticated','public.commercial_founder_notifications','UPDATE')
    OR has_table_privilege('authenticated','public.commercial_founder_notifications','DELETE') THEN
    RAISE EXCEPTION 'Tenant/browser roles can access founder commercial notifications';
  END IF;
  IF NOT has_table_privilege('service_role','public.commercial_founder_notifications','SELECT')
    OR NOT has_table_privilege('service_role','public.commercial_founder_notifications','INSERT')
    OR NOT has_table_privilege('service_role','public.commercial_founder_notifications','UPDATE')
    OR has_table_privilege('service_role','public.commercial_founder_notifications','DELETE') THEN
    RAISE EXCEPTION 'Founder notification service privileges violate least privilege';
  END IF;
END $$;
INSERT INTO public.commercial_founder_notifications(
  dedupe_key,alert_type,severity,title,detail,resource_type,resource_ref,href,metadata
) VALUES (
  'cc06-test-alert-0001','trial_expiring','warning','Test trial expiry','Test-only notification evidence','subscription','cc06-test-subscription','/founder','{}'
);
DO $$
BEGIN
  BEGIN
    UPDATE public.commercial_founder_notifications SET title='tampered'
      WHERE dedupe_key='cc06-test-alert-0001';
    RAISE EXCEPTION 'Notification evidence mutation was not blocked';
  EXCEPTION WHEN SQLSTATE '55000' THEN
    IF SQLERRM NOT LIKE 'Founder commercial notification evidence is immutable' THEN RAISE; END IF;
  END;
  BEGIN
    DELETE FROM public.commercial_founder_notifications WHERE dedupe_key='cc06-test-alert-0001';
    RAISE EXCEPTION 'Notification deletion was not blocked';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT LIKE 'Founder commercial notification history cannot be deleted' THEN RAISE; END IF;
  END;
END $$;
ROLLBACK;
