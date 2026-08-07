/**
 * Sprint 6 — Execution adapters.
 *
 * The Intelligence Core never mutates operational data by itself. It hands an
 * approved, validated command to a capability-based adapter which performs a
 * bounded, explicit write inside the module it owns. Anything not declared
 * here cannot be executed.
 */
/* eslint-disable @typescript-eslint/no-explicit-any -- Supabase rows are untyped at this boundary. */
import {
  CAPABILITY_PAYLOAD_SCHEMA,
  CAPABILITY_RISK,
  type ActionRisk,
  type ExecutionCapability,
  type JsonObject,
} from "./orchestration.types";

type Sb = any;

export interface AdapterDefinition {
  key: string;
  label: string;
  module: string;
  available: boolean;
  capabilities: readonly ExecutionCapability[];
  note?: string;
}

export const EXECUTION_ADAPTERS: readonly AdapterDefinition[] = [
  {
    key: "booking",
    label: "Booking adapter",
    module: "booking",
    available: true,
    capabilities: ["task.create", "notification.create"],
  },
  {
    key: "pms",
    label: "PMS adapter",
    module: "pms",
    available: true,
    capabilities: ["task.create", "notification.create"],
  },
  {
    key: "operations",
    label: "Operations adapter",
    module: "operations",
    available: true,
    capabilities: ["task.create", "notification.create"],
  },
  {
    key: "guest",
    label: "Guest adapter",
    module: "guest",
    available: true,
    capabilities: ["task.create", "notification.create"],
  },
  {
    key: "revenue",
    label: "Revenue adapter",
    module: "revenue",
    available: true,
    capabilities: ["pricing.review", "task.create", "notification.create"],
    note: "Rates are never changed by the Intelligence Core; a review is raised for the revenue manager.",
  },
  {
    key: "marketing",
    label: "Marketing adapter",
    module: "marketing",
    available: true,
    capabilities: ["campaign.draft", "task.create", "notification.create"],
    note: "Campaigns are created as drafts only; publishing stays with the marketing module.",
  },
  {
    key: "platform",
    label: "Platform adapter",
    module: "platform",
    available: true,
    capabilities: ["task.create", "notification.create"],
  },
  {
    key: "restaurant",
    label: "Restaurant adapter (future)",
    module: "restaurant",
    available: false,
    capabilities: [],
    note: "Registered for Restaurant OS; not implemented.",
  },
];

export function getAdapter(key: string): AdapterDefinition | null {
  return EXECUTION_ADAPTERS.find((a) => a.key === key) ?? null;
}

export function adapterForModule(module: string): AdapterDefinition | null {
  return EXECUTION_ADAPTERS.find((a) => a.module === module) ?? null;
}

export interface CapabilityCheck {
  ok: boolean;
  reason?: string;
  risk?: ActionRisk;
}

/** Capability validation — adapter exists, is available and owns the capability. */
export function validateCapability(adapterKey: string, capability: string): CapabilityCheck {
  const adapter = getAdapter(adapterKey);
  if (!adapter) return { ok: false, reason: `Unknown execution adapter "${adapterKey}".` };
  if (!adapter.available) return { ok: false, reason: `${adapter.label} is not available yet.` };
  if (!adapter.capabilities.includes(capability as ExecutionCapability)) {
    return { ok: false, reason: `${adapter.label} cannot perform "${capability}".` };
  }
  return { ok: true, risk: CAPABILITY_RISK[capability as ExecutionCapability] };
}

/** Payload validation — no arbitrary payloads ever reach a module. */
export function validatePayload(capability: ExecutionCapability, payload: unknown) {
  const schema = CAPABILITY_PAYLOAD_SCHEMA[capability];
  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    return { ok: false as const, reason: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") };
  }
  return { ok: true as const, data: parsed.data as JsonObject };
}

export interface AdapterResult {
  ok: boolean;
  executionReference: string | null;
  response: JsonObject;
  error?: string;
  /** True when the module recorded the request but a human must finish it. */
  manualFollowUp?: boolean;
}

const hoursFromNow = (h: number) => new Date(Date.now() + h * 3600_000).toISOString();

/**
 * Dispatch an approved command to the owning module. Every branch writes only
 * to the table that module owns, with a fixed shape.
 */
