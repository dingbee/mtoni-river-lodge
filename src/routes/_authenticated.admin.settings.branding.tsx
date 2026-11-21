import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, Eye, ImagePlus, Plus, Save, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/os/PageHeader";
import { SectionCard } from "@/components/os/SectionCard";
import { LoadingState } from "@/components/os/LoadingState";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { useAdminMutation } from "@/hooks/use-admin-mutation";
import { usePropertyContext } from "@/modules/property/PropertyContext";
import { getPropertyBranding, savePropertyBranding, type PropertyBranding } from "@/modules/property/property-branding.functions";
import { getPlatformRoomConfiguration, savePlatformRoomGallery } from "@/lib/platform-room-configuration.server";
import { AssetField, AssetUpload } from "@/components/direct-booking/BrandAssetUpload";
import { deriveDirectTheme } from "@/lib/direct-booking-theme";
import {
  EMPTY_TEMPLATE_SETTINGS, HIGHLIGHT_ICONS, SOCIAL_NETWORKS,
  type DirectHighlight, type DirectOffer, type DirectTemplateSettings, type HighlightIcon, type SocialNetwork,
} from "@/lib/direct-booking-content";

export const Route = createFileRoute("/_authenticated/admin/settings/branding")({
  head: () => ({ meta: [{ title: "Property Branding — StayNas" }, { name: "robots", content: "noindex,nofollow" }] }),
  component: PropertyBrandingPage,
});

const ICON_LABELS: Record<HighlightIcon, string> = {
  stay: "Rooms & stays", dining: "Dining", wellness: "Wellness & spa", outdoors: "Outdoor activities",
  pool: "Pool", wifi: "Wi-Fi", transfer: "Transfers", family: "Family",
};
const SOCIAL_LABELS: Record<SocialNetwork, string> = {
  instagram: "Instagram", facebook: "Facebook", youtube: "YouTube", tiktok: "TikTok", pinterest: "Pinterest",
  x: "X (Twitter)", linkedin: "LinkedIn", tripadvisor: "Tripadvisor", whatsapp: "WhatsApp (https://wa.me/…)",
};
const EMPTY_OFFER: DirectOffer = { enabled: false, eyebrow: "", title: "", body: "", ctaLabel: "", ctaUrl: "", imageUrl: "" };

const defaults = (propertyId: string): PropertyBranding => ({
  propertyId, logoUrl: "", logoDarkUrl: "", faviconUrl: "",
  primaryColor: "#1e352a", secondaryColor: "#c6a878",
  backgroundColor: "#f5f4ef", textColor: "#202820",
  tagline: "", description: "", heroImageUrl: "",
  galleryImageUrls: [], showStayNasAttribution: true,
  valueWords: [], highlights: [], offer: null,
  template: EMPTY_TEMPLATE_SETTINGS, socialLinks: {},
});

/** Drops untouched slots so only content the property entered is validated and saved. */
const toSavePayload = (form: PropertyBranding): PropertyBranding => ({
  ...form,
  valueWords: form.valueWords.map((word) => word.trim()).filter(Boolean),
  highlights: form.highlights.filter((item) => item.title.trim() || item.description.trim()),
  offer: form.offer && (form.offer.enabled || form.offer.title.trim()) ? form.offer : null,
  template: {
    ...form.template,
    photoCards: form.template.photoCards.filter((card) => card.imageUrl.trim()),
    rating: { ...form.template.rating, avatars: form.template.rating.avatars.filter(Boolean) },
  },
});

