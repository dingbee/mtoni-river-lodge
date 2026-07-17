# Mtoni OS — Design System

Sprint 5+ foundation. Every future component must consume these tokens
rather than hard-coding sizes, colors, or spacing.

All tokens live in `src/styles.css`. Primitives live in `src/components/ds/`.

---

## 1. Typography

Fluid scale (mobile-first, `clamp()`-based) — scales continuously from
320 → 1920 px with no breakpoints.

### Size tokens

| Token       | Range               | Tailwind    |
| ----------- | ------------------- | ----------- |
| `--fs-xs`   | 0.75 → 0.8125 rem   | `text-xs`   |
| `--fs-sm`   | 0.8125 → 0.875 rem  | `text-sm`   |
| `--fs-base` | 0.9375 → 1 rem      | `text-base` |
| `--fs-lg`   | 1 → 1.125 rem       | `text-lg`   |
| `--fs-xl`   | 1.0625 → 1.25 rem   | `text-xl`   |
| `--fs-2xl`  | 1.25 → 1.5 rem      | `text-2xl`  |
| `--fs-3xl`  | 1.5 → 1.875 rem     | `text-3xl`  |
| `--fs-4xl`  | 1.75 → 2.25 rem     | `text-4xl`  |
| `--fs-5xl`  | 2 → 3 rem           | `text-5xl`  |
| `--fs-6xl`  | 2.25 → 3.75 rem     | `text-6xl`  |
| `--fs-7xl`  | 2.5 → 4.5 rem       | `text-7xl`  |
| `--fs-8xl`  | 2.75 → 6 rem        | `text-8xl`  |
| `--fs-9xl`  | 3 → 8 rem           | `text-9xl`  |

### Semantic roles (prefer these)

| Role       | Utility         | Component               |
| ---------- | --------------- | ----------------------- |
| Display    | `.type-display` | `<Text role="display">` |
| Hero       | `.type-hero`    | `<Text role="hero">`    |
| H1         | `.type-h1`      | `<Text role="h1">`      |
| H2         | `.type-h2`      | `<Text role="h2">`      |
| H3         | `.type-h3`      | `<Text role="h3">`      |
| Body large | `.type-body-lg` | `<Text role="body-lg">` |
| Body       | `.type-body`    | `<Text role="body">`    |
| Small      | `.type-small`   | `<Text role="small">`   |
| Caption    | `.type-caption` | `<Text role="caption">` |

Families: `--font-display` (Cormorant Garamond), `--font-sans` (Inter),
`--font-mono` (JetBrains Mono).

---

## 2. Spacing

Fluid `--space-*` tokens drive `py-*`, `px-*`, `gap-*`, `mt-*`, `mb-*`.

| Token        | Range         | Use                       |
| ------------ | ------------- | ------------------------- |
| `--space-4`  | 0.75 → 1 rem  | XS — inline pairs         |
| `--space-6`  | 1 → 1.5 rem   | SM — card padding         |
| `--space-8`  | 1.25 → 2 rem  | MD — component gap        |
| `--space-12` | 1.75 → 3 rem  | LG — column gap           |
| `--space-16` | 2 → 4 rem     | XL — section padding sm   |
| `--space-24` | 2.5 → 6 rem   | 2XL — section padding md  |
| `--space-32` | 3 → 8 rem     | 3XL — section padding lg  |

Section-level: `--section-x` (gutter), `--section-y` (rhythm), `--hero-pt`
(hero top offset).

---

## 3. Widths

| Token         | Value | Container            | Use                 |
| ------------- | ----- | -------------------- | ------------------- |
| `--w-reading` | 68ch  | `.container-reading` | Article / prose     |
| `--w-content` | 72rem | `.container-content` | Default page column |
| `--w-wide`    | 88rem | `.container-wide`    | Marketing / gallery |
| `--w-full`    | 100%  | `.container-full`    | Edge-to-edge        |

```tsx
<Container variant="content">…</Container>
<Container variant="reading" as="article">…</Container>
```

---

## 4. Radius

`--radius-sm` 2 px · `--radius-md` 4 px · `--radius-lg` 8 px ·
`--radius-xl` 16 px · `--radius-2xl` 24 px · `--radius-pill` 9999 px.

---

## 5. Elevation (shadows)

