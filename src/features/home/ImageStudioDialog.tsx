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
  assignSubjects,
  regionAt,
  seedCounts,
  segmentImage,
  type SegmentResult,
} from "./segmentation";

/**
 * IMAGE STUDIO — the pass over one reference photo before it goes into a world.
 *
 * Two jobs, in one room because they feed each other:
 *
 *   ERASE   a brush that wipes pixels out of the photo, for the bystander or the
 *           timestamp you don't want the generator to learn from. Destination-out
 *           on a canvas, so what it removes is really gone rather than covered.
 *
 *   SEGMENT split the photo into things. Type keywords ("humans") and each gets
 *           a labelled count you can correct; type nothing and you get every
 *           region, then click the ones that matter. Either way Save records
 *           what was labelled, and Create is what consumes it.
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

type Tool = "erase" | "pick";

/** One point on the undo stack: the erase passes, plus what is hand-picked. */
interface Snapshot {
  strokes: Stroke[];
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

  const [tool, setTool] = useState<Tool>("erase");
  const [brush, setBrush] = useState(BRUSH.initial);
  const [text, setText] = useState("");

  const [history, setHistory] = useState<Snapshot[]>([EMPTY]);
  const [at, setAt] = useState(0);
  const snap = history[at] ?? EMPTY;

  const [seg, setSeg] = useState<SegmentResult | null>(null);
  const [labels, setLabels] = useState<Label[]>([]);
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
  const [strokeTick, setStrokeTick] = useState(0);
  const [cursor, setCursor] = useState<{ x: number; y: number; r: number } | null>(
    null
  );
  const [hover, setHover] = useState<number | null>(null);

  /* Decode the upload once, at a size the brush can keep up with. */
  useEffect(() => {
    setSource(null);
    if (!image) return;
    let live = true;
    const el = new Image();
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
    el.src = image.src;
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
    setLabels(edit?.labels ?? []);
    setText((edit?.labels ?? []).map((l) => l.word).join(", "));
    setSeg(null);
    setSegStrokes(null);
    setTouched(false);
    setConfirmClose(false);
    draftRef.current = null;
    setTool("erase");
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
  const keywordMode = labels.length > 0;
  const assigned = useMemo(
    () => (seg && keywordMode ? assignSubjects(seg, labels.map((l) => l.count)) : []),
    [seg, keywordMode, labels]
  );
  const highlighted = useMemo(() => {
    const set = new Set<number>();
    for (const a of assigned) set.add(a.region.id);
    for (const id of snap.picked) set.add(id);
    return set;
  }, [assigned, snap.picked]);

  // Whatever was segmented described the pixels that were there a moment ago.
  const stale = Boolean(seg) && snap.strokes !== segStrokes;
  const labelled = assigned.length + snap.picked.length;
  const room = seg ? seg.subjects.length - assigned.length : 0;

  /* --------------------------------------------------------------- actions --- */

  function runSegment() {
    const canvas = canvasRef.current;
    if (!canvas || !source) return;
    const result = segmentImage(canvas);
    setSeg(result);
    setSegStrokes(snap.strokes);
    setLabels(
      words.length
        ? words.map((word, i) => ({
            word,
            count: seedCounts(result, words.length)[i],
          }))
        : []
    );
    // Region ids are only meaningful within one pass, so a new pass drops the
    // hand-picked set rather than carrying stale ids forward.
    commit({ picked: [] });
  }

  function step(index: number, by: number) {
    setLabels((ls) =>
      ls.map((l, i) =>
        i === index ? { ...l, count: Math.max(0, l.count + by) } : l
      )
    );
    setTouched(true);
  }

  function stageAt(e: React.PointerEvent<HTMLDivElement>) {
    const box = e.currentTarget.getBoundingClientRect();
    return {
      u: (e.clientX - box.left) / box.width,
      v: (e.clientY - box.top) / box.height,
      box,
    };
  }

  function onDown(e: React.PointerEvent<HTMLDivElement>) {
    if (!source) return;
    const { u, v } = stageAt(e);
    if (tool === "pick") {
      const region = seg ? regionAt(seg, u, v) : null;
      if (!region) return;
      const picked = snap.picked.includes(region.id)
        ? snap.picked.filter((id) => id !== region.id)
        : [...snap.picked, region.id];
      commit({ picked });
      return;
    }
    e.currentTarget.setPointerCapture(e.pointerId);
    draftRef.current = {
      size: brushPx,
      pts: [[u * source.width, v * source.height]],
    };
    setStrokeTick((t) => t + 1);
  }

  function onMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!source) return;
    const { u, v, box } = stageAt(e);
    setCursor(
      tool === "erase"
        ? {
            x: e.clientX - box.left,
            y: e.clientY - box.top,
            r: (brushPx / 2) * (box.width / source.width),
          }
        : null
    );
    setHover(tool === "pick" && seg ? (regionAt(seg, u, v)?.id ?? null) : null);
    const draft = draftRef.current;
    if (!draft) return;
    draft.pts.push([u * source.width, v * source.height]);
    setStrokeTick((t) => t + 1);
  }

