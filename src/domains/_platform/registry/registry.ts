import type { ModuleDefinition, ResolvedModule } from "./types";
import { FEATURE_FLAGS, isFlagVisible } from "../flags/flags";
import type { FlagAudience } from "../flags/types";

/** Ergonomic helper — type-checks + returns the module unchanged. */
export function defineModule<T extends ModuleDefinition>(def: T): T {
  return def;
}

// Static registry array. Adding a module: create the file under
// `./modules/<name>.module.ts` and append to this array. This stays
// tree-shakeable and gives strong types.
import { reservationsModule, reservationsCalendarModule, reservationsRoomsModule } from "./modules/reservations.module";
import { guestsCrmModule, guestsReviewsModule, guestsMessagesModule } from "./modules/guests.module";
import { contentHomepageModule, contentRoomsModule, contentExperiencesModule, contentJournalModule, contentGalleryModule, contentMediaModule } from "./modules/content.module";
import { marketingSeoModule, marketingCampaignsModule, marketingAnalyticsModule } from "./modules/marketing.module";
import { financePaymentsModule, financeInvoicesModule, financeReportsModule } from "./modules/finance.module";
import { staffUsersModule, staffRolesModule, staffActivityModule } from "./modules/staff.module";
import { housekeepingModule } from "./modules/housekeeping.module";
import { automationModule, aiAssistantModule } from "./modules/automation.module";
import { settingsModule, dashboardModule } from "./modules/system.module";
import { loyaltyModule, conciergeModule, maintenanceModule, procurementModule, multiPropertyModule } from "./modules/future.module";
import {
  opsDashboardModule,
  opsRoomBoardModule,
  opsCalendarModule,
  opsHousekeepingModule,
  opsTasksModule,
  opsAlertsModule,
  opsTimelineModule,
} from "./modules/operations.module";
import {
  contentPagesModule,
  contentBrandModule,
  contentCalendarModule,
  marketingReviewsModule,
} from "./modules/cmis.module";

export const MODULE_REGISTRY: ModuleDefinition[] = [
  dashboardModule,
  reservationsModule, reservationsCalendarModule, reservationsRoomsModule,
  opsDashboardModule, opsRoomBoardModule, opsCalendarModule, opsHousekeepingModule,
  opsTasksModule, opsAlertsModule, opsTimelineModule,
  housekeepingModule,
  guestsCrmModule, guestsReviewsModule, guestsMessagesModule,
  contentPagesModule,
  contentHomepageModule, contentRoomsModule, contentExperiencesModule,
  contentJournalModule, contentGalleryModule, contentMediaModule,
  contentBrandModule, contentCalendarModule,
  marketingSeoModule, marketingCampaignsModule, marketingAnalyticsModule,
  marketingReviewsModule,
  financePaymentsModule, financeInvoicesModule, financeReportsModule,
  staffUsersModule, staffRolesModule, staffActivityModule,
  automationModule, aiAssistantModule,
  settingsModule,
  loyaltyModule, conciergeModule, maintenanceModule, procurementModule, multiPropertyModule,
];

/** Pure resolver — used by hooks + tests. */
export function resolveModules(
  registry: readonly ModuleDefinition[],
  audience: FlagAudience,
  canAccess: (moduleId: string, roles: readonly string[]) => boolean,
): ResolvedModule[] {
  return registry.map((m) => {
    const flagOk = m.featureFlag ? isFlagVisible(FEATURE_FLAGS[m.featureFlag], audience) : true;
    const statusOk = m.status !== "disabled" && m.status !== "hidden";
    const roleOk = canAccess(m.id, audience.roles);
    return { ...m, visible: flagOk && statusOk && roleOk };
  });
}

export function findModuleByRoute(route: string): ModuleDefinition | undefined {
  // Prefer longest prefix match so nested routes resolve to their leaf.
  let best: ModuleDefinition | undefined;
  for (const m of MODULE_REGISTRY) {
    if (route === m.route || route.startsWith(m.route + "/")) {
      if (!best || m.route.length > best.route.length) best = m;
    }
  }
  return best;
}

export function findModuleById(id: string): ModuleDefinition | undefined {
  return MODULE_REGISTRY.find((m) => m.id === id);
}
