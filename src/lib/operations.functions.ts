import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { mapRoomBoardAllocations } from "./room-board-allocation-mapper";
import type {
  RoomBoardAllocation,
  RoomBoardBooking,
  RoomBoardOperationalReservation,
} from "./room-board-allocation-mapper";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireStayNasModuleAccess } from "@/lib/staynas-authorization.server";

async function assertStaff(supabase: any, userId: string) {
  const { data, error } = await supabase.rpc("is_any_staff", { _user_id: userId });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden");
}

async function logOpsEvent(
  supabase: any,
  userId: string,
  claims: any,
  event: {
    type: string;
    module?: string;
    entityType: string;
    entityId?: string | null;
    entityLabel?: string | null;
    meta?: Record<string, unknown>;
    severity?: "info" | "warn" | "error" | "audit";
  },
) {
  try {
    await supabase.from("activity_logs").insert({
      actor_id: userId,
      actor_email: claims?.email ?? null,
      action: event.type,
      entity_type: event.entityType,
      entity_id: event.entityId ?? null,
      entity_label: event.entityLabel ?? null,
      metadata: { ...(event.meta ?? {}), event_type: event.type },
      module: event.module ?? "operations",
      severity: event.severity ?? "info",
    });
  } catch (err) {
    console.warn("[ops] activity log failed", err)¶»§q«^