import {
  Euler,
  Matrix4,
  Object3D,
  PlaneGeometry,
  Quaternion,
  Vector3,
  type BufferGeometry,
  type Camera,
  type Mesh,
  type MeshBasicMaterial,
} from "three";

/**
 * UNREAL ENGINE 5.8 GIZMO SKIN
 * ------------------------------------------------------------------
 * three-stdlib's TransformControls keeps the *interaction* (raycasting, drag
 * planes, snapping); this restyles it to the UE 5.8 Editor Gizmo System and
 * adds its drag-time behaviour.
 *
 * 5.8 change → what we do:
 *   · plane handles pushed further out    → PLANE_OFFSET, and shrunk
 *   · plane handles read as axis colours  → stock is yellow/cyan/magenta
 *   · enlarged screen-space centre handle → camera-facing square, billboarded
 *   · axes hide during interaction        → post-update hook
 *   · thinner profile / renders on top    → already true here: axis shafts are
 *     1px Lines and every handle is renderOrder Infinity with depthTest off
 *
 * THREE GOTCHAS THAT SHAPE THIS CODE — all verified against
 * node_modules/three-stdlib/controls/TransformControls.js:
 *
 * 1. IT IS three-stdlib, NOT three/examples. @react-three/drei constructs
 *    three-stdlib's TransformControls, which is an older, structurally
 *    different gizmo: the root is the PUBLIC `controls.gizmo` (three/examples
 *    uses a private `_gizmo`), axis shafts are `Line` not `Mesh`, and the
 *    material restore-cache is `tempColor`/`tempOpacity` (three/examples uses
 *    `_color`/`_opacity`). Targeting the wrong one silently no-ops.
 *
 * 2. Handle offsets are BAKED INTO GEOMETRY. setupGizmo() bakes each mesh's
 *    local matrix into a cloned geometry then resets the transform to identity,
 *    so repositioning a handle means rebuilding its geometry — writing to
 *    `.position` does nothing (it's overwritten with the gizmo's world position
 *    every frame regardless).
 *
 * 3. Materials are RESTORED EVERY FRAME from `tempColor`/`tempOpacity`, which
 *    are captured on first update. Setting `.color` alone is reverted a frame
 *    later; the cache has to be overwritten too. See setMaterial().
 */

/** UE axis colours — the docs specify red/green/blue; lightly desaturated from
 *  pure primaries so they sit better against a lit scene. */
const AXIS_COLOR = { X: 0xe83a3a, Y: 0x46bf46, Z: 0x3a6ee8 } as const;

const PLANE_OFFSET = 0.28; // stock 0.15 — "further from center"
const PLANE_SIZE = 0.13; // stock 0.295
const CENTER_SIZE = 0.17; // stock octahedron radius 0.1 — "expanded"

type Handle = Object3D & {
  name: string;
  isLine?: boolean;
  geometry: BufferGeometry;
  material: MeshBasicMaterial & { tempColor?: { setHex: (h: number) => void }; tempOpacity?: number };
};
interface GizmoRoot extends Object3D {
  gizmo: Record<string, Object3D>;
  picker: Record<string, Object3D>;
}
interface Controls extends Object3D {
  gizmo?: GizmoRoot;
  _gizmo?: GizmoRoot;
  dragging: boolean;
  axis: string | null;
  mode: "translate" | "rotate" | "scale";
}

const PLANES = ["XY", "YZ", "XZ"] as const;
type PlaneName = (typeof PLANES)[number];
const isPlane = (n: string): n is PlaneName => (PLANES as readonly string[]).includes(n);

/** Offset + rotation each plane quad is baked with, mirroring gizmoTranslate. */
const PLANE_XFORM: Record<PlaneName, { pos: (d: number) => Vector3; rot: Euler; normal: "X" | "Y" | "Z" }> = {
  XY: { pos: (d) => new Vector3(d, d, 0), rot: new Euler(), normal: "Z" },
  YZ: { pos: (d) => new Vector3(0, d, d), rot: new Euler(0, Math.PI / 2, 0), normal: "X" },
  XZ: { pos: (d) => new Vector3(d, 0, d), rot: new Euler(-Math.PI / 2, 0, 0), normal: "Y" },
};

function bake(geo: BufferGeometry, pos: Vector3, rot: Euler): BufferGeometry {
  geo.applyMatrix4(
    new Matrix4().compose(pos, new Quaternion().setFromEuler(rot), new Vector3(1, 1, 1))
  );
  return geo;
}

/** Colour/opacity that survives the per-frame restore (gotcha 3). */
function setMaterial(h: Handle, color: number, opacity: number) {
  const m = h.material;
  m.color.setHex(color);
  m.opacity = opacity;
  m.transparent = true;
  if (m.tempColor) m.tempColor.setHex(color);
  else m.tempColor = m.color.clone();
  m.tempOpacity = opacity;
}

