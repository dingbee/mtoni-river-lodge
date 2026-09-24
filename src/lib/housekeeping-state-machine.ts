export type HousekeepingRoomState =
  | "vacant_clean"
  | "vacant_dirty"
  | "occupied"
  | "reserved"
  | "inspection"
  | "maintenance"
  | "out_of_service";

export type HousekeepingRole = "owner" | "manager" | "housekeeping" | "admin";

export const HOUSEKEEPING_STAFF_TRANSITIONS: Readonly<Record<string, readonly HousekeepingRoomState[]>> = {
  vacant_dirty: ["inspection"],
  inspection: ["vacant_clean", "vacant_dirty"],
};

export const SUPERVISOR_TRANSITIONS: Readonly<Record<string, readonly HousekeepingRoomState[]>> = {
  vacant_dirty: ["inspection", "maintenance", "out_of_service"],
  inspection: ["vacant_clean", "vacant_dirty", "maintenance", "out_of_service"],
  vacant_clean: ["vacant_dirty", "maintenance", "out_of_service"],
  maintenance: ["vacant_dirty", "vacant_clean", "out_of_service"],
  out_of_service: ["maintenance", "vacant_dirty", "vacant_clean"],
};

export function canHousekeepingTransition(
  role: HousekeepingRole,
  from: HousekeepingRoomState,
  to: HousekeepingRoomState,
): boolean {
  const supervisor = role === "owner" || role === "manager" || role === "admin";
  const allowed = supervisor ? SUPERVISOR_TRANSITIONS : HOUSEKEEPING_STAFF_TRANSITIONS;
  return allowed[from]?.includes(to) ?? false;
}

export function isHousekeepingReadinessState(state: HousekeepingRoomState): boolean {
  return ["vacant_dirty", "inspection", "vacant_clean", "maintenance", "out_of_service"].includes(state);
}
