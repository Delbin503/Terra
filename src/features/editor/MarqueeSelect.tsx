import { useEffect, useRef, useState } from "react";
import { Vector3 } from "three";
import { Icon } from "@/components/icons";
import { GlassBar } from "@/components/glass";
import { READOUT } from "./scene-palette";
import { subtreeIds } from "./scene-tree";
import type { SceneObject } from "./scene-types";
import type { CameraHandle } from "./SceneCanvas";
import type { SceneApi } from "./useScene";

/**
 * MARQUEE SELECT — hold Shift, drag a box, take everything inside it.
 * ------------------------------------------------------------------
 * WHY SHIFT AND NOT A BARE DRAG. Left-drag orbits, and it has orbited since the
 * viewport existed; every other gesture in this editor is built on top of that
 * being true. Taking it away for a box select would mean moving orbit onto Alt
 * or the right button — relearning the one thing everybody already knows how to
 * do — in exchange for a gesture used a handful of times per session. Shift is
 * the additive-selection modifier everywhere else in software, it collides with
 * nothing here, and while it is held the viewport says so.
 *
 * WHY ORBIT IS DISABLED ON KEY-DOWN, not on pointer-down. `OrbitControls` is
 * listening on the same canvas element, and both listeners would fire for the
 * same press — with the drag already begun by the time anything of ours could
 * cancel it. Turning orbit off the moment Shift goes down makes the two
 * gestures exclusive by construction rather than by a race.
 *
 * WHY IT PROJECTS POSITIONS RATHER THAN RAYCASTING. A rectangle is a screen-space
 * question, and the honest screen-space answer is where each object's origin
 * lands once projected through the live camera. Casting rays through every pixel
 * of the box would be the accurate version and would also mean a GPU readback or
 * a few thousand raycasts per frame of a drag, to decide something the user is
 * judging by eye anyway.
 */

/** Below this the drag was a Shift-click, not a box. Selecting the whole scene
 *  because a modifier was held during a click is a nasty surprise. */
const MIN_DRAG = 6;

