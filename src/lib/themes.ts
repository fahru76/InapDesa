/**
 * Listing themes. The owner picks one in Host → Content → Branding; it re-skins the guest pages
 * (listing, checkout, booking pass) by overriding design tokens from globals.css on :root.
 *
 * - "heritage" is the global default, so it needs no overrides.
 * - Other themes override the warm-grey ramp, ink/paper, surfaces, the deep "teak" band colours,
 *   the brass decoration trio, the display font and corner radii, plus their own dark-mode surfaces.
 * - "malam" is dark-only: pages render a `data-page-scheme="dark"` marker that turns on the `dark:`
 *   variant whatever the guest's system setting is (see @custom-variant in globals.css).
 *
 * Contrast for every theme is checked in src/lib/themes.test.ts (WCAG AA, 4.5:1 for text).
 */

export const THEME_PRESETS = ["heritage", "malam", "tanah", "pesisir", "galeri", "peranakan", "classic"] as const;
export type ThemePreset = (typeof THEME_PRESETS)[number];

export interface ThemeMeta {
  label: string;
  hint: string;
  /** Accent suggested when the owner switches to this theme. */
  accent: string;
  /** Colours for the picker swatch. */
  swatch: { bg: string; band: string; deco: string; text: string };
  /** Heading font-family, for the picker swatch. */
  font: string;
  scheme: "auto" | "dark";
}

const FONTS = {
  sans: `"Plus Jakarta Sans Variable", "Plus Jakarta Sans", ui-sans-serif, system-ui, sans-serif`,
  cormorant: `"Cormorant Garamond Variable", "Cormorant Garamond", Georgia, serif`,
  lora: `"Lora Variable", Lora, Georgia, serif`,
  playfair: `"Playfair Display Variable", "Playfair Display", Georgia, serif`,
  bodoni: `"Libre Bodoni Variable", "Libre Bodoni", Didot, "Bodoni 72", Georgia, serif`,
  cinzel: `"Cinzel Variable", Cinzel, "Trajan Pro", Georgia, serif`,
};

export const THEMES: Record<ThemePreset, ThemeMeta> = {
  heritage: {
    label: "Heritage",
    hint: "Ivory and teak, classical serif, brass details",
    accent: "#2f5d46",
    swatch: { bg: "#f7f2e9", band: "#1c1712", deco: "#b08d57", text: "#1c1712" },
    font: FONTS.cormorant,
    scheme: "auto",
  },
  malam: {
    label: "Malam",
    hint: "Dark luxury: near-black teak, champagne gold, sharp corners",
    accent: "#8a6a35",
    swatch: { bg: "#120f0c", band: "#2a221b", deco: "#c9a96e", text: "#f3ebdd" },
    font: FONTS.cormorant,
    scheme: "dark",
  },
  tanah: {
    label: "Tanah",
    hint: "Earth and clay: sand, terracotta, olive, soft corners",
    accent: "#a4472a",
    swatch: { bg: "#f5efe4", band: "#2e1e16", deco: "#c67b5c", text: "#2b211a" },
    font: FONTS.lora,
    scheme: "auto",
  },
  pesisir: {
    label: "Pesisir",
    hint: "Coastal: sea-salt white, ocean navy, sand gold",
    accent: "#1f4e6e",
    swatch: { bg: "#f6f7f4", band: "#0e1e30", deco: "#c8b48a", text: "#14283d" },
    font: FONTS.playfair,
    scheme: "auto",
  },
  galeri: {
    label: "Galeri",
    hint: "Minimal editorial: white, black ink, square corners",
    accent: "#111111",
    swatch: { bg: "#ffffff", band: "#111111", deco: "#8a8a85", text: "#111111" },
    font: FONTS.bodoni,
    scheme: "auto",
  },
  peranakan: {
    label: "Peranakan",
    hint: "Straits heritage: jade, coral and marigold on cream",
    accent: "#1f6b5c",
    swatch: { bg: "#fbf6ec", band: "#12302a", deco: "#d9a441", text: "#1f2a28" },
    font: FONTS.cinzel,
    scheme: "auto",
  },
  classic: {
    label: "Classic",
    hint: "Clean white and grey, all sans-serif",
    accent: "#059669",
    swatch: { bg: "#ffffff", band: "#0f172a", deco: "#cbd5e1", text: "#0f172a" },
    font: FONTS.sans,
    scheme: "auto",
  },
};

