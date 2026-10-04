import {
  Baby,
  Bike,
  Camera,
  Car,
  ChefHat,
  Coffee,
  Compass,
  Fish,
  Flower2,
  Heart,
  Plane,
  KeyRound,
  Leaf,
  MapPin,
  MoonStar,
  Mountain,
  Sailboat,
  Sparkles,
  Star,
  Sunrise,
  Tent,
  Trees,
  Utensils,
  Waves,
  Wifi,
  type LucideIcon,
} from "lucide-react";
import { z } from "zod";
import { THEME_PRESETS } from "./themes";

// ─── Locales ───────────────────────────────────────────────────────────────
export const LOCALES = ["en", "ms"] as const;
export type Locale = (typeof LOCALES)[number];
export const LOCALE_LABELS: Record<Locale, string> = { en: "English", ms: "Bahasa Melayu" };

export function isLocale(v: unknown): v is Locale {
  return v === "en" || v === "ms";
}

/** Bilingual text. English is required; Malay falls back to English when empty. */
export interface LText {
  en: string;
  ms?: string;
}

export function loc(t: LText | undefined | null, locale: Locale): string {
  if (!t) return "";
  if (locale === "ms" && t.ms && t.ms.trim() !== "") return t.ms;
  return t.en;
}

// ─── Sections ──────────────────────────────────────────────────────────────
export const SECTION_TYPES = ["highlights", "services", "experiences", "faq", "house_guide", "text"] as const;
export type SectionType = (typeof SECTION_TYPES)[number];
export type Audience = "public" | "guests";

export interface SectionItem {
  id: string;
  icon?: string;
  title: LText;
  text: LText;
  /** Short extra line, e.g. "10 min drive". */
  meta?: LText;
}

export interface ContentSection {
  id: string;
  type: SectionType;
  audience: Audience;
  visible: boolean;
  title: LText;
  body?: LText;
  items: SectionItem[];
}

export const SECTION_META: Record<SectionType, { label: string; hint: string; defaultTitle: LText; hasItems: boolean; defaultAudience: Audience }> = {
  highlights: {
    label: "Highlights",
    hint: "3–6 short reasons guests love your home, each with an icon.",
    defaultTitle: { en: "Why guests love it", ms: "Kenapa tetamu suka" },
    hasItems: true,
    defaultAudience: "public",
  },
  services: {
    label: "Concierge & extras",
    hint: "Services you can arrange: airport pickup, breakfast, private chef. Add a price or \"On request\".",
    defaultTitle: { en: "Concierge & extras", ms: "Layanan & tambahan" },
    hasItems: true,
    defaultAudience: "public",
  },
  experiences: {
    label: "Nearby & experiences",
    hint: "Attractions, food spots and activities, with travel time.",
    defaultTitle: { en: "Things to do nearby", ms: "Aktiviti berdekatan" },
    hasItems: true,
    defaultAudience: "public",
  },
  faq: {
    label: "FAQ",
    hint: "Answer the questions guests usually ask before booking.",
    defaultTitle: { en: "Frequently asked questions", ms: "Soalan lazim" },
    hasItems: true,
    defaultAudience: "public",
  },
  house_guide: {
    label: "House guide",
    hint: "Wi-Fi, door codes, appliances, parking. Shown only to paid guests.",
    defaultTitle: { en: "House guide", ms: "Panduan rumah" },
    hasItems: true,
    defaultAudience: "guests",
  },
  text: {
    label: "Text block",
    hint: "Free text: your story, neighbourhood, special offers.",
    defaultTitle: { en: "Our story", ms: "Kisah kami" },
    hasItems: false,
    defaultAudience: "public",
  },
};

/** Curated icon set for highlight items (keys are stored in the database). */
export const SECTION_ICONS: Record<string, LucideIcon> = {
  sparkles: Sparkles,
  sunrise: Sunrise,
  trees: Trees,
  waves: Waves,
  mountain: Mountain,
  utensils: Utensils,
  chef: ChefHat,
  coffee: Coffee,
  bike: Bike,
  camera: Camera,
  heart: Heart,
  moon: MoonStar,
  key: KeyRound,
  leaf: Leaf,
  pin: MapPin,
  star: Star,
  family: Baby,
  car: Car,
  wifi: Wifi,
  fish: Fish,
  tent: Tent,
  flower: Flower2,
  boat: Sailboat,
  compass: Compass,
  plane: Plane,
};

