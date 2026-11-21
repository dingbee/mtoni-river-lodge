import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Facebook, Globe, Instagram, Linkedin, Mail, MapPin, Menu, MessageCircle, Phone, Play, Star, X, Youtube, type LucideIcon } from "lucide-react";
import { activeSocialLinks, telHref, type DirectPhoto, type DirectSocialLinks, type DirectTemplateSettings, type SocialNetwork } from "@/lib/direct-booking-content";

/**
 * Template chrome for the public direct-booking page: navigation with a
 * collapsible menu, hero video, photo carousel with guest rating, room galleries
 * and the footer. Every element is driven by property data; anything the
 * property has not provided is hidden. Colours come from the derived theme.
 */

export type DirectNavLink = { label: string; href: string };

const SOCIAL_ICONS: Partial<Record<SocialNetwork, LucideIcon>> = {
  instagram: Instagram,
  facebook: Facebook,
  youtube: Youtube,
  linkedin: Linkedin,
  whatsapp: MessageCircle,
};
const SOCIAL_NAMES: Record<SocialNetwork, string> = {
  instagram: "Instagram", facebook: "Facebook", youtube: "YouTube", tiktok: "TikTok", pinterest: "Pinterest",
  x: "X", linkedin: "LinkedIn", tripadvisor: "Tripadvisor", whatsapp: "WhatsApp",
};

export function DirectSocialIcons({ links, className = "" }: { links: DirectSocialLinks; className?: string }) {
  const active = activeSocialLinks(links);
  if (active.length === 0) return null;
  return <ul aria-label="Social media" className={`flex flex-wrap gap-2 ${className}`}>
    {active.map(([network, url]) => {
      const Icon = SOCIAL_ICONS[network] ?? Globe;
      return <li key={network}><a href={url} target="_blank" rel="noopener noreferrer" aria-label={SOCIAL_NAMES[network]} title={SOCIAL_NAMES[network]} className="flex h-9 w-9 items-center justify-center rounded-full border border-[var(--direct-border)] text-[var(--direct-text-subtle)] transition hover:border-[var(--direct-border-strong)] hover:text-[var(--direct-text)]"><Icon className="h-4 w-4" aria-hidden="true" /></a></li>;
    })}
  </ul>;
}

/** Header with section links, a "Book your stay" action and a collapsible menu. */
export function DirectHeader({ brand, links, social, contact, bookLabel = "Book your stay" }: {
  brand: React.ReactNode;
  links: DirectNavLink[];
  social: DirectSocialLinks;
  contact: DirectTemplateSettings["contact"];
  bookLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [open]);
  const hasContact = Boolean(contact.phone || contact.email || contact.address || social.whatsapp);
  return <header className="relative z-40 border-b border-[var(--direct-border)] bg-[var(--direct-background)]/95 backdrop-blur">
    <div className="mx-auto flex h-[68px] max-w-7xl items-center justify-between gap-4 px-5 sm:px-8">
      {brand}
      <nav aria-label="Page sections" className="hidden items-center gap-7 lg:flex">
        {links.map((link) => <a key={link.href} href={link.href} className="text-[13px] text-[var(--direct-text-subtle)] transition hover:text-[var(--direct-text)]">{link.label}</a>)}
      </nav>
      <div className="flex items-center gap-2.5">
        <a href="#availability" className="inline-flex h-10 items-center whitespace-nowrap rounded-full bg-[var(--direct-primary)] px-3.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--direct-on-primary)] transition hover:bg-[var(--direct-primary-hover)] sm:px-5 sm:tracking-[0.12em]">{bookLabel}</a>
        <button type="button" aria-expanded={open} aria-controls="direct-menu" aria-label={open ? "Close menu" : "Open menu"} onClick={() => setOpen((value) => !value)} className="flex h-10 w-10 items-center justify-center rounded-full border border-[var(--direct-border)] bg-[var(--direct-surface)] text-[var(--direct-text)] transition hover:border-[var(--direct-border-strong)]">
          {open ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
        </button>
      </div>
    </div>
    <div id="direct-menu" hidden={!open} className="absolute inset-x-0 top-full border-b border-[var(--direct-border)] bg-[var(--direct-surface)] shadow-[0_24px_50px_var(--direct-shadow)]">
      <div className="mx-auto grid max-w-7xl gap-6 px-5 py-6 sm:px-8 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <nav aria-label="Menu">
          <ul className="grid gap-1">
            {links.map((link) => <li key={link.href}><a href={link.href} onClick={() => setOpen(false)} className="direct-display block rounded-xl px-2 py-1.5 text-2xl text-[var(--direct-text)] transition hover:bg-[var(--direct-surface-muted)]">{link.label}</a></li>)}
          </ul>
        </nav>
        {(hasContact || activeSocialLinks(social).length > 0) && <div className="space-y-4 text-sm text-[var(--direct-text-subtle)]">
          {hasContact && <DirectContactList contact={contact} whatsapp={social.whatsapp} />}
          <DirectSocialIcons links={social} />
        </div>}
      </div>
    </div>
  </header>;
}

/** Splits the configured headline into lines; the last line takes the accent colour. */
export function DirectHeadline({ headline, fallback }: { headline: string; fallback: string }) {
  const lines = (headline || fallback).split("\n").map((line) => line.trim()).filter(Boolean).slice(0, 3);
  return <h1 className="direct-display mt-3 max-w-2xl text-[3rem] font-medium leading-[0.95] sm:text-7xl lg:text-[5.4rem]">
    {lines.map((line, index) => <span key={index} className={`block ${lines.length > 1 && index === lines.length - 1 ? "text-[var(--direct-accent-on-dark)]" : ""}`}>{line}</span>)}
  </h1>;
}

function embedUrl(url: string): { kind: "iframe" | "video"; src: string } | null {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return null;
    const host = parsed.hostname.replace(/^www\./, "");
    if (host === "youtube.com" || host === "m.youtube.com") {
      const id = parsed.searchParams.get("v") || parsed.pathname.split("/").filter(Boolean).pop();
      return id ? { kind: "iframe", src: `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}?autoplay=1&rel=0` } : null;
    }
    if (host === "youtu.be") return { kind: "iframe", src: `https://www.youtube-nocookie.com/embed/${encodeURIComponent(parsed.pathname.slice(1))}?autoplay=1&rel=0` };
    if (host === "vimeo.com") {
      const id = parsed.pathname.split("/").filter(Boolean)[0];
      return id && /^\d+$/.test(id) ? { kind: "iframe", src: `https://player.vimeo.com/video/${id}?autoplay=1` } : null;
    }
    if (host === "player.vimeo.com") return { kind: "iframe", src: url };
    if (/\.(mp4|webm)$/i.test(parsed.pathname)) return { kind: "video", src: url };
    return null;
  } catch {
    return null;
  }
}

