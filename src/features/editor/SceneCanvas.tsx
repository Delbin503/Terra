import { useCallback, useEffect, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { ContactShadows, Environment, OrbitControls, GizmoHelper, GizmoViewcube, Html, TransformControls } from "@react-three/drei";
import { Vector3, type Camera, type Group, type Object3D } from "three";
import { SceneObjectMesh } from "./SceneObjectMesh";
import { applyUnrealGizmoSkin } from "./unreal-gizmo";
import type { SceneApi } from "./useScene";

const R2D = 180 / Math.PI;

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
}

/** Captures the live camera + canvas element so the DOM drop handler can raycast. */
function CameraGrabber({ cameraRef }: { cameraRef: React.MutableRefObject<CameraHandle | null> }) {
  const { camera, gl } = useThree();
  useEffect(() => {
    cameraRef.current = { camera, dom: gl.domElement };
  }, [camera, gl, cameraRef]);
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
          style={{
            opacity: 0,
            transform: "translateY(-34px)",
            whiteSpace: "nowrap",
            padding: "3px 8px",
            borderRadius: "6px",
            background: "rgba(12,12,12,0.82)",
            border: "1px solid rgba(255,255,255,0.16)",
            color: "#fff",
            font: "500 11px/1.4 var(--font-mono)",
            fontVariantNumeric: "tabular-nums",
          }}
        />
      </Html>
    </group>
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

export function SceneCanvas({ scene, gizmoMode, showGizmo, controlsRef, cameraRef }: SceneCanvasProps) {
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

  const selMesh = scene.selectedId ? meshes[scene.selectedId] : null;
  // Gizmo (and its readout/skin) only exist while Object settings is open.
  const gizmoOn = !!selMesh && showGizmo;

  const commitTransform = () => {
    if (!selMesh || !scene.selectedId) return;
    scene.update(scene.selectedId, {
      position: [selMesh.position.x, selMesh.position.y, selMesh.position.z],
      rotationDeg: [selMesh.rotation.x * R2D, selMesh.rotation.y * R2D, selMesh.rotation.z * R2D],
      scale: [selMesh.scale.x, selMesh.scale.y, selMesh.scale.z],
    });
  };

  return (
    <Canvas
      className="!absolute inset-0"
      dpr={[1, 2]}
      gl={{ alpha: true, antialias: true, preserveDrawingBuffer: true }}
      camera={{ position: [7, 5, 9], fov: 45, near: 0.1, far: 1000 }}
      onPointerMissed={() => scene.select(null)}
    >
      <CameraGrabber cameraRef={cameraRef} />

      <directionalLight
        position={[8, 12, 6]}
        intensity={0.4 * scene.env.brightness}
        color={warmColor(scene.env.warmth)}
        castShadow
      />

      <Environment
        files="/hdri/aarfontein_dusk_4k.exr"
        background
        environmentIntensity={0.35}
        ground={{ height: 15, radius: 60, scale: 400 }}
      />

      {scene.objects.map((o) => (
        <SceneObjectMesh
          key={o.id}
          object={o}
          selected={o.id === scene.selectedId}
          onSelect={scene.select}
          register={register}
        />
      ))}

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
        maxDistance={60}
        maxPolarAngle={Math.PI / 2.05}
        autoRotate={!!selectedId && focusSettled && !transforming}
        autoRotateSpeed={0.9}
      />

      <FocusRig
        controlsRef={controlsRef}
        focusId={scene.selectedId}
        center={scene.selected ? scene.selected.position : null}
        radius={scene.selected ? 0.7 * Math.max(...scene.selected.scale) : 0}
        onSettled={() => setFocusSettled(true)}
      />

      <KeyboardFly controlsRef={controlsRef} />

      <GizmoHelper alignment="top-right" margin={[96, 128]}>
        <GizmoViewcube color="#68635b" textColor="#f5f2ec" strokeColor="#00000040" hoverColor="#d97a2b" />
      </GizmoHelper>
    </Canvas>
  );
}
