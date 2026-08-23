import { useRef, useState, type ReactNode } from "react";
import {
  CanvasTexture,
  Group,
  MathUtils,
  Quaternion,
  SRGBColorSpace,
  Vector3,
} from "three";
import { useFrame, useThree } from "@react-three/fiber";
import { useGizmoContext } from "@react-three/drei";
import { VIEWCUBE } from "./scene-palette";

/**
 * ViewCube — the orientation cube in the top-right corner.
 *
 * Replaces drei's GizmoViewcube, whose face texture is fixed at a flat fill
 * plus a 1px rectangle: an opaque grey box that reads as a placeholder next to
 * the rest of the chrome. This draws each face as a rounded glass panel instead
 * — dark ink, hairline stroke, top specular — so the cube is made of the same
 * material as every other ornament floating over the scene.
 *
 * The rounded corners are the point, not decoration. Faces are FrontSide-only,
 * so back faces are culled and the gaps between adjacent panels show the scene
 * straight through: the silhouette reads as a chamfered cube rather than a
 * solid block, and the ornament stops competing with the viewport.
 *
 * Around the cube sits the orientation ring — four step arrows and two
 * turntable arcs, screen-aligned, in the CAD idiom. See `OrientationRing`.
 *
 * Click a face, edge or corner to tween the camera to that view — the same
 * behaviour drei provides, via the gizmo context it exposes.
 */

/** Box material slots in order: +X, −X, +Y, −Y, +Z, −Z. */
const FACES = ["Right", "Left", "Top", "Bottom", "Front", "Back"] as const;

const TEXTURE_SIZE = 256;

/** Corner and edge hit targets, positioned on the unit cube's shell. */
const scaled = (xyz: number[]) => new Vector3(...xyz).multiplyScalar(0.38);
const CORNERS = [
  [1, 1, 1], [1, 1, -1], [1, -1, 1], [1, -1, -1],
  [-1, 1, 1], [-1, 1, -1], [-1, -1, 1], [-1, -1, -1],
].map(scaled);
const CORNER_SIZE: [number, number, number] = [0.25, 0.25, 0.25];

const EDGES = [
  [1, 1, 0], [1, 0, 1], [1, 0, -1], [1, -1, 0],
  [0, 1, 1], [0, 1, -1], [0, -1, 1], [0, -1, -1],
  [-1, 1, 0], [-1, 0, 1], [-1, 0, -1], [-1, -1, 0],
].map(scaled);
const EDGE_SIZES = EDGES.map(
  (e) => e.toArray().map((axis) => (axis === 0 ? 0.5 : 0.25)) as [number, number, number]
);

function roundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/**
 * What a face is doing right now.
 *
 *   idle    — nothing to say
 *   near    — the camera is closest to this view, but off its axis
 *   active  — the camera is ON this axis: this is the view you're in
 *   hover   — the pointer is on it, and clicking would go here
 *
 * Ordered by how loudly each is drawn. Hover is last because it answers the
 * pointer and has to beat the ambient state underneath it.
 */
type FaceState = "idle" | "near" | "active" | "hover";

/** Fill / edge per state. Idle keeps the specular wash; the lit states drop it,
 *  because a white gradient over brand ink just desaturates the highlight. */
const FACE_INK: Record<FaceState, { fill: string; stroke: string; specular: boolean }> = {
  idle: { fill: VIEWCUBE.face, stroke: VIEWCUBE.stroke, specular: true },
  near: { fill: VIEWCUBE.nearFace, stroke: VIEWCUBE.nearStroke, specular: true },
  active: { fill: VIEWCUBE.activeFace, stroke: VIEWCUBE.activeStroke, specular: false },
  hover: { fill: VIEWCUBE.hoverFace, stroke: VIEWCUBE.hoverStroke, specular: false },
};

/**
 * One face, drawn as a glass panel, in whichever state it's in.
 *
 * The pad and radius are tuned against a CAD view cube: a narrow gap and a
 * chamfer-sized corner, so three faces read as one solid with its corners taken
 * off. Wider gaps and a fatter radius turned it into three separate panels
 * floating in formation, which is not a cube.
 */
