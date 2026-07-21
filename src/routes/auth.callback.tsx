import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";

export const Route = createFileRoute("/auth/callback")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Signing you in — Mtoni River Lodge" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: AuthCallback,
});

function AuthCallback() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const url = new URL(window.location.href);

        // PKCE / code exchange (?code=...)
        const code = url.searchParams.get("code");
        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) throw error;
        }

        // Implicit flow (hash contains access_token / type)
        const hash = window.location.hash.startsWith("#")
          ? window.location.hash.slice(1)
          : "";
        const hp = new URLSearchParams(hash);
        const access_token = hp.get("access_token");
        const refresh_token = hp.get("refresh_token");
        const hashType = hp.get("type");
        const queryType = url.searchParams.get("type");
        const type = hashType || queryType;

        if (access_token && refresh_token) {
          const { error } = await supabase.auth.setSession({
            access_token,
            refresh_token,
          });
          if (error) throw error;
        }

        // Clean the URL of tokens before routing further
        window.history.replaceState({}, "", "/auth/callback");

        const hashError =
          hp.get("error_description") || hp.get("error") || null;
        if (hashError) throw new Error(decodeURIComponent(hashError));

        const { data: sessionData } = await supabase.auth.getSession();
        if (!sessionData.session) {
          throw new Error("Sign-in link is invalid or has expired.");
        }

        if (cancelled) return;
        if (type === "invite" || type === "recovery" || type === "signup") {
          navigate({ to: "/auth/set-password", search: { type } as never });
        } else {
          navigate({ to: "/admin" });
        }
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Sign-in failed");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  return (
    <div className="min-h-screen bg-ivory text-charcoal flex items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-2xl border border-charcoal/10 bg-ivory p-8 text-center shadow-[0_24px_60px_-30px_rgba(30,45,30,0.35)]">
        {error ? (
          <>
            <h1 className="font-display text-xl">Link invalid or expired</h1>
            <p className="mt-2 text-sm text-charcoal/70">{error}</p>
            <a
              href="/auth"
              className="mt-6 inline-flex items-center justify-center rounded-full px-5 py-3 text-[0.7rem] font-medium uppercase tracking-[0.24em] text-ivory"
              style={{ background: "linear-gradient(135deg, #346739 0%, #427A43 100%)" }}
            >
              Go to sign in
            </a>
          </>
        ) : (
          <>
            <Loader2 className="mx-auto h-6 w-6 animate-spin text-charcoal/60" />
            <p className="mt-4 text-sm text-charcoal/70">Completing sign-in…</p>
          </>
        )}
      </div>
    </div>
  );
}