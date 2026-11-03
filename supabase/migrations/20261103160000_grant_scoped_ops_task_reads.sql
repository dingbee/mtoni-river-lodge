-- Housekeeping work-list server function scopes rows through a SECURITY DEFINER
-- RPC, then verifies returned task IDs through a direct authenticated SELECT.
-- Grant table access; the existing property-scoped RLS policy remains the
-- row-level boundary and continues to isolate tenants.
GRANT SELECT ON TABLE public.ops_tasks TO authenticated;
