#!/usr/bin/env bash
set -euo pipefail

PSQL=(psql -X -v ON_ERROR_STOP=1 -h "${PGHOST:-localhost}" -p "${PGPORT:-5432}" -U "${PGUSER:-postgres}" -d "${PGDATABASE:-postgres}")

ORG_ID="$("${PSQL[@]}" -Atqc "INSERT INTO public.staynas_organisations(id,slug,name,status) VALUES (gen_random_uuid(),'cc07-concurrency-'||gen_random_uuid()::text,'CC07 Concurrency Test','active') RETURNING id")"
PROVIDER_ID="$("${PSQL[@]}" -Atqc "INSERT INTO public.commercial_provider_accounts(organisation_id,provider,provider_account_ref,supported_currencies,status) VALUES ('$ORG_ID','manual','cc07-concurrency-'||gen_random_uuid()::text,ARRAY['TZS'],'active') RETURNING id")"
RUN_ID="$("${PSQL[@]}" -Atqc "SET request.jwt.claim.role='service_role'; SELECT public.commercial_create_reconciliation_run('$PROVIDER_ID','TZS',now()-interval '1 day',now(),'cc07-concurrent-run-'||gen_random_uuid()::text,NULL)->>'id'")"
READY_FILE="/tmp/cc07-writer-${RUN_ID}.ready"
rm -f "$READY_FILE"

# Transaction A owns the run row lock while it inserts an unresolved finding.
# Transaction B must wait for A, then observe the finding before closing the run.
("${PSQL[@]}" > /tmp/cc07-concurrency-writer.log 2>&1 <<SQL
SET request.jwt.claim.role='service_role';
BEGIN;
SELECT public.commercial_create_reconciliation_item(
  '$RUN_ID','amount_mismatch',NULL,'cc07-concurrent-provider-row',
  10000,9000,'TZS','TZS','{"concurrencyTest":true}'::jsonb,
  'unresolved',NULL,NULL
);
\\! touch "$READY_FILE"
SELECT pg_sleep(2);
COMMIT;
SQL
) &
WRITER_PID=$!
for attempt in $(seq 1 100); do
  [[ -f "$READY_FILE" ]] && break
  sleep 0.05
done
if [[ ! -f "$READY_FILE" ]]; then
  echo "Concurrent writer did not acquire the run lock in time."
  cat /tmp/cc07-concurrency-writer.log
  exit 1
fi
CLOSURE_STATUS="$("${PSQL[@]}" -Atqc "SET request.jwt.claim.role='service_role'; SELECT public.commercial_complete_reconciliation_run('$RUN_ID',NULL)->>'status'")"
wait "$WRITER_PID"

ITEM_COUNT="$("${PSQL[@]}" -Atqc "SELECT count(*) FROM public.commercial_reconciliation_items WHERE run_id='$RUN_ID'")"
FINAL_STATUS="$("${PSQL[@]}" -Atqc "SELECT status FROM public.commercial_reconciliation_runs WHERE id='$RUN_ID'")"
if [[ "$ITEM_COUNT" != "1" || "$FINAL_STATUS" != "discrepancy" || "$CLOSURE_STATUS" != "discrepancy" ]]; then
  echo "Concurrent run closure failed: items=$ITEM_COUNT final=$FINAL_STATUS closure=$CLOSURE_STATUS"
  cat /tmp/cc07-concurrency-writer.log
  exit 1
fi

rm -f "$READY_FILE"
echo "CC-07 concurrency contract passed: run closure waited for the unresolved exception and preserved discrepancy status."
