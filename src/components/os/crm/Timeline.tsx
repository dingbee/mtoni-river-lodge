import {
  Calendar,
  CheckCircle2,
  XCircle,
  CreditCard,
  Mail,
  MessageCircle,
  StickyNote,
  Activity,
} from "lucide-react";

export type TimelineEntry = { at: string; type: string; title: string; description?: string | null; meta?: any };

function iconFor(type: string) {
  if (type.startsWith("booking_created")) return Calendar;
  if (type.startsWith("booking_confirmed")) return CheckCircle2;
  if (type.startsWith("booking_cancelled")) return XCircle;
  if (type.startsWith("payment")) return CreditCard;
  if (type.startsWith("email")) return Mail;
  if (type === "whatsapp" || type.startsWith("comm_whatsapp")) return MessageCircle;
  if (type === "note") return StickyNote;
  return Activity;
}

export function Timeline({ entries }: { entries: TimelineEntry[] }) {
  if (entries.length === 0) {
    return <p className="text-sm text-muted-foreground">No activity yet.</p>;
  }
  return (
    <ol className="relative space-y-4 border-l pl-6">
      {entries.map((e, i) => {
        const Icon = iconFor(e.type);
        return (
          <li key={i} className="relative">
            <span className="absolute -left-[30px] flex size-5 items-center justify-center rounded-full bg-background ring-2 ring-border">
              <Icon className="size-3 text-muted-foreground" aria-hidden />
            </span>
            <div className="text-xs text-muted-foreground">{new Date(e.at).toLocaleString()}</div>
            <div className="text-sm font-medium text-foreground">{e.title}</div>
            {e.description && (
              <div className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{e.description}</div>
            )}
          </li>
        );
      })}
    </ol>
  );
}