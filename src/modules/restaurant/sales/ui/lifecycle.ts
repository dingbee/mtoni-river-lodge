/* eslint-disable @typescript-eslint/no-explicit-any -- server rows are untyped at this boundary. */
/**
 * Service lifecycle — a *derived* view over the existing transactional model.
 *
 * Nothing here writes, and nothing here invents a second state machine. The
 * canonical truth stays `restaurant_orders.status`, `payment_state`, the item
 * statuses and the kitchen tickets; this module only reads those facts and
 * answers two operational questions a floor needs at a glance:
 *
 *   1. Where is this table in the service story?
 *   2. What is the single next thing to do?
 */

export const SERVICE_STAGES = [
  "table",
  "order",
  "production",
  "service",
  "bill",
  "payment",
  "receipt",
  "closed",
] as const;
export type ServiceStage = (typeof SERVICE_STAGES)[number];

export const STAGE_LABEL: Record<ServiceStage, string> = {
  table: "Table",
  order: "Order",
  production: "Production",
  service: "Service",
  bill: "Bill",
  payment: "Payment",
  receipt: "Receipt",
  closed: "Closed",
};

export type LifecycleInput = {
  order: any;
  items?: any[];
  tickets?: any[];
  payments?: any[];
  /** Lines staged at the till but not yet accepted by the server. */
  stagedCount?: number;
};

export type NextAction =
  | "add-items"
  | "send-to-kitchen"
  | "await-kitchen"
  | "mark-served"
  | "take-payment"
  | "settle-balance"
  | "print-receipt"
  | "none";

export const NEXT_ACTION_LABEL: Record<NextAction, string> = {
  "add-items": "Add items",
  "send-to-kitchen": "Send to kitchen",
  "await-kitchen": "Waiting on kitchen",
  "mark-served": "Mark served",
  "take-payment": "Take payment",
  "settle-balance": "Settle balance",
  "print-receipt": "Print receipt",
  none: "Nothing pending",
};

export type LifecycleState = {
  stage: ServiceStage;
  stageIndex: number;
  nextAction: NextAction;
  nextActionLabel: string;
  /** Human sentence for the floor: why this is the next action. */
  reason: string;
  staged: number;
  unsent: number;
  inProduction: number;
  ready: number;
  served: number;
  balance: number;
  settled: boolean;
  delayed: boolean;
  blocked: boolean;
};

const SETTLED_PAYMENT_STATES = ["paid", "comped", "room_charged"];
const VOID_STATES = ["voided", "cancelled"];

export function deriveLifecycle({
  order,
  items = [],
  tickets = [],
  payments = [],
  stagedCount = 0,
}: LifecycleInput): LifecycleState {
  const live = items.filter((i) => !VOID_STATES.includes(String(i?.status)));
  const unsent = live.filter((i) => String(i.status) === "ordered").length;
  const openTickets = tickets.filter((t) => ["queued", "preparing"].includes(String(t?.status)));
  const readyTickets = tickets.filter((t) => String(t?.status) === "ready");
  const served = live.filter((i) => String(i.status) === "served").length;
  const delayed = tickets.some((t) => Boolean(t?.is_delayed) || Boolean(t?.breaching));

  const total = Number(order?.total ?? 0);
  const paid = Number(order?.paid_total ?? payments.reduce((s, p) => s + Number(p?.amount ?? 0), 0));
  const balance = Number((total - paid).toFixed(2));
  const settled = SETTLED_PAYMENT_STATES.includes(String(order?.payment_state));
  const status = String(order?.status ?? "open");

  let stage: ServiceStage;
  let nextAction: NextAction;
  let reason: string;

  if (status === "closed") {
    stage = "closed";
    nextAction = "print-receipt";
    reason = "Bill settled and closed. A receipt can be reprinted for the guest.";
  } else if (VOID_STATES.includes(status)) {
    stage = "closed";
    nextAction = "none";
    reason = "This bill was cancelled; no further service action applies.";
  } else if (settled) {
    stage = "receipt";
    nextAction = "print-receipt";
    reason = "Payment is complete. Issue the receipt to close the table.";
  } else if (paid > 0 && balance > 0) {
    stage = "payment";
    nextAction = "settle-balance";
    reason = "Part-paid. A balance is still outstanding on this bill.";
  } else if (live.length === 0 && stagedCount === 0) {
    stage = "table";
    nextAction = "add-items";
    reason = "Table is open with an empty bill. Take the order.";
  } else if (stagedCount > 0) {
    stage = "order";
    nextAction = "send-to-kitchen";
    reason = `${stagedCount} line(s) staged at the till and not yet sent to production.`;
  } else if (unsent > 0) {
    stage = "order";
    nextAction = "send-to-kitchen";
    reason = `${unsent} line(s) on the bill have not been fired to a station.`;
  } else if (openTickets.length > 0) {
    stage = "production";
    nextAction = "await-kitchen";
    reason = delayed
      ? "A station has breached its prep target on this order."
      : `${openTickets.length} ticket(s) in preparation.`;
  } else if (readyTickets.length > 0) {
    stage = "service";
    nextAction = "mark-served";
    reason = `${readyTickets.length} ticket(s) ready for the pass.`;
  } else if (served > 0 || status === "served") {
    stage = "bill";
    nextAction = "take-payment";
    reason = "Everything has been served. Present the bill and take payment.";
  } else {
    stage = "bill";
    nextAction = "take-payment";
    reason = "All lines are through production. Present the bill.";
  }

  return {
    stage,
    stageIndex: SERVICE_STAGES.indexOf(stage),
    nextAction,
    nextActionLabel: NEXT_ACTION_LABEL[nextAction],
    reason,
    staged: stagedCount,
    unsent,
    inProduction: openTickets.length,
    ready: readyTickets.length,
    served,
    balance,
    settled,
    delayed,
    blocked: nextAction === "await-kitchen",
  };
}

