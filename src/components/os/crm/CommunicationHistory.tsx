import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { logCommunication } from "@/lib/guests.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type Comm = {
  id: string;
  channel: string;
  direction: string;
  subject: string | null;
  body: string | null;
  occurred_at: string;
};

export function CommunicationHistory({
  guestId,
  items,
}: {
  guestId: string;
  items: Comm[];
}) {
  const qc = useQueryClient();
  const fn = useServerFn(logCommunication);
  const [channel, setChannel] = useState<"email" | "whatsapp" | "sms" | "call" | "note">("email");
  const [direction, setDirection] = useState<"in" | "out" | "internal">("out");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");

  const log = useMutation({
    mutationFn: () =>
      fn({
        data: {
          guestId,
          channel,
          direction,
          subject: subject || null,
          body: body || null,
        },
      }),
    onSuccess: () => {
      setSubject("");
      setBody("");
      qc.invalidateQueries({ queryKey: ["guest-summary", guestId] });
      qc.invalidateQueries({ queryKey: ["guest-timeline", guestId] });
    },
  });

  return (
    <section aria-label="Communications" className="space-y-4">
      <div className="rounded-lg border bg-card p-4">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <Select value={channel} onValueChange={(v) => setChannel(v as any)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="email">Email</SelectItem>
              <SelectItem value="whatsapp">WhatsApp</SelectItem>
              <SelectItem value="sms">SMS</SelectItem>
              <SelectItem value="call">Phone call</SelectItem>
              <SelectItem value="note">Note</SelectItem>
            </SelectContent>
          </Select>
          <Select value={direction} onValueChange={(v) => setDirection(v as any)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="out">Outgoing</SelectItem>
              <SelectItem value="in">Incoming</SelectItem>
              <SelectItem value="internal">Internal</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Input
          className="mt-2"
          placeholder="Subject (optional)"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
        />
        <Textarea
          className="mt-2"
          placeholder="Message body…"
          rows={3}
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
        <div className="mt-2 flex justify-end">
          <Button size="sm" disabled={log.isPending} onClick={() => log.mutate()}>
            {log.isPending ? "Logging…" : "Log communication"}
          </Button>
        </div>
      </div>

      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">No communications logged.</p>
      ) : (
        <ul className="space-y-3">
          {items.map((c) => (
            <li key={c.id} className="rounded-lg border bg-card p-3">
              <div className="flex items-center justify-between text-xs uppercase tracking-wide text-muted-foreground">
                <span>{c.channel} · {c.direction}</span>
                <span>{new Date(c.occurred_at).toLocaleString()}</span>
              </div>
              {c.subject && <div className="mt-1 text-sm font-medium">{c.subject}</div>}
              {c.body && <div className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{c.body}</div>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}