import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getGuestSummary, getGuestTimeline } from "@/lib/guests.functions";
import { PageHeader } from "@/components/os/PageHeader";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { GuestStatusChip } from "@/components/os/crm/GuestStatusChip";
import { TagsPanel } from "@/components/os/crm/TagsPanel";
import { NotesPanel } from "@/components/os/crm/NotesPanel";
import { ReservationList } from "@/components/os/crm/ReservationList";
import { CommunicationHistory } from "@/components/os/crm/CommunicationHistory";
import { Timeline } from "@/components/os/crm/Timeline";
import { PreferencesPanel } from "@/components/os/crm/PreferencesPanel";
import { ExperiencesList } from "@/components/os/crm/ExperiencesList";
import { PaymentsPanel } from "@/components/os/crm/PaymentsPanel";
import { DocumentsPanel } from "@/components/os/crm/DocumentsPanel";
import { RelationshipStats } from "@/components/os/crm/RelationshipStats";
import { QuickActions } from "@/components/os/crm/QuickActions";
import { ArrowLeft, Mail, Phone, Globe, Languages, Cake, Heart } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/guests/crm/$id")({
  head: () => ({
    meta: [{ title: "Guest profile — Mtoni OS" }, { name: "robots", content: "noindex,nofollow" }],
  }),
  component: GuestProfilePage,
});

