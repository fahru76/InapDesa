"use client";

import {
  ArrowDown,
  ArrowUp,
  Check,
  ExternalLink,
  Eye,
  EyeOff,
  ImagePlus,
  LoaderCircle,
  Lock,
  Plus,
  Trash2,
  TriangleAlert,
  X,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState, useTransition, type ChangeEvent, type ReactNode } from "react";
import { saveContent } from "@/app/host/actions";
import { ListingPreview } from "@/components/host/listing-preview";
import { Button } from "@/components/ui/button";
import { inputStyles, SectionCard } from "@/components/ui/field";
import {
  ACCENT_PRESETS,
  blankItem,
  blankSection,
  contentSchema,
  contrastWithWhite,
  HERO_LAYOUT_LABELS,
  HERO_LAYOUTS,
  MIN_ACCENT_CONTRAST,
  SECTION_ICONS,
  SECTION_META,
  SECTION_TYPES,
  THEME_PRESET_LABELS,
  THEME_PRESETS,
  THEMES,
  type ContentInput,
  type ContentSection,
  type HeroLayout,
  type LText,
  type Locale,
  type SectionItem,
  type ThemePreset,
} from "@/lib/content";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

export interface EditorState {
  title: LText;
  tagline: LText;
  description: LText;
  /** One rule per line, per language. */
  houseRules: { en: string; ms: string };
  cancellationPolicy: LText;
  hostDisplayName: string;
  hostBio: LText;
  /** Comma-separated. */
  hostLanguages: string;
  accentColor: string;
  heroLayout: HeroLayout;
  themePreset: ThemePreset;
  logoUrl: string | null;
  sections: ContentSection[];
}

interface Props {
  propertyId: string;
  slug: string;
  location: string;
  photos: { url: string; alt: string }[];
  initial: EditorState;
}

const MAX_SECTIONS = 20;
const MAX_ITEMS = 24;
const LOGO_TYPES = ["image/png", "image/jpeg", "image/webp", "image/svg+xml"];
const LOGO_MAX = 2 * 1024 * 1024;

const lines = (s: string) =>
  s
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

function toInput(propertyId: string, s: EditorState): ContentInput {
  return {
    propertyId,
    title: s.title,
    tagline: s.tagline,
    description: s.description,
    houseRules: { en: lines(s.houseRules.en), ms: lines(s.houseRules.ms) },
    cancellationPolicy: s.cancellationPolicy,
    hostDisplayName: s.hostDisplayName,
    hostBio: s.hostBio,
    hostLanguages: s.hostLanguages
      .split(",")
      .map((l) => l.trim())
      .filter(Boolean),
    accentColor: s.accentColor,
    heroLayout: s.heroLayout,
    themePreset: s.themePreset,
    logoUrl: s.logoUrl,
    sections: s.sections,
  };
}

/** Human-readable path for a zod issue, e.g. "Page sections › 2 › Items › 1 › Title (BM)". */
function describeIssue(path: PropertyKey[], sections: ContentSection[]): string {
  const names: Record<string, string> = {
    title: "Title",
    tagline: "Tagline",
    description: "Description",
    houseRules: "House rules",
    cancellationPolicy: "Cancellation policy",
    hostDisplayName: "Host name",
    hostBio: "Host bio",
    hostLanguages: "Languages",
    accentColor: "Accent colour",
    heroLayout: "Hero layout",
    themePreset: "Theme",
    logoUrl: "Logo",
    sections: "Page sections",
    items: "Items",
    body: "Text",
    text: "Text",
    meta: "Detail",
    audience: "Audience",
  };
  const out: string[] = [];
  path.forEach((p, i) => {
    if (p === "en") out.push("(EN)");
    else if (p === "ms") out.push("(BM)");
    else if (typeof p === "number") {
      if (path[i - 1] === "sections") {
        const sec = sections[p];
        out.push(sec ? `“${sec.title.en || SECTION_META[sec.type].label}”` : String(p + 1));
      } else out.push(`#${p + 1}`);
    } else out.push(names[String(p)] ?? String(p));
  });
  return out.join(" › ");
}

