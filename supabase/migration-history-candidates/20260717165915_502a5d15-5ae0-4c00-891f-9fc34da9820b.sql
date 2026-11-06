
-- 1. Fix search_path on 5 functions
ALTER FUNCTION public.detect_guest_type(text, text) SET search_path = public;
ALTER FUNCTION public.enqueue_email(text, jsonb) SET search_path = public;
ALTER FUNCTION public.delete_email(text, bigint) SET search_path = public;
ALTER FUNCTION public.read_email_batch(text, integer, integer) SET search_path = public;
ALTER FUNCTION public.move_to_dlq(text, text, bigint, jsonb) SET search_path = public;

-- 2. pesapal_settings: RLS on, no policy → admin-only
CREATE POLICY "Admins manage pesapal settings"
  ON public.pesapal_settings
  FOR ALL
  TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['owner','admin']::public.app_role[]))
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['owner','admin']::public.app_role[]));

-- 3. Trigger functions: revoke from all callers
REVOKE EXECUTE ON FUNCTION public.bookings_link_guest() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_booking_insert() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_booking_update() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.ai_knowledge_sources_tsv_trigger() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.email_queue_wake() FROM PUBLIC, anon, authenticated;

-- 4. Internal service-only helpers: revoke from anon+authenticated (kept for service_role)
REVOKE EXECUTE ON FUNCTION public.enqueue_email(text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.delete_email(text, bigint) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.read_email_batch(text, integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.move_to_dlq(text, text, bigint, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.email_queue_dispatch() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.find_duplicate_guests() FROM PUBLIC, anon, authenticated;

-- 5. RLS-support helpers: revoke from anon (used in policies as SECURITY DEFINER; authenticated keeps EXECUTE)
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.has_any_role(uuid, public.app_role[]) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_staff(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_any_staff(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.current_user_roles() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.knowledge_can_read_document(uuid) FROM PUBLIC, anon;

-- 6. Authenticated-only knowledge search: revoke anon
REVOKE EXECUTE ON FUNCTION public.knowledge_search(text, integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.ai_knowledge_sources_search(text, integer) FROM PUBLIC, anon;

-- 7. Internal utility: detect_guest_type used by trigger only
REVOKE EXECUTE ON FUNCTION public.detect_guest_type(text, text) FROM PUBLIC, anon, authenticated;

-- (create_booking, get_room_availability, get_review_aggregates remain callable by anon — public booking engine + homepage.)
