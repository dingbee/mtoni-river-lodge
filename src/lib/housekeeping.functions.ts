import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireStayNasModuleAccess } from "@/lib/staynas-authorization.server";

const roomState = z.enum([
  "vacant_clean",
  "vacant_dirty",
  "occupied",
  "reserved",
  "inspection",
  "maintenance",
  "out_of_service",
]);

export const transitionHousekeepingRoomState = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      roomStateId: z.string().uuid(),
      toState: roomState,
      note: z.string().max(500).optional(),
      idempotencyKey: z.string().min(8).max(200),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await requireStayNasModuleAccess(context.supabase, context.userId, "housekeeping");

    const { data: result, error } = await context.supabase.rpc(
      "housekeeping_transition_room_state",
      {
        _room_state_id: data.roomStateId,
        _to_state: data.toState,
        _note: data.note ?? null,
        _idempotency_key: data.idempotencyKey,
      },
    );

    if (error) throw new Error(error.message);
    return result;
  });
