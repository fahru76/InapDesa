import { isIP } from "node:net";

/**
 * SSRF guard for server-side fetches of host-supplied URLs (calendar feeds).
 * Rejects loopback, private, link-local, CGNAT, multicast, reserved and metadata addresses.
 */
export function isPublicAddress(address: string): boolean {
  const kind = isIP(address);
  if (kind === 4) return isPublicV4(address);
  if (kind === 6) return isPublicV6(address);
  return false;
}

function isPublicV4(a: string): boolean {
  const [p0 = 0, p1 = 0] = a.split(".").map(Number);
  if (p0 === 0 || p0 === 10 || p0 === 127) return false;
  if (p0 === 100 && p1 >= 64 && p1 <= 127) return false; // CGNAT
  if (p0 === 169 && p1 === 254) return false; // link-local + cloud metadata
  if (p0 === 172 && p1 >= 16 && p1 <= 31) return false;
  if (p0 === 192 && p1 === 168) return false;
  if (p0 === 192 && p1 === 0) return false; // 192.0.0.0/24, 192.0.2.0/24
  if (p0 === 198 && (p1 === 18 || p1 === 19)) return false; // benchmarking
  if (p0 === 198 && p1 === 51) return false; // TEST-NET-2
  if (p0 === 203 && p1 === 0) return false; // TEST-NET-3
  if (p0 >= 224) return false; // multicast + reserved + broadcast
  return true;
}

function isPublicV6(a: string): boolean {
  const lower = a.toLowerCase();
  if (lower === "::" || lower === "::1") return false;
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(lower) ?? /^64:ff9b::(\d+\.\d+\.\d+\.\d+)$/.exec(lower);
  if (mapped?.[1]) return isPublicV4(mapped[1]);
  if (/^::ffff:/.test(lower)) return false;
  const first = parseInt(lower.split(":")[0] || "0", 16);
  if ((first & 0xfe00) === 0xfc00) return false; // fc00::/7 unique local
  if ((first & 0xffc0) === 0xfe80) return false; // fe80::/10 link-local
  if ((first & 0xff00) === 0xff00) return false; // multicast
  if (first === 0x2001 && parseInt(lower.split(":")[1] || "0", 16) === 0x0db8) return false; // documentation
  return true;
}

/** Validate a feed URL before fetching: https only, no credentials, no IP-literal private hosts, standard port. */
export function checkFeedUrl(raw: string): { ok: true; url: URL } | { ok: false; reason: string } {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return { ok: false, reason: "That isn't a valid web address." };
  }
  if (url.protocol !== "https:") return { ok: false, reason: "Calendar links must start with https://" };
  if (url.username || url.password) return { ok: false, reason: "Calendar links can't contain a username or password." };
  if (url.port && url.port !== "443") return { ok: false, reason: "Calendar links must use the standard https port." };
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (isIP(host) && !isPublicAddress(host)) return { ok: false, reason: "That address isn't reachable from the internet." };
  if (/^(localhost|.*\.local|.*\.internal|.*\.localhost)$/i.test(host)) return { ok: false, reason: "That address isn't reachable from the internet." };
  return { ok: true, url };
}
