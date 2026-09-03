import type { AssetType } from "./assets-data";
import { DEFAULT_OBJECT_COLOR, OBJECT_SWATCHES } from "./scene-palette";

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
 * THE WORLD, RATHER THAN A THING IN IT.
 *
 * An HDRI lights the scene, a skybox sits behind it, and a Gaussian splat is a
 * captured place that does both — none of the three is an object you arrange,
 * clamp inside a room, sweep up with a marquee or hand a dataset role to.
 *
 * It exists because that sentence was written out three times, in three files,
 * as three copies of `source !== "environment" && source !== "skybox"` — so
 * adding splats would have meant finding all three and hoping there wasn't a
 * fourth. There was very nearly a fourth.
 */
export const isWorldAsset = (source: AssetType) =>
  source === "environment" || source === "skybox" || source === "splat";

/**
 * Roles a given object is allowed to take — cameras and backdrops take none.
 *
 * A camera is the thing pointed AT the subject. The world assets are what the
 * subject stands in; none of them is a subject a dataset axis can vary, so
 * offering them a role would be offering a setting that changes nothing.
 */
export const canTakeRole = (source: AssetType) =>
  source !== "camera" && !isWorldAsset(source);

/**
 * AN OBJECT WITH A BODY.
 *
 * The question almost every list in TerraGen is really asking: can the solver
 * place this, can a run swap it, does it count toward the objects in the scene?
 * `canTakeRole` alone stopped being the right test when groups arrived — a group
 * passes it (it can be the master, and the rig frames the centre of what it
 * holds) but it has no footprint, no asset behind it and no material of its own.
 *
 * A list that included both a group and its contents would act on everything
 * inside it twice: the arrangement solver would place the group — which moves
 * its contents — and then place each of those contents again.
 */
export const isContentObject = (o: { source: AssetType; group?: true }) =>
  !o.group && canTakeRole(o.source);

/**
 * ONE ASSIGNABLE MATERIAL ON A MESH.
 *
 * A GLB is not one surface. The modeller splits its faces into groups and gives
 * each group its own material — painted steel, polished rams, tinted glass —
 * and Unreal exposes those groups as Element 0, Element 1, Element 2, each with
 * its own Material Instance. Editing "the object's roughness" can only ever mean
 * one of them, so the material stopped being a field on the object and became a
 * list of these.
 *
 * `name` is the material's OWN name in the file. It is the identity — what a
 * reload matches on and what the dispatch payload names — while the panel labels
 * rows "Element N", because that is the vocabulary the engine end speaks.
 */
export interface MaterialSlot {
  name: string;
  color: string;
  metalness: number;
  roughness: number;
  specular: number;
  normal: number;
}

/**
 * What an HDRI contributes before anyone touches it.
 *
 * 0.35 is not a taste call — it is the value `SceneCanvas` has been rendering
 * at since the environment map was added, hard-coded into the `<Environment>`
 * element. Exposing the control had to start from what the scene already looked
 * like, or every existing project would have relit itself the day the slider
 * shipped.
 */
export const DEFAULT_SKY_INFLUENCE = 0.35;

/** What every slot starts as, and the values "unedited" is measured against. */
export const DEFAULT_MATERIAL: Omit<MaterialSlot, "name"> = {
  // Straight from the palette rather than through `OBJECT_COLORS` below, which
  // is only a re-export of it and is declared further down this file.
  color: DEFAULT_OBJECT_COLOR,
  metalness: 0.1,
  roughness: 0.8,
  specular: 0.5,
  normal: 1,
};

/** The name a slot carries before a real file has told us better. */
export const UNNAMED_SLOT = "Material";

export const makeMaterialSlot = (name = UNNAMED_SLOT): MaterialSlot => ({
  name,
  ...DEFAULT_MATERIAL,
});

/**
 * The slot being edited, clamped.
 *
 * Never returns undefined: a scene object always has at least one slot, and the
 * index is UI state that can outlive the slot list it was pointing into — a GLB
 * finishing its load replaces one slot with three, and a deselect-reselect can
 * arrive with the old index still in hand.
 */
export const materialOf = (o: SceneObject, slot = 0): MaterialSlot =>
  o.materials[Math.min(Math.max(slot, 0), o.materials.length - 1)] ?? makeMaterialSlot();

/** Has anyone touched this slot? Drives the edited dot and what the payload
 *  carries — TerraGen is sent modified slots, not every slot. */
