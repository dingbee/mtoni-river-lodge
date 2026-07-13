import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getRoomBoard } from "@/lib/operations.functions";
import { PageHeader } from "@/components/os/PageHeader";
import { RoomStatusBoard } from "@/components/os/operations/RoomStatusBoard";

export const Route = createFileRoute("/_authenticated/admin/operations/rooms")({
  head: () => ({ meta: [{ title: "Room Board — Mtoni OS" }, { name: "robots", content: "noindex,nofollow" }] }),
  component: RoomBoardPage,
});

function RoomBoardPage() {
  const fn = useServerFn(getRoomBoard);
  const q = useQuery({ queryKey: ["ops-room-board"], queryFn: () => fn(), staleTime: 30_000 });
  const d: any = q.data ?? { states: [] };
  return (
    <div className="space-y-4">
      <PageHeader title="Room Status Board" description="Live state for every physical room unit." />
      {q.isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : (
        <RoomStatusBoard states={d.states} />
      )}
    </div>
  );
}
