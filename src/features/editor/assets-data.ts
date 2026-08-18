import type { IconName } from "@/components/icons";

/**
 * The asset kinds Terra works with.
 *
 * THE THREE CONTENT KINDS ARE `mesh`, `skybox` AND `environment` — a 3D Asset,
 * a Skybox and an HDRI Map in the language the library uses. They are what a
 * scene is built out of and the only things the All Assets filter offers.
 *
 * `image` is not one of them any more. It survives because the pipeline emits
 * images that aren't library content — capture frames, MAT previews, reference
 * shots dropped into the 3D generator — and those land in Uploads, where they
 * belong to the user rather than to the catalogue.
 *
 * `video` is retained because the scene layer still types objects by source
 * (see scene-types.ts); the library never browses it.
 */
export type AssetType = "image" | "skybox" | "environment" | "video" | "mesh" | "camera";

/**
 * What the library is a catalogue OF.
 *
 * Order matters — it's the order the All Assets type filter lists them in, and
 * it runs biggest-thing-first: the object, then the light around it, then what
 * sits behind it.
 */
export const CONTENT_TYPES: AssetType[] = ["mesh", "environment", "skybox"];

export interface Asset {
  id: string;
  name: string;
  type: AssetType;
  /** deterministic seed → placeholder thumbnail hue/shape */
  seed: number;
  uploaded?: boolean;
  /** transient state while a Generate request resolves */
  pending?: boolean;
  /** async pipeline state (generate / mesh flow) */
  status?: "generating" | "ready";
  /** label shown inside a generating/ready cell */
  statusLabel?: string;
  /** path to a real GLB — when set, placing this asset loads the model instead of a placeholder shape */
  modelUrl?: string;
  /**
   * Produced by a Generate 3D run rather than shipped in the catalogue or
   * brought in by the user.
   *
   * It only drives the badge: a generated mesh reads as **Gen3D** wherever it
   * appears, so "where did this come from" is answered on the thumbnail instead
   * of by remembering which tab you found it in. Separate from `uploaded`,
   * which means the user supplied the file — the two are different origins and
   * an asset is at most one of them.
   */
  generated?: boolean;
  /**
   * Tags, once they've been edited. Both start life derived from the seed (see
   * `deriveDetails`) and only become stored fields when someone changes them —
   * an asset nobody has edited shouldn't carry a copy of its own defaults.
   *
   * Smart tags are the AI's read of the image; manual tags are the user's own.
   * They're kept apart because they're removable for different reasons.
   */
  smartTags?: string[];
  manualTags?: string[];
}

/**
 * Library categories. `uploads` is the only one with a second level — the
 * user's own files (My Assets) and the folders they organise them into.
 */
export type CategoryId =
  | "all"
  | "environments"
  | "skyboxes"
  | "uploads"
  | "meshes"
  | "utilities";

/** Second-level view under Uploads. */
export type UploadView = "assets" | "folders";

export interface Category {
  id: CategoryId;
  label: string;
  icon: IconName;
  /** the asset type this category filters to (undefined = special) */
  type?: AssetType;
}

/**
 * Order matters: the list runs from the subject outwards.
 *
 * All Assets is the way in. Then the thing you are photographing (3D Models),
 * then what stands behind it (Environments, Skyboxes) — the same order the
 * scene is built in. Uploads and Utilities come last because neither is
 * catalogue content: one is your own files, the other is the instrument you
 * shoot with.
 */
export const categories: Category[] = [
  // Everything the catalogue holds, with a type filter over it — the one tab
  // you land on when you don't yet know which kind of thing you want. A grid
  // rather than a box: the box glyph says "an object", which is what 3D Models
  // below it holds, and two tabs wearing the same shape is how you end up
  // clicking the wrong one.
  { id: "all", label: "All Assets", icon: "grid" },
  // The subject. Also where a finished Generate 3D run lands.
  { id: "meshes", label: "3D Models", icon: "input-3d", type: "mesh" },
  // The light: HDRI maps, which light and reflect onto the whole scene.
  { id: "environments", label: "Environments", icon: "environment", type: "environment" },
  // The backdrop: skyboxes, which sit behind the scene without lighting it.
  { id: "skyboxes", label: "Skyboxes", icon: "panorama", type: "skybox" },
  { id: "uploads", label: "Uploads", icon: "upload" },
  // Utilities holds scene rigs rather than content — things you drop in to
  // capture the scene, not things the scene is made of.
  { id: "utilities", label: "Utilities", icon: "camera", type: "camera" },
];

/* ------------------------------------------------------------------ sort */

export type SortOrder = "descending" | "ascending" | "alphabetical";

/**
 * The three orderings, each with what it actually means.
 *
 * "Ascending" and "Descending" name a direction without naming what is being
 * ordered, which is fine on the trigger and useless in the menu — so the menu
 * says the subject too. The seed is the stand-in for "when this was added":
 * it's minted from a monotonic counter, for the seeded catalogue and for
 * anything the pipeline adds later, so it sorts by age without the assets
 * having to carry a timestamp they don't have yet.
 */