  function onUp() {
    const draft = draftRef.current;
    if (!draft) return;
    draftRef.current = null;
    commit({ strokes: [...snap.strokes, draft] });
  }

  const dirty = touched || at > 0;

  function save() {
    const canvas = canvasRef.current;
    onSave({
      url: snap.strokes.length && canvas ? canvas.toDataURL("image/png") : null,
      strokes: snap.strokes,
      labels: labels.filter((l) => l.count > 0),
      picked: snap.picked.length,
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
      return "Erase what shouldn't be in the world, or segmentize to label what is.";
    }
    if (keywordMode) {
      if (!seg.subjects.length) {
        return "Nothing in this photo reads as a subject — segmentize with no keywords and pick the regions by hand instead.";
      }
      return `${labelled} labelled across ${labels.length} keyword${
        labels.length === 1 ? "" : "s"
      } · adjust a count with + and −`;
    }
    return `${seg.regions.length} regions found · switch to pick and click the ones that matter${
      snap.picked.length ? ` · ${snap.picked.length} picked` : ""
    }`;
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

        {/* Keywords — the ask, and then what came back for it. A group on the
            glass (frost + hairline) holding a recessed field, which is how the
            editor's panels are built. */}
        <div className="rounded-xl border border-glass/10 bg-glass/5 p-2.5">
          <form
            className="field-well flex items-center gap-2 rounded-lg border px-1.5 py-1"
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
            <span className="type-caption hidden shrink-0 text-content-subtle sm:block">
              {words.length}/4 · comma-separated
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

          {labels.length > 0 && (
            <ul className="mt-2.5 space-y-1.5 border-t border-glass/10 pt-2.5">
              {labels.map((label, i) => (
                <li
                  key={label.word}
                  className="flex items-center gap-2 rounded-lg border border-glass/10 bg-glass/10 px-3 py-1.5"
                >
                  <span className="type-body-lg flex-1 truncate capitalize text-content">
                    {label.word}
                  </span>
                  <Stepper
                    icon="step-up"
                    label={`One more ${label.word}`}
                    disabled={room <= 0}
                    onClick={() => step(i, 1)}
                  />
                  <span className="type-numeric field-well grid h-7 min-w-[2.5rem] place-items-center rounded-md border text-md text-content">
                    {label.count}
                  </span>
                  <Stepper
                    icon="step-down"
                    label={`One fewer ${label.word}`}
                    disabled={label.count === 0}
                    onClick={() => step(i, -1)}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Stage */}
        <div className="field-well mt-3 grid place-items-center rounded-xl border p-2">
          {source ? (
            <div
              className={cn(
                "relative max-h-[54vh] max-w-full overflow-hidden rounded-lg",
                tool === "erase" ? "cursor-none" : "cursor-crosshair"
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

              {seg && (
                <svg
                  viewBox={`0 0 ${seg.width} ${seg.height}`}
                  preserveAspectRatio="none"
                  className="pointer-events-none absolute inset-0 h-full w-full"
                  aria-hidden
                >
                  {seg.regions.map((region) => {
                    const on = highlighted.has(region.id);
                    // With keywords the answer IS the selection — showing every
                    // other region alongside it just buries it.
                    if (keywordMode && !on) return null;
                    const near = hover === region.id;
                    return (
                      <path
                        key={region.id}
                        d={region.outline}
                        vectorEffect="non-scaling-stroke"
                        strokeLinejoin="round"
                        fill={
                          on
                            ? "hsl(var(--brand) / 0.24)"
                            : near
                              ? "hsl(var(--brand) / 0.12)"
                              : "transparent"
                        }
                        stroke={
                          on || near
                            ? "hsl(var(--brand))"
                            : "hsl(var(--line) / 0.4)"
                        }
                        strokeWidth={on ? 2.25 : near ? 1.75 : 0.75}
                      />
                    );
                  })}
                </svg>
              )}

              {/* The brush, as a ring — a cursor can't show its own diameter. */}
              {tool === "erase" && cursor && (
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
          <ToolButton
            icon="magic-eraser"
            label="Magic eraser — drag to wipe"
            active={tool === "erase"}
            onClick={() => setTool("erase")}
          />
          <ToolButton
            icon="pick-region"
            label={seg ? "Pick regions" : "Segmentize first, then pick regions"}
            active={tool === "pick"}
            disabled={!seg}
            onClick={() => setTool("pick")}
          />

          {tool === "erase" && (
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
          )}

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

function Stepper({
  icon,
  label,
  disabled,
  onClick,
}: {
  icon: IconName;
  label: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="grid h-7 w-7 place-items-center rounded-md border border-glass/15 text-content-muted transition-colors hover:bg-glass/15 hover:text-content disabled:pointer-events-none disabled:opacity-35"
    >
      <Icon name={icon} size={15} />
    </button>
  );
}