| Token         | Utility            | Use                           |
| ------------- | ------------------ | ----------------------------- |
| `--shadow-xs` | `.shadow-token-xs` | Hairline separators           |
| `--shadow-sm` | `.shadow-token-sm` | Resting cards                 |
| `--shadow-md` | `.shadow-token-md` | Raised cards / dropdowns      |
| `--shadow-lg` | `.shadow-token-lg` | Modals / popovers             |
| `--shadow-xl` | `.shadow-token-xl` | Hero widgets / booking widget |

`--shadow-soft` / `--shadow-deep` remain for editorial press-shadows.

---

## 6. Colour (semantic)

Never hard-code `bg-white` / `text-black` / `bg-[#…]`.

| Token                 | Hex / value           | Utility                                    |
| --------------------- | --------------------- | ------------------------------------------ |
| `--background`        | `#FFFFFF`             | `bg-background`                            |
| `--foreground`        | `#1A1A1A`             | `text-foreground`                          |
| `--muted` / `-fg`     | `#F5F5F5` / `#6B6B6B` | `bg-muted` / `text-muted-foreground`       |
| `--primary` / `-fg`   | `#346739` / `#FFFFFF` | `bg-primary` / `text-primary-foreground`   |
| `--accent` / `-fg`    | `#C0B87A` / `#1A1A1A` | `bg-accent` / `text-accent-foreground`     |
| `--card` / `-fg`      | `#FFFFFF` / `#1A1A1A` | `bg-card` / `text-card-foreground`         |
| `--border` / `--input`| rgba charcoal         | `border-border` / `border-input`           |
| `--ring`              | `#346739`             | `ring-ring`                                |

Brand aliases: `--ivory`, `--bone`, `--clay`, `--ember`, `--gold`,
`--river`, `--forest`, `--charcoal`, `--green`.

---

## 7. Primitives (`src/components/ds/`)

```tsx
import { Container, Section, Text } from "@/components/ds";

<Section tone="muted" pad="md" width="content">
  <Text role="h2">Riverside dining</Text>
  <Text role="body-lg" className="mt-4 max-w-2xl">Intro copy…</Text>
</Section>
```

- **`Container`** — column wrapper. `reading | content | wide | full`.
- **`Section`** — full-width band + fluid padding + tone
  (`default | muted | dark`); embeds a `Container`.
- **`Text`** — role → element mapping (display/hero/h1…caption).

Existing token-driven primitives (do not duplicate):

- `SectionCard` (`components/os/SectionCard.tsx`) — admin content card
- `PageHeader` (`components/os/PageHeader.tsx`) — admin page title bar
- `Button` / `Card` / `Badge` / form fields — shadcn under `components/ui/`
- `SiteHeader`, `SiteFooter`, `HeroCinematic`, `PageHero` — public shell

---

## 8. Accessibility contract

- **Contrast:** WCAG AA on light + dark. Never below
  `text-muted-foreground` for body copy.
- **Touch targets:** ≥ 44 × 44 px on mobile. Global rule already enforces
  `min-height: 44px` for `button` / `[role="button"]` at `≤ 767px`.
- **Keyboard:** every interactive element reachable via `Tab`. Never bind
  `onClick` to a `div`.
- **Focus:** rely on the global `:focus-visible` ring (2 px `--color-ring`,
  3 px offset).
- **ARIA:** icon-only buttons need `aria-label`. Prefer shadcn/Radix
  primitives over hand-rolled widgets.
- **Motion:** honour `prefers-reduced-motion` (global reset already does).

---

## 9. Breakpoint strategy

Base type + spacing scale via `clamp()` — no breakpoints. Tailwind
`sm/md/lg/xl/2xl` are reserved for coarse layout swaps only. Verified
continuous behaviour at 320 · 360 · 390 · 412 · 480 · 540 · 600 · 768 ·
1024 · 1280 · 1440 · 1920.

---

## 10. Migration guidance

1. `max-w-[1100px] mx-auto px-6` → `<Container variant="content">`.
2. `<section className="py-24 bg-muted">` → `<Section tone="muted" pad="md">`.
3. `<h2 className="font-display text-5xl">` → `<Text role="h2">`.
4. `text-white` / `bg-black` → semantic tokens.
5. `shadow-[…]` → `.shadow-token-{sm|md|lg|xl}`.

The token layer is additive — the old classes still work. Migrate
opportunistically, not in a big-bang refactor.