export const sortOptions: { id: SortOrder; label: string; hint: string; icon: IconName }[] = [
  { id: "descending", label: "Descending", hint: "Newest first", icon: "chevron-down" },
  { id: "ascending", label: "Ascending", hint: "Oldest first", icon: "chevron-down" },
  { id: "alphabetical", label: "Alphabetical", hint: "A to Z", icon: "library" },
];

/** Applied last, over whatever the category, search and filters left. */
export function sortAssets(assets: Asset[], order: SortOrder): Asset[] {
  // A copy — `visible` is derived from the store's own array, and sorting in
  // place would quietly reorder the library itself.
  const out = [...assets];
  if (order === "alphabetical") {
    return out.sort((a, b) => a.name.localeCompare(b.name));
  }
  return out.sort((a, b) => (order === "ascending" ? a.seed - b.seed : b.seed - a.seed));
}

export const uploadViews: { id: UploadView; label: string; icon: IconName }[] = [
  { id: "assets", label: "My Assets", icon: "upload" },
  { id: "folders", label: "Folders", icon: "folder" },
];

/** Corner badge icon per asset type. */
export const typeIcon: Record<AssetType, IconName> = {
  image: "input-2d",
  // A skybox is a panorama wrapped around the scene; an HDRI is the landscape
  // that lights it. Two different glyphs, because on a grid of thumbnails the
  // badge is the only thing telling them apart — both render as scenery.
  skybox: "panorama",
  environment: "environment",
  video: "video",
  mesh: "input-3d",
  camera: "camera",
};

/**
 * The badge's word, short enough to sit on a thumbnail.
 *
 * Deliberately NOT `SOURCE_LABEL`: that names a thing in prose ("HDRI Map"),
 * this one has ~44px of corner to work with. Both exist because a badge that
 * truncates says nothing at all.
 */
export const typeBadge: Record<AssetType, string> = {
  image: "Image",
  skybox: "Skybox",
  environment: "Environment",
  video: "Video",
  mesh: "3D Model",
  camera: "Rig",
};

/**
 * WHAT THE BADGE SAYS — the type, unless the asset's ORIGIN is the more useful
 * fact about it.
 *
 * A generated mesh is still a 3D model, but "3D Model" is the one thing about
 * it you can already see in the thumbnail. That it came out of a Generate 3D
 * run is not, and it's what decides whether you trust it, regenerate it, or go
 * looking for the prompt behind it — so the badge spends its ~44px on that
 * instead.
 *
 * Everything else falls through to its type, which is why an uploaded skybox
 * and a catalogue skybox read identically: for those, where the file came from
 * is a detail for the info panel, not a label on the tile.
 */
export const badgeLabel = (a: Asset): string => (a.generated ? "Gen3D" : typeBadge[a.type]);

/** …and the glyph beside it. Generated assets wear the same mark the Generate
 *  buttons do, so the badge and the thing that produced it match. */
export const badgeIcon = (a: Asset): IconName => (a.generated ? "generate" : typeIcon[a.type]);

/* --------------------------------------------------------------- folders */

export interface AssetFolder {
  id: string;
  name: string;
  /** ids of the assets filed into this folder */
  assetIds: string[];
}

export const initialFolders: AssetFolder[] = [
  { id: "folder-vehicles", name: "Vehicles", assetIds: [] },
  { id: "folder-street", name: "Street Props", assetIds: [] },
];

/* ------------------------------------------------------------ seed assets */

const namePools: Record<AssetType, string[]> = {
  // Nothing seeded. Images arrive from the pipeline — capture frames, MAT
  // previews, references the user brings in — and every one of them is filed
  // under Uploads rather than shipped as catalogue content.
  image: [],
  skybox: ["Desert Dunes", "Coastal Cliff", "Neon Alley", "Foggy Pines", "Golden Field", "Harbor Dawn", "Canyon Pass"],
  environment: ["Studio HDRI", "Sunset Field", "Overcast Sky", "Night City", "Forest Clearing", "Snow Plain", "Blue Hour"],
  video: [],
  mesh: [
    "Sedan",
    "Robotic Hand",
    "Street Lamp",
    "Bus Stop",
    "Fire Hydrant",
    "Barrier",
    "Sign Post",
    "Office Chair",
    "Lounge Chair",
    "Dining Chair",
    "Folding Chair",
  ],
  camera: ["Camera"],
};

/** Real model overrides — placing these assets loads an actual GLB instead of a placeholder shape. */
const modelUrls: Record<string, string> = {
  "Robotic Hand": "/models/robotic-hand.glb",
};

// Deterministic seed counter — no Math.random, stable across renders.
let seedCounter = 0;
function build(type: AssetType): Asset[] {
  return namePools[type].map((name, i) => ({
    id: `${type}-${i}`,
    name,
    type,
    seed: (seedCounter += 1) * 13,
    modelUrl: modelUrls[name],
  }));
}

export const initialAssets: Asset[] = [
  ...build("skybox"),
  ...build("environment"),
  ...build("mesh"),
  ...build("camera"),
];

/* ------------------------------------------------------------- filtering */