/** Circular "watch" button over the hero that plays the property video in a dialog. */
export function DirectVideoButton({ url, label }: { url: string; label: string }) {
  const [open, setOpen] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const media = embedUrl(url);
  useEffect(() => {
    if (open) dialog.current?.showModal?.();
    else dialog.current?.close?.();
  }, [open]);
  if (!media) return null;
  return <>
    <button type="button" onClick={() => setOpen(true)} className="group flex h-24 w-24 flex-col items-center justify-center gap-1.5 rounded-full border border-white/60 text-white backdrop-blur-[2px] transition hover:bg-white/10 sm:h-36 sm:w-36 sm:gap-2">
      <span className="flex h-11 w-11 items-center justify-center rounded-full bg-white text-[var(--direct-overlay)] transition group-hover:scale-105"><Play className="ml-0.5 h-4 w-4 fill-current" aria-hidden="true" /></span>
      <span className="hidden max-w-[6.5rem] text-center text-[11px] leading-tight sm:block">{label || "Watch the experience"}</span><span className="sr-only sm:hidden">{label || "Watch the experience"}</span>
    </button>
    <dialog ref={dialog} onClose={() => setOpen(false)} onClick={(event) => { if (event.target === dialog.current) setOpen(false); }} className="w-[min(92vw,960px)] rounded-2xl bg-black p-0 backdrop:bg-black/80">
      {open && <div className="relative aspect-video w-full">
        {media.kind === "iframe"
          ? <iframe src={media.src} title={label || "Property video"} allow="autoplay; fullscreen; picture-in-picture" allowFullScreen className="h-full w-full" />
          : <video src={media.src} controls autoPlay playsInline className="h-full w-full" />}
        <button type="button" aria-label="Close video" onClick={() => setOpen(false)} className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full bg-white/90 text-black"><X className="h-4 w-4" /></button>
      </div>}
    </dialog>
  </>;
}

function useCarousel() {
  const track = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ start: true, end: false });
  const update = () => {
    const el = track.current;
    if (!el) return;
    setEdges({ start: el.scrollLeft <= 4, end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 4 });
  };
  useEffect(() => {
    update();
    const el = track.current;
    if (!el) return;
    el.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => { el.removeEventListener("scroll", update); window.removeEventListener("resize", update); };
  }, []);
  const scroll = (direction: 1 | -1) => {
    const el = track.current;
    if (el) el.scrollBy({ left: direction * el.clientWidth * 0.85, behavior: "smooth" });
  };
  return { track, edges, scroll };
}

