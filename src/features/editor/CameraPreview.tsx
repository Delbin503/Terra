import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Vector3 } from "three";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/icons";
import { GlassGhostButton, GlassPanel } from "@/components/glass";
import { SceneWorld } from "./SceneCanvas";
import { CAMERA_RIG } from "./scene-palette";
import { atDistance, distance as vecDistance, formatZoom, zoomOf } from "./camera-rig";
import type { SceneApi } from "./useScene";
import type { SceneObject } from "./scene-types";

type Vec3 = [number, number, number];

/** Keeps the preview camera pinned to the rig camera's position, looking at the
 *  master (or scene origin) — so the inset shows exactly what that camera frames,
 *  live, as either the camera or the master moves. */
function PreviewRig({ position, target }: { position: Vec3; target: Vec3 }) {
  const { camera } = useThree();
  useFrame(() => {
    camera.position.set(position[0], position[1], position[2]);
    camera.lookAt(target[0], target[1], target[2]);
  });
  return null;
}

/**
 * CameraPreview — a live picture-in-picture of the selected capture camera's
 * point of view, sitting directly on top of the bottom-right properties panel.
 * It's a second render of the same world (shared `SceneWorld`) from the camera's
 * own position, so it updates frame-for-frame with the scene.
 *
 * The picture itself passes pointer events through to the viewport, except for
 * the expand button in its header (and a click on the picture, which does the
 * same): that opens `CameraView`, the same lens at full size.
 *
 * Width comes from the column it's stacked in rather than from here, so the
 * preview and the panel under it share one edge.
 */
