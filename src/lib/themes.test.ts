import { describe, expect, it } from "vitest";
import { contrastWithWhite, MIN_ACCENT_CONTRAST } from "./content";
import { isThemePreset, THEME_PRESETS, THEME_TOKENS, THEMES, themeCss, themeScheme, themeVars } from "./themes";

function lum(hex: string): number {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!m) throw new Error(`bad hex ${hex}`);
  const c = [m[1], m[2], m[3]].map((h) => {
    const s = parseInt(h as string, 16) / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
const contrast = (a: string, b: string) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p) as [number, number];
  return (x + 0.05) / (y + 0.05);
};

// Heritage values from globals.css, used where a theme doesn't override a token.
const BASE = { zinc100: "#f2ece2", zinc500: "#776c5d", ink: "#1c1712", paper: "#fffcf6", ivory: "#f7f2e9", brassInk: "#7a5f35", brassLight: "#c9a96e", teak900: "#1c1712" };

const LIGHT = (["tanah", "pesisir", "galeri", "peranakan", "classic"] as const).map((p) => [p, THEME_TOKENS[p]] as const);

describe("themes: light-mode contrast (WCAG AA 4.5:1)", () => {
  it.each(LIGHT)("%s", (_p, t) => {
    const ink = t.ink ?? BASE.ink;
    const muted = t.zinc?.[5] ?? BASE.zinc500;
    const brassInk = t.brass?.[2] ?? BASE.brassInk;
    for (const bg of [t.surface, t.surfaceMuted, t.paper ?? BASE.paper]) {
      expect(contrast(ink, bg)).toBeGreaterThanOrEqual(7);
      expect(contrast(muted, bg)).toBeGreaterThanOrEqual(4.5);
    }
    // Eyebrow labels use brass-ink on the page background.
    expect(contrast(brassInk, t.surface)).toBeGreaterThanOrEqual(4.5);
    // Text on deep bands: ivory and brass-light on teak-900.
    const band = t.teak?.[2] ?? BASE.teak900;
    expect(contrast(t.ivory ?? BASE.ivory, band)).toBeGreaterThanOrEqual(7);
    expect(contrast(t.brass?.[1] ?? BASE.brassLight, band)).toBeGreaterThanOrEqual(4.5);
  });
});

describe("themes: dark-mode contrast", () => {
  it.each(THEME_PRESETS.filter((p) => p !== "heritage"))("%s", (p) => {
    const t = THEME_TOKENS[p as Exclude<typeof p, "heritage">];
    const text = t.zinc?.[1] ?? BASE.zinc100; // dark:text-zinc-100
    for (const bg of [t.dark.surface, t.dark.surfaceMuted]) {
      expect(contrast(text, bg)).toBeGreaterThanOrEqual(7);
      expect(contrast(t.dark.muted, bg)).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe("themes: suggested accents", () => {
  it.each(THEME_PRESETS)("%s accent passes the editor's white-text check", (p) => {
    expect(contrastWithWhite(THEMES[p].accent)).toBeGreaterThanOrEqual(MIN_ACCENT_CONTRAST);
  });
  it.each(THEME_PRESETS.filter((p) => p !== "classic"))("%s accent is AA for normal text (4.5:1)", (p) => {
    expect(contrastWithWhite(THEMES[p].accent)).toBeGreaterThanOrEqual(4.5);
  });
});

describe("themes: css output", () => {
  it("heritage needs no overrides", () => {
    expect(themeCss("heritage")).toBe("");
    expect(themeVars("heritage")).toBe("");
  });
  it("unknown values fall back to heritage", () => {
    expect(isThemePreset("bogus")).toBe(false);
    expect(themeCss("bogus")).toBe("");
    expect(themeScheme(null)).toBe("auto");
  });
  it.each(["tanah", "pesisir", "galeri", "peranakan"])("%s sets a display font and its own dark surfaces", (p) => {
    const css = themeCss(p);
    expect(css).toMatch(/--font-display:/);
    expect(css).toMatch(/@media \(prefers-color-scheme: dark\)/);
  });
  it("malam is dark-only and sets color-scheme", () => {
    expect(themeScheme("malam")).toBe("dark");
    expect(themeCss("malam")).toContain("color-scheme:dark");
    expect(themeCss("malam")).not.toContain("prefers-color-scheme");
  });
  it("css contains nothing that could close the <style> tag", () => {
    for (const p of THEME_PRESETS) expect(themeCss(p)).not.toMatch(/[<>]/);
  });
});
