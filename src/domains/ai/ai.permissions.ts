import type { AiDomain, AiToolId } from "./ai.types";

/**
 * Role → allowed AI domains.
 * Enforced server-side inside askAi(). Unauthorized tool selections are
 * rejected before any data is read.
 */
const ROLE_DOMAINS: Record<string, AiDomain[]> = {
  owner:        ["guests", "reservations", "finance", "operations", "marketing", "knowledge"],
  admin:        ["guests", "reservations", "finance", "operations", "marketing", "knowledge"],
  manager:      ["guests", "reservations", "finance", "operations", "marketing", "knowledge"],
  reception:    ["guests", "reservations", "knowledge"],
  reservations: ["guests", "reservations", "knowledge"],
  finance:      ["finance", "knowledge"],
  marketing:    ["marketing", "knowledge"],
  housekeeping: ["operations", "knowledge"],
  editor:       ["marketing", "knowledge"],
};

export function allowedDomainsForRoles(roles: readonly string[]): AiDomain[] {
  const set = new Set<AiDomain>();
  for (const r of roles) for (const d of ROLE_DOMAINS[r] ?? []) set.add(d);
  return Array.from(set);
}

const TOOL_DOMAIN: Record<AiToolId, AiDomain> = {
  "guest.search": "guests",
  "guest.summary": "guests",
  "reservations.arrivals_today": "reservations",
  "reservations.departures_today": "reservations",
  "reservations.upcoming": "reservations",
  "reservations.occupancy": "reservations",
  "finance.revenue_summary": "finance",
  "finance.outstanding": "finance",
  "finance.recent_transactions": "finance",
  "operations.room_status": "operations",
  "operations.open_tasks": "operations",
  "operations.alerts": "operations",
  "marketing.latest_articles": "marketing",
  "marketing.seo_status": "marketing",
  "knowledge.search": "knowledge",
};

export function toolDomain(tool: AiToolId): AiDomain {
  return TOOL_DOMAIN[tool];
}

export function canUseTool(tool: AiToolId, roles: readonly string[]): boolean {
  return allowedDomainsForRoles(roles).includes(TOOL_DOMAIN[tool]);
}