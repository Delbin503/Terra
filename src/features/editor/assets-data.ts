import type { IconName } from "@/components/icons";

/**
 * The asset kinds Terra works with. `video` is retained because the scene
 * layer still types objects by source (see scene-types.ts) — the library no
 * longer browses it as its own category.
 */
export type AssetType = "image" | "environment" | "video" | "mesh" | "camera";

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
export type CategoryId = "all" | "images" | "hdri" | "uploads" | "meshes" | "utilities";

/** Second-level view under Uploads. */
export type UploadView = "assets" | "folders";

export interface Category {
  id: CategoryId;
  label: string;
  icon: IconName;
  /** the asset type this category filters to (undefined = special) */
  type?: AssetType;
}

export const categories: Category[] = [
  { id: "all", label: "Assets", icon: "assets" },
  { id: "images", label: "Images", icon: "input-2d", type: "image" },
  { id: "hdri", label: "HDRI Map", icon: "environment", type: "environment" },
  { id: "uploads", label: "Uploads", icon: "upload" },
  { id: "meshes", label: "3D Meshes", icon: "input-3d", type: "mesh" },
  // Utilities holds scene rigs rather than content — things you drop in to
  // capture the scene, not things the scene is made of.
  { id: "utilities", label: "Utilities", icon: "camera", type: "camera" },
];

export const uploadViews: { id: UploadView; label: string; icon: IconName }[] = [
  { id: "assets", label: "My Assets", icon: "upload" },
  { id: "folders", label: "Folders", icon: "folder" },
];

/** Corner badge icon per asset type. */
export const typeIcon: Record<AssetType, IconName> = {
  image: "input-2d",
  environment: "environment",
  video: "video",
  mesh: "input-3d",
  camera: "camera",
};

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
  image: ["Desert Dunes", "Coastal Cliff", "Neon Alley", "Foggy Pines", "Golden Field", "Harbor Dawn", "Canyon Pass"],
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
  ...build("image"),
  ...build("environment"),
  ...build("mesh"),
  ...build("camera"),
];

/* ------------------------------------------------------------- filtering */

/**
 * Which assets belong in a category. Utilities are excluded from "Assets" —
 * that tab is the content library, and a capture rig isn't content.
 */
export function filterByCategory(assets: Asset[], cat: CategoryId): Asset[] {
  if (cat === "all") return assets.filter((a) => a.type !== "camera");
  if (cat === "uploads") return assets.filter((a) => a.uploaded);
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
  environment: "HDR",
  video: "MP4",
  mesh: "OBJ",
  camera: "RIG",
};

const descByType: Record<AssetType, string> = {
  image: "A generated reference image, ready to drop onto a plane or use as a texture in your scene.",
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
    typeLabel:
      a.type === "mesh" ? "3D" : a.type === "environment" ? "HDRI" : a.type[0].toUpperCase() + a.type.slice(1),
    format: formatByType[a.type],
    size: (((a.seed * 7) % 380) / 100 + 0.6).toFixed(2) + " MB",
    dimensions: a.type === "mesh" ? "—" : "1600 × 900 px",
    owner: "Delbin",
    createdAt: "Feb 23, 2026",
    status: "Public",
  };
}
