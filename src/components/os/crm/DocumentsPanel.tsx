import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listGuestDocuments } from "@/lib/guest-intelligence.functions";
import { FileText } from "lucide-react";

export function DocumentsPanel({ guestId }: { guestId: string }) {
  const fn = useServerFn(listGuestDocuments);
  const q = useQuery({
    queryKey: ["guest-documents", guestId],
    queryFn: () => fn({ data: { id: guestId } }),
  });
  const rows = ((q.data as any[]) ?? []);
  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
        <div className="flex items-center gap-2 font-medium text-foreground">
          <FileText className="size-4" /> Document vault (coming soon)
        </div>
        <p className="mt-1">
          Passport, visa, signed forms, and special permissions will live here. The database is ready — file uploads
          arrive in a future sprint.
        </p>
      </div>
      {rows.length > 0 && (
        <ul className="divide-y rounded-lg border bg-card">
          {rows.map((d: any) => (
            <li key={d.id} className="flex items-center gap-3 px-4 py-2 text-sm">
              <span className="w-32 text-xs uppercase tracking-wide text-muted-foreground">{d.kind}</span>
              <span className="flex-1">{d.label ?? "—"}</span>
              <span className="text-xs text-muted-foreground">{d.status}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}