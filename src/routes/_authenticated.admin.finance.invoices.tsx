import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Download, FileText } from "lucide-react";
import { PageHeader } from "@/components/os/PageHeader";
import { SectionCard } from "@/components/os/SectionCard";
import { LoadingState } from "@/components/os/LoadingState";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  listInvoices,
  finalizeInvoice,
  getInvoicePdf,
} from "@/domains/finance/finance.functions";

export const Route = createFileRoute("/_authenticated/admin/finance/invoices")({
  head: () => ({
    meta: [
      { title: "Invoice Manager — Mtoni OS" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: Invoices,
});

function Invoices() {
  const listFn = useServerFn(listInvoices);
  const finalizeFn = useServerFn(finalizeInvoice);
  const pdfFn = useServerFn(getInvoicePdf);
  const qc = useQueryClient();
  const [status, setStatus] = useState<"all" | "issued" | "draft">("all");
  const [search, setSearch] = useState("");

  const { data: rows, isLoading } = useQuery({
    queryKey: ["finance.invoices", status, search],
    queryFn: () => listFn({ data: { status, search: search || undefined } }),
  });

  const finalize = useMutation({
    mutationFn: (bookingId: string) => finalizeFn({ data: { bookingId } }),
    onSuccess: () => {
      toast.success("Invoice number issued");
      qc.invalidateQueries({ queryKey: ["finance.invoices"] });
    },
    onError: (e: unknown) => toast.error((e as Error).message),
  });

  const download = useMutation({
    mutationFn: (bookingId: string) => pdfFn({ data: { bookingId } }),
    onSuccess: ({ filename, base64 }) => {
      const bin = atob(base64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const blob = new Blob([bytes], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    },
    onError: (e: unknown) => toast.error((e as Error).message),
  });

  return (
    <div className="space-y-6">
      <PageHeader title="Invoice Manager" description="Issue, download and email guest invoices." />

      <SectionCard>
        <div className="flex flex-wrap gap-2">
          <Input placeholder="Search reference or invoice…" value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-md" />
          <select
            className="rounded-md border border-border bg-background px-3 py-2 text-sm"
            value={status}
            onChange={(e) => setStatus(e.target.value as never)}
          >
            <option value="all">All</option>
            <option value="issued">Issued</option>
            <option value="draft">Draft</option>
          </select>
        </div>
      </SectionCard>

      {isLoading ? (
        <LoadingState />
      ) : (
        <SectionCard>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="py-2">Invoice #</th>
                  <th>Reference</th>
                  <th>Guest</th>
                  <th>Check-in</th>
                  <th>Total</th>
                  <th>Payment</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {(rows ?? []).map((r) => (
                  <tr key={r.id} className="border-t border-border">
                    <td className="py-2 font-mono text-xs">{r.invoice_number ?? <Badge variant="outline">Draft</Badge>}</td>
                    <td className="font-mono text-xs">{r.reference}</td>
                    <td>{r.guest_name}</td>
                    <td>{r.check_in}</td>
                    <td>{r.currency} {Number(r.total).toFixed(2)}</td>
                    <td><Badge variant="secondary">{r.payment_status}</Badge></td>
                    <td className="whitespace-nowrap">
                      {!r.invoice_number && (
                        <Button size="sm" variant="ghost" disabled={finalize.isPending} onClick={() => finalize.mutate(r.id)}>
                          <FileText className="mr-1 h-3 w-3" /> Finalize
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" disabled={download.isPending} onClick={() => download.mutate(r.id)}>
                        <Download className="mr-1 h-3 w-3" /> PDF
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>
      )}
    </div>
  );
}
