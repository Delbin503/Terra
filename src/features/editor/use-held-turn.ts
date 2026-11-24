import { useRef } from "react";

const norm360 = (v: number) => ((v % 360) + 360) % 360;

/**
 * A 0–360° slider over a bearing that is READ BACK from a position.
 *
 * The orbit sliders don't store their angle: it is worked out from where the
 * cameras stand. A camera turned to 360° stands exactly where it stood at 0°,
 * so read back it says 0°, and the handle a user just dragged to the right end
 * jumps to the left end.
 *
 * This keeps the value the user last set while it still describes the same
 * bearing (360° and 0°, or 720° and 0°), and drops it as soon as the bearing
 * moves for any other reason (a drag in the viewport, a reset), so the slider
 * never shows a turn that isn't there.
 *
 * `hold(deg)` goes in the slider's onChange; `clear()` goes on any control in
 * the same panel that sets the bearing to a value of its own (a reset).
 */
export function useHeldTurn(actual: number) {
  const held = useRef<number | null>(null);
  const a = norm360(actual);
  if (held.current !== null) {
    const diff = Math.abs(norm360(held.current) - a);
    if (Math.min(diff, 360 - diff) > 0.5) held.current = null;
  }
  return {
    value: held.current ?? a,
    hold: (deg: number) => {
      held.current = deg;
    },
    clear: () => {
      held.current = null;
    },
  };
}
