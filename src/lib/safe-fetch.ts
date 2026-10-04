import "server-only";

import { lookup as dnsLookup, type LookupAddress } from "node:dns";
import { request } from "node:https";
import type { LookupFunction } from "node:net";
import { checkFeedUrl, isPublicAddress } from "./net-guard";

const MAX_BYTES = 2 * 1024 * 1024;
const TIMEOUT_MS = 10_000;
const MAX_REDIRECTS = 3;

export class FeedFetchError extends Error {}

/**
 * Resolve the host and refuse non-public addresses. Runs at connect time, so a DNS answer that
 * changes between validation and connection (rebinding) is still checked.
 */
const guardedLookup: LookupFunction = (hostname, options, callback) => {
  dnsLookup(hostname, { ...options, all: true }, (err, addresses) => {
    if (err) return callback(err, "", 4);
    const list = (Array.isArray(addresses) ? addresses : [{ address: String(addresses), family: 4 }]) as LookupAddress[];
    const safe = list.filter((a) => isPublicAddress(a.address));
    if (safe.length === 0 || safe.length !== list.length) {
      return callback(new FeedFetchError("That address isn't reachable from the internet."), "", 4);
    }
    if ((options as { all?: boolean }).all) return (callback as unknown as (e: null, a: LookupAddress[]) => void)(null, safe);
    const first = safe[0]!;
    callback(null, first.address, first.family);
  });
};

function getOnce(url: URL): Promise<{ status: number; location?: string; body?: string }> {
  return new Promise((resolve, reject) => {
    const req = request(
      url,
      {
        method: "GET",
        lookup: guardedLookup,
        timeout: TIMEOUT_MS,
        headers: { "User-Agent": "InapDesa-CalendarSync/1.0", Accept: "text/calendar, text/plain;q=0.9, */*;q=0.1", "Accept-Encoding": "identity" },
      },
      (res) => {
        const status = res.statusCode ?? 0;
        if (status >= 300 && status < 400 && res.headers.location) {
          res.resume();
          return resolve({ status, location: res.headers.location });
        }
        if (status !== 200) {
          res.resume();
          return resolve({ status });
        }
        const chunks: Buffer[] = [];
        let size = 0;
        res.on("data", (c: Buffer) => {
          size += c.length;
          if (size > MAX_BYTES) {
            req.destroy(new FeedFetchError("The calendar file is too large (over 2 MB)."));
            return;
          }
          chunks.push(c);
        });
        res.on("end", () => resolve({ status, body: Buffer.concat(chunks).toString("utf8") }));
        res.on("error", reject);
      },
    );
    req.on("timeout", () => req.destroy(new FeedFetchError("The calendar link took too long to respond.")));
    req.on("error", reject);
    req.end();
  });
}

/** Fetch an external calendar safely: https only, public IPs only, ≤3 redirects, ≤2 MB, 10 s timeout. */
export async function fetchCalendarText(rawUrl: string): Promise<string> {
  let current = rawUrl;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const checked = checkFeedUrl(current);
    if (!checked.ok) throw new FeedFetchError(checked.reason);
    let res: Awaited<ReturnType<typeof getOnce>>;
    try {
      res = await getOnce(checked.url);
    } catch (err) {
      if (err instanceof FeedFetchError) throw err;
      throw new FeedFetchError("Couldn't reach that calendar link. Check it's correct and public.");
    }
    if (res.location) {
      current = new URL(res.location, checked.url).toString();
      continue;
    }
    if (res.status === 404) throw new FeedFetchError("The calendar link wasn't found (404). It may have been reset on the other platform.");
    if (res.status === 401 || res.status === 403) throw new FeedFetchError("The calendar link refused access. Copy a fresh export link from the other platform.");
    if (res.status !== 200 || res.body === undefined) throw new FeedFetchError(`The calendar link returned an error (HTTP ${res.status}).`);
    return res.body;
  }
  throw new FeedFetchError("The calendar link redirected too many times.");
}
