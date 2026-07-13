import type { ComponentType, ReactNode } from "react";
import type { Role } from "@/lib/permissions";
import type { FeatureFlagKey } from "../flags/types";

export type ModuleStatus = "active" | "beta" | "hidden" | "disabled";

export interface SearchProvider {
  /** Stable id used for keyed results. */
  id: string;
  label: string;
  /** Return matching hits for a query. Kept generic; consumers decide UI. */
  search(query: string): Promise<Array<{ id: string; label: string; href: string; hint?: string }>>;
}

export interface NotificationProvider {
  id: string;
  label: string;
  /** Return current unread count (server-driven; adapters cache as needed). */
  unread(): Promise<number>;
}

export interface DashboardWidget {
  id: string;
  title: string;
  render: () => ReactNode;
  /** Widget order within dashboard. Lower = earlier. */
  order?: number;
}

export interface ModuleDefinition {
  /** e.g. "guests.crm". Namespaced by domain for readability. */
  id: string;
  /** Human label used in navigation and breadcrumbs. */
  name: string;
  description: string;
  icon: ComponentType<{ className?: string }>;
  /** Primary route (used for nav + breadcrumbs). */
  route: string;
  /** Redirect target when the user visits a group root. Defaults to `route`. */
  landingRoute?: string;
  /** Parent module id (for group nesting). */
  parentId?: string;
  /** Sort order within its parent. */
  order?: number;
  /** Roles allowed to access. Empty = any authenticated staff. */
  requiredRoles?: Role[];
  /** Optional flag gating visibility. Undefined = always visible. */
  featureFlag?: FeatureFlagKey;
  /** Providers (all optional). */
  search?: SearchProvider;
  notifications?: NotificationProvider;
  widgets?: DashboardWidget[];
  status: ModuleStatus;
}

export interface ResolvedModule extends ModuleDefinition {
  /** Fully computed visibility for the current audience. */
  visible: boolean;
}
