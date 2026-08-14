import { useEffect, useRef, useState } from "react";
import { Html } from "@react-three/drei";
import { BackSide, type Group, type Object3D } from "three";
import { aimAt } from "./camera-rig";
import { CAMERA_RIG } from "./scene-palette";
import type { SceneObject } from "./scene-types";

const D2R = Math.PI / 180;

/** The camera body, shared by the real cameras and their ghosts so a preview of
 *  "where this would stand" is unmistakably the same object. */
const BODY: [number, number, number] = [0.5, 0.4, 0.62];

/**
 * CameraObjectMesh — one camera of a capture rig, drawn as a body plus the
 * frustum it's looking down.
 *
 * LOCK-ON. The camera always faces the master object, so the master stays the
 * subject of every captured frame. The user's Rotation setting is applied as an
 * OFFSET on top of that aim rather than replacing it — otherwise the control
 * would either fight the lock-on or be decorative, and both are worse than a
 * rotation that means "nudge the framing".
 *
 * Without a master there's nothing to lock onto, so the object's own rotation
 * is the whole story.
 */
export function CameraObjectMesh({
  object,
  masterPosition,
  selected,
  onSelect,
  register,
}: {
  object: SceneObject;
  masterPosition: [number, number, number] | null;
  selected: boolean;
  onSelect: (id: string) => void;
  register: (id: string, node: Object3D | null) => void;
}) {
  // Typed as Group, not Object3D: R3F's <group> ref is Ref<Group>, and the
  // looser type is what makes the equivalent line in SceneObjectMesh an error.
  const ref = useRef<Group>(null);
  const [hovered, setHovered] = useState(false);

  useEffect(() => {
    register(object.id, ref.current);
    return () => register(object.id, null);
  }, [object.id, register]);

  useEffect(() => () => void (document.body.style.cursor = "auto"), []);

  const setHover = (on: boolean) => {
    setHovered(on);
    document.body.style.cursor = on ? "pointer" : "auto";
  };

  /**
   * The body turns to face the master but never TILTS to it.
   *
   * Only the yaw is taken from the aim; pitch and roll are dropped. A rig's two
   * cameras sit at different heights, so an aimed pitch made the upper one hang
   * nose-down and the pair stopped reading as one instrument — and every drag of
   * the climb handle rolled both of them while the user was trying to set a
   * height. The lens still points at the master in plan; the elevation it
   * shoots from is the rig's geometry, not the model's pose.
   */
  const aim = masterPosition ? aimAt(object.position, masterPosition) : [0, 0, 0];
  const rotation: [number, number, number] = [
    object.rotationDeg[0] * D2R,
    (aim[1] + object.rotationDeg[1]) * D2R,
    object.rotationDeg[2] * D2R,
  ];

  const isStart = object.cameraRole === "start";
  const tint = isStart ? CAMERA_RIG.start : CAMERA_RIG.end;
  const outline = selected ? CAMERA_RIG.selected : CAMERA_RIG.hover;

  return (
    <group
      ref={ref}
      position={object.position}
      rotation={rotation}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(object.id);
      }}
      onPointerOver={(e) => {
        e.stopPropagation();
        setHover(true);
      }}
      onPointerOut={() => setHover(false)}
    >
      {/* Body */}
      <mesh castShadow>
        <boxGeometry args={BODY} />
        <meshStandardMaterial color={tint} metalness={0.35} roughness={0.45} />
      </mesh>

      {/* Lens barrel, pointing along +Z — the direction `aimAt` yaws toward. */}
      <mesh position={[0, 0, 0.4]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.14, 0.18, 0.3, 24]} />
        <meshStandardMaterial color={tint} metalness={0.5} roughness={0.3} />
      </mesh>

      {/* Frustum — a four-sided pyramid opening away from the body, so the
          direction of capture is readable at a glance from any angle. */}
      <mesh position={[0, 0, 1.05]} rotation={[Math.PI / 2, Math.PI / 4, 0]}>
        <coneGeometry args={[0.62, 1.1, 4, 1, true]} />
        <meshBasicMaterial color={tint} wireframe transparent opacity={0.55} toneMapped={false} />
      </mesh>

      {(selected || hovered) && (
        <mesh scale={1.12} raycast={() => null}>
          <boxGeometry args={BODY} />
          <meshBasicMaterial color={outline} side={BackSide} toneMapped={false} />
        </mesh>
      )}

      {/* Which end of the sweep this is. The rig only makes sense as a pair, so
          the labels have to be legible without selecting anything. */}
      <Html center position={[0, 0.55, 0]} zIndexRange={[20, 0]} style={{ pointerEvents: "none" }}>
        <span
          className="type-caption-strong whitespace-nowrap rounded-full px-2 py-0.5"
          style={{
            background: "hsl(0 0% 5% / 0.7)",
            color: tint,
            border: `1px solid ${tint}55`,
          }}
        >
          {isStart ? "Start" : "End"}
        </span>
      </Html>
    </group>
  );
}

/**
 * GhostCamera — where a camera WOULD stand, drawn as the reference for the
 * distance you're not currently editing.
 *
 * Setting the nearest distance is a judgement about how much room is left
 * between it and the furthest, so while one end is in hand the pair is stood at
 * the other end in orange: a distance you can see the cameras at is a distance
 * you can actually judge, which a number in a field and a bare ring on the
 * ground are both bad at.
 *
 * Inert by construction — no raycast, no label, no shadow. It's a reading of
 * the rig, not another thing in the scene to click.
 */
export function GhostCamera({
  position,
  lookAt,
  tint = CAMERA_RIG.start,
  solid = false,
}: {
  position: [number, number, number];
  /** the master — a ghost aims where the real camera would, so the frustum
   *  shows the framing that distance would actually give you */
  lookAt: [number, number, number] | null;
  /**
   * Ghosts come in two meanings and must not share a colour. Orange is the rig
   * itself; the afterimage left behind while a distance is being previewed is
   * `CAMERA_RIG.afterimage` — a spot the cameras will RETURN to, not a spot
   * they are.
   */
  tint?: string;
  /** the near-distance preview: this is the rig, not a memory of it */
  solid?: boolean;
}) {
  const aim = lookAt ? aimAt(position, lookAt) : [0, 0, 0];

  return (
    <group position={position} rotation={[0, aim[1] * D2R, 0]}>
      <mesh raycast={() => null} renderOrder={2}>
        <boxGeometry args={BODY} />
        <meshBasicMaterial color={tint} transparent opacity={solid ? 0.85 : 0.35} toneMapped={false} />
      </mesh>
      <mesh raycast={() => null} renderOrder={2}>
        <boxGeometry args={BODY} />
        <meshBasicMaterial color={tint} wireframe transparent opacity={solid ? 1 : 0.9} toneMapped={false} />
      </mesh>
      <mesh position={[0, 0, 0.4]} rotation={[Math.PI / 2, 0, 0]} raycast={() => null} renderOrder={2}>
        <cylinderGeometry args={[0.14, 0.18, 0.3, 24]} />
        <meshBasicMaterial color={tint} transparent opacity={solid ? 0.9 : 0.45} toneMapped={false} />
      </mesh>
      <mesh
        position={[0, 0, 1.05]}
        rotation={[Math.PI / 2, Math.PI / 4, 0]}
        raycast={() => null}
        renderOrder={2}
      >
        <coneGeometry args={[0.62, 1.1, 4, 1, true]} />
        <meshBasicMaterial color={tint} wireframe transparent opacity={0.4} toneMapped={false} />
      </mesh>
    </group>
  );
}
