import type { AssetType } from "./assets-data";
import { OBJECT_SWATCHES } from "./scene-palette";

/** Placeholder geometry variants (until real GLB assets are wired in). */
export type ObjectShape = "sphere" | "cylinder" | "cone" | "torus" | "capsule" | "ico" | "dodec";
const SHAPES: ObjectShape[] = ["capsule", "cylinder", "sphere", "cone", "torus", "ico", "dodec"];

/**
 * What an object is FOR, in dataset terms — the vocabulary TerraGen's three
 * object axes are written against.
 *
 * · `master`      the hero. Exactly one per scene; every camera orbits it.
 * · `distractor`  foreground clutter the trained detector must learn to ignore.
 * · `background`  scene dressing that sets context behind the hero.
 * · `none`        placed, rendered, but not a subject of any axis.
 *
 * Cameras and the HDRI never take a content role: a camera is the thing pointed
 * AT the hero, and the HDRI is the Background *axis*, which is a different
 * concept from a background *object*.
 */
export type ObjectRole = "none" | "master" | "distractor" | "background";

/** Every content role, in the order the pickers list them. */
export const OBJECT_ROLES: ObjectRole[] = ["none", "master", "distractor", "background"];

export const ROLE_LABEL: Record<ObjectRole, string> = {
  none: "No role",
  master: "Master Object",
  distractor: "Distractor",
  background: "Background Object",
};

/** The short form, for badges and layer rows where the full label won't fit. */
export const ROLE_BADGE: Record<ObjectRole, string> = {
  none: "",
  master: "Master",
  distractor: "Distractor",
  background: "Background",
};

export const ROLE_HINT: Record<ObjectRole, string> = {
  none: "Rendered, but no axis varies it.",
  master: "The hero every camera orbits. Only one per scene.",
  distractor: "Foreground clutter the detector must learn to ignore.",
  background: "Scene dressing that sets context behind the hero.",
};

/**
 * Role → Tailwind classes, written out in full.
 *
 * WHY THESE ARE LITERALS. Tailwind's scanner only matches class names that
 * appear verbatim in source, so a composed `text-${token}-on-glass` compiles to
 * nothing — the badge silently loses its colour, with no error anywhere to say
 * why. Every role class the app can emit is therefore spelled out once, here,
 * and shared by the toolbar, the title, the info panel and the layers tree so
 * the five surfaces can't drift apart.
 *
 * `none` has no colour of its own: an object with no role should read as
 * ordinary, not as a fourth category.
 */
export const ROLE_DOT: Record<ObjectRole, string> = {
  none: "border-glass/30",
  master: "bg-master border-master",
  distractor: "bg-distractor border-distractor",
  background: "bg-backdrop border-backdrop",
};

/** Label ink for a role-tinted glass ornament. */
export const ROLE_TEXT: Record<ObjectRole, string> = {
  none: "text-content-muted",
  master: "text-master-on-glass",
  distractor: "text-distractor-on-glass",
  background: "text-backdrop-on-glass",
};

/** The glass tint itself — pair with ROLE_TEXT. */
export const ROLE_GLASS: Record<ObjectRole, string> = {
  none: "",
  master: "glass-role glass-role-master",
  distractor: "glass-role glass-role-distractor",
  background: "glass-role glass-role-backdrop",
};

/** The shared `Pill` tone for each content role. */
export const ROLE_PILL_TONE: Record<
  Exclude<ObjectRole, "none">,
  "master" | "distractor" | "backdrop"
> = {
  master: "master",
  distractor: "distractor",
  background: "backdrop",
};

/** Soft chip background + border, for pills and rows on a solid panel. */
export const ROLE_CHIP: Record<ObjectRole, string> = {
  none: "border-glass/15 text-content-muted",
  master: "border-master/45 bg-master/12 text-master-on-glass",
  distractor: "border-distractor/45 bg-distractor/12 text-distractor-on-glass",
  background: "border-backdrop/45 bg-backdrop/12 text-backdrop-on-glass",
};

/** Reads the hero flag. Kept as a function so the ~30 call sites that only ask
 *  "is this the master?" didn't all have to learn the enum. */
export const isMaster = (o: { role: ObjectRole }) => o.role === "master";

/**
 * Roles a given object is allowed to take — cameras and backdrops take none.
 *
 * A camera is the thing pointed AT the subject. An HDRI lights the scene and a
 * skybox sits behind it; neither is a subject a dataset axis can vary, so
 * offering them a role would be offering a setting that changes nothing.
 */
