import { useMemo, useRef, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Html, Line } from "@react-three/drei";
import { DoubleSide, Plane, Raycaster, Vector3, type Ray } from "three";
import { AXIS, VOLUME, READOUT } from "./scene-palette";
import { dollyStep, edgeStrength } from "./viewport-dolly";
import {
  DEFAULT_VOLUME_HEIGHT,
  MIN_VOLUME_SIDE,
  WALL_AXIS,
  WALL_IDS,
  localBounds,
  toLocal,
  toWorld,
  type SceneVolume,
  type Vec3,
  type WallId,
} from "./scene-volume";

/**
 * THE VOLUME, IN THE VIEWPORT.
 * ------------------------------------------------------------------
 * Three things live here, in the order you meet them:
 *
 *   · `VolumeDraw`    — define mode. Drag a rectangle on the ground, then move
 *                       the pointer up to raise it, then click.
 *   · `VolumeBox`     — the box itself: footprint, edges, any walls switched on.
 *   · `VolumeHandles` — nine grips that resize it.
 *
 * WHY THE BOX IS ALWAYS DRAWN. The tool this is modelled on defines its space
 * with three number fields and never draws it, which is exactly why its
 * generated rooms spill outside their own footprint without anybody noticing.
 * An invisible constraint is a constraint you cannot debug.
 *
 * EVERY DRAG HERE WORKS THE SAME WAY, and it is the way `ClimbGrip` already
 * does it in SceneCanvas: capture the pointer, resolve the ray against a PLANE
 * rather than against the handle's own geometry, and suspend OrbitControls for
 * the duration. `e.point` is not usable for this — it is where the ray met the
 * grab sphere, so it drifts by the sphere's radius and stops updating the moment
 * the pointer leaves it, while the drag is still going.
 */

const UP = new Vector3(0, 1, 0);

/** Grip size in metres. Big enough to hit, small enough not to hide the corner
 *  it marks — and floored so a 1 m cupboard-sized volume is still draggable. */
const gripSize = (v: SceneVolume) =>
  Math.max(0.14, Math.min(0.36, Math.min(v.size[0], v.size[2]) * 0.035));

/**
 * The twelve edges of an axis-aligned box, as point PAIRS.
 *
 * `<Line segments>` consumes its points two at a time, which is what lets one
 * component and one draw call carry a shape that isn't a single polyline.
 */
function boxEdges(min: Vec3, max: Vec3): [number, number, number][] {
  const [x0, y0, z0] = min;
  const [x1, y1, z1] = max;
  const ring = (y: number): [number, number, number][] => [
    [x0, y, z0], [x1, y, z0],
    [x1, y, z0], [x1, y, z1],
    [x1, y, z1], [x0, y, z1],
    [x0, y, z1], [x0, y, z0],
  ];
  return [
    ...ring(y0),
    ...ring(y1),
    [x0, y0, z0], [x0, y1, z0],
    [x1, y0, z0], [x1, y1, z0],
    [x1, y0, z1], [x1, y1, z1],
    [x0, y0, z1], [x0, y1, z1],
  ];
}

/* ====================================================== the edge dolly ==== */

/**
 * THE VIEWPORT BACKS OFF WHEN A DRAG RUNS OUT OF ROOM.
 * ------------------------------------------------------------------
 * Dragging a corner outward ends at the edge of the window: the pointer has
 * nowhere further to go, and the only way to keep enlarging the space is to let
 * go, orbit out by hand, find the same corner again and carry on. For a room
 * larger than the viewport can frame that is the entire interaction, repeated.
 *
 * So while a grip is held, a pointer inside the outer band of the viewport
 * dollies the camera away from the orbit target — continuously, faster the
 * closer to the edge it gets — and the drag keeps resolving against the new
 * camera. The corner doesn't stop; the world shrinks under it.
 *
 * IT ALSO RE-APPLIES THE DRAG EACH FRAME. Pointer events only fire when the
 * pointer MOVES, so a hand held still at the edge would watch the camera pull
 * back while the box stayed the size it was — the gesture would look broken at
 * exactly the moment it was working. Re-casting the stored pointer through the
 * moved camera is what keeps the corner glued to the cursor.
 */

