import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { forecastBoardSchema, runForecastSchema } from "./forecast.types";

export const getForecastBoardFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => forecastBoardSchema.parse(d))
  .handler(async ({ data, context }) => {
    const mod = await import("./forecast.server");
    return mod.getForecastBoard(context.supabase, context.userId, data);
  });

export const runForecastPassFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => runForecastSchema.parse(d))
  .handler(async ({ data, context }) => {
    const mod = await import("./forecast.server");
    return mod.runForecastPass(context.supabase, context.userId, data);
  });