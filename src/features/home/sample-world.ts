import { regionAt, type Region, type SegmentResult } from "./segmentation";

/**
 * THE SAMPLE PHOTOGRAPH, AND WHAT IS IN IT.
 * ------------------------------------------------------------------
 * The image studio segments one fixed picture: a group of people walking a
 * paved path with planting either side. Everything below is what a real
 * segmentation service would return for THAT picture, written down by hand.
 *
 * WHY A FIXED IMAGE. There is no model in the browser, and there is not going to
 * be one. `segmentation.ts` genuinely finds regions — it grows them out of the
 * real pixels and traces real outlines — but it cannot know that a region is a
 * person, so a keyword could only ever be answered with "here are the N
 * regions that most read as subjects". That is a plausible-looking answer and a
 * wrong one: type "plants" and it hands you the runners. Pinning the studio to a
 * picture whose contents are known lets the demo answer keywords the way the
 * service will, and lets it be WRONG the way the service will too — a word for
 * something that isn't there comes back as an error rather than as a highlight
 * over whatever happened to be nearby.
 *
 * WHY SEEDS AND NOT TRACED POLYGONS. The obvious way to hard-code an answer is
 * to draw the silhouettes. Hand-drawn outlines would sit a few pixels off the
 * thing they claim, in a panel whose whole subject is precision, and they would
 * be wrong the moment the eraser took a bite out of somebody. Instead each item
 * is a handful of POINTS — a face, a shirt, the legs — and the pass looks up
 * which real region each point landed in. The outlines therefore still come from
 * the pixels; the hand-written part is only which of them is a person.
 *
 * Coordinates are fractions of the image, so they survive the rescale to
 * `SOURCE_MAX` and the downsample to the working grid.
 */

/** Where the bundled picture lives. Every studio session opens this. */
export const SAMPLE_IMAGE = {
  id: "sample-world",
  name: "Sample scene",
  src: "/samples/world-sample.jpg",
} as const;

type Seed = [u: number, v: number];

interface SampleItem {
  /** what one highlight is: one person, one bed of plants, the path */
  name: string;
  seeds: Seed[];
}

interface SampleClass {
  key: string;
  /** the word the group is labelled with when nothing was typed */
  label: string;
  /**
   * Every word that means this thing.
   *
   * Written out rather than stemmed. A stemmer would have to be right about
   * English to be useful here and it only has to serve one picture, so the list
   * is the whole vocabulary — plus a trailing "s" is stripped before matching,
   * which covers the plural nobody thought to add.
   */
  words: string[];
  items: SampleItem[];
}

/**
 * The eleven walkers, front to back.
 *
 * THREE SEEDS EACH, not one. A person is not one region to the grower: a yellow
 * top, dark leggings and a brown arm are three colours and therefore three
 * regions, and a single seed on the shirt would highlight a shirt. Head, torso
 * and legs is the smallest set that reliably picks up the whole figure, and the
 * pass unions whatever they land in.
 */
const PEOPLE: SampleItem[] = [
  { name: "Walker in olive", seeds: [[0.120, 0.045], [0.117, 0.101], [0.117, 0.205]] },
  { name: "Walker in grey", seeds: [[0.244, 0.026], [0.243, 0.091], [0.239, 0.186]] },
  { name: "Walker in denim", seeds: [[0.301, 0.044], [0.301, 0.100], [0.301, 0.148]] },
  { name: "Walker in rust", seeds: [[0.369, 0.026], [0.371, 0.080], [0.371, 0.129]] },
  { name: "Runner in pale blue", seeds: [[0.478, 0.068], [0.478, 0.129], [0.475, 0.243]] },
  { name: "Walker in white", seeds: [[0.190, 0.205], [0.192, 0.291], [0.194, 0.433]] },
  { name: "Walker in a white tee", seeds: [[0.299, 0.183], [0.301, 0.243], [0.301, 0.376]] },
  { name: "Walker in green", seeds: [[0.353, 0.316], [0.331, 0.386], [0.311, 0.529]] },
  { name: "Runner in yellow", seeds: [[0.478, 0.205], [0.475, 0.291], [0.470, 0.433]] },
  { name: "Walker in pink", seeds: [[0.621, 0.253], [0.621, 0.338], [0.618, 0.490]] },
  { name: "Walker in blue", seeds: [[0.836, 0.183], [0.836, 0.272], [0.833, 0.414]] },
];

/**
 * The hair on each head — one seed, just above the face.
 *
 * A SEPARATE CLASS RATHER THAN A PART OF `PEOPLE`, because it answers a
 * different question: "hair" should light up eleven small patches, not eleven
 * whole bodies. It is also the honest case for what this map is: the studio can
 * only name what somebody wrote down, and hair is written down.
 */
const HAIR: SampleItem[] = [
  { name: "Hair · olive", seeds: [[0.120, 0.028]] },
  { name: "Hair · grey", seeds: [[0.244, 0.011]] },
  { name: "Hair · pale blue", seeds: [[0.478, 0.049]] },
  { name: "Hair · white", seeds: [[0.190, 0.186]] },
  { name: "Hair · white tee", seeds: [[0.299, 0.163]] },
  { name: "Hair · green", seeds: [[0.353, 0.297]] },
  { name: "Hair · yellow", seeds: [[0.478, 0.186]] },
  { name: "Hair · pink", seeds: [[0.621, 0.230]] },
  { name: "Hair · blue", seeds: [[0.836, 0.163]] },
];

