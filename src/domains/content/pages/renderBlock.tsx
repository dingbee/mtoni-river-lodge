import type { ReactNode } from "react";
import { parseBlockData, type CmsBlockKind } from "./blocks";

export interface RenderableBlock {
  id?: string;
  kind: CmsBlockKind;
  data: unknown;
}

/**
 * SSR-safe renderer used by both the admin builder preview and the public website.
 * Never uses browser-only APIs; only presentational markup.
 */
export function renderBlock(block: RenderableBlock): ReactNode {
  const data = parseBlockData(block.kind, block.data) as Record<string, string | number | unknown[] | undefined>;

  switch (block.kind) {
    case "hero":
      return (
        <section className="relative isolate overflow-hidden bg-card">
          {data.image ? (
            <img src={String(data.image)} alt="" className="absolute inset-0 h-full w-full object-cover opacity-40" />
          ) : null}
          <div className="relative mx-auto max-w-5xl px-6 py-24 text-center">
            {data.eyebrow ? (
              <p className="mb-3 text-xs uppercase tracking-[0.2em] text-muted-foreground">{String(data.eyebrow)}</p>
            ) : null}
            {data.heading ? (
              <h1 className="font-display text-4xl leading-tight text-foreground md:text-5xl">{String(data.heading)}</h1>
            ) : null}
            {data.subheading ? (
              <p className="mx-auto mt-4 max-w-2xl text-base text-muted-foreground">{String(data.subheading)}</p>
            ) : null}
            {data.ctaLabel && data.ctaHref ? (
              <a href={String(data.ctaHref)} className="mt-6 inline-flex items-center rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground">
                {String(data.ctaLabel)}
              </a>
            ) : null}
          </div>
        </section>
      );

    case "rich_text":
      return (
        <section className="mx-auto max-w-3xl px-6 py-12">
          <div className="prose prose-neutral max-w-none" dangerouslySetInnerHTML={{ __html: String(data.html ?? "") }} />
        </section>
      );

    case "image_gallery": {
      const images = (data.images as Array<{ src: string; alt?: string }>) ?? [];
      const cols = Number(data.columns ?? 3);
      return (
        <section className="mx-auto max-w-6xl px-6 py-12">
          <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
            {images.map((img, i) => (
              <img key={i} src={img.src} alt={img.alt ?? ""} className="aspect-[4/3] w-full rounded-lg object-cover" />
            ))}
          </div>
        </section>
      );
    }

    case "cta":
      return (
        <section className="mx-auto max-w-4xl px-6 py-16">
          <div className="rounded-2xl border border-border bg-card p-8 text-center">
            {data.heading ? <h2 className="font-display text-2xl text-foreground">{String(data.heading)}</h2> : null}
            {data.body ? <p className="mt-2 text-sm text-muted-foreground">{String(data.body)}</p> : null}
            {data.label && data.url ? (
              <a href={String(data.url)} className="mt-5 inline-flex items-center rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground">
                {String(data.label)}
              </a>
            ) : null}
          </div>
        </section>
      );

    case "faq": {
      const items = (data.items as Array<{ q: string; a: string }>) ?? [];
      return (
        <section className="mx-auto max-w-3xl px-6 py-12">
          {data.heading ? <h2 className="mb-6 font-display text-2xl text-foreground">{String(data.heading)}</h2> : null}
          <dl className="space-y-4">
            {items.map((it, i) => (
              <div key={i} className="rounded-lg border border-border bg-card p-4">
                <dt className="font-medium text-foreground">{it.q}</dt>
                <dd className="mt-2 text-sm text-muted-foreground">{it.a}</dd>
              </div>
            ))}
          </dl>
        </section>
      );
    }

    case "video":
      return (
        <section className="mx-auto max-w-4xl px-6 py-12">
          {data.url ? (
            <div className="aspect-video overflow-hidden rounded-lg border border-border">
              <iframe src={String(data.url)} title="Video" className="h-full w-full" allowFullScreen />
            </div>
          ) : null}
          {data.caption ? <p className="mt-2 text-center text-xs text-muted-foreground">{String(data.caption)}</p> : null}
        </section>
      );

    case "reviews":
      return (
        <section className="mx-auto max-w-5xl px-6 py-12 text-center">
          {data.heading ? <h2 className="font-display text-2xl text-foreground">{String(data.heading)}</h2> : null}
          <p className="mt-2 text-sm text-muted-foreground">Guest reviews render from the reviews database at publish time.</p>
        </section>
      );

    case "statistics": {
      const items = (data.items as Array<{ value: string; label: string }>) ?? [];
      return (
        <section className="mx-auto max-w-5xl px-6 py-12">
          {data.heading ? <h2 className="mb-6 text-center font-display text-2xl text-foreground">{String(data.heading)}</h2> : null}
          <div className="grid grid-cols-2 gap-6 md:grid-cols-4">
            {items.map((it, i) => (
              <div key={i} className="text-center">
                <div className="font-display text-3xl text-foreground">{it.value}</div>
                <div className="mt-1 text-xs uppercase tracking-wider text-muted-foreground">{it.label}</div>
              </div>
            ))}
          </div>
        </section>
      );
    }

    case "contact":
      return (
        <section className="mx-auto max-w-3xl px-6 py-12">
          {data.heading ? <h2 className="font-display text-2xl text-foreground">{String(data.heading)}</h2> : null}
          <ul className="mt-4 space-y-1 text-sm text-muted-foreground">
            {data.email ? <li>Email: {String(data.email)}</li> : null}
            {data.phone ? <li>Phone: {String(data.phone)}</li> : null}
            {data.address ? <li>Address: {String(data.address)}</li> : null}
          </ul>
        </section>
      );

    case "map":
      return (
        <section className="mx-auto max-w-5xl px-6 py-12">
          {data.url ? (
            <div className="aspect-[16/9] overflow-hidden rounded-lg border border-border">
              <iframe src={String(data.url)} title="Map" className="h-full w-full" loading="lazy" />
            </div>
          ) : null}
          {data.caption ? <p className="mt-2 text-center text-xs text-muted-foreground">{String(data.caption)}</p> : null}
        </section>
      );

    case "rooms":
      return (
        <section className="mx-auto max-w-5xl px-6 py-12 text-center">
          {data.heading ? <h2 className="font-display text-2xl text-foreground">{String(data.heading)}</h2> : null}
          <p className="mt-2 text-sm text-muted-foreground">Room cards render from the rooms database at publish time.</p>
        </section>
      );

    default:
      return null;
  }
}