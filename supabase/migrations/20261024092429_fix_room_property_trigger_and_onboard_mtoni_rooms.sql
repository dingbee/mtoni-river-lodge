CREATE OR REPLACE FUNCTION public.staynas_enforce_room_property()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE _room_property uuid; _category_property uuid;
BEGIN
  IF TG_TABLE_NAME = 'rooms' THEN
    IF NEW.property_id IS NULL THEN RAISE EXCEPTION 'Room property is required'; END IF;
    IF NEW.category_id IS NOT NULL THEN
      SELECT property_id INTO _category_property FROM public.room_categories WHERE id=NEW.category_id;
      IF _category_property IS DISTINCT FROM NEW.property_id THEN
        RAISE EXCEPTION 'Room category belongs to another property';
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  SELECT property_id INTO _room_property FROM public.rooms WHERE id=NEW.room_id;
  IF _room_property IS NULL THEN RAISE EXCEPTION 'Room property is required'; END IF;
  IF NEW.property_id IS NULL THEN NEW.property_id := _room_property; END IF;
  IF NEW.property_id <> _room_property THEN RAISE EXCEPTION 'Room unit belongs to another property'; END IF;
  RETURN NEW;
END $$;

DO $$
DECLARE p uuid := '258a4f01-28ac-4efb-a641-c7649e55dc95'; c_standard uuid; c_deluxe uuid; c_family uuid;
BEGIN
 IF NOT EXISTS (SELECT 1 FROM public.staynas_properties WHERE id=p AND name='Mtoni River Lodge') THEN RAISE EXCEPTION 'Mtoni property identity check failed'; END IF;
 IF EXISTS (SELECT 1 FROM public.room_categories WHERE slug IN ('mtoni-standard','mtoni-deluxe','mtoni-family-group') AND property_id<>p) THEN RAISE EXCEPTION 'Room category slug collision with another property'; END IF;
 INSERT INTO public.room_categories(property_id,slug,name,description,features,specifications,sort_order,status)
 SELECT p,'mtoni-standard','Standard Room','Mtoni River Lodge Standard accommodation',ARRAY[]::text[],'{}'::jsonb,1,'active'
 WHERE NOT EXISTS (SELECT 1 FROM public.room_categories WHERE property_id=p AND slug='mtoni-standard');
 INSERT INTO public.room_categories(property_id,slug,name,description,features,specifications,sort_order,status)
 SELECT p,'mtoni-deluxe','Deluxe Room','Mtoni River Lodge Deluxe accommodation',ARRAY[]::text[],'{}'::jsonb,2,'active'
 WHERE NOT EXISTS (SELECT 1 FROM public.room_categories WHERE property_id=p AND slug='mtoni-deluxe');
 INSERT INTO public.room_categories(property_id,slug,name,description,features,specifications,sort_order,status)
 SELECT p,'mtoni-family-group','Family / Group Room','Mtoni River Lodge Family and Group accommodation',ARRAY[]::text[],'{}'::jsonb,3,'active'
 WHERE NOT EXISTS (SELECT 1 FROM public.room_categories WHERE property_id=p AND slug='mtoni-family-group');
 SELECT id INTO c_standard FROM public.room_categories WHERE property_id=p AND slug='mtoni-standard';
 SELECT id INTO c_deluxe FROM public.room_categories WHERE property_id=p AND slug='mtoni-deluxe';
 SELECT id INTO c_family FROM public.room_categories WHERE property_id=p AND slug='mtoni-family-group';

 IF EXISTS (SELECT 1 FROM public.rooms WHERE slug IN ('mtoni-standard-room','mtoni-deluxe-room','mtoni-family-group-room') AND property_id<>p) THEN RAISE EXCEPTION 'Room slug collision with another property'; END IF;
 INSERT INTO public.rooms(property_id,slug,name,short_description,capacity_adults,capacity_children,max_occupancy,total_units,base_price,currency,status,sort_order,included_guests,extra_guest_fee,category_id,hero_line,gallery_urls)
 SELECT p,'mtoni-standard-room','Standard Room','Standard accommodation at Mtoni River Lodge',3,2,3,21,260,'USD','active',1,2,30,c_standard,'Comfortable lodge accommodation','{}'
 WHERE NOT EXISTS (SELECT 1 FROM public.rooms WHERE property_id=p AND slug='mtoni-standard-room');
 INSERT INTO public.rooms(property_id,slug,name,short_description,capacity_adults,capacity_children,max_occupancy,total_units,base_price,currency,status,sort_order,included_guests,extra_guest_fee,category_id,hero_line,gallery_urls)
 SELECT p,'mtoni-deluxe-room','Deluxe Room','Deluxe accommodation at Mtoni River Lodge',3,2,3,2,310,'USD','active',2,2,30,c_deluxe,'Elevated comfort at Mtoni River Lodge','{}'
 WHERE NOT EXISTS (SELECT 1 FROM public.rooms WHERE property_id=p AND slug='mtoni-deluxe-room');
 INSERT INTO public.rooms(property_id,slug,name,short_description,capacity_adults,capacity_children,max_occupancy,total_units,base_price,currency,status,sort_order,included_guests,extra_guest_fee,category_id,hero_line,gallery_urls)
 SELECT p,'mtoni-family-group-room','Family / Group Room','Family and group accommodation at Mtoni River Lodge',5,4,5,1,550,'USD','active',3,5,0,c_family,'Space for families and groups','{}'
 WHERE NOT EXISTS (SELECT 1 FROM public.rooms WHERE property_id=p AND slug='mtoni-family-group-room');

 INSERT INTO public.room_states(property_id,room_id,unit_label)
 SELECT p,r.id,r.slug || '-' || lpad(gs::text,2,'0')
 FROM public.rooms r CROSS JOIN LATERAL generate_series(1,r.total_units) gs
 WHERE r.property_id=p AND r.slug IN ('mtoni-standard-room','mtoni-deluxe-room','mtoni-family-group-room')
 AND NOT EXISTS (SELECT 1 FROM public.room_states s WHERE s.room_id=r.id AND s.unit_label=r.slug || '-' || lpad(gs::text,2,'0'));
 IF (SELECT count(*) FROM public.rooms WHERE property_id=p AND slug IN ('mtoni-standard-room','mtoni-deluxe-room','mtoni-family-group-room')) <> 3 THEN RAISE EXCEPTION 'Expected three Mtoni room types'; END IF;
END $$;