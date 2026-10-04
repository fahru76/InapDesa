import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ContentEditor, type EditorState } from "@/components/host/content-editor";
import { DEFAULT_ACCENT, isHeroLayout, isThemePreset, parseSections, parseTranslations } from "@/lib/content";
import { getHostContext } from "@/lib/host";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Content" };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function HostContentPage({ searchParams }: Props) {
  const sp = await searchParams;
  const { supabase, property } = await getHostContext(typeof sp.property === "string" ? sp.property : undefined);
  if (!property) redirect("/host/settings?new=1");

  const [{ data: photos }, { data: guest }] = await Promise.all([
    supabase.from("property_images").select("url, alt").eq("property_id", property.id).order("sort_order"),
    supabase.from("property_guest_content").select("sections").eq("property_id", property.id).maybeSingle(),
  ]);

  const ms = parseTranslations(property.translations).ms ?? {};
  const initial: EditorState = {
    title: { en: property.title, ms: ms.title ?? "" },
    tagline: { en: property.tagline ?? "", ms: ms.tagline ?? "" },
    description: { en: property.description ?? "", ms: ms.description ?? "" },
    houseRules: { en: (property.house_rules ?? []).join("\n"), ms: (ms.house_rules ?? []).join("\n") },
    cancellationPolicy: { en: property.cancellation_policy ?? "", ms: ms.cancellation_policy ?? "" },
    hostDisplayName: property.host_display_name ?? "",
    hostBio: { en: property.host_bio ?? "", ms: ms.host_bio ?? "" },
    hostLanguages: (property.host_languages ?? []).join(", "),
    accentColor: property.accent_color || DEFAULT_ACCENT,
    heroLayout: isHeroLayout(property.hero_layout) ? property.hero_layout : "grand",
    themePreset: isThemePreset(property.theme_preset) ? property.theme_preset : "heritage",
    logoUrl: property.logo_url,
    sections: [...parseSections(property.sections), ...parseSections(guest?.sections)],
  };

  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm font-medium text-zinc-500">{property.title}</p>
        <h1 className="text-3xl font-semibold tracking-tight">Listing content</h1>
        <p className="mt-1 max-w-2xl text-sm text-zinc-500">Edit your story, branding and page sections in English and Bahasa Melayu. Changes go live when you publish.</p>
      </header>
      <ContentEditor
        key={property.id}
        propertyId={property.id}
        slug={property.slug}
        location={[property.city, property.region, property.country].filter(Boolean).join(", ")}
        photos={photos ?? []}
        initial={initial}
      />
    </div>
  );
}