export function ContentEditor({ propertyId, slug, location, photos, initial }: Props) {
  const router = useRouter();
  const [state, setState] = useState<EditorState>(initial);
  const [saved, setSaved] = useState<string>(() => JSON.stringify(initial));
  const [lang, setLang] = useState<Locale>("en");
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const dirty = JSON.stringify(state) !== saved;

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  useEffect(() => {
    if (!previewOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setPreviewOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [previewOpen]);

  const set = <K extends keyof EditorState>(key: K, value: EditorState[K]) => {
    setState((s) => ({ ...s, [key]: value }));
    setMessage(null);
  };
  /** Switch theme; the accent follows the theme's suggestion unless the owner picked their own colour. */
  const chooseTheme = (p: ThemePreset) => {
    setState((s) => {
      const custom = s.accentColor.toLowerCase() !== THEMES[s.themePreset].accent.toLowerCase();
      return { ...s, themePreset: p, accentColor: custom ? s.accentColor : THEMES[p].accent };
    });
    setMessage(null);
  };
  const setL = (key: "title" | "tagline" | "description" | "cancellationPolicy" | "hostBio", value: string) =>
    set(key, { ...state[key], [lang]: value });

  const updateSection = (id: string, patch: Partial<ContentSection>) =>
    set(
      "sections",
      state.sections.map((s) => (s.id === id ? { ...s, ...patch } : s)),
    );
  const moveSection = (idx: number, dir: -1 | 1) => {
    const next = [...state.sections];
    const j = idx + dir;
    if (j < 0 || j >= next.length) return;
    [next[idx], next[j]] = [next[j]!, next[idx]!];
    set("sections", next);
  };

  const preview = useMemo(
    () => ({
      title: state.title,
      tagline: state.tagline,
      description: state.description,
      accentColor: /^#[0-9a-fA-F]{6}$/.test(state.accentColor) ? state.accentColor : initial.accentColor,
      heroLayout: state.heroLayout,
      themePreset: state.themePreset,
      logoUrl: state.logoUrl,
      sections: state.sections,
      location,
      photos,
    }),
    [state, location, photos, initial.accentColor],
  );

  function publish() {
    const input = toInput(propertyId, state);
    const check = contentSchema.safeParse(input);
    if (!check.success) {
      const issue = check.error.issues[0]!;
      setMessage({ tone: "error", text: `${describeIssue(issue.path, state.sections)}: ${issue.message}` });
      return;
    }
    startTransition(async () => {
      const res = await saveContent(input);
      if (res.ok) {
        setSaved(JSON.stringify(state));
        setMessage({ tone: "ok", text: "Published — your listing is updated." });
        router.refresh();
      } else {
        setMessage({ tone: "error", text: res.message ?? "Could not save your content." });
      }
    });
  }

  const ph = (v: LText) => (lang === "ms" && v.en ? `EN: ${v.en.slice(0, 80)}` : undefined);

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,460px)]">
      <div className="min-w-0 space-y-6 pb-28">
        {/* Language tabs */}
        <div className="card flex flex-wrap items-center justify-between gap-3 p-3 pl-5">
          <div>
            <p className="text-sm font-semibold">Editing language</p>
            <p className="text-xs text-zinc-500">Bahasa Melayu fields left empty fall back to English.</p>
          </div>
          <div className="inline-flex rounded-full bg-zinc-100 p-1 dark:bg-zinc-800" role="tablist" aria-label="Editing language">
            {(["en", "ms"] as const).map((l) => (
              <button
                key={l}
                type="button"
                role="tab"
                aria-selected={lang === l}
                onClick={() => setLang(l)}
                className={cn(
                  "rounded-full px-4 py-1.5 text-sm font-semibold transition",
                  lang === l ? "bg-paper text-ink shadow-sm dark:bg-zinc-950 dark:text-white" : "text-zinc-500 hover:text-ink dark:hover:text-white",
                )}
              >
                {l === "en" ? "English" : "Bahasa Melayu"}
              </button>
            ))}
          </div>
        </div>

        <SectionCard title="Headline & story" description="What guests see first on your listing page.">
          <div className="space-y-4">
            <LField label="Title" value={state.title[lang] ?? ""} onChange={(v) => setL("title", v)} max={120} placeholder={ph(state.title)} required={lang === "en"} />
            <LField label="Tagline" value={state.tagline[lang] ?? ""} onChange={(v) => setL("tagline", v)} max={160} placeholder={ph(state.tagline) ?? "A short line that sells the feeling"} />
            <LField
              label="Description"
              value={state.description[lang] ?? ""}
              onChange={(v) => setL("description", v)}
              max={5000}
              rows={7}
              placeholder={ph(state.description) ?? "Describe the space, the setting and what makes a stay special."}
            />
          </div>
        </SectionCard>

        <SectionCard title="Branding" description="Your logo, colour and how the top of your page is laid out.">
          <div className="space-y-6">
            <div>
              <p className="mb-2 text-sm font-medium text-zinc-700 dark:text-zinc-300">Theme</p>
              <p className="mb-3 text-xs leading-5 text-zinc-500">Changes the colours, heading font and corners of your guest pages. Your photos, text and sections stay the same.</p>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2" role="radiogroup" aria-label="Theme">
                {THEME_PRESETS.map((p) => (
                  <button
                    key={p}
                    type="button"
                    role="radio"
                    aria-checked={state.themePreset === p}
                    onClick={() => chooseTheme(p)}
                    className={cn(
                      "flex items-center gap-4 rounded-2xl border p-3 text-left transition",
                      state.themePreset === p ? "border-brand-500 ring-4 ring-brand-500/15" : "border-zinc-200/80 hover:border-zinc-300 dark:border-zinc-800/80",
                    )}
                  >
                    <ThemeSwatch preset={p} />
                    <span>
                      <span className="block text-sm font-semibold">{THEME_PRESET_LABELS[p].label}</span>
                      <span className="block text-xs leading-5 text-zinc-500">{THEME_PRESET_LABELS[p].hint}</span>
                    </span>
                  </button>
                ))}
              </div>
              {state.accentColor.toLowerCase() !== THEMES[state.themePreset].accent.toLowerCase() && (
                <p className="mt-3 flex flex-wrap items-center gap-2 text-xs text-zinc-500">
                  <span className="size-3.5 rounded-full ring-1 ring-black/10" style={{ backgroundColor: THEMES[state.themePreset].accent }} aria-hidden />
                  {THEME_PRESET_LABELS[state.themePreset].label} looks best with {THEMES[state.themePreset].accent.toUpperCase()}.
                  <button type="button" onClick={() => set("accentColor", THEMES[state.themePreset].accent)} className="font-semibold text-brand-700 underline-offset-2 hover:underline dark:text-brand-300">
                    Use it
                  </button>
                </p>
              )}
            </div>
            <LogoField propertyId={propertyId} value={state.logoUrl} onChange={(v) => set("logoUrl", v)} />
            <AccentField value={state.accentColor} onChange={(v) => set("accentColor", v)} />
            <div>
              <p className="mb-2 text-sm font-medium text-zinc-700 dark:text-zinc-300">Hero layout</p>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-2 2xl:grid-cols-4" role="radiogroup" aria-label="Hero layout">
                {HERO_LAYOUTS.map((l) => (
                  <button
                    key={l}
                    type="button"
                    role="radio"
                    aria-checked={state.heroLayout === l}
                    onClick={() => set("heroLayout", l)}
                    className={cn(
                      "rounded-2xl border p-3 text-left transition",
                      state.heroLayout === l
                        ? "border-brand-500 ring-4 ring-brand-500/15"
                        : "border-zinc-200/80 hover:border-zinc-300 dark:border-zinc-800/80 dark:hover:border-zinc-700",
                    )}
                  >
                    <LayoutThumb layout={l} />
                    <p className="mt-2.5 text-sm font-semibold">{HERO_LAYOUT_LABELS[l].label}</p>
                    <p className="text-xs leading-5 text-zinc-500">{HERO_LAYOUT_LABELS[l].hint}</p>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </SectionCard>

        <SectionCard
          title="Page sections"
          description="Add, reorder and hide blocks on your listing. Guests-only sections appear on the booking pass after payment."
        >
          <div className="space-y-4">
            {state.sections.length === 0 && (
              <p className="rounded-2xl border border-dashed border-zinc-300 p-6 text-center text-sm text-zinc-500 dark:border-zinc-700">
                No sections yet. Add highlights, nearby experiences, an FAQ or a private house guide below.
              </p>
            )}
            {state.sections.map((s, i) => (
              <SectionEditor
                key={s.id}
                section={s}
                lang={lang}
                first={i === 0}
                last={i === state.sections.length - 1}
                onChange={(patch) => updateSection(s.id, patch)}
                onMove={(dir) => moveSection(i, dir)}
                onRemove={() => {
                  if (window.confirm(`Remove “${s.title.en || SECTION_META[s.type].label}”? You can undo this by leaving without publishing.`))
                    set(
                      "sections",
                      state.sections.filter((x) => x.id !== s.id),
                    );
                }}
              />
            ))}

            <div className="rounded-2xl bg-zinc-50 p-4 dark:bg-zinc-900/60">
              <p className="mb-3 text-xs font-semibold tracking-wider text-zinc-500 uppercase">
                Add section {state.sections.length >= MAX_SECTIONS && `· limit of ${MAX_SECTIONS} reached`}
              </p>
              <div className="flex flex-wrap gap-2">
                {SECTION_TYPES.map((t) => (
                  <button
                    key={t}
                    type="button"
                    disabled={state.sections.length >= MAX_SECTIONS}
                    onClick={() => set("sections", [...state.sections, blankSection(t)])}
                    title={SECTION_META[t].hint}
                    className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200/80 bg-paper px-3 py-1.5 text-sm font-medium transition hover:border-brand-500 hover:text-brand-700 disabled:opacity-40 dark:border-zinc-800/80 dark:bg-zinc-900 dark:hover:text-brand-300"
                  >
                    <Plus className="size-3.5" aria-hidden /> {SECTION_META[t].label}
                    {SECTION_META[t].defaultAudience === "guests" && <Lock className="size-3 text-zinc-400" aria-label="Guests only" />}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </SectionCard>

        <SectionCard title="Rules & policies">
          <div className="space-y-4">
            <LField
              label="House rules"
              hint="One rule per line."
              value={state.houseRules[lang]}
              onChange={(v) => set("houseRules", { ...state.houseRules, [lang]: v })}
              rows={5}
              max={4200}
              placeholder={lang === "ms" && state.houseRules.en ? state.houseRules.en : "No smoking indoors\nQuiet hours after 10pm"}
            />
            <LField
              label="Cancellation policy"
              value={state.cancellationPolicy[lang] ?? ""}
              onChange={(v) => setL("cancellationPolicy", v)}
              rows={3}
              max={1000}
              required={lang === "en"}
              placeholder={ph(state.cancellationPolicy)}
            />
          </div>
        </SectionCard>

        <SectionCard title="Host profile">
          <div className="grid gap-4 sm:grid-cols-2">
            <TextInput label="Display name" value={state.hostDisplayName} onChange={(v) => set("hostDisplayName", v)} max={80} placeholder="e.g. Aisyah" />
            <TextInput label="Languages you speak" hint="Comma-separated." value={state.hostLanguages} onChange={(v) => set("hostLanguages", v)} max={330} placeholder="English, Bahasa Melayu" />
            <LField
              className="sm:col-span-2"
              label="About you"
              value={state.hostBio[lang] ?? ""}
              onChange={(v) => setL("hostBio", v)}
              rows={4}
              max={1000}
              placeholder={ph(state.hostBio) ?? "A few friendly lines about you and how you host."}
            />
          </div>
        </SectionCard>
      </div>

      {/* Desktop live preview */}
      <aside className="hidden xl:block">
        <div className="sticky top-24 h-[calc(100dvh-8rem)]">
          <ListingPreview data={preview} locale={lang} />
        </div>
      </aside>

      {/* Sticky publish bar */}
      <div className="fixed inset-x-0 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-30 px-4 lg:bottom-4 lg:left-64">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-3 rounded-2xl border border-zinc-200/80 bg-white/90 p-3 shadow-float backdrop-blur dark:border-zinc-800/80 dark:bg-zinc-900/90">
          <div className="min-w-0 flex-1 text-sm" aria-live="polite">
            {message ? (
              <span className={cn("inline-flex items-start gap-1.5", message.tone === "ok" ? "text-brand-700 dark:text-brand-300" : "text-red-600 dark:text-red-400")}>
                {message.tone === "ok" ? <Check className="mt-0.5 size-4 shrink-0" aria-hidden /> : <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />}
                <span>{message.text}</span>
              </span>
            ) : dirty ? (
              <span className="font-medium text-terracotta-600">Unpublished changes</span>
            ) : (
              <span className="text-zinc-500">All changes published</span>
            )}
          </div>
          <Button variant="outline" size="sm" className="xl:hidden" onClick={() => setPreviewOpen(true)}>
            <Eye className="size-4" aria-hidden /> Preview
          </Button>
          <Link
            href={`/stays/${slug}`}
            target="_blank"
            className="hidden items-center gap-1 text-sm font-medium text-zinc-600 hover:text-ink sm:inline-flex dark:text-zinc-400 dark:hover:text-white"
          >
            View live <ExternalLink className="size-3.5" aria-hidden />
          </Link>
          <Button size="sm" onClick={publish} loading={pending} disabled={!dirty || pending}>
            Publish
          </Button>
        </div>
      </div>

      {/* Mobile preview dialog */}
      {previewOpen && (
        <div className="fixed inset-0 z-50 flex flex-col bg-paper p-4 dark:bg-zinc-950" role="dialog" aria-modal="true" aria-label="Listing preview">
          <div className="mb-3 flex justify-end">
            <Button variant="ghost" size="sm" onClick={() => setPreviewOpen(false)}>
              <X className="size-4" aria-hidden /> Close
            </Button>
          </div>
          <div className="min-h-0 flex-1">
            <ListingPreview data={preview} locale={lang} />
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Fields ─────────────────────────────────────────────────────────────────

function LField({
  label,
  value,
  onChange,
  max,
  rows,
  placeholder,
  hint,
  required,
  className,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  max: number;
  rows?: number;
  placeholder?: string;
  hint?: ReactNode;
  required?: boolean;
  className?: string;
}) {
  const id = useId();
  return (
    <div className={cn("space-y-1.5", className)}>
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor={id} className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
          {label}
          {required && <span className="text-red-500"> *</span>}
        </label>
        <span className={cn("text-xs tabular-nums", value.length > max ? "text-red-600" : "text-zinc-400")}>
          {value.length}/{max}
        </span>
      </div>
      {rows ? (
        <textarea id={id} rows={rows} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className={cn(inputStyles, "resize-y")} aria-invalid={value.length > max} />
      ) : (
        <input id={id} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className={inputStyles} aria-invalid={value.length > max} />
      )}
      {hint && <p className="text-xs text-zinc-500">{hint}</p>}
    </div>
  );
}

function TextInput({ label, value, onChange, max, placeholder, hint }: { label: string; value: string; onChange: (v: string) => void; max: number; placeholder?: string; hint?: string }) {
  const id = useId();
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
        {label}
      </label>
      <input id={id} value={value} maxLength={max} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className={inputStyles} />
      {hint && <p className="text-xs text-zinc-500">{hint}</p>}
    </div>
  );
}

function LogoField({ propertyId, value, onChange }: { propertyId: string; value: string | null; onChange: (v: string | null) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError(null);
    if (!LOGO_TYPES.includes(file.type) || file.size > LOGO_MAX) {
      setError("Use PNG, JPG, WebP or SVG under 2 MB.");
      return;
    }
    setBusy(true);
    const supabase = createClient();
    const sub = file.type === "image/svg+xml" ? "svg" : (file.type.split("/")[1] ?? "png");
    const ext = sub === "jpeg" ? "jpg" : sub;
    const path = `${propertyId}/branding/${crypto.randomUUID()}.${ext}`;
    const { error: upErr } = await supabase.storage.from("property-images").upload(path, file, { cacheControl: "31536000", contentType: file.type, upsert: false });
    setBusy(false);
    if (upErr) {
      setError(upErr.message);
      return;
    }
    onChange(supabase.storage.from("property-images").getPublicUrl(path).data.publicUrl);
  }

  return (
    <div>
      <p className="mb-2 text-sm font-medium text-zinc-700 dark:text-zinc-300">Logo</p>
      <div className="flex items-center gap-4">
        <div className="relative grid size-16 shrink-0 place-items-center overflow-hidden rounded-2xl bg-paper ring-1 ring-zinc-200 dark:ring-zinc-700">
          {value ? <Image src={value} alt="Logo" fill sizes="64px" className="object-contain p-1.5" /> : <ImagePlus className="size-5 text-zinc-400" aria-hidden />}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => input.current?.click()} disabled={busy}>
            {busy ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : <ImagePlus className="size-4" aria-hidden />}
            {value ? "Replace" : "Upload logo"}
          </Button>
          {value && (
            <Button variant="ghost" size="sm" onClick={() => onChange(null)}>
              Remove
            </Button>
          )}
        </div>
        <input ref={input} type="file" accept={LOGO_TYPES.join(",")} className="sr-only" onChange={onFile} tabIndex={-1} aria-hidden />
      </div>
      {error ? <p className="mt-2 text-sm text-red-600" role="alert">{error}</p> : <p className="mt-2 text-xs text-zinc-500">Square, transparent PNG or SVG works best. Saved when you publish.</p>}
    </div>
  );
}

function AccentField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const valid = /^#[0-9a-fA-F]{6}$/.test(value);
  const contrast = valid ? contrastWithWhite(value) : 0;
  const tooLight = valid && contrast < MIN_ACCENT_CONTRAST;
  const id = useId();
  return (
    <div>
      <p className="mb-2 text-sm font-medium text-zinc-700 dark:text-zinc-300">Accent colour</p>
      <div className="flex flex-wrap items-center gap-2">
        {ACCENT_PRESETS.map((p) => (
          <button
            key={p.hex}
            type="button"
            onClick={() => onChange(p.hex)}
            title={p.name}
            aria-label={p.name}
            aria-pressed={value.toLowerCase() === p.hex}
            className={cn("grid size-9 place-items-center rounded-full ring-offset-2 transition dark:ring-offset-zinc-900", value.toLowerCase() === p.hex ? "ring-2 ring-ink dark:ring-white" : "hover:scale-105")}
            style={{ backgroundColor: p.hex }}
          >
            {value.toLowerCase() === p.hex && <Check className="size-4 text-white" aria-hidden />}
          </button>
        ))}
        <span className="mx-1 h-6 w-px bg-zinc-200 dark:bg-zinc-800" aria-hidden />
        <input type="color" value={valid ? value : "#059669"} onChange={(e) => onChange(e.target.value)} className="size-9 cursor-pointer rounded-full border-0 bg-transparent p-0" aria-label="Custom colour" />
        <label htmlFor={id} className="sr-only">
          Hex colour
        </label>
        <input id={id} value={value} onChange={(e) => onChange(e.target.value.trim())} maxLength={7} className={cn(inputStyles, "w-28 font-mono text-sm uppercase")} aria-invalid={!valid || tooLight} />
      </div>
      {!valid ? (
        <p className="mt-2 text-sm text-red-600">Use a hex colour like #059669.</p>
      ) : tooLight ? (
        <p className="mt-2 inline-flex items-center gap-1.5 text-sm text-terracotta-600">
          <TriangleAlert className="size-4" aria-hidden /> Too light — white button text would be hard to read (contrast {contrast.toFixed(1)}:1, needs {MIN_ACCENT_CONTRAST}:1).
        </p>
      ) : (
        <p className="mt-2 text-xs text-zinc-500">Used for buttons, highlights and the calendar. Contrast {contrast.toFixed(1)}:1.</p>
      )}
    </div>
  );
}

function ThemeSwatch({ preset }: { preset: ThemePreset }) {
  const { swatch, font, accent } = THEMES[preset];
  const radius = preset === "galeri" ? "0" : preset === "malam" ? "3px" : "8px";
  return (
    <span className="flex h-12 w-16 shrink-0 overflow-hidden border border-black/10" style={{ backgroundColor: swatch.bg, borderRadius: radius }} aria-hidden>
      <span className="flex flex-1 flex-col justify-center gap-1 pl-2">
        <span className="text-[15px] leading-none" style={{ fontFamily: font, color: swatch.text }}>
          Aa
        </span>
        <span className="h-px w-6" style={{ backgroundColor: swatch.deco }} />
        <span className="h-1.5 w-5" style={{ backgroundColor: accent, borderRadius: radius }} />
      </span>
      <span className="w-3" style={{ backgroundColor: swatch.band }} />
    </span>
  );
}

function LayoutThumb({ layout }: { layout: HeroLayout }) {
  const block = "rounded-[3px] bg-zinc-300 dark:bg-zinc-700";
  if (layout === "grand")
    return (
      <div className="relative aspect-[16/9] overflow-hidden rounded-lg bg-teak-800">
        <div className="absolute inset-x-0 top-[30%] flex flex-col items-center gap-1">
          <div className="h-1.5 w-1/2 rounded bg-ivory/90" />
          <div className="h-px w-1/4 bg-brass" />
        </div>
        <div className="absolute inset-x-[15%] bottom-1.5 h-2 rounded-full bg-ivory/90" />
      </div>
    );
  if (layout === "cinematic")
    return (
      <div className="relative aspect-[16/9] overflow-hidden rounded-lg bg-zinc-300 dark:bg-zinc-700">
        <div className="absolute inset-x-2 bottom-2 space-y-1">
          <div className="h-1.5 w-1/2 rounded bg-white/90" />
          <div className="h-1 w-1/3 rounded bg-white/70" />
        </div>
      </div>
    );
  if (layout === "split")
    return (
      <div className="grid aspect-[16/9] grid-cols-2 items-center gap-1.5 rounded-lg bg-zinc-100 p-1.5 dark:bg-zinc-800">
        <div className={cn(block, "h-full")} />
        <div className="space-y-1">
          <div className="h-1.5 w-4/5 rounded bg-zinc-400 dark:bg-zinc-500" />
          <div className="h-1 w-3/5 rounded bg-zinc-300 dark:bg-zinc-600" />
        </div>
      </div>
    );
  return (
    <div className="grid aspect-[16/9] grid-cols-4 grid-rows-2 gap-1 rounded-lg bg-zinc-100 p-1.5 dark:bg-zinc-800">
      <div className={cn(block, "col-span-2 row-span-2")} />
      <div className={block} />
      <div className={block} />
      <div className={block} />
      <div className={block} />
    </div>
  );
}

// ─── Section editor ─────────────────────────────────────────────────────────

function SectionEditor({
  section: s,
  lang,
  first,
  last,
  onChange,
  onMove,
  onRemove,
}: {
  section: ContentSection;
  lang: Locale;
  first: boolean;
  last: boolean;
  onChange: (patch: Partial<ContentSection>) => void;
  onMove: (dir: -1 | 1) => void;
  onRemove: () => void;
}) {
  const meta = SECTION_META[s.type];
  const setItem = (id: string, patch: Partial<SectionItem>) => onChange({ items: s.items.map((it) => (it.id === id ? { ...it, ...patch } : it)) });
  const moveItem = (idx: number, dir: -1 | 1) => {
    const next = [...s.items];
    const j = idx + dir;
    if (j < 0 || j >= next.length) return;
    [next[idx], next[j]] = [next[j]!, next[idx]!];
    onChange({ items: next });
  };
  const ph = (v: LText | undefined) => (lang === "ms" && v?.en ? `EN: ${v.en.slice(0, 60)}` : undefined);
  const itemLabel = s.type === "faq" ? { title: "Question", text: "Answer" } : s.type === "house_guide" ? { title: "Topic", text: "Details" } : { title: "Title", text: "Description" };

  return (
    <div className={cn("rounded-2xl border border-zinc-200/80 dark:border-zinc-800/80", !s.visible && "opacity-60")}>
      <div className="flex flex-wrap items-center gap-2 border-b border-zinc-200/80 px-4 py-2.5 dark:border-zinc-800/80">
        <span className="rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-semibold text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">{meta.label}</span>
        {s.audience === "guests" && (
          <span className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2.5 py-0.5 text-xs font-semibold text-brand-700 dark:bg-brand-500/10 dark:text-brand-300">
            <Lock className="size-3" aria-hidden /> Guests only
          </span>
        )}
        <div className="ml-auto flex items-center gap-1">
          {s.type !== "house_guide" && (
            <select
              value={s.audience}
              onChange={(e) => onChange({ audience: e.target.value as ContentSection["audience"] })}
              className="h-8 rounded-lg border border-zinc-200/80 bg-paper px-2 text-xs dark:border-zinc-800/80 dark:bg-zinc-900"
              aria-label="Who can see this section"
            >
              <option value="public">Everyone</option>
              <option value="guests">Paid guests only</option>
            </select>
          )}
          <IconButton label={s.visible ? "Hide section" : "Show section"} onClick={() => onChange({ visible: !s.visible })}>
            {s.visible ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
          </IconButton>
          <IconButton label="Move up" onClick={() => onMove(-1)} disabled={first}>
            <ArrowUp className="size-4" />
          </IconButton>
          <IconButton label="Move down" onClick={() => onMove(1)} disabled={last}>
            <ArrowDown className="size-4" />
          </IconButton>
          <IconButton label="Remove section" onClick={onRemove} danger>
            <Trash2 className="size-4" />
          </IconButton>
        </div>
      </div>

      <div className="space-y-4 p-4">
        <LField label="Section title" value={s.title[lang] ?? ""} onChange={(v) => onChange({ title: { ...s.title, [lang]: v } })} max={80} required={lang === "en"} placeholder={ph(s.title)} />

        {s.type === "text" ? (
          <LField label="Text" value={s.body?.[lang] ?? ""} onChange={(v) => onChange({ body: { en: s.body?.en ?? "", ...s.body, [lang]: v } })} max={5000} rows={6} placeholder={ph(s.body)} />
        ) : (
          <div className="space-y-3">
            {s.items.map((it, i) => (
              <div key={it.id} className="rounded-xl bg-zinc-50 p-3 dark:bg-zinc-900/60">
                <div className="mb-2 flex items-center gap-2">
                  {(s.type === "highlights" || s.type === "services") && <IconPicker value={it.icon} onChange={(icon) => setItem(it.id, { icon })} />}
                  <span className="text-xs font-semibold text-zinc-500">#{i + 1}</span>
                  <div className="ml-auto flex items-center gap-1">
                    <IconButton label="Move item up" onClick={() => moveItem(i, -1)} disabled={i === 0}>
                      <ArrowUp className="size-3.5" />
                    </IconButton>
                    <IconButton label="Move item down" onClick={() => moveItem(i, 1)} disabled={i === s.items.length - 1}>
                      <ArrowDown className="size-3.5" />
                    </IconButton>
                    <IconButton label="Remove item" onClick={() => onChange({ items: s.items.filter((x) => x.id !== it.id) })} danger>
                      <X className="size-3.5" />
                    </IconButton>
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
                  <LField label={itemLabel.title} value={it.title[lang] ?? ""} onChange={(v) => setItem(it.id, { title: { ...it.title, [lang]: v } })} max={120} required={lang === "en"} placeholder={ph(it.title)} />
                  {(s.type === "experiences" || s.type === "services") && (
                    <LField
                      className="sm:w-44"
                      label={s.type === "services" ? "Price" : "Detail"}
                      value={it.meta?.[lang] ?? ""}
                      onChange={(v) => setItem(it.id, { meta: { en: it.meta?.en ?? "", ...it.meta, [lang]: v } })}
                      max={60}
                      placeholder={ph(it.meta) ?? (s.type === "services" ? "RM 80 / trip" : "10 min drive")}
                    />
                  )}
                </div>
                <LField
                  className="mt-3"
                  label={itemLabel.text}
                  value={it.text[lang] ?? ""}
                  onChange={(v) => setItem(it.id, { text: { ...it.text, [lang]: v } })}
                  max={1000}
                  rows={2}
                  placeholder={ph(it.text)}
                />
              </div>
            ))}
            <button
              type="button"
              disabled={s.items.length >= MAX_ITEMS}
              onClick={() => onChange({ items: [...s.items, blankItem(s.type)] })}
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-700 hover:underline disabled:opacity-40 dark:text-brand-300"
            >
              <Plus className="size-4" aria-hidden /> Add {s.type === "faq" ? "question" : "item"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function IconButton({ label, onClick, disabled, danger, children }: { label: string; onClick: () => void; disabled?: boolean; danger?: boolean; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={cn(
        "grid size-8 place-items-center rounded-lg text-zinc-500 transition hover:bg-zinc-100 disabled:opacity-30 disabled:hover:bg-transparent dark:hover:bg-zinc-800",
        danger ? "hover:text-red-600" : "hover:text-ink dark:hover:text-white",
      )}
    >
      {children}
    </button>
  );
}

function IconPicker({ value, onChange }: { value: string | undefined; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const Current = SECTION_ICONS[value ?? ""] ?? SECTION_ICONS.sparkles!;

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="true"
        aria-expanded={open}
        aria-label="Choose icon"
        className="grid size-9 place-items-center rounded-lg bg-paper text-brand-700 ring-1 ring-zinc-200 dark:bg-zinc-900 dark:text-brand-300 dark:ring-zinc-700"
      >
        <Current className="size-4.5" />
      </button>
      {open && (
        <div className="absolute top-11 left-0 z-20 grid w-64 grid-cols-6 gap-1 rounded-xl border border-zinc-200/80 bg-paper p-2 shadow-float dark:border-zinc-800/80 dark:bg-zinc-900">
          {Object.entries(SECTION_ICONS).map(([key, Icon]) => (
            <button
              key={key}
              type="button"
              onClick={() => {
                onChange(key);
                setOpen(false);
              }}
              aria-label={key}
              title={key}
              className={cn("grid size-9 place-items-center rounded-lg transition hover:bg-zinc-100 dark:hover:bg-zinc-800", value === key && "bg-brand-50 text-brand-700 dark:bg-brand-500/10")}
            >
              <Icon className="size-4.5" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
