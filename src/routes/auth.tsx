import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { staynasRpc } from "@/lib/staynas-rpc";
import { Loader2, Leaf, ArrowLeft } from "lucide-react";
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
  const [recoveryCode, setRecoveryCode] = useState("");
  const [recoveryError, setRecoveryError] = useState("");
  const [recoverySent, setRecoverySent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [verifyingRecovery, setVerifyingRecovery] = useState(false);
  const [recoveryVerified, setRecoveryVerified] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [savingNewPassword, setSavingNewPassword] = useState(false);
  const recoveryVerificationStarted = useRef(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading || resetting || verifyingRecovery) return;
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
          staynasRpc(supabase).rpc("staynas_list_properties"),
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

      if (accessibleProperties.length === 1) {
        const { error: contextError } = await staynasRpc(supabase).rpc("staynas_set_active_property", {
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

      // Route housekeeping-only staff directly to their operational workspace.
      const normalizedRoles = (Array.isArray(roles) ? roles : []).map((entry: unknown) => {
        if (typeof entry === "string") return entry.toLowerCase();
        if (entry && typeof entry === "object") {
          const record = entry as Record<string, unknown>;
          return String(record.role ?? record.name ?? record.app_role ?? "").toLowerCase();
        }
        return "";
      });
      const housekeepingOnly =
        normalizedRoles.includes("housekeeping") &&
        !normalizedRoles.some((role: string) =>
          ["owner", "manager", "admin", "reception", "front_desk"].includes(role),
        );
      await navigate({
        to: housekeepingOnly ? "/admin/operations/housekeeping" : "/admin/bookings",
      });
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
    try {
      const normalizedEmail = email.trim().toLowerCase();
      const { error } = await supabase.auth.resetPasswordForEmail(normalizedEmail, {
        // OTP remains the primary recovery method. This allow-listed callback also
        // safely handles providers that render the recovery token as a link.
        redirectTo: `${window.location.origin}/auth/callback?type=recovery`,
      });
      if (error) throw error;

      setEmail(normalizedEmail);
      setRecoverySent(true);
      setRecoveryVerified(false);
      setRecoveryCode("");
      setNewPassword("");
      setConfirmNewPassword("");
      toast.success("If that staff account exists, a password-reset code has been sent.");
    } catch (error) {
      console.error("[StayNas auth] Password reset request failed", error);
      toast.error(error instanceof Error ? error.message : "Could not send a reset code. Please retry.");
    } finally {
      setResetting(false);
    }
  };

  const saveRecoveredPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 8) return toast.error("Password must be at least 8 characters.");
    if (newPassword !== confirmNewPassword) return toast.error("Passwords do not match.");
    setSavingNewPassword(true);
    try {
      const { error } = await supabase.auth.updateUser({
        password: newPassword,
        data: { staynas_password_initialized: true },
      });
      if (error) throw error;
      toast.success("Password updated. Sign in with your new password.");
      await supabase.auth.signOut();
      setRecoveryVerified(false);
      setRecoverySent(false);
      setRecoveryCode("");
      setPassword("");
      setNewPassword("");
      setConfirmNewPassword("");
    } catch (error) {
      console.error("[StayNas auth] Password recovery update failed", error);
      toast.error(error instanceof Error ? error.message : "Could not update password. Please retry.");
    } finally {
      setSavingNewPassword(false);
    }
  };

  const verifyRecoveryCode = async (e: React.FormEvent) => {
    e.preventDefault();
    const token = recoveryCode.replace(/\s/g, "");
    if (!email.trim() || !token) {
      toast.error("Enter the email address and the code from your reset email.");
      return;
    }
    if (recoveryVerificationStarted.current || verifyingRecovery) return;

    recoveryVerificationStarted.current = true;
    setVerifyingRecovery(true);
    setRecoveryError("");
    try {
      const { data, error } = await supabase.auth.verifyOtp({
        email: email.trim().toLowerCase(),
        token,
        type: "recovery",
      });
      if (error) throw error;

      // verifyOtp persists the recovery session through the configured Supabase client.
      // Confirm it is usable before allowing the password update screen to open.
      const { data: verifiedUser, error: userError } = await supabase.auth.getUser();
      if (userError || !verifiedUser.user || !data.session) {
        throw userError ?? new Error("Recovery session could not be established. Request a new code.");
      }

      // Keep the verified recovery session and reveal the password form in-place.
      // This avoids losing the session across route/document transitions on mobile.
      setRecoveryVerified(true);
      setRecoveryCode("");
    } catch (error) {
      console.error("[StayNas auth] Recovery code verification failed", error);
      const message = error instanceof Error ? error.message : "The code is invalid or expired. Request a new one.";
      setRecoveryError(message);
      toast.error(message);
    } finally {
      setVerifyingRecovery(false);
      recoveryVerificationStarted.current = false;
    }
  };

  return (
    <main className="min-h-[100svh] bg-[#F3F5F2] px-4 py-5 text-slate-900 sm:px-6 sm:py-10">
      <div className="mx-auto grid min-h-[calc(100svh-2.5rem)] w-full max-w-6xl overflow-hidden rounded-[28px] border border-[#DDE3DC] bg-white shadow-[0_24px_80px_-36px_rgba(15,45,35,0.28)] lg:min-h-[720px] lg:grid-cols-[0.92fr_1.08fr]">
        <aside className="relative isolate flex min-h-[230px] flex-col justify-between overflow-hidden bg-[#102B24] px-6 py-7 text-white sm:px-10 sm:py-10 lg:min-h-full lg:px-12 lg:py-12">
          <div aria-hidden="true" className="pointer-events-none absolute -right-24 -top-28 -z-10 h-80 w-80 rounded-full border border-white/10" />
          <div aria-hidden="true" className="pointer-events-none absolute -right-12 -top-16 -z-10 h-56 w-56 rounded-full border border-white/10" />
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/15 bg-white/10">
              <Leaf className="h-5 w-5 text-[#C9B78A]" />
            </span>
            <div>
              <p className="text-lg font-semibold tracking-[0.12em]">STAYNAS</p>
              <p className="text-[10px] font-medium uppercase tracking-[0.24em] text-white/55">Hospitality operating system</p>
            </div>
          </div>
          <div className="relative mt-8 max-w-md lg:mt-16">
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[#C9B78A]">The staff workspace</p>
            <h2 className="mt-4 max-w-sm text-3xl font-semibold leading-[1.12] tracking-tight sm:text-4xl lg:text-[2.75rem]">
              Every stay, thoughtfully managed.
            </h2>
            <p className="mt-4 max-w-sm text-sm leading-6 text-white/70 sm:text-base">
              Reservations, guest experiences and property operations—connected in one calm, clear workspace.
            </p>
          </div>
          <div className="mt-8 flex items-center gap-2 text-xs text-white/50 lg:mt-16">
            <span className="h-1.5 w-1.5 rounded-full bg-[#C9B78A]" />
            Secure access for authorised property teams
          </div>
        </aside>
        <section className="flex min-w-0 items-center justify-center px-5 py-8 sm:px-10 sm:py-12 lg:px-14">
      <form
        onSubmit={recoveryVerified ? saveRecoveredPassword : recoverySent ? verifyRecoveryCode : submit}
        className="w-full max-w-md rounded-2xl border border-[#E5E9E4] bg-white p-1 shadow-none"
      >
        <div className="px-1 py-2 sm:px-3">
          <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-[#61736B]">
            <ShieldCheck className="h-4 w-4 text-[#315E4D]" /> Staff portal
          </p>

        {recoveryVerified ? (
          <>
            <h1 className="mt-5 text-3xl font-semibold tracking-tight text-[#172A23]">Reset your password</h1>
            <p className="mt-2 text-sm leading-6 text-[#718078]">Your email is verified. Choose a new password to continue.</p>
            <div className="mt-8 space-y-5">
              <div>
                <label className="text-sm font-medium text-foreground">New password</label>
                <input type="password" required minLength={8} autoComplete="new-password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className="mt-2 h-12 w-full rounded-xl border border-[#D8E0D9] bg-[#FAFBF9] px-4 text-base text-[#172A23] outline-none transition placeholder:text-[#9AA79F] focus:border-[#315E4D] focus:bg-white focus:ring-4 focus:ring-[#315E4D]/10" />
              </div>
              <div>
                <label className="text-sm font-medium text-foreground">Confirm new password</label>
                <input type="password" required minLength={8} autoComplete="new-password" value={confirmNewPassword} onChange={(e) => setConfirmNewPassword(e.target.value)} className="mt-2 w-full rounded-md border border-input bg-background px-3 py-2.5 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring" />
              </div>
            </div>
            <button type="submit" disabled={savingNewPassword || !newPassword || !confirmNewPassword} className="mt-7 inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#173B30] px-4 py-3 text-sm font-semibold text-white shadow-[0_8px_20px_-10px_rgba(16,43,36,0.8)] transition hover:bg-[#245343] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#315E4D] focus-visible:ring-offset-2 disabled:opacity-60">
              {savingNewPassword && <Loader2 className="h-4 w-4 animate-spin" />}
              Save new password
            </button>
          </>
        ) : recoverySent ? (
          <>
            <h1 className="mt-3 text-2xl font-semibold tracking-tight">Enter reset code</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Enter the one-time code sent to <span className="font-medium text-foreground">{email}</span>.
              Keep this page open while you retrieve the email.
            </p>
            <div className="mt-6">
              <label className="text-sm font-medium text-foreground">
                Email verification code
              </label>
              <input
                type="text"
                required
                autoComplete="one-time-code"
                inputMode="numeric"
                maxLength={12}
                value={recoveryCode}
                onChange={(e) => { setRecoveryCode(e.target.value); setRecoveryError(""); }}
                className="mt-2 w-full rounded-md border border-input bg-background px-3 py-3 text-center text-xl tracking-[0.35em] text-foreground outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring"
                placeholder="••••••"
                autoFocus
              />
            </div>
            {recoveryError && <p role="alert" aria-live="polite" className="mt-3 text-xs text-red-700">{recoveryError}</p>}
            <button
              type="submit"
              disabled={verifyingRecovery || !recoveryCode.trim()}
              className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
            >
              {verifyingRecovery && <Loader2 className="h-4 w-4 animate-spin" />}
              {verifyingRecovery ? "Verifying code…" : "Verify code"}
            </button>
            <button
              type="button"
              onClick={resetPassword}
              disabled={resetting || verifyingRecovery}
              className="mt-4 block w-full text-center text-sm font-medium text-[#61736B] underline-offset-4 hover:text-[#173B30] hover:underline disabled:opacity-60"
            >
              {resetting ? "Sending…" : "Send a new code"}
            </button>
            <button
              type="button"
              onClick={() => { setRecoverySent(false); setRecoveryCode(""); }}
              className="mt-3 inline-flex w-full items-center justify-center gap-2 text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
            >
              <ArrowLeft className="h-3 w-3" /> Back to sign in
            </button>
          </>
        ) : (
          <>
            <h1 className="mt-3 text-2xl font-semibold tracking-tight">Sign in</h1>
            <p className="mt-2 text-sm leading-6 text-[#718078]">Sign in to your property workspace.</p>

            <div className="mt-6 space-y-4">
              <div>
                <label className="text-sm font-medium text-foreground">
                  Email
                </label>
                <input
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="mt-2 w-full rounded-md border border-input bg-background px-3 py-2.5 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
                />
              </div>

              <div>
                <label className="text-sm font-medium text-foreground">
                  Password
                </label>
                <input
                  type="password"
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="mt-2 w-full rounded-md border border-input bg-background px-3 py-2.5 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading || resetting}
              className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              Sign in
            </button>

            <button
              type="button"
              onClick={resetPassword}
              disabled={loading || resetting}
              className="mt-3 block w-full text-center text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline disabled:opacity-60"
            >
              {resetting ? "Sending reset code…" : "Forgot password?"}
            </button>
          </>
        )}

        <Link
          to="/"
          className="mt-8 block border-t border-[#EDF0EC] pt-5 text-center text-sm font-medium text-[#718078] underline-offset-4 hover:text-[#173B30] hover:underline"
        >
          ← Back to website
        </Link>
      </div>
      </form>
        </section>
      </div>
    </main>
  );
}