function CarouselButtons({ edges, scroll, label, className = "" }: { edges: { start: boolean; end: boolean }; scroll: (d: 1 | -1) => void; label: string; className?: string }) {
  return <div className={`flex gap-2 ${className}`}>
    <button type="button" aria-label={`Previous ${label}`} disabled={edges.start} onClick={() => scroll(-1)} className="flex h-9 w-9 items-center justify-center rounded-full border border-[var(--direct-border)] bg-[var(--direct-surface)] text-[var(--direct-text)] shadow-sm transition hover:border-[var(--direct-border-strong)] disabled:opacity-40"><ChevronLeft className="h-4 w-4" /></button>
    <button type="button" aria-label={`Next ${label}`} disabled={edges.end} onClick={() => scroll(1)} className="flex h-9 w-9 items-center justify-center rounded-full border border-[var(--direct-border)] bg-[var(--direct-surface)] text-[var(--direct-text)] shadow-sm transition hover:border-[var(--direct-border-strong)] disabled:opacity-40"><ChevronRight className="h-4 w-4" /></button>
  </div>;
}

/**
 * Numbered photo cards overlapping the bottom of the hero, scrollable with
 * arrows, with the property intro and guest rating beside them.
 */
export function DirectPhotoCarousel({ photos, propertyName, title, intro, rating }: {
  photos: DirectPhoto[];
  propertyName: string;
  title?: string;
  intro?: string;
  rating: DirectTemplateSettings["rating"];
}) {
  const { track, edges, scroll } = useCarousel();
  if (photos.length === 0) return null;
  const hasRating = rating.value !== null || !!rating.label;
  const hasPanel = !!intro || hasRating;
  return <div id="gallery" className={`relative z-10 -mt-16 grid scroll-mt-24 gap-4 px-3 sm:-mt-24 sm:px-6 lg:items-start lg:gap-8 ${hasPanel ? "lg:grid-cols-[minmax(0,3fr)_minmax(0,1fr)]" : ""}`}>
    <div className="min-w-0">
      <div ref={track} className="-mx-3 flex snap-x snap-mandatory gap-3 overflow-x-auto px-3 pb-1 [scrollbar-width:none] sm:mx-0 sm:gap-4 sm:px-0 [&::-webkit-scrollbar]:hidden">
        {photos.map((photo, index) => <figure key={photo.url + index} className="relative aspect-[5/4] w-[72%] shrink-0 snap-start overflow-hidden rounded-[1.25rem] border-[3px] border-[var(--direct-surface)] bg-[var(--direct-surface-sunken)] shadow-[0_18px_40px_var(--direct-shadow)] sm:w-[calc((100%-2rem)/3)]">
          <img src={photo.url} alt={photo.caption ? `${photo.caption} at ${propertyName}` : `${propertyName} — photograph ${index + 1}`} loading="lazy" className="h-full w-full object-cover" />
          <span aria-hidden="true" className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/65 to-transparent" />
          <figcaption className="absolute inset-x-4 bottom-3 flex items-end justify-between gap-3 text-white">
            <span className="direct-display max-w-[75%] text-lg leading-tight">{photo.caption ?? ""}</span>
            <span className="text-sm font-medium tabular-nums">{String(index + 1).padStart(2, "0")}</span>
          </figcaption>
        </figure>)}
      </div>
    </div>
    <div className="flex flex-col gap-4 px-1 pb-1 lg:px-0">
      {photos.length > 3 && <CarouselButtons edges={edges} scroll={scroll} label="photographs" className="hidden justify-end sm:flex" />}
      {hasPanel && <div className={photos.length > 3 ? "lg:mt-14" : "lg:mt-24"}>
        <p className="text-sm font-semibold text-[var(--direct-text)]">{title || `The ${propertyName} experience`}</p>
        {intro && <p className="mt-2 text-sm leading-6 text-[var(--direct-muted)]">{intro}</p>}
        {hasRating && <div className="mt-4 flex items-center gap-3">
          {rating.avatars.length > 0 && <div className="flex -space-x-2">{rating.avatars.map((url, index) => <img key={url} src={url} alt="" className="h-8 w-8 rounded-full border-2 border-[var(--direct-background)] object-cover" style={{ zIndex: 3 - index }} />)}</div>}
          <div className="text-xs text-[var(--direct-muted)]">
            {rating.label && <p>{rating.label}</p>}
            {rating.value !== null && <p className="mt-0.5 flex items-center gap-1.5"><span className="font-semibold text-[var(--direct-text)]">{rating.value.toFixed(1)}</span><Star className="h-3 w-3 fill-current text-[var(--direct-text)]" aria-label="out of 5" />
              {rating.sourceUrl ? <a href={rating.sourceUrl} target="_blank" rel="noopener noreferrer" className="underline-offset-2 hover:underline">{rating.sourceLabel || "Guest rating"}</a> : <span>{rating.sourceLabel || "Guest rating"}</span>}</p>}
          </div>
        </div>}
      </div>}
    </div>
  </div>;
}

