import { describe, expect, it } from "vitest";
import { AA_TEXT, contrastRatio, deriveDirectTheme, DIRECT_THEME_DEFAULTS, legacyPaletteOverrides } from "./direct-booking-theme";

const palettes = {
  defaultForest: DIRECT_THEME_DEFAULTS,
  lightPrimary: { primaryColor: "#f4d35e", secondaryColor: "#ffe8a3", backgroundColor: "#ffffff", textColor: "#222222" },
  darkPage: { primaryColor: "#c6a878", secondaryColor: "#8fb3a1", backgroundColor: "#121614", textColor: "#f2f0ea" },
  lowContrastRequest: { primaryColor: "#1e88e5", secondaryColor: "#fafafa", backgroundColor: "#f7f7f7", textColor: "#c8c8c8" },
  terracotta: { primaryColor: "#a4502f", secondaryColor: "#e0b48a", backgroundColor: "#fbf6f0", textColor: "#3a2a20" },
};

describe("deriveDirectTheme", () => {
  it("returns the configured colours for the four base tokens", () => {
    const t = deriveDirectTheme(palettes.terracotta);
    expect(t["--direct-primary"]).toBe("#a4502f");
    expect(t["--direct-secondary"]).toBe("#e0b48a");
    expect(t["--direct-background"]).toBe("#fbf6f0");
  });

  it("falls back to defaults for missing or malformed colours", () => {
    const t = deriveDirectTheme({ primaryColor: "green", secondaryColor: null, backgroundColor: "#12345", textColor: undefined });
    expect(t["--direct-primary"]).toBe(DIRECT_THEME_DEFAULTS.primaryColor);
    expect(t["--direct-background"]).toBe(DIRECT_THEME_DEFAULTS.backgroundColor);
  });

  it("derives a different palette for different properties", () => {
    expect(deriveDirectTheme(palettes.terracotta)["--direct-border-strong"])
      .not.toBe(deriveDirectTheme(palettes.defaultForest)["--direct-border-strong"]);
  });

  for (const [name, palette] of Object.entries(palettes)) {
    describe(name, () => {
      const t = deriveDirectTheme(palette);
      const surfaces = ["--direct-surface", "--direct-surface-muted", "--direct-background", "--direct-surface-sunken"] as const;

      it("keeps body, subtle, muted and accent text at WCAG AA on every surface", () => {
        for (const token of ["--direct-text", "--direct-text-subtle", "--direct-muted", "--direct-accent-text"] as const) {
          for (const surface of surfaces) {
            expect(contrastRatio(t[token], t[surface]), `${token} on ${surface}`).toBeGreaterThanOrEqual(AA_TEXT);
          }
        }
      });

      it("picks readable text for primary buttons and soft selected states", () => {
        expect(contrastRatio(t["--direct-on-primary"], t["--direct-primary"])).toBeGreaterThanOrEqual(AA_TEXT);
        expect(contrastRatio(t["--direct-on-primary"], t["--direct-primary-hover"])).toBeGreaterThanOrEqual(3);
        expect(contrastRatio(t["--direct-on-primary-soft"], t["--direct-primary-soft"])).toBeGreaterThanOrEqual(AA_TEXT);
      });

      it("keeps white hero text readable on the image overlay", () => {
        expect(contrastRatio("#ffffff", t["--direct-overlay"])).toBeGreaterThanOrEqual(AA_TEXT);
      });
    });
  }

  it("uses dark button text on a light primary colour", () => {
    expect(deriveDirectTheme(palettes.lightPrimary)["--direct-on-primary"]).toBe("#000000");
    expect(deriveDirectTheme(palettes.defaultForest)["--direct-on-primary"]).toBe("#ffffff");
  });

  it("maps tokens onto the shared palette variables used by the step booking page", () => {
    const t = deriveDirectTheme(palettes.terracotta);
    expect(legacyPaletteOverrides(t)).toEqual({
      "--charcoal": t["--direct-text"],
      "--ivory": t["--direct-background"],
      "--bone": t["--direct-surface-muted"],
      "--forest": t["--direct-primary"],
      "--muted-foreground": t["--direct-muted"],
    });
  });
});
