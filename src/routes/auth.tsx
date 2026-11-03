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
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      // Route recovery through the StayNas callback so the recovery session is
      // exchanged before the password form is opened (including mobile clients).
      redirectTo: `${window.location.origin}/auth/callback?type=recovery`,
    });
    setResetting(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setRecoverySent(true);
    setRecoveryCode("");
    toast.success("If that staff account exists, a password-reset code has been sent.");
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
    try {
      const { data, error } = await supabase.auth.verifyOtp({
        email: email.trim(),
        token,
        type: "recovery",
      });
      if (error) throw error;

      const { data: verifiedUser, error: userError } = await supabase.auth.getUser();
      if (userError || !verifiedUser.user || !data.session) {
        throw userError ?? new Error("Recovery session could not be established. Request a new code.");
      }

      setRecoveryVerified(true);
    } catch (error) {
      console.error("[StayNas auth] Recovery code verification failed", error);
      toast.error(error instanceof Error ? error.message : "The code is invalid or expired. Request a new one.");
    } finally {
      setVerifyingRecovery(false);
      recoveryVerificationStarted.current = false;
    }
  };

  return (
    <main className="min-h-screen bg-[#f4f6f5] text-[#172b2a]">
      <div className="grid min-h-screen lg:grid-cols-[minmax(0,1.05fr)_minmax(460px,0.95fr)]">
        <section className="relative hidden overflow-hidden bg-[#102f2d] px-12 py-14 text-white lg:flex lg:flex-col lg:justify-between xl:px-20">
          <div className="pointer-events-none absolute -right-40 -top-40 h-[34rem] w-[34rem] rounded-full border border-white/10" />
          <div className="pointer-events-none absolute -right-16 -top-16 h-[26rem] w-[26rem] rounded-full border border-white/10" />
          <div className="pointer-events-none absolute -bottom-48 -left-32 h-[34rem] w-[34rem] rounded-full bg-[#1e514b]/70 blur-3xl" />
          <div className="relative z-10 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/20 bg-white/10">
              <Leaf className="h-5 w-5 text-[#b8d6c8]" />
            </div>
            <div>
              <div className="text-lg font-semibold tracking-[0.16em]">STAYNAS</div>
              <div className="text-[10px] uppercase tracking-[0.28em] text-white/55">Hospitality operating system</div>
            </div>
          </div>
          <div className="relative z-10 max-w-xl py-16">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.06] px-3 py-1.5 text-[11px] font-medium uppercase tracking-[0.2em] text-[#c5ddd2]">
              <span className="h-1.5 w-1.5 rounded-full bg-[#8cc4a8]" /> Secure staff workspace
            </div>
            <h1 className="max-w-lg text-5xl font-semibold leading-[1.12] tracking-[-0.04em] xl:text-6xl">
              Hospitality operations, connected.
            </h1>
            <p className="mt-6 max-w-md text-base leading-7 text-white/65">
              One workspace for your property teams, guest operations and business performance.
            </p>
          </div>
          <div className="relative z-10 flex items-center justify-between border-t border-white/15 pt-6 text-xs text-white/45">
            <span>StayNas · Staff access</span>
            <span>Secure by design</span>
          </div>
        </section>

        <section className="flex min-h-screen flex-col bg-[#f8faf9]">
          <header className="flex items-center justify-between px-6 py-6 lg:hidden">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#123c38] text-white"><Leaf className="h-4 w-4" /></div>
              <span className="text-sm font-semibold tracking-[0.16em]">STAYNAS</span>
            </div>
            <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#71817d]">Staff portal</span>
          </header>

          <div className="flex flex-1 items-center justify-center px-5 py-10 sm:px-10">
            <div className="w-full max-w-[440px]">
              <div className="mb-9 hidden items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-[#52716b] lg:flex">
                <span className="h-1.5 w-1.5 rounded-full bg-[#1e7566]" /> Staff portal
              </div>
              <div className="mb-8">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#638079]">
                  {recoveryVerified ? "Account security" : recoverySent ? "Identity verification" : "Welcome back"}
                </p>
                <h2 className="mt-3 text-3xl font-semibold tracking-[-0.035em] text-[#173331] sm:text-[2.15rem]">
                  {recoveryVerified ? "Create a new password" : recoverySent ? "Verify your email" : "Sign in to StayNas"}
                </h2>
                <p className="mt-3 max-w-md text-sm leading-6 text-[#687b77]">
                  {recoveryVerified
                    ? "Your email has been verified. Set a secure password to finish recovering your account."
                    : recoverySent
                      ? `Enter the one-time verification code sent to ${email}. Keep this page open while you retrieve it.`
                      : "Access your property's operations and management workspace."}
                </p>
              </div>

              <form
                onSubmit={recoveryVerified ? saveRecoveredPassword : recoverySent ? verifyRecoveryCode : submit}
                className="rounded-2xl border border-[#e1e9e6] bg-white p-6 shadow-[0_18px_50px_-32px_rgba(18,60,56,0.28)] sm:p-8"
              >
                {recoveryVerified ? (
                  <div className="space-y-5">
                    <div>
                      <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-[#48625d]">New password</label>
                      <input type="password" required minLength={8} autoComplete="new-password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="At least 8 characters" className="w-full rounded-xl border border-[#dce6e2] bg-[#fbfcfb] px-4 py-3.5 text-sm text-[#173331] outline-none transition focus:border-[#397b70] focus:ring-4 focus:ring-[#397b70]/10" />
                    </div>
                    <div>
                      <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-[#48625d]">Confirm new password</label>
                      <input type="password" required minLength={8} autoComplete="new-password" value={confirmNewPassword} onChange={(e) => setConfirmNewPassword(e.target.value)} placeholder="Enter the password again" className="w-full rounded-xl border border-[#dce6e2] bg-[#fbfcfb] px-4 py-3.5 text-sm text-[#173331] outline-none transition focus:border-[#397b70] focus:ring-4 focus:ring-[#397b70]/10" />
                    </div>
                    <div className="rounded-xl bg-[#f0f6f3] px-4 py-3 text-xs leading-5 text-[#54736a]">Use at least 8 characters. Avoid reusing a password from another service.</div>
                    <button type="submit" disabled={savingNewPassword || !newPassword || !confirmNewPassword} className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#123c38] px-4 py-3.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#1b514a] disabled:cursor-not-allowed disabled:opacity-50">
                      {savingNewPassword && <Loader2 className="h-4 w-4 animate-spin" />} Save new password
                    </button>
                  </div>
                ) : recoverySent ? (
                  <div className="space-y-5">
                    <div>
                      <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-[#48625d]">Email verification code</label>
                      <input type="text" required autoComplete="one-time-code" inputMode="numeric" maxLength={12} value={recoveryCode} onChange={(e) => setRecoveryCode(e.target.value.replace(/\s/g, ""))} placeholder="Enter your code" autoFocus className="w-full rounded-xl border border-[#dce6e2] bg-[#fbfcfb] px-4 py-4 text-center text-xl font-semibold tracking-[0.32em] text-[#173331] outline-none transition focus:border-[#397b70] focus:ring-4 focus:ring-[#397b70]/10" />
                      <p className="mt-2 text-xs text-[#7b8b86]">Check your inbox and spam folder. The code is valid for a limited time.</p>
                    </div>
                    <button type="button" onClick={() => { void verifyRecoveryCode(); }} disabled={verifyingRecovery || !recoveryCode.trim()} className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#123c38] px-4 py-3.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#1b514a] disabled:cursor-not-allowed disabled:opacity-50">
                      {verifyingRecovery ? <><Loader2 className="h-4 w-4 animate-spin" /> Verifying code…</> : "Verify and continue"}
                    </button>
                    <div className="flex items-center justify-between border-t border-[#edf1ef] pt-4">
                      <button type="button" onClick={() => { setRecoverySent(false); setRecoveryCode(""); }} className="inline-flex items-center gap-2 text-xs font-medium text-[#617772] hover:text-[#173331]"><ArrowLeft className="h-3.5 w-3.5" /> Back to sign in</button>
                      <button type="button" onClick={resetPassword} disabled={resetting || verifyingRecovery} className="text-xs font-semibold text-[#267064] hover:text-[#123c38] disabled:opacity-50">{resetting ? "Sending…" : "Resend code"}</button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-5">
                    <div>
                      <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-[#48625d]">Work email</label>
                      <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@company.com" className="w-full rounded-xl border border-[#dce6e2] bg-[#fbfcfb] px-4 py-3.5 text-sm text-[#173331] outline-none transition focus:border-[#397b70] focus:ring-4 focus:ring-[#397b70]/10" />
                    </div>
                    <div>
                      <div className="mb-2 flex items-center justify-between">
                        <label className="text-xs font-semibold uppercase tracking-[0.12em] text-[#48625d]">Password</label>
                        <button type="button" onClick={resetPassword} disabled={loading || resetting} className="text-xs font-semibold text-[#267064] hover:text-[#123c38] disabled:opacity-50">Forgot password?</button>
                      </div>
                      <input type="password" required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Enter your password" className="w-full rounded-xl border border-[#dce6e2] bg-[#fbfcfb] px-4 py-3.5 text-sm text-[#173331] outline-none transition focus:border-[#397b70] focus:ring-4 focus:ring-[#397b70]/10" />
                    </div>
                    <button type="submit" disabled={loading || resetting} className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#123c38] px-4 py-3.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#1b514a] disabled:cursor-not-allowed disabled:opacity-50">
                      {loading ? <><Loader2 className="h-4 w-4 animate-spin" /> Signing in…</> : "Sign in securely"}
                    </button>
                  </div>
                )}
              </form>

              <div className="mt-6 flex items-center justify-between text-xs text-[#82908c]">
                <Link to="/" className="font-medium transition hover:text-[#173331]">← Back to website</Link>
                <span>Protected staff access</span>
              </div>
            </div>
          </div>
          <footer className="px-6 py-5 text-center text-[11px] text-[#9aa7a2]">© {new Date().getFullYear()} StayNas. All rights reserved.</footer>
        </section>
      </div>
    </main>
  );
}