export const canTakeRole = (source: AssetType) =>
  source !== "camera" && source !== "environment" && source !== "skybox";

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
  /**
   * What this object IS to a Work Order — the field the three object axes read.
   *
   * It replaced a plain `isMaster` boolean because a boolean can express "this
   * is the hero" and nothing else: TerraGen also needs to know which objects are
   * background dressing and which are distractors the detector must learn to
   * ignore. Those are the same kind of statement about an object, so they are
   * one field rather than three flags that could contradict each other.
   */
  role: ObjectRole;
  /**
   * The container this object sits inside, if any — the single field the layers
   * tree nests on. Nothing creates groups yet; the field exists so that when
   * grouping ships, the panel, the search and the context menu already handle
   * arbitrary depth instead of needing a second pass.
   */
  parentId?: string;
  /**
   * A stand-in for something still being generated. It occupies the spot in the
   * scene — so "place into scene" can answer immediately instead of after the
   * pass — and renders as a ghost until the real asset replaces it.
   */
  pending?: boolean;
  /** Excluded from the viewport. Still listed in the layers tree, dimmed. */
  hidden?: boolean;
  /** Pinned in place — selectable and listed, but the gizmo won't move it. */
  locked?: boolean;
  /** Set on the two cameras of a capture rig — which end of the sweep this is. */
  cameraRole?: "start" | "end";
  /** The rig both cameras belong to. Moving one moves the other. */
  rigId?: string;
  /** Shown under the title and in the info panel. */
  description: string;
  /**
   * Tags, once they've been edited — same contract as the library asset's.
   * Both start life derived from the object's id and only become stored fields
   * when someone changes them, so a placed object nobody has touched doesn't
   * carry a copy of its own defaults.
   */
  smartTags?: string[];
  manualTags?: string[];
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
  mesh: "3D Model",
  image: "Image",
  skybox: "Skybox",
  environment: "Environment",
  video: "Video",
  camera: "Camera",
};

/** Base-colour swatches for the Texture → Color tab. Re-exported from the
 *  scene palette, which is also what the AI assistant resolves colour words
 *  against — one list, so "make it red" and the red swatch always agree. */
export const OBJECT_COLORS = OBJECT_SWATCHES;

let counter = 0;

/** Mint an id from the same counter `makeSceneObject` uses. Duplicate and paste
 *  clone every other field verbatim, so they need ids from here rather than a
 *  second sequence that could collide with it. */
export function nextObjectId(prefix = "obj"): string {
  counter += 1;
  return `${prefix}-${counter}`;
}

/**
 * Build the two cameras of a capture rig. One object dropped, two placed: the
 * sweep needs a start and an end, and asking the user to place a second camera
 * and then declare it the partner is the ceremony this design removes.
 */
export function makeCameraRig(
  rigId: string,
  startPos: [number, number, number],
  endPos: [number, number, number]
): [SceneObject, SceneObject] {
  // Named `which` rather than `role`: since objects gained a content role, an
  // unqualified `role` in this file means the dataset role, and a camera's
  // never is one.
  const build = (which: "start" | "end", position: [number, number, number]): SceneObject => {
    counter += 1;
    return {
      id: `cam-${counter}`,
      // The start camera stands for the whole rig in the layers panel, so it
      // carries the plain name; "Camera 1" there would imply a Camera 2 sitting
      // somewhere the panel never shows.
      name: which === "start" ? "Camera" : "Camera (end)",
      source: "camera",
      shape: "capsule",
      position,
      rotationDeg: [0, 0, 0],
      scale: [1, 1, 1],
      role: "none",
      cameraRole: which,
      rigId,
      description:
        which === "start"
          ? "Start of the capture sweep. The master turns a full revolution here before the rig steps toward Camera 2."
          : "End of the capture sweep. The rig stops climbing once another step would overshoot this point.",
      color: OBJECT_COLORS[0],
      metalness: 0.1,
      roughness: 0.8,
      specular: 0.5,
      normal: 1,
    };
  };
  return [build("start", startPos), build("end", endPos)];
}

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
    role: "none",
    description: `${SOURCE_LABEL[source]} asset placed in the scene. Customize its transform and material to suit your world.`,
    color: OBJECT_COLORS[0],
    metalness: 0.1,
    roughness: 0.8,
    specular: 0.5,
    normal: 1,
  };
}
