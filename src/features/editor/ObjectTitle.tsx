import { useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { Icon } from "@/components/icons";

/** The title's face, at meta scale — shared by the badges, View Info and copy. */
const metaTextStyle: CSSProperties = {
  fontFamily: "var(--font-sans)",
  fontWeight: 300,
  fontSize: "0.9375rem",
  letterSpacing: "0.01em",
  padding: 0,
  border: 0,
};

const badgeStyle: CSSProperties = {
  ...metaTextStyle,
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
const masterBadgeStyle: CSSProperties = {
  color: "hsl(45 100% 74%)",
  borderColor: "hsl(var(--master) / 0.6)",
  background: "hsl(45 90% 13% / 0.3)",
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
  isMaster,
  typeLabel,
  description,
  onRename,
  onBack,
  onViewInfo,
  onDelete,
}: {
  name: string;
  dark: boolean;
  isMaster: boolean;
  typeLabel: string;
  description: string;
  onRename: (name: string) => void;
  onBack: () => void;
  onViewInfo: () => void;
  onDelete: () => void;
}) {
  const color = dark ? "#17130e" : "#ffffff";
  const line = dark ? "rgba(23,19,14,0.7)" : "rgba(255,255,255,0.8)";
  const shadow = dark
    ? "0 1px 14px rgba(255,255,255,0.45), 0 1px 2px rgba(255,255,255,0.5)"
    : "0 3px 22px rgba(0,0,0,0.55), 0 1px 2px rgba(0,0,0,0.5)";

  const ref = useRef<HTMLHeadingElement>(null);
  const [editing, setEditing] = useState(false);

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
  }, [name, editing]);

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
      data-ui="object-title"
      className="pointer-events-none fixed left-12 top-[27%] z-20 w-[30rem] max-w-[44vw] select-none"
      style={{ perspective: "900px" }}
    >
      <div style={{ transform: "rotateY(19deg) rotateX(7deg)", transformOrigin: "left center" }}>
        {/* Back + info share a row above the title.
            `relative z-10`: the title below is scaled up (scaleY(1.28)), so its
            painted box creeps back over this row and would otherwise swallow the
            clicks — starting a rename instead. */}
        <div className="relative z-10 mb-2.5 flex w-[17rem] max-w-full items-center justify-between gap-6">
        <button
          type="button"
          data-ui="object-title-back"
          onClick={onBack}
          className="pointer-events-auto flex items-center gap-1.5 bg-transparent transition-opacity hover:opacity-75"
          style={{ color, textShadow: shadow }}
        >
          <Icon name="back" size={17} strokeWidth={1.6} />
          {/* The label mirrors the title's face exactly — same family, the same
              light weight, and the same tall-condensed scale — so the two read as
              one typographic unit. Only the label is scaled; scaling the whole
              button would squash the arrow too. */}
          <span
            style={{
              display: "inline-block",
              fontFamily: "var(--font-sans)",
              fontWeight: 300,
              fontSize: "1.0625rem",
              lineHeight: 1,
              letterSpacing: "0.01em",
              transform: "scaleY(1.28) scaleX(0.8)",
              transformOrigin: "left center",
            }}
          >
            Back
          </span>
        </button>

        {/* Info replaces the old "View Info" text link that sat in the badge row. */}
        <button
          type="button"
          aria-label="View info"
          data-ui="object-view-info"
          onClick={onViewInfo}
          /* No border/ring wrapper — the lucide `info` glyph already draws its
             own circle, so adding one rendered a double ring. */
          style={{ color, filter: `drop-shadow(0 2px 6px rgba(0,0,0,0.6))` }}
          className="pointer-events-auto shrink-0 bg-transparent transition-opacity hover:opacity-75"
        >
          <Icon name="info" size={26} strokeWidth={1.5} />
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
          className="pointer-events-auto outline-none transition-opacity hover:opacity-80"
          style={{
            margin: 0,
            fontFamily: "var(--font-sans)",
            fontWeight: 300,
            fontSize: "clamp(3.25rem, 5.4vw, 5.5rem)",
            lineHeight: 0.95,
            letterSpacing: "0.01em",
            transform: "scaleY(1.28) scaleX(0.8)",
            transformOrigin: "left center",
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
            transform: "scaleX(0.8)",
            transformOrigin: "left",
            transition: "background 0.3s ease",
          }}
        />

        {/* Meta row + description. Same face and the same tall-condensed scale
            as the title so the whole block reads as one diegetic label on the
            tilted plane. */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
            marginTop: "0.9rem",
            transform: "scaleY(1.18) scaleX(0.86)",
            transformOrigin: "left center",
          }}
        >
          <span data-ui="badge-type" style={{ ...badgeStyle, ...typeBadgeStyle }}>
            <Icon name="input-3d" size={13} />
            {typeLabel}
          </span>
          {isMaster && (
            <span data-ui="badge-master" style={{ ...badgeStyle, ...masterBadgeStyle }}>
              <Icon name="master" size={13} />
              Master Object
            </span>
          )}
        </div>

        {description && (
          <p
            data-ui="object-description"
            style={{
              ...metaTextStyle,
              margin: "0.75rem 0 0",
              maxWidth: "26rem",
              lineHeight: 1.45,
              color,
              textShadow: shadow,
              transform: "scaleY(1.18) scaleX(0.86)",
              transformOrigin: "left top",
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
            transform: "scaleY(1.18) scaleX(0.86)",
            transformOrigin: "left center",
            cursor: "pointer",
          }}
          className="pointer-events-auto transition-opacity hover:opacity-75"
        >
          <Icon name="trash" size={14} />
          Delete
        </button>
      </div>
    </div>
  );
}
