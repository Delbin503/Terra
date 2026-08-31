import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/icons";
import { SCENE_LABEL } from "./scene-palette";
import { ROLE_LABEL, type ObjectRole } from "./scene-types";

/* The face for this whole block is the `type-scene-*` text styles (globals.css)
   — a light, tall-condensed Inter, deliberately not the Sora display face.
   Only the box and the luminance-adaptive colour live here as inline style. */

const badgeStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: "0.35rem",
  padding: "0.2rem 0.6rem",
  borderRadius: "0.5rem",
  borderWidth: "1px",
  borderStyle: "solid",
  whiteSpace: "nowrap",
  // Legibility comes from the FILL, not from outlining the glyphs — a 0.5px black
  // text-stroke was tried first and read muddy at this size, thickening small
  // letterforms rather than separating them. Each variant supplies its OWN dark
  // tint below (a shared neutral slab read as pasted-on), kept light enough that
  // the scene still shows through; the blur is what holds legibility together.
  backdropFilter: "blur(6px)",
  WebkitBackdropFilter: "blur(6px)",
};

// Text sits a good deal lighter than the raw role colour so it stays legible
// against the dark pill (the raw tokens are tuned for light-on-dark UI chrome).
// One entry per content role; `none` gets no badge at all rather than a fourth
// colour, because "this object is nothing in particular" isn't worth a pill.
const roleBadgeStyle: Record<Exclude<ObjectRole, "none">, CSSProperties> = {
  master: {
    color: "hsl(45 100% 74%)",
    borderColor: "hsl(var(--master) / 0.6)",
    background: "hsl(45 90% 13% / 0.3)",
  },
  distractor: {
    color: "hsl(189 100% 70%)",
    borderColor: "hsl(var(--distractor) / 0.6)",
    background: "hsl(190 90% 13% / 0.3)",
  },
  background: {
    color: "hsl(280 100% 82%)",
    borderColor: "hsl(var(--backdrop) / 0.6)",
    background: "hsl(280 90% 15% / 0.3)",
  },
};

/**
 * MEMBERSHIP, NOT IDENTITY — so it is the one badge in the row that isn't tinted.
 *
 * The type badge is brand orange and the role badges carry their role's colour,
 * because both answer "what is this thing". This one answers "what is it inside
 * of", which is context: a third saturated pill beside those two would compete
 * with the two that name the object. Neutral ink on the same dark glass keeps it
 * legible over any scene while reading as secondary at a glance.
 */
const groupBadgeStyle: CSSProperties = {
  color: "hsl(0 0% 90%)",
  borderColor: "hsl(0 0% 100% / 0.34)",
  background: "hsl(0 0% 6% / 0.32)",
};

const typeBadgeStyle: CSSProperties = {
  color: "hsl(26 100% 72%)",
  borderColor: "hsl(var(--brand) / 0.6)",
  background: "hsl(26 90% 13% / 0.3)",
};

const deleteBadgeStyle: CSSProperties = {
  color: "hsl(0 90% 74%)",
  borderColor: "hsl(var(--danger) / 0.6)",
  background: "hsl(0 85% 14% / 0.3)",
};

/**
 * ObjectTitle — the focused object's name as a big title that sits in the scene
 * in 3D (CSS perspective tilt), in a tall condensed light face (not bold). Colour
 * auto-adapts to the background luminance (via `dark`), with a contrasting shadow
 * so it stays legible over any surface. Click to rename; long names wrap onto a
 * second line instead of running off-screen. A "Back" affordance sits directly
 * above it, sharing the tilted plane so it reads as one diegetic label — it's a
 * sibling of the title, so clicking it never starts a rename.
 */
