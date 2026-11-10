-- RC-RB-01 isolated PostgreSQL contract and lifecycle verification.
\set ON_ERROR_STOP on

DO $test$
DECLARE
  v_user uuid := '10000000-0000-0000-0000-000000000001';
  v_org uuid := '50000000-0000-0000-0000-000000000001';
  v_property_a uuid := 'f44ff48a-5449-4464-b0cb-83295fadb468';
  v_property_b uuid := '20000000-0000-0000-0000-000000000002';
  v_category_a uuid := '30000000-0000-0000-0000-000000000001';
  v_category_b uuid := '30000000-0000-0000-0000-000000000002';
  v_room_a uuid := '40000000-0000-0000-0000-000000000001';
  v_room_b uuid := '40000000-0000-0000-0000-000000000002';
  v_created uuid;
  v_unit uuid;
  v_count integer;
  v_payload jsonb;
  v_failed boolean;
BEGIN
  INSERT INTO auth.users(id) VALUES (v_user);
  INSERT INTO public.staynas_organisations(id,slug,name) VALUES
    (v_org,'rc-rb-01-test-organisation','RC-RB-01 Test Organisation');
  INSERT INTO public.staynas_properties(id,organisation_id,slug,code,name,status,currency) VALUES
    (v_property_a,v_org,'rc-rb-01-nolmark-property','RC-RB-01-A','Nolmark CDMA','active','TZS'),
    (v_property_b,v_org,'rc-rb-01-tenant-b-property','RC-RB-01-B','Tenant B','active','USD');
  INSERT INTO public.staynas_property_members(property_id,user_id,status) VALUES
    (v_property_a,v_user,'active');
  INSERT INTO public.staynas_property_domains(property_id,hostname,verification_status,verified_at) VALUES
    (v_property_a,'nolmarkcdma.staynas.com','verified',now()),
    (v_property_b,'tenant-b.example','verified',now());
  INSERT INTO public.room_categories(id,property_id,slug,name,status) VALUES
    (v_category_a,v_property_a,'standard','Standard','active'),
    (v_category_b,v_property_b,'standard','Standard','active');
  INSERT INTO public.rooms(id,property_id,category_id,slug,name,total_units,base_price,currency,status)
  VALUES
    (v_room_a,v_property_a,v_category_a,'room-a','Tenant A Room',1,120,'TZS','active'),
    (v_room_b,v_property_b,v_category_b,'room-b','Tenant B Room',1,250,'USD','active');
  INSERT INTO public.room_states(room_id,property_id,unit_label) VALUES
    (v_room_a,v_property_a,'room-a-01'),
    (v_room_b,v_property_b,'room-b-01');

  IF public.staynas_resolve_public_property('nolmarkcdma.staynas.com') IS DISTINCT FROM v_property_a THEN
    RAISE EXCEPTION 'Verified hostname did not resolve to its property';
  END IF;
  IF public.staynas_resolve_public_property('unknown.example') IS NOT NULL THEN
    RAISE EXCEPTION 'Unknown hostname unexpectedly resolved';
  END IF;
  IF jsonb_array_length(public.staynas_get_public_room_catalog('nolmarkcdma.staynas.com')->'rooms') <> 1
     OR public.staynas_get_public_room_catalog('nolmarkcdma.staynas.com')->'rooms'->0->>'slug' <> 'room-a' THEN
    RAISE EXCEPTION 'Public catalogue crossed tenant boundaries';
  END IF;
  IF jsonb_array_length(public.staynas_get_public_room_status('nolmarkcdma.staynas.com',CURRENT_DATE)->'rooms') <> 1 THEN
    RAISE EXCEPTION 'Public room status crossed tenant boundaries';
  END IF;
  IF jsonb_array_length(public.staynas_get_public_room_pricing('nolmarkcdma.staynas.com',CURRENT_DATE,CURRENT_DATE+1)->'rooms') <> 1 THEN
    RAISE EXCEPTION 'Public published pricing crossed tenant boundaries';
  END IF;
  IF has_table_privilege('anon','public.rooms','SELECT')
     OR has_table_privilege('anon','public.room_categories','SELECT') THEN
    RAISE EXCEPTION 'Anonymous direct table reads were not revoked';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='rooms'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='room_states'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='room_categories'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='room_inventory'
  ) THEN
    RAISE EXCEPTION 'Room catalogue and operational tables are not enabled for realtime';
  END IF;
  IF NOT has_function_privilege('anon','public.staynas_get_public_room_catalog(text,text)','EXECUTE')
     OR NOT has_function_privilege('anon','public.staynas_get_public_room_status(text,date)','EXECUTE') THEN
    RAISE EXCEPTION 'Anonymous public RPC grants are missing';
  END IF;

  PERFORM set_config('request.jwt.claim.sub',v_user::text,true);
  v_payload := jsonb_build_object(
    'slug','suite-a','name','Suite A','category_id',v_category_a,
    'short_name','Suite','room_number_label','Suite number',
    'short_description','Test room','description',jsonb_build_array('Paragraph one'),
    'details',jsonb_build_array(jsonb_build_object('label','View','value','Garden')),
    'cta_line','Book now','capacity_adults',2,'capacity_children',1,'max_occupancy',3,
    'total_units',2,'base_price',150,'included_guests',2,'extra_guest_fee',20,
    'status','active','sort_order',1,'hero_line','A test suite',
    'image_url','https://example.com/hero.jpg','gallery_urls',jsonb_build_array('https://example.com/one.jpg'),
    'size_label','30 sqm','view_label','Garden','bed_label','Queen bed',
    'bathroom_label','En-suite','amenities',jsonb_build_array('Wi-Fi','Air conditioning')
  );
  v_created := public.staynas_save_room_type_configuration(v_payload);
  SELECT count(*) INTO v_count FROM public.room_states WHERE room_id=v_created AND property_id=v_property_a;
  IF v_count <> 2 THEN RAISE EXCEPTION 'Initial room save did not provision two physical units'; END IF;

  v_payload := jsonb_set(v_payload,'{id}',to_jsonb(v_created::text));

  -- Eight requested guest-catalogue mutations are verified against the DB and
  -- the public, hostname-bound catalogue/pricing contracts.
  v_payload := jsonb_set(v_payload,'{name}',to_jsonb('Suite A Revised'::text));
  PERFORM public.staynas_save_room_type_configuration(v_payload);
  IF (SELECT name FROM public.rooms WHERE id=v_created) <> 'Suite A Revised' THEN
    RAISE EXCEPTION 'Room name mutation did not persist';
  END IF;

  v_payload := jsonb_set(v_payload,'{description}',jsonb_build_array('Updated room description'));
  PERFORM public.staynas_save_room_type_configuration(v_payload);
  IF (SELECT description[1] FROM public.rooms WHERE id=v_created) <> 'Updated room description' THEN
    RAISE EXCEPTION 'Room description mutation did not persist';
  END IF;

  v_payload := jsonb_set(jsonb_set(jsonb_set(v_payload,'{capacity_adults}','3'::jsonb),'{capacity_children}','2'::jsonb),'{max_occupancy}','5'::jsonb);
  v_payload := jsonb_set(v_payload,'{included_guests}','3'::jsonb);
  PERFORM public.staynas_save_room_type_configuration(v_payload);
  IF NOT EXISTS (SELECT 1 FROM public.rooms WHERE id=v_created AND capacity_adults=3 AND capacity_children=2 AND max_occupancy=5) THEN
    RAISE EXCEPTION 'Occupancy mutation did not persist';
  END IF;

  v_payload := jsonb_set(v_payload,'{bed_label}',to_jsonb('King bed'::text));
  PERFORM public.staynas_save_room_type_configuration(v_payload);
  IF (SELECT bed_label FROM public.rooms WHERE id=v_created) <> 'King bed' THEN
    RAISE EXCEPTION 'Bed configuration mutation did not persist';
  END IF;

  v_payload := jsonb_set(v_payload,'{amenities}',jsonb_build_array('Wi-Fi','Air conditioning','Workspace'));
  PERFORM public.staynas_save_room_type_configuration(v_payload);
  IF (SELECT cardinality(amenities) FROM public.rooms WHERE id=v_created) <> 3 THEN
    RAISE EXCEPTION 'Amenities mutation did not persist';
  END IF;

  v_payload := jsonb_set(jsonb_set(v_payload,'{image_url}',to_jsonb('https://example.com/hero-updated.jpg'::text)),
    '{gallery_urls}',jsonb_build_array('https://example.com/gallery-updated.jpg'));
  PERFORM public.staynas_save_room_type_configuration(v_payload);
  IF NOT EXISTS (SELECT 1 FROM public.rooms WHERE id=v_created
    AND image_url='https://example.com/hero-updated.jpg'
    AND gallery_urls[1]='https://example.com/gallery-updated.jpg') THEN
    RAISE EXCEPTION 'Image/gallery mutation did not persist';
  END IF;

  v_payload := jsonb_set(v_payload,'{status}',to_jsonb('archived'::text));
  PERFORM public.staynas_save_room_type_configuration(v_payload);
  IF (SELECT status FROM public.rooms WHERE id=v_created) <> 'inactive'
     OR jsonb_array_length(public.staynas_get_public_room_catalog('nolmarkcdma.staynas.com')->'rooms') <> 1 THEN
    RAISE EXCEPTION 'Publication mutation did not remove archived room from public catalogue';
  END IF;
  v_payload := jsonb_set(v_payload,'{status}',to_jsonb('active'::text));
  PERFORM public.staynas_save_room_type_configuration(v_payload);

  v_payload := jsonb_set(v_payload,'{base_price}','175'::jsonb);
  PERFORM public.staynas_save_room_type_configuration(v_payload);
  IF (SELECT currency FROM public.rooms WHERE id=v_created) <> 'TZS'
     OR (SELECT (item->>'price_total')::numeric
         FROM jsonb_array_elements(public.staynas_get_public_room_pricing(
           'nolmarkcdma.staynas.com',CURRENT_DATE,CURRENT_DATE+1
         )->'rooms') item
         WHERE item->>'slug'='suite-a') <> 175 THEN
    RAISE EXCEPTION 'Price mutation did not propagate through property-currency published pricing';
  END IF;

  v_payload := jsonb_set(v_payload,'{total_units}','3'::jsonb);
  v_created := public.staynas_save_room_type_configuration(v_payload);
  SELECT count(*) INTO v_count FROM public.room_states WHERE room_id=v_created AND property_id=v_property_a;
  IF v_count <> 3 THEN RAISE EXCEPTION 'Room quantity increase did not provision physical units'; END IF;

  v_unit := public.staynas_manage_room_unit('create',v_created,NULL,'suite-a-custom');
  UPDATE public.room_states SET state='vacant_clean' WHERE id=v_unit;
  PERFORM public.staynas_manage_room_unit('rename',v_created,v_unit,'suite-a-renamed');
  IF NOT EXISTS (SELECT 1 FROM public.room_states WHERE id=v_unit AND unit_label='suite-a-renamed') THEN
    RAISE EXCEPTION 'Physical unit rename failed';
  END IF;
  PERFORM public.staynas_manage_room_unit('delete',v_created,v_unit,NULL);
  SELECT total_units INTO v_count FROM public.rooms WHERE id=v_created;
  IF v_count <> 3 THEN RAISE EXCEPTION 'Physical unit delete did not reconcile room quantity'; END IF;

  INSERT INTO public.booking_holds(room_id,status,expires_at,check_in,check_out)
  VALUES (v_created,'active',now()+interval '10 minutes',CURRENT_DATE,CURRENT_DATE+1);
  v_payload := jsonb_set(v_payload,'{total_units}','2'::jsonb);
  v_failed := false;
  BEGIN
    PERFORM public.staynas_save_room_type_configuration(v_payload);
  EXCEPTION WHEN OTHERS THEN
    v_failed := true;
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'Quantity reduction was allowed while an active hold existed'; END IF;
  DELETE FROM public.booking_holds WHERE room_id=v_created;
  PERFORM public.staynas_save_room_type_configuration(v_payload);
  SELECT count(*) INTO v_count FROM public.room_states WHERE room_id=v_created AND property_id=v_property_a;
  IF v_count <> 2 THEN RAISE EXCEPTION 'Safe quantity reduction did not retire one physical unit'; END IF;

  v_failed := false;
  BEGIN
    PERFORM public.staynas_save_room_type_configuration(
      jsonb_set(v_payload,'{id}',to_jsonb(v_room_b::text))
    );
  EXCEPTION WHEN OTHERS THEN
    v_failed := true;
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'Cross-tenant room update was not rejected'; END IF;
END;
$test$;

SELECT 'RC-RB-01 isolated database contract: PASS' AS result;
