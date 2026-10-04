import { accentCss, themeCss, themeScheme } from "@/lib/content";

/**
 * Applies a listing's accent colour and theme to the whole page (incl. site header/footer).
 * Dark-only themes also render a marker that forces the `dark:` variant (see globals.css).
 */
export function ListingTheme({ accent, preset }: { accent: string; preset: string | null | undefined }) {
  return (
    <>
      <style>{`:root{${accentCss(accent)}}${themeCss(preset)}`}</style>
      {themeScheme(preset) === "dark" && <span data-page-scheme="dark" hidden />}
    </>
  );
}
