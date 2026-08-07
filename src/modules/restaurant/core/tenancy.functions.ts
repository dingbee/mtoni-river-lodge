import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { workspaceSchema } from "./contracts";

export const getRestaurantWorkspaceFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => workspaceSchema.parse(d ?? {}))
  .handler(async ({ data, context }) => {
    const mod = await import("./tenancy.server");
    return mod.getWorkspace(context.supabase, context.userId, data);
  });