function initials(name?: string | null) {
  if (!name) return "?";
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

function GuestProfilePage() {
  const { id } = Route.useParams();
  const summaryFn = useServerFn(getGuestSummary);
  const timelineFn = useServerFn(getGuestTimeline);

  const summaryQ = useQuery({
    queryKey: ["guest-summary", id],
    queryFn: () => summaryFn({ data: { id } }),
  });
  const timelineQ = useQuery({
    queryKey: ["guest-timeline", id],
    queryFn: () => timelineFn({ data: { id } }),
  });

  if (summaryQ.isLoading) {
    return <div className="p-8 text-sm text-muted-foreground">Loading guest…</div>;
  }
  if (summaryQ.isError) {
    return (
      <div className="space-y-4 p-6">
        <Button asChild variant="ghost" size="sm">
          <Link to="/admin/guests/crm"><ArrowLeft className="mr-2 size-4" /> Back to directory</Link>
        </Button>
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-6 text-sm text-destructive">
          {(summaryQ.error as Error)?.message ?? "Failed to load guest."}
        </div>
      </div>
    );
  }

  const data = summaryQ.data as any;
  const g = data.guest;
  const stats = data.stats ?? { total_stays: 0, total_nights: 0, lifetime_spend: 0, first_stay: null, last_stay: null };

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link to="/admin/guests/crm"><ArrowLeft className="mr-2 size-4" /> Directory</Link>
      </Button>

      <PageHeader
        title={g.full_name}
        description={g.email ?? ""}
        actions={<GuestStatusChip status={g.status} />}
      />

      <QuickActions guestId={id} guest={g} />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-4">
          <div className="rounded-lg border bg-card p-5">
            <div className="flex items-start gap-4">
              <Avatar className="size-14">
                <AvatarFallback>{initials(g.full_name)}</AvatarFallback>
              </Avatar>
              <div className="grid flex-1 gap-1 text-sm">
                {g.email && (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Mail className="size-3.5" /> <span>{g.email}</span>
                  </div>
                )}
                {g.phone_e164 && (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Phone className="size-3.5" /> <span>{g.phone_e164}</span>
                  </div>
                )}
                {g.country && (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Globe className="size-3.5" /> <span>{g.country}</span>
                  </div>
                )}
                {g.preferred_language && (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Languages className="size-3.5" /> <span>{g.preferred_language}</span>
                  </div>
                )}
                {g.birthday && (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Cake className="size-3.5" /> <span>Birthday {new Date(g.birthday).toLocaleDateString()}</span>
                  </div>
                )}
                {g.anniversary && (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Heart className="size-3.5" /> <span>Anniversary {new Date(g.anniversary).toLocaleDateString()}</span>
                  </div>
                )}
                {g.ai_summary && (
                  <p className="mt-2 text-xs italic text-muted-foreground">{g.ai_summary}</p>
                )}
              </div>
            </div>
            <div className="mt-4">
              <TagsPanel guestId={id} tags={data.tags} />
            </div>
          </div>

          <Tabs defaultValue="reservations">
            <TabsList className="flex-wrap">
              <TabsTrigger value="reservations">Reservations</TabsTrigger>
              <TabsTrigger value="experiences">Experiences</TabsTrigger>
              <TabsTrigger value="payments">Payments</TabsTrigger>
              <TabsTrigger value="notes">Notes</TabsTrigger>
              <TabsTrigger value="preferences">Preferences</TabsTrigger>
              <TabsTrigger value="communications">Communications</TabsTrigger>
              <TabsTrigger value="reviews">Reviews</TabsTrigger>
              <TabsTrigger value="documents">Documents</TabsTrigger>
              <TabsTrigger value="timeline">Timeline</TabsTrigger>
            </TabsList>
            <TabsContent value="reservations" className="pt-4">
              <ReservationList bookings={data.bookings} />
            </TabsContent>
            <TabsContent value="experiences" className="pt-4">
              <ExperiencesList guestId={id} />
            </TabsContent>
            <TabsContent value="payments" className="pt-4">
              <PaymentsPanel guestId={id} />
            </TabsContent>
            <TabsContent value="notes" className="pt-4">
              <NotesPanel guestId={id} notes={data.notes} />
            </TabsContent>
            <TabsContent value="preferences" className="pt-4">
              <PreferencesPanel guestId={id} />
            </TabsContent>
            <TabsContent value="communications" className="pt-4">
              <CommunicationHistory guestId={id} items={data.communications} />
            </TabsContent>
            <TabsContent value="reviews" className="pt-4">
              {data.reviews.length === 0 ? (
                <p className="text-sm text-muted-foreground">No reviews from this guest.</p>
              ) : (
                <ul className="space-y-3">
                  {data.reviews.map((r: any) => (
                    <li key={r.id} className="rounded-lg border bg-card p-4">
                      <div className="flex items-center justify-between text-xs uppercase tracking-wide text-muted-foreground">
                        <span>{r.source} · {r.rating}★</span>
                        <span>{r.submitted_at ? new Date(r.submitted_at).toLocaleDateString() : ""}</span>
                      </div>
                      {r.title && <div className="mt-1 font-medium">{r.title}</div>}
                      {r.body && <div className="mt-1 text-sm text-muted-foreground">{r.body}</div>}
                      {r.source_url && (
                        <a href={r.source_url} target="_blank" rel="noreferrer" className="mt-2 inline-block text-xs text-primary hover:underline">
                          View original
                        </a>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </TabsContent>
            <TabsContent value="documents" className="pt-4">
              <DocumentsPanel guestId={id} />
            </TabsContent>
            <TabsContent value="timeline" className="pt-4">
              {timelineQ.isLoading ? (
                <p className="text-sm text-muted-foreground">Loading timeline…</p>
              ) : (
                <Timeline entries={(timelineQ.data as any) ?? []} />
              )}
            </TabsContent>
          </Tabs>
        </div>

        <aside className="space-y-3">
          <div className="rounded-lg border bg-card p-4">
            <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Lifetime</h3>
            <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
              <div><dt className="text-muted-foreground">Total stays</dt><dd className="text-lg font-medium">{stats.total_stays}</dd></div>
              <div><dt className="text-muted-foreground">Nights</dt><dd className="text-lg font-medium">{stats.total_nights}</dd></div>
              <div className="col-span-2"><dt className="text-muted-foreground">Lifetime spend</dt><dd className="text-lg font-medium">${Number(stats.lifetime_spend).toLocaleString()}</dd></div>
              <div><dt className="text-muted-foreground">First stay</dt><dd>{stats.first_stay ? new Date(stats.first_stay).toLocaleDateString() : "—"}</dd></div>
              <div><dt className="text-muted-foreground">Last stay</dt><dd>{stats.last_stay ? new Date(stats.last_stay).toLocaleDateString() : "—"}</dd></div>
            </dl>
          </div>
          <RelationshipStats guestId={id} />
          <div className="rounded-lg border bg-card p-4 text-sm">
            <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Preferences</h3>
            <p className="mt-2 text-muted-foreground">Contact: {g.communication_preference}</p>
            <p className="mt-1 text-muted-foreground">
              Marketing consent: {g.marketing_consent ? "Yes" : "No"}
            </p>
            {g.internal_notes && (
              <p className="mt-2 whitespace-pre-wrap text-muted-foreground">{g.internal_notes}</p>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}