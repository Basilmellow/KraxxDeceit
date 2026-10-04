import { lookup } from "node:dns/promises";
import { BlockList, isIP } from "node:net";

const forbiddenAddresses = new BlockList();
for (const [range, prefix, type] of [
  ["0.0.0.0", 8, "ipv4"], ["10.0.0.0", 8, "ipv4"], ["100.64.0.0", 10, "ipv4"],
  ["127.0.0.0", 8, "ipv4"], ["169.254.0.0", 16, "ipv4"], ["172.16.0.0", 12, "ipv4"],
  ["192.0.0.0", 24, "ipv4"], ["192.0.2.0", 24, "ipv4"], ["192.168.0.0", 16, "ipv4"],
  ["198.18.0.0", 15, "ipv4"], ["198.51.100.0", 24, "ipv4"], ["203.0.113.0", 24, "ipv4"],
  ["224.0.0.0", 4, "ipv4"], ["240.0.0.0", 4, "ipv4"],
  ["::", 128, "ipv6"], ["2001::", 32, "ipv6"], ["::1", 128, "ipv6"],
  ["64:ff9b::", 96, "ipv6"], ["100::", 64, "ipv6"], ["2001:db8::", 32, "ipv6"],
  ["fc00::", 7, "ipv6"], ["fe80::", 10, "ipv6"], ["ff00::", 8, "ipv6"],
] as const) {
  forbiddenAddresses.addSubnet(range, prefix, type);
}

const localHostSuffix = /(^localhost$|\.localhost$|\.local$|\.internal$|\.lan$|\.home\.arpa$|\.test$|\.invalid$|\.example$|^metadata\.google\.internal$|^host\.docker\.internal$)/i;

export class UnsafeTargetError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnsafeTargetError";
  }
}

export const DEVELOPMENT_FIXTURE_URL = "http://localhost:3000/research-fixture/prompt-injection.html";

export function isDevelopmentFixtureUrl(rawUrl: string) {
  if (process.env.NODE_ENV !== "development") return false;
  try {
    const url = new URL(rawUrl);
    return url.origin === "http://localhost:3000" && ["/research-fixture/prompt-injection.html", "/research-fixture/simple.html", "/research-fixtures/agent-injection-basic.html"].includes(url.pathname) && !url.search && !url.hash && !url.username && !url.password;
  } catch { return false; }
}

export function isForbiddenAddress(address: string) {
  const family = isIP(address);
  if (family === 6) {
    // Canonicalize expanded/dotted spellings before testing transition addresses.
    const canonical = new URL(`http://[${address}]/`).hostname.slice(1, -1);
    if (canonical.startsWith("::ffff:")) return true;
    // Legacy IPv4-compatible notation also remains forbidden without a broad CIDR.
    if (/^::(?:[a-f0-9]{1,4}:)?[a-f0-9]{1,4}$/i.test(canonical)) return true;
  }
  return family === 0 || forbiddenAddresses.check(address, family === 4 ? "ipv4" : "ipv6");
}

export async function validatePublicHttpUrl(rawUrl: string, resolveAddresses = (host: string) => lookup(host, { all: true, verbatim: true })): Promise<URL> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new UnsafeTargetError("Enter a valid public HTTP(S) URL.");
  }
  // This exact development-only URL is fulfilled from a fixed synthetic document
  // inside Chromium; it never causes a request to localhost.
  if (isDevelopmentFixtureUrl(url.toString())) return url;
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new UnsafeTargetError("Only public HTTP and HTTPS URLs can be investigated.");
  }
  if (url.port && !["80", "443"].includes(url.port)) throw new UnsafeTargetError("Only standard HTTP(S) ports are supported.");
  if (url.username || url.password) {
    throw new UnsafeTargetError("URLs containing embedded credentials are not supported.");
  }

  const hostname = url.hostname.replace(/^\[|\]$/g, "").toLowerCase().replace(/\.$/, "");
  if (!hostname || localHostSuffix.test(hostname)) {
    throw new UnsafeTargetError("Local and private network targets are not allowed.");
  }
  if (isIP(hostname)) {
    if (isForbiddenAddress(hostname)) throw new UnsafeTargetError("Local and private network targets are not allowed.");
    return url;
  }

  let addresses: Array<{ address: string }>;
  try {
    addresses = await resolveAddresses(hostname);
  } catch {
    throw new UnsafeTargetError("The target hostname could not be resolved to a public address.");
  }
  if (!addresses.length || addresses.some(({ address }) => isForbiddenAddress(address))) {
    throw new UnsafeTargetError("Local and private network targets are not allowed.");
  }
  return url;
}

// Keep application address validation separate from API firewall compatibility.
export const FORBIDDEN_IPV6_SUBNETS = [
  "::/128", "::1/128", "fc00::/7", "fe80::/10", "::ffff:0:0/96",
  "2001::/32", "64:ff9b::/96", "100::/64", "2001:db8::/32", "ff00::/8",
];

// Production Sandbox rejected IPv6 CIDRs, including the precise unspecified /128.
// Its firewall receives only IPv4 denies plus destination hostname allowlists.
// IPv6 special/transition addresses stay blocked by URL, DNS and browser checks.
export const DENIED_SANDBOX_SUBNETS = [
  "0.0.0.0/8", "10.0.0.0/8", "100.64.0.0/10", "127.0.0.0/8", "169.254.0.0/16",
  "172.16.0.0/12", "192.0.0.0/24", "192.0.2.0/24", "192.168.0.0/16", "198.18.0.0/15",
  "198.51.100.0/24", "203.0.113.0/24", "224.0.0.0/4", "240.0.0.0/4",
];
