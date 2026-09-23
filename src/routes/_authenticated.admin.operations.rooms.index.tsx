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
  const q = useQuery({ queryKey: ["ops-room-board"], queryFn: () => fn(), staleTime: 30_000 });
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
      {q.isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : (
        <RoomStatusBoard states={d.states} />
      )}
    </div>
  );
}
