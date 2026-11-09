import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Plus, Save, Megaphone, Eye, Send, Pause, Archive, Settings2 } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/os/PageHeader";
import { SectionCard } from "@/components/os/SectionCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  listMyBookingCampaigns,
  createMyBookingCampaign,
  saveMyBookingCampaignContent,
  listMyCampaignStudioResources,
  configureMyBookingCampaign,
  publishMyBookingCampaign,
  transitionMyBookingCampaign,
  previewMyBookingCampaign,
  getMyBookingCampaignAnalytics,
  updateMyBookingCampaignSchedule,
} from "@/domains/booking-campaigns/campaigns.functions";

export const Route = createFileRoute("/_authenticated/admin/distribution/campaigns")({
  head: () => ({ meta: [{ title: "Campaign Studio — StayNas" }, { name: "robots", content: "noindex,nofollow" }] }),
  component: CampaignStudioPage,
});

type Campaign = {
  id: string; slug: string; name: string;
  status: "draft" | "published" | "paused" | "expired" | "archived";
  starts_at: string | null; ends_at: string | null;
};
type StudioResources = {
  currency: string;
  timezone: string;
  rooms: Array<{ id: string; slug: string; name: string; max_occupancy: number }>;
  publications: Array<{ id: string; code: string; name: string; currency: string; publication_number: number; rate_plan_version: number; effective_from: string | null; effective_to: string | null }>;
};

