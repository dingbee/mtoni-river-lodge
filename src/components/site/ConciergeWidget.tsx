import { useEffect, useMemo, useRef, useState } from "react";
import { MessageCircle, X, Send, ExternalLink, Calendar, Users, Sparkles, ThumbsUp, ThumbsDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { trackGAEvent, trackBookingClick, trackWhatsAppClick } from "@/lib/analytics";
import type {
  ConciergeMessage,
  ConciergeReply,
  ConciergeRecommendation,
  ConciergeAvailabilityRoom,
  ConciergeBookingPlan,
} from "@/domains/ai/concierge/concierge.types";

const STORAGE_KEY = "mtoni.concierge.session";
const FEEDBACK_KEY = "mtoni.concierge.feedback";

function postBeacon(url: string, body: unknown) {
  try {
    const data = JSON.stringify(body);
    if (navigator.sendBeacon) {
      navigator.sendBeacon(url, new Blob([data], { type: "application/json" }));
      return;
    }
    void fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: data, keepalive: true });
  } catch { /* noop */ }
}

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

interface ConciergeWidgetProps {
  /** Optional callback invoked whenever the chat open state changes. */
  onOpenChange?: (open: boolean) => void;
}

export function ConciergeWidget({ onOpenChange }: ConciergeWidgetProps) {
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
  const [feedbackSent, setFeedbackSent] = useState<null | "helpful" | "not_helpful">(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(FEEDBACK_KEY);
      if (saved === "helpful" || saved === "not_helpful") setFeedbackSent(saved);
    } catch { /* noop */ }
  }, []);

  function sendFeedback(rating: "helpful" | "not_helpful") {
    if (feedbackSent || !token) return;
    setFeedbackSent(rating);
    try { localStorage.setItem(FEEDBACK_KEY, rating); } catch { /* noop */ }
    postBeacon("/api/public/concierge/feedback", { session_token: token, rating });
    trackGAEvent("concierge_feedback", { event_category: "concierge", rating });
  }

  const greeting = useMemo<ChatMessage>(
    () => ({
      role: "assistant",
      content:
        "Karibu — welcome to Mtoni River Lodge. I'm your AI Concierge. I can help you discover rooms, explore experiences, check availability, and plan your stay in Arusha.",
    }),
    [],
  );

  useEffect(() => {
    if (open) {
      requestAnimationFrame(() => inputRef.current?.focus());
      trackGAEvent("concierge_opened", { event_category: "concierge" });
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
    trackGAEvent("concierge_message_sent", {
      event_category: "concierge",
      message_length: text.length,
    });
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
      if (data.message.intent === "high" || data.message.plan) {
        trackGAEvent("concierge_booking_intent", {
          event_category: "concierge",
          intent: data.message.intent ?? "plan",
        });
      }
      if (data.escalation) {
        setEscalation(data.escalation);
        trackGAEvent("concierge_escalation", {
          event_category: "concierge",
          reason: data.escalation.reason,
        });
      }
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
    ? [
        "Find my room",
        "Explore experiences",
        "Check availability",
        "Ask a question",
        "Contact Mtoni team",
      ]
    : [];

  return (
    <>
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open Mtoni AI Concierge"
          className="fixed bottom-5 right-5 z-40 flex items-center gap-2 rounded-full bg-primary px-4 py-3 text-primary-foreground shadow-xl ring-1 ring-[color:var(--gold)]/40 transition-all duration-300 hover:scale-105 hover:brightness-110 sm:bottom-6 sm:right-6"
          style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
        >
          <MessageCircle className="size-5" />
          <span className="hidden text-sm font-medium sm:inline">Mtoni AI Concierge</span>
        </button>
      )}
      {open && (
        <div className="fixed inset-0 z-50 flex flex-col overflow-hidden border-border bg-background shadow-2xl sm:inset-auto sm:bottom-6 sm:right-6 sm:h-[min(640px,82vh)] sm:w-[min(400px,92vw)] sm:rounded-2xl sm:border">
          <header className="flex items-center justify-between border-b border-border bg-primary px-4 py-3 text-primary-foreground" style={{ paddingTop: "max(0.75rem, env(safe-area-inset-top))" }}>
            <div>
              <p className="font-serif text-base font-semibold tracking-wide">Mtoni AI Concierge</p>
              <p className="text-[11px] opacity-80">Rooms · Experiences · Plan your stay</p>
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
                    <p className="font-medium">Source: Mtoni Lodge Information</p>
                    <ul className="mt-1 space-y-0.5 opacity-80">
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
              <div className="flex flex-wrap gap-1.5 pt-1">
                {quickActions.map((q) => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => {
                      trackGAEvent("concierge_quick_action", { event_category: "concierge", action: q });
                      void sendText(q);
                    }}
                    className="rounded-full border border-[color:var(--gold)]/50 bg-[color:var(--ivory)]/60 px-3 py-1.5 text-[11px] font-medium text-foreground transition hover:bg-[color:var(--gold)]/20"
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
            {messages.length >= 2 && !feedbackSent && (
              <div className="mr-auto flex items-center gap-2 rounded-md border border-border bg-background/60 px-2 py-1 text-[11px] text-muted-foreground">
                <span>Was this helpful?</span>
                <button type="button" onClick={() => sendFeedback("helpful")} className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 hover:bg-muted" aria-label="Helpful">
                  <ThumbsUp className="size-3" />
                </button>
                <button type="button" onClick={() => sendFeedback("not_helpful")} className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 hover:bg-muted" aria-label="Not helpful">
                  <ThumbsDown className="size-3" />
                </button>
              </div>
            )}
            {feedbackSent && (
              <p className="mr-auto text-[11px] text-muted-foreground">Asante — thank you for your feedback.</p>
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
                      onClick={() => {
                        if (c.type === "whatsapp") {
                          trackWhatsAppClick({ buttonText: c.label, location: "concierge_escalation", destinationUrl: c.url });
                        } else {
                          trackGAEvent("concierge_escalation_click", { event_category: "concierge", channel: c.type });
                        }
                      }}
                      className="inline-flex items-center gap-1 rounded-md bg-primary px-2.5 py-1 text-[11px] font-medium text-primary-foreground hover:brightness-110"
                    >
                      {c.label} <ExternalLink className="size-3" />
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>
          <div className="border-t border-border p-2" style={{ paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))" }}>
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
              AI-generated responses. For confirmed bookings please use the secure booking form.
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
          onClick={() => trackGAEvent("concierge_recommendation_click", { event_category: "concierge", rec_type: r.type, slug: r.slug })}
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
    <div className="mt-2 rounded-lg border border-[color:var(--gold)]/50 bg-[color:var(--ivory)]/70 p-3 text-[11px] shadow-sm">
      <p className="font-serif text-sm font-semibold text-primary">Your Mtoni stay plan</p>
      <p className="mt-0.5 flex items-center gap-1 opacity-80">
        <Calendar className="size-3" /> {plan.check_in} → {plan.check_out} · {plan.nights}n
      </p>
      <p className="flex items-center gap-1 opacity-80">
        <Users className="size-3" /> {plan.adults} adults{plan.children ? ` · ${plan.children} children` : ""}
      </p>
      {plan.room && <p className="mt-1">Suggested: <strong>{plan.room.name}</strong> — US${plan.room.nightly_total_usd}</p>}
      {plan.experiences.length > 0 && (
        <p className="mt-0.5 opacity-80">Experiences: {plan.experiences.map((e) => e.name).join(", ")}</p>
      )}
      <a
        href={plan.booking_url}
        onClick={() => {
          trackBookingClick({ buttonText: "Continue Booking", location: "concierge_plan", destinationUrl: plan.booking_url });
          try {
            const t = localStorage.getItem(STORAGE_KEY);
            if (t) {
              const data = JSON.stringify({ session_token: t, conversion_type: "booking_click", metadata: { location: "concierge_plan" } });
              if (navigator.sendBeacon) {
                navigator.sendBeacon("/api/public/concierge/attribution", new Blob([data], { type: "application/json" }));
              } else {
                void fetch("/api/public/concierge/attribution", { method: "POST", headers: { "Content-Type": "application/json" }, body: data, keepalive: true });
              }
            }
          } catch { /* noop */ }
          trackGAEvent("concierge_booking_click", { event_category: "concierge", location: "concierge_plan" });
        }}
        className="mt-2 inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 font-medium text-primary-foreground shadow-sm hover:brightness-110"
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