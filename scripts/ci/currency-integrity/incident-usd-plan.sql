SET search_path=public,extensions;
SET ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"a0000000-0000-4000-8000-000000000001","role":"authenticated"}',false) \g /dev/null
INSERT INTO staynas_rate_plans(id,property_id,code,name,currency,pricing_basis,rate_plan_data)
VALUES ('f0000000-0000-4000-8000-000000000001',staynas_active_property_id(auth.uid()),'BAR','Best Available','USD','per_room',
 '{"base_rates":{"d0000000-0000-4000-8000-000000000001":{"nightly_rate":80,"currency":"USD"}}}');
INSERT INTO staynas_rate_plan_room_types(property_id,rate_plan_id,room_type_id) VALUES
 (staynas_active_property_id(auth.uid()),'f0000000-0000-4000-8000-000000000001','d0000000-0000-4000-8000-000000000001');
SELECT 'published:'||publication_status||':'||currency FROM set_staynas_rate_plan_publication('f0000000-0000-4000-8000-000000000001','published',true,'Initial USD release');
-- control property: USD plan at 90
SELECT set_config('request.jwt.claims','{"sub":"a0000000-0000-4000-8000-000000000002","role":"authenticated"}',false) \g /dev/null
INSERT INTO staynas_rate_plans(id,property_id,code,name,currency,pricing_basis,rate_plan_data)
VALUES ('f0000000-0000-4000-8000-000000000002','c0000000-0000-4000-8000-000000000002','BAR','Control BAR','USD','per_room',
 '{"base_rates":{"d0000000-0000-4000-8000-000000000002":{"nightly_rate":90,"currency":"USD"}}}');
INSERT INTO staynas_rate_plan_room_types(property_id,rate_plan_id,room_type_id) VALUES
 ('c0000000-0000-4000-8000-000000000002','f0000000-0000-4000-8000-000000000002','d0000000-0000-4000-8000-000000000002');
SELECT 'ctrl published:'||publication_status FROM set_staynas_rate_plan_publication('f0000000-0000-4000-8000-000000000002','published',true,'Control USD release');
RESET ROLE;