/** Kept for existing imports. */
export const THEME_PRESET_LABELS = Object.fromEntries(
  THEME_PRESETS.map((p) => [p, { label: THEMES[p].label, hint: THEMES[p].hint }]),
) as Record<ThemePreset, { label: string; hint: string }>;

export function isThemePreset(v: unknown): v is ThemePreset {
  return typeof v === "string" && (THEME_PRESETS as readonly string[]).includes(v);
}

export function themeScheme(preset: string | null | undefined): "auto" | "dark" {
  return isThemePreset(preset) ? THEMES[preset].scheme : "auto";
}

const STEPS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950] as const;
type Ramp = [string, string, string, string, string, string, string, string, string, string, string];

export interface ThemeTokens {
  /** Warm-grey ramp 50…950 (replaces Tailwind zinc). */
  zinc?: Ramp;
  ink?: string;
  paper?: string;
  ivory?: string;
  /** Deep band colours: 700, 800, 900, 950. */
  teak?: [string, string, string, string];
  /** Decoration on light, decoration/text on dark, text-safe tone on light. */
  brass?: [string, string, string];
  display?: string;
  displayTracking?: string;
  /** font-size-adjust for headings, so wide faces sit at the same visual size as the default serif. */
  displayAdjust?: string;
  /** Radius for xl, 2xl, 3xl (cards, inputs, large buttons). */
  radius?: [string, string, string];
  surface: string;
  surfaceMuted: string;
  dark: { surface: string; surfaceMuted: string; muted: string };
  extra?: string[];
}

/** Light-mode values (Malam: its only, dark, values). Exported for the contrast tests. */
export const THEME_TOKENS: Record<Exclude<ThemePreset, "heritage">, ThemeTokens> = {
  classic: {
    zinc: ["#fafafa", "#f4f4f5", "#e4e4e7", "#d4d4d8", "#a1a1aa", "#71717a", "#52525b", "#3f3f46", "#27272a", "#18181b", "#09090b"],
    ink: "#0f172a",
    paper: "#ffffff",
    display: "var(--font-sans)",
    surface: "#ffffff",
    surfaceMuted: "#faf8f5",
    dark: { surface: "#0b0f19", surfaceMuted: "#0f1422", muted: "#8e8e98" },
  },
  malam: {
    teak: ["#3a2f25", "#2a221b", "#1c1712", "#0b0907"],
    radius: ["0.375rem", "0.5rem", "0.75rem"],
    surface: "#120f0c",
    surfaceMuted: "#1a1612",
    dark: { surface: "#120f0c", surfaceMuted: "#1a1612", muted: "#a3978a" },
    extra: ["color-scheme:dark", "--color-terracotta-600:#e08a5c", "--drop-cap-color:var(--color-brand-300)"],
  },
  tanah: {
    zinc: ["#fbf8f2", "#f3ece0", "#e6dccb", "#d3c5b0", "#a8977f", "#6e5f50", "#574a3e", "#43382f", "#2e2620", "#211b16", "#16110d"],
    ink: "#2b211a",
    paper: "#fbf7f0",
    ivory: "#f8efe2",
    teak: ["#4f3628", "#3e2a1f", "#2e1e16", "#1e1410"],
    brass: ["#c67b5c", "#dba184", "#8a4a2e"],
    display: FONTS.lora,
    displayTracking: "-0.005em",
    radius: ["1rem", "1.5rem", "2rem"],
    surface: "#f5efe4",
    surfaceMuted: "#ede4d4",
    dark: { surface: "#16110d", surfaceMuted: "#1d1712", muted: "#a5937f" },
  },
  pesisir: {
    zinc: ["#f7f9fa", "#eef2f4", "#dde4e8", "#c4cfd6", "#93a1ac", "#566472", "#45525f", "#34404c", "#223039", "#162029", "#0c141a"],
    ink: "#14283d",
    paper: "#ffffff",
    ivory: "#f4f1ea",
    teak: ["#20364f", "#16293f", "#0e1e30", "#08131f"],
    brass: ["#c8b48a", "#dcc9a0", "#76603a"],
    display: FONTS.playfair,
    radius: ["0.75rem", "1rem", "1.25rem"],
    surface: "#f6f7f4",
    surfaceMuted: "#edf0ee",
    dark: { surface: "#0b131b", surfaceMuted: "#111b24", muted: "#8d9aa6" },
  },
  galeri: {
    zinc: ["#fafafa", "#f5f5f4", "#e5e5e3", "#d4d4d1", "#a3a3a0", "#5f5f5c", "#4f4f4c", "#3d3d3b", "#262625", "#171716", "#0a0a0a"],
    ink: "#111111",
    paper: "#ffffff",
    ivory: "#f5f5f2",
    teak: ["#2a2a2a", "#1c1c1c", "#111111", "#050505"],
    brass: ["#8a8a85", "#c8c8c2", "#55554f"],
    display: FONTS.bodoni,
    displayTracking: "0",
    displayAdjust: "0.4",
    radius: ["0", "0", "0"],
    surface: "#ffffff",
    surfaceMuted: "#f5f5f3",
    dark: { surface: "#0b0b0b", surfaceMuted: "#141414", muted: "#929290" },
  },
  peranakan: {
    zinc: ["#faf7f0", "#f2ede2", "#e6dfcf", "#d0c8b6", "#9aa19b", "#5d6a66", "#4a5652", "#38423f", "#262e2c", "#1a2120", "#101514"],
    ink: "#1f2a28",
    paper: "#ffffff",
    ivory: "#fbf3e4",
    teak: ["#234f45", "#1a3f37", "#12302a", "#0b1f1b"],
    brass: ["#d9a441", "#e8bf6a", "#b0463c"],
    display: FONTS.cinzel,
    displayTracking: "0.03em",
    displayAdjust: "0.4",
    radius: ["0.75rem", "1rem", "1.5rem"],
    surface: "#fbf6ec",
    surfaceMuted: "#f3ecdc",
    dark: { surface: "#0e1513", surfaceMuted: "#141d1a", muted: "#8f9b96" },
  },
};

