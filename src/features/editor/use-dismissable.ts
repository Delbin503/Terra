import { useEffect, useRef, type RefObject } from "react";

/**
 * Close an open popover on outside pointerdown / Escape — the editor's shared
 * dismissal behaviour (previously hand-rolled in ProjectEmojiPicker and the
 * rail flyouts). `close` is read through a ref so passing a fresh arrow each
 * render doesn't re-subscribe the listeners; the effect only re-runs when the
 * popover opens or closes.
 */
export function useDismissable(
  open: boolean,
  close: () => void,
  ref: RefObject<HTMLElement>
) {
  const cb = useRef(close);
  cb.current = close;

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) cb.current();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") cb.current();
    };
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open, ref]);
}
