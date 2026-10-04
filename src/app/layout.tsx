import type { Metadata, Viewport } from "next";
import "@fontsource-variable/plus-jakarta-sans";
import "@fontsource-variable/cormorant-garamond";
import "@fontsource-variable/cormorant-garamond/wght-italic.css";
// Theme heading fonts: only @font-face rules are added; files download only on pages that use them.
import "@fontsource-variable/lora";
import "@fontsource-variable/lora/wght-italic.css";
import "@fontsource-variable/playfair-display";
import "@fontsource-variable/playfair-display/wght-italic.css";
import "@fontsource-variable/libre-bodoni";
import "@fontsource-variable/cinzel";
import "./globals.css";
import { LocaleProvider } from "@/components/i18n/locale";
import { SiteFooter, SiteHeader } from "@/components/site/site-chrome";
import { getLocale } from "@/lib/i18n-server";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
  title: { default: "InapDesa — Book boutique homestays direct", template: "%s · InapDesa" },
  description: "Hand-picked private homestays. Book direct with the host, lock your dates with a secure deposit.",
  openGraph: { type: "website", siteName: "InapDesa" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f7f2e9" },
    { media: "(prefers-color-scheme: dark)", color: "#141110" },
  ],
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const locale = await getLocale();
  return (
    <html lang={locale}>
      <body className="flex min-h-dvh flex-col">
        <LocaleProvider locale={locale}>
          <SiteHeader />
          <main className="flex-1">{children}</main>
          <SiteFooter />
        </LocaleProvider>
      </body>
    </html>
  );
}