function declarations(t: ThemeTokens): string[] {
  const d: string[] = [];
  t.zinc?.forEach((v, i) => d.push(`--color-zinc-${STEPS[i]}:${v}`));
  if (t.ink) d.push(`--color-ink:${t.ink}`);
  if (t.paper) d.push(`--color-paper:${t.paper}`);
  if (t.ivory) d.push(`--color-ivory:${t.ivory}`);
  if (t.teak) {
    const [a, b, c, e] = t.teak;
    d.push(`--color-teak-700:${a}`, `--color-teak-800:${b}`, `--color-teak-900:${c}`, `--color-teak-950:${e}`);
  }
  if (t.brass) d.push(`--color-brass:${t.brass[0]}`, `--color-brass-light:${t.brass[1]}`, `--color-brass-ink:${t.brass[2]}`);
  if (t.display) d.push(`--font-display:${t.display}`);
  if (t.displayTracking) d.push(`--display-tracking:${t.displayTracking}`);
  if (t.displayAdjust) d.push(`--display-adjust:${t.displayAdjust}`);
  if (t.radius) d.push(`--radius-xl:${t.radius[0]}`, `--radius-2xl:${t.radius[1]}`, `--radius-3xl:${t.radius[2]}`);
  d.push(`--surface:${t.surface}`, `--surface-muted:${t.surfaceMuted}`);
  if (t.extra) d.push(...t.extra);
  return d;
}

/** Declarations for scoping a theme to one element (the editor preview). Empty for heritage. */
export function themeVars(preset: string | null | undefined): string {
  if (!isThemePreset(preset) || preset === "heritage") return "";
  const t = THEME_TOKENS[preset];
  const d = declarations(t);
  if (THEMES[preset].scheme === "dark") d.push(`--color-zinc-500:${t.dark.muted}`);
  return d.join(";");
}

/** Page CSS for a listing's theme (rendered in a <style> tag). Empty for heritage. */
export function themeCss(preset: string | null | undefined): string {
  if (!isThemePreset(preset) || preset === "heritage") return "";
  const t = THEME_TOKENS[preset];
  let css = `:root{${themeVars(preset)}}`;
  if (THEMES[preset].scheme !== "dark") {
    css += `@media (prefers-color-scheme: dark){:root{--surface:${t.dark.surface};--surface-muted:${t.dark.surfaceMuted};--color-zinc-500:${t.dark.muted}}}`;
  }
  // Cinzel has no italic; keep italic display text upright instead of a faux slant.
  if (preset === "peranakan") css += `.font-display.italic,.display.italic{font-style:normal}`;
  return css;
}
