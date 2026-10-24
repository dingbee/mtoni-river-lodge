import { useCurrentUserRoles } from "@/lib/permissions";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useState } from "react";
import { FEATURE_FLAGS, isFlagVisible } from "./flags";
import type { FeatureFlagKey } from "./types";

/** React hook: is a flag currently visible to the signed-in user? */
export function useFeatureFlag(key: FeatureFlagKey): boolean {
  const { data: roles } = useCurrentUserRoles();
  const [founderAccount, setFounderAccount] = useState(false);

  useEffect(() => {
    let active = true;
    supabase.auth.getUser().then(({ data, error }) => {
      if (!active) return;
      setFounderAccount(!error && data.user?.email?.trim().toLowerCase() === "nolmarkcdma@gmail.com");
    });
    return () => { active = false; };
  }, []);

  if (key === "mtoni_ai_command_centre" && !founderAccount) return false;
  return isFlagVisible(FEATURE_FLAGS[key], { roles: roles ?? [] });
}
