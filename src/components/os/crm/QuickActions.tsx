import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { generateGuestSummary } from "@/lib/guest-intelligence.functions";
import { Copy, Mail, Plus, Sparkles, FileText, Star } from "lucide-react";

export function QuickActions({
  guestId,
  guest,
}: {
  guestId: string;
  guest: { full_name: string; email: string | null; phone_e164: string | null; country: string | null };
}) {
  const qc = useQueryClient();
  const summaryFn = useServerFn(generateGuestSummary);
  const [summary, setSummary] = useState<string | null>(null);

  const summarize = useMutation({
    mutationFn: () => summaryFn({ data: { id: guestId } }) as Promise<{ summary: string }>,
    onSuccess: (res) => {
      setSummary(res.summary);
      qc.invalidateQueries({ queryKey: ["guest-summary", guestId] });
      toast.success("Guest summary generated");
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to summarise"),
  });

  const copy = () => {
    const text = [guest.full_name, guest.email, guest.phone_e164, guest.country].filter(Boolean).join(" · ");
    void navigator.clipboard.writeText(text);
    toast.success("Copied to clipboard");
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Button asChild size="sm" variant="outline">
          <Link to="/book"><Plus className="mr-2 size-4" /> New reservation</Link>
        </Button>
        {guest.email && (
          <Button asChild size="sm" variant="outline">
            <a href={`mailto:${guest.email}`}><Mail className="mr-2 size-4" /> Email</a>
          </Button>
        )}
        <Button size="sm" variant="outline" onClick={copy}>
          <Copy className="mr-2 size-4" /> Copy details
        </Button>
        <Button asChild size="sm" variant="outline">
          <Link to="/admin/finance/invoices"><FileText className="mr-2 size-4" /> Invoices</Link>
        </Button>
        <Button asChild size="sm" variant="outline">
          <Link to="/admin/reviews"><Star className="mr-2 size-4" /> Reviews</Link>
        </Button>
        <Button size="sm" onClick={() => summarize.mutate()} disabled={summarize.isPending}>
          <Sparkles className="mr-2 size-4" /> {summarize.isPending ? "Summarising…" : "Generate summary"}
        </Button>
      </div>
      {summary && (
        <div className="rounded-lg border bg-muted/40 p-3 text-sm">
          <div className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Latest summary</div>
          {summary}
        </div>
      )}
    </div>
  );
}