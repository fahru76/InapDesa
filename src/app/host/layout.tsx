import type { Metadata } from "next";
import { Suspense } from "react";
import { HostNav } from "@/components/host/host-nav";
import { getHostContext } from "@/lib/host";

export const metadata: Metadata = { title: { default: "Host dashboard", template: "%s · Host · InapDesa" }, robots: { index: false } };

export default async function HostLayout({ children }: { children: React.ReactNode }) {
  const { user, properties } = await getHostContext();
  return (
    <div className="surface-muted min-h-[calc(100dvh-4rem)]">
      <div className="mx-auto flex max-w-[88rem] gap-8 px-4 pt-6 pb-28 sm:px-6 lg:px-8 lg:pt-10 lg:pb-16">
        <Suspense fallback={<div className="hidden w-64 shrink-0 lg:block" />}>
          <HostNav properties={properties.map((p) => ({ id: p.id, title: p.title }))} email={user.email ?? ""} />
        </Suspense>
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </div>
  );
}
