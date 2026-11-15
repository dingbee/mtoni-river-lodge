\set ON_ERROR_STOP on
INSERT INTO auth.users(id) VALUES
  ('10000000-0000-4000-8000-000000000001'),
  ('10000000-0000-4000-8000-000000000002');
INSERT INTO public.staynas_organisations(id) VALUES
  ('20000000-0000-4000-8000-000000000001'),
  ('20000000-0000-4000-8000-000000000002');
INSERT INTO public.staynas_properties(id, organisation_id) VALUES
  ('30000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001'),
  ('30000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000002');
INSERT INTO public.staynas_property_members(property_id, user_id, role, status) VALUES
  ('30000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'admin', 'active');
INSERT INTO public.commercial_accounts(id, organisation_id) VALUES
  ('40000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001'),
  ('40000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000002');
INSERT INTO public.commercial_subscriptions(
  id, account_id, plan_code, plan_version, property_count, addon_codes, status, current_period_ends_at
) VALUES (
  '50000000-0000-4000-8000-000000000001',
  '40000000-0000-4000-8000-000000000001',
  'professional', 1, 1, ARRAY['campaign_studio'], 'active', now() + interval '30 days'
);
INSERT INTO public.commercial_policy_config_versions(id, status, payload) VALUES (
  '60000000-0000-4000-8000-000000000001',
  'published',
  '{"addons":[{"code":"campaign_studio","status":"published","featureCodes":["direct¶»§q«^