interface Rect {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

const normalize = (r: Rect) => ({
  left: Math.min(r.x1, r.x2),
  top: Math.min(r.y1, r.y2),
  right: Math.max(r.x1, r.x2),
  bottom: Math.max(r.y1, r.y2),
});

/**
 * What a box is allowed to catch.
 *
 * Cameras are out: a rig is one instrument with a capture plan attached, and it
 * is not a thing you sweep up with the furniture. The environment and the skybox
 * are out because they are the world rather than things in it. Hidden objects are
 * out because a selection you cannot see is a selection you cannot check.
 */
const isCatchable = (o: SceneObject) =>
  !o.hidden && o.source !== "camera" && o.source !== "environment" && o.source !== "skybox";

export function MarqueeSelect({
  scene,
  cameraRef,
  enabled = true,
}: {
  scene: SceneApi;
  cameraRef: React.MutableRefObject<CameraHandle | null>;
  /** Off while a modal, a sheet or a draw tool owns the viewport. */
  enabled?: boolean;
}) {
  const [armed, setArmed] = useState(false);
  const [rect, setRect] = useState<Rect | null>(null);
  /** Live scene, for the pointer handlers — they are bound once and must not
   *  close over a stale object list. */
  const sceneRef = useRef(scene);
  sceneRef.current = scene;
  const dragging = useRef(false);
  /**
   * The rectangle, mirrored outside React.
   *
   * `setRect` is what draws it; this is what the pointer-up READS. Resolving the
   * selection inside a `setRect(r => …)` updater looked tidier and was wrong:
   * updaters must be pure, React is free to run them during a render, and
   * selecting objects from in there is a state change to the editor mid-render —
   * which React reports as exactly that, and which loses the selection on the
   * runs it discards.
   */
  const rectRef = useRef<Rect | null>(null);

  /* ------------------------------------------------------------ the modifier */

  useEffect(() => {
    if (!enabled) return;
    const down = (e: KeyboardEvent) => {
      if (e.key !== "Shift" || e.repeat) return;
      // Not while the user is typing — a rename field, the AI composer, a seed
      // box. Shift is a capital letter there.
      const el = document.activeElement;
      if (el instanceof HTMLElement && (el.isContentEditable || /^(INPUT|TEXTAREA)$/.test(el.tagName))) return;
      setArmed(true);
      cameraRef.current?.setOrbit(false);
    };
    const up = (e: KeyboardEvent) => {
      if (e.key !== "Shift") return;
      setArmed(false);
      // A drag outlives the modifier: letting go of Shift halfway through a box
      // should finish the box, not hand the camera back mid-gesture.
      if (!dragging.current) cameraRef.current?.setOrbit(true);
    };
    // A window that loses focus with Shift down would leave orbit off forever.
    const blur = () => {
      setArmed(false);
      if (!dragging.current) cameraRef.current?.setOrbit(true);
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
      cameraRef.current?.setOrbit(true);
    };
  }, [enabled, cameraRef]);

  /* ---------------------------------------------------------------- the drag */

  useEffect(() => {
    if (!enabled || !armed) return;
    const dom = cameraRef.current?.dom;
    if (!dom) return;

    const start = (e: PointerEvent) => {
      if (e.button !== 0) return;
      dragging.current = true;
      rectRef.current = { x1: e.clientX, y1: e.clientY, x2: e.clientX, y2: e.clientY };
      setRect(rectRef.current);
      dom.setPointerCapture(e.pointerId);
    };
    const move = (e: PointerEvent) => {
      if (!dragging.current || !rectRef.current) return;
      rectRef.current = { ...rectRef.current, x2: e.clientX, y2: e.clientY };
      setRect(rectRef.current);
    };
    const end = (e: PointerEvent) => {
      if (!dragging.current) return;
      dragging.current = false;
      dom.releasePointerCapture?.(e.pointerId);
      const box = rectRef.current;
      rectRef.current = null;
      setRect(null);
      if (box) commit(box);
      // Shift may already be up — see the keyup handler.
      if (!armed) cameraRef.current?.setOrbit(true);
    };

    dom.addEventListener("pointerdown", start);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
    return () => {
      dom.removeEventListener("pointerdown", start);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, armed, cameraRef]);

  /* ------------------------------------------------------------- the answer */

  function commit(r: Rect) {
    const box = normalize(r);
    if (box.right - box.left < MIN_DRAG && box.bottom - box.top < MIN_DRAG) return;

    const handle = cameraRef.current;
    if (!handle) return;
    const { camera, dom } = handle;
    const view = dom.getBoundingClientRect();
    const live = sceneRef.current;

    /** Does this object's origin fall inside the box, as painted? */
    const inside = (o: SceneObject) => {
      const p = new Vector3(o.position[0], o.position[1], o.position[2]).project(camera);
      // Behind the camera, or past the far plane: projection wraps and would
      // report a point on screen that nobody can see.
      if (p.z < -1 || p.z > 1) return false;
      const x = view.left + ((p.x + 1) / 2) * view.width;
      const y = view.top + ((1 - p.y) / 2) * view.height;
      return x >= box.left && x <= box.right && y >= box.top && y <= box.bottom;
    };

    /**
     * A BOX SELECTS ROOTS, NOT PARTS.
     *
     * Dragging over a grouped set has to yield the group — that is what grouping
     * is for. So the candidates are the top of each tree, and a group counts as
     * caught when anything it holds is caught: its own origin is the centre of
     * its bounding box, which for a horseshoe of chairs is a point in the middle
     * of the room with nothing at it.
     */
    const roots = live.objects.filter((o) => !o.parentId);
    const caught = roots
      .filter((o) => {
        if (o.group) {
          const kids = subtreeIds(live.objects, o.id).filter((id) => id !== o.id);
          return live.objects.some((k) => kids.includes(k.id) && isCatchable(k) && inside(k));
        }
        return isCatchable(o) && inside(o);
      })
      .map((o) => o.id);

    // An empty box is a deselect — the same thing clicking empty space means.
    live.selectMany(caught);
    if (caught.length === 0) live.select(null);
  }

  /* -------------------------------------------------------------- the drawing */

  if (!enabled || (!armed && !rect)) return null;
  const box = rect ? normalize(rect) : null;

  return (
    <>
      {box && (
        <div
          data-ui="marquee-rect"
          className="pointer-events-none fixed z-40"
          style={{
            left: box.left,
            top: box.top,
            width: box.right - box.left,
            height: box.bottom - box.top,
            // The readout palette, not the brand: this is a measuring
            // affordance like the gizmo's number chip, not an action.
            border: `1px solid ${READOUT.border}`,
            background: "rgba(255,255,255,0.08)",
            borderRadius: 2,
          }}
        />
      )}
      {/* Say the mode is on. Shift is invisible, and a viewport that had
          silently stopped orbiting would read as a broken viewport. */}
      {armed && !rect && (
        <div
          data-ui="marquee-hint"
          className="pointer-events-none fixed bottom-6 left-1/2 z-30 -translate-x-1/2"
        >
          <GlassBar ui="marquee" shape="pill" className="h-10 gap-2 px-3.5">
            <Icon name="group-add" size={15} className="shrink-0 text-content-muted" />
            <span className="type-body text-content">Drag a box to select</span>
          </GlassBar>
        </div>
      )}
    </>
  );
}
