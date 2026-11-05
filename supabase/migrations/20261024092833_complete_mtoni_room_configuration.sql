DO $$
DECLARE p uuid := '258a4f01-28ac-4efb-a641-c7649e55dc95';
BEGIN
 IF NOT EXISTS (SELECT 1 FROM public.staynas_properties WHERE id=p AND name='Mtoni River Lodge') THEN
   RAISE EXCEPTION 'Mtoni property identity check failed';
 END IF;
 IF (SELECT count(*) FROM public.rooms WHERE property_id=p AND slug IN ('mtoni-standard-room','mtoni-deluxe-room','mtoni-family-group-room')) <> 3 THEN
   RAISE EXCEPTION 'Expected Mtoni room types are missing; aborting';
 END IF;

 UPDATE public.room_categories
 SET specifications = CASE slug
   WHEN 'mtoni-standard' THEN '{"capacity":{"adults":3,"children":2,"maximum_occupancy":3},"pricing":{"base_rate":260,"currency":"USD","included_guests":2,"extra_guest_fee":30},"inventory_units":21}'::jsonb
   WHEN 'mtoni-deluxe' THEN '{"capacity":{"adults":3,"children":2,"maximum_occupancy":3},"pricing":{"base_rate":310,"currency":"USD","included_guests":2,"extra_guest_fee":30},"inventory_units":2}'::jsonb
   WHEN 'mtoni-family-group' THEN '{"capacity":{"adults":5,"children":4,"maximum_occupancy":5},"pricing":{"base_rate":550,"currency":"USD","included_guests":5,"extra_guest_fee":0},"inventory_units":1}'::jsonb
   ELSE specifications END,
   features = CASE slug
     WHEN 'mtoni-standard' THEN ARRAY['Standard accommodation','Base rate covers 2 guests','Additional guest fee applies']
     WHEN 'mtoni-deluxe' THEN ARRAY['Deluxe accommodation','Base rate covers 2 guests','Additional guest fee applies']
     WHEN 'mtoni-family-group' THEN ARRAY['Family and group accommodation','Flat rate for up to 5 guests']
     ELSE features END
 WHERE property_id=p AND slug IN ('mtoni-standard','mtoni-deluxe','mtoni-family-group');

 UPDATE public.rooms
 SET short_description = CASE slug
     WHEN 'mtoni-standard-room' THEN 'Standard accommodation for a comfortable stay at Mtoni River Lodge.'
     WHEN 'mtoni-deluxe-room' THEN 'Deluxe accommodation for guests seeking an elevated lodge stay.'
     WHEN 'mtoni-family-group-room' THEN 'Family and group accommodation with capacity for up to five guests.'
     ELSE short_description END,
     hero_line = CASE slug
     WHEN 'mtoni-standard-room' THEN 'Comfortable lodge accommodation'
     WHEN 'mtoni-deluxe-room' THEN 'Elevated comfort at Mtoni River Lodge'
     WHEN 'mtoni-family-group-room' THEN 'Space for families and groups'
     ELSE hero_line END
 WHERE property_id=p AND slug IN ('mtoni-standard-room','mtoni-deluxe-room','mtoni-family-group-room');

 IF (SELECT count(*) FROM public.room_states WHERE property_id=p) <> 24 THEN
   RAISE EXCEPTION 'Expected 24 physical room units after configuration';
 END IF;
END $$;