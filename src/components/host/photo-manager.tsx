"use client";

import { ImagePlus, LoaderCircle, Star, Trash2 } from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition, type ChangeEvent } from "react";
import { addPropertyImage, deletePropertyImage, setCoverImage, updateImageAlt } from "@/app/host/actions";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { SectionCard } from "@/components/ui/field";

interface Photo {
  id: string;
  url: string;
  alt: string;
}

const ACCEPT = ["image/jpeg", "image/png", "image/webp", "image/avif"];
const MAX_BYTES = 10 * 1024 * 1024;

export function PhotoManager({ propertyId, photos }: { propertyId: string; photos: Photo[] }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  async function onFiles(e: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (files.length === 0) return;
    setError(null);

    const invalid = files.find((f) => !ACCEPT.includes(f.type) || f.size > MAX_BYTES);
    if (invalid) {
      setError(`${invalid.name}: use JPG, PNG, WebP or AVIF under 10 MB.`);
      return;
    }

    const supabase = createClient();
    setUploading({ done: 0, total: files.length });
    for (const [i, file] of files.entries()) {
      const subtype = file.type.split("/")[1] ?? "jpg";
      const ext = subtype === "jpeg" ? "jpg" : subtype;
      const path = `${propertyId}/${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("property-images").upload(path, file, { cacheControl: "31536000", contentType: file.type, upsert: false });
      if (upErr) {
        setError(`${file.name}: ${upErr.message}`);
        break;
      }
      const { data } = supabase.storage.from("property-images").getPublicUrl(path);
      const res = await addPropertyImage(propertyId, path, data.publicUrl, file.name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " "));
      if (!res.ok) {
        setError(res.message ?? "Could not save photo.");
        break;
      }
      setUploading({ done: i + 1, total: files.length });
    }
    setUploading(null);
    router.refresh();
  }

  const run = (id: string, fn: () => Promise<{ ok: boolean; message?: string }>) => {
    setBusyId(id);
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) setError(res.message ?? "Something went wrong.");
      setBusyId(null);
      router.refresh();
    });
  };

  return (
    <SectionCard title="Photos" description="The first photo is your cover. Landscape images at least 2000px wide look best.">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {photos.map((p, i) => (
          <figure
            key={p.id}
            className={cn("group relative overflow-hidden rounded-2xl border border-zinc-200/80 bg-zinc-100 dark:border-zinc-800/80 dark:bg-zinc-900", busyId === p.id && "opacity-60")}
          >
            <div className="relative aspect-[4/3]">
              <Image src={p.url} alt={p.alt} fill sizes="(min-width: 1024px) 20vw, 50vw" className="object-cover" />
              {i === 0 && <span className="absolute top-2 left-2 rounded-full bg-ink/80 px-2 py-0.5 text-[11px] font-semibold text-white backdrop-blur">Cover</span>}
              <div className="absolute top-2 right-2 flex gap-1 transition sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
                {i !== 0 && (
                  <button
                    type="button"
                    onClick={() => run(p.id, () => setCoverImage(p.id))}
                    className="grid size-8 place-items-center rounded-full bg-white/90 text-ink shadow-soft"
                    aria-label="Make cover photo"
                    title="Make cover"
                  >
                    <Star className="size-4" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    if (window.confirm("Delete this photo?")) run(p.id, () => deletePropertyImage(p.id));
                  }}
                  className="grid size-8 place-items-center rounded-full bg-white/90 text-red-600 shadow-soft"
                  aria-label="Delete photo"
                  title="Delete"
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
            </div>
            <input
              defaultValue={p.alt}
              onBlur={(e) => {
                if (e.target.value !== p.alt) run(p.id, () => updateImageAlt(p.id, e.target.value));
              }}
              placeholder="Describe this photo"
              aria-label="Photo caption"
              className="w-full border-t border-zinc-200/80 bg-paper px-3 py-2 text-xs outline-none focus:bg-brand-50/50 dark:border-zinc-800/80 dark:bg-zinc-900"
            />
          </figure>
        ))}

        <button
          type="button"
          onClick={() => input.current?.click()}
          disabled={!!uploading}
          className="flex aspect-[4/3] flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-zinc-300 text-sm font-semibold text-zinc-600 transition hover:border-brand-500 hover:text-brand-700 disabled:opacity-60 dark:border-zinc-700 dark:text-zinc-400"
        >
          {uploading ? (
            <>
              <LoaderCircle className="size-6 animate-spin" aria-hidden />
              Uploading {uploading.done}/{uploading.total}
            </>
          ) : (
            <>
              <ImagePlus className="size-6" aria-hidden />
              Add photos
            </>
          )}
        </button>
      </div>
      <input ref={input} type="file" accept={ACCEPT.join(",")} multiple hidden onChange={onFiles} />
      {error && (
        <p role="alert" className="mt-3 text-sm text-red-600">
          {error}
        </p>
      )}
    </SectionCard>
  );
}