function PropertyBrandingPage() {
  const { property } = usePropertyContext();
  const getFn = useServerFn(getPropertyBranding);
  const saveFn = useServerFn(savePropertyBranding);
  const qc = useQueryClient();
  const queryKey = ["property-branding", property.id];
  const query = useQuery({ queryKey, queryFn: () => getFn({ data: { propertyId: property.id } }) });
  const [form, setForm] = useState<PropertyBranding>(defaults(property.id));
  useEffect(() => {
    if (query.data) {
      const { templateFieldsAvailable: _available, ...branding } = query.data;
      setForm(branding);
    } else if (!query.isLoading) setForm(defaults(property.id));
  }, [query.data, query.isLoading, property.id]);

  const save = useAdminMutation({
    mutationFn: (payload: PropertyBranding) => saveFn({ data: payload }),
    successMessage: "Property branding saved",
    onSuccess: () => qc.invalidateQueries({ queryKey }),
  });
  const update = <K extends keyof PropertyBranding>(key: K, value: PropertyBranding[K]) =>
    setForm((current) => ({ ...current, [key]: value }));
  const setTemplate = <K extends keyof DirectTemplateSettings>(key: K, value: Partial<DirectTemplateSettings[K]>) =>
    setForm((current) => ({
      ...current,
      template: { ...current.template, [key]: Array.isArray(value) ? value : { ...(current.template[key] as object), ...value } },
    }));
  const templateReady = query.data?.templateFieldsAvailable ?? false;
  const previewTheme = deriveDirectTheme(form);
  const t = form.template;

  if (query.isLoading) return <LoadingState />;

  const saveBar = <div className="sticky bottom-3 z-10 flex items-center justify-between gap-3 rounded-xl border bg-background/95 p-3 shadow-sm backdrop-blur">
    <p className="text-xs text-muted-foreground">Changes apply to {property.name} only. Empty fields are hidden on the guest page.</p>
    <Button onClick={() => save.mutate(toSavePayload(form))} disabled={save.isPending}><Save className="mr-2 h-4 w-4" />{save.isPending ? "Saving…" : "Save branding"}</Button>
  </div>;

  return <div className="space-y-6">
    <PageHeader title="Property Branding" description={`Configure the guest booking page for ${property.name}. Changes are isolated to this property.`} />
    {!templateReady && <p className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
      Hero, photo cards, rating, discover, highlights, offer and contact fields need this release's database update. Until it is applied they are read-only; logos, colours, photography, social links and room galleries save normally.
    </p>}
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="space-y-4">
        <Accordion type="multiple" defaultValue={["identity"]} className="space-y-3">
          <Section value="identity" title="Logo & identity" summary="Logos, favicon, tagline and property description">
            <div className="grid gap-4 sm:grid-cols-2">
              <AssetField label="Primary logo" value={form.logoUrl} propertyId={property.id} assetKey="logo" onUploaded={(v) => update("logoUrl", v)} />
              <AssetField label="Dark-background logo" value={form.logoDarkUrl} propertyId={property.id} assetKey="logo-dark" onUploaded={(v) => update("logoDarkUrl", v)} />
              <AssetField label="Favicon" value={form.faviconUrl} propertyId={property.id} assetKey="favicon" onUploaded={(v) => update("faviconUrl", v)} />
              <Field label="Tagline (small line above the headline)"><Input value={form.tagline} onChange={(e) => update("tagline", e.target.value)} maxLength={160} placeholder="A sanctuary in nature" /></Field>
            </div>
            <div className="mt-4"><Field label="Property description (shown beside the photo cards)"><Textarea rows={3} value={form.description} onChange={(e) => update("description", e.target.value)} maxLength={1000} placeholder="A short introduction shown to guests…" /></Field></div>
          </Section>

          <Section value="colours" title="Brand colours" summary="Four colours theme the whole page">
            <p className="mb-4 text-xs text-muted-foreground">Surfaces, borders and muted text are derived from these colours, and text is adjusted automatically where needed to stay readable.</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <ColorField label="Primary" value={form.primaryColor} onChange={(v) => update("primaryColor", v)} />
              <ColorField label="Secondary (accent)" value={form.secondaryColor} onChange={(v) => update("secondaryColor", v)} />
              <ColorField label="Page background" value={form.backgroundColor} onChange={(v) => update("backgroundColor", v)} />
              <ColorField label="Text" value={form.textColor} onChange={(v) => update("textColor", v)} />
            </div>
          </Section>

          <Section value="hero" title="Hero" summary="Headline, buttons, video and value words" locked={!templateReady}>
            <div className="grid gap-4">
              <Field label="Headline (up to 3 lines; the last line uses the accent colour)">
                <Textarea rows={3} value={t.hero.headline} maxLength={90} onChange={(e) => setTemplate("hero", { headline: e.target.value })} placeholder={"Nature.\nComfort.\nYou."} />
              </Field>
              <Field label="Line under the headline"><Input value={t.hero.subline} maxLength={160} onChange={(e) => setTemplate("hero", { subline: e.target.value })} placeholder="A sanctuary where nature meets mindful luxury." /></Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Hero button label"><Input value={t.hero.ctaLabel} maxLength={30} onChange={(e) => setTemplate("hero", { ctaLabel: e.target.value })} placeholder="Explore stay" /></Field>
                <Field label="Header button label"><Input value={t.bookLabel} maxLength={24} onChange={(e) => setForm((c) => ({ ...c, template: { ...c.template, bookLabel: e.target.value } }))} placeholder="Book your stay" /></Field>
                <Field label="Video link (YouTube, Vimeo or .mp4)"><Input value={t.hero.videoUrl} maxLength={2048} onChange={(e) => setTemplate("hero", { videoUrl: e.target.value })} placeholder="https://youtube.com/watch?v=…" /></Field>
                <Field label="Video button label"><Input value={t.hero.videoLabel} maxLength={40} onChange={(e) => setTemplate("hero", { videoLabel: e.target.value })} placeholder="Watch the experience" /></Field>
              </div>
              <Field label="Value words (up to 3, shown at the bottom of the hero)">
                <div className="grid gap-2 sm:grid-cols-3">
                  {[0, 1, 2].map((index) => <Input key={index} value={form.valueWords[index] ?? ""} maxLength={24} aria-label={`Value word ${index + 1}`} placeholder={["Tranquil", "Authentic", "Restorative"][index]}
                    onChange={(e) => { const next = [0, 1, 2].map((i) => form.valueWords[i] ?? ""); next[index] = e.target.value; update("valueWords", next); }} />)}
                </div>
              </Field>
            </div>
          </Section>

          <Section value="cards" title="Photo cards & guest rating" summary={`${t.photoCards.length} cards · experience intro · rating`} locked={!templateReady}>
            <p className="mb-3 text-xs text-muted-foreground">Cards overlap the bottom of the hero; arrows appear when there are more than three. With no cards, the gallery and then room photographs are used.</p>
            <div className="grid gap-3 sm:grid-cols-2">
              {t.photoCards.map((card, index) => <div key={index} className="space-y-2 rounded-lg border p-3">
                {card.imageUrl ? <img src={card.imageUrl} alt="" className="aspect-[5/4] w-full rounded-md object-cover" /> : <div className="flex aspect-[5/4] items-center justify-center rounded-md bg-muted text-xs text-muted-foreground">No image</div>}
                <AssetUpload propertyId={property.id} assetKey={`card-${index + 1}`} label={`Card ${index + 1} image`} onUploaded={(url) => setForm((c) => ({ ...c, template: { ...c.template, photoCards: c.template.photoCards.map((x, i) => i === index ? { ...x, imageUrl: url } : x) } }))} />
                <Input value={card.caption} maxLength={40} placeholder="Peaceful sanctuaries" aria-label={`Card ${index + 1} caption`} onChange={(e) => setForm((c) => ({ ...c, template: { ...c.template, photoCards: c.template.photoCards.map((x, i) => i === index ? { ...x, caption: e.target.value } : x) } }))} />
                <ListControls index={index} length={t.photoCards.length} onMove={(from, to) => setForm((c) => ({ ...c, template: { ...c.template, photoCards: move(c.template.photoCards, from, to) } }))} onRemove={() => setForm((c) => ({ ...c, template: { ...c.template, photoCards: c.template.photoCards.filter((_, i) => i !== index) } }))} />
              </div>)}
            </div>
            {t.photoCards.length < 6 && <Button type="button" variant="outline" size="sm" className="mt-3" onClick={() => setForm((c) => ({ ...c, template: { ...c.template, photoCards: [...c.template.photoCards, { imageUrl: "", caption: "" }] } }))}><Plus className="mr-1 h-3.5 w-3.5" />Add photo card</Button>}
            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <Field label="Experience panel title"><Input value={t.experience.title} maxLength={60} onChange={(e) => setTemplate("experience", { title: e.target.value })} placeholder={`The ${property.name} experience`} /></Field>
              <Field label="Experience panel text (defaults to the property description)"><Textarea rows={2} value={t.experience.body} maxLength={240} onChange={(e) => setTemplate("experience", { body: e.target.value })} /></Field>
              <Field label="Guest rating (0–5, from your review source)"><Input type="number" min={0} max={5} step={0.1} value={t.rating.value ?? ""} onChange={(e) => setTemplate("rating", { value: e.target.value === "" ? null : Math.min(5, Math.max(0, Number(e.target.value))) })} placeholder="4.9" /></Field>
              <Field label="Rating line"><Input value={t.rating.label} maxLength={40} onChange={(e) => setTemplate("rating", { label: e.target.value })} placeholder="Loved by 5,000+ guests" /></Field>
              <Field label="Rating source name"><Input value={t.rating.sourceLabel} maxLength={30} onChange={(e) => setTemplate("rating", { sourceLabel: e.target.value })} placeholder="Google rating" /></Field>
              <Field label="Rating source link"><Input value={t.rating.sourceUrl} maxLength={2048} onChange={(e) => setTemplate("rating", { sourceUrl: e.target.value })} placeholder="https://g.page/…" /></Field>
            </div>
            <div className="mt-4"><Label>Guest avatars (up to 3)</Label>
              <div className="mt-2 flex flex-wrap items-end gap-3">
                {t.rating.avatars.map((url, index) => <div key={url + index} className="relative"><img src={url} alt="" className="h-12 w-12 rounded-full border object-cover" /><RemoveDot onClick={() => setTemplate("rating", { avatars: t.rating.avatars.filter((_, i) => i !== index) })} /></div>)}
                {t.rating.avatars.length < 3 && <div className="w-40"><AssetUpload propertyId={property.id} assetKey="avatar" label="Add avatar" onUploaded={(url) => setTemplate("rating", { avatars: [...t.rating.avatars, url].slice(0, 3) })} /></div>}
              </div>
            </div>
          </Section>

          <Section value="discover" title="Discover & booking card" summary="Intro section beside the Plan your escape card" locked={!templateReady}>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Heading (line breaks allowed)"><Textarea rows={2} value={t.discover.heading} maxLength={60} onChange={(e) => setTemplate("discover", { heading: e.target.value })} placeholder={"Discover\nTrue Relaxation"} /></Field>
              <Field label="Text"><Textarea rows={2} value={t.discover.body} maxLength={300} onChange={(e) => setTemplate("discover", { body: e.target.value })} placeholder="From cozy stays and nourishing cuisine…" /></Field>
              <Field label="Button label"><Input value={t.discover.buttonLabel} maxLength={30} onChange={(e) => setTemplate("discover", { buttonLabel: e.target.value })} placeholder="Our story" /></Field>
              <Field label="Button link (site path or https)"><Input value={t.discover.buttonUrl} maxLength={2048} onChange={(e) => setTemplate("discover", { buttonUrl: e.target.value })} placeholder="https://… or #rooms" /></Field>
              <Field label="Booking card title"><Input value={t.bookingCard.title} maxLength={40} onChange={(e) => setTemplate("bookingCard", { title: e.target.value })} placeholder="Plan Your Escape" /></Field>
              <Field label="Booking card button"><Input value={t.bookingCard.buttonLabel} maxLength={30} onChange={(e) => setTemplate("bookingCard", { buttonLabel: e.target.value })} placeholder="Check availability" /></Field>
            </div>
            <div className="mt-4"><AssetField label="Image behind the booking card" value={t.discover.imageUrl} propertyId={property.id} assetKey="discover" onUploaded={(url) => setTemplate("discover", { imageUrl: url })} /></div>
          </Section>

          <Section value="highlights" title="Highlights (amenity cards)" summary={`${form.highlights.length}/4 cards`} locked={!templateReady}>
            <div className="space-y-3">
              {form.highlights.map((item, index) => <div key={index} className="grid gap-2 rounded-lg border p-3 sm:grid-cols-[170px_minmax(0,1fr)]">
                <select value={item.icon} onChange={(e) => update("highlights", form.highlights.map((h, i) => i === index ? { ...h, icon: e.target.value as HighlightIcon } : h))} aria-label={`Highlight ${index + 1} icon`} className="h-10 rounded-md border border-input bg-background px-3 text-sm">
                  {HIGHLIGHT_ICONS.map((icon) => <option key={icon} value={icon}>{ICON_LABELS[icon]}</option>)}
                </select>
                <div className="grid gap-2">
                  <Input value={item.title} maxLength={40} placeholder="Farm-to-table dining" aria-label={`Highlight ${index + 1} title`} onChange={(e) => update("highlights", form.highlights.map((h, i) => i === index ? { ...h, title: e.target.value } : h))} />
                  <Input value={item.description} maxLength={140} placeholder="Fresh, local ingredients crafted with care." aria-label={`Highlight ${index + 1} description`} onChange={(e) => update("highlights", form.highlights.map((h, i) => i === index ? { ...h, description: e.target.value } : h))} />
                  <Input value={item.linkUrl} maxLength={2048} placeholder="Arrow link (optional): https://… or #rooms" aria-label={`Highlight ${index + 1} link`} onChange={(e) => update("highlights", form.highlights.map((h, i) => i === index ? { ...h, linkUrl: e.target.value } : h))} />
                  <ListControls index={index} length={form.highlights.length} onMove={(from, to) => update("highlights", move(form.highlights, from, to))} onRemove={() => update("highlights", form.highlights.filter((_, i) => i !== index))} />
                </div>
              </div>)}
              {form.highlights.length < 4 && <Button type="button" variant="outline" size="sm" onClick={() => update("highlights", [...form.highlights, { title: "", description: "", icon: "stay", linkUrl: "" } as DirectHighlight])}><Plus className="mr-1 h-3.5 w-3.5" />Add highlight</Button>}
            </div>
          </Section>

          <Section value="offer" title="Offer banner (ad)" summary={form.offer?.enabled ? "Shown on the page" : "Hidden"} locked={!templateReady}>
            <OfferFields offer={form.offer ?? EMPTY_OFFER} propertyId={property.id} onChange={(offer) => update("offer", offer)} />
          </Section>

          <Section value="gallery" title="Hero image & property gallery" summary={`${form.heroImageUrl ? "Hero image set" : "No hero image"} · ${form.galleryImageUrls.length}/12 gallery images`}>
            <div className="mb-4"><AssetField label="Hero image" value={form.heroImageUrl} propertyId={property.id} assetKey="hero" onUploaded={(v) => update("heroImageUrl", v)} /></div>
            <Label>Gallery images</Label>
            <div className="mt-2 flex flex-wrap gap-2">
              {form.galleryImageUrls.map((url, index) => <div key={url + index} className="relative">
                <img src={url} alt={`Gallery ${index + 1}`} className="h-20 w-28 rounded-md border object-cover" />
                <RemoveDot onClick={() => update("galleryImageUrls", form.galleryImageUrls.filter((_, i) => i !== index))} />
              </div>)}
              {form.galleryImageUrls.length < 12 && <div className="w-40"><AssetUpload propertyId={property.id} assetKey="gallery" label="Add image" onUploaded={(url) => update("galleryImageUrls", [...form.galleryImageUrls, url].slice(0, 12))} /></div>}
            </div>
          </Section>

          <Section value="rooms" title="Room galleries" summary="Cover photo and gallery for each room type">
            <RoomGalleries propertyId={property.id} />
          </Section>

          <Section value="social" title="Social media links" summary={`${Object.values(form.socialLinks).filter(Boolean).length} linked`}>
            <div className="grid gap-3 sm:grid-cols-2">
              {SOCIAL_NETWORKS.map((network) => <Field key={network} label={SOCIAL_LABELS[network]}>
                <Input value={form.socialLinks[network] ?? ""} maxLength={2048} placeholder="https://…" onChange={(e) => update("socialLinks", { ...form.socialLinks, [network]: e.target.value })} />
              </Field>)}
            </div>
          </Section>

          <Section value="contact" title="Contact details" summary="Shown in the menu and footer" locked={!templateReady}>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Phone"><Input value={t.contact.phone} maxLength={40} onChange={(e) => setTemplate("contact", { phone: e.target.value })} placeholder="+255 …" /></Field>
              <Field label="Email"><Input type="email" value={t.contact.email} maxLength={120} onChange={(e) => setTemplate("contact", { email: e.target.value })} placeholder="reservations@…" /></Field>
              <div className="sm:col-span-2"><Field label="Address"><Textarea rows={2} value={t.contact.address} maxLength={200} onChange={(e) => setTemplate("contact", { address: e.target.value })} /></Field></div>
            </div>
          </Section>

          <Section value="options" title="Booking page options" summary={form.showStayNasAttribution ? "StayNas attribution on" : "StayNas attribution off"}>
            <div className="flex items-center justify-between gap-4">
              <div><p className="text-sm font-medium">Show StayNas attribution</p><p className="text-xs text-muted-foreground">Display “Powered by StayNas” on the public booking page.</p></div>
              <Switch checked={form.showStayNasAttribution} onCheckedChange={(v) => update("showStayNasAttribution", v)} />
            </div>
          </Section>
        </Accordion>
        {saveBar}
      </div>

      <div className="space-y-4 xl:sticky xl:top-5 xl:self-start">
        <SectionCard title="Live preview" description="A simplified preview using your current unsaved values.">
          <div className="overflow-hidden rounded-xl border" style={{ backgroundColor: form.backgroundColor, color: form.textColor }}>
            <div className="flex items-center gap-3 border-b px-4 py-3" style={{ borderColor: form.primaryColor + "22" }}>
              {form.logoUrl ? <img src={form.logoUrl} alt="Property logo preview" className="h-9 max-w-28 object-contain" /> : <div className="flex h-9 w-9 items-center justify-center rounded-lg" style={{ backgroundColor: form.primaryColor, color: previewTheme["--direct-on-primary"] }}><ImagePlus className="h-4 w-4" /></div>}
              <span className="text-sm font-semibold">{property.name}</span>
            </div>
            <div className="p-4">
              <div className="relative mb-4 overflow-hidden rounded-lg" style={{ backgroundColor: previewTheme["--direct-overlay"] }}>
                {form.heroImageUrl && <img src={form.heroImageUrl} alt="" className="aspect-[16/10] w-full object-cover opacity-80" />}
                {!form.heroImageUrl && <div className="aspect-[16/10]" />}
                <p className="absolute bottom-3 left-3 whitespace-pre-line text-lg leading-tight text-white" style={{ fontFamily: "'Cormorant Garamond', Georgia, serif" }}>{t.hero.headline || property.name}</p>
              </div>
              {form.tagline && <p className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: previewTheme["--direct-accent-text"] }}>{form.tagline}</p>}
              <div className="mt-4 rounded-lg px-4 py-3 text-center text-xs font-semibold" style={{ backgroundColor: form.primaryColor, color: previewTheme["--direct-on-primary"] }}>{t.bookingCard.buttonLabel || "Find a room"}</div>
            </div>
            {form.showStayNasAttribution && <p className="px-4 pb-3 text-center text-[11px] opacity-60">Powered by StayNas</p>}
          </div>
          <p className="mt-3 flex items-center gap-2 text-xs text-muted-foreground"><Eye className="h-3.5 w-3.5" /> Preview updates as you edit; save to publish.</p>
        </SectionCard>
      </div>
    </div>
  </div>;
}

