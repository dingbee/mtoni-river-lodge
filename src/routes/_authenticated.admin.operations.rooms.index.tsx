import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getRoomBoard } from "@/lib/operations.functions";
import { PageHeader } from "@/components/os/PageHeader";
import { RoomStatusBoard } from "@/components/os/operations/RoomStatusBoard";
import { Button } from "@/components/ui/button";
import { Settings2 } from "lucide-react";
import { useCurrentUserRoles, canAccessModule } from "@/lib/permissions";

export const Route = createFileRoute("/_authenticated/admin/operations/rooms/")({
  head: () => ({ meta: [{ title: "Room Board — StayNas" }, { name: "robots", content: "noindex,nofollow" }] }),
  component: RoomBoardPage,
});

function RoomBoardPage() {
  const fn = useServerFn(getRoomBoard);
  const q = useQuery({ queryKey: ["ops-room-board"], queryFn: () => fn(), staleTime: 0, refetchOnMount: "always", refetchOnWindowFocus: true });
  const rolesQ = useCurrentUserRoles();
  const d: any = q.data ?? { states: [] };
  const canConfigure = canAccessModule("rooms.configure", rolesQ.data ?? []);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Room Status Board"
        description="Live state for every physical room unit."
        actions={
          !rolesQ.isLoading && canConfigure ? (
            <Link to="/admin/operations/rooms/configure">
              <Button>
                <Settings2 className="mr-2 h-4 w-4" />
                Configure rooms
              </Button>
            </Link>
          ) : undefined
        }
      />
      {q.isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : q.isError ? (
        <div role="alert" className="rounded-lg border border-destructive/30 p-6">
          <p className="text-sm font-medium">Room Board could not be loaded.</p>
          <p className="mt-1 text-sm text-muted-foreground">{q.error instanceof Error ? q.error.message : "Please retry the room inventory query."}</p>
          <Button className="mt-3" variant="outline" onClick={() => q.refetch()}>Retry</Button>
        </div>
      ) : (
        <RoomStatusBoard states={d.states} />
      )}
    </div>
  );
}
