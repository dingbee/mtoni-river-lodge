import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Leaf, Loader2 } from "lucide-react";

export const Route = createFileRoute("/auth/set-password")({
  ssr: false,
  validateSearch: (s: Record<string, unknown>) => ({
    type: typeof s.type === "string" ? (s.type as string) : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Set your password — Mtoni River Lodge" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: SetPasswordPage,
});

function SetPasswordPage() {
  const navigate = useNavigate();
  const { type } = Route.useSearch();
  const [ready, setReady] = useState(false);
  const [email, setEmail] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    supabase.auth.getUser().then(({ data, error }) => {
      if (cancelled) return;
      if (error || !data.user) {
        toast.error("Your invitation link has expired. Please request a new one.");
        navigate({ to: "/auth" });
        return;
      }
      setEmail(data.user.email ?? null);
      setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) return toast.error("Password must be at least 8 characters.");
    if (password !== confirm) return toast.error("Passwords do not match.");
    setSaving(true);
    const { error } = await supabase.auth.updateUser({ password });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Password set. Welcome to Mtoni OS.");
    navigate({ to: "/admin" });
  };

  const heading = type === "recovery" ? "Reset your password" : "Set your password";
  const subheading =
    type === "recovery"
      ? "Choose a new password to continue."
      : "Finish activating your Mtoni OS staff account.";

  return (
    <div className="min-h-screen bg-ivory text-charcoal flex items-center justify-center px-4">
      <form
        onSubmit={submit}
        className="w-full max-w-sm rounded-2xl border border-charcoal/10 bg-ivory p-8 shadow-[0_24px_60px_-30px_rgba(30,45,30,0.35)]"
      >
        <p className="inline-flex items-center gap-2 text-[0.65rem] uppercase tracking-[0.3em] text-charcoal/60">
          <Leaf className="h-3 w-3" style={{ color: "#427A43" }} /> Staff Portal
        </p>
        <h1 className="mt-3 font-display text-2xl">{heading}</h1>
        <p className="mt-1 text-xs text-charcoal/60">{subheading}</p>
        {email && (
          <p className="mt-4 text-xs text-charcoal/70">
            Signed in as <span className="font-medium text-charcoal">{email}</span>
          </p>
        )}
        <div className="mt-6 space-y-4">
          <div>
            <label className="text-[0.65rem] font-medium uppercase tracking-[0.22em] text-charcoal/70">
              New password
            </label>
            <input
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={!ready}
              className="mt-2 w-full rounded-lg border border-charcoal/15 bg-ivory px-4 py-3 text-sm outline-none focus:border-charcoal"
            />
          </div>
          <div>
            <label className="text-[0.65rem] font-medium uppercase tracking-[0.22em] text-charcoal/70">
              Confirm password
            </label>
            <input
              type="password"
              required
              minLength={8}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              disabled={!ready}
              className="mt-2 w-full rounded-lg border border-charcoal/15 bg-ivory px-4 py-3 text-sm outline-none focus:border-charcoal"
            />
          </div>
        </div>
        <button
          disabled={saving || !ready}
          className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-full px-5 py-3.5 text-[0.7rem] font-medium uppercase tracking-[0.24em] text-ivory transition-all hover:brightness-110 disabled:opacity-60"
          style={{ background: "linear-gradient(135deg, #346739 0%, #427A43 100%)" }}
        >
          {saving && <Loader2 className="h-4 w-4 animate-spin" />} Save password
        </button>
      </form>
    </div>
  );
}