function Section({ value, title, summary, locked = false, children }: { value: string; title: string; summary?: string; locked?: boolean; children: React.ReactNode }) {
  return <AccordionItem value={value} className="rounded-xl border bg-card px-4">
    <AccordionTrigger className="py-4 hover:no-underline">
      <div className="text-left"><p className="text-sm font-semibold">{title}</p>{summary && <p className="mt-0.5 text-xs font-normal text-muted-foreground">{summary}{locked ? " · needs database update" : ""}</p>}</div>
    </AccordionTrigger>
    <AccordionContent className="pb-5"><fieldset disabled={locked} className="disabled:opacity-60">{children}</fieldset></AccordionContent>
  </AccordionItem>;
}

function OfferFields({ offer, propertyId, onChange }: { offer: DirectOffer; propertyId: string; onChange: (offer: DirectOffer) => void }) {
  const set = (patch: Partial<DirectOffer>) => onChange({ ...offer, ...patch });
  return <div className="space-y-3">
    <div className="flex items-center justify-between gap-4">
      <div><p className="text-sm font-medium">Show the offer banner</p><p className="text-xs text-muted-foreground">Appears at the end of the page when switched on and given a title.</p></div>
      <Switch checked={offer.enabled} onCheckedChange={(enabled) => set({ enabled })} aria-label="Show offer banner" />
    </div>
    <div className="grid gap-2 sm:grid-cols-2">
      <Input value={offer.eyebrow} maxLength={40} onChange={(e) => set({ eyebrow: e.target.value })} placeholder="Label, e.g. Special offer" aria-label="Offer label" />
      <Input value={offer.title} maxLength={80} onChange={(e) => set({ title: e.target.value })} placeholder="Stay longer, save more" aria-label="Offer title" />
      <Textarea className="sm:col-span-2" rows={2} value={offer.body} maxLength={240} onChange={(e) => set({ body: e.target.value })} placeholder="Offer terms as they apply to guests" aria-label="Offer details" />
      <Input value={offer.ctaLabel} maxLength={30} onChange={(e) => set({ ctaLabel: e.target.value })} placeholder="View offers" aria-label="Offer button label" />
      <Input value={offer.ctaUrl} maxLength={2048} onChange={(e) => set({ ctaUrl: e.target.value })} placeholder="/p/your-property/campaign/… or https://…" aria-label="Offer button link" />
    </div>
    <AssetField label="Offer image" value={offer.imageUrl} propertyId={propertyId} assetKey="offer" onUploaded={(url) => set({ imageUrl: url })} />
  </div>;
}