export function ObjectTitle({
  name,
  dark,
  role,
  typeLabel,
  groupName,
  onSelectGroup,
  description,
  insetLeft = 0,
  onRename,
  onBack,
  onViewInfo,
  onDelete,
}: {
  name: string;
  dark: boolean;
  role: ObjectRole;
  typeLabel: string;
  /**
   * The group this object sits directly inside, if any.
   *
   * WHY THE TITLE CARRIES IT. A group draws nothing in the viewport, so once a
   * click has walked down into one (see `pick` in SceneCanvas) there is nothing
   * on screen saying which container you are inside — the chair looks exactly
   * like a chair that was never grouped, and the only way to find out was the
   * layers tree. The label already answers "what is this"; this is the same
   * question one level out.
   *
   * The IMMEDIATE parent, not the whole chain: a nest reads from the tree, and a
   * row of three ancestors would push the badge row past the label's width.
   */
  groupName?: string | null;
  /**
   * Select that group — the way back OUT of one.
   *
   * A viewport click walks DOWN the chain (see `pick` in SceneCanvas) and there
   * was no gesture for the other direction: once you were on the chair, getting
   * back to the room meant Back-then-reselect, or finding the row in the layers
   * tree. The badge already names the container, so it is the obvious thing to
   * press. Without it the badge is inert text.
   */
  onSelectGroup?: () => void;
  description: string;
  /** px of left edge the caller needs kept clear — a docked left panel */
  insetLeft?: number;
  onRename: (name: string) => void;
  onBack: () => void;
  /**
   * Open the details panel. OPTIONAL, and the ⓘ mark is dropped without it —
   * a space has no info panel to open, and a mark that leads nowhere is worse
   * than no mark.
   */
  onViewInfo?: () => void;
  onDelete: () => void;
}) {
  // `dark` = the sampled backdrop is bright, so the label inks dark.
  const label = dark ? SCENE_LABEL.onBright : SCENE_LABEL.onDark;
  const { ink: color, rule: line, shadow } = label;

  const ref = useRef<HTMLHeadingElement>(null);
  const outerRef = useRef<HTMLDivElement>(null);
  const [editing, setEditing] = useState(false);
  // Where the info mark sits — pinned to the top-right of the LAST letter of the
  // title's first line, like a ® on a logo. Measured (see below), not guessed,
  // because the face is condensed + tilted and the name wraps/truncates.
  const [infoPos, setInfoPos] = useState<{ left: number; top: number } | null>(null);

  // Position of the end of the title's first *visual* line, relative to the
  // (untransformed) outer container. `range.getClientRects()` returns each line's
  // rect in true viewport space — it reflects the h1's scale AND the parent's 3D
  // tilt — so `rects[0]` is the first line as painted. A line can be split into
  // several fragments (word boundaries, the inserted ellipsis), so we take the
  // top-most fragment group and its right-most edge.
  const measureInfoPos = useCallback(() => {
    const el = ref.current;
    const outer = outerRef.current;
    if (!el || !outer) return null;
    const range = document.createRange();
    range.selectNodeContents(el);
    const rects = Array.from(range.getClientRects());
    if (!rects.length) return null;
    const top0 = Math.min(...rects.map((r) => r.top));
    const lineH = rects[0].bottom - rects[0].top; // first line height, viewport-space
    const firstLine = rects.filter((r) => r.top - top0 < lineH * 0.5);
    const right = Math.max(...firstLine.map((r) => r.right));
    const top = Math.min(...firstLine.map((r) => r.top));
    const bottom = Math.max(...firstLine.map((r) => r.bottom));
    const h = bottom - top;
    const o = outer.getBoundingClientRect();
    // Returns the icon's target CENTRE (paired with a translate(-50%,-50%) on the
    // element). `top + h*0.30` is roughly the glyph cap-top; we then lift the
    // centre by ~17px so the mark's lower edge clears the caps by a few px —
    // perched just ABOVE the last letter with a small gap, like a ®, rather than
    // sitting on the glyph. A hair left of the right edge (scaled by height, not
    // a fixed px) keeps it over the last glyph's corner.
    return { left: right - h * 0.07 - o.left, top: top + h * 0.3 - 17 - o.top };
  }, []);

  // Keep the DOM text in sync when the name changes from outside (e.g. a fresh
  // object), and clamp it to two lines while we're not editing.
  //
  // Truncation is MIDDLE-ellipsis: the opening of the name is kept (that is what
  // the eye reads first) plus a short tail so near-identical names stay
  // distinguishable — "Building Mechanical Machine" → "Building Mech…ine".
  // Binary-searched against real measurement rather than estimated, because the
  // face is condensed by a scale transform and a character-count guess would not
  // track the true wrap point.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || editing) return;
    el.textContent = name;

    // Wrapped in an IIFE so its early exits (text already fits / too short to
    // shorten) skip only the truncation — the info-mark measurement below still
    // runs on every non-editing path.
    (() => {
      const cs = getComputedStyle(el);
      const lineH = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 0.95;
      // Calibrate against a real single line rather than assuming 2 × lineHeight:
      // line-height here is 0.95 (tighter than the glyphs), so a rendered line's
      // scrollHeight overshoots lineHeight and a naive 2× test rejects text that
      // does fit on two lines.
      el.textContent = "X";
      const twoLines = el.scrollHeight + lineH;
      el.textContent = name;
      if (el.scrollHeight <= twoLines) return;

      const TAIL = 3; // trailing characters kept after the ellipsis
      if (name.length <= TAIL + 2) return; // too short to shorten usefully
      const tail = name.slice(-TAIL);
      let lo = 1;
      let hi = name.length - TAIL;
      let best = 1;
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        el.textContent = `${name.slice(0, mid)}…${tail}`;
        if (el.scrollHeight <= twoLines) {
          best = mid;
          lo = mid + 1;
        } else {
          hi = mid - 1;
        }
      }
      el.textContent = `${name.slice(0, best)}…${tail}`;
    })();

    setInfoPos(measureInfoPos());
  }, [name, editing, measureInfoPos]);

  // Re-anchor the info mark on resize (the title is responsive) and once the
  // variable fonts finish loading (first-paint metrics are off until then).
  useEffect(() => {
    const recompute = () => setInfoPos(measureInfoPos());
    window.addEventListener("resize", recompute);
    let alive = true;
    document.fonts?.ready.then(() => {
      if (alive) recompute();
    });
    return () => {
      alive = false;
      window.removeEventListener("resize", recompute);
    };
  }, [measureInfoPos]);

  const startEditing = () => {
    setEditing(true);
    requestAnimationFrame(() => {
      const el = ref.current;
      if (!el) return;
      // Restore the untruncated name so edits act on the real text, not the
      // clamped display string.
      el.textContent = name;
      el.focus();
      const range = document.createRange();
      range.selectNodeContents(el);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
    });
  };

  const commit = () => {
    const text = ref.current?.textContent?.replace(/\s+/g, " ").trim() ?? "";
    if (text) {
      onRename(text);
    } else if (ref.current) {
      ref.current.textContent = name; // don't allow an empty title
    }
    setEditing(false);
  };

  return (
    <div
      ref={outerRef}
      data-ui="object-title"
      className="pointer-events-none fixed top-[27%] z-20 w-[30rem] max-w-[44vw] select-none transition-[left] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]"
      // 48px normally (left-12); more when a left panel is docked over that edge.
      style={{ perspective: "900px", left: 48 + insetLeft }}
    >
      <div style={{ transform: "rotateY(19deg) rotateX(7deg)", transformOrigin: "left center" }}>
        {/* Back sits on its own row above the title.
            `relative z-10`: the title below is scaled up (scaleY(1.28)), so its
            painted box creeps back over this row and would otherwise swallow the
            clicks — starting a rename instead. */}
        <div className="relative z-10 mb-6">
        <button
          type="button"
          data-ui="object-title-back"
          onClick={onBack}
          className="pointer-events-auto inline-flex items-center gap-1.5 bg-transparent transition-opacity hover:opacity-75"
          style={{ color, textShadow: shadow }}
        >
          <Icon name="back" size={17} strokeWidth={1.6} />
          {/* The label mirrors the title's face exactly — same family, the same
              light weight, and the same tall-condensed scale — so the two read as
              one typographic unit. Only the label is scaled; scaling the whole
              button would squash the arrow too. */}
          <span className="type-scene-nav">Back</span>
        </button>
        </div>
        <h1
          ref={ref}
          contentEditable={editing}
          suppressContentEditableWarning
          onClick={() => !editing && startEditing()}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              ref.current?.blur();
            } else if (e.key === "Escape") {
              if (ref.current) ref.current.textContent = name;
              ref.current?.blur();
            }
          }}
          className="type-scene-title pointer-events-auto outline-none transition-opacity hover:opacity-80"
          style={{
            color,
            textShadow: shadow,
            transition: "color 0.3s ease, opacity 0.15s ease",
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            cursor: editing ? "text" : "pointer",
            // Hard cap at two lines. The measured word-drop above decides WHICH
            // words survive; this guarantees a third line can never render even
            // for a single unbreakable word. Lifted while editing so the full
            // name stays visible and caret-navigable.
            ...(editing
              ? null
              : {
                  display: "-webkit-box",
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: "vertical" as const,
                  overflow: "hidden",
                }),
          }}
        >
          {name}
        </h1>
        <span
          style={{
            display: "block",
            height: "2px",
            width: "58%",
            marginTop: "0.8rem",
            background: line,
            /* Matches the title's horizontal squeeze so the rule ends flush
               with the widest glyph rather than overshooting it. */
            transform: "scaleX(var(--type-scene-condense-x))",
            transformOrigin: "left",
            transition: "background 0.3s ease",
          }}
        />

        {/* Meta row + description. Same face and the same tall-condensed scale
            as the title so the whole block reads as one diegetic label on the
            tilted plane. */}
        <div
          className="type-scene-plane"
          style={{
            display: "flex",
            alignItems: "center",
            // Wraps: a grouped master reads type + group + role, and three pills
            // plus a long group name overflow the label's column on one line.
            flexWrap: "wrap",
            gap: "0.5rem",
            marginTop: "0.9rem",
          }}
        >
          <span
            data-ui="badge-type"
            className="type-scene-badge"
            style={{ ...badgeStyle, ...typeBadgeStyle }}
          >
            <Icon name="input-3d" size={13} />
            {typeLabel}
          </span>
          {role !== "none" && (
            <span
              data-ui={`badge-role-${role}`}
              className="type-scene-badge"
              style={{ ...badgeStyle, ...roleBadgeStyle[role] }}
            >
              <Icon name="master" size={13} />
              {ROLE_LABEL[role]}
            </span>
          )}
          {/* LAST IN THE ROW, and the only badge you can press.
              The order is what the object IS, then what it does for the dataset,
              then what it sits inside — outward from the thing itself, so the two
              pills that describe the object stay adjacent and the one that points
              somewhere else sits at the end of the line, where a link belongs. */}
          {groupName && (
            <button
              type="button"
              data-ui="badge-group"
              onClick={onSelectGroup}
              disabled={!onSelectGroup}
              /* The name can be anything the user typed, and the badge truncates
                 it; the tooltip carries the whole thing — and says what pressing
                 it does, since a badge is not obviously a control. */
              title={onSelectGroup ? `Select ${groupName}` : `Part of ${groupName}`}
              style={{
                ...badgeStyle,
                ...groupBadgeStyle,
                ...(onSelectGroup ? { cursor: "pointer" } : null),
              }}
              className={cn(
                "type-scene-badge",
                onSelectGroup && "pointer-events-auto transition-opacity hover:opacity-75"
              )}
            >
              <Icon name="group" size={13} />
              {/* "Part of", not just the name: on its own beside the type badge
                  a bare "Group 1" reads as a second thing this object IS. */}
              {/* `inline-block`: overflow and text-overflow do nothing on an
                  inline box, so a long group name would have run out past the
                  pill's border rather than ellipsing inside it. */}
              <span
                style={{
                  display: "inline-block",
                  maxWidth: "11rem",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  verticalAlign: "bottom",
                }}
              >
                Part of {groupName}
              </span>
            </button>
          )}
        </div>

        {description && (
          <p
            data-ui="object-description"
            className="type-scene-body type-scene-plane-top"
            style={{
              margin: "0.75rem 0 0",
              maxWidth: "26rem",
              lineHeight: 1.45,
              color,
              textShadow: shadow,
            }}
          >
            {description}
          </p>
        )}

        {/* Delete lives here rather than in the bottom toolbar so destructive
            action sits with the object's own label, away from the mode tabs. */}
        <button
          type="button"
          data-ui="object-delete"
          onClick={onDelete}
          style={{
            ...badgeStyle,
            ...deleteBadgeStyle,
            marginTop: "2.25rem",
            padding: "0.3rem 0.75rem",
            cursor: "pointer",
          }}
          className="type-scene-badge type-scene-plane pointer-events-auto transition-opacity hover:opacity-75"
        >
          <Icon name="trash" size={14} />
          Delete
        </button>
      </div>

      {/* Info mark — a ®-style superscript pinned to the top-right of the last
          letter of the title's first line (see `measureInfoPos`). Lives OUTSIDE
          the tilted plane, in the untransformed outer box, so its measured
          viewport position maps straight to left/top without inverting the tilt;
          being screen-aligned rather than tilted reads fine for a small mark.
          Hidden while renaming, when the layout is in flux. */}
      {!editing && infoPos && onViewInfo && (
        <button
          type="button"
          aria-label="View info"
          data-ui="object-view-info"
          onClick={onViewInfo}
          /* No border/ring wrapper — the lucide `info` glyph already draws its
             own circle, so adding one rendered a double ring. */
          style={{
            position: "absolute",
            left: infoPos.left,
            top: infoPos.top,
            transform: "translate(-50%, -50%)",
            color,
            filter: SCENE_LABEL.markShadow,
          }}
          className="pointer-events-auto z-30 bg-transparent transition-opacity hover:opacity-75"
        >
          <Icon name="info" className="type-scene-mark" strokeWidth={1.5} />
        </button>
      )}
    </div>
  );
}
