import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Plus, Save, Megaphone, ExternalLink } from "lucide-react";
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
} from "@/domains/booking-campaigns/campaigns.functions";

export const Route = createFileRoute("/_authenticated/admin/distribution/campaigns")({
  head: () => ({ meta: [{ title: "Campaign Studio — StayNas" }, { name: "robots", content: "noindex,nofollow" }] }),
  component: CampaignStudioPage,
});

type Campaign = {
  id: string;
  slug: string;
  name: string;
  status: "draft" | "published" | "paused" | "expired" | "archived";
  starts_at: string | null;
  ends_at: string | null;
};

function CampaignStudioPage() {
  const queryClient = useQueryClient();
  const listFn = useServerFn(listMyBookingCampaigns);
  const createFn = useServerFn(createMyBookingCampaign);
  const saveFn = useServerFn(saveMyBookingCampaignContent);
  const campaigns = useQuery({
    queryKey: ["booking-campaigns", "selected-property"],
    queryFn: () => listFn() as Promise<Campaign[]>,
  });
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [headline, setHeadline] = useState("");
  const [description, setDescription] = useState("");
  const [highlights, setHighlights] = useState("");
  const selected = campaigns.data?.find((item) => item.id === selectedId);

  const createCampaign = useMutation({
    mutationFn: () => createFn({ data: { name, slug } }),
    onSuccess: async (created) => {
      setName("");
      setSlug("");
      setSelectedId(created.id);
      setHeadline(created.name);
      await queryClient.invalidateQueries({ queryKey: ["booking-campaigns"] });
      toast.success("Campaign draft created.");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const saveContent = useMutation({
    mutationFn: () => {
      if (!selectedId) throw new Error("Select a campaign first.");
      return saveFn({
        data: {
          campaignId: selectedId,
          content: {
            headline,
            subheadline: "",
            description,
            highlights: highlights.split("\n").map((item) => item.trim()).filter(Boolean),
            inclusions: [],
            terms: [],
            faqs: [],
            ctaLabel: "Book this offer",
            contact: {},
            seo: { title: headline, description },
          },
        },
      });
    },
    onSuccess: () => toast.success("A new draft content version has been saved."),
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Campaign Studio"
        description="Create property-scoped campaign pages. Campaign prices and availability remain controlled by the StayNas Pricing Engine."
      />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <SectionCard title="Campaigns" description="Drafts and published campaigns for the selected property.">
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="campaign-name">Campaign name</Label>
                <Input id="campaign-name" value={name} onChange={(event) => setName(event.target.value)} placeholder="East Africa Resident Escape" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="campaign-slug">Public route slug</Label>
                <Input id="campaign-slug" value={slug} onChange={(event) => setSlug(event.target.value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""))} placeholder="escape-to-property" />
              </div>
            </div>
            <Button onClick={() => createCampaign.mutate()} disabled={createCampaign.isPending || name.trim().length < 2 || slug.trim().length < 2}>
              <Plus className="mr-2 h-4 w-4" /> Create draft
            </Button>
            <div className="space-y-2 border-t pt-4">
              {campaigns.isLoading && <p className="text-sm text-muted-foreground">Loading campaigns…</p>}
              {campaigns.isError && <p className="text-sm text-destructive">Campaigns could not be loaded. Refresh and try again.</p>}
              {!campaigns.isLoading && !campaigns.data?.length && <p className="text-sm text-muted-foreground">No campaigns have been created for this property.</p>}
              {campaigns.data?.map((campaign) => (
                <button key={campaign.id} type="button" onClick={() => { setSelectedId(campaign.id); setHeadline(campaign.name); setDescription(""); setHighlights(""); }} className={`flex w-full items-center justify-between gap-3 rounded-lg border p-3 text-left transition-colors ${selectedId === campaign.id ? "border-primary bg-primary/5" : "hover:bg-muted/50"}`}>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{campaign.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">/{campaign.slug}</span>
                  </span>
                  <Badge variant={campaign.status === "published" ? "default" : "secondary"}>{campaign.status}</Badge>
                </button>
              ))}
            </div>
          </div>
        </SectionCard>

        <SectionCard title="Campaign page content" description="Structured content is versioned. Saving creates a new draft version and does not publish the page.">
          {selected ? (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-medium">{selected.name}</p>
                  <p className="text-xs text-muted-foreground">/{selected.slug}</p>
                </div>
                <Badge variant="outline">Draft editor</Badge>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="campaign-headline">Hero headline</Label>
                <Input id="campaign-headline" value={headline} onChange={(event) => setHeadline(event.target.value)} maxLength={160} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="campaign-description">Description</Label>
                <Textarea id="campaign-description" value={description} onChange={(event) => setDescription(event.target.value)} rows={5} maxLength={5000} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="campaign-highlights">Highlights (one per line)</Label>
                <Textarea id="campaign-highlights" value={highlights} onChange={(event) => setHighlights(event.target.value)} rows={4} />
              </div>
              <Button onClick={() => saveContent.mutate()} disabled={saveContent.isPending || headline.trim().length < 2}>
                <Save className="mr-2 h-4 w-4" /> Save draft content
              </Button>
            </div>
          ) : (
            <div className="flex min-h-64 flex-col items-center justify-center gap-3 rounded-lg border border-dashed p-6 text-center">
              <Megaphone className="h-8 w-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Create or select a campaign to edit its page content.</p>
            </div>
          )}
        </SectionCard>
      </div>
      <p className="text-xs text-muted-foreground">Publishing, public campaign URLs, pricing offers and booking attribution remain disabled until their server-side validation and booking-flow integration gates pass. The permanent direct booking page is managed separately.</p>
    </div>
  );
}