type RoomRow = { id: string; name: string; image_url: string | null; gallery_urls: string[] | null };

/** Cover photo and gallery per room type, saved straight to the room record. */
function RoomGalleries({ propertyId }: { propertyId: string }) {
  const getRooms = useServerFn(getPlatformRoomConfiguration);
  const saveGallery = useServerFn(savePlatformRoomGallery);
  const qc = useQueryClient();
  const rooms = useQuery({ queryKey: ["room-galleries", propertyId], queryFn: () => getRooms(), retry: false });
  const save = useAdminMutation({
    mutationFn: (input: { roomId: string; imageUrl: string; galleryUrls: string[] }) => saveGallery({ data: input }),
    successMessage: "Room gallery saved",
    onSuccess: () => qc.invalidateQueries({ queryKey: ["room-galleries", propertyId] }),
  });
  if (rooms.isLoading) return <p className="text-sm text-muted-foreground">Loading room types…</p>;
  if (rooms.isError) return <p className="text-sm text-muted-foreground">Room galleries need the Room Configuration permission. {(rooms.error as Error).message}</p>;
  const list = ((rooms.data as { roomTypes?: RoomRow[] } | undefined)?.roomTypes ?? []) as RoomRow[];
  if (list.length === 0) return <p className="text-sm text-muted-foreground">No room types configured yet.</p>;
  return <div className="space-y-4">
    {list.map((room) => {
      const gallery = room.gallery_urls ?? [];
      const cover = room.image_url ?? "";
      const commit = (imageUrl: string, galleryUrls: string[]) => save.mutate({ roomId: room.id, imageUrl, galleryUrls });
      return <div key={room.id} className="rounded-lg border p-3">
        <p className="text-sm font-semibold">{room.name}</p>
        <div className="mt-2 flex flex-wrap items-end gap-2">
          <div className="relative">
            {cover ? <img src={cover} alt={`${room.name} cover`} className="h-20 w-28 rounded-md border object-cover ring-2 ring-primary/40" /> : <div className="flex h-20 w-28 items-center justify-center rounded-md border text-[11px] text-muted-foreground">No cover</div>}
            <span className="absolute left-1 top-1 rounded bg-background/90 px-1 text-[10px]">Cover</span>
          </div>
          {gallery.map((url, index) => <div key={url + index} className="relative">
            <button type="button" title="Use as cover" onClick={() => commit(url, gallery)} className="block"><img src={url} alt={`${room.name} ${index + 1}`} className="h-20 w-28 rounded-md border object-cover" /></button>
            <RemoveDot onClick={() => commit(cover, gallery.filter((_, i) => i !== index))} />
          </div>)}
          {gallery.length < 20 && <div className="w-40"><AssetUpload propertyId={propertyId} assetKey={`room-${room.id}`} label="Add photo" onUploaded={(url) => commit(cover || url, [...gallery, url].slice(0, 20))} /></div>}
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">Tap a photo to make it the cover. Changes save immediately.</p>
      </div>;
    })}
  </div>;
}

