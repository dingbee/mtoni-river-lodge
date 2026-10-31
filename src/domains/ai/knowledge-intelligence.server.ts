/**
 * Server-only scheduled knowledge sync entrypoint.
 *
 * The former implementation read global journal/CMS tables and wrote through
 * the service-role client. That model is incompatible with property-owned
 * knowledge. It remains deliberately disabled until source adapters carry an
 * explicit property scope and the database isolation contract is verified.
 */
export async function runKnowledgeSyncJob(opts: { triggeredBy?: string } = {}) {
  return {
    ok: false,
    deferred: true,
    reason: "property_scoped_sync_adapter_required",
    triggeredBy: opts.triggeredBy ?? "manual",
  } as const;
}