const ORIGIN = new Vector3();

/**
 * @param active   a drag is in progress — nothing happens otherwise
 * @param reapply  resolve the drag again against a ray from the moved camera
 */
function useEdgeDolly(active: boolean, reapply: (ray: Ray) => void) {
  const camera = useThree((s) => s.camera);
  // R3F keeps this in NDC and updates it on every pointer move over the canvas,
  // pointer capture included — so there is no canvas rect to measure here.
  const pointer = useThree((s) => s.pointer);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const controls = useThree((s) => s.controls as any);
  const caster = useMemo(() => new Raycaster(), []);
  const offset = useMemo(() => new Vector3(), []);

  // Through a ref, so the frame callback can never hold a stale closure over
  // the drag state it is supposed to be advancing.
  const cb = useRef(reapply);
  cb.current = reapply;

  useFrame((_, delta) => {
    if (!active) return;
    const strength = edgeStrength(pointer.x, pointer.y);
    if (strength <= 0) return;

    const target = controls?.target ?? ORIGIN;
    offset.copy(camera.position).sub(target);
    const dist = offset.length();
    if (dist < 1e-6) return;

    // OrbitControls' own ceiling is the ceiling here too. `update()` re-derives
    // its spherical from the camera's actual position every call, so writing
    // the position directly leaves nothing stale behind for it to snap back to.
    const next = dollyStep(dist, strength, delta, controls?.maxDistance);
    if (next - dist < 1e-6) return;

    camera.position.copy(target).addScaledVector(offset.normalize(), next);
    controls?.update?.();

    caster.setFromCamera(pointer, camera);
    cb.current(caster.ray);
  });
}

/* ============================================================ the box ==== */