export function sectionIcon(key: string | undefined): LucideIcon {
  return (key && SECTION_ICONS[key]) || Sparkles;
}

// ─── Branding ──────────────────────────────────────────────────────────────
export const HERO_LAYOUTS = ["grand", "mosaic", "cinematic", "split"] as const;
export type HeroLayout = (typeof HERO_LAYOUTS)[number];
export const HERO_LAYOUT_LABELS: Record<HeroLayout, { label: string; hint: string }> = {
  grand: { label: "Grand", hint: "Full-screen cover, slow drift, booking bar on top" },
  mosaic: { label: "Mosaic", hint: "Large cover + 4 photos grid" },
  cinematic: { label: "Cinematic", hint: "Full-width cover with title overlay" },
  split: { label: "Split", hint: "Cover photo beside your title and tagline" },
};

export function isHeroLayout(v: unknown): v is HeroLayout {
  return typeof v === "string" && (HERO_LAYOUTS as readonly string[]).includes(v);
}

// Listing themes live in ./themes (re-exported here for existing imports).
export { THEME_PRESETS, THEME_PRESET_LABELS, THEMES, isThemePreset, themeCss, themeScheme, themeVars, type ThemePreset } from "./themes";
export const ACCENT_PRESETS = [
  { name: "Jungle", hex: "#2f5d46" },
  { name: "Emerald", hex: "#059669" },
  { name: "Terracotta", hex: "#c2410c" },
  { name: "Teak", hex: "#92400e" },
  { name: "Ocean", hex: "#0369a1" },
  { name: "Orchid", hex: "#7e22ce" },
  { name: "Slate", hex: "#334155" },
  { name: "Bronze", hex: "#8a6a35" },
  { name: "Navy", hex: "#1f4e6e" },
  { name: "Jade", hex: "#1f6b5c" },
  { name: "Ink", hex: "#111111" },
] as const;

export const DEFAULT_ACCENT = "#2f5d46";

function channel(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

/** WCAG contrast ratio of a hex colour against white. */
export function contrastWithWhite(hex: string): number {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!m) return 1;
  const [r, g, b] = [m[1], m[2], m[3]].map((h) => channel(parseInt(h as string, 16))) as [number, number, number];
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return 1.05 / (lum + 0.05);
}

/** Minimum contrast for white button text on the accent (WCAG 2.2 large text / UI components). */
export const MIN_ACCENT_CONTRAST = 3;

/**
 * CSS declarations that re-theme a page by overriding the `brand-*` palette tokens.
 * Shades are derived with color-mix so any validated hex works.
 */
export function accentCss(hex: string): string {
  const c = /^#[0-9a-f]{6}$/i.test(hex) ? hex : DEFAULT_ACCENT;
  const mix = (pct: number, base: string) => `color-mix(in oklab, ${c} ${pct}%, ${base})`;
  return [
    `--color-brand-50:${mix(8, "white")}`,
    `--color-brand-100:${mix(16, "white")}`,
    `--color-brand-200:${mix(32, "white")}`,
    `--color-brand-300:${mix(52, "white")}`,
    `--color-brand-400:${mix(72, "white")}`,
    `--color-brand-500:${mix(88, "white")}`,
    `--color-brand-600:${c}`,
    `--color-brand-700:${mix(82, "black")}`,
    `--color-brand-800:${mix(66, "black")}`,
    `--color-brand-900:${mix(52, "black")}`,
  ].join(";");
}

// ─── Translations of base property fields ─────────────────────────────────
export const translationsSchema = z.object({
  ms: z
    .object({
      title: z.string().max(120).optional(),
      tagline: z.string().max(160).optional(),
      description: z.string().max(5000).optional(),
      house_rules: z.array(z.string().max(200)).max(20).optional(),
      cancellation_policy: z.string().max(1000).optional(),
      host_bio: z.string().max(1000).optional(),
    })
    .optional(),
});

export type PropertyTranslations = z.infer<typeof translationsSchema>;

export interface LocalizableProperty {
  title: string;
  tagline: string | null;
  description: string;
  house_rules: string[];
  cancellation_policy: string;
  host_bio: string | null;
  translations: unknown;
}

export interface LocalizedPropertyText {
  title: string;
  tagline: string | null;
  description: string;
  house_rules: string[];
  cancellation_policy: string;
  host_bio: string | null;
}

