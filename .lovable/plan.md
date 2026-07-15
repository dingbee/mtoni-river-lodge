# Sprint 5 — Content & Marketing Intelligence Suite (CMIS)

Sprint 5 is very large (11 modules). To keep it shippable, verifiable, and non-regressive, I'll deliver it in **4 phases**, each independently useful and mergeable. Every phase respects the Module Registry, Feature Flags, Event Bus, and DDD conventions established in Sprints 1–4.

## Guiding principles

- **No public URL changes.** Existing site routes, SEO, and canonical URLs are preserved.
- **Registry-first.** Every new admin surface registers through `src/domains/_platform/registry/modules/*.module.ts` and gets a feature flag.
- **DDD.** New code lives under `src/domains/content/` and `src/domains/marketing/`.
- **Server functions, not raw HTTP.** All CMIS writes go through `createServerFn` + `requireSupabaseAuth` with role checks. RLS + GRANTs on every new table.
- **AI-ready interface contract.** Every new domain module exports a standard object:
  ```ts
  { summarize?, suggest?, analyze?, predict?, recommend? }
  ```
  Initial implementations return deterministic placeholders; wired to Lovable AI Gateway (`google/gemini-3-flash-preview`) where useful.
- **No SEO regression.** Editable metadata falls back to current hard-coded values when a CMS override is absent.

## Technical architecture

```text
src/domains/
  content/
    pages/         (CMS pages + versions + blocks)
    journal/       (articles, categories, tags, authors)
    media/         (assets, folders, usage)
    brand/         (brand tokens)
    ai/            (AI assistant server fns)
  marketing/
    seo/           (per-route SEO overrides + audit)
    campaigns/
    calendar/
    analytics/
    reviews/       (extends existing reviews)
```

Shared tables (new, all with GRANTs + RLS + `staff`-scoped policies):

- `cms_pages`, `cms_page_versions`, `cms_blocks`
- `journal_articles`, `journal_categories`, `journal_tags`, `journal_article_tags`, `journal_authors`
- `media_assets`, `media_folders`, `media_usage`
- `seo_overrides` (keyed by route path)
- `campaigns`, `campaign_utm`
- `content_calendar_entries`
- `brand_tokens`
- `ai_suggestions` (pending approval queue)

Legacy static content (`src/lib/journal.ts`, hard-coded route heads) stays as a **fallback**. A resolver reads DB overrides first, then falls back — so nothing regresses if a page has no CMS entry.

## Phase 1 — Foundations (this sprint delivery batch #1)

Ship the plumbing everything else depends on.

1. **DB migration**: `cms_pages`, `cms_page_versions`, `cms_blocks`, `seo_overrides`, `media_assets`, `media_folders`, `media_usage`, `brand_tokens`, `ai_suggestions`. GRANTs + RLS + staff policies.
2. **Feature flags**: `cms_pages`, `page_builder`, `seo_centre`, `ai_seo_assistant`, `media_library_v2`, `brand_centre`, `campaigns`, `content_calendar`, `reviews_centre_v2`, `website_analytics`.
3. **Registry modules** for all 11 surfaces under `content.*` and `marketing.*` (marked `beta`, gated by their flag). Nav appears immediately as "Coming Soon" placeholders where UI isn't built yet — matches Sprint 1–4 pattern.
4. **Event Bus events**: `content.page.published`, `content.article.published`, `media.asset.uploaded`, `seo.override.changed`, `campaign.created`.
5. **AI-ready interface** helper: `defineAiInterface({ summarize, suggest, analyze, predict, recommend })` in `src/domains/_platform/ai/`.
6. **SEO resolver**: `resolvePageSeo(routePath)` — DB → static fallback. Used by public route `head()` opt-in; no existing head() is rewritten yet.

## Phase 2 — CMS + Page Builder + Journal (batch #2)

- `/admin/content/pages` — list, draft/review/publish/schedule/archive, version history + restore.
- `/admin/content/pages/$id` — block-based editor: hero, rich text, gallery, CTA, reviews, rooms, experiences, FAQ, video, stats, contact, map. Drag-and-drop reorder (dnd-kit).
- Live preview panel (renders block components in an iframe-like preview).
- Upgrade `/admin/content/journal` from ComingSoon to a real editor: rich text (Tiptap), categories, tags, authors, scheduling, featured toggle, reading time, TOC generator, canonical, version history.
- Journal resolver merges DB articles + static `src/lib/journal.ts` entries. Homepage Featured Articles + `/journal` read from the resolver.

