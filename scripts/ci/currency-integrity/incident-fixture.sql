-- Isolated fixture on a throwaway DB. CDMA = the migration-seeded "Nolmark CDMA" property; CTRL = synthetic USD control property.
SET search_path=public,extensions;
INSERT INTO auth.users(id,email) VALUES
 ('a0000000-0000-4000-8000-000000000001','manager.cdma@example.test'),
 ('a0000000-0000-4000-8000-000000000002','manager.ctrl@example.test');
INSERT INTO staynas_properties(id,organisation_id,slug,code,name,timezone,currency,status)
SELECT 'c0000000-0000-4000-8000-000000000002',organisation_id,'control-usd-lodge','CTRL','Control USD Lodge','Africa/Nairobi','USD','active'
FROM staynas_properties WHERE slug='nolmark-cdma-staynas';
INSERT INTO user_roles(user_id,role) VALUES ('a0000000-0000-4000-8000-000000000001','manager'),('a0000000-0000-4000-8000-000000000002','manager');
-- bootstrap trigger grants CDMA membership; restrict control manager to the control property only
DELETE FROM staynas_property_members WHERE user_id='a0000000-0000-4000-8000-000000000002';
INSERT INTO staynas_property_members(property_id,user_id,role) VALUES ('c0000000-0000-4000-8000-000000000002','a0000000-0000-4000-8000-000000000002','manager');
INSERT INTO staynas_user_property_context(user_id,property_id)
SELECT 'a0000000-0000-4000-8000-000000000001'::uuid,id FROM staynas_properties WHERE slug='nolmark-cdma-staynas' AND code<>'CTRL'
UNION ALL SELECT 'a0000000-0000-4000-8000-000000000002'::uuid,'c0000000-0000-4000-8000-000000000002'::uuid;
INSERT INTO staynas_room_catalogue_types(id,slug,name,capacity_adults,max_occupancy) VALUES
 ('d0000000-0000-4000-8000-000000000001','deluxe-double','Deluxe Double',2,2),
 ('d0000000-0000-4000-8000-000000000002','ctrl-double','Control Double',2,2);
INSERT INTO rooms(id,property_id,slug,name,capacity_adults,capacity_children,max_occupancy,total_units,base_price,currency,catalogue_type_id,configuration_source)
SELECT 'e0000000-0000-4000-8000-000000000001',id,'deluxe-double','Deluxe Double',2,0,2,3,80,'USD','d0000000-0000-4000-8000-000000000001','tenant_configured'
FROM staynas_properties WHERE slug='nolmark-cdma-staynas' AND code<>'CTRL';
INSERT INTO rooms(id,property_id,slug,name,capacity_adults,capacity_children,max_occupancy,total_units,base_price,currency,catalogue_type_id,configuration_source) VALUES
 ('e0000000-0000-4000-8000-000000000002','c0000000-0000-4000-8000-000000000002','ctrl-double','Control Double',2,0,2,3,90,'USD','d0000000-0000-4000-8000-000000000002','tenant_configured');
