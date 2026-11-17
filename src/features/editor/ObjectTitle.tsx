import { useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/icons";
import { GlassPanel } from "@/components/glass";
import { ROLE_LABEL, type ObjectRole } from "./scene-types";

const badgeStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: "0.35rem",
  padding: "0.2rem 0.6rem",
  borderRadius: "0.5rem",
  borderWidth: "1px",
  borderStyle: "solid",
  whiteSpace: "nowrap",
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
 * ObjectTitle — the focused object's label: a glass card on the left of the
 * viewport, as staging has it.
 *
 * Back on top, then the name on one line with the info mark at its right, a
 * short rule, the badges (type, role, the group it sits in), the description
 * and Delete. It used to be a giant tall-condensed title tilted into the scene
 * with no backing; over a bright or busy environment it was hard to read and a
 * long name broke mid-word. A card reads the same over any scene, so the ink no
 * longer follows the sampled backdrop (`dark` is accepted and ignored).
 *
 * Click the name to rename it; Enter commits, Escape cancels.
 */
export function ObjectTitle({
  name,
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
  /** retained for callers; the card no longer adapts to the backdrop */
  dark?: boolean;
  role: ObjectRole;
  typeLabel: string;
  /**
   * The group this object sits directly inside, if any. A group draws nothing
   * in the viewport, so once a click has walked down into one this badge is the
   * only thing on screen saying which container you're in.
   */
  groupName?: string | null;
  /** Select that group — the way back OUT of one. */
  onSelectGroup?: () => void;
  description: string;
  /** px of left edge the caller needs kept clear — a docked left panel */
  insetLeft?: number;
  onRename: (name: string) => void;
  onBack: () => void;
  /** Open the details panel. The ⓘ mark is dropped without it. */
  onViewInfo?: () => void;
  onDelete: () => void;
}) {
  const ref = useRef<HTMLHeadingElement>(null);
  const [editing, setEditing] = useState(false);

  // Keep the DOM text in sync when the name changes from outside.
  useLayoutEffect(() => {
    if (ref.current && !editing) ref.current.textContent = name;
  }, [name, editing]);

  const startEditing = () => {
    setEditing(true);
    requestAnimationFrame(() => {
      const el = ref.current;
      if (!el) return;
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
    if (text) onRename(text);
    else if (ref.current) ref.current.textContent = name; // never an empty title
    setEditing(false);
  };

  return (
    <div
      data-ui="object-title"
      className="pointer-events-none fixed top-[27%] z-20 w-[22rem] max-w-[40vw] transition-[left] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]"
      // 24px normally; more when a left panel is docked over that edge.
      style={{ left: 24 + insetLeft }}
    >
      <GlassPanel ui="object-title-card" thickness="regular" className="pointer-events-auto !rounded-2xl p-3">
        <button
          type="button"
          data-ui="object-title-back"
          onClick={onBack}
          className="type-body inline-flex h-8 items-center gap-1.5 rounded-lg bg-white/10 px-2.5 text-content transition-colors hover:bg-white/[0.16]"
        >
          <Icon name="back" size={15} strokeWidth={1.8} />
          Back
        </button>

        <div className="mt-3 flex items-center gap-3">
          <h1
            ref={ref}
            data-ui="object-title-name"
            title={editing ? undefined : `${name} — click to rename`}
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
            className={cn(
              "min-w-0 flex-1 text-[28px] font-light leading-tight tracking-[-0.01em] text-content outline-none",
              editing ? "cursor-text whitespace-pre-wrap break-words" : "cursor-pointer truncate hover:opacity-80"
            )}
          >
            {name}
          </h1>
          {onViewInfo && !editing && (
            <button
              type="button"
              aria-label="View info"
              data-ui="object-view-info"
              onClick={onViewInfo}
              className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-content transition-colors hover:bg-white/10"
            >
              <Icon name="info" size={17} strokeWidth={1.6} />
            </button>
          )}
        </div>
        <span className="mt-2.5 block h-px w-[40%] bg-glass/25" />

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span data-ui="badge-type" className="type-caption" style={{ ...badgeStyle, ...typeBadgeStyle }}>
            <Icon name="input-3d" size={13} />
            {typeLabel}
          </span>
          {role !== "none" && (
            <span
              data-ui={`badge-role-${role}`}
              className="type-caption"
              style={{ ...badgeStyle, ...roleBadgeStyle[role] }}
            >
              <Icon name="master" size={13} />
              {ROLE_LABEL[role]}
            </span>
          )}
          {groupName && (
            <button
              type="button"
              data-ui="badge-group"
              onClick={onSelectGroup}
              disabled={!onSelectGroup}
              title={onSelectGroup ? `Select ${groupName}` : `Part of ${groupName}`}
              style={{ ...badgeStyle, ...groupBadgeStyle, ...(onSelectGroup ? { cursor: "pointer" } : null) }}
              className={cn("type-caption", onSelectGroup && "transition-opacity hover:opacity-75")}
            >
              <Icon name="group" size={13} />
              <span className="inline-block max-w-[11rem] truncate align-bottom">Part of {groupName}</span>
            </button>
          )}
        </div>

        {description && (
          <p data-ui="object-description" className="type-body mt-3 leading-relaxed text-content-muted">
            {description}
          </p>
        )}

        {/* Delete sits with the object's own label, away from the mode tabs. */}
        <button
          type="button"
          data-ui="object-delete"
          onClick={onDelete}
          style={{ ...badgeStyle, ...deleteBadgeStyle, marginTop: "0.9rem", padding: "0.3rem 0.65rem", cursor: "pointer" }}
          className="type-caption transition-opacity hover:opacity-75"
        >
          <Icon name="trash" size={14} />
          Delete
        </button>
      </GlassPanel>
    </div>
  );
}
