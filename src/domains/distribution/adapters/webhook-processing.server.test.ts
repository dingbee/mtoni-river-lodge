import { describe, expect, it, vi } from "vitest";
import {
  buildClaimDistributionWebhookArgs,
  buildFinishDistributionWebhookArgs,
  claimDistributionWebhookWithRpc,
  createDistributionWebhookReplayService,
  type DistributionWebhookReplayRepository,
  type DistributionWebhookRpc,
} from "./webhook-processing.server";

describe("DC-05.05 server webhook processing boundary", () => {
  it("validates bounded worker leases", () => {
    expect(buildClaimDistributionWebhookArgs(" worker-1 ", 30)).toEqual({
      _worker_id: "worker-1", _lease_seconds: 30,
    });
    expect(() => buildClaimDistributionWebhookArgs(" ", 30)).toThrow(/identity/);
    expect(() => buildClaimDistributionWebhookArgs("worker-1", 301)).toThrow(/lease/);
  });

  it("claims only a lease owned by the requested worker", async () => {
    const rpc: DistributionWebhookRpc = vi.fn(async () => ({
      data: [{
        id: "inbox-1", lease_token: "lease-1", lease_owner: "worker-1",
        processing_status: "processing", lease_expires_at: "2026-11-05T10:00:00Z",
        attempt_count: 1, normalized_event: {},
      }],
      error: null,
    }));
    const claimed = await claimDistributionWebhookWithRpc(rpc, "worker-1", 30);
    expect(claimed?.id).toBe("inbox-1");
    expect(Object.isFrozen(claimed)).toBe(true);

    const forgedRpc: DistributionWebhookRpc = vi.fn(async () => ({
      data: [{
        id: "inbox-1", lease_token: "lease-1", lease_owner: "other-worker",
        processing_status: "processing", lease_expires_at: "2026-11-05T10:00:00Z",
        attempt_count: 1, normalized_event: {},
      }],
      error: null,
    }));
    await expect(claimDistributionWebhookWithRpc(forgedRpc, "worker-1"))
      .rejects.toThrow(/invalid lease/);
  });

  it("enforces completion status, retry and reconciliation contracts", () => {
    expect(buildFinishDistributionWebhookArgs({
      inboxId: "inbox-1", leaseToken: "lease-1", workerId: "worker-1",
      status: "processed",
    })._safe_summary).toBeNull();
    expect(() => buildFinishDistributionWebhookArgs({
      inboxId: "inbox-1", leaseToken: "lease-1", workerId: "worker-1",
      status: "retryable_failure", safeSummary: "Temporary provider outage.",
    })).toThrow(/retry delay/);
    expect(() => buildFinishDistributionWebhookArgs({
      inboxId: "inbox-1", leaseToken: "lease-1", workerId: "worker-1",
      status: "manual_reconciliation", safeSummary: "Mapping needs review.",
    })).toThrow(/reconciliation code/);
    expect(() => buildFinishDistributionWebhookArgs({
      inboxId: "inbox-1", leaseToken: "lease-1", workerId: "worker-1",
      status: "manual_reconciliation", safeSummary: "Contact guest@example.test",
      reconciliationCode: "mapping_missing",
    })).toThrow(/sensitive data/);
  });

  it("authorizes replay against the authenticated property owner/manager/admin", async () => {
    const repository: DistributionWebhookReplayRepository = {
      getAuthenticatedUser: vi.fn(async () => ({ id: "operator-1" })),
      getInboxScope: vi.fn(async () => ({ propertyId: "property-1", status: "manual_reconciliation" })),
      hasReplayPermission: vi.fn(async () => true),
    };
    const rpc: DistributionWebhookRpc = vi.fn(async () => ({ data: null, error: null }));
    const replay = createDistributionWebhookReplayService(repository, rpc);
    await replay({
      accessToken: "session-token",
      inboxId: "inbox-1",
      reason: "Replay after correcting the room mapping.",
      additionalAttempts: 3,
    });
    expect(rpc).toHaveBeenCalledWith("staynas_requeue_distribution_webhook", {
      _inbox_id: "inbox-1",
      _operator_id: "operator-1",
      _reason: "Replay after correcting the room mapping.",
      _additional_attempts: 3,
    });
  });

  it("rejects unauthenticated, unauthorized, non-terminal and PII-bearing replay requests", async () => {
    const repository: DistributionWebhookReplayRepository = {
      getAuthenticatedUser: vi.fn(async () => ({ id: "operator-1" })),
      getInboxScope: vi.fn(async () => ({ propertyId: "property-1", status: "processing" })),
      hasReplayPermission: vi.fn(async () => false),
    };
    const rpc: DistributionWebhookRpc = vi.fn(async () => ({ data: null, error: null }));
    const replay = createDistributionWebhookReplayService(repository, rpc);
    await expect(replay({
      accessToken: "token", inboxId: "inbox-1", reason: "Replay this event.",
    })).rejects.toThrow(/terminal/);
    expect(rpc).not.toHaveBeenCalled();

    repository.getInboxScope = vi.fn(async () => ({
      propertyId: "property-1", status: "manual_reconciliation",
    }));
    await expect(replay({
      accessToken: "token", inboxId: "inbox-1", reason: "Replay after fix.",
    })).rejects.toThrow(/not authorized/);
    await expect(replay({
      accessToken: "token", inboxId: "inbox-1", reason: "Email guest@example.test",
    })).rejects.toThrow(/sensitive data/);
    expect(rpc).not.toHaveBeenCalled();
  });
});
