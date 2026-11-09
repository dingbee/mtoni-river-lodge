import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolveVerifiedFounderActor } from "./subscription.functions";

type Row = Record<string, unknown>;
const rows = (value: unknown): Row[] => Array.isArray(value) ? value as Row[] : [];

export const getFounderReconciliationWorkspace = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await resolveVerifiedFounderActor(context as { supabase: unknown; userId: string });
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const admin = supabaseAdmin as any;
    const { data: config, error: configError } = await admin.from("commercial_founder_tenant_config")
      .select("founder_organisation_id").eq("singleton", true).maybeSingle();
    if (configError || !config?.founder_organisation_id) throw new Error("Founder tenant boundary configuration is unavailable.");
    const { data: organisations, error: orgError } = await admin.from("staynas_organisations")
      .select("id,name").neq("id", config.founder_organisation_id);
    if (orgError) throw new Error("Customer tenant registry could not be loaded.");
    const orgRows = rows(organisations);
    const orgIds = orgRows.map((item) => String(item.id));
    if (!orgIds.length) return { runs: [], items: [], events: [], providers: [], organisations: [] };
    const [runsResult, providersResult] = await Promise.all([
      admin.from("commercial_reconciliation_runs").select("*")
        .in("organisation_id", orgIds).order("created_at", { ascending: false }).limit(100),
      admin.from("commercial_provider_accounts").select("id,organisation_id,provider,provider_account_ref,supported_currencies,status")
        .in("organisation_id", orgIds).order("created_at", { ascending: false }),
    ]);
    if (runsResult.error || providersResult.error) throw new Error("Founder reconciliation records could not be loaded.");
    const runRows = rows(runsResult.data);
    const runIds = runRows.map((item) => String(item.id));
    const { data: itemData, error: itemError } = runIds.length
      ? await admin.from("commercial_reconciliation_items").select("*")
        .in("run_id", runIds).order("created_at", { ascending: false }).limit(2000)
      : { data: [], error: null };
    if (itemError) throw new Error("Reconciliation exceptions could not be loaded.");
    const itemRows = rows(itemData);
    const itemIds = itemRows.map((item) => String(item.id));
    const { data: eventData, error: eventError } = itemIds.length
      ? await admin.from("commercial_reconciliation_item_events").select("*")
        .in("item_id", itemIds).order("occurred_at", { ascending: false }).limit(5000)
      : { data: [], error: null };
    if (eventError) throw new Error("Reconciliation lifecycle evidence could not be loaded.");
    const orgById = new Map(orgRows.map((item) => [String(item.id), String(item.name ?? "Customer tenant")]));
    const providerById = new Map(rows(providersResult.data).map((item) => [String(item.id), item]));
    return {
      generatedAt: new Date().toISOString(),
      runs: runRows.map((run) => ({
        ...run,
        tenantName: orgById.get(String(run.organisation_id)) ?? "Unknown tenant",
        provider: providerById.get(String(run.provider_account_id)) ?? null,
      })),
      items: itemRows,
      events: rows(eventData),
      providers: rows(providersResult.data),
      organisations: orgRows,
    };
  });
