import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    // Local build mode deliberately bypasses the interactive login gate so the
    // product can be developed while Supabase auth is being repaired.
    // This is compiled only into Vite development builds and cannot activate
    // the production bundle.
    if (import.meta.env.DEV) {
      return { user: null };
    }

    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    return { user: data.user };
  },
  component: () => <Outlet />,
});