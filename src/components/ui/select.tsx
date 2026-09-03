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
 * AND IT REBASES ONTO ITS CONTAINING BLOCK, which is what makes "fixed from
 * the trigger's rect" actually true. `position: fixed` is only relative to the
 * viewport while no ancestor is transformed — and `DialogContent` centres
 * itself with `-translate-x-1/2 -translate-y-1/2`, which makes the dialog box
 * the containing block for everything fixed inside it. A Select in a modal was
 * therefore measured against the screen and then positioned against the panel,
 * landing the list half a dialog away from the control that opened it; the
 * click-catcher's `inset-0` covered the panel rather than the page for the same
 * reason. So an invisible probe pinned at fixed 0,0 is measured alongside the
 * trigger, and its viewport position is subtracted back out.
 *
 * IT IS NOT PORTALLED TO THE BODY, which is the other way to fix this and the
 * wrong one here: Radix's dialog traps focus inside its own subtree, so a list
 * moved out of that subtree has its focus pulled back the instant it opens —
 * taking the arrow keys with it and blurring the list shut before a click on an
 * option can land. Staying inside the dialog keeps the control usable; the
 * arithmetic below is what keeps it in the right place.
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
  /** the fixed-0,0 probe `place` measures the containing block with */
  const originRef = React.useRef<HTMLDivElement>(null);

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
    /* Where a `fixed` 0,0 actually lands. On a plain page that is the viewport
       corner and both offsets are zero; inside a transformed ancestor it is
       that ancestor's corner, and every coordinate below has to come back by
       the same amount. Measured rather than assumed, because the transform can
       be anywhere up the tree. */
    const origin = originRef.current?.getBoundingClientRect();
    const dx = origin?.left ?? 0;
    const dy = origin?.top ?? 0;
    setAt({
      left: Math.max(8, Math.min(r.left, window.innerWidth - r.width - 8)) - dx,
      top: (flipped ? Math.max(8, r.top - GAP - height) : r.bottom + GAP) - dy,
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

      {/* The probe. Zero-sized and inert, and mounted whether or not the list
          is open, because `place` reads it BEFORE the list exists. */}
      <div ref={originRef} aria-hidden className="pointer-events-none fixed left-0 top-0 h-0 w-0" />

      {at && (
        <>
          {/* Catches the next click anywhere, the way the context menu does.
              `inset-0` is the containing block, which is the dialog when there
              is one — and a click inside the dialog but outside the list still
              has to close it, so the panel's own area is the part that matters. */}
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
