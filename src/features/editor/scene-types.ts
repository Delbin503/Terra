import type { AssetType } from "./assets-data";

/** Placeholder geometry variants (until real GLB assets are wired in). */
export type ObjectShape = "sphere" | "cylinder" | "cone" | "torus" | "capsule" | "ico" | "dodec";
const SHAPES: ObjectShape[] = ["capsule", "cylinder", "sphere", "cone", "torus", "ico", "dodec"];

/** A 3D object placed in the viewport. Transform is stored UI-friendly:
 *  position in metres, rotation in degrees, scale as multipliers. */
export interface SceneObject {
  id: string;
  name: string;
  source: AssetType;
  shape: ObjectShape;
  /** path to a real GLB — when set, this renders instead of the placeholder shape */
  modelUrl?: string;
  position: [number, number, number];
  rotationDeg: [number, number, number];
  scale: [number, number, number];
  /** Marks the scene's primary/hero object — surfaces a badge on the title. */
  isMaster: boolean;
  /** Shown under the title and in the info panel. */
  description: string;
  // material (Texture panel) — each factor is always active; its slider value
  // alone drives the material (0 is the "off" end of the range).
  color: string;
  metalness: number;
  roughness: number;
  specular: number;
  normal: number;
}

/** Human-readable label for an object's source type (title badge, info panel). */
export const SOURCE_LABEL: Record<AssetType, string> = {
  mesh: "3D Mesh",
  image: "Image",
  environment: "Environment",
  video: "Video",
};

/** Base-colour swatches for the Texture → Color tab. */
export const OBJECT_COLORS = [
  "#9a958f", // warm gray (default)
  "#c98a5a", // terracotta
  "#6f7bd0", // indigo
  "#7fae7f", // moss
  "#d8b98a", // sand
  "#c77fb0", // orchid
  "#2f6f7a", // teal
  "#e5675f", // rose
];

let counter = 0;

export function makeSceneObject(
  name: string,
  source: AssetType,
  position: [number, number, number] = [0, 0.5, 0],
  modelUrl?: string
): SceneObject {
  counter += 1;
  return {
    id: `obj-${counter}`,
    name,
    source,
    shape: SHAPES[counter % SHAPES.length],
    modelUrl,
    position,
    rotationDeg: [0, 0, 0],
    scale: [1, 1, 1],
    isMaster: false,
    description: `${SOURCE_LABEL[source]} asset placed in the scene. Customize its transform and material to suit your world.`,
    color: OBJECT_COLORS[0],
    metalness: 0.1,
    roughness: 0.8,
    specular: 0.5,
    normal: 1,
  };
}
