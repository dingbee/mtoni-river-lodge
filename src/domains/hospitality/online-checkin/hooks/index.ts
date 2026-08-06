import { useMemo } from "react";
import { ONLINE_CHECKIN_SERVICE_READY } from "../services";

/**
 * Foundation hook. Returns the module's readiness so pages can render the
 * placeholder state consistently. Data hooks arrive with the service layer.
 */
export function useOnlineCheckInStatus() {
  return useMemo(() => ({ ready: ONLINE_CHECKIN_SERVICE_READY }), []);
}