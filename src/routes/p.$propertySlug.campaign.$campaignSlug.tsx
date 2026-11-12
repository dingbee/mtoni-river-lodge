import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ArrowRight, CheckCircle2, ShieldCheck } from "lucide-react";
import { getPublicBookingCampaign, recordPublicBookingCampaignEvent } from "@/domains/booking-campaigns/public-campaign.functions";

export const Route = createFileRoute("/p/$propertySlug/campaign/$campaignSlug")({
  loader: ({ params }) => getPublicBookingCampaign({ data: params }),
  head: ({ loaderData }) => {
    const content = loaderData?.content as any;
    const title = String(content?.seo?.title || loaderData?.campaign.name || "Campaign — StayNas");
    const description = String(content?.seo?.description || content?.description || "Explore this direct booking offer.");
    const socialTitle = String(content?.social?.title || title);
    const socialDescription = String(content?.social?.description || description);
    const socialImage = String(content?.social?.imageUrl || content?.seo?.imageUrl || loaderData?.branding?.heroImageUrl || "");
    return { meta: [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: socialTitle },
      { property: "og:description", content: socialDescription },
      ...(socialImage ? [{ property: "og:image", content: socialImage }] : []),
      { name: "robots", content: "index,follow" },
    ] };
  },
  component: PublicCampaignPage,
});

type CampaignPageData = Awaited<ReturnType<typeof getPublicBookingCampaign>>;
type CampaignOffer = CampaignPageData["offers"][number];

