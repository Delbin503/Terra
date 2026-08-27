import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { Icon, type IconName } from "@/components/icons";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  Tooltip,
} from "@/components/ui";
import {
  parseKeywords,
  type ImageEdit,
  type Label,
  type Stroke,
  type WorldImage,
} from "./world-input";
import {
  regionAt,
  segmentImage,
  type Region,
  type SegmentResult,
} from "./segmentation";
import { SAMPLE_IMAGE, samplePass } from "./sample-world";

/**
 * IMAGE STUDIO — the pass over one reference photo before it goes into a world.
 *
 * Two jobs, in one room because they feed each other:
 *
 *   ERASE   a brush that wipes pixels out of the photo, for the bystander or the
 *           timestamp you don't want the generator to learn from. Destination-out
 *           on a canvas, so what it removes is really gone rather than covered.
 *
 *   SEGMENT split the photo into things. Type keywords ("humans, trees") and each
 *           becomes a group in the Segmented items list with the regions it
 *           found; type nothing and every region is offered instead. Clicking a
 *           region in the photo adds it to the list or drops it out again, and
 *           the counts follow. Save records what was labelled, and Create is
 *           what consumes it.
 *
 * NO TOOL BUTTONS. There was an eraser/pick pair in the footer, and it made the
 * two jobs modal: half the time a click did nothing because the photo was in the
 * other mode, and the mode was a 36px icon two hundred pixels from the cursor.
 * The GESTURE says which one you meant instead — drag to erase, click to
 * select — which is the distinction the hand is already making.
 *
 * Both passes share one undo stack, because to the user they are one edit of one
 * photo. See segmentation.ts for what the keyword ranking can and cannot know.
 */

/** Long edge of the working raster. Beyond this, erasing costs more than it buys. */
const SOURCE_MAX = 1400;

/**
 * Brush diameter, quoted against a SOURCE_MAX-long image. A small upload is
 * rasterised smaller, so the size scales with it — otherwise the widest brush
 * covers a third of one photo and the whole of another.
 *
 * A range rather than the three presets it replaces: erasing a lamp post and
 * erasing a parked car are the same gesture at different widths, and S/M/L made
 * you pick the nearest wrong one and then repair the edge. The ring under the
 * cursor already shows the true diameter, so the slider has something to aim at.
 */
const BRUSH = { min: 12, max: 160, step: 4, initial: 64 };

/**
 * How far the pointer must travel before a press counts as an erase.
 *
 * This is the whole modeless story: under the threshold you selected a region,
 * over it you painted. In stage pixels, and deliberately small — a deliberate
 * drag clears it within a few pixels, while the wobble of a click on a trackpad
 * does not.
 */
const DRAG_SLOP = 4;

/** What a keyword found, or — with no keywords — everything the pass saw. */
interface Group {
  word: string;
  /** region ids belonging to this group, in the order they were assigned */
  ids: number[];
}

/**
 * A hue per group.
 *
 * ONE COLOUR FOR EVERYTHING WAS THE BUG. Every outline, fill and badge was the
 * brand orange, so a photo with six keywords on it was six identical-looking
 * selections and the only way to tell which region belonged to which word was
 * to click a row and watch the others fade. Colour is what a legend is FOR:
 * "Humans" and the three outlines that are humans should be the same colour,
 * and reading the photo should not require operating it.
 *
 * Fixed hues rather than theme tokens, because these are data colours — they
 * have to stay distinct from each other and hold up over an arbitrary
 * photograph, which a palette built for UI surfaces does not promise. Kept at
 * high saturation and mid lightness so they read over both a sunlit path and a
 * shadow, and ordered so that neighbours in the list are far apart on the wheel.
 */
const GROUP_HUES = [96, 200, 32, 320, 260, 170, 8, 52, 224, 140];

const groupHue = (i: number) => GROUP_HUES[i % GROUP_HUES.length];
/** the group's line colour */
const groupInk = (i: number) => `hsl(${groupHue(i)} 85% 55%)`;
/** the same colour as a wash, for the region fill and the list row's bar */
const groupWash = (i: number, alpha: number) => `hsl(${groupHue(i)} 85% 55% / ${alpha})`;

/** One point on the undo stack: the erase passes, plus what is in the list. */
interface Snapshot {
  strokes: Stroke[];
  /** region ids currently counted — clicking a region adds or drops it here */
  picked: number[];
}

const EMPTY: Snapshot = { strokes: [], picked: [] };

