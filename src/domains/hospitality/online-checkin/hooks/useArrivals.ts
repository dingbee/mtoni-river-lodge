import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { listStaffArrivals, getStaffArrivalDetail } from "../services/arrivals.functions";
import type { ArrivalsFilter } from "../services/arrivals-shared";

/**
 * Realtime bridge for the arrivals surfaces. Reuses the existing Supabase
 * realtime channel pattern — one channel, torn down on unmount, invalidating
 * the arrivals queries instead of polling.
 */
export function useArrivalsRealtime() {
  const queryClient = useQueryClient();
  useEffect(() => {
    const invalidate = () => {
      void queryClient.invalidateQueries({ queryKey: ["staff-arrivals"] });
      void queryClient.invalidateQueries({ queryKey: ["staff-arrival-detail"] });
      void queryClient.invalidateQueries({ queryKey: ["staff-checkin-documents"] });
    };
    const channel = supabase
      .channel("staff-arrivals")
      .on("postgres_changes", { event: "*", schema: "public", table: "guest_checkins" }, invalidate)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "guest_documents" },
        invalidate,
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "bookings" }, invalidate)
      .on("postgres_changes", { event: "*", schema: "public", table: "room_states" }, invalidate)
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [queryClient]);
}

export function useStaffArrivals(filters: ArrivalsFilter) {
  const fn = useServerFn(listStaffArrivals);
  useArrivalsRealtime();
  return useQuery({
    queryKey: ["staff-arrivals", filters],
    queryFn: () => fn({ data: filters }),
    staleTime: 15_000,
  });
}

export function useStaffArrivalDetail(bookingId: string) {
  const fn = useServerFn(getStaffArrivalDetail);
  useArrivalsRealtime();
  return useQuery({
    queryKey: ["staff-arrival-detail", bookingId],
    queryFn: () => fn({ data: { bookingId } }),
    staleTime: 15_000,
  });
}
