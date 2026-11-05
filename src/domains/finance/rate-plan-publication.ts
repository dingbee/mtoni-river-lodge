export type ResolvedRatePlanData = Record<string, unknown>;

function addRoomTypeIds(target: Set<string>, value: unknown): void {
  if (!Array.isArray(value)) return;
  for (const id of value) {
    if (typeof id === "string" && id.trim()) target.add(id);
  }
}

export function collectRatePlanRoomTypeReferences(data: ResolvedRatePlanData): string[] {
  const ids = new Set<string>();

  const seasonal = data.seasonal_rates;
  if (seasonal && typeof seasonal === "object" && !Array.isArray(seasonal)) {
    for (const rule of Object.values(seasonal as Record<string, unknown>)) {
      if (!rule || typeof rule !== "object") continue;
      addRoomTypeIds(ids, (rule as Record<string, unknown>).room_type_ids);
    }
  }

  const daily = data.daily_rates;
  if (daily && typeof daily === "object" && !Array.isArray(daily)) {
    for (const dateRates of Object.values(daily as Record<string, unknown>)) {
      if (!dateRates || typeof dateRates !== "object" || Array.isArray(dateRates)) continue;
      for (const [roomTypeId, value] of Object.entries(dateRates as Record<string, unknown>)) {
        if (value !== null) ids.add(roomTypeId);
      }
    }
  }

  const restrictions = data.restrictions;
  if (restrictions && typeof restrictions === "object" && !Array.isArray(restrictions)) {
    for (const rule of Object.values(restrictions as Record<string, unknown>)) {
      if (!rule || typeof rule !== "object") continue;
      addRoomTypeIds(ids, (rule as Record<string, unknown>).room_type_ids);
    }
  }

  return [...ids].sort();
}

export function assertRatePlanRoomTypeAssignments(
  data: ResolvedRatePlanData,
  assignedRoomTypeIds: Set<string>,
): void {
  const unassigned = collectRatePlanRoomTypeReferences(data).filter((id) => !assignedRoomTypeIds.has(id));
  if (unassigned.length) {
    throw new Error(
      "Cannot publish this rate plan. Assign every room type referenced by seasonal rates, daily overrides or restrictions. Unassigned room-type IDs: " +
      unassigned.join(", "),
    );
  }
}