/** Floor colour semantics derived from the bill on the table, not the table row alone. */
export type TableTone = "free" | "seated" | "production" | "ready" | "billing" | "attention" | "resting";

export const TABLE_TONE_CLASS: Record<TableTone, string> = {
  free: "border-border bg-card",
  seated: "border-primary/40 bg-primary/10",
  production: "border-sky-500/40 bg-sky-500/10",
  ready: "border-emerald-500/50 bg-emerald-500/10",
  billing: "border-amber-500/50 bg-amber-500/10",
  attention: "border-destructive/50 bg-destructive/10",
  resting: "border-muted bg-muted",
};

export const TABLE_TONE_LABEL: Record<TableTone, string> = {
  free: "Available",
  seated: "Ordering",
  production: "In production",
  ready: "Ready to serve",
  billing: "Billing",
  attention: "Needs attention",
  resting: "Turning over",
};

export function tableTone(table: any, life: LifecycleState | null): TableTone {
  if (!life) {
    if (String(table?.status) === "cleaning") return "resting";
    if (String(table?.status) === "out_of_service") return "attention";
    if (String(table?.status) === "reserved") return "billing";
    return "free";
  }
  if (life.delayed) return "attention";
  switch (life.stage) {
    case "table":
    case "order":
      return "seated";
    case "production":
      return "production";
    case "service":
      return "ready";
    case "bill":
    case "payment":
    case "receipt":
      return "billing";
    default:
      return "resting";
  }
}

export type TimelineEntry = { at: string; label: string; detail?: string };

/** Chronological service story assembled from timestamps already recorded. */
export function orderTimeline({ order, items = [], tickets = [], payments = [] }: LifecycleInput): TimelineEntry[] {
  const out: TimelineEntry[] = [];
  const push = (at: unknown, label: string, detail?: string) => {
    if (at) out.push({ at: String(at), label, detail });
  };

  push(order?.opened_at, "Table opened", order?.table_id ? "Bill attached to a table" : "Walk-in / bar tab");
  const firstFired = items
    .map((i) => i?.created_at)
    .filter(Boolean)
    .sort()[0];
  push(firstFired, "First items ordered");

  for (const t of tickets) {
    push(t?.queued_at, `Ticket ${t?.ticket_number ?? ""} fired`.trim());
    push(t?.started_at, `Ticket ${t?.ticket_number ?? ""} started`.trim());
    push(
      t?.ready_at,
      `Ticket ${t?.ticket_number ?? ""} ready`.trim(),
      t?.is_delayed ? `Delayed by ${Math.round(Number(t.delay_seconds ?? 0) / 60)} min` : undefined,
    );
    push(t?.served_at, `Ticket ${t?.ticket_number ?? ""} served`.trim());
  }

  for (const p of payments) {
    push(p?.captured_at, `Payment ${p?.method ?? ""}`.trim(), `${p?.state ?? ""} ${p?.amount ?? ""}`.trim());
  }
  push(order?.closed_at, "Bill closed");
  push(order?.reopened_at, "Bill reopened", "Supervisor correction");

  return out.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
}