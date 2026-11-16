import type { Asset, AssetType } from "./assets-data";

/**
 * THE SIGMAWAVE ASSETS API — the real catalogue behind the library.
 *
 * `GET /api/assets` is public and paged. It holds meshes (`3d`, GLB), Gaussian
 * splats (`splat`, PLY) and HDRIs (`hdri`), plus images and videos the library
 * doesn't browse. The same service the staging build reads (Bitbucket `dev`,
 * `src/features/editor/assets/api`), mapped here onto this prototype's `Asset`.
 */
const API_BASE = "https://assets.sigmawave.ai";
/** The API caps a page at 100; the catalogue is ~1,600 records, so ~17 pages. */
const PAGE_LIMIT = 100;

export interface ApiLod {
  url: string;
  level: number;
  sizeBytes?: number;
  triangles?: number;
}

export interface ApiAsset {
  id: string;
  name: string;
  description?: string | null;
  screenshot?: string | null;
  url: string;
  lods?: ApiLod[] | null;
  stats?: { triangles?: number; vertices?: number } | null;
  status?: string | null;
  smartTags?: string[] | null;
  manualTags?: string[] | null;
  category?: string | null;
  type: string;
  format?: string | null;
  size?: number | null;
  accessLevel?: string | null;
  createdAt?: string | null;
}

interface ApiPage {
  data: ApiAsset[];
  meta: { total: number; page: number; limit: number; totalPages: number };
}

/** What the details panel shows for a catalogue asset, straight from the record. */
export interface RemoteDetails {
  apiId: string;
  description?: string;
  format?: string;
  sizeBytes?: number;
  createdAt?: string;
  category?: string;
  access?: string;
  triangles?: number;
}

async function fetchPage(page: number, signal?: AbortSignal): Promise<ApiPage> {
  const qs = new URLSearchParams({
    page: String(page),
    limit: String(PAGE_LIMIT),
    sortBy: "createdAt",
    sortOrder: "desc",
  });
  const res = await fetch(`${API_BASE}/api/assets?${qs}`, {
    headers: { Accept: "application/json" },
    signal,
  });
  if (!res.ok) throw new Error(`Assets API ${res.status} ${res.statusText}`);
  const json = (await res.json()) as Partial<ApiPage>;
  if (!Array.isArray(json.data) || !json.meta) throw new Error("Assets API returned an unexpected shape");
  return json as ApiPage;
}

/**
 * Every page, in order, handed over as it lands — the first hundred show while
 * the rest are still coming. Stops quietly when `signal` aborts.
 */
export async function loadCatalogue(
  onPage: (assets: Asset[], meta: ApiPage["meta"]) => void,
  signal?: AbortSignal
): Promise<void> {
  let page = 1;
  let totalPages = 1;
  do {
    const res = await fetchPage(page, signal);
    totalPages = res.meta.totalPages;
    onPage(res.data.map(mapApiAsset).filter((a): a is Asset => a !== null), res.meta);
    page += 1;
  } while (page <= totalPages && !signal?.aborted);
}

/**
 * Model and sky files redirect to Cloudflare storage, which sends no CORS
 * header — so in dev they go through the Vite proxy (tooling/vite/asset-proxy).
 */
function loadable(url: string): string {
  return import.meta.env.DEV ? `/asset-proxy?url=${encodeURIComponent(url)}` : url;
}

const TYPE_MAP: Record<string, AssetType> = { "3d": "mesh", splat: "splat", hdri: "environment" };

function seedFromId(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return Math.abs(h % 9973) + 1;
}

/**
 * Pipeline keys (`asa_key:…`, `run:…`, `source:asa`) are bookkeeping, not
 * tags anyone filters by — staging lists them raw (BUG-012). Keep the words.
 */
const readableTags = (tags?: string[] | null) =>
  (tags ?? []).filter((t) => t && !t.includes(":") && t !== "pipeline");

/** One API record → one library asset, or null for kinds the library doesn't browse. */
export function mapApiAsset(a: ApiAsset): Asset | null {
  const type = TYPE_MAP[a.type?.toLowerCase()];
  if (!type) return null;
  if (a.status && a.status.toLowerCase() !== "ready") return null;
  const format = a.format?.toLowerCase();
  const glb = format === "glb" || format === "gltf" || /\.(glb|gltf)(\?|#|$)/i.test(a.url);
  // The smallest LOD that is still a mesh: the viewport is a preview, and the
  // full-detail file is what TerraGen renders from.
  const lod = (a.lods ?? []).filter((l) => l.url).sort((x, y) => y.level - x.level)[0];
  return {
    id: `api-${a.id}`,
    name: a.name,
    type,
    seed: seedFromId(a.id),
    thumbUrl: a.screenshot ?? undefined,
    modelUrl: type === "mesh" && glb ? loadable(lod?.url ?? a.url) : undefined,
    // drei picks the sky loader from the extension, and a proxied URL has none —
    // the `#.hdr` tag gives it one (the same trick uploads use, see taggedBlobUrl).
    skyUrl: type === "environment" ? `${loadable(a.url)}#.${format === "exr" ? "exr" : "hdr"}` : undefined,
    smartTags: readableTags(a.smartTags),
    manualTags: readableTags(a.manualTags),
    remote: {
      apiId: a.id,
      description: a.description ?? undefined,
      format: a.format ?? undefined,
      sizeBytes: a.size ?? undefined,
      createdAt: a.createdAt ?? undefined,
      category: a.category ?? undefined,
      access: a.accessLevel ?? undefined,
      triangles: a.stats?.triangles,
    },
  };
}
