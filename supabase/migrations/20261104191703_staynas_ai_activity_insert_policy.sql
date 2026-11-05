-- Restore authenticated AI audit writes without widening global read access.
-- Each authenticated user may append only records attributed to their own user ID.
-- Global AI log reads remain founder-admin only under the existing SELECT policy.

begin;

grant select, insert on public.ai_activity_logs to authenticated;
revoke update, delete on public.ai_activity_logs from authenticated;

drop policy if exists "Authenticated users insert own AI activity logs" on public.ai_activity_logs;
create policy "Authenticated users insert own AI activity logs"
  on public.ai_activity_logs
  for insert
  to authenticated
  with check (user_id = (select auth.uid()));

create index if not exists idx_ai_activity_logs_created_at
  on public.ai_activity_logs (created_at desc);

create index if not exists idx_ai_activity_logs_user_created_at
  on public.ai_activity_logs (user_id, created_at desc);

commit;