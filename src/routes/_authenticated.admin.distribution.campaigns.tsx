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
  rooms: Array<{ id: string; slug: string; name: string; max_occupancy: number }>;
  publications: Array<{ id: string; code: string; name: string; currency: string; publication_number: number; rate_plan_version: number; effective_from: string | null; effective_to: string | null }>;
};

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
  const campaigns = useQuery({ queryKey: ["booking-campaigns", "selected-property"], queryFn: () => listFn() as Promise<Campaign[]> });
  const resources = useQuery({ queryKey: ["booking-campaign-resources", "selected-property"], queryFn: () => resourcesFn() as Promise<StudioResources> });
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [headline, setHeadline] = useState("");
  const [description, setDescription] = useState("");
  const [highlights, setHighlights] = useState("");
  const [roomIds, setRoomIds] = useState<string[]>([]);
  const [publicationId, setPublicationId] = useState("");
  const [offerCode, setOfferCode] = useState("resident-rate");
  const [offerTitle, setOfferTitle] = useState("Resident Rate");
  const [offerDescription, setOfferDescription] = useState("");
  const [preview, setPreview] = useState<unknown>(null);
  const selected = campaigns.data?.find((item) => item.id === selectedId);

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ["booking-campaigns"] });
    await queryClient.invalidateQueries({ queryKey: ["booking-campaign-resources"] });
  };
  const createCampaign = useMutation({
    mutationFn: () => createFn({ data: { name, slug } }),
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
        headline, subheadline: "", description,
        highlights: highlights.split("\n").map((item) => item.trim()).filter(Boolean),
        inclusions: [], terms: [], faqs: [], ctaLabel: "Book this offer",
        contact: {}, seo: { title: headline, description },
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
            </div>
            <Button onClick={() => createCampaign.mutate()} disabled={createCampaign.isPending || name.trim().length < 2 || slug.trim().length < 2}><Plus className="mr-2 h-4 w-4" /> Create draft</Button>
            <div className="space-y-2 border-t pt-4">
              {campaigns.isLoading && <p className="text-sm text-muted-foreground">Loading campaigns…</p>}
              {campaigns.isError && <p className="text-sm text-destructive">Campaigns could not be loaded.</p>}
              {!campaigns.isLoading && !campaigns.data?.length && <p className="text-sm text-muted-foreground">No campaigns have been created for this property.</p>}
              {campaigns.data?.map((campaign) => <button key={campaign.id} type="button" onClick={() => { setSelectedId(campaign.id); setHeadline(campaign.name); setDescription(""); setHighlights(""); setPreview(null); }} className={`flex w-full items-center justify-between gap-3 rounded-lg border p-3 text-left ${selectedId === campaign.id ? "border-primary bg-primary/5" : "hover:bg-muted/50"}`}>
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
            <Button onClick={() => saveContent.mutate()} disabled={saveContent.isPending || headline.trim().length < 2}><Save className="mr-2 h-4 w-4" /> Save content draft</Button>
            <div className="border-t pt-4"><div className="mb-3 flex items-center gap-2 font-medium"><Settings2 className="h-4 w-4" /> Booking offer configuration</div>
              {resources.isError && <p className="text-sm text-destructive">Property booking resources could not be loaded.</p>}
              <p className="mb-3 text-xs text-muted-foreground">Property currency: {resources.data?.currency ?? "Not configured"}. Only active rooms and current published rate snapshots in this currency are selectable.</p>
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
              {selected.status === "published" && <Button variant="outline" onClick={() => transition.mutate("pause")} disabled={transition.isPending}><Pause className="mr-2 h-4 w-4" /> Pause</Button>}
              {["draft","paused","expired"].includes(selected.status) && <Button variant="outline" onClick={() => transition.mutate("archive")} disabled={transition.isPending}><Archive className="mr-2 h-4 w-4" /> Archive</Button>}
            </div>
            {preview !== null && <pre className="max-h-72 overflow-auto rounded-lg bg-muted p-3 text-xs">{JSON.stringify(preview, null, 2)}</pre>}
          </div> : <div className="flex min-h-64 flex-col items-center justify-center gap-3 rounded-lg border border-dashed p-6 text-center"><Megaphone className="h-8 w-8 text-muted-foreground" /><p className="text-sm text-muted-foreground">Create or select a campaign to edit its content, configure offers and manage its lifecycle.</p></div>}
        </SectionCard>
      </div>
      <p className="text-xs text-muted-foreground">Publishing requires a valid commercial entitlement, a configured active-campaign quota, published content, active selected rooms and a published rate snapshot matching the property's currency. The permanent /book journey is not changed by campaign editing.</p>
    </div>
  );
}
