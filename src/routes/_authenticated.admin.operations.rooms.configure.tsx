import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/admin/operations/rooms/configure")({
  beforeLoad: () => {
    throw redirect({ to: "/admin/operations/room-catalogue" });
  },
});
