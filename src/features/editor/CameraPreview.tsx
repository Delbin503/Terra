import { Suspense } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Icon } from "@/components/icons";
import { SceneWorld } from "./SceneCanvas";
import { CAMERA_RIG } from "./scene-palette";
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
 * own position, so it updates frame-for-frame with the scene. Non-interactive:
 * pointer events pass through to the viewport behind it.
 *
 * Width comes from the column it's stacked in rather than from here, so the
 * preview and the panel under it share one edge.
 */
export function CameraPreview({
  scene,
  camera,
  label,
}: {
  scene: SceneApi;
  camera: SceneObject;
  /** which end of the sweep — drives the accent so it matches the body colour */
  label: string;
}) {
  const target: Vec3 = scene.master ? scene.master.position : [0, 0.5, 0];
  const tint = camera.cameraRole === "end" ? CAMERA_RIG.end : CAMERA_RIG.start;

  return (
    <div
      data-ui="camera-preview"
      className="glass glass-regular pointer-events-none w-full overflow-hidden !rounded-2xl"
    >
      <div className="flex items-center gap-1.5 border-b border-glass/10 px-2.5 py-1.5">
        <Icon name="camera" size={12} style={{ color: tint }} />
        <span className="type-caption-strong truncate text-content">{label}</span>
        <span className="type-caption ml-auto text-content-subtle">POV</span>
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
      </div>
    </div>
  );
}
