import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const migration = readFileSync(
  "supabase/migrations/20261106180000_dc05_webhook_processing_replay.sql",
  "utf8",
);

describe("DC-05.05 webhook processing migration contract", () => {
  it("uses leased SKIP LOCKED claims and validates the current lease on finish", () => {
    expect(migration).toContain("FOR UPDATE SKIP LOCKED");
    expect(migration).toContain("i.lease_token=_lease_token");
    expect(migration).toContain("i.lease_owner=_worker_id");
    expect(migration).toContain("i.lease_expires_at > pg_catalog.now()");
  });
  it("records immutable attempt history and caps automatic retries", () => {
    expect(migration).toContain("staynas_distribution_webhook_attempts");
    expect(migration).toContain("REVOKE UPDATE, DELETE, TRUNCATE ON public.staynas_distribution_webhook_attempts FROM service_role");
    expect(migration).toContain("i.attempt_count < i.max_attempts");
  });
  it("requires an operator reason for replay and preserves provider event identity", () => {
    expect(migration).toContain("_reason text");
    expect(migration).toContain("staynas_distribution_webhook_replay_audit");
    expect(migration).toContain("prior_reconciliation_code");
    expect(migration).toContain("Only terminal exception events may be manually requeued.");
    expect(migration).not.toContain("DELETE FROM public.staynas_distribution_webhook_inbox");
    expect(migration).not.toContain("provider_event_id =");
  });
  it("keeps browser roles away from inbox attempts and worker RPCs", () => {
    expect(migration).toContain("FROM PUBLIC,anon,authenticated");
    expect(migration).toContain("TO service_role");
  });
});
