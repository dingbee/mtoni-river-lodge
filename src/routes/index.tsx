import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  beforeLoad: ({ location }) => {
    // Supabase email templates may return auth payloads to the configured Site URL
    // ("/") instead of the explicit redirectTo URL. Preserve recovery credentials
    // before the normal public homepage redirect can discard them.
    const query = new URLSearchParams(location.searchStr);
    const hash = new URLSearchParams(
      location.hash.startsWith("#") ? location.hash.slice(1) : location.hash,
    );
    const hasAuthPayload =
      query.has("code") ||
      query.has("token_hash") ||
      (query.get("type") === "recovery" && (query.has("error") || query.has("error_description"))) ||
      (hash.has("access_token") && hash.has("refresh_token")) ||
      hash.has("error") ||
      hash.has("error_description");

    if (hasAuthPayload) {
      throw redirect({
        href: `/auth/callback${location.searchStr}${location.hash}`,
      });
    }

    throw redirect({ to: "/rooms" });
  },
});
