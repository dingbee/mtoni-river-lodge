import { createFileRoute } from "@tanstack/react-router";
import { SettingsHub } from "./_authenticated.admin.settings.index";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({
    meta: [
      { title: "Settings — StayNas" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: SettingsHub,
});
