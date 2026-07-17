import { SiteHeader } from "@/components/site/SiteHeader";
import { SiteFooter } from "@/components/site/SiteFooter";
import { renderBlock } from "@/domains/content/pages/renderBlock";
import type { CmsBlockKind } from "@/domains/content/pages/pages.functions";

export interface CmsBlockRow {
  id: string;
  kind: string;
  data: Record<string, unknown> | unknown;
}

/**
 * Renders a CMS-authored page body (Site header + published blocks + footer).
 * Used by top-level public routes (`/`, `/rooms`, `/experiences`, `/gallery`)
 * as an overlay when a matching `cms_pages` slug is `published` and has blocks.
 * Falls back to the route's hand-authored body when this component isn't used.
 */
export function CmsBody({
  blocks,
  overlayHeader = false,
}: {
  blocks: CmsBlockRow[];
  overlayHeader?: boolean;
}) {
  return (
    <div className="bg-ivory text-charcoal">
      <SiteHeader overlay={overlayHeader} />
      <main>
        {blocks.map((b) => (
          <div key={b.id}>
            {renderBlock({
              id: b.id,
              kind: b.kind as CmsBlockKind,
              data: (b.data as Record<string, unknown>) ?? {},
            })}
          </div>
        ))}
      </main>
      <SiteFooter />
    </div>
  );
}

export type PublicCmsPagePayload = {
  page: { title: string | null; description: string | null; slug: string; route_path: string | null; updated_at: string | null };
  blocks: CmsBlockRow[];
  seo:
    | {
        title?: string | null;
        description?: string | null;
        og_title?: string | null;
        og_description?: string | null;
        og_image?: string | null;
        canonical_url?: string | null;
        robots?: string | null;
      }
    | null;
};

/**
 * True when the resolved CMS page has at least one published block worth
 * rendering. Draft pages, empty published pages, and DB errors all return
 * false so callers keep the existing static design.
 */
export function hasCmsBody(cms: PublicCmsPagePayload | null | undefined): cms is PublicCmsPagePayload {
  return !!cms && Array.isArray(cms.blocks) && cms.blocks.length > 0;
}