/** The planting: the beds down the left, the hedge along the right. */
const PLANTS: SampleItem[] = [
  { name: "Border · left", seeds: [[0.053, 0.472], [0.038, 0.719], [0.152, 0.890]] },
  { name: "Hedge · right", seeds: [[0.759, 0.063], [0.858, 0.044], [0.947, 0.205]] },
  { name: "Shrubs · far right", seeds: [[0.907, 0.472], [0.947, 0.814]] },
];

/** The path they are walking on — one thing, several seeds, because the light
 *  across it splits it into more than one region. */
const PAVEMENT: SampleItem[] = [
  {
    name: "Walking surface",
    seeds: [
      [0.400, 0.795],
      [0.232, 0.643],
      [0.580, 0.890],
      [0.719, 0.643],
      [0.460, 0.490],
    ],
  },
];

export const SAMPLE_CLASSES: SampleClass[] = [
  {
    key: "people",
    label: "Humans",
    words: [
      "human", "person", "people", "pedestrian", "walker", "runner", "jogger",
      "man", "men", "woman", "women", "figure", "crowd", "body",
    ],
    items: PEOPLE,
  },
  {
    key: "hair",
    label: "Hair",
    words: ["hair", "hairstyle", "head"],
    items: HAIR,
  },
  {
    key: "plants",
    label: "Plants",
    words: [
      "plant", "bush", "shrub", "foliage", "greenery", "leaf", "leaves",
      "hedge", "vegetation", "tree", "garden", "planting",
    ],
    items: PLANTS,
  },
  {
    key: "pavement",
    label: "Pavement",
    words: [
      "pavement", "path", "pathway", "walkway", "sidewalk", "footpath", "paving",
      "road", "street", "ground", "floor", "walking area",
    ],
    items: PAVEMENT,
  },
];

/** What a bare "Segmentize" answers with: everything the picture is made of. */
export const DEFAULT_CLASSES = ["people", "plants", "pavement"];

/**
 * Which class a typed word means, if any.
 *
 * A trailing "s" comes off both sides, so "plants" finds "plant" and someone
 * who types "hairs" finds "hair" — which is the exact case this was written for.
 */
export function classFor(raw: string): SampleClass | null {
  const word = raw.trim().toLowerCase().replace(/[^a-z\s]/g, "");
  if (!word) return null;
  const singular = word.endsWith("s") ? word.slice(0, -1) : word;
  return (
    SAMPLE_CLASSES.find((c) =>
      c.words.some((w) => {
        const ws = w.endsWith("s") ? w.slice(0, -1) : w;
        return ws === singular || w === word;
      })
    ) ?? null
  );
}

/* ------------------------------------------------------------------ pass --- */

/** One thing the pass found: a composite region built from real ones. */
export interface SampleGroup {
  word: string;
  ids: number[];
}

export interface SamplePass {
  /** the segmentation, with one composite region appended per item found */
  seg: SegmentResult;
  groups: SampleGroup[];
  /** real region id → the composite that swallowed it, for click resolution */
  memberOf: Map<number, number>;
  /** words that name nothing in this picture */
  unknown: string[];
}

/**
 * Answer a list of words against the sample picture.
 *
 * EVERY REAL REGION BELONGS TO AT MOST ONE ITEM. Two people standing against
 * each other in the same colour are one region to the grower, and without this
 * rule they would both claim it — two composites sharing an outline, drawn twice
 * and counted twice. First seed to reach a region keeps it, which is why `PEOPLE`
 * is ordered front to back: the figure in front is the one you would click.
 */
export function samplePass(seg: SegmentResult, words: string[]): SamplePass {
  const asked = words.length
    ? words.map((word) => ({ word, cls: classFor(word) }))
    : DEFAULT_CLASSES.map((key) => {
        const cls = SAMPLE_CLASSES.find((c) => c.key === key)!;
        return { word: cls.label, cls };
      });

  const unknown = asked.filter((a) => !a.cls).map((a) => a.word);
  const claimed = new Set<number>();
  const memberOf = new Map<number, number>();
  const composites: Region[] = [];
  const groups: SampleGroup[] = [];
  let nextId = seg.regions.length;

  for (const { word, cls } of asked) {
    if (!cls) continue;
    const ids: number[] = [];

    for (const item of cls.items) {
      const members: Region[] = [];
      for (const [u, v] of item.seeds) {
        const hit = regionAt(seg, u, v);
        // A seed that lands on an erased patch, or in a region another item
        // already owns, contributes nothing rather than stealing it.
        if (!hit || claimed.has(hit.id)) continue;
        claimed.add(hit.id);
        members.push(hit);
      }
      // Every seed missed: the thing has been erased out of the picture, and a
      // count that still included it would be counting a hole.
      if (members.length === 0) continue;

      const size = members.reduce((n, m) => n + m.size, 0);
      const composite: Region = {
        id: nextId,
        size,
        // Weighted by area, so the marker sits on the body rather than halfway
        // between a head and a pair of shoes.
        cx: members.reduce((n, m) => n + m.cx * m.size, 0) / size,
        cy: members.reduce((n, m) => n + m.cy * m.size, 0) / size,
        color: members.reduce((a, b) => (a.size >= b.size ? a : b)).color,
        // Sub-paths concatenate: each member outline is already a set of closed
        // loops, so the union is their sum with no geometry to compute.
        outline: members.map((m) => m.outline).join(" "),
        subject: 1,
      };
      for (const m of members) memberOf.set(m.id, composite.id);
      composites.push(composite);
      ids.push(composite.id);
      nextId += 1;
    }

    groups.push({ word, ids });
  }

  return {
    // Composites are appended, so `regions[id]` still indexes by id — which is
    // what every consumer of a `SegmentResult` assumes.
    seg: { ...seg, regions: [...seg.regions, ...composites] },
    groups,
    memberOf,
    unknown,
  };
}
