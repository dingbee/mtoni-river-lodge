-- DC-05.07 operational integration smoke test. Disposable PostgreSQL only.
BEGIN;

DO $test$
DECLARE
  v_org uuid:='07070000-0000-4000-8000-000000000001';
  v_property uuid:='07070000-0000-4000-8000-000000000002';
  v_user uuid:='07070000-0000-4000-8000-000000000003';
  v_account uuid:='07070000-0000-4000-8000-000000000004';
  v_grant uuid:='07070000-0000-4000-8000-000000000005';
  v_connection uuid:='07070000-0000-4000-8000-000000000006';
  v_inbox uuid:='07070000-0000-4000-8000-000000000007';
  v_type uuid:='07070000-0000-4000-8000-000000000008';
  v_room uuid:='07070000-0000-4000-8000-000000000009';
  v_booking uuid:='07070000-0000-4000-8000-000000000010';
  v_room_state uuid:='07070000-0000-4000-8000-000000000011';
  v_link uuid:='07070000-0000-4000-8000-000000000012';
  v_guest_id uuid;
  v_allocation_status text;
  v_integration_status text;
  v_task_count integer;
  v_room_state_booking uuid;
  v_booking_status text;
  v_reinstate_inbox uuid:='07070000-0000-4000-8000-000000000013';
  v_reinstate_lease uuid:='07070000-0000-4000-8000-000000000014';
  v_reinstate_result jsonb;
  v_modify_inbox uuid:='07070000-0000-4000-8000-000000000015';
  v_modify_lease uuid:='07070000-0000-4000-8000-000000000016';
  v_modify_result jsonb;
  v_pending_booking uuid:='07070000-0000-4000-8000-000000000017';
  v_pending_inbox uuid:='07070000-0000-4000-8000-000000000018';
  v_pending_link uuid:='07070000-0000-4000-8000-000000000019';
BEGIN
  INSERT INTO public.staynas_organisations(id,slug)¶»§q«^