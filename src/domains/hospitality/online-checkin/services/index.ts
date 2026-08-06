/**
 * Online Check-In — service layer placeholder.
 *
 * Server functions (createServerFn) and Supabase access will land in a later
 * sprint. Nothing here performs I/O yet.
 */
import type { ArrivalRow, CheckInLink, CheckInSubmission } from "../types";

export const ONLINE_CHECKIN_SERVICE_READY = false;

export type CheckInService = {
  getCheckInLink(token: string): Promise<CheckInLink | null>;
  submitCheckIn(payload: CheckInSubmission): Promise<void>;
  listArrivals(date: string): Promise<ArrivalRow[]>;
};
