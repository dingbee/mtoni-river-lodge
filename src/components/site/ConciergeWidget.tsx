import { useEffect, useMemo, useRef, useState } from "react";
import { MessageCircle, X, Send, ExternalLink, Calendar, Users, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import type {
  ConciergeMessage,
  ConciergeReply,
  ConciergeRecommendation,
  ConciergeAvailabilityRoom,
  ConciergeBookingPlan,
} from "@/domains/ai/concierge/concierge.types";

const STORAGE_KEY = "mtoni.concierge.session";

type ChatMessage = ConciergeMessage & { pending?: boolean };

function useSessionToken() {
  const [token, setToken] = useState<string | null>(null);
  useEffect(() => {
    try { setToken(localStorage.getItem(STORAGE_KEY)); } catch { /* noop */ }
  }, []);
  const save = (t: string) => {
    try { localStorage.setItem(STORAGE_KEY, t); } catch { /* noop */ }
    setToken(t);
  };
  return { token, save };
}

export function ConciergeWidget() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const [escalation, setEscalation] = useState<ConciergeReply["escalation"] | null>(null);
  const { token, save } = useSessionToken();
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const [leadOpen, setLeadOpen] = useState(false);
  const [leadSent, setLeadSent] = useState(false);
  const [lead, setLead] = useState({ name: "", email: "", travel_period_start: "", travel_period_end: "", adults: "2", notes: "" });
  const [leadBusy, setLeadBusy] = useState(false);
  const [leadError, setLeadError] = useState<string | null>(null);

  const greeting = useMemo<ChatMessage>(
    () => ({
      role: "assistant",
      content:
        "Karibu — I'm Mtoni's concierge. Ask about our rooms, experiences, or how to plan your stay in Arusha. For live availability I'll connect you with our reservations team.",
    }),
    [],
  );

  useEffect(() => {
    if (open) {
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  useEffect(() => {
    const el = scrollerRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, open, busy]);

  async function sendText(raw: string) {
    const text = raw.trim();
    if (!text || busy) return;
    setInput("");
    setBusy(true);
    setEscalation(null);
    const userMsg: ChatMessage = { role: "user", content: text };
    setMessages((prev) => [...prev, userMsg]);
    try {
      const res = await fetch("/api/public/concierge/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          session_token: token,
          page: typeof window !== "undefined" ? window.location.pathname : null,
          locale: typeof navigator !== "undefined" ? navigator.language : null,
        }),
      });
      const data = (await res.json()) as ConciergeReply & { error?: string };
      if (!res.ok || data.error) throw new Error(data.error ?? "Concierge unavailable.");
      if (data.session_token) save(data.session_token);
      setMessages((prev) => [...prev, data.message]);
      if (data.escalation) setEscalation(data.escalation);
    } catch (err: any) {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: err?.message ?? "I couldn't reach our concierge just now. Please try again shortly.",
          escalated: true,
        },
      ]);
      setEscalation({
        reason: "Please try again or reach us directly.",
        channels: [
          {
            type: "whatsapp",
            label: "Chat on WhatsApp",
            url: "https://wa.me/255752441443",
          },
        ],
      });
    } finally {
      setBusy(false);
    }
  }

  async function send() { await sendText(input); }

  async function submitLead() {
    setLeadBusy(true); setLeadError(null);
    try {
      const res = await fetch("/api/public/concierge/lead", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_token: token,
          name: lead.name || null,
          email: lead.email || null,
          travel_period_start: lead.travel_period_start || null,
          travel_period_end: lead.travel_period_end || null,
          adults: lead.adults ? Number(lead.adults) : null,
          notes: lead.notes || null,
        }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error ?? "Could not save your details.");
      setLeadSent(true);
    } catch (err: any) {
      setLeadError(err?.message ?? "Something went wrong.");
    } finally {
      setLeadBusy(false);
    }
  }

  const shown: ChatMessage[] = messages.length === 0 ? [greeting] : [greeting, ...messages];
  const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");
  const quickActions = messages.length === 0
    ? ["Which room suits a couple?", "What experiences do you offer?", "Do you have family rooms?"]
    : [];

  return (
    <>
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open Mtoni Concierge"
          className="fixed bottom-6 right-6 z-40 flex items-center gap-2 rounded-full bg-primary px-4 py-3 text-primary-foreground shadow-lg transition hover:brightness-110"
        >
          <MessageCircle className="size-5" />
          <span className="hidden text-sm font-medium sm:inline">Concierge</span>
        </button>
      )}
      {open && (
        <div className="fixed bottom-6 right-6 z-50 flex h-[min(600px,80vh)] w-[min(380px,92vw)] flex-col overflow-hidden rounded-xl border border-border bg-background shadow-2xl">
          <header className="flex items-center justify-between border-b border-border bg-primary px-4 py-3 text-primary-foreground">
            <div>
              <p className="text-sm font-semibold">Mtoni Concierge</p>
              <p className="text-[11px] opacity-80">Ask about rooms, experiences, or planning your stay.</p>
            </div>
            <button type="button" onClick={() => setOpen(false)} aria-label="Close concierge" className="rounded p-1 hover:bg-white/10">
              <X className="size-4" />
            </button>
          </header>
          <div ref={scrollerRef} className="flex-1 space-y-3 overflow-y-auto px-3 py-3 text-sm">
            {shown.map((m, i) => (
              <div
                key={i}
                className={cn(
                  "max-w-[85%] whitespace-pre-wrap rounded-lg px-3 py-2",
                  m.role === "user"
                    ? "ml-auto bg-primary text-primary-foreground"
                    : "mr-auto bg-muted text-foreground",
                )}
              >
                {m.content}
                {m.citations && m.citations.length > 0 && (
                  <div className="mt-2 border-t border-border/60 pt-2 text-[11px] opacity-80">
                    <p className="font-medium">References</p>
                    <ul className="mt-1 space-y-0.5">
                      {m.citations.map((c, j) => (
                        <li key={j}>· {c.document_title}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {m.recommendations && m.recommendations.length > 0 && (
                  <RecommendationsList recs={m.recommendations} />
                )}
                {m.availability && m.availability.length > 0 && (
                  <AvailabilityList rooms={m.availability} />
                )}
                {m.plan && <BookingPlanCard plan={m.plan} />}
              </div>
            ))}
            {busy && (
              <div className="mr-auto max-w-[85%] rounded-lg bg-muted px-3 py-2 text-muted-foreground">Thinking…</div>
            )}
            {quickActions.length > 0 && !busy && (
              <div className="flex flex-wrap gap-1.5">
                {quickActions.map((q) => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => void sendText(q)}
                    className="rounded-full border border-border bg-background px-2.5 py-1 text-[11px] hover:bg-muted"
                  >
                    {q}
                  </button>
                ))}
              </div>
            )}
            {lastAssistant && (lastAssistant.intent === "high" || lastAssistant.plan) && !leadOpen && !leadSent && (
              <button
                type="button"
                onClick={() => setLeadOpen(true)}
                className="mr-auto inline-flex items-center gap-1 rounded-md border border-primary/30 bg-primary/5 px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/10"
              >
                <Sparkles className="size-3" /> Save my details for our reservations team
              </button>
            )}
            {leadOpen && !leadSent && (
              <LeadForm
                value={lead}
                onChange={setLead}
                busy={leadBusy}
                error={leadError}
                onSubmit={submitLead}
                onCancel={() => setLeadOpen(false)}
              />
            )}
            {leadSent && (
              <div className="mr-auto max-w-[95%] rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-xs">
                Asante — we've shared your details with the reservations team. They'll be in touch shortly.
              </div>
            )}
            {escalation && (
              <div className="mr-auto max-w-[95%] rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-xs">
                <p className="font-medium">{escalation.reason}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {escalation.channels.map((c) => (
                    <a
                      key={c.url}
                      href={c.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 rounded-md bg-primary px-2.5 py-1 text-[11px] font-medium text-primary-foreground hover:brightness-110"
                    >
                      {c.label} <ExternalLink className="size-3" />
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>
          <div className="border-t border-border p-2">
            <div className="flex items-end gap-2">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void send();
                  }
                }}
                rows={2}
                maxLength={1000}
                disabled={busy}
                placeholder="Ask about a room, experience, or plan…"
                className="flex-1 resize-none rounded-md border border-input bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <button
                type="button"
                onClick={() => void send()}
                disabled={busy || !input.trim()}
                aria-label="Send"
                className="rounded-md bg-primary p-2 text-primary-foreground disabled:opacity-50"
              >
                <Send className="size-4" />
              </button>
            </div>
            <p className="mt-1 px-1 text-[10px] text-muted-foreground">
              Concierge answers are AI-generated. For bookings please use the online booking form.
            </p>
          </div>
        </div>
      )}
    </>
  );
}

export default ConciergeWidget;

function RecommendationsList({ recs }: { recs: ConciergeRecommendation[] }) {
  return (
    <div className="mt-2 space-y-1.5 border-t border-border/60 pt-2 text-[11px]">
      <p className="font-medium opacity-80">Recommended for you</p>
      {recs.map((r) => (
        <a
          key={`${r.type}-${r.slug}`}
          href={r.type === "room" ? `/rooms/${r.slug}` : "/experiences"}
          className="block rounded-md bg-background/60 px-2 py-1.5 hover:bg-background"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="font-medium">{r.name}</span>
            {r.type === "room" && (
              <span className="whitespace-nowrap text-muted-foreground">from US${r.from_price_usd}</span>
            )}
          </div>
          <p className="opacity-70">{r.reasoning[0]}</p>
        </a>
      ))}
    </div>
  );
}

function AvailabilityList({ rooms }: { rooms: ConciergeAvailabilityRoom[] }) {
  return (
    <div className="mt-2 space-y-1 border-t border-border/60 pt-2 text-[11px]">
      <p className="flex items-center gap-1 font-medium opacity-80"><Calendar className="size-3" /> Live availability</p>
      {rooms.map((r) => (
        <div key={r.slug} className="flex items-center justify-between gap-2">
          <span>{r.name}</span>
          <span className={cn("whitespace-nowrap", r.is_available ? "text-primary" : "text-muted-foreground line-through")}>
            {r.is_available ? `US$${r.nightly_total_usd} · ${r.nights}n` : "Unavailable"}
          </span>
        </div>
      ))}
    </div>
  );
}

function BookingPlanCard({ plan }: { plan: ConciergeBookingPlan }) {
  return (
    <div className="mt-2 rounded-md border border-primary/30 bg-primary/5 p-2 text-[11px]">
      <p className="font-medium">Your booking plan</p>
      <p className="mt-0.5 flex items-center gap-1 opacity-80">
        <Calendar className="size-3" /> {plan.check_in} → {plan.check_out} · {plan.nights}n
      </p>
      <p className="flex items-center gap-1 opacity-80">
        <Users className="size-3" /> {plan.adults} adults{plan.children ? ` · ${plan.children} children` : ""}
      </p>
      {plan.room && <p className="mt-1">Room: <strong>{plan.room.name}</strong> — US${plan.room.nightly_total_usd}</p>}
      {plan.experiences.length > 0 && (
        <p className="mt-0.5 opacity-80">Experiences: {plan.experiences.map((e) => e.name).join(", ")}</p>
      )}
      <a
        href={plan.booking_url}
        className="mt-2 inline-flex items-center gap-1 rounded bg-primary px-2.5 py-1 text-primary-foreground hover:brightness-110"
      >
        Continue to booking <ExternalLink className="size-3" />
      </a>
    </div>
  );
}

function LeadForm(props: {
  value: { name: string; email: string; travel_period_start: string; travel_period_end: string; adults: string; notes: string };
  onChange: (v: LeadFormValue) => void;
  busy: boolean;
  error: string | null;
  onSubmit: () => void;
  onCancel: () => void;
}) {
  const v = props.value;
  const set = (k: keyof LeadFormValue, val: string) => props.onChange({ ...v, [k]: val });
  return (
    <div className="mr-auto w-full max-w-[95%] space-y-1.5 rounded-md border border-border bg-background p-2 text-xs">
      <p className="font-medium">Share your details</p>
      <input className="w-full rounded border bg-background px-2 py-1" placeholder="Name" value={v.name} onChange={(e) => set("name", e.target.value)} />
      <input className="w-full rounded border bg-background px-2 py-1" placeholder="Email" value={v.email} onChange={(e) => set("email", e.target.value)} />
      <div className="flex gap-1.5">
        <input type="date" className="w-full rounded border bg-background px-2 py-1" value={v.travel_period_start} onChange={(e) => set("travel_period_start", e.target.value)} />
        <input type="date" className="w-full rounded border bg-background px-2 py-1" value={v.travel_period_end} onChange={(e) => set("travel_period_end", e.target.value)} />
      </div>
      <input type="number" min="1" max="10" className="w-full rounded border bg-background px-2 py-1" placeholder="Adults" value={v.adults} onChange={(e) => set("adults", e.target.value)} />
      <textarea className="w-full rounded border bg-background px-2 py-1" placeholder="Notes (optional)" rows={2} value={v.notes} onChange={(e) => set("notes", e.target.value)} />
      {props.error && <p className="text-destructive">{props.error}</p>}
      <div className="flex justify-end gap-1.5">
        <button type="button" onClick={props.onCancel} className="rounded px-2 py-1 hover:bg-muted">Cancel</button>
        <button type="button" disabled={props.busy} onClick={props.onSubmit} className="rounded bg-primary px-2.5 py-1 text-primary-foreground disabled:opacity-50">
          {props.busy ? "Sending…" : "Send"}
        </button>
      </div>
    </div>
  );
}

type LeadFormValue = { name: string; email: string; travel_period_start: string; travel_period_end: string; adults: string; notes: string };