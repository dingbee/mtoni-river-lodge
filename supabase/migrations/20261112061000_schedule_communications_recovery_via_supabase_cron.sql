-- Keep communications recovery active without Vercel Hobby Cron.
-- The worker remains protected by CRON_SECRET, read from Supabase Vault at runtime.
do $$
begin
  if not exists (
    select 1
    from cron.job
    where jobname = 'staynas-communications-recovery'
  ) then
    perform cron.schedule(
      'staynas-communications-recovery',
      '*/5 * * * *',
      $job$
        select net.http_get(
          'https://staynas-nolmark.vercel.app/api/internal/communications/recovery',
          headers := jsonb_build_object(
            'Authorization',
            'Bearer ' || (
              select decrypted_secret
              from vault.decrypted_secrets
              where name = 'staynas_cron_secret'
            )
          ),
          timeout_milliseconds := 10000
        );
      $job$
    );
  end if;
end
$$;
