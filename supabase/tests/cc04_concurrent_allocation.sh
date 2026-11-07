#!/usr/bin/env bash
set -euo pipefail
: "${PGHOST:=localhost}"
: "${PGUSER:=postgres}"
: "${PGDATABASE:=postgres}"
: "${PGPASSWORD:=postgres}"
export PGHOST PGUSER PGDATABASE PGPASSWORD
psql -v ON_ERROR_STOP=1 <<'SQL'
INSERT INTO auth.users(id) VALUES ('72000000-0000-4000-8000-000000000002');
INSERT INTO public.staynas_organisations(id,slug,name) VALUES
  ('71000000-0000-4000-8000-000000000002','cc04-concurrency-test','CC04 Concurrency Test');
INSERT INTO public.commercial_accounts(id,organisation_id) VALUES
  ('73000000-0000-4000-8000-000000000002','71000000-0000-4000-8000-000000000002');
INSERT INTO public.commercial_subscriptions(
  id,account_id,plan_code,plan_version,currency,billing_term,property_count,
  price_resolution_ref,accepted_price_snapshot,commercial_acceptance_ref,status,activated_at,
  current_period_starts_at,current_period_ends_at
) VALUES (
  '74000000-0000-4000-8000-000000000002',
  '73000000-0000-4000-8000-000000000002',
  'professional',1,'TZS','monthly',1,'cc04-concurrency-price-ref',
  '{"currency":"TZS","totalAmountMinor":120000,"lines":[{"code":"professional_base","kind":"plan_base","description":"Concurrency test subscription","quantity":1,"unitAmountMinor":120000,"amountMinor":120000}]}',
  'cc04-concurrency-accepted','active',now(),now(),now()+interval '1 month'
);
INSERT INTO public.commercial_provider_accounts(
  organisation_id,provider,provider_account_ref,credential_secret_ref,supported_currencies,status
) VALUES (
  '71000000-0000-4000-8000-000000000002','manual','cc04-concurrency-manual','',ARRAY['TZS'],'active'
);
SQL
INVOICE_ID="$(psql -v ON_ERROR_STOP=1 -tA -c "select (public.commercial_create_invoice_from_subscription(
  '74000000-0000-4000-8000-000000000002',now(),now()+interval '1 month',now()+interval '14 days',
  'cc04-concurrency-invoice-001',
  '{\"treatment\":\"not_applicable\",\"policyRef\":\"cc04-concurrency-tax-v1\",\"amountMinor\":0,\"currency\":\"TZS\"}',
  '{\"amountMinor\":0,\"policyRef\":\"cc04-concurrency-discount-none\"}',
  '72000000-0000-4000-8000-000000000002'
)->>'invoiceId')")"
PROVIDER_ID="$(psql -v ON_ERROR_STOP=1 -tA -c "select id from public.commercial_provider_accounts where provider_account_ref='cc04-concurrency-manual'")"
PAYMENT_A="$(psql -v ON_ERROR_STOP=1 -tA -c "select public.commercial_create_payment_attempt('$INVOICE_ID','$PROVIDER_ID',70000,'TZS','cc04-concurrency-payment-a','72000000-0000-4000-8000-000000000002')")"
PAYMENT_B="$(psql -v ON_ERROR_STOP=1 -tA -c "select public.commercial_create_payment_attempt('$INVOICE_ID','$PROVIDER_ID',70000,'TZS','cc04-concurrency-payment-b','72000000-0000-4000-8000-000000000002')")"

set +e
psql -v ON_ERROR_STOP=1 -c "select set_config('request.jwt.claim.role','service_role',false); select public.commercial_confirm_and_allocate_payment('$PAYMENT_A','cc04-concurrent-a',70000,'TZS','authorized_manual_verification','cc04-concurrent-settlement-a','cc04-concurrent-alloc-a',now());" >/tmp/cc04-allocation-a.log 2>&1 &
PID_A=$!
psql -v ON_ERROR_STOP=1 -c "select set_config('request.jwt.claim.role','service_role',false); select public.commercial_confirm_and_allocate_payment('$PAYMENT_B','cc04-concurrent-b',70000,'TZS','authorized_manual_verification','cc04-concurrent-settlement-b','cc04-concurrent-alloc-b',now());" >/tmp/cc04-allocation-b.log 2>&1 &
PID_B=$!
wait "$PID_A"; STATUS_A=$?
wait "$PID_B"; STATUS_B=$?
set -e

if [[ "$STATUS_A" -eq "$STATUS_B" ]]; then
  echo "Expected exactly one concurrent 70,000 allocation to succeed against 120,000 outstanding."
  cat /tmp/cc04-allocation-a.log /tmp/cc04-allocation-b.log
  exit 1
fi
RESULT="$(psql -v ON_ERROR_STOP=1 -tA -c "select amount_paid_minor::text || ':' || status from public.commercial_invoices where id='$INVOICE_ID'")"
ALLOCATIONS="$(psql -v ON_ERROR_STOP=1 -tA -c "select count(*) from public.commercial_payment_allocations where invoice_id='$INVOICE_ID'")"
[[ "$RESULT" == "70000:partially_paid" ]] || { echo "Unexpected concurrent invoice balance: $RESULT"; exit 1; }
[[ "$ALLOCATIONS" == "1" ]] || { echo "Expected one allocation, found $ALLOCATIONS"; exit 1; }
echo "CC-04 concurrent allocation passed: one 70,000 settlement accepted, one rejected, balance=70,000 TZS."