export const slotEdited = (m: MaterialSlot): boolean =>
  m.color !== DEFAULT_MATERIAL.color ||
  m.metalness !== DEFAULT_MATERIAL.metalness ||
  m.roughness !== DEFAULT_MATERIAL.roughness ||
  m.specular !== DEFAULT_MATERIAL.specular ||
  m.normal !== DEFAULT_MATERIAL.normal;

/** A 3D object placed in the viewport. Transform is stored UI-friendly:
 *  position in metres, rotation in degrees, scale as multipliers. */
export interface SceneObject {
  id: string;
  name: string;
  source: AssetType;
  shape: ObjectShape;
  /** path to a real GLB — when set, this renders instead of the placeholder shape */
  modelUrl?: string;
  /**
   * The equirectangular sky this object IS, when it is a real one.
   *
   * A SKY IS NOT A BODY, so this is the whole of its geometry: an HDRI or a
   * skybox has no mesh, no place to stand and nothing to scale — it is a
   * texture wrapped around everything else, and `SceneCanvas` renders it by
   * handing this path to `<Environment>` rather than by drawing an object.
   *
   * Absent means the shipped default sky keeps rendering, which is what most of
   * the catalogue's named placeholders do — see `skyUrl` on `Asset`.
   */
  skyUrl?: string;
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
   * tree nests on. Written by `group()`; read by the tree, the search, delete,
   * copy and the group transform.
   */
  parentId?: string;
  /**
   * THIS OBJECT IS A CONTAINER, not a thing.
   *
   * A group is a SceneObject on purpose rather than a fourth kind of scene
   * entity: `parentId` has to point at something, the layers tree already nests
   * on it, and every operation a group needs — rename, delete, copy, transform,
   * a dataset role — is an operation objects already have. A parallel
   * `groups: SceneGroup[]` list would have meant teaching all of that a second
   * vocabulary.
   *
   * What it does NOT have is geometry. `SceneWorld` skips it, so its `source`
   * (a `mesh`, for want of a member that means nothing) never draws — it exists
   * only to satisfy the type, which is why every label goes through
   * `objectTypeLabel` rather than reading `SOURCE_LABEL` directly.
   *
   * Its transform is real, though: position is where the group IS, and moving it
   * carries its contents (see `group-transform.ts`).
   */
  group?: true;
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
  /**
   * MATERIAL, PER SLOT (Texture panel). Always at least one entry.
   *
   * It was five flat fields until slots arrived, which could express "this
   * object is rough" and nothing else — an excavator whose glass and whose
   * paintwork had to share one roughness. Each factor is still always active;
   * its slider value alone drives that slot (0 is the "off" end of the range).
   *
   * A placeholder shape has exactly one slot. A real GLB gets its slots the
   * moment the file finishes loading and tells us how many it has — see
   * `discoverMaterials` in useScene.
   */
  materials: MaterialSlot[];
  /**
   * A SPLAT'S ONE DIAL — how bright the captured field renders.
   *
   * It sits beside the five PBR factors rather than in a structure of its own
   * because it is the same kind of statement about the same kind of thing: what
   * this object looks like. A splat has no albedo to tint and no microsurface to
   * roughen — it is baked light — so the five above mean nothing to it and this
   * one means nothing to a mesh. Every object still carries both sets, exactly
   * as every object already carries a colour it may never show.
   *
   * 1 is the capture as it was recorded; the range runs 0–2 so a dim interior
   * can be lifted and a blown-out yard pulled back.
   *
   * An HDRI and a skybox read it as Sky Brightness — the same statement about
   * the same kind of thing, so it is the same field rather than a second one
   * that would have to be kept in step with it.
   */
  brightness: number;
  /**
   * HOW MUCH OF THE SKY LANDS ON THE OBJECTS.
   *
   * Separate from `brightness`, because they are genuinely two questions: how
   * bright the sky itself renders, and how much it lights and reflects onto
   * everything standing in front of it. Turning an HDRI down to a dim backdrop
   * while it still floods the scene is a real thing to want, and one dial can't
   * say it.
   *
   * EVERY WORLD ASSET CARRIES IT — HDRI, skybox and splat alike. It was on the
   * HDRI alone at first, on the reasoning that a skybox is a backdrop that does
   * not light the scene. That is how the two asset types differ in the
   * catalogue, but it is not a reason to withhold the control: the spec gives
   * Sky Influence to skyboxes and to Gaussian splats too, and a captured place
   * standing around your objects plainly does cast light on them.
   *
   * Drives `environmentIntensity` in SceneCanvas — the ambient contribution and
   * reflection intensity landing on everything in the scene.
   */
  skyInfluence: number;
}

