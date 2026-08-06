DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='guest_checkins') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.guest_checkins;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='guest_documents') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.guest_documents;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='room_states') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.room_states;
  END IF;
END $$;