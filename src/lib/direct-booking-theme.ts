/**
 * Property-neutral colour tokens for the public direct-booking pages.
 *
 * A property configures four colours (primary, secondary, background, text).
 * Every other colour on the guest pages — surfaces, borders, muted text,
 * selected states, overlays, shadows — is derived from those four here, so a
 * property's palette re-themes the whole page instead of only its buttons.
 * Text tokens are adjusted until they meet WCAG AA contrast (4.5:1) against
 * the surfaces they sit on, whatever colours the property chooses.
 */

export type DirectBrandColors = {
  primaryColor?: string | null;
  secondaryColor?: string | null;
  backgroundColor?: string | null;
  textColor?: string | null;
};

type Rgb = [number, number, number];

export const DIRECT_THEME_DEFAULTS = {
  primaryColor: "#1e352a",
  secondaryColor: "#c6a878",
  backgroundColor: "#f5f4ef",
  textColor: "#202820",
} as const;

const HEX = /^#[0-9a-fA-F]{6}$/;
const WHITE: Rgb = [255, 255, 255];
const BLACK: Rgb = [0, 0, 0];
export const AA_TEXT = 4.5;

export function normalizeHex(value: string | null | undefined, fallback: string): string {
  return typeof value === "string" && HEX.test(value.trim()) ? value.trim().toLowerCase() : fallback;
}

function toRgb(hex: string): Rgb {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function toHex([r, g, b]: Rgb): string {
  return `#${[r, g, b].map((c) => Math.round(Math.min(255, Math.max(0, c))).toString(16).padStart(2, "0")).join("")}`;
}

/** Linear sRGB mix: weight is the share of `a` (0..1). */
function mix(a: Rgb, b: Rgb, weight: number): Rgb {
  return [0, 1, 2].map((i) => a[i] * weight + b[i] * (1 - weight)) as Rgb;
}

function luminance([r, g, b]: Rgb): number {
  const channel = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function contrastRatio(a: string, b: string): number {
  const la = luminance(toRgb(a));
  const lb = luminance(toRgb(b));
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Text colour (white or black) that reads best on the given background. */
function bestOn(background: Rgb): Rgb {
  const bg = toHex(background);
  return contrastRatio(toHex(WHITE), bg) >= contrastRatio(toHex(BLACK), bg) ? WHITE : BLACK;
}

/**
 * Moves `color` toward the colour that contrasts most with every background
 * until it reaches `ratio` against all of them. Returns the first passing step,
 * so the result stays as close to the requested colour as possible.
 */
function ensureContrast(color: Rgb, backgrounds: Rgb[], ratio = AA_TEXT): Rgb {
  const passes = (c: Rgb) => backgrounds.every((bg) => contrastRatio(toHex(c), toHex(bg)) >= ratio);
  if (passes(color)) return color;
  const target = bestOn(backgrounds[0]);
  for (let step = 1; step <= 20; step += 1) {
    const candidate = mix(target, color, step / 20);
    if (passes(candidate)) return candidate;
  }
  return target;
}

function rgbaString([r, g, b]: Rgb, alpha: number): string {
  return `rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}, ${alpha})`;
}

export type DirectThemeTokens = Record<`--${string}`, string>;

export function deriveDirectTheme(colors: DirectBrandColors): DirectThemeTokens {
  const primaryHex = normalizeHex(colors.primaryColor, DIRECT_THEME_DEFAULTS.primaryColor);
  const secondaryHex = normalizeHex(colors.secondaryColor, DIRECT_THEME_DEFAULTS.secondaryColor);
  const backgroundHex = normalizeHex(colors.backgroundColor, DIRECT_THEME_DEFAULTS.backgroundColor);
  const requestedTextHex = normalizeHex(colors.textColor, DIRECT_THEME_DEFAULTS.textColor);

  const primary = toRgb(primaryHex);
  const secondary = toRgb(secondaryHex);
  const background = toRgb(backgroundHex);
  const isLightBackground = luminance(background) > 0.18;

  // Cards sit slightly above the page: toward white on light pages, toward the
  // text colour on dark pages.
  const surface = isLightBackground ? mix(WHITE, background, 0.75) : mix(toRgb(requestedTextHex), background, 0.06);
  const surfaceMuted = mix(toRgb(requestedTextHex), surface, 0.025);
  const surfaceSunken = mix(toRgb(requestedTextHex), background, 0.05);
  const surfaces = [surface, surfaceMuted, background, surfaceSunken];

  const text = ensureContrast(toRgb(requestedTextHex), surfaces, 7);
  const textSubtle = ensureContrast(mix(text, surface, 0.78), surfaces);
  const muted = ensureContrast(mix(text, surface, 0.6), surfaces);

  const onPrimary = bestOn(primary);
  const primaryHover = mix(onPrimary, primary, 0.12);
  const primarySoft = mix(primary, surface, 0.1);
  const primarySoftBorder = mix(primary, surface, 0.25);
  const onPrimarySoft = ensureContrast(primary, [primarySoft, surface]);
  // Accent text uses the secondary colour, darkened or lightened just enough to
  // stay readable on cards and on the page background.
  const accentText = ensureContrast(secondary, surfaces);
  // Image overlays are always dark so white hero text stays readable.
  const overlay = mix(primary, BLACK, 0.35);
  const accentOnDark = ensureContrast(secondary, [overlay, mix(overlay, BLACK, 0.8)]);
  const shadowBase = isLightBackground ? text : BLACK;

  return {
    "--direct-primary": primaryHex,
    "--direct-primary-hover": toHex(primaryHover),
    "--direct-on-primary": toHex(onPrimary),
    "--direct-primary-soft": toHex(primarySoft),
    "--direct-primary-soft-border": toHex(primarySoftBorder),
    "--direct-on-primary-soft": toHex(onPrimarySoft),
    "--direct-secondary": secondaryHex,
    "--direct-accent-text": toHex(accentText),
    "--direct-accent-on-dark": toHex(accentOnDark),
    "--direct-background": backgroundHex,
    "--direct-surface": toHex(surface),
    "--direct-surface-muted": toHex(surfaceMuted),
    "--direct-surface-sunken": toHex(surfaceSunken),
    "--direct-text": toHex(text),
    "--direct-text-subtle": toHex(textSubtle),
    "--direct-muted": toHex(muted),
    "--direct-border": toHex(mix(text, surface, 0.1)),
    "--direct-border-strong": toHex(mix(primary, surface, 0.55)),
    "--direct-overlay": toHex(overlay),
    "--direct-shadow": rgbaString(shadowBase, 0.1),
    "--direct-shadow-soft": rgbaString(shadowBase, 0.06),
  };
}

/**
 * Maps the derived tokens onto the shared site palette variables that the
 * step-based booking page (/p/$propertySlug/book) already uses, so that page is
 * re-themed without rewriting its class names.
 */
export function legacyPaletteOverrides(tokens: DirectThemeTokens): DirectThemeTokens {
  return {
    "--charcoal": tokens["--direct-text"],
    "--ivory": tokens["--direct-background"],
    "--bone": tokens["--direct-surface-muted"],
    "--forest": tokens["--direct-primary"],
    "--muted-foreground": tokens["--direct-muted"],
  };
}