/** Hidden permanently — re-asserted each frame, since update() sets visible=true. */
function markHidden(h: Handle) {
  h.userData.ueHidden = true;
}

function restyleTranslate(group: Object3D) {
  for (const h of group.children as Handle[]) {
    const name = h.name;
    if (name === "X" || name === "Y" || name === "Z") {
      setMaterial(h, AXIS_COLOR[name], 1);
    } else if (name === "XYZ") {
      h.geometry.dispose();
      h.geometry = new PlaneGeometry(CENTER_SIZE, CENTER_SIZE);
      setMaterial(h, 0xffffff, 0.35);
    } else if (isPlane(name)) {
      const { pos, rot, normal } = PLANE_XFORM[name];
      if (h.isLine) {
        // Stock draws an L-shaped border out of two Lines; the repositioned,
        // smaller quad reads cleaner on its own.
        markHidden(h);
      } else {
        h.geometry.dispose();
        h.geometry = bake(new PlaneGeometry(PLANE_SIZE, PLANE_SIZE), pos(PLANE_OFFSET), rot);
        setMaterial(h, AXIS_COLOR[normal], 0.5);
      }
    }
  }
}

/** Rotate: coloured axis arcs + a WHITE outer camera-facing arc (UE's screen
 *  ring is white; three-stdlib ships it yellow). */
function restyleRotate(group: Object3D) {
  for (const h of group.children as Handle[]) {
    const n = h.name;
    if (n === "X" || n === "Y" || n === "Z") {
      setMaterial(h, AXIS_COLOR[n], 1);
    } else if (n === "E") {
      setMaterial(h, 0xffffff, 0.85);
    } else if (n === "XYZE") {
      setMaterial(h, 0xffffff, 0.28);
    }
  }
}

/** Scale: coloured axis shafts + cube handles, and plane handles recoloured by
 *  their normal axis (stock is yellow/cyan/magenta) with their border lines
 *  dropped, matching how the translate planes now read. */
function restyleScale(group: Object3D) {
  for (const h of group.children as Handle[]) {
    const n = h.name;
    if (n === "X" || n === "Y" || n === "Z") {
      setMaterial(h, AXIS_COLOR[n], 1);
    } else if (isPlane(n)) {
      if (h.isLine) markHidden(h);
      else setMaterial(h, AXIS_COLOR[PLANE_XFORM[n].normal], 0.5);
    } else if (n === "XYZX" || n === "XYZY" || n === "XYZZ") {
      // The three uniform-scale nubs — keep them neutral so they read as one control.
      setMaterial(h, 0xffffff, 0.5);
    }
  }
}

/**
 * Restyle a TransformControls instance in place and install the per-frame hook.
 * Returns a cleanup that restores the original updateMatrixWorld.
 */
export function applyUnrealGizmoSkin(controlsRaw: unknown, camera: Camera): () => void {
  const controls = controlsRaw as Controls;
  // three-stdlib exposes the gizmo publicly; three/examples uses `_gizmo`.
  const root = controls?.gizmo?.gizmo ? controls.gizmo : controls?._gizmo;
  if (!root?.gizmo?.translate) {
    console.warn("[unreal-gizmo] gizmo root not found — skin not applied");
    return () => {};
  }

  restyleTranslate(root.gizmo.translate);
  restyleRotate(root.gizmo.rotate);
  restyleScale(root.gizmo.scale);

  // Grow the screen-space picker to match its now-larger visual handle.
  for (const p of root.picker.translate.children as Handle[]) {
    if (p.name === "XYZ") {
      p.geometry.dispose();
      p.geometry = new PlaneGeometry(CENTER_SIZE * 1.6, CENTER_SIZE * 1.6);
    }
  }

  // update() rewrites visibility and orientation for every handle each frame,
  // so these overrides must run after it — not on a React tick.
  const original = root.updateMatrixWorld.bind(root);
  root.updateMatrixWorld = function (force?: boolean) {
    original(force);
    const { mode, axis, dragging } = controls;
    for (const h of root.gizmo[mode].children as Handle[]) {
      if (h.userData.ueHidden) {
        h.visible = false;
        continue;
      }
      if (h.name === "XYZ" && mode === "translate") {
        h.quaternion.copy(camera.quaternion);
        h.updateMatrixWorld(true);
      }
      // "Axes temporarily hide during interaction" — keep only what's being dragged.
      if (dragging && axis && h.name !== axis) h.visible = false;
    }
  };

  return () => {
    root.updateMatrixWorld = original;
  };
}

/** Exposed for the readout: the drag state we read off the controls. */
export type GizmoDragState = Pick<Controls, "dragging" | "axis" | "mode"> & {
  worldPosition: Vector3;
  worldPositionStart: Vector3;
  rotationAngle: number;
  object?: { scale: Vector3 };
  _scaleStart?: Vector3;
};

/** Mesh type-guard kept for readability at call sites. */
export type GizmoHandle = Mesh;