## Phase 3 — SEO Centre + AI Assistant + Media Library 2.0 (batch #3)

- `/admin/marketing/seo` — per-route table: title, description, keywords, canonical, OG, Twitter, robots, index status, schema type. Character counters, missing-field warnings, computed SEO score.
- **AI SEO Assistant** panel per page: suggest titles, improve meta, recommend keywords, missing internal links, suggested FAQs, alt text, testimonial summaries, related articles. Suggestions land in `ai_suggestions` for approval; approval writes to the target table + emits a `content.suggestion.approved` event.
- `/admin/content/media` — folders, search, bulk upload, bulk rename, WebP auto-convert (client-side canvas), duplicate hash detection, alt-text editor, usage tracking. Deletion blocked when `media_usage` is non-empty; shows exact usage list.

## Phase 4 — Campaigns + Analytics + Reviews + Calendar + Brand (batch #4)

- `/admin/marketing/campaigns` — CRUD with UTM builder, status pipeline.
- `/admin/marketing/analytics` — framework page with placeholder cards for sessions, users, conversion rate, funnel, top/exit pages, queries, sources, devices, countries. Wired to a `getAnalyticsSnapshot()` server fn that returns deterministic mock data until a live provider is connected.
- `/admin/reviews` upgrade — trend chart, volume, platform comparison, response status, moderation, featured selection.
- `/admin/content/calendar` — unified drag-and-drop calendar across articles / homepage / campaigns / promotions / social.
- `/admin/content/brand` — logos, font tokens, color palette, tone/photo/copy guidelines. Exposes `getBrandContext()` for future AI calls.

## Acceptance for THIS delivery (Phase 1)

- Migration applied; all new tables have GRANTs, RLS, and staff policies.
- All 11 modules appear in the admin sidebar under Content or Marketing, gated by their feature flag (owner/manager visible by default in dev).
- SEO resolver exists and is a no-op fallback on every existing public route (zero head() edits required now — Phase 3 opts routes in).
- AI-ready interface helper published from `_platform`.
- Zero regressions to public site, booking, payments, operations centre, or existing journal routes.

## Phase 1 file map (this batch)

```text
supabase/migrations/<ts>_cmis_phase1.sql
src/domains/_platform/ai/interface.ts
src/domains/_platform/flags/flags.ts        (edit — add flags)
src/domains/_platform/events/types.ts       (edit — add events)
src/domains/_platform/registry/modules/cmis.module.ts
src/domains/_platform/registry/registry.ts  (edit — register)
src/domains/content/index.ts
src/domains/content/pages/pages.functions.ts
src/domains/content/media/media.functions.ts
src/domains/content/brand/brand.functions.ts
src/domains/marketing/seo/seo.functions.ts
src/domains/marketing/seo/resolver.ts       (fallback-safe head resolver)
src/domains/marketing/campaigns/campaigns.functions.ts
src/domains/marketing/ai/ai-assistant.functions.ts
src/lib/permissions.ts                      (edit — role scoping)
src/routes/_authenticated.admin.content.pages.tsx           (ComingSoon → placeholder)
src/routes/_authenticated.admin.content.brand.tsx           (new placeholder)
src/routes/_authenticated.admin.content.calendar.tsx        (new placeholder)
src/routes/_authenticated.admin.marketing.reviews.tsx       (new placeholder)
# existing SEO / campaigns / analytics / journal / media / gallery ComingSoon pages stay
```

## Ask before I start

Sprint 5 as written is 3–4× the scope of Sprint 4. To keep quality high and each change verifiable, I want to confirm:

1. **Approve the 4-phase split** (ship Phase 1 now; Phases 2–4 as follow-up sprints)?
2. Or do you want **Phase 1 + full Phase 2 (CMS + Page Builder + Journal)** in this delivery, and defer 3–4?
3. Any module you want promoted or dropped from Phase 1?

Once you confirm, I'll implement the selected batch end-to-end with migration, server fns, registry, flags, and route stubs, then verify types and the build.