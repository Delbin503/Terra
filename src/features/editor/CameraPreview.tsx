import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Vector3 } from "three";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/icons";
import { GlassGhostButton, GlassPanel } from "@/components/glass";
import { SceneWorld } from "./SceneCanvas";
import { CAMERA_RIG } from "./scene-palette";
import {
  atDistance,
  azimuthOf,
  distance as vecDistance,
  formatZoom,
  orbitPoint,
  orbitSweep,
  planCapture,
  zoomOf,
} from "./camera-rig";
import { frameSample, rigState } from "./work-order";
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

/** One key press of turn. Five degrees is a nudge you can aim with; the drag is
 *  there for crossing the whole arc. */
const TURN_STEP = 5;
/** How fast a drag turns. A full revolution takes about 900px — a little under
 *  the picture's own width, so one confident sweep is one lap. */
const DEG_PER_PX = 0.4;

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
 * TURNING IS BOUNDED BY THE ARC, for the same reason. The capture holds the
 * camera at its stop and turns the MASTER through `orbitStart → orbitEnd`;
 * orbiting the camera the other way is the same picture (see `frameSample` in
 * work-order.ts), so the view turns the camera and stops where the arc does. An
 * arc of 60° → 360° is 300° of travel and the view gives you exactly those 300°
 * — past that is a frame the run will never contain, which is the one thing
 * this view exists not to show.
 *
 * The turn starts at 0 — the camera exactly where it stands — so opening the
 * view never jumps, and it moves the VIEW only: the rig in the scene does not
 * move, the same bargain zoom makes.
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
  /* ONE VIEW, THROUGH THE START CAMERA. The Start / End toggle showed the two
     ends of the sweep as two separate pictures, which said nothing about what
     lies between them. The sweep itself does: Play runs every frame the rig
     will shoot (the same frames as Scene preview), and the increment arrows
     step through each stop along the climb. */
  const viewCam = ends?.start ?? camera;
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

  /** How far round the arc the view has been turned, in degrees from the
   *  camera's own heading. Clamped to the sweep the rig actually shoots. */
  const [turn, setTurn] = useState(0);
  const sweep = rig ? orbitSweep(rig.orbitStart, rig.orbitEnd) : 360;
  const canTurn = !!master && !!rig;
  const t = Math.min(Math.max(0, turn), sweep);
  const turnTo = (deg: number) => {
    setPlaying(false);
    setTurn(Math.min(Math.max(0, deg), sweep));
  };

  const [idx, setIdxRaw] = useState(0);
  const clamped = Math.min(idx, Math.max(0, stops.length - 1));
  const stop = stops[clamped] ?? null;

  /* THE SWEEP: increments (stops along the climb from near to far) and the
     frames shot at each, planned exactly as the run and Scene preview plan
     them. */
  const rs = rigState(scene);
  const plan =
    rs.hasRig && rs.start && rs.end && rs.rig
      ? planCapture(atDistance(rs.target, rs.start.position, rs.nearDistance), rs.end.position, rs.rig)
      : null;
  const passes = plan?.passes ?? [];
  const shotsPerPass = Math.max(1, plan?.shotsPerPass ?? 1);
  const totalFrames = Math.max(1, plan?.totalFrames ?? 1);
  /** which increment the view stands at; null = the zoom stop's own reach */
  const [inc, setInc] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    if (!playing || totalFrames <= 1) return;
    const id = window.setInterval(() => setFrame((f) => (f + 1) % totalFrames), 220);
    return () => window.clearInterval(id);
  }, [playing, totalFrames]);
  /** Pause where it is: the view keeps that increment and that angle. */
  const togglePlay = () => {
    if (playing) {
      setPlaying(false);
      if (passes.length > 1) setInc(Math.floor(frame / shotsPerPass) % passes.length);
      setTurn(Math.min((frame % shotsPerPass) * (360 / shotsPerPass), sweep));
    } else {
      // From where the view stands now: that increment, from its first shot.
      setFrame((inc ?? 0) * shotsPerPass);
      setPlaying(true);
    }
  };
  const halt = () => setPlaying(false);
  const step = (d: number) => {
    // Zoom and increment are two settings, not two modes: stepping the zoom
    // keeps the increment the view stands at.
    halt();
    setIdxRaw((i) => Math.min(Math.max(0, Math.min(i, stops.length - 1) + d), Math.max(0, stops.length - 1)));
  };
  const stepInc = (d: number) => {
    halt();
    setInc((i) => Math.min(Math.max(0, (i ?? 0) + d), passes.length - 1));
  };

  /* Zoom first, then turn: the stop decides how far out the camera stands, and
     the turn walks that reach around the master. `orbitPoint` keeps the height
     and the ground radius it is handed, so turning never re-frames the shot. */
  /* ZOOM × INCREMENT. The increment says where along the climb the camera
     stands; the zoom multiple pulls it in from there (2.2x = 2.2 times closer
     than that stop's own reach). With no increment picked, the zoom stop's
     reach is measured from the rig camera, as before. */
  const zoomMultiple = stop && far ? zoomOf(far, stop.near) : 1;
  const pullIn = (p: Vec3): Vec3 =>
    !master || zoomMultiple <= 1.0001 ? p : atDistance(target, p, vecDistance(target, p) / zoomMultiple);
  const zoomed: Vec3 =
    inc !== null && passes[inc]
      ? pullIn(passes[inc].position)
      : !master || !stop || stop.key === "rig"
        ? viewCam.position
        : atDistance(master.position, viewCam.position, stop.near);
  const sample = playing ? frameSample(rs, frame) : null;
  const shownInc = sample ? Math.floor(frame / shotsPerPass) % Math.max(1, passes.length) : inc;
  const position: Vec3 = sample
    ? pullIn(sample.position)
    : canTurn && t > 0
      ? orbitPoint(target, zoomed, azimuthOf(target, zoomed) + t)
      : zoomed;

  /* KEYS. Esc closes; + / − and up/down step a zoom stop; left/right turn
     around the arc. The two axes used to share the arrows, which left nothing
     for the turn and made ← an alias for "zoom out" — a second name for a
     control that already had one. Everything is stopped at the window in the
     capture phase, ahead of the editor's own shortcuts. */
  const stepRef = useRef(step);
  stepRef.current = step;
  const turnRef = useRef(turnTo);
  turnRef.current = turnTo;
  const turnNow = useRef(t);
  turnNow.current = t;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const k = e.key;
      if (k === "Escape") onClose();
      else if (k === "+" || k === "=" || k === "ArrowUp") stepRef.current(1);
      else if (k === "-" || k === "_" || k === "ArrowDown") stepRef.current(-1);
      else if (k === "ArrowRight") turnRef.current(turnNow.current + TURN_STEP);
      else if (k === "ArrowLeft") turnRef.current(turnNow.current - TURN_STEP);
      e.preventDefault();
      e.stopImmediatePropagation();
    };
    window.addEventListener("keydown", onKey, { capture: true });
    return () => window.removeEventListener("keydown", onKey, { capture: true });
  }, [onClose]);

  /* DRAG THE PICTURE TO TURN. Pointer capture rather than window listeners, so
     a drag that leaves the panel still tracks and still ends. */
  const drag = useRef<{ x: number; from: number } | null>(null);
  const onPointerDown = (e: React.PointerEvent) => {
    if (!canTurn) return;
    drag.current = { x: e.clientX, from: t };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (d) turnTo(d.from + (e.clientX - d.x) * DEG_PER_PX);
  };
  const onPointerUp = (e: React.PointerEvent) => {
    if (!drag.current) return;
    drag.current = null;
    e.currentTarget.releasePointerCapture?.(e.pointerId);
  };

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

  const tint = CAMERA_RIG.start;
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

          <span className="ml-auto" />
          <GlassGhostButton ui="camera-view-close" size="sm" icon="close" label="Close (Esc)" onClick={onClose} />
        </header>

        <div
          className={cn(
            "relative aspect-[16/10] touch-none bg-black/50",
            canTurn && (drag.current ? "cursor-grabbing" : "cursor-grab")
          )}
          onWheel={onWheel}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
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

          {/* What the view is set to: the zoom, the increment when one is
              picked, and the camera's actual distance from the master. */}
          {master && stop && (
            <div className="pointer-events-none absolute left-3 top-3 rounded-lg bg-black/45 px-2.5 py-1.5 backdrop-blur-sm">
              <div data-ui="camera-view-readout" className="type-panel-title text-white">
                {formatZoom(zoomMultiple)}
                {shownInc !== null && passes[shownInc] && passes.length > 1 && (
                  <span className="text-white/85"> · Increment {shownInc + 1} of {passes.length}</span>
                )}
              </div>
              <div className="type-caption text-white/70">
                {vecDistance(master.position, position).toFixed(1)} m from {master.name}
                {sample ? ` · frame ${frame + 1} of ${totalFrames}` : t > 0 ? ` · turned ${Math.round(t)}°` : ""}
              </div>
            </div>
          )}
        </div>

        <footer className="flex flex-col gap-2 px-3 py-3">
          {stops.length > 0 ? (
            <>
              {/* ZOOM AND INCREMENTS, as two steppers side by side: − / + walks
                  the zoom stops (rig framing, saved zoom sets, Zoom Distance),
                  ‹ / › walks the increments along the climb. */}
              <div className="flex flex-wrap items-center gap-2">
                <div
                  data-ui="camera-view-zoom"
                  role="group"
                  aria-label="Zoom"
                  className="flex items-center gap-1 rounded-lg border border-glass/12 p-0.5"
                >
                  <GlassGhostButton
                    ui="camera-view-zoom-out"
                    size="sm"
                    icon="zoom-out"
                    label="Zoom out"
                    disabled={!canOut}
                    onClick={() => step(-1)}
                  />
                  {/* Just the multiple: what the stop is (rig framing, a zoom set,
                      Zoom Distance) is in the button's title on hover. */}
                  <span
                    data-ui="camera-view-zoom-value"
                    title={stop ? `${stop.note}${stop.outOfRun ? " · not in run" : ""}` : undefined}
                    className="type-caption-strong min-w-[40px] text-center tabular-nums text-content"
                  >
                    {stop && far ? formatZoom(zoomOf(far, stop.near)) : stop?.title}
                  </span>
                  <GlassGhostButton
                    ui="camera-view-zoom-in"
                    size="sm"
                    icon="zoom-in"
                    label="Zoom in"
                    disabled={!canIn}
                    onClick={() => step(1)}
                  />
                </div>
              {/* Each increment's view, one at a time — only when the rig has more than one. */}
              {passes.length > 1 && (
                <div
                  data-ui="camera-view-increments"
                  role="group"
                  aria-label="Increments"
                  className="flex items-center gap-1 rounded-lg border border-glass/12 p-0.5"
                >
                  <GlassGhostButton
                    ui="camera-view-inc-prev"
                    size="sm"
                    icon="chevron-left"
                    label="Previous increment"
                    disabled={(shownInc ?? 0) <= 0 && shownInc !== null}
                    onClick={() => stepInc(shownInc === null ? 0 : -1)}
                  />
                  <span
                    data-ui="camera-view-inc-value"
                    title="Increment"
                    aria-label={shownInc === null ? "No increment selected" : `Increment ${shownInc + 1} of ${passes.length}`}
                    className="type-caption-strong min-w-[40px] text-center tabular-nums text-content"
                  >
                    {shownInc === null ? "–" : shownInc + 1} / {passes.length}
                  </span>
                  <GlassGhostButton
                    ui="camera-view-inc-next"
                    size="sm"
                    icon="chevron-right"
                    label="Next increment"
                    disabled={shownInc !== null && shownInc >= passes.length - 1}
                    onClick={() => stepInc(shownInc === null ? 0 : 1)}
                  />
                </div>
              )}
              </div>
              {canTurn && (
                <div className="flex items-center gap-2">
                  {/* Play the sweep, as in Scene preview: every frame the rig shoots. */}
                  <button
                    type="button"
                    aria-label={playing ? "Pause sweep" : "Play sweep"}
                    data-ui="camera-view-play"
                    disabled={totalFrames <= 1}
                    onClick={togglePlay}
                    className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-glass/12 bg-glass/8 text-content-muted transition-colors hover:text-content disabled:pointer-events-none disabled:opacity-40"
                  >
                    <Icon name={playing ? "pause" : "preview"} size={14} />
                  </button>
                  <GlassGhostButton
                    ui="camera-view-turn-back"
                    size="sm"
                    icon="chevron-left"
                    label="Turn back toward the start of the arc"
                    disabled={t <= 0}
                    onClick={() => turnTo(t - TURN_STEP)}
                  />
                  <div className="flex min-w-0 flex-1 items-center gap-2.5">
                    <input
                      type="range"
                      aria-label={`Turn around ${master?.name ?? "the master"}`}
                      data-ui="camera-view-turn"
                      min={0}
                      max={Math.round(sweep)}
                      step={1}
                      value={Math.round(sample ? Math.min((frame % shotsPerPass) * (360 / shotsPerPass), sweep) : t)}
                      onChange={(e) => turnTo(parseFloat(e.target.value))}
                      className="h-1 min-w-0 flex-1 cursor-pointer accent-brand"
                    />
                    {/* The arc, not just the angle: "120° of 300°" says both
                        where you are and how much the run actually sweeps. */}
                    <span className="type-caption shrink-0 tabular-nums text-content-subtle">
                      <span className="text-content">
                        {Math.round(sample ? Math.min((frame % shotsPerPass) * (360 / shotsPerPass), sweep) : t)}°
                      </span>{" "}
                      of {Math.round(sweep)}°
                    </span>
                    <button
                      type="button"
                      data-ui="camera-view-turn-reset"
                      disabled={t <= 0}
                      onClick={() => turnTo(0)}
                      className="type-caption shrink-0 text-content-subtle underline-offset-2 transition-colors hover:text-content hover:underline disabled:opacity-40 disabled:hover:no-underline disabled:hover:text-content-subtle"
                    >
                      Reset
                    </button>
                  </div>
                  <GlassGhostButton
                    ui="camera-view-turn-on"
                    size="sm"
                    icon="chevron-right"
                    label="Turn further around the arc"
                    disabled={t >= sweep}
                    onClick={() => turnTo(t + TURN_STEP)}
                  />
                </div>
              )}
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
