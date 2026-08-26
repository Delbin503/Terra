import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import { GlassPanel } from "@/components/glass";
import { Icon, type IconName } from "@/components/icons";

/**
 * THE RIGHT-CLICK MENU, ONCE.
 * ------------------------------------------------------------------
 * It was written inside `SceneLayersPanel`, which was the right place while the
 * layers tree was the only surface with a right-click. The viewport now has one
 * too — a marquee selection has to be actionable where it was made, not only in
 * a panel somewhere else — and the second menu had to be the SAME menu: same
 * glass, same row height, same shortcut column, same clamping. A copy drawn to
 * match is a copy that stops matching the first time either one is touched.
 *
 * So the shape lives here and both callers hand it a list of items.
 */

/**
 * The modifier key, spelled the way this machine spells it.
 *
 * It lives here because both menus print it and both would otherwise keep their
 * own copy — and a Mac showing "Ctrl+C" beside a shortcut that is actually ⌘C is
 * a menu that lies about what it does.
 */
export const IS_MAC =
  typeof navigator !== "undefined" && /Mac|iPhone|iPad|iPod/.test(navigator.userAgent);
export const MOD = IS_MAC ? "⌘" : "Ctrl+";

export interface MenuItem {
  icon: IconName;
  label: string;
  /** the key that does the same thing, when there is one */
  shortcut?: string;
  run: () => void;
  disabled?: boolean;
  danger?: boolean;
}

/** Row height and padding, in px — the clamp below needs to know how tall the
 *  menu will be before it is laid out, and measuring after the fact would mean
 *  a frame of the menu hanging off the bottom of the screen. */
const ROW = 34;
const CHROME = 20;
const WIDTH = 240;

export function ContextMenu({
  title,
  items,
  x,
  y,
  ui = "context-menu",
  onClose,
}: {
  /** The eyebrow. "Setting" on a layer row; "3 objects" on a marquee. */
  title: string;
  items: MenuItem[];
  x: number;
  y: number;
  ui?: string;
  onClose: () => void;
}) {
  const height = items.length * ROW + CHROME;
  const left = Math.min(Math.max(x, 8), window.innerWidth - (WIDTH + 8));
  const top = Math.min(Math.max(y, 8), window.innerHeight - height - 8);

  /**
   * PORTALLED TO THE BODY, and it has to be.
   *
   * The menu is `position: fixed`, but the panels it gets rendered inside carry
   * `backdrop-filter` — which makes that panel the CONTAINING BLOCK for fixed
   * descendants. So `left: 639px` was measured from the panel's left edge, not
   * the viewport's, and the menu landed at x≈1207 on a 903px screen; the dock's
   * two `overflow: auto` ancestors then clipped whatever was left. It opened
   * every time and was never once visible.
   */
  return createPortal(
    <>
      {/* One click anywhere else closes it, including a second right-click —
          which is how a menu is dismissed when the thing you meant to hit was
          somewhere the menu is now covering. */}
      <div
        className="pointer-events-auto fixed inset-0 z-40"
        onClick={onClose}
        onContextMenu={(e) => {
          e.preventDefault();
          onClose();
        }}
      />
      <GlassPanel
        ui={ui}
        thickness="overlay"
        role="menu"
        style={{ left, top, width: WIDTH }}
        className="pointer-events-auto fixed z-50 !rounded-2xl p-1.5"
      >
        <p className="type-eyebrow truncate px-2.5 pb-1.5 pt-1 text-content-subtle">{title}</p>
        {items.map((it) => (
          <button
            key={it.label}
            type="button"
            role="menuitem"
            disabled={it.disabled}
            data-ui={`${ui}-action-${it.label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
            onClick={() => {
              it.run();
              onClose();
            }}
            className={cn(
              "type-body flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 transition-colors disabled:opacity-35 disabled:hover:bg-transparent",
              it.danger
                ? "mt-1 border-t border-glass/10 pt-2 text-danger hover:bg-danger/10"
                : "text-content-muted hover:bg-glass/10 hover:text-content"
            )}
          >
            <Icon name={it.icon} size={15} className="shrink-0" />
            <span className="min-w-0 flex-1 truncate text-left">{it.label}</span>
            <kbd className="type-caption shrink-0 font-sans text-content-subtle">{it.shortcut}</kbd>
          </button>
        ))}
      </GlassPanel>
    </>,
    document.body
  );
}