/**
 * Which assets belong in a category.
 *
 * "All Assets" is the CATALOGUE — the three content kinds and nothing else.
 * Utilities are excluded because a capture rig isn't content, and images are
 * excluded because they're working files: a run of 360 capture frames would
 * otherwise bury the seven meshes you were looking for. Both stay reachable in
 * their own tab.
 */
export function filterByCategory(assets: Asset[], cat: CategoryId): Asset[] {
  if (cat === "all") return assets.filter((a) => CONTENT_TYPES.includes(a.type));
  if (cat === "uploads") return assets.filter((a) => a.uploaded);
  // 3D Models is the AI output folder, not every mesh in the catalogue: it is
  // where a Generate 3D run lands and where you come back to find what you
  // made. Catalogue models are content like any other and live in All Assets,
  // one type-filter click away — listing them here too would bury the four
  // things you generated under eleven you didn't.
  if (cat === "meshes") return assets.filter((a) => a.type === "mesh" && a.generated);
  const type = categories.find((c) => c.id === cat)?.type;
  return type ? assets.filter((a) => a.type === type) : assets;
}

/** Every tag an asset carries — smart tags first, then the manual ones. */
export function assetTags(a: Asset): string[] {
  const d = deriveDetails(a);
  return [...d.smartTags, ...d.manualTags];
}

/** The tag vocabulary present in a set of assets, sorted for a stable menu. */
export function collectTags(assets: Asset[]): string[] {
  const set = new Set<string>();
  assets.forEach((a) => assetTags(a).forEach((t) => set.add(t)));
  return [...set].sort();
}

/** Name search + tag filter, applied on top of a category slice. */
export function applyFilters(assets: Asset[], query: string, tags: string[]): Asset[] {
  const q = query.trim().toLowerCase();
  return assets.filter((a) => {
    if (q && !a.name.toLowerCase().includes(q)) return false;
    if (tags.length === 0) return true;
    const own = assetTags(a);
    return tags.every((t) => own.includes(t));
  });
}

// ---- Details-panel data (derived deterministically from the seed) ----

const formatByType: Record<AssetType, string> = {
  image: "PNG",
  skybox: "EXR",
  environment: "HDR",
  video: "MP4",
  mesh: "OBJ",
  camera: "RIG",
};

const descByType: Record<AssetType, string> = {
  image: "A generated reference image, ready to drop onto a plane or use as a texture in your scene.",
  skybox: "A panoramic backdrop that wraps the scene. It sets what the cameras see behind your objects without lighting them.",
  environment: "An HDRI environment that lights and reflects onto everything in the scene.",
  video: "A short looping clip you can project onto surfaces or use as a moving backdrop.",
  mesh: "A 3D model rigged in a neutral pose — ready to customize and place into your scene.",
  camera: "A capture rig. Drops in as a linked start and end camera that orbit the master object and shoot a turntable dataset between them.",
};

const smartPool = ["Static", "Image", "Work", "Industry", "Outdoor", "Studio", "Vehicle", "Nature"];
const manualPool = ["Recycling", "Horizontal", "Photography", "Cardboard", "Concept", "Draft", "Hero"];

function pick<T>(arr: T[], seed: number, count: number, offset = 0): T[] {
  const out: T[] = [];
  for (let i = 0; i < count; i++) out.push(arr[(seed + offset + i * 3) % arr.length]);
  return [...new Set(out)];
}

/** What the AI would tag this asset with — the same read `deriveDetails`
 *  starts from, exposed so the edit form can ask for it again after the user
 *  has removed tags they disagreed with. */
export function suggestSmartTags(a: Asset): string[] {
  return pick(smartPool, a.seed, 4);
}

/**
 * The same two default tag lists, for anything that has a seed but isn't a
 * library asset — a placed scene object. Exported so the object info card and
 * the asset details card fill their tag sections from ONE source; two copies of
 * this derivation would drift, and the whole point of those two panels is that
 * they're the same card looking at different things.
 */
export const defaultSmartTags = (seed: number): string[] => pick(smartPool, seed, 4);
export const defaultManualTags = (seed: number): string[] => pick(manualPool, seed, 3, 5);

export interface AssetDetails {
  description: string;
  smartTags: string[];
  manualTags: string[];
  savedIn: string;
  typeLabel: string;
  format: string;
  size: string;
  dimensions: string;
  owner: string;
  createdAt: string;
  status: string;
}

export function deriveDetails(a: Asset): AssetDetails {
  return {
    description: descByType[a.type],
    smartTags: a.smartTags ?? defaultSmartTags(a.seed),
    manualTags: a.manualTags ?? defaultManualTags(a.seed),
    savedIn: a.uploaded ? "Uploads" : "Library",
    typeLabel: typeBadge[a.type],
    format: formatByType[a.type],
    size: (((a.seed * 7) % 380) / 100 + 0.6).toFixed(2) + " MB",
    dimensions: a.type === "mesh" ? "—" : "1600 × 900 px",
    owner: "Delbin",
    createdAt: "Feb 23, 2026",
    status: "Public",
  };
}
