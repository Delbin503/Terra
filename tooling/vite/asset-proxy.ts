import type { Plugin } from "vite";
/* Just the slice of Node's http types this uses — the project ships no
   @types/node, and `tsc -b` checks this file through vite.config.ts. */
interface IncomingMessage { url?: string; method?: string }
interface ServerResponse {
  statusCode: number;
  setHeader(name: string, value: string): void;
  write(chunk: Uint8Array): boolean;
  end(body?: string): void;
}
/** Cloudflare R2 (the Assets API's file host, reached via a signed redirect)
 *  never sends Access-Control-Allow-Origin, so a direct browser fetch of a
 *  real asset file (GLB) is CORS-blocked no matter how the URL is wired up.
 *  This proxy fetches the file server-side — no CORS applies to a
 *  Node-to-Node request — and streams it back same-origin at
 *  /asset-proxy?url=<encoded>, which is what GlbAsset actually loads in dev
 *  (see resolveLoadableUrl in assets-data.ts). Host-restricted so this can't
 *  be used as an open proxy to arbitrary URLs. */
const ALLOWED_ASSET_HOSTS = [
  /(^|\.)sigmawave\.ai$/,
  /(^|\.)r2\.cloudflarestorage\.com$/,
];

const MAX_REDIRECTS = 5;

function hasExpiredCertificate(error: unknown): boolean {
  let current = error;
  for (let depth = 0; depth < 5 && current && typeof current === "object"; depth += 1) {
    if ("code" in current && current.code === "CERT_HAS_EXPIRED") return true;
    current = "cause" in current ? current.cause : undefined;
  }
  return false;
}

export function allowedAssetUrl(value: string, base?: URL): URL | null {
  try {
    const url = new URL(value, base);
    if (url.protocol !== "https:" || url.username || url.password || url.port) return null;
    return ALLOWED_ASSET_HOSTS.some((host) => host.test(url.hostname)) ? url : null;
  } catch {
    return null;
  }
}

/** Retry one transient failure without allowing fetch to follow redirects itself. */
async function fetchAssetWithRetry(url: URL, method: "GET" | "HEAD"): Promise<Response> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      const response = await fetch(url, { redirect: "manual", method });
      if (attempt > 0 || ![502, 503, 504].includes(response.status)) return response;
      await response.body?.cancel();
    } catch (error) {
      if (attempt > 0 || hasExpiredCertificate(error)) throw error;
    }
  }
}

export async function fetchAllowedAsset(url: URL, method: "GET" | "HEAD" = "GET"): Promise<Response> {
  let current = url;
  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects++) {
    const response = await fetchAssetWithRetry(current, method);
    if (![301, 302, 303, 307, 308].includes(response.status)) return response;
    const location = response.headers.get("location");
    await response.body?.cancel();
    const next = location ? allowedAssetUrl(location, current) : null;
    if (!next) throw new Error("Asset redirect is not allowed");
    current = next;
  }
  throw new Error("Asset redirect limit exceeded");
}

/** Without these, `window.crossOriginIsolated` is always false, which forces
 *  the gaussian-splats-3d viewer's dynamic-scene sort worker onto plain
 *  postMessage transfer instead of a SharedArrayBuffer (see
 *  getViewerOptions in splat-resource-manager.ts). `dynamicScene: true`
 *  (required so the shared per-URL viewer can hold multiple independently
 *  transformable placements) makes that viewer resort on essentially every
 *  rendered frame while orbiting/zooming, so the copy this avoids is not
 *  incidental — it is the dominant cost of every splat sort during camera
 *  interaction. `credentialless` (rather than `require-corp`) grants the same
 *  isolation without requiring a Cross-Origin-Resource-Policy header on every
 *  cross-origin subresource; nothing here relies on receiving credentialed
 *  cross-origin responses. */
export const CROSS_ORIGIN_ISOLATION_HEADERS = {
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Embedder-Policy": "credentialless",
};

export function assetProxyMiddleware(req: IncomingMessage, res: ServerResponse, next: () => void) {
  if (!req.url?.startsWith("/asset-proxy")) return next();

  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "*");
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }

  if (req.method !== "GET" && req.method !== "HEAD") {
    res.statusCode = 405;
    res.end("Method not allowed");
    return;
  }

  const target = new URL(req.url, "http://internal").searchParams.get("url");
  if (!target) {
    res.statusCode = 400;
    res.end("Missing url");
    return;
  }

  const parsed = allowedAssetUrl(target);
  if (!parsed) {
    res.statusCode = 403;
    res.end("Asset URL not allowed");
    return;
  }

  fetchAllowedAsset(parsed, req.method as "GET" | "HEAD")
    .then(async (upstream) => {
      res.statusCode = upstream.status;
      const contentType = upstream.headers.get("content-type");
      if (contentType) res.setHeader("Content-Type", contentType);
      const contentLength = upstream.headers.get("content-length");
      if (contentLength) res.setHeader("Content-Length", contentLength);
      // Signed URLs may expire while their bytes remain unchanged.
      res.setHeader("Cache-Control", "no-store");
      if (req.method === "HEAD") { await upstream.body?.cancel(); res.end(); return; }
      if (upstream.body) {
        const reader = upstream.body.getReader();
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          res.write(value);
        }
      }
      res.end();
    })
    .catch((error: unknown) => {
      const expired = hasExpiredCertificate(error);
      // Report only the approved host; signed redirect URLs can contain credentials.
      const message = expired
        ? `The TLS certificate for the asset upstream requested via ${parsed.hostname} has expired. Renew the upstream certificate and retry.`
        : `Asset upstream request failed for ${parsed.hostname}.`;
      console.error(`[asset-proxy] ${message}`);
      res.statusCode = 502;
      res.setHeader("Content-Type", "application/json");
      res.setHeader("Cache-Control", "no-store");
      res.end(JSON.stringify({
        error: expired ? "ASSET_UPSTREAM_TLS_EXPIRED" : "ASSET_UPSTREAM_REQUEST_FAILED",
        message,
      }));
    });
}

export function assetProxyPlugin(): Plugin {
  return {
    name: "asset-proxy",
    configureServer(server) {
      server.middlewares.use((req, res, next) => assetProxyMiddleware(req as never, res as never, next));
    },
    configurePreviewServer(server) {
      server.middlewares.use((req, res, next) => assetProxyMiddleware(req as never, res as never, next));
    },
  };
}