/** Swipeable room photographs: the main image followed by the room gallery. */
export function DirectRoomGallery({ images, alt }: { images: string[]; alt: string }) {
  const { track, edges, scroll } = useCarousel();
  const [index, setIndex] = useState(0);
  if (images.length === 0) return <div className="flex h-full w-full items-center justify-center bg-[var(--direct-surface-sunken)] text-xs text-[var(--direct-muted)]">Room image not provided</div>;
  if (images.length === 1) return <img src={images[0]} alt={alt} loading="lazy" className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.025]" />;
  return <div className="relative h-full w-full">
    <div ref={track} onScroll={(event) => { const el = event.currentTarget; setIndex(Math.round(el.scrollLeft / Math.max(1, el.clientWidth))); }} className="flex h-full w-full snap-x snap-mandatory overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {images.map((url, i) => <img key={url + i} src={url} alt={`${alt} — photograph ${i + 1} of ${images.length}`} loading="lazy" className="h-full w-full shrink-0 snap-start object-cover" />)}
    </div>
    <div className="absolute inset-x-0 bottom-3 flex justify-center gap-1.5" aria-hidden="true">
      {images.map((url, i) => <span key={url + i} className={`h-1.5 rounded-full bg-white transition-all ${i === index ? "w-4" : "w-1.5 opacity-60"}`} />)}
    </div>
    <CarouselButtons edges={edges} scroll={scroll} label="room photograph" className="absolute bottom-2 right-2 scale-90 opacity-0 transition group-hover:opacity-100 focus-within:opacity-100" />
  </div>;
}

/** Footer with contact details and social links. */
export function DirectFooter({ brand, propertyName, contact, social, attribution }: {
  brand: React.ReactNode;
  propertyName: string;
  contact: DirectTemplateSettings["contact"];
  social: DirectSocialLinks;
  attribution: boolean;
}) {
  const hasContact = Boolean(contact.phone || contact.email || contact.address || social.whatsapp);
  return <footer id="contact" className="scroll-mt-24 border-t border-[var(--direct-border)] bg-[var(--direct-surface-sunken)] px-5 py-10 sm:px-8">
    <div className="mx-auto grid max-w-7xl gap-6 text-sm text-[var(--direct-text-subtle)] md:grid-cols-3 md:items-start">
      <div>{brand}{attribution && <p className="mt-3 text-[11px] text-[var(--direct-muted)]">Property-owned reservations · Powered by StayNas</p>}</div>
      {hasContact ? <DirectContactList contact={contact} whatsapp={social.whatsapp} /> : <p className="text-[var(--direct-muted)]">Reservations are confirmed directly by {propertyName}.</p>}
      <DirectSocialIcons links={social} className="md:justify-end" />
    </div>
  </footer>;
}

/**
 * Property contact details: phone opens the dialer, WhatsApp opens a chat,
 * email opens the mail app. Only provided details are listed.
 */
export function DirectContactList({ contact, whatsapp }: { contact: DirectTemplateSettings["contact"]; whatsapp?: string }) {
  const phoneHref = contact.phone ? telHref(contact.phone) : "";
  const linkClass = "inline-flex items-center gap-2 hover:text-[var(--direct-text)]";
  return <ul className="space-y-2">
    {contact.phone && phoneHref && <li><a href={phoneHref} className={linkClass}><Phone className="h-4 w-4" aria-hidden="true" /><span><span className="sr-only">Call </span>{contact.phone}</span></a></li>}
    {whatsapp && <li><a href={whatsapp} target="_blank" rel="noopener noreferrer" className={linkClass}><MessageCircle className="h-4 w-4" aria-hidden="true" />Chat on WhatsApp</a></li>}
    {contact.email && <li><a href={`mailto:${contact.email}`} className={linkClass}><Mail className="h-4 w-4" aria-hidden="true" /><span><span className="sr-only">Email </span>{contact.email}</span></a></li>}
    {contact.address && <li className="flex items-start gap-2"><MapPin className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />{contact.address}</li>}
  </ul>;
}
