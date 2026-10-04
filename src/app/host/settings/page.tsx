import type { Metadata } from "next";
import Link from "next/link";
import { PhotoManager } from "@/components/host/photo-manager";
import { PropertyForm } from "@/components/host/property-form";
import { billplzConfigured } from "@/lib/billplz";
import { getHostContext } from "@/lib/host";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Settings" };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function HostSettingsPage({ searchParams }: Props) {
  const sp = await searchParams;
  const creating = sp.new === "1";
  const { supabase, property } = await getHostContext(typeof sp.property === "string" ? sp.property : undefined);
  const editing = creating ? null : property;

  const photos = editing
    ? ((await supabase.from("property_images").select("id, url, alt").eq("property_id", editing.id).order("sort_order")).data ?? [])
    : [];

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-zinc-500">{editing ? editing.title : "New listing"}</p>
          <h1 className="text-3xl font-semibold tracking-tight">{editing ? "Listing settings" : "Create your listing"}</h1>
        </div>
        {editing && (
          <Link href="/host/settings?new=1" className="text-sm font-semibold text-brand-700 hover:underline dark:text-brand-400">
            + Add another property
          </Link>
        )}
      </header>

      {editing && <PhotoManager propertyId={editing.id} photos={photos} />}
      <PropertyForm key={editing?.id ?? "new"} property={editing} billplzReady={billplzConfigured()} />
    </div>
  );
}
