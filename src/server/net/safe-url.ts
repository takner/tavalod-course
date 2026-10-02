import { lookup as dnsLookup, type LookupAddress } from "node:dns";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import { invalid } from "../errors";

/**
 * Untrusted URLs (product links, future price sources) are validated before being stored or shown,
 * and any server-side fetch goes through `safeFetchText`, which refuses private, loopback,
 * link-local, multicast and metadata addresses. The address check runs inside the socket's DNS
 * lookup, so a hostname cannot pass validation and then resolve to an internal IP (DNS rebinding).
 */
export const MAX_URL_LENGTH = 2000;

export function isPrivateAddress(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) || // carrier-grade NAT
      (a === 169 && b === 254) || // link-local / cloud metadata
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 192 && b === 0) ||
      (a === 198 && (b === 18 || b === 19)) ||
      a >= 224 // multicast + reserved + broadcast
    );
  }
  if (net.isIPv6(ip)) {
    const v = ip.toLowerCase();
    if (v === "::" || v === "::1") return true;
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(v);
    if (mapped) return isPrivateAddress(mapped[1]);
    return /^(fc|fd|fe8|fe9|fea|feb|ff)/.test(v) || v.startsWith("64:ff9b:") || v.startsWith("2001:db8");
  }
  return true;
}

/** Accepts only absolute http(s) URLs to public hosts, without credentials. Returns the normalised URL. */
export function validatePublicHttpUrl(raw: string, label = "لینک"): string {
  const value = raw.trim();
  if (value.length > MAX_URL_LENGTH) throw invalid(`${label} بیش از حد طولانی است.`);
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw invalid(`${label} معتبر نیست. نشانی کامل با https:// وارد کنید.`);
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") throw invalid(`${label} باید با http یا https شروع شود.`);
  if (url.username || url.password) throw invalid(`${label} نباید نام کاربری یا رمز داشته باشد.`);
  const host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (!host || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) {
    throw invalid(`${label} به یک نشانی داخلی اشاره می‌کند.`);
  }
  if (net.isIP(host) && isPrivateAddress(host)) throw invalid(`${label} به یک نشانی داخلی اشاره می‌کند.`);
  if (!host.includes(".") && !net.isIP(host)) throw invalid(`${label} معتبر نیست.`);
  return url.toString();
}

function guardedLookup(
  hostname: string,
  options: object,
  callback: (err: NodeJS.ErrnoException | null, address: string | LookupAddress[], family?: number) => void,
): void {
  dnsLookup(hostname, { ...options, all: true }, (err, addresses) => {
    if (err) return callback(err, []);
    const list = addresses as LookupAddress[];
    if (list.length === 0 || list.some((a) => isPrivateAddress(a.address))) {
      return callback(Object.assign(new Error("blocked private address"), { code: "EBLOCKED" }), []);
    }
    const wantsAll = (options as { all?: boolean }).all;
    if (wantsAll) return callback(null, list);
    callback(null, list[0].address, list[0].family);
  });
}

/**
 * GET a public URL with SSRF protection, a time limit and a body-size limit. Redirects are followed
 * manually (max 3) and every hop is re-validated. Not used by any enabled feature yet — it exists
 * for future price providers.
 */
export async function safeFetchText(
  rawUrl: string,
  opts: { timeoutMs?: number; maxBytes?: number; redirects?: number } = {},
): Promise<{ url: string; status: number; contentType: string; body: string }> {
  const { timeoutMs = 8000, maxBytes = 1_000_000, redirects = 3 } = opts;
  const url = validatePublicHttpUrl(rawUrl);
  const lib = url.startsWith("https:") ? https : http;
  const res = await new Promise<{ status: number; location?: string; contentType: string; body: string }>((resolve, reject) => {
    const req = lib.get(url, { lookup: guardedLookup as never, timeout: timeoutMs, headers: { "user-agent": "tavalod-price-check" } }, (r) => {
      const status = r.statusCode ?? 0;
      if (status >= 300 && status < 400 && r.headers.location) {
        r.resume();
        return resolve({ status, location: new URL(r.headers.location, url).toString(), contentType: "", body: "" });
      }
      let size = 0;
      const chunks: Buffer[] = [];
      r.on("data", (c: Buffer) => {
        size += c.length;
        if (size > maxBytes) {
          req.destroy(new Error("response too large"));
          return;
        }
        chunks.push(c);
      });
      r.on("end", () => resolve({ status, contentType: String(r.headers["content-type"] ?? ""), body: Buffer.concat(chunks).toString("utf8") }));
      r.on("error", reject);
    });
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", reject);
  });
  if (res.location) {
    if (redirects <= 0) throw new Error("too many redirects");
    return safeFetchText(res.location, { timeoutMs, maxBytes, redirects: redirects - 1 });
  }
  return { url, status: res.status, contentType: res.contentType, body: res.body };
}