export function parseTranslations(raw: unknown): PropertyTranslations {
  const parsed = translationsSchema.safeParse(raw);
  return parsed.success ? parsed.data : {};
}

export function localizeProperty(p: LocalizableProperty, locale: Locale): LocalizedPropertyText {
  const base: LocalizedPropertyText = {
    title: p.title,
    tagline: p.tagline,
    description: p.description,
    house_rules: p.house_rules,
    cancellation_policy: p.cancellation_policy,
    host_bio: p.host_bio,
  };
  if (locale === "en") return base;
  const t = parseTranslations(p.translations).ms;
  if (!t) return base;
  const pick = (v: string | undefined, fallback: string) => (v && v.trim() ? v : fallback);
  return {
    title: pick(t.title, base.title),
    tagline: t.tagline && t.tagline.trim() ? t.tagline : base.tagline,
    description: pick(t.description, base.description),
    house_rules: t.house_rules && t.house_rules.length > 0 ? t.house_rules : base.house_rules,
    cancellation_policy: pick(t.cancellation_policy, base.cancellation_policy),
    host_bio: t.host_bio && t.host_bio.trim() ? t.host_bio : base.host_bio,
  };
}

// ─── Section validation ────────────────────────────────────────────────────
const ltext = (max: number, required = false) =>
  z.object({
    en: required ? z.string().trim().min(1, "Required").max(max) : z.string().trim().max(max),
    ms: z.string().trim().max(max).optional().default(""),
  });

const itemSchema = z.object({
  id: z.string().min(1).max(40),
  icon: z.string().max(20).optional(),
  title: ltext(120, true),
  text: ltext(1000),
  meta: ltext(60).optional(),
});

export const sectionSchema = z
  .object({
    id: z.string().min(1).max(40),
    type: z.enum(SECTION_TYPES),
    audience: z.enum(["public", "guests"]),
    visible: z.boolean(),
    title: ltext(80, true),
    body: ltext(5000).optional(),
    items: z.array(itemSchema).max(24),
  })
  .refine((s) => s.type !== "house_guide" || s.audience === "guests", {
    message: "House guide sections are always guests-only",
    path: ["audience"],
  });

export const sectionsSchema = z.array(sectionSchema).max(20);

export const accentSchema = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, "Use a hex colour like #059669")
  .refine((h) => contrastWithWhite(h) >= MIN_ACCENT_CONTRAST, "Too light — white button text would be hard to read");

export const contentSchema = z.object({
  propertyId: z.uuid(),
  title: ltext(120, true).refine((t) => t.en.length >= 3, { message: "At least 3 characters", path: ["en"] }),
  tagline: ltext(160),
  description: ltext(5000),
  houseRules: z.object({ en: z.array(z.string().trim().max(200)).max(20), ms: z.array(z.string().trim().max(200)).max(20) }),
  cancellationPolicy: ltext(1000, true),
  hostDisplayName: z.string().trim().max(80),
  hostBio: ltext(1000),
  hostLanguages: z.array(z.string().trim().max(40)).max(8),
  accentColor: accentSchema,
  heroLayout: z.enum(HERO_LAYOUTS),
  themePreset: z.enum(THEME_PRESETS).default("heritage"),
  logoUrl: z.string().url().max(500).nullable(),
  sections: sectionsSchema,
});

export type ContentInput = z.input<typeof contentSchema>;

export function parseSections(raw: unknown): ContentSection[] {
  const parsed = sectionsSchema.safeParse(raw);
  return parsed.success ? (parsed.data as ContentSection[]) : [];
}

export function newId(prefix = "s"): string {
  const rand =
    typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID().slice(0, 8) : Math.random().toString(36).slice(2, 10);
  return `${prefix}_${rand}`;
}

export function blankItem(type: SectionType): SectionItem {
  return {
    id: newId("it"),
    icon: type === "highlights" || type === "services" ? "sparkles" : undefined,
    title: { en: "", ms: "" },
    text: { en: "", ms: "" },
    meta: type === "experiences" || type === "services" ? { en: "", ms: "" } : undefined,
  };
}

export function blankSection(type: SectionType): ContentSection {
  const meta = SECTION_META[type];
  return {
    id: newId("sec"),
    type,
    audience: meta.defaultAudience,
    visible: true,
    title: { ...meta.defaultTitle },
    body: type === "text" ? { en: "", ms: "" } : undefined,
    items: meta.hasItems ? [blankItem(type)] : [],
  };
}
