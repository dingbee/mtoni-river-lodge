DO $migration$
DECLARE
  f record;
  def text;
  changed text;
  mtoni constant uuid := '258a4f01-28ac-4efb-a641-c7649e55dc95';
BEGIN
  -- Public Mtoni booking entry points are intentionally pinned to Mtoni's property.
  -- This keeps existing website callers compatible while preventing cross-property access.
  FOR f IN
    SELECT p.oid, n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('get_room_availability','create_booking','create_booking_hold','release_booking_hold','get_booking_hold_for_session')
  LOOP
    def := pg_get_functiondef(f.oid);
    changed := def;

    IF f.proname IN ('create_booking','create_booking_hold') THEN
      changed := replace(changed,
        'WHERE slug = _room_slug AND status = ''active''',
        'WHERE slug = _room_slug AND status = ''active'' AND property_id = ''258a4f01-28ac-4efb-a641-c7649e55dc95''::uuid');
    END IF;

    IF f.proname = 'create_booking' THEN
      changed := replace(changed,
        'WHERE slug = _extra_row.slug AND active = true',
        'WHERE slug = _extra_row.slug AND active = true AND property_id = ''258a4f01-28ac-4efb-a641-c7649e55dc95''::uuid');
    END IF;

    IF f.proname = 'get_room_availability' THEN
      changed := replace(changed,
        'WHERE r.status = ''active''',
        'WHERE r.status = ''active'' AND r.property_id = ''258a4f01-28ac-4efb-a641-c7649e55dc95''::uuid');
    END IF;

    IF f.proname = 'get_booking_hold_for_session' THEN
      changed := replace(changed,
        'AND h.session_id = _session_id',
        'AND h.session_id = _session_id
    AND EXISTS (SELECT 1 FROM public.rooms r WHERE r.id = h.room_id AND r.property_id = ''258a4f01-28ac-4efb-a641-c7649e55dc95''::uuid)');
    END IF;

    IF f.proname = 'release_booking_hold' THEN
      changed := replace(changed,
        'SELECT * INTO _row FROM public.booking_holds WHERE id = _hold_id FOR UPDATE;',
        'SELECT h.* INTO _row FROM public.booking_holds h JOIN public.rooms r ON r.id = h.room_id WHERE h.id = _hold_id AND r.property_id = ''258a4f01-28ac-4efb-a641-c7649e55dc95''::uuid FOR UPDATE OF h;');
    END IF;

    IF changed = def THEN
      RAISE EXCEPTION 'No property-scope transformation applied to %.%(%)', f.nspname, f.proname, f.args;
    END IF;

    -- Guard against partial edits: every room lookup must include property scope.
    IF f.proname IN ('create_booking','create_booking_hold')
       AND position('property_id = ''258a4f01-28ac-4efb-a641-c7649e55dc95''::uuid' in changed) = 0 THEN
      RAISE EXCEPTION 'Property scope missing after transformation for %.%(%)', f.nspname, f.proname, f.args;
    END IF;

    EXECUTE changed;
  END LOOP;
END
$migration$;