/**
 * WORLD INPUT — what the user hands Terra before it generates anything.
 *
 * A 2D world is described by up to four reference photographs, each pinned to
 * one compass face of the world (front / back / left / right) so the generator
 * knows which way each frame is looking, plus whatever the user typed.
 *
 * Slots are EXCLUSIVE: a world has exactly one Front. Assigning a face that is
 * already taken therefore swaps the two images rather than leaving a duplicate —
 * see `assignSlot`. That is why the picker offers all four faces at all times
 * instead of hiding the taken ones: swapping is the common intent.
 */

export type SlotId = "front" | "back" | "left" | "right";

/** Declaration order is also upload order — the face a new image lands on. */
export const SLOTS: { id: SlotId; label: string }[] = [
  { id: "front", label: "Front" },
  { id: "back", label: "Back" },
  { id: "left", label: "Left" },
  { id: "right", label: "Right" },
];

export const MAX_IMAGES = SLOTS.length;

/**
 * What Create costs, in credits. A flat price: the generator does the same
 * amount of work whether it was handed one photo or four.
 */
export const CREATE_COST = 129;

/** One freehand eraser pass, in the working canvas's own pixel coordinates. */
export interface Stroke {
  /** brush diameter, in canvas pixels */
  size: number;
  pts: [number, number][];
}

/** A count the user settled on for one keyword, e.g. `humans × 8`. */
export interface Label {
  word: string;
  count: number;
}

/** Everything the image studio hands back when the user saves. */
export interface ImageEdit {
  /**
   * The flattened raster with the erased areas knocked out — null when the
   * user never erased anything, in which case the original upload still stands.
   */
  url: string | null;
  /** kept so reopening the studio resumes the same erase history */
  strokes: Stroke[];
  /** keyword counts from a keyword segmentation run */
  labels: Label[];
  /** how many regions the user picked by hand, segmenting without keywords */
  picked: number;
}

export interface WorldImage {
  id: string;
  name: string;
  /** object URL of the untouched upload — edits never overwrite it */
  src: string;
  slot: SlotId;
  edit: ImageEdit | null;
}

export const slotLabel = (id: SlotId) =>
  SLOTS.find((s) => s.id === id)?.label ?? id;

/** What the card and the strip actually display: the edit if there is one. */
export const displaySrc = (image: WorldImage) => image.edit?.url ?? image.src;

/** The first compass face nobody has claimed, or null when all four are. */
export function freeSlot(images: WorldImage[]): SlotId | null {
  const taken = new Set(images.map((i) => i.slot));
  return SLOTS.find((s) => !taken.has(s.id))?.id ?? null;
}

/** Move `id` onto `slot`, handing its old face to whoever held the new one. */
export function assignSlot(
  images: WorldImage[],
  id: string,
  slot: SlotId
): WorldImage[] {
  const moving = images.find((i) => i.id === id);
  if (!moving || moving.slot === slot) return images;
  const from = moving.slot;
  return images.map((i) => {
    if (i.id === id) return { ...i, slot };
    if (i.slot === slot) return { ...i, slot: from };
    return i;
  });
}

/** Images in compass order, so the strip never reshuffles as slots change. */
export const inSlotOrder = (images: WorldImage[]) =>
  SLOTS.map((s) => images.find((i) => i.slot === s.id)).filter(
    (i): i is WorldImage => Boolean(i)
  );

/** How many objects an image carries labels for — the badge on its card. */
export function labelTotal(edit: ImageEdit | null): number {
  if (!edit) return 0;
  return edit.labels.reduce((n, l) => n + l.count, 0) + edit.picked;
}

/**
 * Keywords, comma-separated, de-duped, blanks dropped.
 *
 * NO CEILING. It was four, borrowed from `MAX_IMAGES` for no better reason than
 * that four was already a number in this file — but the two count different
 * things. Four is how many faces a world has; a photo of a street has humans,
 * cars, signs, trees, bollards and bins in it, and a label set that stops at
 * the fourth thing is a dataset with the rest of the street unlabelled. What
 * the segmentation can actually point at is the real limit, and the segmented
 * list states that honestly by showing the count each keyword found.
 */
export function parseKeywords(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of text.split(",")) {
    const word = raw.trim().replace(/\s+/g, " ");
    const key = word.toLowerCase();
    if (!word || seen.has(key)) continue;
    seen.add(key);
    out.push(word);
  }
  return out;
}
