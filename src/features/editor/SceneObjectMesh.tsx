import { useEffect, useMemo, useRef, useState } from "react";
import { useGLTF } from "@react-three/drei";
import { BackSide, type Object3D } from "three";
import type { ObjectShape, SceneObject } from "./scene-types";
import { OUTLINE } from "./scene-palette";

const D2R = Math.PI / 180;

/** Outline colours come from the scene palette — three.js materials can't read
 *  CSS tokens, and the outline must stay mode-stable regardless. */
/** How far the outline shell is inflated past the mesh. It's a uniform scale, so
 *  the stroke reads proportionally to the object's on-screen size — keep it small,
 *  since focus mode zooms the object to fill the frame and exaggerates it. */
const OUTLINE_SCALE = 1.014;

const OUTLINE_SELECTED = OUTLINE.selected.css;
const OUTLINE_HOVER = OUTLINE.hover.css;
const OUTLINE_MASTER = OUTLINE.master.css;
const OUTLINE_MASTER_DIM = OUTLINE.masterDim.css;

/** Geometry for a placeholder shape (all roughly 1m so transforms stay consistent). */
function ShapeGeometry({ shape }: { shape: ObjectShape }) {
  switch (shape) {
    case "sphere":
      return <sphereGeometry args={[0.55, 48, 48]} />;
    case "cylinder":
      return <cylinderGeometry args={[0.45, 0.45, 1, 48]} />;
    case "cone":
      return <coneGeometry args={[0.55, 1.1, 48]} />;
    case "torus":
      return <torusGeometry args={[0.4, 0.17, 24, 64]} />;
    case "capsule":
      return <capsuleGeometry args={[0.38, 0.55, 12, 24]} />;
    case "ico":
      return <icosahedronGeometry args={[0.62, 0]} />;
    case "dodec":
      return <dodecahedronGeometry args={[0.62, 0]} />;
  }
}

/** A real imported model (GLB) — rendered with its own authored materials/textures,
 *  cloned per-instance since the loaded scene graph is cached and shared by url. */
function Model({ url }: { url: string }) {
  const { scene } = useGLTF(url);
  const cloned = useMemo(() => {
    const c = scene.clone(true);
    c.traverse((child) => {
      child.castShadow = true;
      child.receiveShadow = true;
    });
    return c;
  }, [scene]);
  return <primitive object={cloned} />;
}

/** Placeholder box (or a real imported model, when the asset carries a modelUrl) for a
 *  dropped 3D object. Registers itself so the shared TransformControls gizmo can attach;
 *  highlights with an outline when selected. */
export function SceneObjectMesh({
  object,
  selected,
  onSelect,
  register,
}: {
  object: SceneObject;
  selected: boolean;
  onSelect: (id: string) => void;
  register: (id: string, node: Object3D | null) => void;
}) {
  const ref = useRef<Object3D>(null);
  const [hovered, setHovered] = useState(false);

  useEffect(() => {
    register(object.id, ref.current);
    return () => register(object.id, null);
  }, [object.id, register]);

  // Don't leave the cursor stuck as a pointer if the object unmounts mid-hover.
  useEffect(() => () => void (document.body.style.cursor = "auto"), []);

  const setHover = (on: boolean) => {
    setHovered(on);
    document.body.style.cursor = on ? "pointer" : "auto";
  };

  return (
    <group
      ref={ref}
      position={object.position}
      rotation={[object.rotationDeg[0] * D2R, object.rotationDeg[1] * D2R, object.rotationDeg[2] * D2R]}
      scale={object.scale}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(object.id);
      }}
      onPointerOver={(e) => {
        // stopPropagation so only the front-most object under the cursor lights up.
        e.stopPropagation();
        setHover(true);
      }}
      onPointerOut={() => setHover(false)}
    >
      {object.modelUrl ? (
        <Model url={object.modelUrl} />
      ) : (
        <>
          <mesh castShadow receiveShadow>
            <ShapeGeometry shape={object.shape} />
            <meshStandardMaterial
              color={object.color}
              metalness={object.metalness}
              roughness={object.roughness}
            />
          </mesh>

          {/* Silhouette for hover and selection — an inflated back-face shell of
              the same geometry. This is what drei's <Outlines> builds internally,
              but done explicitly: Outlines resolves geometry from its runtime
              parent via layout effects, which proved unreliable when mounted
              conditionally here. Owning the shell keeps it deterministic.
              `raycast` is disabled so the shell can't steal the pointer from the
              mesh and thrash the hover state.

              A master object outlines in its own yellow instead of white, so the
              scene's hero object stays identifiable while it's focused. Hover is
              the same hue a step dimmer, keeping selection the stronger read. */}
          {(selected || hovered) && (
            <mesh scale={OUTLINE_SCALE} raycast={() => null}>
              <ShapeGeometry shape={object.shape} />
              <meshBasicMaterial
                color={
                  object.isMaster
                    ? selected
                      ? OUTLINE_MASTER
                      : OUTLINE_MASTER_DIM
                    : selected
                      ? OUTLINE_SELECTED
                      : OUTLINE_HOVER
                }
                side={BackSide}
                toneMapped={false}
              />
            </mesh>
          )}
        </>
      )}
    </group>
  );
}