function ListControls({ index, length, onMove, onRemove }: { index: number; length: number; onMove: (from: number, to: number) => void; onRemove: () => void }) {
  return <div className="flex gap-1">
    <Button type="button" variant="ghost" size="icon" aria-label="Move up" disabled={index === 0} onClick={() => onMove(index, index - 1)}><ArrowUp className="h-4 w-4" /></Button>
    <Button type="button" variant="ghost" size="icon" aria-label="Move down" disabled={index === length - 1} onClick={() => onMove(index, index + 1)}><ArrowDown className="h-4 w-4" /></Button>
    <Button type="button" variant="ghost" size="icon" aria-label="Remove" onClick={onRemove}><Trash2 className="h-4 w-4" /></Button>
  </div>;
}

function RemoveDot({ onClick }: { onClick: () => void }) {
  return <button type="button" aria-label="Remove image" onClick={onClick} className="absolute -right-2 -top-2 rounded-full border bg-background px-2 py-0.5 text-xs shadow">×</button>;
}

function move<T>(items: T[], from: number, to: number): T[] {
  const next = [...items];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1.5"><Label>{label}</Label>{children}</div>;
}
function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <Field label={label}><div className="flex items-center gap-2"><Input type="color" value={value} onChange={(e) => onChange(e.target.value)} className="h-10 w-14 p-1" /><Input value={value} onChange={(e) => onChange(e.target.value)} maxLength={7} /></div></Field>;
}
