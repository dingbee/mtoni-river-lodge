import { useEffect, useMemo, useRef, useState } from "react";
import { MessageCircle, X, Send, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ConciergeMessage, ConciergeReply } from "@/domains/ai/concierge/concierge.types";

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

  async function send() {
    const text = input.trim();
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

  const shown: ChatMessage[] = messages.length === 0 ? [greeting] : [greeting, ...messages];

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
              </div>
            ))}
            {busy && (
              <div className="mr-auto max-w-[85%] rounded-lg bg-muted px-3 py-2 text-muted-foreground">Thinking…</div>
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