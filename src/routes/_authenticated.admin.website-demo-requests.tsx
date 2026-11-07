import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { formatDistanceToNow } from "date-fns";
import { listStayNasDemoRequests, updateStayNasDemoRequest } from "@/domains/marketing/demo-requests.functions";

export const Route = createFileRoute("/_authenticated/admin/website-demo-requests")({
  head: () => ({ meta: [{ title: "StayNas Website Demo Requests" }, { name: "robots", content: "noindex,nofollow" }] }),
  component: WebsiteDemoRequestsPage,
});

const statuses = ["new", "contacted", "qualified", "converted", "closed"] as const;

function WebsiteDemoRequestsPage() {
  const listFn = useServerFn(listStayNasDemoRequests);
  const updateFn = useServerFn(updateStayNasDemoRequest);
  const queryClient = useQueryClient();
  const requests = useQuery({ queryKey: ["stayn​as.website-demo-requests"], queryFn: () => listFn() });
  const update = useMutation({
    mutationFn: (input: { id: string; status: string }) => updateFn({ data: input }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["stayn​as.website-demo-requests"] }),
  });

  return <div className="space-y-6 p-6">
    <div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Founder workspace</p><h1 className="mt-2 text-2xl font-semibold">StayNas website demo requests</h1><p className="mt-2 text-sm text-muted-foreground">Commercial enquiries submitted through staynas.com.</p></div>
    {requests.isLoading && <p className="text-sm text-muted-foreground">Loading requests…</p>}
    {requests.isError && <p role="alert" className="text-sm text-destructive">Could not load demo requests. Confirm the migration has been applied and founder access is active.</p>}
    {requests.data?.length === 0 && <div className="rounded-xl border p-6 text-sm text-muted-foreground">No demo requests have been received yet.</div>}
    {!!requests.data?.length && <div className="overflow-x-auto rounded-xl border bg-card"><table className="w-full min-w-[900px] text-sm"><thead className="border-b bg-muted/40 text-left text-xs uppercase text-muted-foreground"><tr><th className="p-3">Contact</th><th className="p-3">Business</th><th className="p-3">Interests</th><th className="p-3">Message</th><th className="p-3">Received</th><th className="p-3">Status</th></tr></thead><tbody>{requests.data.map((item: any)=><tr key={item.id} className="border-b align-top last:border-0"><td className="p-3"><p className="font-medium">{item.name}</p><a className="text-xs text-primary underline" href={"mailto:"+item.email}>{item.email}</a><p className="mt-1 text-xs text-muted-foreground">{item.phone || "No phone"} · {item.country || "Country not supplied"}</p></td><td className="p-3"><p className="font-medium">{item.company || "Not supplied"}</p><p className="mt-1 text-xs text-muted-foreground">{item.property_type} · {item.property_count_band} properties</p></td><td className="p-3 text-xs">{(item.interests ?? []).join(", ") || "Not specified"}</td><td className="max-w-xs whitespace-pre-wrap p-3 text-xs text-muted-foreground">{item.message || "—"}</td><td className="p-3 text-xs text-muted-foreground">{formatDistanceToNow(new Date(item.created_at), { addSuffix: true })}</td><td className="p-3"><select aria-label={"Status for "+item.name} className="rounded-md border bg-background px-2 py-1 text-xs" value={item.status} onChange={(event)=>update.mutate({id:item.id,status:event.target.value})}>{statuses.map((status)=><option key={status} value={status}>{status}</option>)}</select></td></tr>)}</tbody></table></div>}
  </div>;
}