function drawStroke(ctx: CanvasRenderingContext2D, stroke: Stroke) {
  if (!stroke.pts.length) return;
  ctx.lineWidth = stroke.size;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = "#000";
  ctx.fillStyle = "#000";
  if (stroke.pts.length < 2) {
    const [x, y] = stroke.pts[0];
    ctx.beginPath();
    ctx.arc(x, y, stroke.size / 2, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  ctx.beginPath();
  ctx.moveTo(stroke.pts[0][0], stroke.pts[0][1]);
  for (let i = 1; i < stroke.pts.length; i += 1) {
    ctx.lineTo(stroke.pts[i][0], stroke.pts[i][1]);
  }
  ctx.stroke();
}

export function ImageStudioDialog({
  image,
  onClose,
  onSave,
}: {
  /** the photo being worked on — null closes the studio */
  image: WorldImage | null;
  onClose: () => void;
  onSave: (edit: ImageEdit) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [source, setSource] = useState<HTMLCanvasElement | null>(null);

  const [brush, setBrush] = useState(BRUSH.initial);
  const [text, setText] = useState("");

  const [history, setHistory] = useState<Snapshot[]>([EMPTY]);
  const [at, setAt] = useState(0);
  const snap = history[at] ?? EMPTY;

  const [seg, setSeg] = useState<SegmentResult | null>(null);
  /**
   * Real region id → the composite it belongs to.
   *
   * A person is several regions (a shirt, a pair of legs, a face) welded into
   * one highlight, so a click lands on a member and has to be answered by the
   * whole figure. Without this, clicking the walker in yellow would drop her
   * leggings out of the count and leave the rest of her lit.
   */
  const [memberOf, setMemberOf] = useState<Map<number, number>>(new Map());
  /** keywords the picture has nothing for — see the notice under the row */
  const [unknown, setUnknown] = useState<string[]>([]);
  /** the bundled sample failed to load and this is somebody's own upload */
  const [sampleMissing, setSampleMissing] = useState(false);
  /** what the last pass produced, as the list shows it */
  const [groups, setGroups] = useState<Group[]>([]);
  /** whether that pass was run against typed keywords */
  const [keyworded, setKeyworded] = useState(false);
  /** the group being worked on — its regions are lit, the rest recede */
  const [activeGroup, setActiveGroup] = useState<number | null>(null);
  const [listOpen, setListOpen] = useState(true);
  /**
   * The strokes as they stood when the last pass ran. Snapshots share the same
   * strokes array until an erase actually changes it, so comparing by identity
   * is what tells us the outlines still describe these pixels — and it gets
   * undo right, where a step count wouldn't.
   */
  const [segStrokes, setSegStrokes] = useState<Stroke[] | null>(null);
  const [touched, setTouched] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);

  /**
   * The stroke being dragged right now — painted, but not yet on the undo stack.
   *
   * It lives in a ref, not in state: a fast drag delivers several pointermove
   * events inside one task, and every handler in that task would read the same
   * pre-render state value. Holding it in state dropped those points, and a
   * flick quick enough to put pointerdown and pointerup in one task lost the
   * whole stroke. `strokeTick` exists only to schedule the repaint.
   */
  const draftRef = useRef<Stroke | null>(null);
  /** where the press started, and whether it has become a drag yet */
  const pressRef = useRef<{ u: number; v: number; x: number; y: number } | null>(null);
  const [strokeTick, setStrokeTick] = useState(0);
  const [cursor, setCursor] = useState<{ x: number; y: number; r: number } | null>(
    null
  );
  const [hover, setHover] = useState<number | null>(null);

  /**
   * Decode the picture once, at a size the brush can keep up with.
   *
   * ALWAYS THE SAMPLE, never the upload. Segmentation answers keywords from a
   * written-down map of what is in one known photograph (`sample-world.ts`), so
   * pointing the studio at somebody's own file would answer "humans" with
   * whatever regions happened to sit where the walkers are in the sample —
   * confident, precise, and about the wrong picture. Until there is a model
   * behind this, the honest demo is the one picture the map describes.
   */
  useEffect(() => {
    setSource(null);
    setSampleMissing(false);
    if (!image) return;
    let live = true;
    const el = new Image();
    /**
     * If the bundled sample is missing, fall back to the upload.
     *
     * A studio stuck on a spinner is a studio nobody can tell is broken. The
     * keyword map will be wrong about a photo it has never seen — that is what
     * `sampleMissing` says out loud under the stage — but erasing still works
     * and the dialog still opens, which is the difference between a degraded
     * feature and a hung one.
     */
    el.onerror = () => {
      if (!live || el.src === image.src) return;
      setSampleMissing(true);
      el.src = image.src;
    };
    el.onload = () => {
      if (!live) return;
      const scale = Math.min(
        1,
        SOURCE_MAX / Math.max(el.naturalWidth, el.naturalHeight)
      );
      const c = document.createElement("canvas");
      c.width = Math.max(1, Math.round(el.naturalWidth * scale));
      c.height = Math.max(1, Math.round(el.naturalHeight * scale));
      c.getContext("2d")?.drawImage(el, 0, 0, c.width, c.height);
      setSource(c);
    };
    el.src = SAMPLE_IMAGE.src;
    return () => {
      live = false;
    };
  }, [image]);

  /* A different photo is a different session — reopen where its last save left off. */
  const imageId = image?.id ?? null;
  useEffect(() => {
    const edit = image?.edit ?? null;
    setHistory([{ strokes: edit?.strokes ?? [], picked: [] }]);
    setAt(0);
    setText((edit?.labels ?? []).map((l) => l.word).join(", "));
    setSeg(null);
    setMemberOf(new Map());
    setUnknown([]);
    setGroups([]);
    setKeyworded(false);
    setActiveGroup(null);
    setListOpen(true);
    setSegStrokes(null);
    setTouched(false);
    setConfirmClose(false);
    draftRef.current = null;
    pressRef.current = null;
    // Restoring one image's session must not depend on the object identity of
    // the whole list, only on which photo this is.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imageId]);

  /** the chosen brush in this raster's own pixels */
  const brushPx = source
    ? brush * (Math.max(source.width, source.height) / SOURCE_MAX)
    : brush;

  /* Repaint = original + every erase pass, knocked out of the alpha channel. */
  const paint = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !source) return;
    if (canvas.width !== source.width || canvas.height !== source.height) {
      canvas.width = source.width;
      canvas.height = source.height;
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.globalCompositeOperation = "source-over";
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(source, 0, 0);
    ctx.globalCompositeOperation = "destination-out";
    for (const stroke of snap.strokes) drawStroke(ctx, stroke);
    if (draftRef.current) drawStroke(ctx, draftRef.current);
    ctx.globalCompositeOperation = "source-over";
    // Read so the tick counts as a dependency: it is how a mid-drag stroke
    // asks for a repaint without being state itself.
    void strokeTick;
  }, [source, snap.strokes, strokeTick]);

  useEffect(paint, [paint]);

  function commit(patch: Partial<Snapshot>) {
    const next = { ...snap, ...patch };
    setHistory((h) => [...h.slice(0, at + 1), next]);
    setAt(at + 1);
    setTouched(true);
  }

  const words = parseKeywords(text);

  // Whatever was segmented described the pixels that were there a moment ago.
  const stale = Boolean(seg) && snap.strokes !== segStrokes;
  const selectable = Boolean(seg) && !stale;

  /** id → the group holding it, and its position within that group. */
  const placement = useMemo(() => {
    const map = new Map<number, { group: number; index: number }>();
    groups.forEach((g, group) =>
      g.ids.forEach((id, index) => map.set(id, { group, index }))
    );
    return map;
  }, [groups]);

  const pickedSet = useMemo(() => new Set(snap.picked), [snap.picked]);
  /** how many of each group's regions are counted right now */
  const counts = useMemo(
    () => groups.map((g) => g.ids.filter((id) => pickedSet.has(id)).length),
    [groups, pickedSet]
  );
  const total = counts.reduce((n, c) => n + c, 0);

  /* --------------------------------------------------------------- actions --- */

  /**
   * SEGMENT THE PICTURE.
   *
   * The regions and their outlines come from the real pixels, as they always
   * did. What is new is that the answer to a WORD comes from the map of the
   * sample photograph (`sample-world.ts`) rather than from a subject ranking:
   * "humans" is the eleven walkers because somebody wrote down where the eleven
   * walkers are, and "elephant" is an error rather than a confident highlight
   * over the nearest bush.
   *
   * With nothing typed it answers with what the picture is made of — the people,
   * the planting and the path — instead of dumping every region it found. A
   * hundred dashed outlines is not a description of anything.
   */
  function runSegment() {
    const canvas = canvasRef.current;
    if (!canvas || !source) return;
    const pass = samplePass(segmentImage(canvas), words);

    setUnknown(pass.unknown);
    // Every word missed: nothing is segmented, because there is nothing to show
    // and replacing the previous answer with an empty one would read as the
    // photo having lost its regions rather than the word having failed.
    if (words.length > 0 && pass.groups.every((g) => g.ids.length === 0)) return;

    setSeg(pass.seg);
    setMemberOf(pass.memberOf);
    setSegStrokes(snap.strokes);
    setListOpen(true);
    setActiveGroup(null);
    setGroups(pass.groups);
    setKeyworded(words.length > 0);
    // Everything found starts counted: dropping the one it got wrong is a
    // click, where hunting for the ten it got right is a search.
    commit({ picked: pass.groups.flatMap((g) => g.ids) });
  }

  /**
   * Add a region to the list, or drop it out.
   *
   * A region nobody assigned joins the ACTIVE group, which is what makes the
   * list additive rather than a fixed answer: the ranking missed the fourth
   * runner, you click them, and Humans reads 4. With no group selected there is
   * nothing to add it to, so the click is ignored rather than guessing.
   */
  /**
   * A click lands on a real region; the thing it belongs to is what answers.
   *
   * Composites are appended after the real regions, so an id that is already a
   * composite resolves to itself and a member resolves upward.
   */
  function resolve(id: number | null): number | null {
    if (id == null) return null;
    return memberOf.get(id) ?? id;
  }

  function toggleRegion(rawId: number) {
    const id = resolve(rawId);
    if (id == null) return;
    const place = placement.get(id);
    if (!place) {
      if (activeGroup == null) return;
      setGroups((gs) =>
        gs.map((g, i) => (i === activeGroup ? { ...g, ids: [...g.ids, id] } : g))
      );
      commit({ picked: [...snap.picked, id] });
      return;
    }
    setActiveGroup(place.group);
    commit({
      picked: pickedSet.has(id)
        ? snap.picked.filter((x) => x !== id)
        : [...snap.picked, id],
    });
  }

  function stageAt(e: React.PointerEvent<HTMLDivElement>) {
    const box = e.currentTarget.getBoundingClientRect();
    return {
      u: (e.clientX - box.left) / box.width,
      v: (e.clientY - box.top) / box.height,
      x: e.clientX - box.left,
      y: e.clientY - box.top,
      box,
    };
  }

  /**
   * Press down. With nothing segmented the brush starts immediately — there is
   * no other thing a press could mean. Once regions exist the stroke waits for
   * `DRAG_SLOP`, so a click can still turn out to have been a selection and no
   * erase dot flashes under the cursor on the way.
   */
  function onDown(e: React.PointerEvent<HTMLDivElement>) {
    if (!source) return;
    const { u, v, x, y } = stageAt(e);
    e.currentTarget.setPointerCapture(e.pointerId);
    pressRef.current = { u, v, x, y };
    if (!selectable) {
      draftRef.current = {
        size: brushPx,
        pts: [[u * source.width, v * source.height]],
      };
      setStrokeTick((t) => t + 1);
    }
  }

  function onMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!source) return;
    const { u, v, x, y, box } = stageAt(e);
    setCursor({
      x,
      y,
      r: (brushPx / 2) * (box.width / source.width),
    });
    setHover(selectable && seg ? resolve(regionAt(seg, u, v)?.id ?? null) : null);

    const press = pressRef.current;
    if (!press) return;

    // The press has become a drag — start the stroke from where it began, so
    // the first few pixels aren't lost to the threshold.
    if (!draftRef.current) {
      if (Math.hypot(x - press.x, y - press.y) < DRAG_SLOP) return;
      draftRef.current = {
        size: brushPx,
        pts: [[press.u * source.width, press.v * source.height]],
      };
    }
    draftRef.current.pts.push([u * source.width, v * source.height]);
    setStrokeTick((t) => t + 1);
  }

  function onUp() {
    const press = pressRef.current;
    const draft = draftRef.current;
    pressRef.current = null;
    draftRef.current = null;

    if (draft) {
      commit({ strokes: [...snap.strokes, draft] });
      return;
    }
    // Never moved: it was a click on the photo, which is how regions are
    // added to and dropped from the list.
    if (press && selectable && seg) {
      const region = regionAt(seg, press.u, press.v);
      if (region) toggleRegion(region.id);
    }
    setStrokeTick((t) => t + 1);
  }

  const dirty = touched || at > 0;

  function save() {
    const canvas = canvasRef.current;
    const labels: Label[] = keyworded
      ? groups
          .map((g, i) => ({ word: g.word, count: counts[i] }))
          .filter((l) => l.count > 0)
      : [];
    onSave({
      url: snap.strokes.length && canvas ? canvas.toDataURL("image/png") : null,
      strokes: snap.strokes,
      labels,
      // Without keywords there is no word to file them under, so they count as
      // hand-picked regions — which is exactly what they are.
      picked: keyworded ? 0 : total,
    });
  }

  function requestClose() {
    if (dirty) setConfirmClose(true);
    else onClose();
  }

  /** One line saying what the last pass found — and whether it still holds. */
  function status() {
    if (stale) {
      return "The photo changed — segmentize again to refresh the outlines.";
    }
    if (!seg) {
      return "Drag to erase what shouldn't be in the world, or segmentize to label what is.";
    }
    if (keyworded && total === 0 && groups.every((g) => g.ids.length === 0)) {
      return "Nothing in this photo reads as a subject — segmentize with no keywords and click the regions by hand instead.";
    }
    return `${total} labelled · click a region to add or drop it${
      activeGroup != null ? ` from ${groups[activeGroup].word}` : ""
    } · drag to erase`;
  }

  /* ----------------------------------------------------------------- view --- */

  return (
    <Dialog
      open={Boolean(image)}
      onOpenChange={(next) => {
        if (!next) requestClose();
      }}
    >
      <DialogContent
        hideClose
        surface="glass"
        data-ui="glass-image-studio"
        className="max-w-[min(94vw,62rem)] p-4"
        onPointerDownOutside={(e) => e.preventDefault()}
      >
        <DialogTitle className="sr-only">
          Edit and segment {image?.name ?? "image"}
        </DialogTitle>
        <DialogDescription className="sr-only">
          Erase parts of the photo, then name what is in it so Terra can label
          the world it generates.
        </DialogDescription>

        {/* Keywords — the ask, and the answer beside it.
            THE LIST BELONGS UP HERE, NOT OVER THE PHOTO. It floated top-right
            of the stage for a while, which put it on top of whatever the
            photographer had framed top-right — in a landscape shot that is
            usually sky, but in a street shot it was sitting on two of the
            regions it was counting. The ask and what came back for it are one
            statement, so they share one bar, and the photo underneath is left
            whole. */}
        <div className="flex items-stretch gap-2 rounded-xl border border-glass/10 bg-glass/5 p-2.5">
          <form
            className="field-well flex min-w-0 flex-1 items-center gap-2 rounded-lg border px-1.5 py-1"
            onSubmit={(e) => {
              e.preventDefault();
              runSegment();
            }}
          >
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Type keywords…"
              aria-label="Keywords to segment by"
              className="type-body-lg min-w-0 flex-1 bg-transparent px-1.5 py-1 text-content outline-none placeholder:text-content-subtle"
            />
            {/* A COUNT, NOT A QUOTA. It used to read "0/4", which is a cap
                stated as a scoreboard — and there is no reason a street photo
                should be describable in four words. */}
            <span className="type-caption hidden shrink-0 text-content-subtle sm:block">
              {words.length === 0
                ? "comma-separated"
                : `${words.length} keyword${words.length === 1 ? "" : "s"} · comma-separated`}
            </span>
            <button
              type="submit"
              aria-label="Find these in the image"
              className={cn(
                "grid h-9 w-9 shrink-0 place-items-center rounded-lg border transition-colors",
                words.length
                  ? "border-brand/60 bg-brand/15 text-brand hover:bg-brand/25"
                  : "border-transparent text-content-muted hover:bg-glass/15 hover:text-content"
              )}
            >
              <Icon name="chevron-right" size={18} />
            </button>
          </form>

          {/* Only after a pass, and only while it still describes these pixels:
              a segmented list beside a photo that has been erased since is a
              count of something that is no longer there. */}
          {seg && !stale && groups.length > 0 && (
            <SegmentedList
              groups={groups}
              counts={counts}
              open={listOpen}
              active={activeGroup}
              onToggleOpen={() => setListOpen((o) => !o)}
              onClose={() => setListOpen(false)}
              onPick={(i) => setActiveGroup((cur) => (cur === i ? null : i))}
            />
          )}
        </div>

        {/* A WORD THE PICTURE HAS NOTHING FOR.
            Inline and persistent rather than a toast: it names the words that
            failed and stays there while they are corrected, which is the moment
            it is useful. The words that DID match are segmented anyway — one
            typo should not throw away the four that were right. */}
        {sampleMissing && (
          <p
            data-ui="segment-sample-missing"
            role="alert"
            className="type-caption mt-2 flex items-start gap-1.5 rounded-lg border border-warning/40 bg-warning-soft/40 px-2.5 py-2 text-warning"
          >
            <Icon name="warning" size={13} className="mt-px shrink-0" />
            <span>
              The sample scene is missing from <code>public/samples/</code>, so this is your own
              upload — erasing works, but keywords will name the wrong things.
            </span>
          </p>
        )}

        {unknown.length > 0 && (
          <p
            data-ui="segment-unknown"
            role="alert"
            className="type-caption mt-2 flex items-start gap-1.5 rounded-lg border border-danger/40 bg-danger/10 px-2.5 py-2 text-danger"
          >
            <Icon name="warning" size={13} className="mt-px shrink-0" />
            <span>
              {unknown.map((w) => `“${w}”`).join(", ")}{" "}
              {unknown.length === 1 ? "isn’t" : "aren’t"} in this image. Try humans, hair,
              plants or pavement.
            </span>
          </p>
        )}

        {/* Stage */}
        <div className="field-well mt-3 grid place-items-center rounded-xl border p-2">
          {source ? (
            <div
              className={cn(
                "relative max-h-[54vh] max-w-full overflow-hidden rounded-lg",
                "cursor-none"
              )}
              style={{ aspectRatio: `${source.width} / ${source.height}` }}
              onPointerDown={onDown}
              onPointerMove={onMove}
              onPointerUp={onUp}
              onPointerLeave={() => {
                setCursor(null);
                setHover(null);
                onUp();
              }}
            >
              <canvas ref={canvasRef} className="h-full w-full select-none" />

              {seg && !stale && (
                <RegionOverlay
                  seg={seg}
                  groups={groups}
                  placement={placement}
                  picked={pickedSet}
                  activeGroup={activeGroup}
                  hover={hover}
                  onToggle={toggleRegion}
                />
              )}

              {/* The brush, as a ring — a cursor can't show its own diameter. */}
              {cursor && (
                <span
                  aria-hidden
                  className="pointer-events-none absolute rounded-full border border-white/80 bg-white/10 shadow-sm"
                  style={{
                    left: cursor.x - cursor.r,
                    top: cursor.y - cursor.r,
                    width: cursor.r * 2,
                    height: cursor.r * 2,
                  }}
                />
              )}
            </div>
          ) : (
            <div className="grid h-[36vh] w-full place-items-center text-content-subtle">
              <Icon name="spinner" size={22} className="animate-spin" />
            </div>
          )}
        </div>

        {/* Status — what the last pass found, and whether it still holds. */}
        <p className="type-body mt-2.5 min-h-[1.25rem] text-content-muted">
          {status()}
        </p>

        {/* Footer */}
        <div className="mt-2.5 flex flex-wrap items-center gap-2">
          {/* The brush size is always here now, because the brush is always
              available — there is no mode for it to belong to. */}
          <label className="flex h-9 items-center gap-2.5 rounded-lg border border-glass/10 bg-glass/5 px-3">
            <span className="type-label shrink-0 text-content-muted">Size</span>
            <input
              type="range"
              aria-label="Brush size"
              min={BRUSH.min}
              max={BRUSH.max}
              step={BRUSH.step}
              value={brush}
              onChange={(e) => setBrush(Number(e.target.value))}
              className="h-1 w-24 cursor-pointer accent-brand"
            />
            <span className="type-numeric w-6 shrink-0 text-right text-content">
              {brush}
            </span>
          </label>

          <span className="mx-0.5 h-6 w-px bg-glass/15" />
          <ToolButton
            icon="undo"
            label="Undo"
            disabled={at === 0}
            onClick={() => setAt(at - 1)}
          />
          <ToolButton
            icon="redo"
            label="Redo"
            disabled={at >= history.length - 1}
            onClick={() => setAt(at + 1)}
          />

          <div className="flex-1" />

          {confirmClose ? (
            <>
              <span className="type-body text-content-muted">
                Discard the changes to this photo?
              </span>
              <Button variant="ghost" onClick={() => setConfirmClose(false)}>
                Keep editing
              </Button>
              <Button variant="danger" onClick={onClose}>
                Discard
              </Button>
            </>
          ) : (
            <>
              <Button variant="ghost" onClick={requestClose}>
                Close
              </Button>
              <Button
                variant="secondary"
                className="border-brand text-brand hover:border-brand-hover hover:text-brand-hover"
                onClick={runSegment}
                disabled={!source}
              >
                {seg && !stale ? "Segmentize again" : "Segmentize Image"}
              </Button>
              <Button variant="brand" onClick={save} disabled={!dirty}>
                <Icon name="save" size={16} />
                Save
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ parts -- */

/**
 * The outlines, and a numbered badge on every region the list knows about.
 *
 * COUNTED AND UNCOUNTED BOTH SHOW. A dropped region keeps its outline, dashed
 * and grey, with a grey number — because "this one is not in the count" is a
 * state you need to be able to see and click back on. Hiding it would make the
 * drop indistinguishable from the pass never having found it.
 *
 * The badge is a real button: it is the keyboard's way to the same toggle, and
 * on a crowded photo it is a bigger target than the region itself.
 */
function RegionOverlay({
  seg,
  groups,
  placement,
  picked,
  activeGroup,
  hover,
  onToggle,
}: {
  seg: SegmentResult;
  groups: Group[];
  placement: Map<number, { group: number; index: number }>;
  picked: Set<number>;
  activeGroup: number | null;
  hover: number | null;
  onToggle: (id: number) => void;
}) {
  const known = (r: Region) => placement.get(r.id) ?? null;
  const dimmed = (r: Region) => {
    const place = known(r);
    return activeGroup != null && (!place || place.group !== activeGroup);
  };

  return (
    <>
      <svg
        viewBox={`0 0 ${seg.width} ${seg.height}`}
        preserveAspectRatio="none"
        className="pointer-events-none absolute inset-0 h-full w-full"
        aria-hidden
      >
        {seg.regions.map((region) => {
          const place = known(region);
          const on = picked.has(region.id);
          const near = hover === region.id;
          // An unassigned region is only worth drawing while the cursor is on
          // it — otherwise the photo disappears under a mesh of outlines.
          if (!place && !near) return null;
          const faded = dimmed(region);
          // Counted: its group's colour. Dropped: grey, whatever group it is
          // in — "not in the count" has to survive being read at a glance, and
          // a dimmer version of the group colour would just look like a
          // different group.
          const ink = on && place ? groupInk(place.group) : "hsl(0 0% 78% / 0.85)";
          return (
            <path
              key={region.id}
              d={region.outline}
              vectorEffect="non-scaling-stroke"
              strokeLinejoin="round"
              strokeDasharray={on ? undefined : "4 3"}
              opacity={faded ? 0.35 : 1}
              fill={
                on && place
                  ? groupWash(place.group, 0.22)
                  : near
                    ? "hsl(0 0% 100% / 0.12)"
                    : "transparent"
              }
              stroke={ink}
              strokeWidth={on ? 2.25 : near ? 1.75 : 1.25}
            />
          );
        })}
      </svg>

      {groups.flatMap((group, gi) =>
        group.ids.map((id, index) => {
          const region = seg.regions[id];
          if (!region) return null;
          const on = picked.has(id);
          const faded = activeGroup != null && activeGroup !== gi;
          return (
            <button
              key={`${gi}-${id}`}
              type="button"
              aria-pressed={on}
              aria-label={`${group.word} ${index + 1} — ${on ? "counted, click to drop" : "dropped, click to add"}`}
              title={`${group.word} ${index + 1}`}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                onToggle(id);
              }}
              className={cn(
                "type-caption-strong absolute grid h-5 w-5 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border tabular-nums transition-opacity",
                !on && "border-glass/40 bg-canvas/85 text-content-subtle",
                faded && "opacity-40"
              )}
              style={{
                left: `${(region.cx / seg.width) * 100}%`,
                top: `${(region.cy / seg.height) * 100}%`,
                // Dark ink on a bright, saturated ground: these sit over a
                // photograph, where a white numeral on lime is unreadable.
                ...(on
                  ? {
                      background: groupInk(gi),
                      borderColor: groupInk(gi),
                      color: "hsl(220 25% 12%)",
                    }
                  : null),
              }}
            >
              {index + 1}
            </button>
          );
        })
      )}
    </>
  );
}

/**
 * SEGMENTED ITEMS — what the pass found, as a list you can work.
 *
 * Every row is a keyword and the number of regions currently counted under it,
 * and choosing one lights those regions on the photo while everything else
 * recedes. That is what makes the count checkable: a row claiming three humans
 * is one click from showing you which three, and one more from dropping the one
 * that is actually a mailbox.
 *
 * The bar behind each row is the count to scale, so the shape of the label set
 * reads before any of the numbers do.
 *
 * A DROPDOWN IN THE TOP BAR, not a panel on the photo. Sitting over the stage
 * it covered whatever was framed in that corner — including, on a street shot,
 * two of the regions it was counting — and it had to be there before there was
 * anything to list. Now it appears only once a pass has run and still holds,
 * beside the keywords that asked for it, and its closed state is one line: the
 * word, and how many things this photo is claiming.
 */
function SegmentedList({
  groups,
  counts,
  open,
  active,
  onToggleOpen,
  onClose,
  onPick,
}: {
  groups: Group[];
  counts: number[];
  open: boolean;
  active: number | null;
  onToggleOpen: () => void;
  onClose: () => void;
  onPick: (index: number) => void;
}) {
  const peak = Math.max(1, ...counts);
  const total = counts.reduce((n, c) => n + c, 0);
  const wrap = useRef<HTMLDivElement>(null);

  /* Outside pointerdown closes it — including a press on the photo, which is
     the one place people go next. Escape is Radix's (it closes the dialog). */
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!wrap.current?.contains(e.target as Node)) onClose();
    };
    window.addEventListener("pointerdown", onDown);
    return () => window.removeEventListener("pointerdown", onDown);
  });

  return (
    <div ref={wrap} data-ui="segmented-items" className="relative shrink-0">
      <button
        type="button"
        aria-expanded={open}
        onClick={onToggleOpen}
        className={cn(
          "flex h-full items-center gap-2 rounded-lg border px-3 transition-colors",
          open
            ? "border-brand/60 bg-brand/15 text-content"
            : "border-glass/15 bg-glass/8 text-content hover:bg-glass/15"
        )}
      >
        <span className="type-body-strong hidden truncate sm:block">Segmented items</span>
        <span className="type-body-strong sm:hidden">Items</span>
        {/* The count is what the label is FOR — how many things this photo is
            claiming — so it reads as a number, not as a badge on a menu. */}
        <span className="type-numeric-sm text-content-muted">{total}</span>
        <Icon
          name="chevron-down"
          size={14}
          className={cn("shrink-0 text-content-subtle transition-transform", open && "rotate-180")}
        />
      </button>

      {open && (
        <div
          /* Its own dark ground rather than glass alone: this hangs over a
             photo that can be any brightness, and a tint would lose the labels
             over a sunlit path. */
          className="absolute right-0 top-[calc(100%+6px)] z-50 w-[min(17rem,70vw)] overflow-hidden rounded-xl border border-glass/20 bg-canvas/95 shadow-lg backdrop-blur-md"
        >
          <ul className="max-h-[40vh] overflow-y-auto">
            {groups.map((group, i) => {
              const count = counts[i];
              const on = active === i;
              return (
                <li key={group.word} className="border-b border-glass/10 last:border-0">
                  <button
                    type="button"
                    aria-pressed={on}
                    onClick={() => onPick(i)}
                    className="relative flex w-full items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-glass/10"
                  >
                    {/* The bar is the row's own colour, so the list reads as the
                        legend for the outlines rather than as a table beside
                        them. Selecting deepens it instead of swapping it for a
                        brand tint, which would throw away the identity. */}
                    <span
                      aria-hidden
                      className="absolute inset-y-0 left-0 transition-[width]"
                      style={{
                        width: `${(count / peak) * 100}%`,
                        background: groupWash(i, on ? 0.42 : 0.2),
                      }}
                    />
                    <span
                      aria-hidden
                      className="relative h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ background: groupInk(i) }}
                    />
                    <span className="type-body relative grow truncate capitalize text-content">
                      {group.word}
                    </span>
                    <span className="type-numeric-sm relative text-content">{count}</span>
                  </button>
                </li>
              );
            })}
          </ul>
          <p className="type-caption border-t border-glass/12 px-3 py-2 text-content-subtle">
            Choose one to light its regions, then click the photo to add or drop.
          </p>
        </div>
      )}
    </div>
  );
}

function ToolButton({
  icon,
  label,
  active,
  disabled,
  onClick,
}: {
  icon: IconName;
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <Tooltip label={label} side="top">
      <button
        type="button"
        aria-label={label}
        aria-pressed={active}
        disabled={disabled}
        onClick={onClick}
        className={cn(
          "grid h-9 w-9 place-items-center rounded-lg border transition-colors disabled:pointer-events-none disabled:opacity-40",
          // No nested glass — this sits INSIDE glass, where stacking the
          // material on itself turns a control into a smudge. Lit state is a
          // brand tint and edge, same as the editor's viewport toolbar.
          active
            ? "border-brand/60 bg-brand/15 text-brand"
            : "border-transparent text-content-muted hover:bg-glass/15 hover:text-content"
        )}
      >
        <Icon name={icon} size={17} />
      </button>
    </Tooltip>
  );
}