export async function dispatchToAdapter(
  supabase: Sb,
  input: {
    adapter: string;
    capability: ExecutionCapability;
    payload: JsonObject;
    actionId: string;
    decisionId: string | null;
  },
): Promise<AdapterResult> {
  const check = validateCapability(input.adapter, input.capability);
  if (!check.ok) return { ok: false, executionReference: null, response: {}, error: check.reason };

  const trace = { intelligence_action_id: input.actionId, decision_id: input.decisionId, adapter: input.adapter };

  switch (input.capability) {
    case "task.create": {
      const { data, error } = await supabase
        .from("ops_tasks")
        .insert({
          task_type: "intelligence",
          category: input.payload.category ?? input.adapter,
          title: input.payload.title,
          description: [input.payload.description, `Raised by Mtoni Intelligence (${input.adapter}).`]
            .filter(Boolean)
            .join("\n\n"),
          priority: input.payload.priority ?? 2,
          due_at: hoursFromNow(Number(input.payload.dueInHours ?? 48)),
        })
        .select("id")
        .single();
      if (error) return { ok: false, executionReference: null, response: {}, error: error.message };
      return { ok: true, executionReference: `ops_task:${data.id}`, response: { ...trace, ops_task_id: data.id } };
    }

    case "notification.create": {
      const { data, error } = await supabase
        .from("notifications")
        .insert({
          role: input.payload.role,
          channel: "in_app",
          kind: "intelligence",
          title: input.payload.title,
          body: input.payload.body ?? null,
          href: input.payload.href ?? "/admin/intelligence/actions",
          meta: trace,
        })
        .select("id")
        .single();
      if (error) return { ok: false, executionReference: null, response: {}, error: error.message };
      return { ok: true, executionReference: `notification:${data.id}`, response: { ...trace, notification_id: data.id } };
    }

    case "campaign.draft": {
      const start = new Date(Date.now() + Number(input.payload.startInDays ?? 0) * 86400_000);
      const end = new Date(start.getTime() + Number(input.payload.durationDays ?? 14) * 86400_000);
      const { data, error } = await supabase
        .from("campaigns")
        .insert({
          name: input.payload.name,
          objective: input.payload.objective ?? null,
          audience: input.payload.audience ?? null,
          notes: [input.payload.notes, "Draft prepared by Mtoni Intelligence — review before launch."]
            .filter(Boolean)
            .join("\n\n"),
          status: "draft",
          start_date: start.toISOString().slice(0, 10),
          end_date: end.toISOString().slice(0, 10),
        })
        .select("id")
        .single();
      if (error) return { ok: false, executionReference: null, response: {}, error: error.message };
      return {
        ok: true,
        executionReference: `campaign:${data.id}`,
        response: { ...trace, campaign_id: data.id, status: "draft" },
        manualFollowUp: true,
      };
    }

    case "pricing.review": {
      // The core does not change rates. It raises a reviewable task for revenue.
      const { data, error } = await supabase
        .from("ops_tasks")
        .insert({
          task_type: "pricing_review",
          category: "revenue",
          title: input.payload.title,
          description: [
            input.payload.rationale,
            `Suggested direction: ${input.payload.suggestedDirection}${
              input.payload.suggestedPct !== undefined ? ` (${input.payload.suggestedPct}%)` : ""
            }`,
            input.payload.window ? `Window: ${input.payload.window}` : null,
            "No rate has been changed. The revenue manager decides and applies any change in the Revenue module.",
          ]
            .filter(Boolean)
            .join("\n\n"),
          priority: 1,
          due_at: hoursFromNow(24),
        })
        .select("id")
        .single();
      if (error) return { ok: false, executionReference: null, response: {}, error: error.message };
      return {
        ok: true,
        executionReference: `pricing_review:${data.id}`,
        response: { ...trace, ops_task_id: data.id, rate_changed: false },
        manualFollowUp: true,
      };
    }

    case "policy.change":
      return {
        ok: false,
        executionReference: null,
        response: {},
        error: "Policy changes are performed manually by management; the core cannot execute them.",
      };

    default:
      return { ok: false, executionReference: null, response: {}, error: "Unsupported capability." };
  }
}