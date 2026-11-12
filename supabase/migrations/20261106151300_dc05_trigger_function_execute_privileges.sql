-- DC-05 security closure: trigger functions are not RPC entry points.
BEGIN;
REVOKE ALL ON FUNCTION public.validate_staynas_distribution_room_type_mapping()
  FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.validate_staynas_distribution_rate_plan_mapping()
  FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.validate_staynas_distribution_reservation_link()
  FROM PUBLIC,anon,authenticated;
COMMIT;