function faceTexture(label: string, state: FaceState): CanvasTexture {
  const ink = FACE_INK[state];
  const lit = state === "hover" || state === "active";

  const s = TEXTURE_SIZE;
  const canvas = document.createElement("canvas");
  canvas.width = s;
  canvas.height = s;
  const ctx = canvas.getContext("2d")!;

  const pad = 5;
  const size = s - pad * 2;
  const radius = 26;

  roundedRect(ctx, pad, pad, size, size, radius);
  ctx.fillStyle = ink.fill;
  ctx.fill();

  // Top specular — the same light-from-above cue the glass panels carry, which
  // is what stops the face reading as flat paint.
  if (ink.specular) {
    const wash = ctx.createLinearGradient(0, pad, 0, pad + size * 0.6);
    wash.addColorStop(0, VIEWCUBE.specular);
    wash.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = wash;
    ctx.fill();
  }

  ctx.lineWidth = 3;
  ctx.strokeStyle = ink.stroke;
  ctx.stroke();

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = lit ? VIEWCUBE.hoverText : VIEWCUBE.text;
  // Tracked, uppercase, semibold — the `type-eyebrow` role, drawn by hand
  // because a canvas texture can't take a CSS class. Sized to sit inside the
  // face with air around it, the way a CAD cube labels itself; the old 44px
  // ran to the chamfer and made the label, not the cube, the object.
  const tracking = 3;
  ctx.font = "500 34px 'Manrope Variable', Manrope, system-ui, sans-serif";
  if ("letterSpacing" in ctx) ctx.letterSpacing = `${tracking}px`;
  if (!lit) {
    ctx.shadowColor = VIEWCUBE.textShadow;
    ctx.shadowBlur = 8;
  }
  // Canvas adds the letter-space after the final glyph too, so centred text
  // ends up half a space to the left. Push it back.
  ctx.fillText(label.toUpperCase(), s / 2 + tracking / 2, s / 2 + 1);
  ctx.shadowBlur = 0;

  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

/**
 * Six faces × four states is 24 textures for the life of the page. Caching them
 * matters more now than it did with a single hover flag: the current-view state
 * changes on every orbit that crosses a face boundary, and re-rasterising a
 * 256px canvas on each of those is work that never needed doing twice.
 */
const faceCache = new Map<string, CanvasTexture>();

function cachedFaceTexture(index: number, state: FaceState): CanvasTexture {
  const key = `${index}:${state}`;
  const hit = faceCache.get(key);
  if (hit) return hit;
  const texture = faceTexture(FACES[index], state);
  faceCache.set(key, texture);
  return texture;
}

function FaceMaterial({ index, state }: { index: number; state: FaceState }) {
  const gl = useThree((s) => s.gl);
  return (
    <meshBasicMaterial
      attach={`material-${index}`}
      map={cachedFaceTexture(index, state)}
      map-anisotropy={gl.capabilities.getMaxAnisotropy() || 1}
      transparent
      toneMapped={false}
    />
  );
}

function FaceCube({ current }: { current: CurrentView | null }) {
  const { tweenCamera } = useGizmoContext();
  const [hover, setHover] = useState<number | null>(null);

  const stateFor = (i: number): FaceState => {
    if (hover === i) return "hover";
    if (current?.index !== i) return "idle";
    return current.snapped ? "active" : "near";
  };

  return (
    <mesh
      onPointerOut={(e) => {
        e.stopPropagation();
        setHover(null);
      }}
      onPointerMove={(e) => {
        e.stopPropagation();
        setHover(Math.floor((e.faceIndex ?? 0) / 2));
      }}
      onClick={(e) => {
        e.stopPropagation();
        if (e.face) tweenCamera(e.face.normal);
      }}
    >
      {FACES.map((_, i) => (
        <FaceMaterial key={i} index={i} state={stateFor(i)} />
      ))}
      <boxGeometry />
    </mesh>
  );
}

/** Edge and corner targets — the diagonal views. Only shown while pointed at. */
function ShellTarget({
  position,
  dimensions,
}: {
  position: Vector3;
  dimensions: [number, number, number];
}) {
  const { tweenCamera } = useGizmoContext();
  const [hover, setHover] = useState(false);
  return (
    <mesh
      scale={1.01}
      position={position}
      onPointerOver={(e) => {
        e.stopPropagation();
        setHover(true);
      }}
      onPointerOut={(e) => {
        e.stopPropagation();
        setHover(false);
      }}
      onClick={(e) => {
        e.stopPropagation();
        tweenCamera(position);
      }}
    >
      <meshBasicMaterial
        color={VIEWCUBE.hoverAccent}
        transparent
        opacity={0.85}
        visible={hover}
        toneMapped={false}
      />
      <boxGeometry args={dimensions} />
    </mesh>
  );
}

/* ------------------------------------------------------------------------- */
/*  Orientation ring                                                          */
/* ------------------------------------------------------------------------- */

/**
 * The ring is one texture, not six meshes, because the arcs and the arrowheads
 * have to agree about a shared centre — they're all struck from the cube's
 * middle. Authoring them in one canvas keeps that geometry honest; the hover
 * state just redraws it with one indicator lit (7 variants, cached for good).
 */
type Indicator = "up" | "down" | "left" | "right" | "spinLeft" | "spinRight";

/** Screen direction each step arrow points, degrees, 0° = screen right. */
const STEP_ARROWS = [
  { kind: "right", angle: 0 },
  { kind: "up", angle: 90 },
  { kind: "left", angle: 180 },
  { kind: "down", angle: 270 },
] as const;

/** The turntable arcs. `to` is the end that carries the arrowhead. */
const SPIN_ARCS = [
  { kind: "spinLeft", from: 100, to: 152 },
  { kind: "spinRight", from: 80, to: 28 },
] as const;

/**
 * Ring geometry, in cube units — the cube itself is 1 unit across.
 *
 * Everything clears 0.82, which is how far the cube's own corner reaches once
 * it's turned to an isometric view (a unit cube's projected silhouette has a
 * circumradius of 0.816). Inside that, the arcs would be drawn over the faces.
 */
const RING_UNITS = 2.8;
const RING_PX = 512;
const ARC_R = 0.96;
const ARC_WIDTH = 0.032;
const TRI_BASE = 1.1;
export const TRI_TIP = 1.28;
const TRI_HALF = 0.125;
/** In front of the cube's furthest corner, so the ring never clips into it. */
const RING_Z = 1.0;

const PX = RING_PX / RING_UNITS;
const px = (x: number) => RING_PX / 2 + x * PX;
const py = (y: number) => RING_PX / 2 - y * PX;

function inkStyle(ctx: CanvasRenderingContext2D, hover: boolean) {
  ctx.fillStyle = hover ? VIEWCUBE.hoverFace : VIEWCUBE.indicatorFill;
  ctx.strokeStyle = hover ? VIEWCUBE.hoverStroke : VIEWCUBE.indicatorStroke;
  // Same trick the face labels use: a soft dark halo is what keeps a 14px glyph
  // readable when the sky behind it is blown out.
  ctx.shadowColor = VIEWCUBE.textShadow;
  ctx.shadowBlur = 6;
}

/** One step arrow: a triangle pointing out along `deg`. */
function drawStep(ctx: CanvasRenderingContext2D, deg: number, hover: boolean) {
  const t = MathUtils.degToRad(deg);
  const dx = Math.cos(t);
  const dy = Math.sin(t);
  // The base runs across the pointing direction.
  const nx = -dy;
  const ny = dx;

  ctx.beginPath();
  ctx.moveTo(px(dx * TRI_TIP), py(dy * TRI_TIP));
  ctx.lineTo(px(dx * TRI_BASE + nx * TRI_HALF), py(dy * TRI_BASE + ny * TRI_HALF));
  ctx.lineTo(px(dx * TRI_BASE - nx * TRI_HALF), py(dy * TRI_BASE - ny * TRI_HALF));
  ctx.closePath();

  inkStyle(ctx, hover);
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.lineJoin = "round";
  ctx.stroke();
  ctx.shadowBlur = 0;
}

/** One turntable arc: a struck arc with a head on the `to` end. */
function drawSpin(ctx: CanvasRenderingContext2D, from: number, to: number, hover: boolean) {
  const a0 = MathUtils.degToRad(from);
  const a1 = MathUtils.degToRad(to);
  const ccw = to > from;

  inkStyle(ctx, hover);
  ctx.beginPath();
  // Canvas y runs down, so a screen-space angle θ is drawn at −θ and the sweep
  // direction flips with it.
  ctx.arc(px(0), py(0), ARC_R * PX, -a0, -a1, ccw);
  ctx.lineWidth = ARC_WIDTH * PX;
  ctx.lineCap = "round";
  ctx.strokeStyle = hover ? VIEWCUBE.hoverStroke : VIEWCUBE.arc;
  ctx.stroke();

  // Head, aimed down the tangent at the end the sweep arrives at.
  const sign = ccw ? 1 : -1;
  const tx = -Math.sin(a1) * sign;
  const ty = Math.cos(a1) * sign;
  const ex = Math.cos(a1) * ARC_R;
  const ey = Math.sin(a1) * ARC_R;
  const head = 0.15;
  const half = 0.09;

  ctx.beginPath();
  ctx.moveTo(px(ex + tx * head), py(ey + ty * head));
  ctx.lineTo(px(ex + Math.cos(a1) * half), py(ey + Math.sin(a1) * half));
  ctx.lineTo(px(ex - Math.cos(a1) * half), py(ey - Math.sin(a1) * half));
  ctx.closePath();
  ctx.fillStyle = hover ? VIEWCUBE.hoverFace : VIEWCUBE.indicatorFill;
  ctx.strokeStyle = hover ? VIEWCUBE.hoverStroke : VIEWCUBE.arc;
  ctx.lineWidth = 3;
  ctx.lineJoin = "round";
  ctx.fill();
  ctx.stroke();
  ctx.shadowBlur = 0;
}

const ringCache = new Map<string, CanvasTexture>();

function ringTexture(hover: Indicator | null): CanvasTexture {
  const key = hover ?? "none";
  const cached = ringCache.get(key);
  if (cached) return cached;

  const canvas = document.createElement("canvas");
  canvas.width = RING_PX;
  canvas.height = RING_PX;
  const ctx = canvas.getContext("2d")!;
  for (const arrow of STEP_ARROWS) drawStep(ctx, arrow.angle, hover === arrow.kind);
  for (const arc of SPIN_ARCS) drawSpin(ctx, arc.from, arc.to, hover === arc.kind);

  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  ringCache.set(key, texture);
  return texture;
}

const WORLD_UP = new Vector3(0, 1, 0);
const AXES = [
  [1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1],
].map((a) => new Vector3(...a));

/** Which face is lit, and whether the camera is actually on its axis. */
export interface CurrentView {
  /** index into FACES / the box's material slots */
  index: number;
  /** on that axis within a degree or so — "in this view", not "nearest to it" */
  snapped: boolean;
}

/**
 * Reports the face the camera is looking down.
 *
 * Runs on the render loop but only calls back when the answer changes, so a
 * slow orbit re-renders the cube at the two moments it means something — when
 * the nearest face flips, and when the view snaps onto an axis — rather than
 * sixty times a second.
 *
 * It reads the MAIN camera off the controls, not `useThree`: this component
 * lives inside GizmoHelper's HUD scene, whose camera is the little orthographic
 * one that draws the cube. Asking that camera where it's looking from always
 * answers "straight down −Z", which is true and useless.
 */
function CurrentViewProbe({
  controlsRef,
  onChange,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  controlsRef?: React.MutableRefObject<any>;
  onChange: (v: CurrentView | null) => void;
}) {
  const last = useRef<string>("");
  const dir = useRef(new Vector3());

  useFrame(() => {
    const controls = controlsRef?.current;
    if (!controls) return;

    dir.current.copy(controls.object.position).sub(controls.target);
    if (dir.current.lengthSq() === 0) return;
    dir.current.normalize();

    let index = 0;
    let bestDot = -Infinity;
    for (let i = 0; i < AXES.length; i += 1) {
      const dot = AXES[i].dot(dir.current);
      if (dot > bestDot) {
        bestDot = dot;
        index = i;
      }
    }

    const next: CurrentView = { index, snapped: bestDot > 0.9995 };
    const key = `${next.index}:${next.snapped}`;
    if (key === last.current) return;
    last.current = key;
    onChange(next);
  });

  return null;
}

/** The axis view a direction is closest to — how a step lands on a face. */
function nearestAxis(v: Vector3) {
  let best = AXES[0];
  let bestDot = -Infinity;
  for (const axis of AXES) {
    const dot = axis.dot(v);
    if (dot > bestDot) {
      bestDot = dot;
      best = axis;
    }
  }
  return best.clone();
}

/** Degrees an arc click turns the turntable. */
const SPIN_STEP = Math.PI / 4;

/**
 * What the six indicators do.
 *
 * The four arrows STEP between faces: snap to the nearest axis view first, turn
 * 90° that way, snap again — so repeated clicks walk cleanly around the cube
 * instead of accumulating drift from a diagonal start.
 *
 * The two arcs SPIN the turntable 45° about the world vertical, holding the
 * current elevation. That's deliberately not what a CAD cube does with them —
 * there they roll the view — but a roll can't survive this rig: GizmoHelper
 * resets `camera.up` when its tween lands, and OrbitControls' polar clamp would
 * yank the camera the moment its up vector left vertical. A turntable spin is
 * the useful thing the arcs can actually deliver, and it's the one control here
 * that works from an off-axis view.
 */
function useIndicatorAction(controlsRef?: React.MutableRefObject<any>) {
  const { tweenCamera } = useGizmoContext();

  return (kind: Indicator) => {
    const controls = controlsRef?.current;
    if (!controls) return;
    const camera = controls.object;
    camera.updateMatrixWorld();

    const view = new Vector3().subVectors(camera.position, controls.target).normalize();

    if (kind === "spinLeft" || kind === "spinRight") {
      const spin = kind === "spinLeft" ? -SPIN_STEP : SPIN_STEP;
      tweenCamera(view.applyAxisAngle(WORLD_UP, spin).normalize());
      return;
    }

    // Screen axes, read off the camera's world matrix.
    const right = new Vector3().setFromMatrixColumn(camera.matrixWorld, 0).normalize();
    const up = new Vector3().setFromMatrixColumn(camera.matrixWorld, 1).normalize();
    const axis = kind === "left" || kind === "right" ? up : right;
    const angle = kind === "right" || kind === "down" ? Math.PI / 2 : -Math.PI / 2;
    tweenCamera(nearestAxis(nearestAxis(view).applyAxisAngle(axis, angle)));
  };
}

/**
 * Pins its children to the screen inside the tumbling gizmo group.
 *
 * GizmoHelper drives that group to the inverse of the main camera's rotation
 * every frame — that's what makes the cube tumble. The ring must not tumble
 * with it: an arrow labelled "up" has to keep pointing up the screen.
 *
 * It takes the group's world matrix over rather than writing an inverse into its
 * local quaternion. An inverse is only right if it's computed against the same
 * rotation the renderer ends up drawing with, and both that rotation and this
 * correction are written from `useFrame` callbacks — one ordering apart. Landing
 * on the wrong side of it left the ring a whole 180° out in top view, where the
 * camera's roll flips as the tween resets `camera.up`. Composing the matrix from
 * the parent's position and scale with the rotation simply left out can't be a
 * frame behind anything: there's no rotation in it to be stale.
 */
const IDENTITY = new Quaternion();
const worldPos = new Vector3();
const worldScale = new Vector3();
const dropped = new Quaternion();

function ScreenAligned({ children }: { children: ReactNode }) {
  const group = useRef<Group>(null);

  useFrame(() => {
    const self = group.current;
    if (!self?.parent) return;
    // Ours now — the renderer must not recompose it from the parent, which is
    // where the rotation we're dropping comes from.
    self.matrixWorldAutoUpdate = false;
    self.parent.updateWorldMatrix(true, false);
    self.parent.matrixWorld.decompose(worldPos, dropped, worldScale);
    self.matrixWorld.compose(worldPos, IDENTITY, worldScale);
  });

  return <group ref={group}>{children}</group>;
}

/** An invisible click target. The drawn ring is one texture and takes no hits. */
function HitTarget({
  position,
  rotation,
  size,
  onOver,
  onOut,
  onSelect,
}: {
  position: [number, number, number];
  rotation: number;
  size: [number, number];
  onOver: () => void;
  onOut: () => void;
  onSelect: () => void;
}) {
  return (
    <mesh
      position={position}
      rotation={[0, 0, rotation]}
      onPointerOver={(e) => {
        e.stopPropagation();
        onOver();
      }}
      onPointerOut={(e) => {
        e.stopPropagation();
        onOut();
      }}
      onClick={(e) => {
        e.stopPropagation();
        onSelect();
      }}
    >
      <planeGeometry args={size} />
      <meshBasicMaterial transparent opacity={0} depthWrite={false} />
    </mesh>
  );
}

const STEP_HIT_R = (TRI_BASE + TRI_TIP) / 2;
const STEP_HIT: [number, number] = [0.34, 0.34];
/** The arcs get a straight rect across the chord — close enough at this size. */
const SPIN_HIT: [number, number] = [0.86, 0.26];

function OrientationRing({ controlsRef }: { controlsRef?: React.MutableRefObject<any> }) {
  const gl = useThree((s) => s.gl);
  const [hover, setHover] = useState<Indicator | null>(null);
  const act = useIndicatorAction(controlsRef);

  return (
    <group position={[0, 0, RING_Z]}>
      <mesh raycast={() => null} renderOrder={2}>
        <planeGeometry args={[RING_UNITS, RING_UNITS]} />
        <meshBasicMaterial
          map={ringTexture(hover)}
          map-anisotropy={gl.capabilities.getMaxAnisotropy() || 1}
          transparent
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>

      {STEP_ARROWS.map(({ kind, angle }) => {
        const t = MathUtils.degToRad(angle);
        return (
          <HitTarget
            key={kind}
            position={[Math.cos(t) * STEP_HIT_R, Math.sin(t) * STEP_HIT_R, 0]}
            rotation={0}
            size={STEP_HIT}
            onOver={() => setHover(kind)}
            onOut={() => setHover((h) => (h === kind ? null : h))}
            onSelect={() => act(kind)}
          />
        );
      })}

      {SPIN_ARCS.map(({ kind, from, to }) => {
        const mid = MathUtils.degToRad((from + to) / 2);
        return (
          <HitTarget
            key={kind}
            position={[Math.cos(mid) * ARC_R, Math.sin(mid) * ARC_R, 0]}
            // Lie the rect along the arc's tangent at its midpoint.
            rotation={mid + Math.PI / 2}
            size={SPIN_HIT}
            onOver={() => setHover(kind)}
            onOut={() => setHover((h) => (h === kind ? null : h))}
            onSelect={() => act(kind)}
          />
        );
      })}
    </group>
  );
}

/**
 * GizmoHelper renders its children in a HUD scene whose orthographic camera is
 * sized in PIXELS — one world unit is one screen pixel. A unit boxGeometry is
 * therefore a 1px speck; the group scale is what gives the cube its on-screen
 * size. Well under drei's stock 60: the glass faces carry less visual weight
 * than its opaque ones, so the same footprint reads heavier — and the ring of
 * arrows around the cube means the ornament's real footprint is ~2.6× this
 * number, which is what has to stay modest in the corner.
 *
 * The GizmoHelper margin in SceneCanvas is derived from this. Change it here
 * and change it there, or the ornament stops lining up with the left rail.
 */
export const CUBE_PX = 40;

export function ViewCube({ controlsRef }: { controlsRef?: React.MutableRefObject<any> }) {
  const [current, setCurrent] = useState<CurrentView | null>(null);

  return (
    <group scale={[CUBE_PX, CUBE_PX, CUBE_PX]}>
      <CurrentViewProbe controlsRef={controlsRef} onChange={setCurrent} />
      <FaceCube current={current} />
      {CORNERS.map((position, i) => (
        <ShellTarget key={`corner-${i}`} position={position} dimensions={CORNER_SIZE} />
      ))}
      {EDGES.map((position, i) => (
        <ShellTarget key={`edge-${i}`} position={position} dimensions={EDGE_SIZES[i]} />
      ))}
      <ScreenAligned>
        <OrientationRing controlsRef={controlsRef} />
      </ScreenAligned>
    </group>
  );
}
