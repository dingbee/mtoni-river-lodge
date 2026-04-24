import { Outlet, createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/rooms")({
  component: RoomsLayout,
});

function RoomsLayout() {
  return <Outlet />;
}