export function VolumeBox({
  volume,
  /** This is the space being worked on — it wears the accent and the handles. */
  selected = false,
  /** Faces to flash: an object is clamped against them right now. */
  contact,
  onSelect,
}: {
  volume: SceneVolume;
  selected?: boolean;
  contact?: WallId[];
  /** Click the footprint to focus this space. Omit for a read-only box. */
  onSelect?: () => void;
}) {
  // Everything below is drawn in the room's OWN frame and turned as one group,
  // so a rotated room is one transform rather than a rotation baked into every
  // quad's position — and the wall maths stays the maths the solver uses.
  const { min, max } = localBounds(volume);
  const [l, h, w] = volume.size;
  const [cx, cy, cz] = volume.center;
  const midY = cy + h / 2;

  const edges = useMemo(() => boxEdges(min, max), [min, max]);

  // Purple while you have hold of it, grey while you don't — see `VOLUME.idle`.
  // The unselected box steps back in COLOUR, not in visibility: dimming it as
  // well took it off the screen entirely over bright ground.
  const ink = selected ? VOLUME.edge : VOLUME.idle;
  const dim = selected ? 1 : 0.8;

  return (
    <group position={[cx, 0, cz]} rotation={[0, (volume.rotationY * Math.PI) / 180, 0]}>
      {/* ---------------------------------------------------- the footprint */}
      {/* Lifted a whisker off the floor plane. Coplanar with the ground it
          z-fights, and a flickering room reads as a rendering bug rather than
          as a boundary. */}
      {/* The footprint is also the hit target: a space is a thing in the scene,
          so clicking it is how you pick it up — the same gesture as any object.
          Without this the only way to focus one was a panel, which is not where
          anyone looks for the room they can see. */}
      <mesh
        position={[0, cy + 0.004, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        raycast={onSelect ? undefined : () => null}
        onClick={
          onSelect &&
          ((e) => {
            e.stopPropagation();
            onSelect();
          })
        }
        renderOrder={1}
      >
        <planeGeometry args={[l, w]} />
        <meshBasicMaterial
          color={selected ? VOLUME.floor : VOLUME.idle}
          transparent
          opacity={0.14 * dim}
          depthWrite={false}
          side={DoubleSide}
        />
      </mesh>

      {/* ------------------------------------------------------- the edges */}
      {/* drei's `Line`, not a raw `lineSegments`. WebGL renders `LineBasicMaterial`
          at one device pixel regardless of what `linewidth` says, and one pixel
          of indigo over a photographic HDRI is invisible on any display with a
          dpr above 1 — the box was there and could not be seen. `Line` is Line2,
          which extrudes the segment into screen-space quads and honours a real
          width. It is the same primitive the camera guide rings already use. */}
      <Line
        points={edges}
        segments
        color={ink}
        lineWidth={selected ? 2.2 : 1.7}
        transparent
        opacity={0.95 * dim}
        raycast={() => null}
        renderOrder={2}
      />

      {/* -------------------------------------------------------- the walls */}
      {/* A CONTACTED FACE DRAWS EVEN WITH ITS WALL OFF. The amber quad is the
          answer to "why did the gizmo stop moving", and that question is asked
          most often about an open face — where there is no wall to light and
          nothing but a hairline edge to show what was hit. */}
      {WALL_IDS.filter((id) => volume.showWalls || contact?.includes(id)).map((id) => {
        const { axis, sign } = WALL_AXIS[id];
        // A wall stands on the face its id names; the other footprint axis
        // gives it its width.
        const at: Vec3 = [0, midY, 0];
        at[axis] = sign < 0 ? min[axis] : max[axis];
        const spanning = axis === 0 ? w : l;
        return (
          <mesh
            key={id}
            position={at}
            rotation={axis === 0 ? [0, Math.PI / 2, 0] : [0, 0, 0]}
            raycast={() => null}
            renderOrder={1}
          >
            <planeGeometry args={[spanning, h]} />
            {/* OPACITY IS LOAD-BEARING HERE. At 0.12 a wall over a lit outdoor
                HDRI was indistinguishable from no wall at all — the switch said
                on, the viewport said nothing. A surface has to read as a
                surface, and it still has to let you see the room through it. */}
            <meshBasicMaterial
              color={contact?.includes(id) ? VOLUME.contact : selected ? VOLUME.wall : VOLUME.idle}
              transparent
              opacity={(contact?.includes(id) ? 0.45 : 0.28) * dim}
              depthWrite={false}
              side={DoubleSide}
            />
          </mesh>
        );
      })}

    </group>
  );
}

/* ======================================================== the handles ==== */

/**
 * Which faces one grip pushes.
 *
 * A side grip moves ONE face and leaves the opposite one alone, which is what
 * makes "push this wall in" mean what it says — a scale-about-the-centre gizmo
 * would move both and the room would grow away from the wall you grabbed.
 */
type Grip =
  | { kind: "face"; axis: 0 | 2; sign: -1 | 1 }
  | { kind: "corner"; sx: -1 | 1; sz: -1 | 1 }
  | { kind: "height" }
  /** The ring that turns the room about its own centre. */
  | { kind: "yaw" };

/**
 * Which gizmo is on the box.
 *
 * DRIVEN BY THE SETTING, exactly as an object's is: picking Position in the
 * inspector arms the translate handles and picking Rotation arms the ring —
 * see `SETTING_GIZMO` in EditorView for the object side of the same rule. Every
 * handle at once was nine grips and two more, most of them for a thing you
 * weren't doing.
 */
export type VolumeGizmo = "move" | "rotate" | "size";

export function VolumeHandles({
  volume,
  gizmo,
  onResize,
  onDragging,
}: {
  volume: SceneVolume;
  gizmo: VolumeGizmo;
  onResize: (patch: Partial<SceneVolume>) => void;
  /**
   * A grip was taken hold of, or let go.
   *
   * The editor uses it to get its own chrome out of the way: while a corner is
   * being dragged, the title, the toolbar and the inspector are three panels
   * covering the box you are trying to see the shape of — and the readout on
   * the box itself is already saying the only number that matters.
   */
  onDragging?: (dragging: boolean) => void;
}) {
  // Grip positions are LOCAL: the group below turns them with the room, so a
  // face grip stays on its own face at every angle instead of drifting off it.
  const grips: { key: string; at: Vec3; grip: Grip }[] = [];
  const { min, max } = localBounds(volume);
  const cy = volume.center[1];

  // Side grips at the floor-edge midpoints, corner grips at the floor corners:
  // both sit ON the footprint, which is the thing they change. The height grip
  // is the only one off the floor, because height is the only thing it changes.
  if (gizmo === "size") {
    ([-1, 1] as const).forEach((sign) => {
      grips.push({
        key: `x${sign}`,
        at: [sign < 0 ? min[0] : max[0], cy, 0],
        grip: { kind: "face", axis: 0, sign },
      });
      grips.push({
        key: `z${sign}`,
        at: [0, cy, sign < 0 ? min[2] : max[2]],
        grip: { kind: "face", axis: 2, sign },
      });
    });
    ([-1, 1] as const).forEach((sx) =>
      ([-1, 1] as const).forEach((sz) =>
        grips.push({
          key: `c${sx}${sz}`,
          at: [sx < 0 ? min[0] : max[0], cy, sz < 0 ? min[2] : max[2]],
          grip: { kind: "corner", sx, sz },
        })
      )
    );
    grips.push({ key: "h", at: [0, max[1], 0], grip: { kind: "height" } });
  }

  return (
    <>
      {/* The turn ring stands in WORLD space, unturned: a ring that rotated
          with the thing it rotates would chase the pointer round as you dragged
          it. Only the resize grips belong to the room's own frame, which is why
          they alone sit in the turned group.

          MOVE HAS NO HANDLES HERE. It is the editor's own `TransformControls`,
          mounted by `SceneCanvas` on a proxy at the room's centre — see
          `VolumeMoveGizmo`. This component still renders for `move` because the
          dimension readout above the box belongs to every gizmo. */}
      {gizmo === "rotate" && <YawRing volume={volume} onResize={onResize} onDragging={onDragging} />}
    <group
      position={[volume.center[0], 0, volume.center[2]]}
      rotation={[0, (volume.rotationY * Math.PI) / 180, 0]}
    >
      {/* The readout rides the group so it stays over the room, but it must not
          inherit the turn — text rotated with the box is text you read at an
          angle. `Html` billboards to the camera regardless, so it only needs to
          sit at local centre. */}
      {grips.map((g) => (
        <VolumeGrip
          key={g.key}
          volume={volume}
          at={g.at}
          grip={g.grip}
          onResize={onResize}
          onDragging={onDragging}
        />
      ))}
      <VolumeReadout volume={volume} />
    </group>
    </>
  );
}

/* ---------------------------------------------------------------- rotate */

/**
 * The turn ring — a band lying on the floor, all the way round the room.
 *
 * It replaced a small torus on a stalk poking out of one wall. That handle
 * showed WHERE to grab but said nothing about what the grab would do, and it
 * sat outside the box, which reads as belonging to the scene rather than to the
 * room. A ring around the thing it turns is the shape of the gesture.
 */
function YawRing({
  volume,
  onResize,
  onDragging,
}: {
  volume: SceneVolume;
  onResize: (patch: Partial<SceneVolume>) => void;
  onDragging?: (dragging: boolean) => void;
}) {
  const radius = Math.hypot(volume.size[0], volume.size[2]) / 2 + 0.35;
  return (
    <VolumeGrip
      volume={volume}
      at={[volume.center[0], volume.center[1] + 0.02, volume.center[2]]}
      grip={{ kind: "yaw" }}
      reach={radius}
      onResize={onResize}
      onDragging={onDragging}
    />
  );
}

function VolumeGrip({
  volume,
  at,
  grip,
  reach = 1,
  onResize,
  onDragging,
}: {
  volume: SceneVolume;
  at: Vec3;
  grip: Grip;
  /** How long an arm is, or how wide the ring — in metres. */
  reach?: number;
  onResize: (patch: Partial<SceneVolume>) => void;
  onDragging?: (dragging: boolean) => void;
}) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const controls = useThree((s) => s.controls as any);
  const camera = useThree((s) => s.camera);
  const [dragging, setDragging] = useState(false);
  const [hover, setHover] = useState(false);
  const plane = useMemo(() => new Plane(), []);
  const hit = useMemo(() => new Vector3(), []);
  const normal = useMemo(() => new Vector3(), []);
  const point = useMemo(() => new Vector3(), []);
  // The volume as it was when the drag started. Resizing reads from THIS rather
  // than from the live prop: a face drag rewrites `center` as well as `size`, so
  // deriving the next size from the already-moved centre compounds the delta and
  // the face runs away from the pointer.
  const start = useRef(volume);
  /**
   * Where the gesture was grabbed.
   *
   * `[x, angle, z, y]` — an arm reads its own coordinate, the ring reads the
   * angle. Both need it for the same reason: without it the room jumps so that
   * the point you grabbed becomes the point you aimed at, a lurch of up to half
   * the room's width on the first frame.
   */
  const grab = useRef<[number, number, number, number]>([0, 0, 0, 0]);

  const size = gripSize(volume);

  const suspend = (off: boolean) => {
    if (controls) controls.enabled = !off;
  };

  /** Where the pointer is, on the surface this gesture slides along. */
  const resolve = (ray: Ray): Vector3 | null => {
    // The Y arm slides up and down, so it needs the same viewer-facing vertical
    // plane the height grip uses. Everything else lives on the floor.
    if (grip.kind === "height") {
      // A vertical plane through the box, turned to face the viewer — so
      // dragging up is dragging up from wherever you happen to be orbiting.
      normal.set(camera.position.x - volume.center[0], 0, camera.position.z - volume.center[2]);
      if (normal.lengthSq() < 1e-6) return null;
      plane.setFromNormalAndCoplanarPoint(
        normal.normalize(),
        point.set(volume.center[0], volume.center[1], volume.center[2])
      );
    } else {
      plane.set(UP, -volume.center[1]);
    }
    return ray.intersectPlane(plane, hit) ? hit : null;
  };

  /**
   * Push one or both footprint faces to where the pointer is.
   *
   * ALWAYS MEASURED FROM `start.current`, never from the live volume. A face
   * drag rewrites `center` as well as `size`, so deriving the next span from an
   * already-moved centre compounds the delta and the face accelerates away from
   * the pointer. Reading the pre-drag box makes each frame an absolute answer
   * rather than an increment.
   *
   * A corner is just this with two entries, which is why there is no separate
   * corner path: the axes do not interact.
   */
  const applyAxes = (world: Vector3, moves: { axis: 0 | 2; sign: -1 | 1 }[]) => {
    const base = start.current;
    const { min, max } = localBounds(base);
    // The pointer arrives in world space and the faces live in the room's own
    // frame, so the comparison happens there — and the centre that comes out is
    // a local offset, which has to be turned back before it is a position.
    const local = toLocal(base, [world.x, world.y, world.z]);
    const nextSize = [...base.size] as Vec3;
    const offset: Vec3 = [0, 0, 0];
    for (const { axis, sign } of moves) {
      // The face is pinned to the one opposite it, so dragging past that point
      // flips the room inside out — clamped to a minimum instead.
      const opposite = sign < 0 ? max[axis] : min[axis];
      const span = Math.max(MIN_VOLUME_SIDE, Math.abs(local[axis] - opposite));
      nextSize[axis] = span;
      offset[axis] = sign < 0 ? opposite - span / 2 : opposite + span / 2;
    }
    const moved = toWorld(base, [offset[0], base.center[1], offset[2]]);
    onResize({ size: nextSize, center: moved });
  };

  /**
   * Resolve one ray into a resize.
   *
   * Separated from the pointer handler so the edge dolly can call it too: when
   * the camera moves under a stationary pointer, the SAME screen position means
   * a different point in the world, and the grip has to follow it.
   */
  const applyFromRay = (ray: Ray) => {
    const world = resolve(ray);
    if (!world) return;
    const base = start.current;

    if (grip.kind === "height") {
      const h = Math.max(MIN_VOLUME_SIDE, world.y - base.center[1]);
      onResize({ size: [base.size[0], h, base.size[2]] });
      return;
    }

    if (grip.kind === "yaw") {
      // The angle the pointer stands at around the centre, minus the angle it
      // stood at when grabbed — so the handle stays under the cursor instead of
      // snapping to it.
      const now = Math.atan2(world.x - base.center[0], world.z - base.center[2]);
      const delta = ((now - grab.current[1]) * 180) / Math.PI;
      onResize({ rotationY: base.rotationY + delta });
      return;
    }

    applyAxes(
      world,
      grip.kind === "face"
        ? [{ axis: grip.axis, sign: grip.sign }]
        : [
            { axis: 0, sign: grip.sx },
            { axis: 2, sign: grip.sz },
          ]
    );
  };

  useEdgeDolly(dragging, applyFromRay);

  const onMove = (e: { stopPropagation: () => void; ray: Ray }) => {
    if (!dragging) return;
    e.stopPropagation();
    applyFromRay(e.ray);
  };

  const lit = dragging || hover;
  // The turn ring wears the Y axis's own green — the same green every other
  // rotation in this editor turns about. The resize grips stay the volume's
  // indigo, because a face is the room's, not an axis's.
  const ink: string = grip.kind === "yaw" ? AXIS.Y.css : VOLUME.handle;

  return (
    <mesh
      position={at}
      // A ring reads as a turn only when it lies in the plane it turns in.
      rotation={grip.kind === "yaw" ? [Math.PI / 2, 0, 0] : [0, 0, 0]}
      renderOrder={6}
      onPointerOver={(e) => {
        e.stopPropagation();
        setHover(true);
      }}
      onPointerOut={() => setHover(false)}
      onPointerDown={(e) => {
        e.stopPropagation();
        start.current = volume;
        if (e.ray) {
          const at = resolve(e.ray);
          if (at) {
            grab.current = [
              at.x,
              Math.atan2(at.x - volume.center[0], at.z - volume.center[2]),
              at.z,
              at.y,
            ];
          }
        }
        setDragging(true);
        onDragging?.(true);
        suspend(true);
        (e.target as Element).setPointerCapture(e.pointerId);
      }}
      onPointerMove={onMove}
      onPointerUp={(e) => {
        e.stopPropagation();
        setDragging(false);
        onDragging?.(false);
        suspend(false);
        (e.target as Element).releasePointerCapture(e.pointerId);
      }}
    >
      {/* Each gesture gets its own shape, so what a grip does is legible before
          you touch it: a cube pushes a face, a ball lifts, a ring turns. */}
      {grip.kind === "height" ? (
        <sphereGeometry args={[size * 0.7, 16, 12]} />
      ) : grip.kind === "yaw" ? (
        // A ring, not a band. At twice this tube the green swallowed the corner
        // of the room it was drawn around.
        <torusGeometry args={[reach, Math.max(0.03, reach * 0.010), 10, 72]} />
      ) : (
        <boxGeometry args={[size, size, size]} />
      )}
      <meshBasicMaterial color={lit ? VOLUME.handleHot : ink} depthTest={false} />
    </mesh>
  );
}

/* ======================================================== the readout ==== */

/** Live dimensions, pinned over the footprint. The same dark chip the gizmo's
 *  transform readout uses, so the two read as one family of viewport labels. */
function VolumeReadout({ volume }: { volume: SceneVolume }) {
  const { max } = localBounds(volume);
  const [, cy] = volume.center;
  const n = (x: number) => x.toFixed(1);
  return (
    <Html
      position={[0, max[1] + 0.25, 0]}
      center
      style={{ pointerEvents: "none", userSelect: "none" }}
      zIndexRange={[20, 0]}
    >
      <div
        style={{
          background: READOUT.bg,
          border: `1px solid ${READOUT.border}`,
          color: READOUT.ink,
          borderRadius: 7,
          padding: "3px 8px",
          fontSize: 11,
          fontVariantNumeric: "tabular-nums",
          whiteSpace: "nowrap",
        }}
      >
        {n(volume.size[0])} × {n(volume.size[1])} × {n(volume.size[2])} m
        <span style={{ opacity: 0.55 }}>
          {volume.rotationY !== 0 && ` · ${Math.round(volume.rotationY)}°`} · floor {n(cy)}
        </span>
      </div>
    </Html>
  );
}

/* ====================================================== the draw tool ==== */

/**
 * The draft's wireframe.
 *
 * ITS OWN COMPONENT PURELY TO GET A HOOK. Built inline in the JSX below, the
 * geometry was reallocated on every pointer move of the drag — two objects per
 * frame, none of them disposed — because a hook cannot be called inside a
 * conditional branch of a render.
 */
function DraftBox({
  span,
  height,
  centre,
  floor,
}: {
  span: Vec3;
  height: number;
  centre: Vec3;
  floor: number;
}) {
  const h = Math.max(height, 0.002);
  // Keyed on the NUMBERS, not on `span` — the tuple is rebuilt every render, so
  // depending on it would defeat the memo the moment it mattered.
  const points = useMemo(
    () =>
      boxEdges(
        [centre[0] - span[0] / 2, floor, centre[2] - span[2] / 2],
        [centre[0] + span[0] / 2, floor + h, centre[2] + span[2] / 2]
      ),
    [centre[0], centre[2], span[0], span[2], floor, h]
  );
  return (
    <Line
      points={points}
      segments
      color={VOLUME.draft}
      lineWidth={2.2}
      raycast={() => null}
      renderOrder={4}
    />
  );
}

type DrawPhase =
  | { step: "idle" }
  | { step: "footprint"; from: Vec3; to: Vec3 }
  | { step: "height"; from: Vec3; to: Vec3; height: number };

/**
 * DEFINE MODE — drag out a rectangle, raise it, click.
 *
 * TWO GESTURES, NOT A FORM. The dimensions could be three number fields (and
 * they also are, in the panel), but a room you typed is a room you cannot see
 * until you have finished describing it. Dragging the footprint puts the answer
 * on screen while the question is still being asked.
 *
 * The catcher below is a large invisible plane rather than the scene's own
 * ground: there ISN'T a ground mesh in this scene — the horizon is an
 * environment projection — so there is nothing to raycast against otherwise.
 */
export function VolumeDraw({
  floor = 0,
  onDone,
  onCancel,
}: {
  /** Height the footprint is drawn at. */
  floor?: number;
  onDone: (center: Vec3, size: Vec3) => void;
  onCancel: () => void;
}) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const controls = useThree((s) => s.controls as any);
  const camera = useThree((s) => s.camera);
  const [phase, setPhase] = useState<DrawPhase>({ step: "idle" });
  const plane = useMemo(() => new Plane(), []);
  const hit = useMemo(() => new Vector3(), []);
  const normal = useMemo(() => new Vector3(), []);
  const point = useMemo(() => new Vector3(), []);

  const suspend = (off: boolean) => {
    if (controls) controls.enabled = !off;
  };

  const groundAt = (ray: Ray): Vec3 | null => {
    plane.set(UP, -floor);
    return ray.intersectPlane(plane, hit) ? [hit.x, floor, hit.z] : null;
  };

  const heightAt = (ray: Ray, centre: Vec3): number | null => {
    normal.set(camera.position.x - centre[0], 0, camera.position.z - centre[2]);
    if (normal.lengthSq() < 1e-6) return null;
    plane.setFromNormalAndCoplanarPoint(normal.normalize(), point.set(...centre));
    return ray.intersectPlane(plane, hit) ? hit.y : null;
  };

  const rect = phase.step === "idle" ? null : { from: phase.from, to: phase.to };
  const centre: Vec3 | null = rect
    ? [(rect.from[0] + rect.to[0]) / 2, floor, (rect.from[2] + rect.to[2]) / 2]
    : null;
  const span: Vec3 | null = rect
    ? [Math.abs(rect.to[0] - rect.from[0]), 0, Math.abs(rect.to[2] - rect.from[2])]
    : null;

  const height = phase.step === "height" ? phase.height : 0;

  /** The same job the pointer handler does, from an arbitrary ray — so the edge
   *  dolly can keep the draft growing while the camera pulls back. */
  const applyFromRay = (ray: Ray) => {
    if (phase.step === "footprint") {
      const at = groundAt(ray);
      if (at) setPhase({ ...phase, to: at });
      return;
    }
    if (phase.step === "height" && centre) {
      const y = heightAt(ray, centre);
      if (y != null) setPhase({ ...phase, height: Math.max(MIN_VOLUME_SIDE, y - floor) });
    }
  };

  // Drawing a room bigger than the viewport has exactly the same dead end as
  // dragging one bigger, and the same answer.
  useEdgeDolly(phase.step !== "idle", applyFromRay);

  const finish = () => {
    if (!centre || !span) return onCancel();
    if (span[0] < MIN_VOLUME_SIDE || span[2] < MIN_VOLUME_SIDE) return onCancel();
    suspend(false);
    onDone(centre, [span[0], Math.max(MIN_VOLUME_SIDE, height), span[2]]);
  };

  return (
    <group>
      {/* The catcher. Huge, invisible to the eye but not to the raycaster —
          `visible={false}` would make it invisible to BOTH, and then define
          mode would have nothing to draw on. */}
      <mesh
        position={[0, floor, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        onPointerDown={(e) => {
          if (phase.step !== "idle") return;
          e.stopPropagation();
          const at = groundAt(e.ray);
          if (!at) return;
          suspend(true);
          setPhase({ step: "footprint", from: at, to: at });
          (e.target as Element).setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => applyFromRay(e.ray)}
        onPointerUp={(e) => {
          if (phase.step !== "footprint") return;
          e.stopPropagation();
          (e.target as Element).releasePointerCapture(e.pointerId);
          if (!span || span[0] < MIN_VOLUME_SIDE || span[2] < MIN_VOLUME_SIDE) {
            suspend(false);
            setPhase({ step: "idle" });
            return;
          }
          // The footprint is settled; the pointer now controls height and the
          // next click commits. Opening at the default rather than at zero means
          // a user who clicks straight through gets a usable room, not a mat.
          setPhase({ ...phase, step: "height", height: DEFAULT_VOLUME_HEIGHT });
        }}
        onClick={(e) => {
          if (phase.step !== "height") return;
          e.stopPropagation();
          finish();
        }}
      >
        <planeGeometry args={[400, 400]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} side={DoubleSide} />
      </mesh>

      {/* The draft, while it is being dragged out. */}
      {centre && span && span[0] > 0.01 && span[2] > 0.01 && (
        <group>
          <mesh
            position={[centre[0], floor + 0.004, centre[2]]}
            rotation={[-Math.PI / 2, 0, 0]}
            raycast={() => null}
            renderOrder={3}
          >
            <planeGeometry args={[span[0], span[2]]} />
            <meshBasicMaterial
              color={VOLUME.draft}
              transparent
              opacity={0.18}
              depthWrite={false}
              side={DoubleSide}
            />
          </mesh>
          <DraftBox span={span} height={height} centre={centre} floor={floor} />

          <Html
            position={[centre[0], floor + Math.max(height, 0) + 0.2, centre[2]]}
            center
            style={{ pointerEvents: "none", userSelect: "none" }}
            zIndexRange={[20, 0]}
          >
            <div
              style={{
                background: READOUT.bg,
                border: `1px solid ${READOUT.border}`,
                color: READOUT.ink,
                borderRadius: 7,
                padding: "3px 8px",
                fontSize: 11,
                fontVariantNumeric: "tabular-nums",
                whiteSpace: "nowrap",
              }}
            >
              {span[0].toFixed(1)} × {span[2].toFixed(1)} m
              {phase.step === "height" && ` · ${height.toFixed(1)} m high`}
              <span style={{ opacity: 0.55 }}>
                {phase.step === "height" ? " · click to place" : " · drag the footprint"}
              </span>
            </div>
          </Html>
        </group>
      )}
    </group>
  );
}