export function CameraPreview({
  scene,
  camera,
  label,
  onExpand,
}: {
  scene: SceneApi;
  camera: SceneObject;
  /** which end of the sweep — drives the accent so it matches the body colour */
  label: string;
  /** open the expanded camera view */
  onExpand?: () => void;
}) {
  const target: Vec3 = scene.master ? scene.master.position : [0, 0.5, 0];
  const tint = camera.cameraRole === "end" ? CAMERA_RIG.end : CAMERA_RIG.start;

  return (
    <div
      data-ui="camera-preview"
      className="glass glass-regular pointer-events-none w-full overflow-hidden !rounded-2xl"
    >
      <div className="flex items-center gap-1.5 border-b border-glass/10 px-2.5 py-1">
        <Icon name="camera" size={12} style={{ color: tint }} />
        <span className="type-caption-strong truncate text-content">{label}</span>
        <span className="type-caption ml-auto text-content-subtle">POV</span>
        {onExpand && (
          <button
            type="button"
            data-ui="camera-preview-expand"
            aria-label="Expand camera view"
            title="Expand camera view"
            onClick={onExpand}
            className="pointer-events-auto grid h-6 w-6 place-items-center rounded-md text-content-muted transition-colors hover:bg-glass/15 hover:text-content"
          >
            <Icon name="maximize" size={13} />
          </button>
        )}
      </div>
      <div className="relative aspect-[16/10] bg-black/40">
        <Canvas
          className="!absolute inset-0"
          dpr={[1, 1.5]}
          gl={{ alpha: true, antialias: true }}
          camera={{ position: camera.position, fov: 50, near: 0.05, far: 1000 }}
        >
          <Suspense fallback={null}>
            <PreviewRig position={camera.position} target={target} />
            <SceneWorld scene={scene} interactive={false} hideId={camera.id} />
          </Suspense>
        </Canvas>
        {onExpand && (
          <button
            type="button"
            tabIndex={-1}
            aria-hidden
            data-ui="camera-preview-open"
            onClick={onExpand}
            className="pointer-events-auto absolute inset-0 cursor-zoom-in"
          />
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------- the expanded view -- */

/** One place the expanded view can stand: a reach the capture actually shoots. */
interface Stop {
  key: string;
  /** metres from the master — what `nearDistance` and a zoom set store */
  near: number;
  /** what the chip says: the multiple, or the set's own name */
  title: string;
  /** where this reach comes from */
  note: string;
  /** a saved set left out of the run — shown, but marked */
  outOfRun?: boolean;
}

/** Glides to the chosen reach rather than cutting to it, so stepping a stop
 *  reads as the camera moving in — which is what the capture does. */
function ViewRig({ position, target }: { position: Vec3; target: Vec3 }) {
  const { camera } = useThree();
  const goal = useRef(new Vector3());
  useFrame((_, dt) => {
    goal.current.set(position[0], position[1], position[2]);
    camera.position.lerp(goal.current, 1 - Math.pow(0.0005, dt));
    camera.lookAt(target[0], target[1], target[2]);
  });
  return null;
}

/**
 * CAMERA VIEW — the POV inset at full size, replacing the old Preview tab.
 *
 * Preview flew the editor's own viewport into a rig camera and left it free to
 * orbit, which showed views the capture never takes. This shows only what the
 * capture shoots: the camera stands where the rig stands, faces the master, and
 * the ONLY thing the user can change is how far in it is — and only between
 * the reaches configured in Zoom Distance:
 *
 *   · 1x, the rig's own framing — where the far end of the sweep stands;
 *   · every saved zoom set, which is a reach the run will render;
 *   · the Zoom Distance control's current value, when it isn't saved as a set.
 *
 * Zoom moves the camera along its line to the master, exactly as the capture
 * travels (`atDistance`, the same as the distance preview in the viewport). It
 * does not change the lens: a narrower FOV would be a different picture from
 * the one the dataset contains.
 *
 * Modal. The editor's shortcuts are swallowed while it is open, so Delete can't
 * remove the camera being looked through.
 */
export function CameraView({
  scene,
  camera,
  onClose,
}: {
  scene: SceneApi;
  /** the selected rig camera — the view opens on this end */
  camera: SceneObject;
  onClose: () => void;
}) {
  const rig = scene.rigs.find((r) => r.id === camera.rigId) ?? null;
  const ends = rig ? scene.rigCameras(rig) : null;
  const [which, setWhich] = useState<"start" | "end">(camera.cameraRole === "end" ? "end" : "start");
  const viewCam = (which === "end" ? ends?.end : ends?.start) ?? camera;
  const master = scene.master;
  const target: Vec3 = master ? master.position : [0, 0.5, 0];

  /* The far reach is measured on the END camera, the same as the rig's own
     numbers (see `cameraRelation` in EditorView) — so a stop's multiple here
     reads the same as the Zoom Distance control and the zoom-set names. */
  const far = master && ends?.end ? vecDistance(master.position, ends.end.position) : null;

  const stops: Stop[] = useMemo(() => {
    if (!far || !rig) return [];
    const list: Stop[] = [{ key: "rig", near: far, title: "1x", note: "Rig framing" }];
    for (const s of scene.savedZooms) {
      list.push({
        key: s.id,
        near: Math.min(s.nearDistance, far),
        title: s.name,
        note: "Zoom set",
        outOfRun: !s.inRun,
      });
    }
    const current = Math.min(rig.nearDistance, far);
    list.push({ key: "current", near: current, title: formatZoom(zoomOf(far, current)), note: "Zoom Distance" });
    // Farthest first — zooming in walks the list left to right. One stop per
    // reach: the current value usually IS a saved set, and two chips for one
    // place is a stop that does nothing.
    list.sort((a, b) => b.near - a.near);
    return list.filter((s, i) => i === 0 || Math.abs(s.near - list[i - 1].near) > 0.01);
  }, [far, rig, scene.savedZooms]);

  const [idx, setIdx] = useState(0);
  const clamped = Math.min(idx, Math.max(0, stops.length - 1));
  const stop = stops[clamped] ?? null;
  const step = (d: number) => setIdx((i) => Math.min(Math.max(0, Math.min(i, stops.length - 1) + d), Math.max(0, stops.length - 1)));

  const position: Vec3 =
    !master || !stop || stop.key === "rig"
      ? viewCam.position
      : atDistance(master.position, viewCam.position, stop.near);

  /* KEYS. Esc closes; + / − and the arrows step a stop. Everything is stopped
     at the window in the capture phase, ahead of the editor's own shortcuts. */
  const stepRef = useRef(step);
  stepRef.current = step;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const k = e.key;
      if (k === "Escape") onClose();
      else if (k === "+" || k === "=" || k === "ArrowUp" || k === "ArrowRight") stepRef.current(1);
      else if (k === "-" || k === "_" || k === "ArrowDown" || k === "ArrowLeft") stepRef.current(-1);
      e.preventDefault();
      e.stopImmediatePropagation();
    };
    window.addEventListener("keydown", onKey, { capture: true });
    return () => window.removeEventListener("keydown", onKey, { capture: true });
  }, [onClose]);

  /* THE WHEEL STEPS, IT DOESN'T SLIDE. A trackpad sends dozens of small
     deltas per gesture; they are summed and spent one stop at a time, with a
     short rest after each so one flick is one stop, not the whole list. */
  const wheel = useRef({ acc: 0, until: 0 });
  const onWheel = (e: React.WheelEvent) => {
    const w = wheel.current;
    const now = performance.now();
    if (now < w.until) return;
    w.acc += e.deltaY;
    if (Math.abs(w.acc) < 40) return;
    step(w.acc < 0 ? 1 : -1);
    w.acc = 0;
    w.until = now + 260;
  };

  const tint = which === "end" ? CAMERA_RIG.end : CAMERA_RIG.start;
  const canIn = clamped < stops.length - 1;
  const canOut = clamped > 0;

  return createPortal(
    <div
      data-ui="camera-view"
      role="dialog"
      aria-modal="true"
      aria-label="Camera view"
      className="fixed inset-0 z-[60] grid place-items-center bg-black/55 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <GlassPanel
        ui="camera-view-panel"
        thickness="overlay"
        className="!rounded-2xl !bg-canvas/85 p-0"
        style={{ width: "min(1180px, 92vw, calc((100vh - 230px) * 1.6))" }}
      >
        <header className="flex items-center gap-2 border-b border-glass/12 px-3 py-2">
          <Icon name="camera" size={15} style={{ color: tint }} />
          <span className="type-panel-title truncate text-content">{viewCam.name}</span>
          <span className="type-caption text-content-subtle">Camera view</span>

          {ends?.start && ends?.end && (
            <div className="ml-3 flex rounded-lg border border-glass/12 p-0.5" role="group" aria-label="Which camera">
              {(["start", "end"] as const).map((w) => (
                <button
                  key={w}
                  type="button"
                  data-ui={`camera-view-${w}`}
                  aria-pressed={which === w}
                  onClick={() => setWhich(w)}
                  className={cn(
                    "type-caption-strong rounded-md px-2.5 py-1 transition-colors",
                    which === w ? "bg-brand/15 text-brand" : "text-content-muted hover:text-content"
                  )}
                >
                  {w === "start" ? "Start" : "End"}
                </button>
              ))}
            </div>
          )}

          <span className="ml-auto" />
          <GlassGhostButton ui="camera-view-close" size="sm" icon="close" label="Close (Esc)" onClick={onClose} />
        </header>

        <div className="relative aspect-[16/10] bg-black/50" onWheel={onWheel}>
          <Canvas
            className="!absolute inset-0"
            dpr={[1, 2]}
            gl={{ alpha: true, antialias: true }}
            camera={{ position: viewCam.position, fov: 50, near: 0.05, far: 1000 }}
          >
            <Suspense fallback={null}>
              <ViewRig position={position} target={target} />
              <SceneWorld scene={scene} interactive={false} hideCameras />
            </Suspense>
          </Canvas>

          {stop && master && (
            <div className="pointer-events-none absolute left-3 top-3 rounded-lg bg-black/45 px-2.5 py-1.5 backdrop-blur-sm">
              <div className="type-panel-title text-white">{formatZoom(zoomOf(far!, stop.near))}</div>
              <div className="type-caption text-white/70">
                {stop.near.toFixed(1)} m from {master.name}
              </div>
            </div>
          )}
        </div>

        <footer className="flex flex-col gap-2 px-3 py-2.5">
          {stops.length > 0 ? (
            <>
              <div className="flex items-center gap-2">
                <GlassGhostButton
                  ui="camera-view-zoom-out"
                  size="sm"
                  icon="zoom-out"
                  label="Zoom out"
                  disabled={!canOut}
                  onClick={() => step(-1)}
                />
                <div className="flex min-w-0 flex-1 gap-1.5 overflow-x-auto">
                  {stops.map((s, i) => (
                    <button
                      key={s.key}
                      type="button"
                      data-ui={`camera-view-stop-${s.key}`}
                      aria-pressed={i === clamped}
                      onClick={() => setIdx(i)}
                      className={cn(
                        "flex shrink-0 flex-col items-start rounded-lg border px-2.5 py-1 text-left transition-colors",
                        i === clamped
                          ? "border-brand bg-brand/15"
                          : "border-glass/12 hover:bg-glass/8",
                        s.outOfRun && i !== clamped && "opacity-60"
                      )}
                    >
                      <span className={cn("type-label-strong", i === clamped ? "text-brand" : "text-content")}>
                        {s.title}
                      </span>
                      <span className="type-caption text-content-subtle">
                        {s.note}
                        {s.outOfRun ? " · not in run" : ""}
                      </span>
                    </button>
                  ))}
                </div>
                <GlassGhostButton
                  ui="camera-view-zoom-in"
                  size="sm"
                  icon="zoom-in"
                  label="Zoom in"
                  disabled={!canIn}
                  onClick={() => step(1)}
                />
              </div>
              <p className="type-caption text-content-subtle">
                Zoom only moves between the reaches set in the camera's <span className="text-content">Zoom Distance</span>:
                the rig's own framing, each saved zoom set, and the current value. Scroll, use + / −, or pick a stop. Add
                stops with <span className="text-content">Save as set</span>.
              </p>
            </>
          ) : (
            <p data-ui="camera-view-no-master" className="type-caption text-content-subtle">
              This scene has no <span className="text-content">Master object</span> yet. Zoom Distance is measured from
              it, so there is nothing to zoom between — this is the camera at its own framing.
            </p>
          )}
        </footer>
      </GlassPanel>
    </div>,
    document.body
  );
}
