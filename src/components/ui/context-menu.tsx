import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { Icon, type IconName } from "@/components/icons";

/**
 * ContextMenu — the right-click menu, positioned at the pointer.
 *
 * It renders at the cursor rather than anchored to the thing it acts on, which
 * is what makes it a context menu and not a dropdown: the mouse is already
 * where you want to read. Near an edge it flips instead of being clipped.
 *
 * Items are data, so the caller decides what a project's menu holds versus a
 * folder's, and `onSelect` gets the id back. One level of nesting is supported —
 * enough for "Move ▸ Folder / Organization", and the depth at which a menu stops
 * being navigable with a mouse.
 */

export interface MenuItem {
  id: string;
  label: string;
  icon: IconName;
  /** a hairline above this item, to group what follows */
  separated?: boolean;
  /** destructive — painted in the danger role */
  danger?: boolean;
  /** nested destinations; a parent with children isn't itself selectable */
  items?: MenuItem[];
}

const WIDTH = 224;
const SUB_WIDTH = 216;
const ROW = 36;

export function ContextMenu({
  at,
  items,
  onSelect,
  onClose,
}: {
  /** viewport coordinates of the click */
  at: { x: number; y: number };
  items: MenuItem[];
  onSelect: (id: string) => void;
  onClose: () => void;
}) {
  const [openSub, setOpenSub] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Keep the panel on screen. Height is estimated from the row count rather
  // than measured: one frame of a menu hanging off the bottom edge is worse
  // than a few pixels of slack at the top.
  const height = items.length * ROW + 12;
  const left = Math.max(8, Math.min(at.x, window.innerWidth - WIDTH - 8));
  const top = Math.max(8, Math.min(at.y, window.innerHeight - height - 8));
  const subLeft = left + WIDTH + 4 > window.innerWidth - SUB_WIDTH;

  return (
    <>
      {/* Catches the next click anywhere — including another right-click, which
          should move the menu rather than stack a second one. */}
      <div
        className="fixed inset-0 z-40"
        onClick={onClose}
        onContextMenu={(e) => {
          e.preventDefault();
          onClose();
        }}
      />
      <div
        role="menu"
        style={{ left, top, width: WIDTH }}
        className="fixed z-50 rounded-xl border border-line/12 bg-surface-overlay p-1.5 shadow-pop"
      >
        {items.map((item) => (
          <div
            key={item.id}
            className="relative"
            onMouseEnter={() => setOpenSub(item.items ? item.id : null)}
          >
            {item.separated && <div className="mx-1 my-1 h-px bg-line/10" />}
            <button
              type="button"
              role="menuitem"
              aria-haspopup={item.items ? "menu" : undefined}
              aria-expanded={item.items ? openSub === item.id : undefined}
              onClick={() => {
                if (item.items) {
                  setOpenSub(openSub === item.id ? null : item.id);
                  return;
                }
                onSelect(item.id);
                onClose();
              }}
              className={cn(
                "type-body flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors",
                item.danger
                  ? "text-content-muted hover:bg-danger/15 hover:text-danger"
                  : "text-content-muted hover:bg-surface-raised hover:text-content",
                item.items && openSub === item.id && "bg-surface-raised text-content"
              )}
            >
              <Icon name={item.icon} size={16} className="shrink-0" />
              <span className="flex-1 truncate">{item.label}</span>
              {item.items && <Icon name="chevron-right" size={15} className="shrink-0" />}
            </button>

            {item.items && openSub === item.id && (
              <div
                role="menu"
                style={{ width: SUB_WIDTH }}
                className={cn(
                  "absolute -top-1.5 rounded-xl border border-line/12 bg-surface-overlay p-1.5 shadow-pop",
                  subLeft ? "right-[calc(100%+4px)]" : "left-[calc(100%+4px)]"
                )}
              >
                {item.items.map((sub) => (
                  <button
                    key={sub.id}
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      onSelect(sub.id);
                      onClose();
                    }}
                    className="type-body flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-content-muted transition-colors hover:bg-surface-raised hover:text-content"
                  >
                    <Icon name={sub.icon} size={16} className="shrink-0" />
                    <span className="flex-1 truncate">{sub.label}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </>
  );
}