function PublicCampaignPage() {
  const data = Route.useLoaderData() as CampaignPageData;
  const navigate = useNavigate();
  const recordEvent = useServerFn(recordPublicBookingCampaignEvent);
  const [sessionKey, setSessionKey] = useState("");
  const [selectedOfferId, setSelectedOfferId] = useState(data.offers[0]?.id ?? "");
  const [tracking, setTracking] = useState<{ source?: string; medium?: string; utmCampaign?: string; utmContent?: string; utmTerm?: string; referrer?: string }>({});
  const [trackingReady, setTrackingReady] = useState(false);
  const [trackingError, setTrackingError] = useState("");
  const selectedOffer = useMemo(() => data.offers.find((offer: CampaignOffer) => offer.id === selectedOfferId) as CampaignOffer | undefined, [data.offers, selectedOfferId]);

  useEffect(() => {
    const key = window.sessionStorage.getItem("staynas.campaign.session") || window.crypto.randomUUID();
    window.sessionStorage.setItem("staynas.campaign.session", key);
    const query = new URLSearchParams(window.location.search);
    setSessionKey(key);
    setTracking({
      source: query.get("utm_source") || undefined,
      medium: query.get("utm_medium") || undefined,
      utmCampaign: query.get("utm_campaign") || undefined,
      utmContent: query.get("utm_content") || undefined,
      utmTerm: query.get("utm_term") || undefined,
      referrer: document.referrer || undefined,
    });
    setTrackingReady(true);
  }, []);

  useEffect(() => {
    if (!trackingReady || !sessionKey) return;
    recordEvent({
      data: {
        campaignId: data.campaign.id,
        propertySlug: data.property.slug,
        sessionKey,
        eventType: "page_view",
        source: tracking.source,
        medium: tracking.medium,
        utmCampaign: tracking.utmCampaign,
        utmContent: tracking.utmContent,
        utmTerm: tracking.utmTerm,
        referrer: tracking.referrer,
      },
    }).catch((error) => console.error("Campaign page-view attribution failed", error));
  }, [data.campaign.id, data.property.slug, recordEvent, sessionKey, tracking, trackingReady]);

  const book = async () => {
    if (!selectedOffer || !sessionKey) return;
    setTrackingError("");
    try {
      await recordEvent({
        data: {
          campaignId: data.campaign.id,
          propertySlug: data.property.slug,
          sessionKey,
          eventType: "booking_click",
          offerId: selectedOffer.id,
          ...tracking,
        },
      }).catch((error) => console.error("Campaign booking-click attribution failed", error));
      await navigate({
        to: "/p/$propertySlug/book",
        params: { propertySlug: data.property.slug },
        search: {
          property: data.property.slug,
          campaign: data.campaign.slug,
          offer: selectedOffer.id,
          ratePlan: selectedOffer.ratePlanId,
          session: sessionKey,
          campaignSession: sessionKey,
          utmSource: tracking.source,
          utmMedium: tracking.medium,
          utmCampaign: tracking.utmCampaign,
          utmContent: tracking.utmContent,
          utmTerm: tracking.utmTerm,
          referrer: tracking.referrer,
        } as any,
      });
    } catch (error) {
      setTrackingError(error instanceof Error ? error.message : "Unable to continue to booking.");
    }
  };

  const content = data.content as {
    headline?: string; subheadline?: string; description?: string;
    highlights?: string[]; inclusions?: string[]; terms?: string[];
    faqs?: Array<{ question: string; answer: string }>;
    ctaLabel?: string; seo?: { imageUrl?: string };
    contact?: { email?: string; phone?: string; whatsapp?: string };
  };
  const style = {
    "--campaign-primary": data.branding.primaryColor,
    "--campaign-secondary": data.branding.secondaryColor,
    "--campaign-background": data.branding.backgroundColor,
    "--campaign-text": data.branding.textColor,
  } as React.CSSProperties;

  return (
    <main style={style} className="min-h-screen bg-[var(--campaign-background)] text-[var(--campaign-text)]">
      <header className="border-b border-black/5 bg-white/80">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4">
          <div className="flex items-center gap-3">
            {data.branding.logoUrl ? <img src={data.branding.logoUrl} alt={data.property.name} className="h-9 max-w-36 object-contain" /> : <span className="text-sm font-semibold tracking-tight">{data.property.name}</span>}
            <span className="hidden text-xs text-muted-foreground sm:inline">Direct booking offer</span>
          </div>
          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground"><ShieldCheck className="h-4 w-4" /> Secure direct reservations</span>
        </div>
      </header>
      <section className="mx-auto max-w-6xl px-5 py-8 sm:py-12">
        <div className="relative flex min-h-[300px] items-end overflow-hidden rounded-3xl bg-slate-900 sm:min-h-[420px]">
          {content.seo?.imageUrl || data.branding.heroImageUrl ? <img src={content.seo?.imageUrl || data.branding.heroImageUrl} alt="" className="absolute inset-0 h-full w-full object-cover opacity-75" /> : <div className="absolute inset-0 bg-gradient-to-br from-slate-800 to-slate-950" />}
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
          <div className="relative max-w-3xl px-6 pb-8 pt-20 text-white sm:px-10 sm:pb-12">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-white/75">{data.campaign.name} · {data.property.name}</p>
            <h1 className="mt-3 text-4xl font-semibold leading-tight tracking-tight sm:text-6xl">{content.headline || data.campaign.name}</h1>
            {content.subheadline && <p className="mt-3 text-lg text-white/90">{content.subheadline}</p>}
            {content.description && <p className="mt-4 max-w-2xl text-sm leading-7 text-white/85 sm:text-base">{content.description}</p>}
          </div>
        </div>

        <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="space-y-8">
            {!!content.highlights?.length && <section><h2 className="text-xl font-semibold">Campaign highlights</h2><ul className="mt-4 grid gap-3 sm:grid-cols-2">{content.highlights.map((item, index) => <li key={index} className="flex gap-2 rounded-xl border border-black/10 bg-white p-4 text-sm"><CheckCircle2 className="h-4 w-4 shrink-0" />{item}</li>)}</ul></section>}
            {!!content.inclusions?.length && <section><h2 className="text-xl font-semibold">What is included</h2><ul className="mt-3 space-y-2">{content.inclusions.map((item, index) => <li key={index} className="flex gap-2 text-sm"><CheckCircle2 className="h-4 w-4 shrink-0" />{item}</li>)}</ul></section>}
            <section><h2 className="text-xl font-semibold">Available accommodation</h2><div className="mt-4 grid gap-3 sm:grid-cols-2">{data.rooms.map((room: CampaignPageData["rooms"][number]) => <article key={room.id} className="rounded-xl border border-black/10 bg-white p-4"><h3 className="font-semibold">{room.name}</h3>{room.short_description && <p className="mt-1 text-sm text-muted-foreground">{room.short_description}</p>}<p className="mt-3 text-xs text-muted-foreground">Availability and final rates are confirmed for your dates.</p></article>)}</div></section>
            {!!content.terms?.length && <section><h2 className="text-xl font-semibold">Terms and conditions</h2><ul className="mt-3 list-disc space-y-2 pl-5 text-sm">{content.terms.map((item, index) => <li key={index}>{item}</li>)}</ul></section>}
            {!!content.faqs?.length && <section><h2 className="text-xl font-semibold">Frequently asked questions</h2><div className="mt-3 space-y-3">{content.faqs.map((faq, index) => <details key={index} className="rounded-xl border border-black/10 bg-white p-4"><summary className="cursor-pointer font-medium">{faq.question}</summary><p className="mt-3 text-sm leading-6 text-muted-foreground">{faq.answer}</p></details>)}</div></section>}
          </div>

          <aside className="h-fit rounded-2xl border border-black/10 bg-white p-5 shadow-sm lg:sticky lg:top-6">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Campaign offer</p>
            <h2 className="mt-2 text-xl font-semibold">{data.campaign.name}</h2>
            <p className="mt-2 text-sm text-muted-foreground">Property currency: {data.property.currency}. Final prices and availability are calculated by the StayNas Pricing Engine after your dates are selected.</p>
            <div className="mt-5 space-y-2"><label htmlFor="campaign-offer" className="text-sm font-medium">Select an offer</label><select id="campaign-offer" value={selectedOfferId} onChange={(event) => setSelectedOfferId(event.target.value)} className="h-11 w-full rounded-lg border bg-white px-3 text-sm">{data.offers.map((offer: CampaignOffer) => <option key={offer.id} value={offer.id}>{offer.title}</option>)}</select></div>
            {selectedOffer?.description && <p className="mt-3 text-sm text-muted-foreground">{selectedOffer.description}</p>}
            <button type="button" onClick={book} disabled={!selectedOffer || !trackingReady} className="mt-6 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[var(--campaign-primary)] px-4 text-sm font-semibold text-white disabled:opacity-50">{content.ctaLabel || "Check availability and book"}<ArrowRight className="h-4 w-4" /></button>
            {trackingError && <p role="alert" className="mt-3 text-xs text-red-700">{trackingError}</p>}
            <p className="mt-3 text-center text-xs text-muted-foreground">No payment is taken on this campaign page. Booking terms and payment options are shown in the booking journey.</p>
          </aside>
        </div>
      </section>
      <footer className="border-t border-black/5 px-5 py-6 text-center text-xs text-muted-foreground">
        <div>Direct reservations powered by StayNas · {data.property.name}</div>
        <div className="mt-2 flex flex-wrap justify-center gap-4">
          {content.contact?.email && <a href={`mailto:${content.contact.email}`} className="underline">{content.contact.email}</a>}
          {content.contact?.phone && <a href={`tel:${content.contact.phone}`} className="underline">{content.contact.phone}</a>}
          {content.contact?.whatsapp && <a href={`https://wa.me/${content.contact.whatsapp.replace(/[^0-9]/g, "")}`} target="_blank" rel="noreferrer" className="underline">WhatsApp</a>}
        </div>
      </footer>
    </main>
  );
}
