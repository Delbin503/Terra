import { cn } from "@/lib/utils";
import { Icon, type IconName } from "@/components/icons";
import type { AssetType } from "./assets-data";
import {
  ROLE_BADGE,
  ROLE_GLASS,
  ROLE_TEXT,
  canTakeRole,
  type ObjectRole,
} from "./scene-types";

export type EditTab = "object" | "texture" | "capture";

/**
 * Bottom-center per-object toolbar. The tabs drive the right-side properties
 * panel (filtered to Transform / Material / Capture).
 *
 * Each tab is a TOGGLE, not a radio: clicking the lit one closes its panel and
 * leaves the object selected. `tab === null` is therefore a normal resting
 * state — the object is still yours, you just want to look at it.
 *
 * A camera gets a different set: Capture instead of Texture, and no Role tile
 * at all — a capture rig can't be the scene's hero or its clutter, it's the
 * thing pointed AT them.
 */
export function ObjectToolbar({
  tab,
  role,
  source,
  insetLeft = 0,
  onTab,
  onSetRole,
}: {
  tab: EditTab | null;
  role: ObjectRole;
  /** what kind of thing is selected — decides both the tab set and whether a
   *  dataset role is even offered */
  source: AssetType;
  /** px of left edge the caller needs kept clear — a docked left panel */
  insetLeft?: number;
  onTab: (t: EditTab) => void;
  onSetRole: (role: ObjectRole) => void;
}) {
  const isCamera = source === "camera";
  const tiles: {
    icon: IconName;
    label: string;
    onClick: () => void;
    active?: boolean;
    danger?: boolean;
  }[] = isCamera
    ? [
        { icon: "camera", label: "Object", onClick: () => onTab("object"), active: tab === "object" },
        { icon: "capture", label: "Capture", onClick: () => onTab("capture"), active: tab === "capture" },
      ]
    : [
        { icon: "input-3d", label: "Object", onClick: () => onTab("object"), active: tab === "object" },
        { icon: "texture", label: "Texture", onClick: () => onTab("texture"), active: tab === "texture" },
      ];

  return (
    <div
      // Centred in what's LEFT of the viewport, not in the viewport: with the AI
      // drawer docked the true centre lands under it, and the toolbar ends up
      // sitting on top of the composer.
      className="pointer-events-auto fixed bottom-6 z-30 flex -translate-x-1/2 gap-2.5 transition-[left] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]"
      style={{ left: `calc(50% + ${insetLeft / 2}px)` }}
    >
      {tiles.map((t) => (
        <button
          key={t.label}
          type="button"
          data-ui={`obj-tool-${t.label.toLowerCase().replace(/\s+/g, "-")}`}
          aria-pressed={!!t.active}
          onClick={t.onClick}
          className={cn(
            "type-label glass glass-interactive flex min-w-[76px] flex-col items-center gap-1 !rounded-2xl px-4 py-2.5",
            // Active tiles tint via .glass-role (globals.css) rather than a
            // `bg-<role>/x` utility: that sets background-color, which replaces
            // the glass ink and leaves the label — the same role colour — sitting
            // on a wash of itself over the scene.
            t.active
              ? "glass-role glass-role-brand text-brand-on-glass"
              : t.danger
                ? "text-danger"
                : "text-content-muted hover:text-content"
          )}
        >
          <Icon name={t.icon} size={18} />
          {t.label}
        </button>
      ))}

      {/* Only content objects can be the master. A camera is the thing pointed
          AT the hero and an HDRI is the environment around it — neither can be
          the subject, so neither is offered the tile. */}
      {canTakeRole(source) && <RoleTile role={role} onSetRole={onSetRole} />}
    </div>
  );
}

/**
 * MASTER, AS A TOGGLE.
 *
 * This was a four-item popover — no role / master / distractor / background —
 * back when those were three separate axes you armed one object at a time.
 * They aren't any more: background and distractor are assigned in bulk, against
 * the whole scene, in TerraGen's Object Roles panel, which is where you can
 * actually see the set you're building. What is left for a single selected
 * object is the one role that is exactly-one-per-scene and worth setting from
 * the viewport the moment you look at the thing: master.
 *
 * So it is a switch, not a menu. A popover with one item in it is a menu that
 * has forgotten what it is for.
 *
 * Clicking it when the object already IS the master releases it — otherwise
 * the only way to unset the hero would be to promote something else, and a
 * scene can legitimately have none while you decide.
 */
function RoleTile({
  role,
  onSetRole,
}: {
  role: ObjectRole;
  onSetRole: (role: ObjectRole) => void;
}) {
  const isMaster = role === "master";

  return (
    <button
      type="button"
      data-ui="obj-tool-role"
      role="switch"
      aria-checked={isMaster}
      aria-label="Master object"
      title={isMaster ? "Release as master" : "Mark as the master object"}
      onClick={() => onSetRole(isMaster ? "none" : "master")}
      className={cn(
        "type-label glass glass-interactive flex min-w-[76px] flex-col items-center gap-1 !rounded-2xl px-4 py-2.5",
        // Only the master state tints. A distractor or background object still
        // reads as itself in the layer tree and the viewport outline; this tile
        // answers one question, so it only lights for one answer.
        isMaster
          ? `${ROLE_GLASS.master} ${ROLE_TEXT.master}`
          : "text-content-muted hover:text-content"
      )}
    >
      <Icon name="master" size={18} />
      {isMaster ? ROLE_BADGE.master : "Master"}
    </button>
  );
}
