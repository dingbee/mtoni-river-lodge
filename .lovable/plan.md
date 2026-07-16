# Sprint 5 · Phase 2 — CMS, Page Builder & Journal Editor

Phase 1 laid the DB tables (`cms_pages`, `cms_page_versions`, `cms_blocks`, `media_assets`, etc.), registry modules, feature flags, and AI-ready interfaces. Phase 2 turns those foundations into working admin surfaces without touching any public-site routes, SEO, or booking/reservation logic.

## Scope

### 1. CMS Pages module (`/admin/content/pages`)
- List view: title, slug, status (draft/scheduled/published/archived), route_path, updated_at, author, quick filters + search.
- Create / edit page metadata (title, slug, description, route_path, status, scheduled_at, SEO fields via `seo_overrides` join).
- Draft → Publish → Schedule → Archive lifecycle with confirmation dialogs.
- Version history panel: list `cms_page_versions`, view a snapshot, restore into current draft.
- Server functions: `listCmsPages` (exists), `getCmsPage` (exists), plus new `upsertCmsPage`, `deleteCmsPage`, `publishCmsPage`, `schedulePublish`, `archiveCmsPage`, `restoreVersion`, `createVersionSnapshot`.
- All server fns use `requireSupabaseAuth` and check `staff` role.

### 2. Block-based Page Builder (`/admin/content/pages/$id`)
- Left panel: block palette (Hero, Rich Text, Image, Gallery, Two-Column, CTA, FAQ, Quote, Spacer, Embed).
- Center: sortable stack of blocks (drag-and-drop via `@dnd-kit`), each with inline edit affordances.
- Right panel: selected block's properties form (typed per block via discriminated union in `src/domains/content/pages/blocks.ts`).
- Live preview toggle: renders blocks with the same components used server-side (`renderBlock(block)` shared module).
- Autosave debounced to `cms_blocks` (position, type, data JSON).
- "Create version snapshot" button writes to `cms_page_versions` before major edits/publish.
- No public-route wiring in this phase — builder output is stored, not yet served to visitors (Phase 3 will add the resolver + dynamic route mount).

### 3. Full Journal editor (`/admin/content/journal`)
- List view of journal articles backed by DB (new table `journal_articles`) with status + scheduled publishing.
- Tiptap-powered rich editor with: headings, bold/italic/underline, links, lists, blockquote, code, image (from Media Library), embed, horizontal rule, table of contents auto-generation.
- Metadata sidebar: slug, excerpt, cover image, category, tags, author, read time, publishedAt, scheduledAt, SEO title/description/OG image.
- Draft / Publish / Schedule / Archive lifecycle mirroring CMS Pages.
- Server functions in `src/domains/content/journal/journal.functions.ts`.
- Public site continues to read from static `src/lib/journal.ts` in Phase 2 — a bridge function `getPublishedJournalArticles()` is added but existing homepage/journal index consumers stay untouched. Phase 3 will migrate the public reads with a fallback so no article ever disappears.

### 4. Shared infrastructure
- `src/domains/content/pages/blocks.ts` — block type registry + Zod schemas.
- `src/domains/content/pages/renderBlock.tsx` — SSR-safe renderer used by builder preview (and later, public pages).
- `src/components/os/content/` — `PageList`, `PageEditor`, `BlockPalette`, `BlockCanvas`, `BlockInspector`, `VersionHistoryDrawer`, `PublishBar`, `JournalList`, `JournalEditor`, `TiptapToolbar`.
- Uses existing `AdminShell`, `PageHeader`, `SectionCard`, `StatusChip`, `EmptyState`, `LoadingState`, `ErrorState`.

### 5. Database
One migration adds `journal_articles`, `journal_categories`, `journal_tags`, `journal_article_tags`, `journal_authors` with GRANTs, RLS (staff full access; anon SELECT only published rows on articles/categories/tags/authors), timestamps + update trigger. Seeds categories/authors from existing static data.

### 6. Dependencies
- `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities`
- `@tiptap/react`, `@tiptap/pm`, `@tiptap/starter-kit`, `@tiptap/extension-link`, `@tiptap/extension-image`, `@tiptap/extension-placeholder`, `@tiptap/extension-table` (+ row/cell/header), `@tiptap/extension-underline`
- Installed via `bun add` in a single batch.

## Out of scope (deferred)
- Public dynamic route mount for CMS pages (Phase 3).
- Public journal reads switching to DB (Phase 3 — needs a fallback strategy so no live article disappears).
- SEO Centre UI, Media Library 2.0 UI, AI SEO Assistant (Phase 3).
- Campaigns, Analytics, Reviews, Calendar, Brand Centre (Phase 4).

## Guarantees
- No changes to public routes, SEO, booking/reservation/payment logic, or Pesapal.
- No changes to `src/lib/journal.ts` public API — homepage + journal index continue to render.
- All new server fns are auth-gated; all new tables have RLS + GRANTs in the migration.
- AI-ready interface exports (`pagesAi`, `journalAi`) extended with deterministic placeholders for `summarize`, `suggest`, `analyze`.

## Deliverables checklist
1. DB migration for journal_* tables.
2. `bun add` for dnd-kit + Tiptap.
3. Block registry + renderer + Zod schemas.
4. Pages server fns (CRUD + lifecycle + versions).
5. Journal server fns (CRUD + lifecycle).
6. `/admin/content/pages` list + `/admin/content/pages/$id` editor.
7. `/admin/content/journal` list + `/admin/content/journal/$id` editor.
8. Feature flags `cms_pages` and `journal_editor` flipped to `beta` for staff.
9. Registry route entries updated (journal points at real editor, no longer ComingSoon).

Approve to proceed — I'll ship migration first, then packages, then code in parallel batches.
