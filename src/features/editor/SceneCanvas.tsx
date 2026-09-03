import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Environment, Line, OrbitControls, GizmoHelper, Html, TransformControls } from "@react-three/drei";
import {
  Mesh,
  Object3D,
  Plane,
  Vector3,
  type Camera,
  type Group,
  type Ray,
  type ShaderMaterial,
} from "three";

/** Reused by the rig handles' orbit plane — allocating per pointer event would
 *  churn a Vector3 every frame of a drag. */
const UP = new Vector3(0, 1, 0);
import { SceneObjectMesh } from "./SceneObjectMesh";
import { CameraObjectMesh, GhostCamera } from "./CameraObjectMesh";
import { applyUnrealGizmoSkin } from "./unreal-gizmo";
import { ViewCube, CUBE_PX, TRI_TIP } from "./ViewCube";
import { distance } from "./camera-rig";
import { CAMERA_RIG, READOUT } from "./scene-palette";
import type { SceneApi } from "./useScene";
import { VolumeBox, VolumeDraw, VolumeHandles, type VolumeGizmo } from "./VolumeBox";
import { ancestorIds, subtreeIds } from "./scene-tree";
import { radiusOf } from "./group-transform";
import { DEFAULT_SKY_INFLUENCE, type SceneObject } from "./scene-types";
import { contactWalls, type SceneVolume, type Vec3 } from "./scene-volume";

/**
 * The sky a scene renders with nothing placed.
 *
 * Not a fallback for a broken path — a starting point. An empty scene still has
 * to be lit and still has to have a horizon, and the alternative to shipping
 * one is a black viewport that reads as a loading failure. It is also what the
 * catalogue's named placeholder skies keep rendering, since they carry no file
 * of their own; see `skyUrl` in assets-data.
 *
 * Gitignored along with the rest of `public/hdri/` — see the README.
 */
const DEFAULT_SKY = "/hdri/aarfontein_dusk_4k.exr";

const R2D = 180 / Math.PI;

/**
 * SKY BRIGHTNESS, ON THE THING THAT IS ACTUALLY THE SKY.
 * -----------------------------------------------------
 * `<Environment backgroundIntensity>` sets `scene.backgroundIntensity`, which
 * scales the cube map three draws behind everything. That is NOT what this
 * viewport shows: because the environment is used with `ground`, drei renders a
 * GroundProjectedEnv mesh, and the horizon you see is that mesh's own shader
 * sampling the HDRI directly. It never reads `backgroundIntensity`, so the
 * control appeared to do nothing at all — the slider moved, the payload changed,
 * the picture didn't.
 *
 * three-stdlib's shader has no intensity uniform to set, so one is added: the
 * fragment shader has exactly one line that writes a colour, and this multiplies
 * it. Patched once per material and then only the uniform is written, so a drag
 * doesn't recompile a shader sixty times a second.
 *
 * IT IS TIED TO A SHADER WE DO NOT OWN, so it is written to fail loudly rather
 * than quietly: if the mesh or that line ever stops being findable — a drei or
 * three-stdlib upgrade — it says so once instead of leaving a dead slider.
 */
function SkyBrightness({ value }: { value: number }) {
  const scene = useThree((s) => s.scene);
  const material = useRef<ShaderMaterial | null>(null);
  const tries = useRef(0);

  useFrame(() => {
    if (material.current) {
      material.current.uniforms.terraSkyBrightness.value = value;
      return;
    }
    // The mesh mounts a frame or two after this does, so it is looked for over
    // the first second and then given up on.
    if (tries.current > 90) return;
    tries.current += 1;

    let found: ShaderMaterial | null = null;
    scene.traverse((o) => {
      if (found) return;
      const mat = (o as Mesh).material as ShaderMaterial | undefined;
      // Identified by its uniforms rather than by class or name: it is
      // constructed inside drei and neither of those is stable.
      if (mat?.uniforms?.radius && mat.uniforms.height && mat.uniforms.map) found = mat;
    });
    if (!found) {
      if (tries.current === 90) {
        console.warn(
          "[Terra] Sky Brightness is not wired: the ground-projected environment mesh was not found."
        );
      }
      return;
    }

    const mat = found as ShaderMaterial;
    const WRITE = "gl_FragColor = vec4( outcolor, 1.0 );";
    if (!mat.fragmentShader.includes(WRITE)) {
      console.warn(
        "[Terra] Sky Brightness is not wired: the ground projection shader no longer has the line it patches."
      );
      tries.current = 999;
      return;
    }
    mat.uniforms.terraSkyBrightness = { value };
    mat.fragmentShader = mat.fragmentShader.replace(
      WRITE,
      "gl_FragColor = vec4( outcolor * terraSkyBrightness, 1.0 );"
    );
    // Declared alongside the uniforms the shader already has.
    mat.fragmentShader = mat.fragmentShader.replace(
      "uniform float radius;",
      "uniform float radius;\n            uniform float terraSkyBrightness;"
    );
    mat.needsUpdate = true;
    material.current = mat;
  });

  return null;
}


/** How far the orientation cube's outermost ink reaches from its centre. The
 *  overlay chrome needs it too — the view readout hangs under the cube. */
export const GIZMO_REACH = Math.round(TRI_TIP * CUBE_PX);

const noop = () => {};

/**
 * SceneWorld — the lit, populated scene, minus every editor affordance (gizmo,
 * controls, orientation cube). Extracted so the camera-POV preview can render
 * the exact same world from a different camera without duplicating the object
 * graph. `interactive={false}` (the preview) drops selection outlines and click
 * handling; `hideId` skips one object — the camera you're looking *from*, which
 * would otherwise clip the near plane.
 */
export function SceneWorld({
  scene,
  register,
  selectedId,
  litIds,
  substitute,
  onSelect,
  interactive = true,
  hideId,
  hideIds,
  hideCameras = false,
}: {
  scene: SceneApi;
  register?: (id: string, mesh: Object3D | null) => void;
  selectedId?: string | null;
  /**
   * Draw this INSTEAD of the object it names — a stand-in being previewed.
   *
   * It keeps the target's id, so selection, registration and the gizmo all go on
   * working without knowing a substitution happened. The scene itself is
   * untouched: a swap is a statement about what a RUN renders, not an edit, and
   * the arrangement the user posed has to survive being previewed against.
   */
  substitute?: SceneObject | null;
  /**
   * Everything else wearing the selected outline: a marquee's catch, and the
   * contents of a selected group.
   *
   * A GROUP HAS NO BODY TO OUTLINE. Selecting one has to show you what you
   * picked up, and the only thing there is to show is what is inside it — so the
   * children light instead, which also happens to be exactly what a marquee
   * needs. One prop, because they are the same statement: "these are the objects
   * this selection is about."
   */
  litIds?: readonly string[];
  onSelect?: (id: string) => void;
  interactive?: boolean;
  hideId?: string;
  /**
   * Objects standing aside for something drawn in their place — the rig's two
   * cameras while their near-distance preview is up. Hidden rather than moved,
   * because the preview is a picture of a number and must not become an edit.
   */
  hideIds?: readonly string[];
  /** Drop the rigs and their sweep lines. TerraGen doesn't render its own
   *  cameras into the dataset, so a preview of a captured frame must not show
   *  them — it would be previewing a shot that never exists. */
  hideCameras?: boolean;
}) {
  const reg = register ?? noop;
  const sel = onSelect ?? noop;

  /**
   * What the sky is doing, from whatever world assets are standing in for it.
   *
   * TWO DIFFERENT QUESTIONS, ANSWERED BY DIFFERENT OBJECTS, so they are looked
   * up separately rather than both taken off one "the backdrop" object.
   *
   * Brightness is the exposure of the SKY TEXTURE, so only the two assets that
   * are a sky texture can set it. A splat is excluded on purpose: its brightness
   * already drives its own point cloud (see SceneObjectMesh), and letting it
   * also scale the horizon would make one slider do two unrelated jobs.
   *
   * Influence is the ambient landing on the objects, and any world asset casts
   * that — a captured warehouse lights what stands in it exactly as an HDRI
   * does. First one placed wins, preferring the sky assets, because two worlds
   * in one scene is already a scene that needs deciding rather than averaging.
   *
   * Nothing placed means the values the canvas has always rendered at.
   *
   * AND WHICH SKY IT IS. `files` used to be a hardcoded path, so placing an
   * Environment or a Skybox changed the exposure of the shipped default and
   * nothing else — you chose "Anime Sky", the horizon stayed a South African
   * dusk, and the only honest reading was that the asset had not been placed.
   * The placed object's own file wins now; the default is what renders when
   * nothing is placed, or when what is placed is one of the catalogue's named
   * placeholders (see `skyUrl` in assets-data).
   */
  const sky = useMemo(() => {
    const visible = (src: SceneObject["source"]) =>
      scene.objects.find((o) => o.source === src && !o.hidden);
    const hdri = visible("environment");
    const skybox = visible("skybox");
    const texture = hdri ?? skybox;
    const lighting = hdri ?? skybox ?? visible("splat");
    return {
      brightness: texture?.brightness ?? 1,
      influence: lighting?.skyInfluence ?? DEFAULT_SKY_INFLUENCE,
      files: texture?.skyUrl ?? DEFAULT_SKY,
    };
  }, [scene.objects]);
  return (
    <>
      <directionalLight
        position={[8, 12, 6]}
        intensity={0.4 * scene.env.brightness}
        color={warmColor(scene.env.warmth)}
        castShadow
      />

      {/* THE SKY, AND HOW MUCH OF IT LANDS ON THINGS.
          Both numbers used to be constants. They are now the two controls on a
          placed HDRI: Sky Brightness is the backdrop's own exposure, Sky
          Influence is what it contributes to everything standing in front of it.
          With nothing placed the scene falls back to exactly what it rendered
          before the controls existed, so an untouched project looks untouched. */}
      {/* Sky Brightness has to be applied by hand — see SkyBrightness. */}
      <SkyBrightness value={sky.brightness} />

      {/* KEYED ON THE FILE. drei picks its loader from the extension at mount
          (RGBELoader for .hdr, a gainmap decoder for .jpg — see useEnvironment),
          so swapping the path on a live instance asks one loader's texture to
          come out of another's. Remounting is the honest way to change sky. */}
      <Environment
        key={sky.files}
        files={sky.files}
        background
        backgroundIntensity={sky.brightness}
        environmentIntensity={sky.influence}
        ground={{ height: 15, radius: 60, scale: 400 }}
      />

      {/* The sweep each rig will travel. Drawn before the cameras so the line
          passes behind their bodies rather than through them. */}
      {!hideCameras &&
        scene.rigs.map((rig) => {
          const { start, end } = scene.rigCameras(rig);
          if (!start || !end) return null;
          // A hidden camera takes its sweep with it — the line is the rig's
          // path, and drawing it to a camera that isn't there points at nothing.
          if (start.hidden || end.hidden) return null;
          return <SweepLine key={rig.id} from={start.position} to={end.position} />;
        })}

      {scene.objects
        // A group is a name for some objects, not an object. It has a transform
        // and it has a gizmo, but there is nothing to draw at its centre — a
        // placeholder mesh there would be a solid you could not delete without
        // deleting everything it stands for.
        .filter((o) => !o.group)
        .map((o) => (substitute && o.id === substitute.id ? substitute : o))
        .filter((o) => o.id !== hideId && !hideIds?.includes(o.id) && !o.hidden)
        .filter((o) => !(hideCameras && o.source === "camera"))
        /* A SKY HAS NO BODY IN THE SCENE. An HDRI and a skybox were drawing a
           placeholder solid — a box standing on the ground, hoverable,
           outlined, with a gizmo — while the thing they actually are was the
           horizon behind it. Two objects for one asset, and the one you could
           click was the one that did nothing. Their presence is the
           `<Environment>` above; they are selected from the layers tree, which
           is where a thing with no body belongs. A splat keeps its cloud: a
           captured place IS a body, standing somewhere you can move it to. */
        .filter((o) => o.source !== "environment" && o.source !== "skybox")
        .map((o) =>
          o.source === "camera" ? (
            <CameraObjectMesh
              key={o.id}
              object={o}
              masterPosition={scene.master ? scene.master.position : null}
              selected={interactive && o.id === selectedId}
              onSelect={sel}
              register={reg}
            />
          ) : (
            <SceneObjectMesh
              key={o.id}
              object={o}
              selected={
                interactive && (o.id === selectedId || litIds?.includes(o.id) === true)
              }
              onSelect={sel}
              register={reg}
              onMaterials={scene.discoverMaterials}
            />
          )
        )}
    </>
  );
}

