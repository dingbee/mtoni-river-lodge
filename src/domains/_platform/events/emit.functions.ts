import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const emitSchema = z.object({
  type: z.string().min(1).max(80),
  module: z.string().min(1).max(80),
  entityType: z.string().min(1).max(80),
  entityId: z.string().uuid().optional().nullable(),
  entityLabel: z.string().max(200).optional().nullable(),
  meta: z.record(z.string(), z.unknown()).optional(),
  severity: z.enum(["info","warn","error","audit"]).optional().default("info"),
  correlationId: z.string().uuid().optional().nullable(),
  action: z.string().max(80).optional(),
});

export const emitPlatformEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => emitSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId, claims } = context;
    const { error } = await supabase.from("activity_logs").insert({
      actor_id: userId,
      actor_email: (claims as { email?: string } | null)?.email ?? null,
      action: data.action ?? data.type,
      entity_type: data.entityType,
      entity_id: data.entityId ?? null,
      entity_label: data.entityLabel ?? null,
      metadata: { ...(data.meta ?? {}), event_type: data.type },
      module: data.module,
      severity: data.severity,
      correlation_id: data.correlationId ?? null,
    });
    if (error) {
      console.error("[emitPlatformEvent] insert failed", { type: data.type, module: data.module, error: error.message });
      throw new Error("Failed to record event");
    }
    return { ok: true };
  });
