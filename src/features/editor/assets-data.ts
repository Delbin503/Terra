import type { IconName } from "@/components/icons";

/** The four generatable asset kinds Terra works with. */
export type AssetType = "image" | "environment" | "video" | "mesh";

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
}

export type CategoryId = "all" | "images" | "environments" | "videos" | "meshes" | "uploads";

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
  { id: "environments", label: "Environments", icon: "environment", type: "environment" },
  { id: "videos", label: "Videos", icon: "video", type: "video" },
  { id: "meshes", label: "3D Meshes", icon: "input-3d", type: "mesh" },
  { id: "uploads", label: "Uploads", icon: "upload" },
];

/** Corner badge icon per asset type. */
export const typeIcon: Record<AssetType, IconName> = {
  image: "input-2d",
  environment: "environment",
  video: "video",
  mesh: "input-3d",
};

const namePools: Record<AssetType, string[]> = {
  image: ["Desert Dunes", "Coastal Cliff", "Neon Alley", "Foggy Pines", "Golden Field", "Harbor Dawn", "Canyon Pass"],
  environment: ["Studio HDRI", "Sunset Field", "Overcast Sky", "Night City", "Forest Clearing", "Snow Plain", "Blue Hour"],
  video: ["Traffic Loop", "Crowd Walk", "Rain Drive", "Drone Sweep", "Timelapse Sky", "Street Pan"],
  mesh: ["Sedan", "Robotic Hand", "Street Lamp", "Bus Stop", "Fire Hydrant", "Barrier", "Sign Post"],
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
  ...build("video"),
  ...build("mesh"),
];

/** Which assets belong in a category. */
export function filterByCategory(assets: Asset[], cat: CategoryId): Asset[] {
  if (cat === "all") return assets;
  if (cat === "uploads") return assets.filter((a) => a.uploaded);
  const type = categories.find((c) => c.id === cat)?.type;
  return type ? assets.filter((a) => a.type === type) : assets;
}

// ---- Details-panel data (derived deterministically from the seed) ----

const formatByType: Record<AssetType, string> = {
  image: "PNG",
  environment: "HDR",
  video: "MP4",
  mesh: "OBJ",
};

const descByType: Record<AssetType, string> = {
  image: "A generated reference image, ready to drop onto a plane or use as a texture in your scene.",
  environment: "An HDRI environment that lights and reflects onto everything in the scene.",
  video: "A short looping clip you can project onto surfaces or use as a moving backdrop.",
  mesh: "A 3D model rigged in a neutral pose — ready to customize and place into your scene.",
};

const smartPool = ["Static", "Image", "Work", "Industry", "Outdoor", "Studio", "Vehicle", "Nature"];
const manualPool = ["Recycling", "Horizontal", "Photography", "Cardboard", "Concept", "Draft", "Hero"];

function pick<T>(arr: T[], seed: number, count: number, offset = 0): T[] {
  const out: T[] = [];
  for (let i = 0; i < count; i++) out.push(arr[(seed + offset + i * 3) % arr.length]);
  return [...new Set(out)];
}

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
    smartTags: pick(smartPool, a.seed, 4),
    manualTags: pick(manualPool, a.seed, 3, 5),
    savedIn: a.uploaded ? "Uploads" : "Library",
    typeLabel: a.type === "mesh" ? "3D" : a.type[0].toUpperCase() + a.type.slice(1),
    format: formatByType[a.type],
    size: (((a.seed * 7) % 380) / 100 + 0.6).toFixed(2) + " MB",
    dimensions: a.type === "mesh" ? "—" : "1600 × 900 px",
    owner: "Delbin",
    createdAt: "Feb 23, 2026",
    status: "Public",
  };
}
