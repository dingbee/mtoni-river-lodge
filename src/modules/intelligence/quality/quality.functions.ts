import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { qualityBoardSchema } from "./quality.types";

export const getIntelligenceQualityFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => qualityBoardSchema.parse(d))
  .handler(async ({ data, context }) => {
    const mod = await import("./quality.server");
    return mod.getQualityBoard(context.supabase, context.userId, data);
  });