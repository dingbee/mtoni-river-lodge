import { describe, expect, it } from "vitest";
import {
  canHousekeepingTransition,
  isHousekeepingReadinessState,
} from "./housekeeping-state-machine";

describe("housekeeping room state machine", () => {
  it("allows attendants to submit a dirty room for inspection", () => {
    expect(canHousekeepingTransition("housekeeping", "vacant_dirty", "inspection")).toBe(true);
  });

  it("allows attendants to pass or fail inspection", () => {
    expect(canHousekeepingTransition("housekeeping", "inspection", "vacant_clean")).toBe(true);
    expect(canHousekeepingTransition("housekeeping", "inspection", "vacant_dirty")).toBe(true);
  });

  it("prevents attendants from changing operational states outside housekeeping workflow", () => {
    expect(canHousekeepingTransition("housekeeping", "vacant_dirty", "occupied")).toBe(false);
    expect(canHousekeepingTransition("housekeeping", "vacant_dirty", "maintenance")).toBe(false);
  });

  it("allows supervisors to handle maintenance exceptions", () => {
    expect(canHousekeepingTransition("manager", "inspection", "maintenance")).toBe(true);
    expect(canHousekeepingTransition("manager", "maintenance", "vacant_clean")).toBe(true);
  });

  it("recognizes readiness states without inventing a cleaning room state", () => {
    expect(isHousekeepingReadinessState("vacant_dirty")).toBe(true);
    expect(isHousekeepingReadinessState("inspection")).toBe(true);
    expect(isHousekeepingReadinessState("vacant_clean")).toBe(true);
    expect(isHousekeepingReadinessState("occupied")).toBe(false);
  });
});