/** Warmth (-1 cool … +1 warm) → a light tint. */
function warmColor(w: number): string {
  const white = [255, 255, 255];
  const target = w >= 0 ? [255, 217, 168] : [207, 224, 255];
  const m = Math.abs(w);
  const rgb = white.map((c, i) => Math.round(c * (1 - m) + target[i] * m));
  return `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
}


export interface CameraHandle {
  camera: Camera;
  dom: HTMLElement;
  /**
   * Turn orbiting off, and on again.
   *
   * Handed out because the MARQUEE lives outside this canvas — it is a rectangle
   * drawn in DOM over the viewport, not a thing in the scene — and a box drag
   * that also spun the camera would be unusable. Exposing the one verb it needs
   * is smaller than moving the whole gesture in here, and it is the same verb
   * the grips inside the canvas already use on `state.controls`.
   */
  setOrbit: (enabled: boolean) => void;
}

/**
 * What the viewport is being asked to do about volumes.
 *
 * Absent entirely — which is how TerraGen's edit stage mounts this canvas — the
 * armed volume still DRAWS but grows no handles and starts no draw gesture. The
 * Arrangement axis needs to show you the room it is filling; it has no business
 * letting you resize it from there, because the Space panel isn't on screen to
 * say what changed.
 */
export interface VolumeEdit {
  /** Define mode: the next drag on the ground draws a footprint. */
  drawing: boolean;
  onDrawn: (center: Vec3, size: Vec3) => void;
  onCancelDraw: () => void;
  onResize: (patch: Partial<SceneVolume>) => void;
  /** A resize grip is being held. The editor hides its own chrome while it is. */
  onDragging?: (dragging: boolean) => void;
  /** Which handle set is armed, from the inspector's active setting. Omit to
   *  leave the box bare — a space you are only looking at grows no grips. */
  gizmo?: VolumeGizmo;
}

interface SceneCanvasProps {
  scene: SceneApi;
  gizmoMode: "translate" | "rotate" | "scale";
  /** The transform gizmo only appears inside Object settings; otherwise the
   *  selection reads as a white outline alone. */
  showGizmo: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  controlsRef: React.MutableRefObject<any>;
  cameraRef: React.MutableRefObject<CameraHandle | null>;
  /** fires when the named orientation the camera looks from changes */
  onViewChange?: (view: ViewState) => void;
  /** rings drawn around the master while a camera setting is being edited */
  cameraGuide?: CameraGuide | null;
  /** the orbit ring was dragged to this angle */
  onOrbit?: (deg: number) => void;
  /** the sweep's climb handle was dragged to this vertical separation */
  onSpan?: (metres: number) => void;
  /** define mode + the resize handles. Omit for a read-only box. */
  volumeEdit?: VolumeEdit;
  /**
   * Extra px the orientation cube steps left, away from the right edge.
   *
   * The panel dock now starts at the same content line as the cube rather than
   * below it, so the two would occupy the same corner. The cube yields, because
   * it's an ornament and the dock is where the work happens — and it yields by
   * moving rather than hiding, so the orbit readout it anchors stays reachable.
   */
  gizmoInset?: number;
  /**
   * A stand-in drawn in place of one object, and where its transform goes.
   *
   * The gizmo would otherwise write through to the object being stood in for —
   * dragging the previewed chair would move the torus it replaces, which is the
   * one thing a swap must never do.
   */
  substitute?: {
    object: SceneObject;
    onTransform: (pose: {
      position: [number, number, number];
      rotationDeg: [number, number, number];
      scale: [number, number, number];
    }) => void;
  } | null;
}

/**
 * ViewProbe — names the orientation the camera is currently looking from, for
 * the readout under the orientation cube.
 *
 * The cube itself shows which way is which, but not *where you are*: on a
 * three-quarter view every face is partly visible and none of them is the
 * answer. So this reports the nearest named view plus whether the camera is
 * actually snapped to it — "Front" and "Front, off-axis" are different facts,
 * and only the first means clicking that face would change nothing.
 *
 * Runs on the render loop but only calls back when the label changes, so a
 * slow orbit doesn't re-render the whole editor sixty times a second.
 */
const NAMED_VIEWS: [Vector3, string][] = [
  [new Vector3(0, 0, 1), "Front"],
  [new Vector3(0, 0, -1), "Back"],
  [new Vector3(1, 0, 0), "Right"],
  [new Vector3(-1, 0, 0), "Left"],
  [new Vector3(0, 1, 0), "Top"],
  [new Vector3(0, -1, 0), "Bottom"],
];

export interface ViewState {
  label: string;
  /** the camera is on that axis, within a degree or so */
  snapped: boolean;
}

function ViewProbe({
  controlsRef,
  onChange,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  controlsRef: React.MutableRefObject<any>;
  onChange: (v: ViewState) => void;
}) {
  const last = useRef<string>("");
  const dir = useRef(new Vector3());

  useFrame(({ camera }) => {
    const target = controlsRef.current?.target as Vector3 | undefined;
    dir.current.copy(camera.position);
    if (target) dir.current.sub(target);
    if (dir.current.lengthSq() === 0) return;
    dir.current.normalize();

    let best = NAMED_VIEWS[0];
    let bestDot = -Infinity;
    for (const entry of NAMED_VIEWS) {
      const d = dir.current.dot(entry[0]);
      if (d > bestDot) {
        bestDot = d;
        best = entry;
      }
    }

    const next: ViewState = { label: best[1], snapped: bestDot > 0.9995 };
    const key = `${next.label}:${next.snapped}`;
    if (key !== last.current) {
      last.current = key;
      onChange(next);
    }
  });

  return null;
}

/** Captures the live camera + canvas element so the DOM drop handler can raycast. */
function CameraGrabber({ cameraRef }: { cameraRef: React.MutableRefObject<CameraHandle | null> }) {
  const { camera, gl } = useThree();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const controls = useThree((s) => s.controls as any);
  useEffect(() => {
    cameraRef.current = {
      camera,
      dom: gl.domElement,
      setOrbit: (enabled: boolean) => {
        if (controls) controls.enabled = enabled;
      },
    };
  }, [camera, gl, controls, cameraRef]);
  return null;
}

/**
 * FocusRig — on select, zooms the camera to FIT the object (keeping the current
 * viewing angle); on deselect, animates back to the saved room view. Triggers
 * only when the *selection* changes (not while dragging the gizmo), so moving an
 * object doesn't make the camera chase it.
 */
function FocusRig({
  controlsRef,
  focusId,
  center,
  radius,
  onSettled,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  controlsRef: React.MutableRefObject<any>;
  focusId: string | null;
  center: [number, number, number] | null;
  radius: number;
  onSettled: () => void;
}) {
  const { camera } = useThree();
  const home = useRef<{ pos: Vector3; tgt: Vector3 } | null>(null);
  const goal = useRef<{ pos: Vector3; tgt: Vector3 } | null>(null);

  useEffect(() => {
    const c = controlsRef.current;
    if (!c) return;
    if (center) {
      // remember the room view the first time we focus
      if (!home.current) home.current = { pos: camera.position.clone(), tgt: c.target.clone() };
      const ctr = new Vector3(center[0], center[1], center[2]);
      const dir = camera.position.clone().sub(ctr);
      if (dir.lengthSq() < 1e-4) dir.set(0.6, 0.5, 0.8);
      dir.normalize();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const fov = ((camera as any).fov ?? 45) * (Math.PI / 360);
      const dist = Math.max(1.9, (radius / Math.tan(fov)) * 1.7);
      goal.current = { pos: ctr.clone().add(dir.multiplyScalar(dist)), tgt: ctr };
    } else {
      // deselect → fly back to the saved room view
      goal.current = home.current;
      home.current = null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusId]);

  useFrame(() => {
    const c = controlsRef.current;
    if (!c || !goal.current) return;
    camera.position.lerp(goal.current.pos, 0.12);
    c.target.lerp(goal.current.tgt, 0.12);
    c.update();
    if (camera.position.distanceTo(goal.current.pos) < 0.03 && c.target.distanceTo(goal.current.tgt) < 0.03) {
      goal.current = null;
      // The fly-in is done — safe to hand the camera over to the auto-orbit.
      onSettled();
    }
  });
  return null;
}

/** Applies the UE 5.8 skin to the TransformControls instance once it exists.
 *  Rendered as a sibling of TransformControls so it mounts after the ref is set. */
function UnrealGizmoSkin({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  gizmoRef,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  gizmoRef: React.MutableRefObject<any>;
}) {
  const { camera } = useThree();
  useEffect(() => {
    if (!gizmoRef.current) return;
    return applyUnrealGizmoSkin(gizmoRef.current, camera);
  }, [camera, gizmoRef]);
  return null;
}

/**
 * GizmoReadout — UE 5.8's live numeric delta. Shown only while dragging, pinned
 * to the gizmo's world position. Updated by writing to the DOM node directly
 * rather than through state, so a drag doesn't re-render React every frame.
 */
function GizmoReadout({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  gizmoRef,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  gizmoRef: React.MutableRefObject<any>;
}) {
  const anchor = useRef<Group>(null);
  const el = useRef<HTMLDivElement>(null);

  // Driven by TransformControls' own events rather than useFrame: `objectChange`
  // fires on every drag step, so the readout updates exactly when the value
  // does — and costs nothing on frames where nothing is being dragged.
  useEffect(() => {
    const c = gizmoRef.current;
    if (!c) return;
    const update = () => draw();
    const onDragging = (e: { value?: boolean }) => {
      if (!e.value && el.current) el.current.style.opacity = "0";
      else draw();
    };
    c.addEventListener("objectChange", update);
    c.addEventListener("dragging-changed", onDragging);
    return () => {
      c.removeEventListener("objectChange", update);
      c.removeEventListener("dragging-changed", onDragging);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gizmoRef]);

  function draw() {
    const c = gizmoRef.current;
    const node = el.current;
    if (!node) return;
    if (!c || !c.dragging || !c.axis) {
      node.style.opacity = "0";
      return;
    }
    if (anchor.current) anchor.current.position.copy(c.worldPosition);
    node.style.opacity = "1";

    if (c.mode === "rotate") {
      node.textContent = `${((c.rotationAngle * 180) / Math.PI).toFixed(1)}°`;
    } else if (c.mode === "scale") {
      const s = c.object?.scale;
      const start = c._scaleStart;
      if (!s || !start) return;
      const axis = c.axis as string;
      const k = axis.includes("X") ? s.x / start.x : axis.includes("Y") ? s.y / start.y : s.z / start.z;
      node.textContent = `${k.toFixed(3)}×`;
    } else {
      const d = new Vector3().subVectors(c.worldPosition, c.worldPositionStart);
      const axis = c.axis as string;
      // A single-axis drag reads as one number; plane/screen drags show all three.
      node.textContent =
        axis === "X" || axis === "Y" || axis === "Z"
          ? `${axis}  ${(axis === "X" ? d.x : axis === "Y" ? d.y : d.z).toFixed(2)}`
          : `${d.x.toFixed(2)}, ${d.y.toFixed(2)}, ${d.z.toFixed(2)}`;
    }
  }

  return (
    <group ref={anchor}>
      <Html center zIndexRange={[60, 0]} style={{ pointerEvents: "none" }}>
        <div
          ref={el}
          data-ui="gizmo-readout"
          className="type-scene-readout"
          style={{
            opacity: 0,
            transform: "translateY(-34px)",
            whiteSpace: "nowrap",
            padding: "3px 8px",
            borderRadius: "6px",
            background: READOUT.bg,
            border: `1px solid ${READOUT.border}`,
            color: READOUT.ink,
          }}
        />
      </Html>
    </group>
  );
}

/**
 * A GROUP'S TRANSFORM GIZMO.
 *
 * Same problem the volume has and the same answer: `TransformControls` needs an
 * `Object3D` to attach to, and a group has no mesh — it is a row in a list and a
 * position. So it drives a proxy standing at the group's centre, and each step
 * of the drag writes the proxy's transform back through `scene.update`, which is
 * where the arithmetic that carries the contents lives (`group-transform.ts`).
 *
 * It honours `mode` rather than hard-coding translate, because all three
 * transforms mean something for a group: move the set, turn the set, scale the
 * set. The Object tab's three rows arm it exactly as they do for a mesh.
 */
function GroupGizmo({
  group,
  mode,
  onChange,
  onGrab,
}: {
  group: SceneObject;
  mode: "translate" | "rotate" | "scale";
  onChange: (patch: Partial<SceneObject>) => void;
  onGrab: (holding: boolean) => void;
}) {
  const proxy = useMemo(() => new Object3D(), []);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const gizmoRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const controls = useThree((s) => s.controls as any);
  const dragging = useRef(false);

  // Follow the group whenever something else moves it — the numeric rows, an
  // undo, a parent group being dragged. Skipped mid-drag: the proxy is the
  // source of the truth then, and writing the round-tripped value back would be
  // the gizmo arguing with itself a frame late.
  useEffect(() => {
    if (dragging.current) return;
    proxy.position.set(group.position[0], group.position[1], group.position[2]);
    proxy.rotation.set(
      group.rotationDeg[0] / R2D,
      group.rotationDeg[1] / R2D,
      group.rotationDeg[2] / R2D
    );
    proxy.scale.set(group.scale[0], group.scale[1], group.scale[2]);
  }, [proxy, group.position, group.rotationDeg, group.scale]);

  return (
    <>
      <primitive object={proxy} />
      <TransformControls
        ref={gizmoRef}
        object={proxy}
        mode={mode}
        onObjectChange={() =>
          onChange({
            position: [proxy.position.x, proxy.position.y, proxy.position.z],
            rotationDeg: [
              proxy.rotation.x * R2D,
              proxy.rotation.y * R2D,
              proxy.rotation.z * R2D,
            ],
            scale: [proxy.scale.x, proxy.scale.y, proxy.scale.z],
          })
        }
        onMouseDown={() => {
          dragging.current = true;
          onGrab(true);
          if (controls) controls.enabled = false;
        }}
        onMouseUp={() => {
          dragging.current = false;
          onGrab(false);
          if (controls) controls.enabled = true;
        }}
      />
      <UnrealGizmoSkin key={mode} gizmoRef={gizmoRef} />
      <GizmoReadout gizmoRef={gizmoRef} />
    </>
  );
}

/**
 * THE SPACE'S MOVE GIZMO — the object one, on a room.
 *
 * It used to be three cones on stalks, hand-drawn in `VolumeBox`. They pointed
 * the right way and dragged the right distance, and they were still wrong: the
 * arrowheads were a different shape and a different size from the ones on every
 * mesh in the scene, they had no plane handles and no screen-space handle, they
 * did not scale with the camera the way `TransformControls` does, and they wore
 * none of the Unreal skin the rest of the editor is dressed in. Two move gizmos
 * in one viewport is one of them looking like a bug.
 *
 * So the room borrows the real one. `TransformControls` cannot be pointed at a
 * volume — a volume is arithmetic, not an `Object3D` — so it drives a PROXY
 * that stands at the room's centre, and every step of the drag copies that
 * proxy's position back onto the volume through the same `onResize` a face grip
 * uses. The skin and the numeric readout come along unchanged, because they are
 * the same two components the object gizmo mounts.
 */
function VolumeMoveGizmo({
  volume,
  onResize,
}: {
  volume: SceneVolume;
  onResize: (patch: Partial<SceneVolume>) => void;
}) {
  // Created once and mounted with `primitive`, not looked up through a ref:
  // `TransformControls` needs its target on the FIRST render, and a ref is null
  // until after one.
  const proxy = useMemo(() => new Object3D(), []);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const gizmoRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const controls = useThree((s) => s.controls as any);
  const dragging = useRef(false);

  /**
   * Follow the room when something ELSE moves it — the Move panel's numeric
   * rows, an undo, a face drag that shifts the centre.
   *
   * Skipped mid-drag on purpose: during a drag the proxy is the source of the
   * truth and the volume is downstream of it, so writing the round-tripped
   * value back would be the gizmo fighting itself a frame late.
   */
  useEffect(() => {
    if (dragging.current) return;
    proxy.position.set(volume.center[0], volume.center[1], volume.center[2]);
  }, [proxy, volume.center]);

  return (
    <>
      <primitive object={proxy} />
      <TransformControls
        ref={gizmoRef}
        object={proxy}
        mode="translate"
        onObjectChange={() =>
          onResize({ center: [proxy.position.x, proxy.position.y, proxy.position.z] })
        }
        onMouseDown={() => {
          dragging.current = true;
          if (controls) controls.enabled = false;
        }}
        onMouseUp={() => {
          dragging.current = false;
          if (controls) controls.enabled = true;
        }}
      />
      <UnrealGizmoSkin gizmoRef={gizmoRef} />
      <GizmoReadout gizmoRef={gizmoRef} />
    </>
  );
}

const FLY_KEYS = ["w", "a", "s", "d"] as const;
type FlyKey = (typeof FLY_KEYS)[number];

/** True while focus sits in a text field — so WASD keeps typing "w"/"a"/"s"/"d"
 *  instead of flying the camera. */
function isTypingTarget(el: Element | null): boolean {
  if (!el) return false;
  if (el.tagName === "INPUT" || el.tagName === "TEXTAREA") return true;
  return (el as HTMLElement).isContentEditable;
}

/** WASD fly navigation: W/S move along the camera's forward direction (flattened
 *  to the ground plane), A/D strafe. Moves the OrbitControls target along with the
 *  camera so the current look direction and orbit pivot are preserved. */
function KeyboardFly({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  controlsRef,
}: {
  controlsRef: React.MutableRefObject<any>;
}) {
  const { camera } = useThree();
  const keys = useRef<Record<FlyKey, boolean>>({ w: false, a: false, s: false, d: false });

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (isTypingTarget(document.activeElement)) return;
      const k = e.key.toLowerCase();
      if ((FLY_KEYS as readonly string[]).includes(k)) keys.current[k as FlyKey] = true;
    };
    const up = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if ((FLY_KEYS as readonly string[]).includes(k)) keys.current[k as FlyKey] = false;
    };
    const clear = () => {
      keys.current.w = keys.current.a = keys.current.s = keys.current.d = false;
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", clear);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", clear);
    };
  }, []);

  const forward = useRef(new Vector3());
  const right = useRef(new Vector3());
  const move = useRef(new Vector3());

  useFrame((_, rawDelta) => {
    const k = keys.current;
    if (!k.w && !k.a && !k.s && !k.d) return;
    const controls = controlsRef.current;
    if (!controls) return;
    // Clamp delta so a tab-background/frame-drop pause can't turn into one huge jump.
    const delta = Math.min(rawDelta, 0.1);

    camera.getWorldDirection(forward.current);
    const flatLenSq = forward.current.x * forward.current.x + forward.current.z * forward.current.z;
    if (flatLenSq < 1e-4) {
      // Looking almost straight up/down: the flattened forward direction is too
      // unstable to normalize (near gimbal lock). Fall back to a horizontal basis
      // derived from the camera's screen-right axis instead.
      camera.updateMatrixWorld();
      const e = camera.matrixWorld.elements;
      right.current.set(e[0], 0, e[2]);
      if (right.current.lengthSq() < 1e-6) right.current.set(1, 0, 0);
      right.current.normalize();
      forward.current.set(-right.current.z, 0, right.current.x);
    } else {
      forward.current.y = 0;
      forward.current.normalize();
      right.current.crossVectors(forward.current, camera.up).normalize();
    }

    move.current.set(0, 0, 0);
    if (k.w) move.current.add(forward.current);
    if (k.s) move.current.sub(forward.current);
    if (k.d) move.current.add(right.current);
    if (k.a) move.current.sub(right.current);
    if (move.current.lengthSq() === 0) return;

    move.current.normalize().multiplyScalar(8 * delta);
    camera.position.add(move.current);
    controls.target.add(move.current);
    controls.update();
  });

  return null;
}

/**
 * The travel path between a rig's two cameras — the range the capture fills in.
 * Rebuilt whenever either end moves, which is why the geometry is keyed on the
 * endpoints rather than mutated in place.
 */
function SweepLine({ from, to }: { from: [number, number, number]; to: [number, number, number] }) {
  // drei's Line rather than the `<line>` intrinsic: in TSX that name resolves to
  // SVGLineElement, so the three.js props don't typecheck. Line also gives a
  // real stroke width, which a 1px GL line can't.
  const points = useMemo(
    () => [from, to] as [number, number, number][],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [from[0], from[1], from[2], to[0], to[1], to[2]]
  );
  return (
    <Line
      points={points}
      color={CAMERA_RIG.path}
      lineWidth={1.5}
      dashed
      dashSize={0.35}
      gapSize={0.25}
      transparent
      opacity={0.8}
      raycast={() => null}
    />
  );
}


/* ------------------------------------------------------------------------- */
/*  Camera guides — the rings that make a rig's numbers visible in the scene  */
/* ------------------------------------------------------------------------- */

/**
 * What the viewport should draw around the master while a camera setting is
 * open. Built in EditorView from the same values the panel edits, so the ring
 * and the slider are two views of one number rather than two sources of truth.
 */
export type CameraGuide =
  | {
      kind: "distance";
      centre: [number, number, number];
      /**
       * The ring each end of the rig actually travels on: its own height and
       * its own ground radius. The rig's two cameras differ in elevation as
       * well as reach, so one shared circle would be a picture of neither.
       */
      near: { y: number; radius: number };
      far: { y: number; radius: number };
      /** the handle under the cursor, if any: its ring reads as the live one */
      active: "min" | "max" | null;
      /**
       * THE PREVIEW. While the Distance control is open the pair is shown at
       * the NEAR reach — the end being edited — and the far positions they will
       * return to are left behind as afterimages. The rig itself never moves:
       * the near distance is a number on the rig, so this is a picture of what
       * that number means, not a temporary edit that has to be undone on close.
       */
      previews: [number, number, number][];
      afterimages: [number, number, number][];
      /** the real cameras the preview stands in for, hidden while it's up */
      hides: string[];
    }
  | {
      /** the master's turntable, drawn around the master itself */
      kind: "orbit";
      centre: [number, number, number];
      y: number;
      radius: number;
      /** the master's current heading, where the drag handle sits */
      azimuth: number;
      /**
       * The wedge the capture actually turns through. A full revolution is
       * 0 → 360 and draws as the whole ring; anything narrower draws the ring
       * dashed with the live arc laid over it, so what is captured and what is
       * merely possible are never the same line.
       */
      arc: { start: number; end: number };
    }
  | {
      /**
       * The rig itself, grabbable in the viewport. Shown whenever a rig camera
       * is selected rather than only inside a setting: a slider you have to go
       * and find is not how anyone aims a camera at a thing they can see.
       */
      kind: "rig";
      centre: [number, number, number];
      start: [number, number, number];
      end: [number, number, number];
    }
  | {
      /**
       * WHERE THE SHOTS COME FROM. Open Shots / Distance or Shots / Rotation and
       * the counts stop being abstract: every stop the rig makes is a dot on the
       * sweep, and every frame it takes there is a tick on that stop's ring.
       * Counting them is how you tell 24 from 36 without trusting the label.
       */
      kind: "shots";
      centre: [number, number, number];
      /** one per pass: where the rig stands, and the circle it turns on */
      stops: { position: [number, number, number]; y: number; radius: number }[];
      /** bearings within the arc that each pass shoots from */
      bearings: number[];
      /** which of the two counts is being edited — that half reads live */
      focus: "distance" | "rotation";
    };

const RING_SEGMENTS = 96;

/** A horizontal circle of `radius` around `centre`, at height `y`. */
function ringPoints(centre: [number, number, number], y: number, radius: number) {
  const pts: [number, number, number][] = [];
  for (let i = 0; i <= RING_SEGMENTS; i++) {
    const t = (i / RING_SEGMENTS) * Math.PI * 2;
    pts.push([centre[0] + Math.sin(t) * radius, y, centre[2] + Math.cos(t) * radius]);
  }
  return pts;
}

function GuideRing({
  centre,
  y,
  radius,
  live,
  dashed,
}: {
  centre: [number, number, number];
  y: number;
  radius: number;
  live: boolean;
  dashed?: boolean;
}) {
  const points = useMemo(() => ringPoints(centre, y, radius), [centre, y, radius]);
  return (
    <Line
      points={points}
      color={live ? CAMERA_RIG.selected : CAMERA_RIG.path}
      lineWidth={live ? 2 : 1.25}
      dashed={dashed}
      dashSize={0.4}
      gapSize={0.3}
      transparent
      opacity={live ? 0.95 : 0.5}
      raycast={() => null}
      depthTest={false}
      renderOrder={3}
    />
  );
}

/**
 * The two halos: the nearest and furthest the rig reaches from the master.
 *
 * Both are always drawn, but the one you are NOT dragging is the point of the
 * pair — a nearest distance is only meaningful against the furthest one it has
 * to leave room for. Whichever handle is in hand lights up; the other stays as
 * the dashed reference, with the camera pair itself stood on it in orange.
 */
function DistanceHalos({ guide }: { guide: Extract<CameraGuide, { kind: "distance" }> }) {
  return (
    <>
      <GuideRing
        centre={guide.centre}
        y={guide.near.y}
        radius={guide.near.radius}
        live={guide.active === "min"}
        dashed={guide.active !== "min"}
      />
      <GuideRing
        centre={guide.centre}
        y={guide.far.y}
        radius={guide.far.radius}
        live={guide.active === "max"}
        dashed={guide.active !== "max"}
      />
      {/* Where the pair will stand at this near reach — solid, because for as
          long as the control is open this IS the rig you are setting. */}
      {guide.previews.map((p, i) => (
        <GhostCamera key={`near-${i}`} position={p} lookAt={guide.centre} solid />
      ))}

      {/* And where they go back to. Yellow, so a spot the rig will RETURN to is
          never mistaken for a spot the rig is. */}
      {guide.afterimages.map((p, i) => (
        <GhostCamera key={`far-${i}`} position={p} lookAt={guide.centre} tint={CAMERA_RIG.afterimage} />
      ))}

      {/* The travel between the two, so the preview reads as a move rather than
          two unrelated pairs of cameras. */}
      {guide.previews.map((p, i) =>
        guide.afterimages[i] ? (
          <Line
            key={`travel-${i}`}
            points={[p, guide.afterimages[i]]}
            color={CAMERA_RIG.afterimage}
            lineWidth={1.25}
            dashed
            dashSize={0.25}
            gapSize={0.2}
            transparent
            opacity={0.7}
            raycast={() => null}
            depthTest={false}
            renderOrder={3}
          />
        ) : null
      )}
    </>
  );
}

/**
 * SHOT MARKERS — every frame the capture will take, as a dot.
 *
 * Counts are the one part of a capture plan nobody can picture: 24 shots per
 * rotation and 36 look identical as numbers and completely different as
 * coverage. So each pass draws the circle it turns on and a tick at every
 * bearing it fires from, and each stop on the sweep draws a dot where the rig
 * stands. Whichever count is being edited reads live; the other stays quiet.
 *
 * Ticks are capped: a 12 × 120 plan is 1,440 markers, which is a mesh per frame
 * of a dataset and a picture of nothing. Past the cap only the two end rings
 * carry ticks — the shape is still legible and the scene still moves.
 */
const TICK_BUDGET = 240;

function ShotMarkers({ guide }: { guide: Extract<CameraGuide, { kind: "shots" }> }) {
  const { centre, stops, bearings, focus } = guide;
  const tickRings =
    stops.length * bearings.length <= TICK_BUDGET || stops.length < 3
      ? stops
      : [stops[0], stops[stops.length - 1]];

  const dot = Math.max(0.08, (stops[0]?.radius ?? 4) * 0.02);

  return (
    <group>
      {stops.map((stop, i) => (
        <GuideRing
          key={`ring-${i}`}
          centre={centre}
          y={stop.y}
          radius={stop.radius}
          live={focus === "rotation"}
          dashed
        />
      ))}

      {/* One tick per shot, on the ring of the pass that takes it. */}
      {tickRings.map((stop, i) =>
        bearings.map((deg, j) => {
          const t = (deg * Math.PI) / 180;
          return (
            <mesh
              key={`tick-${i}-${j}`}
              position={[
                centre[0] + Math.sin(t) * stop.radius,
                stop.y,
                centre[2] + Math.cos(t) * stop.radius,
              ]}
              raycast={() => null}
              renderOrder={4}
            >
              <sphereGeometry args={[dot, 8, 8]} />
              <meshBasicMaterial
                color={focus === "rotation" ? CAMERA_RIG.selected : CAMERA_RIG.start}
                toneMapped={false}
                depthTest={false}
                transparent
                opacity={focus === "rotation" ? 0.95 : 0.6}
              />
            </mesh>
          );
        })
      )}

      {/* Where the rig stands for each pass — the other count, made of dots. */}
      {stops.map((stop, i) => (
        <mesh key={`stop-${i}`} position={stop.position} raycast={() => null} renderOrder={5}>
          <sphereGeometry args={[dot * 2.4, 14, 14]} />
          <meshBasicMaterial
            color={focus === "distance" ? CAMERA_RIG.selected : CAMERA_RIG.start}
            toneMapped={false}
            depthTest={false}
          />
        </mesh>
      ))}
    </group>
  );
}

/**
 * The orbit ring: the master's turntable, drawn around the master and dragged
 * to turn it. The cameras hold still — they're locked on the master, so the
 * only rotation that changes what they capture is the subject's own.
 *
 * The drag target is a large invisible disc rather than the ring itself,
 * because a 2px ring is impossible to stay on with a mouse. It only enters the
 * raycast once a drag has started — otherwise it would swallow every click in
 * the viewport, including the ones that select objects.
 */
function OrbitRing({
  guide,
  onOrbit,
}: {
  guide: Extract<CameraGuide, { kind: "orbit" }>;
  onOrbit: (deg: number) => void;
}) {
  const [dragging, setDragging] = useState(false);
  const { centre, y, radius, azimuth, arc } = guide;

  // OrbitControls binds its own DOM listeners, so R3F's stopPropagation can't
  // hold it off — without suspending it, dragging the ring tumbles the VIEW at
  // the same time as it swings the rig, and neither movement is controllable.
  // `makeDefault` on OrbitControls is what puts it in state.controls.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const controls = useThree((s) => s.controls as any);
  const suspend = (off: boolean) => {
    if (controls) controls.enabled = !off;
  };

  const handleAt = (deg: number): [number, number, number] => {
    const t = (deg * Math.PI) / 180;
    return [centre[0] + Math.sin(t) * radius, y, centre[2] + Math.cos(t) * radius];
  };

  const angleFrom = (point: Vector3) =>
    (Math.atan2(point.x - centre[0], point.z - centre[2]) * 180) / Math.PI;

  const start = (e: { stopPropagation: () => void; target: unknown; pointerId: number }) => {
    e.stopPropagation();
    (e.target as Element).setPointerCapture(e.pointerId);
    setDragging(true);
    suspend(true);
  };

  const end = (e: { target: unknown; pointerId: number }) => {
    (e.target as Element).releasePointerCapture(e.pointerId);
    setDragging(false);
    suspend(false);
  };

  /** The captured wedge, as its own polyline over the full circle. */
  const arcPoints = (() => {
    const sweep = ((arc.end - arc.start) % 360 + 360) % 360 || 360;
    const steps = Math.max(8, Math.round((sweep / 360) * RING_SEGMENTS));
    return Array.from({ length: steps + 1 }, (_, i) => {
      const t = ((arc.start + (sweep * i) / steps) * Math.PI) / 180;
      return [centre[0] + Math.sin(t) * radius, y, centre[2] + Math.cos(t) * radius] as [
        number,
        number,
        number,
      ];
    });
  })();

  const full = Math.abs((((arc.end - arc.start) % 360) + 360) % 360) === 0;

  return (
    <group>
      {/* The whole turntable, dashed — everything the rig COULD sweep. */}
      <GuideRing centre={centre} y={y} radius={radius} live={dragging} dashed={!full} />

      {/* And the wedge it will actually sweep, laid over it solid. Drawn only
          when the arc is narrower than a revolution; over a full turn the two
          lines would be the same circle drawn twice. */}
      {!full && (
        <Line
          points={arcPoints}
          color={CAMERA_RIG.selected}
          lineWidth={2.5}
          transparent
          opacity={0.95}
          raycast={() => null}
          depthTest={false}
          renderOrder={4}
        />
      )}

      {/* Where the arc opens and closes. Two marks rather than one, because
          "from here, round to there" is the shape of the setting. */}
      {!full &&
        ([
          ["start", arc.start],
          ["end", arc.end],
        ] as const).map(([which, deg]) => (
          <mesh key={which} position={handleAt(deg)} raycast={() => null} renderOrder={5}>
            <sphereGeometry args={[Math.max(0.18, radius * 0.035), 16, 16]} />
            <meshBasicMaterial
              color={which === "start" ? CAMERA_RIG.selected : CAMERA_RIG.afterimage}
              toneMapped={false}
              depthTest={false}
            />
          </mesh>
        ))}

      {/* Invisible drag plane, live only while dragging. */}
      <mesh
        position={[centre[0], y, centre[2]]}
        rotation={[-Math.PI / 2, 0, 0]}
        visible={false}
        /* `undefined` does NOT mean "default" here: R3F assigns the prop
           straight onto the object, so it leaves `mesh.raycast === undefined`
           and three.js then throws "object.raycast is not a function" on every
           subsequent raycast — one drag of this ring and the viewport stops
           responding to clicks entirely. The default has to be named. */
        raycast={dragging ? Mesh.prototype.raycast : () => null}
        onPointerMove={(e) => {
          if (!dragging) return;
          e.stopPropagation();
          onOrbit(angleFrom(e.point));
        }}
        onPointerUp={end}
      >
        <circleGeometry args={[Math.max(radius * 4, 200), 8]} />
        <meshBasicMaterial />
      </mesh>

      {/* The grab handle, sitting on the ring at the camera's own angle. */}
      <mesh
        position={handleAt(azimuth)}
        onPointerDown={start}
        onPointerMove={(e) => {
          if (!dragging) return;
          e.stopPropagation();
          onOrbit(angleFrom(e.point));
        }}
        onPointerUp={end}
        onPointerOver={() => (document.body.style.cursor = "grab")}
        onPointerOut={() => (document.body.style.cursor = "auto")}
        renderOrder={4}
      >
        <sphereGeometry args={[Math.max(0.25, radius * 0.045), 20, 20]} />
        <meshBasicMaterial
          color={dragging ? CAMERA_RIG.selected : CAMERA_RIG.start}
          toneMapped={false}
          depthTest={false}
        />
      </mesh>
    </group>
  );
}

/**
 * The climb grip — a flat bar across the sweep line, not a ball on it.
 *
 * A sphere reads as a joint: something to swing the line around. This is a
 * SLIDER, and the shape people already know for one is a short bar lying across
 * the track, which is also what the panels' own resize grips look like. It
 * turns to face the viewer so it stays a bar rather than collapsing to a line
 * when the rig is orbited, and it carries an invisible box around it because a
 * 4px-thick target is not something anyone can reliably grab.
 */
function ClimbGrip({
  position,
  size,
  live,
  ...handlers
}: {
  position: [number, number, number];
  size: number;
  live: boolean;
} & Pick<
  React.ComponentProps<"mesh">,
  "onPointerDown" | "onPointerMove" | "onPointerUp" | "onPointerOver" | "onPointerOut"
>) {
  const ref = useRef<Group>(null);

  useFrame(({ camera }) => {
    const g = ref.current;
    if (!g) return;
    // Billboarded about Y only: the bar stays horizontal (it measures height)
    // while its face keeps turning to the camera.
    g.rotation.y = Math.atan2(camera.position.x - position[0], camera.position.z - position[2]);
  });

  const width = size * 3.4;
  const thickness = size * 0.5;

  return (
    <group ref={ref} position={position}>
      {/* The visible bar, plus a paler cap line above it so the grip reads as a
          control with a direction rather than a floating slab. */}
      <mesh renderOrder={5} {...handlers}>
        <boxGeometry args={[width, thickness, thickness * 0.6]} />
        <meshBasicMaterial
          color={live ? CAMERA_RIG.selected : CAMERA_RIG.start}
          toneMapped={false}
          depthTest={false}
        />
      </mesh>

      {/* Grab target: generous and see-through. TRANSPARENT, not `visible=false`
          — an invisible object is skipped by the raycaster, so the pointer fell
          straight past this to OrbitControls and dragging the grip tumbled the
          view instead of moving the rig. */}
      <mesh renderOrder={6} {...handlers}>
        <boxGeometry args={[width * 1.3, size * 2.6, size * 2.6]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} depthTest={false} />
      </mesh>
    </group>
  );
}

/**
 * RIG HANDLES — direct manipulation of a capture rig in the viewport.
 *
 * Two gestures, because a turntable rig only has two degrees of freedom worth
 * dragging once the master is chosen:
 *
 *   · Grab either CAMERA and swing it. Both ends travel — the pair is one
 *     instrument, and orbiting half a sweep would tilt the plane the capture
 *     runs in. Each keeps its own height and its own ground radius, so the
 *     shot's framing is untouched and only the bearing changes.
 *
 *   · Grab the handle on the SWEEP LINE and pull it up or down. That is the
 *     climb between the two ends. The far camera stays exactly as far from the
 *     master as it was (see `withVerticalSpan`), so raising the sweep arcs it
 *     over the object instead of walking it away — which is what keeps this
 *     gesture and the Distance control talking about the same rig.
 *
 * Both suspend OrbitControls for the duration. R3F's stopPropagation can't hold
 * it off — it binds its own DOM listeners — so without this the view tumbles
 * underneath the drag and neither movement is controllable.
 */
function RigHandles({
  guide,
  onOrbit,
  onSpan,
}: {
  guide: Extract<CameraGuide, { kind: "rig" }>;
  onOrbit: (deg: number) => void;
  onSpan: (metres: number) => void;
}) {
  // The gesture lives in a REF as well as state. A pointermove can land in the
  // same tick as the pointerdown that started the drag, before React has
  // re-rendered with the new state — so the guard reads the ref (synchronous,
  // always current) while the colour reads the state.
  const active = useRef<null | "orbit" | "span">(null);
  /** cursor-to-grip distance at pointer-down, so the grip can't jump */
  const grabOffset = useRef(0);
  const [drag, setDrag] = useState<null | "orbit" | "span">(null);
  const { centre, start, end } = guide;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const controls = useThree((s) => s.controls as any);
  const camera = useThree((s) => s.camera);
  const plane = useMemo(() => new Plane(), []);
  const hit = useMemo(() => new Vector3(), []);
  const normal = useMemo(() => new Vector3(), []);
  const point = useMemo(() => new Vector3(), []);

  /**
   * Where the pointer is in the world, resolved against the surface the gesture
   * moves along — NOT against the handle's own geometry.
   *
   * `e.point` would be the spot on the grab sphere the ray happened to touch,
   * which drifts by the sphere's radius and stops updating the moment the
   * pointer leaves it. Since the handle holds pointer capture for the whole
   * drag, the ray is the only thing that keeps tracking, so both gestures
   * intersect it with a plane of their own:
   *
   *   · orbit — the horizontal plane the near camera stands on
   *   · climb — a vertical plane through the rig, turned to face the viewer, so
   *     dragging up is dragging up from wherever you happen to be orbiting
   */
  const orbitAt = (ray: Ray): number | null => {
    plane.set(UP, -start[1]);
    if (!ray.intersectPlane(plane, hit)) return null;
    return (Math.atan2(hit.x - centre[0], hit.z - centre[2]) * 180) / Math.PI;
  };

  const heightAt = (ray: Ray): number | null => {
    normal.set(camera.position.x - start[0], 0, camera.position.z - start[2]);
    if (normal.lengthSq() < 1e-6) return null;
    plane.setFromNormalAndCoplanarPoint(
      normal.normalize(),
      point.set(start[0], start[1], start[2])
    );
    return ray.intersectPlane(plane, hit) ? hit.y : null;
  };

  const suspend = (off: boolean) => {
    if (controls) controls.enabled = !off;
  };

  const begin =
    (kind: "orbit" | "span") =>
    (e: { stopPropagation: () => void; target: unknown; pointerId: number; ray?: Ray }) => {
      e.stopPropagation();
      (e.target as Element).setPointerCapture(e.pointerId);
      // Where the grip was grabbed, relative to where it sits. Without this the
      // climb jumps to wherever the cursor happened to be on the first frame —
      // and since the grip rides the MIDPOINT of the sweep, that jump halved
      // the rig's height the instant you touched it.
      if (kind === "span" && e.ray) {
        const y = heightAt(e.ray);
        grabOffset.current = y === null ? 0 : y - (start[1] + end[1]) / 2;
      }
      active.current = kind;
      setDrag(kind);
      suspend(true);
    };

  const move =
    (kind: "orbit" | "span") =>
    (e: { stopPropagation: () => void; ray: Ray }) => {
      if (active.current !== kind) return;
      e.stopPropagation();
      if (kind === "orbit") {
        const deg = orbitAt(e.ray);
        if (deg !== null) onOrbit(deg);
      } else {
        // The grip is the sweep's MIDPOINT, so it moves half as far as the far
        // camera does: drag it down a metre and the top of the rig comes down
        // two. Solving the midpoint back into a climb is what makes the gesture
        // read as "pull the rig down" rather than "set a number".
        const y = heightAt(e.ray);
        if (y !== null) onSpan(2 * (y - grabOffset.current - start[1]));
      }
    };

  const finish = (e: { target: unknown; pointerId: number }) => {
    (e.target as Element).releasePointerCapture(e.pointerId);
    active.current = null;
    setDrag(null);
    suspend(false);
    document.body.style.cursor = "auto";
  };

  const cursor = (c: string) => () => {
    if (!active.current) document.body.style.cursor = c;
  };

  const groundRadius = Math.hypot(start[0] - centre[0], start[2] - centre[2]);
  const endRadius = Math.hypot(end[0] - centre[0], end[2] - centre[2]);
  const grip = Math.max(0.22, groundRadius * 0.05);

  return (
    <group>
      {/* The circle each end runs along, so the result of a swing is legible
          before it's made. */}
      <GuideRing centre={centre} y={start[1]} radius={groundRadius} live={drag === "orbit"} dashed />
      <GuideRing centre={centre} y={end[1]} radius={endRadius} live={drag === "orbit"} dashed />

      {/* Grab spheres on both cameras — either one swings the pair. */}
      {[start, end].map((p, i) => (
        <mesh
          key={i}
          position={p}
          onPointerDown={begin("orbit")}
          onPointerMove={move("orbit")}
          onPointerUp={finish}
          onPointerOver={cursor("grab")}
          onPointerOut={cursor("auto")}
          renderOrder={4}
        >
          <sphereGeometry args={[grip, 18, 18]} />
          <meshBasicMaterial
            color={drag === "orbit" ? CAMERA_RIG.selected : CAMERA_RIG.start}
            toneMapped={false}
            transparent
            opacity={0.85}
            depthTest={false}
          />
        </mesh>
      ))}

      {/* --------------------------------------------------------- climb grip */}
      {/* A knob ON the sweep line, not a ruler beside it.
          The offset gauge was a second vertical bar a metre to the side of the
          dotted one, and with the rig orbited it was ambiguous which of the two
          you were meant to grab — so the handle now rides the line it edits, at
          its midpoint, where it can't be mistaken for anything else. Dragging it
          moves the FAR camera; the near end is the datum the climb measures
          from. */}
      <ClimbGrip
        position={[(start[0] + end[0]) / 2, (start[1] + end[1]) / 2, (start[2] + end[2]) / 2]}
        size={grip}
        live={drag === "span"}
        onPointerDown={begin("span")}
        onPointerMove={move("span")}
        onPointerUp={finish}
        onPointerOver={cursor("ns-resize")}
        onPointerOut={cursor("auto")}
      />

      {/* The climb in metres, next to the knob, so the drag has a number. */}
      <Html
        position={[
          (start[0] + end[0]) / 2,
          (start[1] + end[1]) / 2,
          (start[2] + end[2]) / 2,
        ]}
        center
        distanceFactor={10}
        style={{ pointerEvents: "none", transform: "translateX(38px)" }}
      >
        <span
          style={{
            background: READOUT.bg,
            color: drag === "span" ? CAMERA_RIG.selected : READOUT.ink,
            padding: "2px 6px",
            borderRadius: 6,
            fontSize: 11,
            fontVariantNumeric: "tabular-nums",
            whiteSpace: "nowrap",
          }}
        >
          {(end[1] - start[1]).toFixed(1)} m
        </span>
      </Html>
    </group>
  );
}

export function SceneCanvas({
  scene,
  gizmoMode,
  showGizmo,
  controlsRef,
  cameraRef,
  onViewChange,
  cameraGuide,
  onOrbit,
  onSpan,
  volumeEdit,
  substitute,
  gizmoInset = 0,
}: SceneCanvasProps) {
  const [meshes, setMeshes] = useState<Record<string, Object3D>>({});

  // Auto-orbit around the focused object. Held off until FocusRig's fly-in has
  // landed (otherwise the spin fights the lerp), and paused while the transform
  // gizmo is being dragged — OrbitControls keeps auto-rotating even when
  // `enabled` is false, which would make precise dragging impossible.
  const [focusSettled, setFocusSettled] = useState(false);
  const [transforming, setTransforming] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const gizmoRef = useRef<any>(null);
  const selectedId = scene.selectedId;
  useEffect(() => setFocusSettled(false), [selectedId]);

  const register = useCallback((id: string, mesh: Object3D | null) => {
    setMeshes((prev) => {
      if (mesh) return prev[id] === mesh ? prev : { ...prev, [id]: mesh };
      if (!(id in prev)) return prev;
      const rest = { ...prev };
      delete rest[id];
      return rest;
    });
  }, []);

  /**
   * Objects a guide is standing in for, and which therefore aren't in the scene
   * graph right now. Nothing may attach to them — see `gizmoOn`.
   */
  const guideHides = cameraGuide?.kind === "distance" ? cameraGuide.hides : undefined;

  /**
   * The selected group, if the selection IS one.
   *
   * A group never registers a mesh, so `selMesh` is null for it and the ordinary
   * gizmo path below stays switched off — which is what lets the two gizmos
   * coexist without either testing for the other.
   */
  const selectedGroup = scene.selected?.group ? scene.selected : null;

  /**
   * Which objects wear the selected outline besides the selection itself: a
   * marquee's catch, or the contents of a selected group.
   */
  const litIds = useMemo(() => {
    if (scene.selectedIds.length > 0) return scene.selectedIds;
    if (!selectedGroup) return undefined;
    return subtreeIds(scene.objects, selectedGroup.id).filter((id) => id !== selectedGroup.id);
  }, [scene.selectedIds, scene.objects, selectedGroup]);

  /**
   * WHAT A CLICK IN THE VIEWPORT SELECTS — the group first, the object after.
   *
   * A group draws nothing of its own (`SceneWorld` filters it out), so the only
   * way to reach one in the viewport is through something it holds. Every such
   * click used to land on the individual object, which meant a group could be
   * moved, turned or scaled as a unit only by finding its row in the layers
   * tree — the gesture the viewport offers for "take this whole set" did not
   * exist, and grouping things made them harder to handle, not easier.
   *
   * So a click walks DOWN the chain rather than straight to the leaf. First
   * click on a chair inside a room takes the room; a second takes the chair.
   * Nesting is handled by the same rule one level at a time, and clicking empty
   * space (`onPointerMissed`) drops out of the chain entirely, so the next click
   * starts at the outermost group again.
   *
   * A SIBLING DOES NOT COST A SECOND CLICK. Once something inside a group is
   * held, that group has been opened — clicking a different object in it lands
   * on that object directly rather than bouncing back to the group. Otherwise
   * adjusting six chairs in a room would mean twelve clicks, half of them
   * re-selecting a room the user is plainly already working inside.
   *
   * THE LAYERS TREE IS DELIBERATELY NOT ROUTED THROUGH THIS. It draws the
   * hierarchy, and a row in it names exactly one object — clicking a nested
   * child there means that child, not the box around it.
   */
  const pick = (id: string) => {
    const groups = ancestorIds(scene.objects, id);
    if (groups.length === 0) {
      scene.select(id);
      return;
    }
    // Outermost group → … → innermost group → the object itself.
    const chain = [...groups].reverse();
    chain.push(id);

    const held = scene.selectedId;
    if (!held) {
      scene.select(chain[0]);
      return;
    }

    // Holding a link of this very chain: step one down it.
    const at = chain.indexOf(held);
    if (at >= 0) {
      scene.select(chain[Math.min(at + 1, chain.length - 1)]);
      return;
    }

    /* Holding something else. If it sits inside one of these groups then that
       group is already open, and the click belongs to whatever is under the
       cursor at the next level down — the deepest such group wins, so a click
       inside a nested room doesn't jump back out to the building. */
    const heldGroups = new Set(ancestorIds(scene.objects, held));
    let open = -1;
    for (let i = 0; i < chain.length - 1; i++) {
      if (heldGroups.has(chain[i])) open = i;
    }
    scene.select(open < 0 ? chain[0] : chain[open + 1]);
  };

  const selMesh = scene.selectedId ? meshes[scene.selectedId] : null;
  // Gizmo (and its readout/skin) only exist while Object settings is open — and
  // never on a locked object, which is the whole point of the lock: still
  // selectable and inspectable, just not draggable.
  //
  // Nor on anything a guide has hidden. TransformControls throws outright when
  // its target leaves the scene graph ("must be a part of the scene graph"),
  // and that throw comes from inside the render loop — one frame later the
  // whole viewport is black. The distance preview unmounts the two rig cameras,
  // so this is not hypothetical.
  const gizmoOn =
    !!selMesh &&
    showGizmo &&
    !scene.selected?.locked &&
    !(scene.selectedId && guideHides?.includes(scene.selectedId));

  const commitTransform = () => {
    if (!selMesh || !scene.selectedId) return;
    const pose = {
      position: [selMesh.position.x, selMesh.position.y, selMesh.position.z] as [
        number,
        number,
        number,
      ],
      rotationDeg: [
        selMesh.rotation.x * R2D,
        selMesh.rotation.y * R2D,
        selMesh.rotation.z * R2D,
      ] as [number, number, number],
      scale: [selMesh.scale.x, selMesh.scale.y, selMesh.scale.z] as [number, number, number],
    };
    // Dragging a previewed stand-in adjusts the STAND-IN. Writing to the scene
    // here would move the object it replaces and take the whole arrangement —
    // and the capture rig framed on it — along for the ride.
    if (substitute && substitute.object.id === scene.selectedId) {
      substitute.onTransform(pose);
      return;
    }
    scene.update(scene.selectedId, pose);
  };

  // Framing for the focus fly-in. A camera isn't framed on its own body — its
  // job is to capture, so selecting one pulls back to show the WHOLE rig (both
  // cameras and the sweep between them) rather than zooming onto one lens.
  const sel = scene.selected;
  const rig = sel?.rigId ? scene.rigs.find((r) => r.id === sel.rigId) : undefined;
  let focusCenter: [number, number, number] | null = sel ? sel.position : null;
  let focusRadius = sel ? 0.7 * Math.max(...sel.scale) : 0;
  // A group is framed on WHAT IT HOLDS. Its own scale is 1 until somebody
  // changes it, so the ordinary radius would fly the camera to within a metre
  // of the centre of a twelve-metre set and frame the empty air between the
  // objects rather than the objects.
  if (sel?.group) {
    const kids = new Set(subtreeIds(scene.objects, sel.id));
    kids.delete(sel.id);
    const contents = scene.objects.filter((o) => kids.has(o.id) && !o.group);
    if (contents.length > 0) focusRadius = Math.max(1, radiusOf(contents, sel.position));
  }
  if (sel && rig) {
    const { start, end } = scene.rigCameras(rig);
    if (start && end) {
      focusCenter = [
        (start.position[0] + end.position[0]) / 2,
        (start.position[1] + end.position[1]) / 2,
        (start.position[2] + end.position[2]) / 2,
      ];
      // Half the separation frames both ends; the floor keeps a collapsed rig
      // from framing to nothing.
      focusRadius = Math.max(1.5, distance(start.position, end.position) * 0.6);
    }
  }

  return (
    <Canvas
      className="!absolute inset-0"
      dpr={[1, 2]}
      gl={{ alpha: true, antialias: true, preserveDrawingBuffer: true }}
      camera={{ position: [7, 5, 9], fov: 45, near: 0.1, far: 1000 }}
      onPointerMissed={() => scene.select(null)}
    >
      <CameraGrabber cameraRef={cameraRef} />

      <SceneWorld
        scene={scene}
        register={register}
        selectedId={scene.selectedId}
        litIds={litIds}
        substitute={substitute?.object ?? null}
        onSelect={pick}
        hideIds={guideHides}
      />

      {/* A selected group gets the same three transforms a mesh gets. Locked
          stops it, as it stops a mesh: the lock is the one flag that means
          "listed, selectable, and not to be moved". */}
      {selectedGroup && showGizmo && !selectedGroup.locked && (
        <GroupGizmo
          key={selectedGroup.id}
          group={selectedGroup}
          mode={gizmoMode}
          onChange={(patch) => scene.update(selectedGroup.id, patch)}
          onGrab={setTransforming}
        />
      )}

      {/* The volumes, and the affordances that change them.
          Drawn AFTER the world so their translucent faces composite over the
          objects inside rather than being written into the depth buffer in
          front of them, and drawn HERE rather than inside SceneWorld because
          SceneWorld is also what renders a captured frame — a dataset image
          with a violet box across it would be a picture of the tool. */}
      {scene.volumes.map((v) => (
        <VolumeBox
          key={v.id}
          volume={v}
          selected={v.id === scene.selectedVolumeId}
          onSelect={() => scene.selectVolume(v.id)}
          /* Only the SELECTED object lights a face. Every object pressed to a
             wall lighting one at once would be a room outlined in amber, which
             says nothing about the thing currently in your hand. */
          contact={
            v.id === scene.selectedVolumeId && v.contain && sel && sel.source !== "camera"
              ? contactWalls(v, sel)
              : undefined
          }
        />
      ))}
      {/* Handles belong to the FOCUSED space. A box you can see but haven't
          picked up is scenery; growing grips on it would be nine invitations to
          resize something you were only looking at. */}
      {volumeEdit?.gizmo && !volumeEdit.drawing && scene.selectedVolume && (
        <VolumeHandles
          volume={scene.selectedVolume}
          gizmo={volumeEdit.gizmo}
          onResize={volumeEdit.onResize}
          onDragging={volumeEdit.onDragging}
        />
      )}
      {/* Move is the editor's own transform gizmo, not a handle set of the
          room's own. Keyed on the volume so a different room gets a fresh
          proxy rather than one that starts at the last room's centre. */}
      {volumeEdit?.gizmo === "move" && !volumeEdit.drawing && scene.selectedVolume && (
        <VolumeMoveGizmo
          key={scene.selectedVolume.id}
          volume={scene.selectedVolume}
          onResize={volumeEdit.onResize}
        />
      )}
      {volumeEdit?.drawing && (
        <VolumeDraw onDone={volumeEdit.onDrawn} onCancel={volumeEdit.onCancelDraw} />
      )}

      {gizmoOn && (
        <TransformControls
          ref={gizmoRef}
          object={selMesh}
          mode={gizmoMode}
          onObjectChange={commitTransform}
          onMouseDown={() => {
            setTransforming(true);
            if (controlsRef.current) controlsRef.current.enabled = false;
          }}
          onMouseUp={() => {
            setTransforming(false);
            if (controlsRef.current) controlsRef.current.enabled = true;
          }}
        />
      )}
      {gizmoOn && <UnrealGizmoSkin key={`${scene.selectedId}-${gizmoMode}`} gizmoRef={gizmoRef} />}
      {gizmoOn && <GizmoReadout gizmoRef={gizmoRef} />}

      <OrbitControls
        ref={controlsRef}
        makeDefault
        enableDamping
        dampingFactor={0.08}
        minDistance={2}
        /**
         * Far enough out to frame a room.
         *
         * It was 60 m, which is a sensible ceiling for orbiting one object and
         * far too near for a defined space: a 40 m footprint cannot be seen
         * whole from 60 m, so the edge dolly would run into this limit halfway
         * through the drag that created it and simply stop.
         */
        maxDistance={160}
        maxPolarAngle={Math.PI / 2.05}
        autoRotate={!!selectedId && focusSettled && !transforming}
        autoRotateSpeed={0.9}
      />

      <FocusRig
        controlsRef={controlsRef}
        focusId={scene.selectedId}
        center={focusCenter}
        radius={focusRadius}
        onSettled={() => setFocusSettled(true)}
      />

      <KeyboardFly controlsRef={controlsRef} />

      {onViewChange && <ViewProbe controlsRef={controlsRef} onChange={onViewChange} />}

      {cameraGuide?.kind === "distance" && <DistanceHalos guide={cameraGuide} />}
      {cameraGuide?.kind === "shots" && <ShotMarkers guide={cameraGuide} />}
      {cameraGuide?.kind === "rig" && onOrbit && onSpan && (
        <RigHandles guide={cameraGuide} onOrbit={onOrbit} onSpan={onSpan} />
      )}
      {cameraGuide?.kind === "orbit" && onOrbit && (
        <OrbitRing guide={cameraGuide} onOrbit={onOrbit} />
      )}

      <OrientationGizmo inset={gizmoInset} controlsRef={controlsRef} />
    </Canvas>
  );
}

/** Matches the dock panel's own arrival — `panel-in`, 0.26s, the same curve. A
 *  shared duration is what makes the two read as one movement. */
const GIZMO_STEP_MS = 300;
const easeOutExpo = (t: number) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t));

/**
 * The orientation cube, and the easing that carries it out of the dock's way.
 *
 * The cube steps left when a tool panel opens. It used to arrive there in one
 * frame — the panel slid in over 260ms while the cube teleported — and since
 * every other ornament anchored to the cube had to hold still with it, the whole
 * right-hand corner snapped while the panel eased. That mismatch was the part
 * that read as broken.
 *
 * GizmoHelper positions the cube from its `margin` prop, and it OVERWRITES the
 * group's quaternion every frame to track the camera, so a tween can't be hidden
 * in a child group — a child offset would tumble with the cube. The margin is
 * therefore what has to move, which means React state, which means a re-render
 * per frame of the tween. That's why this is its own component: the re-renders
 * are confined to the gizmo subtree rather than running through the whole canvas.
 */
function OrientationGizmo({
  inset,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  controlsRef,
}: {
  inset: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  controlsRef: React.MutableRefObject<any>;
}) {
  const [eased, setEased] = useState(inset);
  const from = useRef(inset);

  useEffect(() => {
    const start = performance.now();
    const a = from.current;
    if (a === inset) return;

    let raf = 0;
    const step = () => {
      const t = Math.min(1, (performance.now() - start) / GIZMO_STEP_MS);
      const next = a + (inset - a) * easeOutExpo(t);
      from.current = next;
      setEased(next);
      if (t < 1) raf = requestAnimationFrame(step);
      else from.current = inset;
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [inset]);

  return (
    /* Sits under the top-right action cluster, and lines up with the left
       rail: the rail's first tool starts at x=16 / y=80, so the cube's ink
       has to start there too.

       The margin is measured to the cube's CENTRE, not to its ink, so both
       numbers have to carry the ring's reach — the step arrows are the
       outermost thing drawn, tips at TRI_TIP × CUBE_PX from centre in every
       direction. Derived rather than typed, so resizing the cube keeps the
       ornament aligned instead of silently drifting into the corner. */
    <GizmoHelper alignment="top-right" margin={[16 + eased + GIZMO_REACH, 80 + GIZMO_REACH]}>
      {/* The ring arrows need the real scene camera and orbit pivot, which the
          gizmo's HUD store doesn't expose — the controls carry both. */}
      <ViewCube controlsRef={controlsRef} />
    </GizmoHelper>
  );
}
