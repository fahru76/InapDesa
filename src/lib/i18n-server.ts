import "server-only";

import { cookies, headers } from "next/headers";
import { cache } from "react";
import { isLocale, type Locale } from "./content";
import { LOCALE_COOKIE, makeT } from "./i18n";

/** Guest locale: explicit cookie choice, else browser preference (Malay → ms), else English. */
export const getLocale = cache(async (): Promise<Locale> => {
  const jar = await cookies();
  const chosen = jar.get(LOCALE_COOKIE)?.value;
  if (isLocale(chosen)) return chosen;
  const accept = (await headers()).get("accept-language") ?? "";
  return /(^|,)\s*ms\b/i.test(accept) ? "ms" : "en";
});

export async function getT() {
  return makeT(await getLocale());
}
