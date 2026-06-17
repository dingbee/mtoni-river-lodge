import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Leaf } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/auth")({
  head: () => ({ meta: [{ title: "Staff Sign In — Mtoni River Lodge" }, { name: "robots", content: "noindex,nofollow" }] }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/admin/bookings" });
    });
  }, [navigate]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) return toast.error(error.message);
    navigate({ to: "/admin/bookings" });
  };

  return (
    <div className="min-h-screen bg-ivory text-charcoal flex items-center justify-center px-4">
      <form onSubmit={submit} className="w-full max-w-sm rounded-2xl border border-charcoal/10 bg-ivory p-8 shadow-[0_24px_60px_-30px_rgba(30,45,30,0.35)]">
        <p className="inline-flex items-center gap-2 text-[0.65rem] uppercase tracking-[0.3em] text-charcoal/60">
          <Leaf className="h-3 w-3" style={{ color: "#427A43" }} /> Staff Portal
        </p>
        <h1 className="mt-3 font-display text-2xl">Sign in</h1>
        <p className="mt-1 text-xs text-charcoal/60">Reservations &amp; admin access only.</p>
        <div className="mt-6 space-y-4">
          <div>
            <label className="text-[0.65rem] font-medium uppercase tracking-[0.22em] text-charcoal/70">Email</label>
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="mt-2 w-full rounded-lg border border-charcoal/15 bg-ivory px-4 py-3 text-sm outline-none focus:border-charcoal" />
          </div>
          <div>
            <label className="text-[0.65rem] font-medium uppercase tracking-[0.22em] text-charcoal/70">Password</label>
            <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} className="mt-2 w-full rounded-lg border border-charcoal/15 bg-ivory px-4 py-3 text-sm outline-none focus:border-charcoal" />
          </div>
        </div>
        <button disabled={loading} className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-full px-5 py-3.5 text-[0.7rem] font-medium uppercase tracking-[0.24em] text-ivory transition-all hover:brightness-110 disabled:opacity-60" style={{ background: "linear-gradient(135deg, #346739 0%, #427A43 100%)" }}>
          {loading && <Loader2 className="h-4 w-4 animate-spin" />} Sign in
        </button>
        <Link to="/" className="mt-4 block text-center text-[0.65rem] uppercase tracking-[0.22em] text-charcoal/50 hover:text-charcoal">← Back to website</Link>
      </form>
    </div>
  );
}