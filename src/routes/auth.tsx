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
    <div className="min-h-screen bg-background text-foreground flex items-center justify-center px-4 py-8">
      <form
        onSubmit={recoveryVerified ? saveRecoveredPassword : recoverySent ? verifyRecoveryCode : submit}
        className="w-full max-w-sm rounded-lg border border-border bg-card p-6 shadow-sm sm:p-8"
      >
        <p className="inline-flex items-center gap-2 text-[0.65rem] uppercase tracking-[0.3em] text-muted-foreground">
          <Leaf className="h-3 w-3" style={{ color: "#0F3D3A" }} /> Staff Portal
        </p>

        {recoveryVerified ? (
          <>
            <h1 className="mt-3 font-display text-2xl">Reset your password</h1>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">Your email is verified. Choose a new password to continue.</p>
            <div className="mt-6 space-y-4">
              <div>
                <label className="text-[0.65rem] font-medium uppercase tracking-[0.22em] text-muted-foreground">New password</label>
                <input type="password" required minLength={8} autoComplete="new-password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className="mt-2 w-full rounded-lg border border-input bg-background px-4 py-3 text-sm outline-none focus:border-charcoal" />
              </div>
              <div>
                <label className="text-[0.65rem] font-medium uppercase tracking-[0.22em] text-muted-foreground">Confirm new password</label>
                <input type="password" required minLength={8} autoComplete="new-password" value={confirmNewPassword} onChange={(e) => setConfirmNewPassword(e.target.value)} className="mt-2 w-full rounded-lg border border-input bg-background px-4 py-3 text-sm outline-none focus:border-charcoal" />
              </div>
            </div>
            <button type="submit" disabled={savingNewPassword || !newPassword || !confirmNewPassword} className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-full px-5 py-3.5 text-[0.7rem] font-medium uppercase tracking-[0.24em] text-primary-foreground transition-all hover:brightness-110 disabled:opacity-60" className="bg-primary">
              {savingNewPassword && <Loader2 className="h-4 w-4 animate-spin" />}
              Save new password
            </button>
          </>
        ) : recoverySent ? (
          <>
            <h1 className="mt-3 font-display text-2xl">Enter reset code</h1>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              Enter the one-time code sent to <span className="font-medium text-foreground">{email}</span>.
              Keep this page open while you retrieve the email.
            </p>
            <div className="mt-6">
              <label className="text-[0.65rem] font-medium uppercase tracking-[0.22em] text-muted-foreground">
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
                className="mt-2 w-full rounded-lg border border-input bg-background px-4 py-3 text-center text-xl tracking-[0.35em] outline-none focus:border-charcoal"
                placeholder="••••••"
                autoFocus
              />
            </div>
            {recoveryError && <p role="alert" aria-live="polite" className="mt-3 text-xs text-red-700">{recoveryError}</p>}
            <button
              type="submit"
              disabled={verifyingRecovery || !recoveryCode.trim()}
              className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-full px-5 py-3.5 text-[0.7rem] font-medium uppercase tracking-[0.24em] text-primary-foreground transition-all hover:brightness-110 disabled:opacity-60"
              className="bg-primary"
            >
              {verifyingRecovery && <Loader2 className="h-4 w-4 animate-spin" />}
              {verifyingRecovery ? "Verifying code…" : "Verify code"}
            </button>
            <button
              type="button"
              onClick={resetPassword}
              disabled={resetting || verifyingRecovery}
              className="mt-4 block w-full text-center text-[0.65rem] uppercase tracking-[0.18em] text-muted-foreground hover:text-foreground disabled:opacity-60"
            >
              {resetting ? "Sending…" : "Send a new code"}
            </button>
            <button
              type="button"
              onClick={() => { setRecoverySent(false); setRecoveryCode(""); }}
              className="mt-3 inline-flex w-full items-center justify-center gap-2 text-[0.65rem] uppercase tracking-[0.18em] text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="h-3 w-3" /> Back to sign in
            </button>
          </>
        ) : (
          <>
            <h1 className="mt-3 font-display text-2xl">Sign in</h1>
            <p className="mt-1 text-xs text-muted-foreground">Reservations & admin access only.</p>

            <div className="mt-6 space-y-4">
              <div>
                <label className="text-[0.65rem] font-medium uppercase tracking-[0.22em] text-muted-foreground">
                  Email
                </label>
                <input
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="mt-2 w-full rounded-lg border border-input bg-background px-4 py-3 text-sm outline-none focus:border-charcoal"
                />
              </div>

              <div>
                <label className="text-[0.65rem] font-medium uppercase tracking-[0.22em] text-muted-foreground">
                  Password
                </label>
                <input
                  type="password"
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="mt-2 w-full rounded-lg border border-input bg-background px-4 py-3 text-sm outline-none focus:border-charcoal"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading || resetting}
              className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-full px-5 py-3.5 text-[0.7rem] font-medium uppercase tracking-[0.24em] text-primary-foreground transition-all hover:brightness-110 disabled:opacity-60"
              className="bg-primary"
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              Sign in
            </button>

            <button
              type="button"
              onClick={resetPassword}
              disabled={loading || resetting}
              className="mt-3 block w-full text-center text-[0.65rem] uppercase tracking-[0.22em] text-muted-foreground hover:text-foreground disabled:opacity-60"
            >
              {resetting ? "Sending reset code…" : "Forgot password?"}
            </button>
          </>
        )}

        <Link
          to="/"
          className="mt-5 block text-center text-[0.65rem] uppercase tracking-[0.22em] text-muted-foreground hover:text-foreground"
        >
          ← Back to website
        </Link>
      </form>
    </div>
  );
}
