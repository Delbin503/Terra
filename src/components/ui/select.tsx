import * as React from "react";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/icons";

/**
 * Select — a value picked from a short list.
 *
 * IT IS NOT A NATIVE `<select>` ANY MORE, and that is the whole point of this
 * file. The old one was: `appearance-none` on the closed control, our chevron
 * drawn over it, `bg-surface-overlay` set on every `<option>`. The closed state
 * looked like the app. The OPEN state was drawn by the operating system — a
 * white or grey list in the platform's own font, at the platform's own row
 * height, ignoring the option background on macOS entirely — so the moment
 * anyone actually used the control it stopped looking like this product. Half a
 * component styled is worse than none: it promises the popup will match.
 *
 * So the popup is ours. It is the SAME popup as the right-click menu
 * (`ContextMenu`): same surface, same radius, same row height, same hairline —
 * because a dropdown and a context menu are one object, a list of choices over
 * the page, and the two of them looking different was the other half of the
 * inconsistency.
 *
 * It is positioned `fixed` from the trigger's rect rather than absolutely
 * inside it: these sit in drawers, table footers and scrolling panels, all of
 * which clip an absolutely-positioned child. Scrolling the page closes it,
 * which is what a menu anchored to a moving element should do.
 *
 * What is kept from the native control is everything a keyboard needs — the
 * roles, the arrow keys, Home/End, Enter, Escape, and focus returning to the
 * trigger on close.
 */

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps {
  options: SelectOption[];
  value: string;
  /** the chosen value — not a change event; there is no `<select>` under this */
  onChange: (value: string) => void;
  /** rendered before the value, e.g. "Seat Type: " */
  prefix?: string;
  /** names the control for screen readers */
  "aria-label"?: string;
  className?: string;
  disabled?: boolean;
}

/** Where the list opens, in viewport coordinates. */
interface At {
  left: number;
  top: number;
  width: number;
  /** the list is above the trigger — near the bottom edge of the window */
  flipped: boolean;
}

const ROW = 34;
const PAD = 12;
const GAP = 6;
/** Never taller than this, however many options there are. */
const MAX_H = 264;

export function Select({
  options,
  value,
  onChange,
  prefix,
  "aria-label": ariaLabel,
  className,
  disabled,
}: SelectProps) {
  const [at, setAt] = React.useState<At | null>(null);
  /** the row the keyboard is on, which is not yet the value */
  const [active, setActive] = React.useState(0);
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const listRef = React.useRef<HTMLDivElement>(null);

  const open = at !== null;
  const selected = options.findIndex((o) => o.value === value);
  const label = options[selected]?.label ?? value;

  const place = React.useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const height = Math.min(options.length * ROW + PAD, MAX_H);
    const below = window.innerHeight - r.bottom - GAP;
    const flipped = below < height && r.top > below;
    setAt({
      left: Math.max(8, Math.min(r.left, window.innerWidth - r.width - 8)),
      top: flipped ? Math.max(8, r.top - GAP - height) : r.bottom + GAP,
      width: r.width,
      flipped,
    });
  }, [options.length]);

  function openList() {
    if (disabled) return;
    setActive(selected < 0 ? 0 : selected);
    place();
  }

  function close(refocus = true) {
    setAt(null);
    if (refocus) triggerRef.current?.focus();
  }

  function commit(i: number) {
    const option = options[i];
    if (option) onChange(option.value);
    close();
  }

  /* The list follows nothing: if the thing it is anchored to moves, the anchor
     is a lie. A resize can be re-measured; a scroll somewhere up the tree
     cannot be listened for reliably, so any scroll closes it. */
  React.useEffect(() => {
    if (!open) return;
    const onScroll = () => close(false);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", place);
    };
  }, [open, place]);

  // Focus moves into the list so the arrow keys belong to it, not to the page.
  React.useEffect(() => {
    if (open) listRef.current?.focus();
  }, [open]);

  function onKeyDown(e: React.KeyboardEvent) {
    if (!open) {
      if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        openList();
      }
      return;
    }
    switch (e.key) {
      case "Escape":
        e.preventDefault();
        close();
        break;
      case "ArrowDown":
        e.preventDefault();
        setActive((i) => Math.min(i + 1, options.length - 1));
        break;
      case "ArrowUp":
        e.preventDefault();
        setActive((i) => Math.max(i - 1, 0));
        break;
      case "Home":
        e.preventDefault();
        setActive(0);
        break;
      case "End":
        e.preventDefault();
        setActive(options.length - 1);
        break;
      case "Enter":
      case " ":
        e.preventDefault();
        commit(active);
        break;
    }
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        disabled={disabled}
        onClick={() => (open ? close() : openList())}
        onKeyDown={onKeyDown}
        /* The field skin, same as every input: a dropdown is a field you pick
           in rather than type in, and it used to be the one control wearing
           `glass-thin` — a material with no border — beside inputs that had one. */
        className={cn(
          "field-well type-body relative inline-flex h-9 items-center gap-1 rounded-lg pl-3 pr-8 text-left text-content disabled:opacity-50",
          className
        )}
      >
        {prefix && (
          <span className="shrink-0 text-content-subtle">{prefix}</span>
        )}
        <span className="min-w-0 flex-1 truncate">{label}</span>
        <Icon
          name="chevron-down"
          size={15}
          aria-hidden
          className={cn(
            "pointer-events-none absolute right-2.5 text-content-subtle transition-transform",
            open && "rotate-180"
          )}
        />
      </button>

      {at && (
        <>
          {/* Catches the next click anywhere, the way the context menu does. */}
          <div className="fixed inset-0 z-40" onClick={() => close(false)} />
          <div
            ref={listRef}
            role="listbox"
            tabIndex={-1}
            aria-label={ariaLabel}
            onKeyDown={onKeyDown}
            onBlur={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node)) close(false);
            }}
            style={{
              left: at.left,
              top: at.top,
              minWidth: at.width,
              maxHeight: MAX_H,
            }}
            className={cn(
              "fixed z-50 overflow-y-auto rounded-xl border border-line/12 bg-surface-overlay p-1.5 shadow-pop focus:outline-none",
              at.flipped ? "origin-bottom-left" : "origin-top-left",
              "animate-menu-in"
            )}
          >
            {options.map((option, i) => {
              const on = option.value === value;
              return (
                <button
                  key={option.value}
                  type="button"
                  role="option"
                  aria-selected={on}
                  onClick={() => commit(i)}
                  onMouseEnter={() => setActive(i)}
                  className={cn(
                    "type-body flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left transition-colors",
                    i === active
                      ? "bg-surface-raised text-content"
                      : "text-content-muted",
                    on && "text-content"
                  )}
                >
                  {/* Reserved, not conditional: a tick that appears only on the
                      chosen row shifts every other label sideways as you move. */}
                  <Icon
                    name="check"
                    size={14}
                    aria-hidden
                    className={cn("shrink-0 text-brand", !on && "invisible")}
                  />
                  <span className="min-w-0 flex-1 truncate">{option.label}</span>
                </button>
              );
            })}
          </div>
        </>
      )}
    </>
  );
}
