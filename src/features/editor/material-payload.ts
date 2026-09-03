import {
  DEFAULT_SKY_INFLUENCE,
  slotEdited,
  type SceneObject,
} from "./scene-types";

/**
 * WHAT THE SCENE'S MATERIALS ARE, IN TERRAGEN'S VOCABULARY.
 * ---------------------------------------------------------
 * The last step of the spec's §3.1: "when scene generation is triggered, all
 * modified material slot states are packaged into the payload sent to TerraGen."
 *
 * It is a pure function over the scene rather than something the panels build as
 * they go, because a payload assembled by the UI is a payload that is only
 * correct if every edit path remembered to update it. This one cannot fall out
 * of step with the scene: it reads the objects at dispatch and derives.
 *
 * IT NAMES THINGS THE WAY THE ENGINE DOES. The web side says Metallic and
 * Normal; the Master Material instance exposes MetallicFactor and NormalScale.
 * Translating here — once, at the boundary — is what stops the two vocabularies
 * leaking into each other, and makes the payload readable next to the Unreal
 * parameter list it is aimed at.
 *
 * ONLY WHAT WAS CHANGED. A slot nobody touched carries the same values the
 * asset already ships with, so sending it would ask TerraGen to override an
 * import with a copy of itself — and would bury the three deliberate edits in a
 * hundred defaults. Untouched objects drop out entirely.
 */

/** One material slot, as the engine's Material Instance parameters. */
export interface MaterialSlotPayload {
  /** which Element this is on the Unreal mesh */
  slot: number;
  /** the material's own name in the source file, for matching */
  name: string;
  albedoTint: string;
  metallicFactor: number;
  roughnessFactor: number;
  specularFactor: number;
  normalScale: number;
}

export interface ObjectMaterialPayload {
  id: string;
  name: string;
  /** the source file, when the object came from one — the payload's join key */
  modelUrl?: string;
  slots: MaterialSlotPayload[];
}

/** The sky's two parameters, bound for the Master Sky Material and the Ultra
 *  Dynamic Sky actor. Both kinds carry both — a skybox is dimmed and casts
 *  ambient exactly as an HDRI does. */
export interface SkyPayload {
  id: string;
  name: string;
  kind: "environment" | "skybox";
  skyBrightness: number;
  skyInfluence: number;
}

/** A splat's scalars: brightness for the GS render component, and the ambient
 *  it contributes to everything standing in it. */
export interface SplatPayload {
  id: string;
  name: string;
  brightness: number;
  skyInfluence: number;
}

export interface MaterialPayload {
  objects: ObjectMaterialPayload[];
  sky: SkyPayload[];
  splats: SplatPayload[];
}

/** A world asset only earns a place in the payload once it differs from what
 *  the scene renders by default — same rule as a material slot. Both parameters
 *  count, for every kind of world asset. */
const worldEdited = (o: SceneObject) =>
  o.brightness !== 1 || o.skyInfluence !== DEFAULT_SKY_INFLUENCE;

export function buildMaterialPayload(objects: SceneObject[]): MaterialPayload {
  const out: MaterialPayload = { objects: [], sky: [], splats: [] };

  for (const o of objects) {
    // A group has a nominal material it never renders — it is a name for some
    // objects, and those objects are in this list on their own account.
    if (o.group) continue;

    if (o.source === "splat") {
      if (worldEdited(o)) {
        out.splats.push({
          id: o.id,
          name: o.name,
          brightness: o.brightness,
          skyInfluence: o.skyInfluence,
        });
      }
      continue;
    }

    if (o.source === "environment" || o.source === "skybox") {
      if (worldEdited(o)) {
        out.sky.push({
          id: o.id,
          name: o.name,
          kind: o.source,
          skyBrightness: o.brightness,
          skyInfluence: o.skyInfluence,
        });
      }
      continue;
    }

    // A camera has a material it cannot show, for the same reason a group does.
    if (o.source === "camera") continue;

    const slots = o.materials
      .map((m, slot) => ({ m, slot }))
      .filter(({ m }) => slotEdited(m))
      .map(({ m, slot }) => ({
        slot,
        name: m.name,
        albedoTint: m.color,
        metallicFactor: m.metalness,
        roughnessFactor: m.roughness,
        specularFactor: m.specular,
        normalScale: m.normal,
      }));

    if (slots.length > 0) {
      out.objects.push({ id: o.id, name: o.name, modelUrl: o.modelUrl, slots });
    }
  }

  return out;
}

/** How many slots across how many objects — the one figure the dispatch review
 *  needs, without it having to walk the payload itself. */
export function countEditedSlots(p: MaterialPayload): { objects: number; slots: number } {
  return {
    objects: p.objects.length,
    slots: p.objects.reduce((n, o) => n + o.slots.length, 0),
  };
}

/** True when there is nothing worth sending — every material still at its
 *  default. Kept as a function so the review and the dispatch agree on what
 *  "nothing to send" means. */
export const isEmptyPayload = (p: MaterialPayload) =>
  p.objects.length === 0 && p.sky.length === 0 && p.splats.length === 0;
