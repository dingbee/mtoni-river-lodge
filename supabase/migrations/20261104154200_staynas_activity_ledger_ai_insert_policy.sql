-- StayNas activity ledger: restore AI audit inserts without widening global read access.
-- AI records remain globally readable only by the founder administrator.
-- Each authenticated caller may insert only an audit row attributed to themselves.
-- No retention purge is configured: audit evidence is retained until a separately
-- approved retention policy is adopted. Never silently purge financial/security evidence.

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

comment on table public.activity_logs is
  'Append-only StayNas operational audit ledger. No automatic purge is configured.';
comment on table public.ai_activity_logs is
  'Append-only StayNas AI audit ledger. Insert is restricted to the authenticated actor; global reads are founder-only. No automatic purge is configured.';

commit;