/**
 * What to CALL this object — the title badge, the info panel, the layer row.
 *
 * A group has no source worth naming, so it cannot go through `SOURCE_LABEL`:
 * that map is about where an asset came from, and a group came from a selection.
 */
export const objectTypeLabel = (o: { source: AssetType; group?: true }) =>
  o.group ? "Group" : SOURCE_LABEL[o.source];

/** Human-readable label for an object's source type (title badge, info panel). */
export const SOURCE_LABEL: Record<AssetType, string> = {
  mesh: "3D Model",
  image: "Image",
  skybox: "Skybox",
  environment: "Environment",
  splat: "Gaussian Splat",
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
      materials: [makeMaterialSlot()],
      brightness: 1,
      skyInfluence: DEFAULT_SKY_INFLUENCE,
    };
  };
  return [build("start", startPos), build("end", endPos)];
}

/**
 * A GROUP — the container a multi-selection collapses into.
 *
 * Its position is handed in rather than defaulted: a group belongs at the centre
 * of what it holds, and that is the caller's arithmetic (see `useScene.group`).
 * Everything else is the inert minimum — a group is not shaded, so its material
 * fields exist only because the type says they must, and they become meaningful
 * the moment somebody edits the Texture panel with the group selected, which
 * writes through to its contents.
 */
export function makeGroup(name: string, position: [number, number, number]): SceneObject {
  counter += 1;
  return {
    id: `grp-${counter}`,
    name,
    group: true,
    // No AssetType means "container", and inventing one would put a member into
    // the asset library's vocabulary that the library can never hold.
    source: "mesh",
    shape: "capsule",
    position,
    rotationDeg: [0, 0, 0],
    scale: [1, 1, 1],
    role: "none",
    description:
      "A group. Moving, turning or scaling it carries everything inside; a texture set here paints all of them.",
    materials: [makeMaterialSlot()],
    brightness: 1,
    skyInfluence: DEFAULT_SKY_INFLUENCE,
  };
}

/**
 * The placeholder shape an asset stands for.
 *
 * Deterministic from the asset's own seed rather than from the mint counter, so
 * a stand-in previewed in the viewport is the same shape every time it is
 * previewed — and the same shape the library thumbnail led you to expect.
 */
export const shapeForSeed = (seed: number): ObjectShape =>
  SHAPES[Math.abs(Math.round(seed)) % SHAPES.length];

export function makeSceneObject(
  name: string,
  source: AssetType,
  position: [number, number, number] = [0, 0.5, 0],
  modelUrl?: string,
  skyUrl?: string
): SceneObject {
  counter += 1;
  return {
    id: `obj-${counter}`,
    name,
    source,
    shape: SHAPES[counter % SHAPES.length],
    modelUrl,
    skyUrl,
    position,
    rotationDeg: [0, 0, 0],
    scale: [1, 1, 1],
    role: "none",
    /* A world asset has no material to customise — a splat's whole appearance is
       one brightness, and telling someone to edit a material it doesn't have
       sends them looking for a panel that isn't there.

       AND A SKY HAS NO TRANSFORM EITHER. This sentence used to tell everything
       filed under Environments to "move and scale it to sit around your
       objects", which is true of a captured place and false of an HDRI: there
       is nothing to move, and the panel that would have moved it is gone (see
       ObjectToolbar). A description that names controls the object does not
       have is the most expensive kind of wrong — it sends someone hunting. */
    description:
      source === "environment" || source === "skybox"
        ? `${SOURCE_LABEL[source]} wrapped around the whole scene. It has no position — set how bright it renders and how much of it lands on your objects.`
        : isWorldAsset(source)
          ? `${SOURCE_LABEL[source]} placed in the scene. Move and scale it to sit around your objects, and set how bright it renders.`
          : `${SOURCE_LABEL[source]} asset placed in the scene. Customize its transform and material to suit your world.`,
    materials: [makeMaterialSlot()],
    brightness: 1,
    skyInfluence: DEFAULT_SKY_INFLUENCE,
  };
}
