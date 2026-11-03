import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * DropdownLayer — lifts a dropdown out of the glass it hangs from.
 *
 * WHY. `backdrop-filter` blurs only what lies behind the element *within its
 * backdrop root*, and any ancestor with its own backdrop-filter becomes that
 * root. A menu rendered inside a glass bar therefore blurs the bar's (empty)
 * interior and nothing else: the scene, the view cube and the panels beneath
 * it showed through crisp, and the menu read as text floating over the
 * viewport rather than as a sheet of glass.
 *
 * HOW. Drop it where the menu used to be, inside the same `relative` wrapper.
 * It measures that wrapper and portals its children into <body> inside a fixed
 * box laid exactly over it — so the menu's existing `absolute top-[…] left-0`
 * classes position it exactly as before, but its glass now blurs the real page
 * behind it. The box follows the wrapper while open (a bar that moves, a dock
 * that slides).
 *
 * Outside-click handlers that test `wrapper.contains(target)` would see a click
 * on the portalled menu as "outside": `isInDropdownOf` lets them ask instead.
 */
export function DropdownLayer({ children, z = 50 }: { children: ReactNode; z?: number }) {
  const probe = useRef<HTMLSpanElement>(null);
  const layer = useRef<HTMLDivElement | null>(null);
  const [box, setBox] = useState<{ left: number; top: number; width: number; height: number } | null>(null);

  useLayoutEffect(() => {
    const anchor = probe.current?.parentElement;
    if (!anchor) return;
    let raf = 0;
    let last = "";
    const tick = () => {
      const r = anchor.getBoundingClientRect();
      const key = `${r.left}|${r.top}|${r.width}|${r.height}`;
      if (key !== last) {
        last = key;
        setBox({ left: r.left, top: r.top, width: r.width, height: r.height });
      }
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, []);

  const attach = (el: HTMLDivElement | null) => {
    layer.current = el;
    if (el && probe.current?.parentElement) {
      (el as HTMLDivElement & { __dropdownAnchor?: Element }).__dropdownAnchor = probe.current.parentElement;
    }
  };

  return (
    <>
      <span ref={probe} hidden aria-hidden />
      {box &&
        createPortal(
          <div
            ref={attach}
            data-dropdown-layer=""
            className="pointer-events-none fixed"
            style={{ left: box.left, top: box.top, width: box.width, height: box.height, zIndex: z }}
          >
            <div className="pointer-events-auto contents">{children}</div>
          </div>,
          document.body
        )}
    </>
  );
}

/** True when `target` sits inside a DropdownLayer opened from within `wrapper`. */
export function isInDropdownOf(wrapper: Element | null, target: EventTarget | null) {
  if (!wrapper || !(target instanceof Element)) return false;
  const layer = target.closest("[data-dropdown-layer]") as (Element & { __dropdownAnchor?: Element }) | null;
  return !!layer?.__dropdownAnchor && wrapper.contains(layer.__dropdownAnchor);
}
