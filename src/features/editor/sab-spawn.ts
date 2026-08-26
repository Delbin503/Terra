/**
 * SAB SPAWN — turning "a door, a chair, two people and a car" into objects.
 * ------------------------------------------------------------------
 * The scene agent's one real scene edit: read a list of things out of a
 * sentence, find each one in the asset library, and hand the ids back for the
 * arrangement solver to place inside the armed space.
 *
 * WHY THE PARSING LIVES HERE. It is string work with no React and no three.js in
 * it, so it is testable on its own — and the day a real model sits behind the
 * composer, this is the shape it has to produce. `planFor` stays a script; this
 * is the part that has consequences.
 *
 * WHAT IT DELIBERATELY DOESN'T DO is guess at meaning. It reads counts and
 * nouns, matches them against names that exist, and says plainly which ones it
 * had to stand in for. A parser that silently turned "a fire escape" into a
 * fire hydrant would be worse than one that admits it has no fire escape.
 */

import type { Asset } from "./assets-data";

/** One line item: how many of what. */
export interface SpawnRequest {
  /** the words the user used, tidied — "person", "car" */
  label: string;
  count: number;
}

/** What a request resolved to. */
export interface SpawnMatch extends SpawnRequest {
  /** the library asset it will be placed from, or null for a stand-in shape */
  asset: Asset | null;
  /** the name each placed object gets */
  name: string;
}

const NUMBER_WORDS: Record<string, number> = {
  a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5,
  six: 6, seven: 7, eight: 8, nine: 9, ten: 10, a_couple: 2, couple: 2, few: 3,
};

/** Plurals the "drop the s" rule gets wrong. */
const IRREGULAR: Record<string, string> = {
  people: "person",
  children: "child",
  men: "man",
  women: "woman",
  benches: "bench",
  boxes: "box",
  bushes: "bush",
  shelves: "shelf",
};

/**
 * Words that name a thing the library calls something else.
 *
 * A SHORT, EXPLICIT LIST rather than fuzzy matching. "Car" has to find "Sedan"
 * or the feature doesn't work on its own example sentence, but a scoring
 * function loose enough to get there also matches "chair" to "Barrier" on three
 * shared letters. Named pairs are boring and they are right.
 */
const SYNONYMS: Record<string, string> = {
  car: "Sedan",
  vehicle: "Sedan",
  auto: "Sedan",
  seat: "Dining Chair",
  chair: "Dining Chair",
  stool: "Folding Chair",
  desk: "Office Chair",
  lamp: "Street Lamp",
  light: "Street Lamp",
  streetlight: "Street Lamp",
  hydrant: "Fire Hydrant",
  sign: "Sign Post",
  signpost: "Sign Post",
  fence: "Barrier",
  railing: "Barrier",
  bench: "Bus Stop",
  shelter: "Bus Stop",
  hand: "Robotic Hand",
  arm: "Robotic Hand",
};

/** Leading verbs the sentence may open with, and the trailing clause naming the
 *  space — both stripped before the list is read. */
const LEAD = /^\s*(?:please\s+)?(?:can you\s+)?(?:add(?:\s+in)?|put(?:\s+in)?|place|insert|drop|spawn|generate|create)\s+/i;
const TRAIL = /\s*(?:in(?:to)?|inside|within)\s+(?:this|the|that|my)?\s*(?:confined\s+|defined\s+|new\s+)?(?:space|room|area|volume|box)\s*\.?\s*$/i;

/** `Two People` → `person`, and the 2 that came with it. */
function readItem(fragment: string): SpawnRequest | null {
  const words = fragment.trim().toLowerCase().replace(/[.!,]+$/, "").split(/\s+/).filter(Boolean);
  if (words.length === 0) return null;

  let count = 1;
  const digit = Number.parseInt(words[0], 10);
  if (Number.isFinite(digit) && digit > 0) {
    count = digit;
    words.shift();
  } else if (words[0] in NUMBER_WORDS) {
    count = NUMBER_WORDS[words[0]];
    words.shift();
  }

  // Drop leading articles left behind by "a couple of a chairs" and friends.
  while (words[0] && (words[0] === "of" || words[0] === "a" || words[0] === "an" || words[0] === "the")) {
    words.shift();
  }
  if (words.length === 0) return null;

  const last = words[words.length - 1];
  words[words.length - 1] =
    IRREGULAR[last] ?? (last.length > 3 && /[^s]s$/.test(last) ? last.slice(0, -1) : last);

  const label = words.join(" ");
  // A count above this is a typo or a stress test, not a request; the solver
  // would spend a minute rejecting samples for a room nobody can see into.
  return label ? { label, count: Math.min(count, 24) } : null;
}

/**
 * Read a spawn list out of a sentence.
 *
 * Returns an empty array when the sentence isn't one — which is how the caller
 * tells "add a door and two chairs in this space" from ordinary conversation,
 * so this doubles as the intent test.
 */
export function parseSpawn(text: string): SpawnRequest[] {
  if (!LEAD.test(text)) return [];
  const body = text.replace(LEAD, "").replace(TRAIL, "");
  if (!body.trim()) return [];

  return body
    .split(/\s*(?:,|\band\b|\+|&)\s*/i)
    .map(readItem)
    .filter((x): x is SpawnRequest => x !== null);
}

/** Title Case, for the name a stand-in object carries in the layers tree. */
const titleCase = (s: string) =>
  s.replace(/\b[a-z]/g, (c) => c.toUpperCase());

/**
 * Point each request at something that exists.
 *
 * Order matters: an exact name wins over a synonym, and a synonym wins over a
 * substring, so "chair" finds the Dining Chair the synonym table names rather
 * than whichever of the four chairs happens to sort first.
 */
export function matchSpawn(requests: SpawnRequest[], assets: Asset[]): SpawnMatch[] {
  const meshes = assets.filter((a) => a.type === "mesh");
  const byName = (name: string) =>
    meshes.find((a) => a.name.toLowerCase() === name.toLowerCase()) ?? null;

  return requests.map((req) => {
    const label = req.label.toLowerCase();
    const key = label.replace(/\s+/g, "");

    const asset =
      byName(label) ??
      (SYNONYMS[label] ? byName(SYNONYMS[label]) : null) ??
      (SYNONYMS[key] ? byName(SYNONYMS[key]) : null) ??
      meshes.find((a) => a.name.toLowerCase().includes(label)) ??
      null;

    return { ...req, asset, name: asset?.name ?? titleCase(req.label) };
  });
}

/** The inverse of `IRREGULAR`, so reading the list back doesn't say "2 persons"
 *  at someone who typed "two people". */
const PLURAL: Record<string, string> = Object.fromEntries(
  Object.entries(IRREGULAR).map(([plural, singular]) => [singular, plural])
);

/** "a door, 2 people and a car" — the sentence the agent reads back. */
export function describeSpawn(matches: SpawnMatch[]): string {
  const parts = matches.map((m) =>
    m.count === 1 ? `a ${m.label}` : `${m.count} ${PLURAL[m.label] ?? `${m.label}s`}`
  );
  if (parts.length <= 1) return parts[0] ?? "nothing";
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}
