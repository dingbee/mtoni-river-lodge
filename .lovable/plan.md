# Mtoni River Lodge — Cinematic Polish Pass

Motion intensity: **3/5** (calm, editorial — never showy). Hero media stays the existing video + posters; only grading/timing is refined. Reduced-motion is honored everywhere.

## 1. Motion foundation (shared)

- Extend `src/components/site/Reveal.tsx` (already used in hero) with variants: `up` (default, 24px), `fade`, `image-parallax` (subtle 6–8% Y translate while in viewport). All gated by `prefers-reduced-motion` and `IntersectionObserver` so off-screen sections cost nothing.
- Add tiny `useParallax` hook (rAF-throttled) for hero-style backgrounds on dining + experiences sections.
- Add reusable `<EditorialRow>` (image ↔ text, alternating) used by dining and experiences.

## 2. Hero refinement (`HeroCinematic.tsx`)

- Slow the Ken Burns to ~24s and stretch poster crossfade to 2400ms for a calmer cadence.
- Slightly warmer grade (already a soft-light overlay) — nudge to deeper top/bottom vignette for typography contrast on mobile.
- Add a quiet scroll-cue chevron (fades out after first scroll).
- No new assets; video + poster set untouched.

## 3. Homepage (`/`)

- Wrap each major band in `<Reveal>` with staggered child delays (60–120ms).
- Rooms teaser: image-zoom on hover (scale 1.04, 700ms ease-out), caption underline grow, CTA arrow nudge.
- Experiences: convert to alternating editorial rows with parallax image fill.
- Dining teaser: editorial image-text split, soft caption reveal.
- Final CTA band: keep clean, only fade-up.

## 4. Rooms (`/rooms`, `/rooms/*`)

- Card hover: image zoom + soft shadow lift + amenities line slides in.
- Detail pages: gallery strip becomes click-to-lightbox (shared lightbox component, see §7).
- Amenities reveal staggered as user scrolls.

## 5. Dining (`/dining`)

- Editorial alternating layout (image ↔ copy), generous whitespace.
- Atmosphere-first imagery sequencing; soft fade-up on each row.
- Keep menu/info legibility — no parallax over text.

## 6. Experiences (`/experiences`)

- Cards animate in with staggered scale+fade as they enter viewport.
- Subtle hover lift + image zoom.

## 7. New `/gallery` route

- New file `src/routes/gallery.tsx` with route head() metadata.
- Curated set drawn from existing room/dining/experience imagery (collected in `src/lib/gallery.ts`).
- Responsive masonry grid (CSS columns), progressive loading (`loading="lazy"`, `decoding="async"`, blur-up via `aspect-ratio` placeholders).
- New `<Lightbox>` component (`src/components/site/Lightbox.tsx`): keyboard nav (←/→/Esc), swipe on touch, focus trap, scroll lock, smooth fade+scale transitions. No new library — vanilla React + Tailwind.
- Add `/gallery` to header nav and footer.

## 8. Micro-interactions (sitewide)

- Buttons: 200ms hover (background + arrow translate). Already largely present; standardize via small additions to `button.tsx` variants where missing.
- Links in editorial copy: `story-link` underline grow.
- Image cards: `transition-transform duration-700 ease-[cubic-bezier(.22,1,.36,1)] hover:scale-[1.04]` inside `overflow-hidden`.

## 9. Booking (`/book`)

- **No animation changes.** Trust + clarity preserved. Only verify reveal wrappers don't wrap the wizard.

## 10. Performance & a11y

- All new motion gated by `prefers-reduced-motion`.
- Images: keep `loading="lazy"`, `decoding="async"`, `fetchpriority` only on LCP (hero first poster).
- IntersectionObserver disconnects after first reveal.
- No new heavy libraries (no framer-motion, no GSAP) — CSS transitions + tiny rAF hook.
- Mobile sticky CTA + WhatsApp position unchanged.

## Files to touch

- `src/components/site/Reveal.tsx` (variants)
- `src/components/site/HeroCinematic.tsx` (timing/grade/scroll cue)
- `src/components/site/EditorialRow.tsx` (new)
- `src/components/site/Lightbox.tsx` (new)
- `src/lib/gallery.ts` (new — curated image list)
- `src/routes/gallery.tsx` (new)
- `src/routes/index.tsx` (reveals + editorial rooms/dining/experiences blocks)
- `src/routes/dining.tsx` (editorial rows)
- `src/routes/experiences.tsx` (staggered reveal + hover)
- `src/routes/rooms.index.tsx`, `rooms.riverfront-deluxe.tsx`, `rooms.standard-river.tsx`, `rooms.family-room.tsx` (hover + lightbox)
- `src/components/site/SiteHeader.tsx`, `SiteFooter.tsx` (Gallery link)

## Out of scope (this pass)

- New hero video/photography
- Backend or booking-flow changes
- Visual redesign of booking wizard or admin pages