function dateInPropertyTimezone(value: string | null, timezone: string) {
  if (!value) return "";
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone || "UTC", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date(value));
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function CampaignStudioPage() {
  const queryClient = useQueryClient();
  const listFn = useServerFn(listMyBookingCampaigns);
  const createFn = useServerFn(createMyBookingCampaign);
  const saveFn = useServerFn(saveMyBookingCampaignContent);
  const resourcesFn = useServerFn(listMyCampaignStudioResources);
  const configureFn = useServerFn(configureMyBookingCampaign);
  const publishFn = useServerFn(publishMyBookingCampaign);
  const transitionFn = useServerFn(transitionMyBookingCampaign);
  const previewFn = useServerFn(previewMyBookingCampaign);
  const analyticsFn = useServerFn(getMyBookingCampaignAnalytics);
  const scheduleFn = useServerFn(updateMyBookingCampaignSchedule);
  const analytics = useQuery({ queryKey: ["booking-campaign-analytics", "selected-property"], queryFn: () => analyticsFn() });
  const campaigns = useQuery({ queryKey: ["booking-campaigns", "selected-property"], queryFn: () => listFn() as Promise<Campaign[]> });
  const resources = useQuery({ queryKey: ["booking-campaign-resources", "selected-property"], queryFn: () => resourcesFn() as Promise<StudioResources> });
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [headline, setHeadline] = useState("");
  const [description, setDescription] = useState("");
  const [highlights, setHighlights] = useState("");
  const [subheadline, setSubheadline] = useState("");
  const [inclusionsText, setInclusionsText] = useState("");
  const [termsText, setTermsText] = useState("");
  const [faqsText, setFaqsText] = useState("");
  const [ctaLabel, setCtaLabel] = useState("Book this offer");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [contactWhatsApp, setContactWhatsApp] = useState("");
  const [seoTitle, setSeoTitle] = useState("");
  const [seoDescription, setSeoDescription] = useState("");
  const [seoImageUrl, setSeoImageUrl] = useState("");
  const [socialTitle, setSocialTitle] = useState("");
  const [socialDescription, setSocialDescription] = useState("");
  const [socialImageUrl, setSocialImageUrl] = useState("");
  const [roomIds, setRoomIds] = useState<string[]>([]);
  const [publicationId, setPublicationId] = useState("");
  const [offerCode, setOfferCode] = useState("resident-rate");
  const [offerTitle, setOfferTitle] = useState("Resident Rate");
  const [offerDescription, setOfferDescription] = useState("");
  const [startsAtDate, setStartsAtDate] = useState("");
  const [endsAtDate, setEndsAtDate] = useState("");
  const [preview, setPreview] = useState<{
    campaign: { name: string; slug: string };
    content: { version: number; status: string; content: { headline?: string; description?: string; highlights?: string[]; inclusions?: string[]; terms?: string[]; faqs?: Array<{ question: string; answer: string }> } } | null;
    rooms: Array<{ room_id: string; rooms?: { name?: string } }>;
    offers: Array<{ id: string; title: string; description?: string }>;
  } | null>(null);
  const selected = campaigns.data?.find((item) => item.id === selectedId);

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ["booking-campaigns"] });
    await queryClient.invalidateQueries({ queryKey: ["booking-campaign-resources"] });
    await queryClient.invalidateQueries({ queryKey: ["booking-campaign-analytics"] });
  };
  const createCampaign = useMutation({
    mutationFn: () => createFn({ data: {
      name, slug,
      startsOn: startsAtDate || null,
      endsOn: endsAtDate || null,
    } }),
    onSuccess: async (created) => {
      setName(""); setSlug(""); setSelectedId(created.id); setHeadline(created.name);
      setPreview(null); await refresh(); toast.success("Campaign draft created.");
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const saveContent = useMutation({
    mutationFn: () => {
      if (!selectedId) throw new Error("Select a campaign first.");
      return saveFn({ data: { campaignId: selectedId, content: {
        headline, subheadline, description,
        highlights: highlights.split("\n").map((item) => item.trim()).filter(Boolean),
        inclusions: inclusionsText.split("\n").map((item) => item.trim()).filter(Boolean),
        terms: termsText.split("\n").map((item) => item.trim()).filter(Boolean),
        faqs: faqsText.split("\n").map((line) => {
          const [question, ...answerParts] = line.split("|");
          return { question: question?.trim() ?? "", answer: answerParts.join("|").trim() };
        }).filter((item) => item.question && item.answer),
        ctaLabel,
        contact: { email: contactEmail || undefined, phone: contactPhone || undefined, whatsapp: contactWhatsApp || undefined },
        seo: { title: seoTitle, description: seoDescription, imageUrl: seoImageUrl || undefined },
        social: { title: socialTitle, description: socialDescription, imageUrl: socialImageUrl || undefined },
      } } });
    },
    onSuccess: () => { setPreview(null); toast.success("Draft content version saved."); },
    onError: (error: Error) => toast.error(error.message),
  });
  const configure = useMutation({
    mutationFn: () => {
      if (!selectedId || !publicationId || roomIds.length === 0) throw new Error("Select rooms and a published rate plan.");
      return configureFn({ data: { campaignId: selectedId, roomIds, publicationId, offerCode, offerTitle, offerDescription } });
    },
    onSuccess: () => { toast.success("Rooms and published rate offer configured."); setPreview(null); },
    onError: (error: Error) => toast.error(error.message),
  });

  const saveSchedule = useMutation({
    mutationFn: () => scheduleFn({ data: {
      campaignId: selectedId,
      startsOn: startsAtDate || null,
      endsOn: endsAtDate || null,
    } }),
    onSuccess: async () => { await refresh(); toast.success("Campaign schedule saved."); },
    onError: (error: Error) => toast.error(error.message),
  });
  const publish = useMutation({
    mutationFn: () => publishFn({ data: { campaignId: selectedId } }),
    onSuccess: async () => { await refresh(); toast.success("Campaign published."); },
    onError: (error: Error) => toast.error(error.message),
  });
  const transition = useMutation({
    mutationFn: (action: "pause" | "expire" | "archive") => transitionFn({ data: { campaignId: selectedId, action } }),
    onSuccess: async (result) => { await refresh(); toast.success(`Campaign ${result.status}.`); },
    onError: (error: Error) => toast.error(error.message),
  });
  const loadPreview = useMutation({
    mutationFn: () => previewFn({ data: { campaignId: selectedId } }),
    onSuccess: (result) => setPreview(result),
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <div className="space-y-6">
      <PageHeader title="Campaign Studio" description="Build property-scoped campaign pages. Offers reference published Pricing Engine snapshots; campaign pages never own prices." />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <SectionCard title="Campaigns" description="Drafts and live campaigns for the currently selected property.">
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5"><Label htmlFor="campaign-name">Campaign name</Label><Input id="campaign-name" value={name} onChange={(event) => setName(event.target.value)} placeholder="East Africa Resident Escape" /></div>
              <div className="space-y-1.5"><Label htmlFor="campaign-slug">Route slug</Label><Input id="campaign-slug" value={slug} onChange={(event) => setSlug(event.target.value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""))} placeholder="resident-escape" /></div>
              <div className="space-y-1.5"><Label htmlFor="new-campaign-start">Starts on (optional)</Label><Input id="new-campaign-start" type="date" value={startsAtDate} onChange={(event) => setStartsAtDate(event.target.value)} /></div>
              <div className="space-y-1.5"><Label htmlFor="new-campaign-end">Ends on (optional)</Label><Input id="new-campaign-end" type="date" min={startsAtDate || undefined} value={endsAtDate} onChange={(event) => setEndsAtDate(event.target.value)} /></div>
            </div>
            <Button onClick={() => createCampaign.mutate()} disabled={createCampaign.isPending || name.trim().length < 2 || slug.trim().length < 2}><Plus className="mr-2 h-4 w-4" /> Create draft</Button>
            <div className="space-y-2 border-t pt-4">
              {campaigns.isLoading && <p className="text-sm text-muted-foreground">Loading campaigns…</p>}
              {campaigns.isError && <p className="text-sm text-destructive">Campaigns could not be loaded.</p>}
              {!campaigns.isLoading && !campaigns.data?.length && <p className="text-sm text-muted-foreground">No campaigns have been created for this property.</p>}
              {campaigns.data?.map((campaign) => <button key={campaign.id} type="button" onClick={() => { setSelectedId(campaign.id); setHeadline(campaign.name); setDescription(""); setHighlights(""); setSubheadline(""); setInclusionsText(""); setTermsText(""); setFaqsText(""); setStartsAtDate(dateInPropertyTimezone(campaign.starts_at, resources.data?.timezone ?? "UTC")); setEndsAtDate(dateInPropertyTimezone(campaign.ends_at, resources.data?.timezone ?? "UTC")); setPreview(null); }} className={`flex w-full items-center justify-between gap-3 rounded-lg border p-3 text-left ${selectedId === campaign.id ? "border-primary bg-primary/5" : "hover:bg-muted/50"}`}>
                <span className="min-w-0"><span className="block truncate text-sm font-medium">{campaign.name}</span><span className="block truncate text-xs text-muted-foreground">/{campaign.slug}</span></span>
                <Badge variant={campaign.status === "published" ? "default" : "secondary"}>{campaign.status}</Badge>
              </button>)}
            </div>
          </div>
        </SectionCard>

        <SectionCard title="Campaign page content" description="Saving creates a versioned draft. Publication is a separate server-validated action.">
          {selected ? <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2"><div><p className="font-medium">{selected.name}</p><p className="text-xs text-muted-foreground">/{selected.slug}</p></div><Badge variant="outline">{selected.status}</Badge></div>
            <div className="space-y-1.5"><Label htmlFor="campaign-headline">Hero headline</Label><Input id="campaign-headline" value={headline} onChange={(event) => setHeadline(event.target.value)} maxLength={160} /></div>
            <div className="space-y-1.5"><Label htmlFor="campaign-description">Description</Label><Textarea id="campaign-description" value={description} onChange={(event) => setDescription(event.target.value)} rows={4} maxLength={5000} /></div>
            <div className="space-y-1.5"><Label htmlFor="campaign-highlights">Highlights (one per line)</Label><Textarea id="campaign-highlights" value={highlights} onChange={(event) => setHighlights(event.target.value)} rows={3} /></div>
            <div className="space-y-1.5"><Label htmlFor="campaign-subheadline">Hero subheadline</Label><Input id="campaign-subheadline" value={subheadline} onChange={(event) => setSubheadline(event.target.value)} maxLength={240} /></div>
            <div className="space-y-1.5"><Label htmlFor="campaign-inclusions">Inclusions (one per line)</Label><Textarea id="campaign-inclusions" value={inclusionsText} onChange={(event) => setInclusionsText(event.target.value)} rows={3} /></div>
            <div className="space-y-1.5"><Label htmlFor="campaign-terms">Terms and conditions (one per line)</Label><Textarea id="campaign-terms" value={termsText} onChange={(event) => setTermsText(event.target.value)} rows={3} /></div>
            <div className="space-y-1.5"><Label htmlFor="campaign-faqs">FAQs (one per line: question | answer)</Label><Textarea id="campaign-faqs" value={faqsText} onChange={(event) => setFaqsText(event.target.value)} rows={4} placeholder="Is breakfast included? | Yes, breakfast is included." /></div>
            <div className="space-y-1.5"><Label htmlFor="campaign-cta">Booking CTA label</Label><Input id="campaign-cta" value={ctaLabel} onChange={(event) => setCtaLabel(event.target.value)} maxLength={60} /></div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1.5"><Label htmlFor="campaign-email">Contact email</Label><Input id="campaign-email" type="email" value={contactEmail} onChange={(event) => setContactEmail(event.target.value)} /></div>
              <div className="space-y-1.5"><Label htmlFor="campaign-phone">Contact phone</Label><Input id="campaign-phone" value={contactPhone} onChange={(event) => setContactPhone(event.target.value)} /></div>
              <div className="space-y-1.5"><Label htmlFor="campaign-whatsapp">WhatsApp</Label><Input id="campaign-whatsapp" value={contactWhatsApp} onChange={(event) => setContactWhatsApp(event.target.value)} /></div>
            </div>
            <div className="border-t pt-3"><p className="mb-2 text-sm font-medium">SEO metadata</p>
              <div className="space-y-1.5"><Label htmlFor="campaign-seo-title">SEO title</Label><Input id="campaign-seo-title" value={seoTitle} onChange={(event) => setSeoTitle(event.target.value)} maxLength={160} /></div>
              <div className="mt-2 space-y-1.5"><Label htmlFor="campaign-seo-description">SEO description</Label><Textarea id="campaign-seo-description" value={seoDescription} onChange={(event) => setSeoDescription(event.target.value)} rows={2} maxLength={320} /></div>
              <div className="mt-2 space-y-1.5"><Label htmlFor="campaign-seo-image">SEO image URL</Label><Input id="campaign-seo-image" type="url" value={seoImageUrl} onChange={(event) => setSeoImageUrl(event.target.value)} /></div>
            </div>
            <div className="border-t pt-3"><p className="mb-2 text-sm font-medium">Social sharing metadata</p>
              <div className="space-y-1.5"><Label htmlFor="campaign-social-title">Social title</Label><Input id="campaign-social-title" value={socialTitle} onChange={(event) => setSocialTitle(event.target.value)} maxLength={160} /></div>
              <div className="mt-2 space-y-1.5"><Label htmlFor="campaign-social-description">Social description</Label><Textarea id="campaign-social-description" value={socialDescription} onChange={(event) => setSocialDescription(event.target.value)} rows={2} maxLength={320} /></div>
              <div className="mt-2 space-y-1.5"><Label htmlFor="campaign-social-image">Social image URL</Label><Input id="campaign-social-image" type="url" value={socialImageUrl} onChange={(event) => setSocialImageUrl(event.target.value)} /></div>
            </div>
            <Button onClick={() => saveContent.mutate()} disabled={saveContent.isPending || headline.trim().length < 2}><Save className="mr-2 h-4 w-4" /> Save content draft</Button>
            <div className="border-t pt-4"><div className="mb-3 flex items-center gap-2 font-medium"><Settings2 className="h-4 w-4" /> Campaign schedule</div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5"><Label htmlFor="campaign-start">Starts on</Label><Input id="campaign-start" type="date" value={startsAtDate} onChange={(event) => setStartsAtDate(event.target.value)} disabled={selected.status === "published" || selected.status === "archived"} /></div>
                <div className="space-y-1.5"><Label htmlFor="campaign-end">Ends on</Label><Input id="campaign-end" type="date" min={startsAtDate || undefined} value={endsAtDate} onChange={(event) => setEndsAtDate(event.target.value)} disabled={selected.status === "published" || selected.status === "archived"} /></div>
              </div>
              <Button className="mt-3" variant="outline" onClick={() => saveSchedule.mutate()} disabled={saveSchedule.isPending || selected.status === "published" || selected.status === "archived"}>Save schedule</Button>
            </div>
            <div className="border-t pt-4"><div className="mb-3 flex items-center gap-2 font-medium"><Settings2 className="h-4 w-4" /> Booking offer configuration</div>
              {resources.isError && <p className="text-sm text-destructive">Property booking resources could not be loaded.</p>}
              <p className="mb-3 text-xs text-muted-foreground">Property currency: {resources.data?.currency ?? "Not configured"} · timezone: {resources.data?.timezone ?? "Not configured"}. Schedule dates use the property's timezone. Only active rooms and current published rate snapshots in this currency are selectable.</p>
              <div className="space-y-2">
                <Label>Included room types</Label>
                {resources.data?.rooms.map((room) => <label key={room.id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={roomIds.includes(room.id)} onChange={(event) => setRoomIds((current) => event.target.checked ? [...current, room.id] : current.filter((id) => id !== room.id))} />{room.name} <span className="text-xs text-muted-foreground">· max {room.max_occupancy}</span></label>)}
                {!resources.isLoading && !resources.data?.rooms.length && <p className="text-xs text-muted-foreground">No active rooms available.</p>}
              </div>
              <div className="mt-3 space-y-1.5"><Label htmlFor="campaign-publication">Published rate plan snapshot</Label><select id="campaign-publication" value={publicationId} onChange={(event) => setPublicationId(event.target.value)} className="h-10 w-full rounded-md border bg-background px-3 text-sm"><option value="">Select published rate snapshot</option>{resources.data?.publications.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.code} · v{item.rate_plan_version} / pub {item.publication_number} · {item.currency}</option>)}</select></div>
              <div className="mt-3 grid gap-3 sm:grid-cols-2"><div className="space-y-1.5"><Label htmlFor="offer-code">Offer code</Label><Input id="offer-code" value={offerCode} onChange={(event) => setOfferCode(event.target.value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""))} /></div><div className="space-y-1.5"><Label htmlFor="offer-title">Offer title</Label><Input id="offer-title" value={offerTitle} onChange={(event) => setOfferTitle(event.target.value)} /></div></div>
              <div className="mt-3 space-y-1.5"><Label htmlFor="offer-description">Offer description</Label><Textarea id="offer-description" value={offerDescription} onChange={(event) => setOfferDescription(event.target.value)} rows={2} /></div>
              <Button variant="outline" onClick={() => configure.mutate()} disabled={configure.isPending || !publicationId || roomIds.length === 0}><Settings2 className="mr-2 h-4 w-4" /> Save room and offer configuration</Button>
            </div>
            <div className="flex flex-wrap gap-2 border-t pt-4">
              <Button variant="outline" onClick={() => loadPreview.mutate()} disabled={loadPreview.isPending}><Eye className="mr-2 h-4 w-4" /> Preview</Button>
              {selected.status !== "published" && selected.status !== "archived" && <Button onClick={() => publish.mutate()} disabled={publish.isPending}><Send className="mr-2 h-4 w-4" /> Publish campaign</Button>}
              {selected.status === "published" && selected.ends_at && Date.parse(selected.ends_at) <= Date.now()
                ? <Button variant="outline" onClick={() => transition.mutate("expire")} disabled={transition.isPending}>Mark expired</Button>
                : selected.status === "published" && <Button variant="outline" onClick={() => transition.mutate("pause")} disabled={transition.isPending}><Pause className="mr-2 h-4 w-4" /> Pause</Button>}
              {["draft","paused","expired"].includes(selected.status) && <Button variant="outline" onClick={() => transition.mutate("archive")} disabled={transition.isPending}><Archive className="mr-2 h-4 w-4" /> Archive</Button>}
            </div>
            {preview !== null && <section className="rounded-xl border bg-muted/30 p-4">
              <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Draft preview · version {preview.content?.version ?? "not saved"}</div>
              <h3 className="mt-2 text-xl font-semibold">{preview.content?.content?.headline || preview.campaign.name}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{preview.content?.content?.description || "No description has been saved yet."}</p>
              {!!preview.content?.content?.highlights?.length && <ul className="mt-3 list-disc space-y-1 pl-5 text-sm">{preview.content.content.highlights.map((item, index) => <li key={index}>{item}</li>)}</ul>}
              {!!preview.content?.content?.inclusions?.length && <div className="mt-3"><p className="text-xs font-semibold uppercase text-muted-foreground">Inclusions</p><ul className="mt-1 list-disc pl-5 text-sm">{preview.content.content.inclusions.map((item,index)=><li key={index}>{item}</li>)}</ul></div>}
              {!!preview.content?.content?.terms?.length && <div className="mt-3"><p className="text-xs font-semibold uppercase text-muted-foreground">Terms</p><ul className="mt-1 list-disc pl-5 text-sm">{preview.content.content.terms.map((item,index)=><li key={index}>{item}</li>)}</ul></div>}
              {!!preview.content?.content?.faqs?.length && <div className="mt-3 space-y-2">{preview.content.content.faqs.map((faq,index)=><div key={index} className="rounded-lg border bg-background p-3 text-sm"><p className="font-medium">{faq.question}</p><p className="mt-1 text-muted-foreground">{faq.answer}</p></div>)}</div>}
              <div className="mt-4 grid gap-2 sm:grid-cols-2">{preview.rooms.map((room) => <div key={room.room_id} className="rounded-lg border bg-background p-3 text-sm">{room.rooms?.name || "Selected room"}</div>)}</div>
              <div className="mt-3 space-y-1">{preview.offers.map((item) => <div key={item.id} className="rounded-lg border bg-background p-3 text-sm"><span className="font-medium">{item.title}</span>{item.description && <span className="ml-2 text-muted-foreground">{item.description}</span>}</div>)}</div>
            </section>}
          </div> : <div className="flex min-h-64 flex-col items-center justify-center gap-3 rounded-lg border border-dashed p-6 text-center"><Megaphone className="h-8 w-8 text-muted-foreground" /><p className="text-sm text-muted-foreground">Create or select a campaign to edit its content, configure offers and manage its lifecycle.</p></div>}
        </SectionCard>
      </div>
      <SectionCard title="Campaign performance" description="First-party attribution evidence · rolling 30-day window">
        {analytics.isLoading && <p className="text-sm text-muted-foreground">Loading campaign performance…</p>}
        {analytics.isError && <p className="text-sm text-destructive">Campaign performance is unavailable. Confirm campaign analytics entitlement and attribution access.</p>}
        {analytics.data && <div className="space-y-3">
          {!analytics.data.advancedAnalyticsEnabled && <p className="text-xs text-muted-foreground">Advanced source breakdown is not enabled. Core campaign funnel metrics remain available.</p>}
          {analytics.data.campaigns.length === 0 && <p className="text-sm text-muted-foreground">No campaigns or attribution events have been recorded for this property.</p>}
          {analytics.data.campaigns.map((item) => <div key={item.campaignId} className="rounded-xl border p-3">
            <div className="flex flex-wrap items-center justify-between gap-2"><div><p className="font-medium">{item.name}</p><p className="text-xs text-muted-foreground">/{item.slug} · {item.status}</p></div><Badge variant="outline">{item.completedBookings} bookings</Badge></div>
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div><p className="text-xs text-muted-foreground">Page views</p><p className="text-lg font-semibold tabular-nums">{item.pageViews}</p></div>
              <div><p className="text-xs text-muted-foreground">Booking clicks</p><p className="text-lg font-semibold tabular-nums">{item.bookingClicks}</p></div>
              <div><p className="text-xs text-muted-foreground">Booking starts</p><p className="text-lg font-semibold tabular-nums">{item.bookingStarts}</p></div>
              <div><p className="text-xs text-muted-foreground">Conversion</p><p className="text-lg font-semibold tabular-nums">{(item.bookingConversionRate * 100).toFixed(1)}%</p></div>
            </div>
            {item.sources?.length > 0 && <p className="mt-2 text-xs text-muted-foreground">Top sources: {item.sources.map((source) => `${source.source} (${source.count})`).join(" · ")}</p>}
          </div>)}
        </div>}
      </SectionCard>
      <p className="text-xs text-muted-foreground">Publishing requires a valid commercial entitlement, a configured active-campaign quota, published content, active selected rooms and a published rate snapshot matching the property's currency. The permanent /book journey is not changed by campaign editing.</p>
    </div>
  );
}
