#!/usr/bin/env bash
set -euo pipefail

: "${PGHOST:?PGHOST is required}"
: "${PGDATABASE:?PGDATABASE is required}"

org_id="71000000-0000-4000-8000-000000000001"
account_id="72000000-0000-4000-8000-000000000001"
subscription_id="73000000-0000-4000-8000-000000000001"

psql -v ON_ERROR_STOP=1 <<SQL
INSERT INTO public.staynas_organisations(id, slug, name)
VALUES ('$org_id', 'cc03-concurrency-org', 'CC03 Concurrency Organisation');
INSERT INTO public.commercial_accounts(id, organisation_id)
VALUES ('$account_id', '$org_id');
INSERT INTO public.commercial_subscriptions(
  id, account_id, plan_code, plan_version, currency, billing_term,
  property_count, price_resolution_ref, accepted_price_snapshot
) VALUES (
  '$subscription_id', '$account_id', 'professional', 1, 'TZS', 'monthly',
  1, 'concurrent-price', '{"currency":"TZS","total":100000}'
);
SQL

export PGOPTIONS="${PGOPTIONS:-} -c request.jwt.claim.role=service_role"
call_activation() {
  local key="$1"
  psql -v ON_ERROR_STOP=1 -Atc "SELECT public.commercial_activate_trial(
    '$account_id'::uuid,
    '$subscription_id'::uuid,
    'professional',
    1,
    1,
    '$key',
    NULL,
    NULL,
    'service_principal'
  );"
}

set +e
call_activation "cc03-concurrent-trial-a" >/tmp/cc03-trial-a.log 2>&1 &
pid_a=$!
call_activation "cc03-concurrent-trial-b" >/tmp/cc03-trial-b.log 2>&1 &
pid_b=$!
wait "$pid_a"
status_a=$?
wait "$pid_b"
status_b=$?
set -e

successes=$(( (status_a == 0) + (status_b == 0) ))
if [[ "$successes" -ne 1 ]]; then
  cat /tmp/cc03-trial-a.log /tmp/cc03-trial-b.log
  echo "Expected exactly one concurrent activation to succeed; got $successes" >&2
  exit 1
fi

psql -v ON_ERROR_STOP=1 -At <<SQL
DO \$verify\$
DECLARE
  v_claims integer;
  v_trialing integer;
  v_events integer;
  v_audits integer;
BEGIN
  SELECT count(*) INTO v_claims
  FROM public.commercial_trial_claims WHERE account_id = '$account_id';
  SELECT count(*) INTO v_trialing
  FROM public.commercial_subscriptions
  WHERE account_id = '$account_id' AND status = 'trialing';
  SELECT count(*) INTO v_events
  FROM public.commercial_subscription_events
  WHERE account_id = '$account_id' AND event_type = 'activate_trial';
  SELECT count(*) INTO v_audits
  FROM public.commercial_audit_events
  WHERE resource_ref = '$subscription_id'
    AND action = 'subscription.trial_activated';

  IF v_claims <> 1 OR v_trialing <> 1 OR v_events <> 1 OR v_audits <> 1 THEN
    RAISE EXCEPTION 'Concurrent trial invariant failed: claims %, trialing %, events %, audits %',
      v_claims, v_trialing, v_events, v_audits;
  END IF;
END;
\$verify\$;
SQL

echo "CC-03 concurrent trial activation: PASS (one activation, one permanent claim, one event, one audit)"
