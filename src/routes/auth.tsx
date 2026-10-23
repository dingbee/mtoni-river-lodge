import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Leaf } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [{ title: "Staff Sign In — StayNas" }, { name: "robots", content: "noindex,nofollow" }],
    links: [{ rel: "canonical", href: "https://staynas.nolmark.co/auth" }],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [resetting, setResetting] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading || resetting) return;
    setLoading(true);

    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      if (signInError) {
        toast.error(signInError.message);
        return;
      }

      // Accept either a legacy global staff role or an active property-scoped membership.
      const [{ data: roles, error: roleError }, { data: properties, error: propertyError }] =
        await Promise.all([
          supabase.rpc("current_user_roles"),
          supabase.rpc("staynas_list_properties"),
        ]);

      const hasLegacyStaffRole = !roleError && Boolean(roles?.length);
      const accessibleProperties = !propertyError && Array.isArray(properties) ? properties : [];

      if (!hasLegacyStaffRole && accessibleProperties.length === 0) {
        await supabase.auth.signOut();
        toast.error(
          roleError
            ? "Could not verify staff roles. Please try again."
            : propertyError
              ? "Could not load your property access. Please try again."
              : "Your account does not have StayNas staff access.",
        );
        return;
      }

      if (!hasLegacyStaffRole && accessibleProperties.length === 1) {
        const { error: contextError } = await supabase.rpc("staynas_set_active_property", {
          _property_id: accessibleProperties[0].id,
        });
        if (contextError) {
          console.error("[StayNas auth] Active property setup failed", contextError);
          await supabase.auth.signOut();
          toast.error("Your property access could not be initialized. Contact your administrator.");
          return;
        }
      }

      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError || !userData.user) {
        await supabase.auth.signOut();
        toast.error("Unable to verify your staff account. Please sign in again.");
        return;
      }

      // Keep first-login password setup in the current SPA session. A full document
      // reload can lose the freshly established auth session before the setup route reads it.
      if (userData.user.user_metadata?.staynas_password_initialized !== true) {
        await navigate({ to: "/auth/set-password", search: { type: "first-login" } });
      } else {
        // Use a full navigation for the protected admin shell, which rehydrates its context.
        window.location.assign("/admin/bookings");
      }
    } catch (error) {
      console.error("[StayNas auth] Sign-in flow failed", error);
      toast.error("Sign-in completed, but StayNas could not open the next screen. Please retry.");
    } finally {
      setLoading(false);
    }
  };

  const resetPassword = async () => {
    if (!email.trim()) {
      toast.error("Enter your staff email first.");
      return;
    }
    setResetting(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: "https://staynas.nolmark.co/auth/callback",
    });
    setResetting(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("If that staff account exists, a password-reset email has been sent.");
  };

  return (
    <div className="min-h-screen bg-ivory text-charcoal flex items-center justify-center px-4">
      <form
        onSubmit={submit}
        className="w-full max-w-sm rounded-2xl border border-charcoal/10 bg-ivory p-8 shadow-[0_24px_60px_-30px_rgba(30,45,30,0.35)]"
      >
        <p className="inline-flex items-center gap-2 text-[0.65rem] uppercase tracking-[0.3em] text-charcoal/60">
          <Leaf className="h-3 w-3" style={{ color: "#0F3D3A" }} /> Staff Portal
        </p>

        <h1 className="mt-3 font-display text-2xl">Sign in</h1>
        <p className="mt-1 text-xs text-charcoal/60">Reservations & admin access only.</p>

        <div className="mt-6 space-y-4">
          <div>
            <label className="text-[0.65rem] font-medium uppercase tracking-[0.22em] text-charcoal/70">
              Email
            </label>
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-2 w-full rounded-lg border border-charcoal/15 bg-ivory px-4 py-3 text-sm outline-none focus:border-charcoal"
            />
          </div>

          <div>
            <label className="text-[0.65rem] font-medium uppercase tracking-[0.22em] text-charcoal/70">
              Password
            </label>
            <input
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-2 w-full rounded-lg border border-charcoal/15 bg-ivory px-4 py-3 text-sm outline-none focus:border-charcoal"
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={loading || resetting}
          className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-full px-5 py-3.5 text-[0.7rem] font-medium uppercase tracking-[0.24em] text-ivory transition-all hover:brightness-110 disabled:opacity-60"
          style={{ background: "linear-gradient(135deg, #0F3D3A 0%, #0F3D3A 100%)" }}
        >
          {loading && <Loader2 className="h-4 w-4 animate-spin" />}
          Sign in
        </button>

        <button
          type="button"
          onClick={resetPassword}
          disabled={loading || resetting}
          className="mt-3 block w-full text-center text-[0.65rem] uppercase tracking-[0.22em] text-charcoal/50 hover:text-charcoal disabled:opacity-60"
        >
          {resetting ? "Sending reset link…" : "Forgot password?"}
        </button>

        <Link
          to="/"
          className="mt-4 block text-center text-[0.65rem] uppercase tracking-[0.22em] text-charcoal/50 hover:text-charcoal"
        >
          ← Back to website
        </Link>
      </form>
    </div>
  );
}
