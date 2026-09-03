import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useGLTF } from "@react-three/drei";
import {
  BackSide,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  Mesh,
  MeshStandardMaterial,
  type Object3D,
} from "three";
import { materialOf, UNNAMED_SLOT, type ObjectShape, type SceneObject } from "./scene-types";
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

/**
 * Outline colour per dataset role. An object that carries a role outlines in
 * that role's hue instead of white, so which objects are the hero, the clutter
 * and the dressing is answerable by looking at the scene rather than by
 * clicking through the layer list. `none` falls through to the neutral pair.
 */
const ROLE_OUTLINE: Record<string, { on: string; dim: string }> = {
  master: { on: OUTLINE.master.css, dim: OUTLINE.masterDim.css },
  distractor: { on: OUTLINE.distractor.css, dim: OUTLINE.distractorDim.css },
  background: { on: OUTLINE.backdrop.css, dim: OUTLINE.backdropDim.css },
};

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

/* ---------------------------------------------------------------- splats */

/** How far the captured field reaches, in metres. A splat is a PLACE, so it is
 *  not built to the ~1m of the placeholder solids above — a warehouse bay drawn
 *  the size of a chair would read as a prop. */
const SPLAT_RADIUS = 2.2;
const SPLAT_FLOOR = -0.5;
const SPLAT_HEIGHT = 1.9;
/** Enough to read as a surface at arm's length, few enough to stay cheap when
 *  several are placed — the cloud is a stand-in, not the real renderer. */
const SPLAT_POINTS = 2600;

/**
 * The sprite each point is drawn with — a soft round falloff.
 *
 * Without a map, `pointsMaterial` draws flat SQUARES, and a field of hard
 * squares reads as a debug overlay rather than as a capture. A Gaussian is a
 * blob with a soft edge, so the stand-in is too.
 *
 * One texture for every splat in the scene, built on first use: it is 32px of
 * greyscale gradient and identical for all of them, so a per-object copy would
 * be a per-object upload to the GPU for no difference on screen.
 */
let splatSprite: CanvasTexture | null = null;
function pointSprite(): CanvasTexture {
  if (splatSprite) return splatSprite;
  const size = 32;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.45, "rgba(255,255,255,0.72)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  splatSprite = new CanvasTexture(canvas);
  return splatSprite;
}

/**
 * A STAND-IN FOR A RADIANCE FIELD.
 *
 * Terra does not rasterise real Gaussians yet, so this draws what one IS rather
 * than what one looks like: a cloud of coloured points, dense along the floor
 * and the back wall where a walked capture gathers most of its coverage, thinning
 * upward into the air where nobody pointed the camera.
 *
 * It is deliberately NOT one of the placeholder solids. A splat rendered as a
 * grey capsule would sit in the layers tree claiming to be an object you could
 * arrange, and the whole point of the type is that it is the world.
 *
 * Deterministic from the object's own id: the same splat draws the same cloud
 * every frame and across reloads, so nudging its brightness doesn't reshuffle
 * the place underneath.
 */
function splatCloud(id: string): BufferGeometry {
  let n = 0;
  for (let i = 0; i < id.length; i += 1) n = (n * 31 + id.charCodeAt(i)) >>> 0;
  n = (n % 2147483646) + 1;
  const rand = () => ((n = (n * 48271) % 2147483647) / 2147483647);

  const positions = new Float32Array(SPLAT_POINTS * 3);
  const colors = new Float32Array(SPLAT_POINTS * 3);
  const c = new Color();

  for (let i = 0; i < SPLAT_POINTS; i += 1) {
    // Two thirds of the points lie on the floor of the capture, the rest climb
    // the walls — the split a room-scale walkthrough actually produces.
    const onFloor = rand() < 0.62;
    const a = rand() * Math.PI * 2;
    // sqrt keeps a disc scatter even instead of bunching at the centre.
    const r = Math.sqrt(rand()) * SPLAT_RADIUS;

    let x = Math.cos(a) * r;
    let z = Math.sin(a) * r;
    let y = SPLAT_FLOOR + rand() * 0.06;

    if (!onFloor) {
      // Standing structure: pushed out toward the edge of the capture and lifted,
      // thinning with height so the top of the cloud fades rather than stopping.
      const h = Math.pow(rand(), 1.7);
      y = SPLAT_FLOOR + h * SPLAT_HEIGHT;
      const edge = 0.55 + rand() * 0.45;
      x = Math.cos(a) * SPLAT_RADIUS * edge;
      z = Math.sin(a) * SPLAT_RADIUS * edge;
    }

    positions[i * 3] = x;
    positions[i * 3 + 1] = y;
    positions[i * 3 + 2] = z;

    // Photographic rather than synthetic: a narrow warm-grey spread, floor a
    // shade darker than what stands on it, so the cloud has a ground.
    const v = (onFloor ? 0.3 : 0.46) + rand() * 0.34;
    c.setHSL(0.07 + rand() * 0.05, 0.1 + rand() * 0.12, v);
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }

  const geo = new BufferGeometry();
  geo.setAttribute("position", new BufferAttribute(positions, 3));
  geo.setAttribute("color", new BufferAttribute(colors, 3));
  return geo;
}

/**
 * The cloud, plus the two things a cloud can't do for itself: get picked, and
 * show that it is selected.
 *
 * Picking rides on an invisible box rather than on the points — a raycast
 * against 2600 sprites hits between them as often as it hits one, and an object
 * you can only select on the third click reads as broken. Selection draws a
 * wireframe extent for the same reason: there is no silhouette to inflate.
 */
function SplatField({ object, lit }: { object: SceneObject; lit: boolean }) {
  const geometry = useMemo(() => splatCloud(object.id), [object.id]);
  // Dispose with the object — a geometry per placed splat leaks a buffer each
  // time one is deleted otherwise.
  useEffect(() => () => geometry.dispose(), [geometry]);

  // Brightness multiplies the baked vertex colours, which is exactly what the
  // scalar does downstream in the GS render component — so the viewport and the
  // dispatched value mean the same thing. Set as a scalar above 1 on purpose:
  // tone mapping takes the overshoot, the way it would for any HDR value.
  const tint = useMemo(() => new Color().setScalar(object.brightness), [object.brightness]);
  const sprite = useMemo(() => pointSprite(), []);

  const box: [number, number, number] = [
    SPLAT_RADIUS * 2,
    SPLAT_HEIGHT + 0.1,
    SPLAT_RADIUS * 2,
  ];
  const boxY = SPLAT_FLOOR + (SPLAT_HEIGHT + 0.1) / 2;

  return (
    <>
      <points geometry={geometry} raycast={() => null}>
        <pointsMaterial
          size={0.055}
          sizeAttenuation
          vertexColors
          color={tint}
          map={sprite}
          alphaMap={sprite}
          transparent
          opacity={0.95}
          // Off, so points blend with each other instead of the nearer ones
          // punching transparent holes in the ones behind — the artefact that
          // makes a depth-sorted point cloud look shredded as the camera moves.
          depthWrite={false}
          toneMapped
        />
      </points>

      {/* Pick target. Paints nothing — no colour, no depth — and exists only so
          a click anywhere in the captured volume lands on the splat. */}
      <mesh position={[0, boxY, 0]}>
        <boxGeometry args={box} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} colorWrite={false} />
      </mesh>

      {lit && (
        <mesh position={[0, boxY, 0]} raycast={() => null}>
          <boxGeometry args={box} />
          <meshBasicMaterial color={OUTLINE_SELECTED} wireframe transparent opacity={0.5} toneMapped={false} />
        </mesh>
      )}
    </>
  );
}

/**
 * A real imported model (GLB), rendered with its own authored materials and then
 * with the object's slot edits laid over them.
 *
 * TWO CLONES, NOT ONE. `scene.clone(true)` copies the graph but SHARES the
 * materials with the cached original, which drei hands to every instance of the
 * url — so tinting one placed excavator would tint every excavator in the scene
 * and every one placed afterwards. Each instance gets its own material copies.
 *
 * The slot list is matched by material NAME rather than by index, because the
 * order three walks the graph in is not the order the file lists its materials,
 * and a mismatch there paints the glass with the paintwork's roughness.
 */
function Model({
  url,
  object,
  onMaterials,
}: {
  url: string;
  object: SceneObject;
  /** the material names this file actually carries — the slot list comes from here */
  onMaterials: (names: string[]) => void;
}) {
  const { scene } = useGLTF(url);

  const { cloned, materials } = useMemo(() => {
    const c = scene.clone(true);
    // Name → the one material every mesh using it shares within THIS instance,
    // so a model whose body is split across several meshes still edits as one
    // slot rather than as three that have to be kept in step.
    const byName = new Map<string, MeshStandardMaterial>();
    c.traverse((child) => {
      child.castShadow = true;
      child.receiveShadow = true;
      const mesh = child as Mesh;
      if (!mesh.isMesh || !mesh.material) return;
      const src = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
      const name = src.name || UNNAMED_SLOT;
      let mine = byName.get(name);
      if (!mine) {
        mine = src.clone() as MeshStandardMaterial;
        byName.set(name, mine);
      }
      mesh.material = mine;
    });
    return { cloned: c, materials: byName };
  }, [scene]);

  // Free the per-instance copies when the object goes. The geometry is drei's
  // and shared, so it is deliberately left alone.
  useEffect(() => () => materials.forEach((m) => m.dispose()), [materials]);

  // Tell the store what this file holds, once it is known. Not during render:
  // `discoverMaterials` writes to the same store this component reads from.
  useEffect(() => {
    onMaterials([...materials.keys()]);
  }, [materials, onMaterials]);

  /**
   * The slot values, onto the real materials — the whole point of the panel.
   *
   * Each factor writes where the engine end writes it: colour multiplies the
   * albedo (which is what an Albedo Tint IS — a texture that survives it),
   * metalness and roughness are the standard scalars, `specularIntensity` and
   * `normalScale` exist on the material but only bite where the file gave it a
   * specular or a normal map. A slot whose model has no normal map can still
   * carry a NormalScale for TerraGen; the viewport simply has nothing to show
   * for it, which is honest — Unreal's Master Material is where it lands.
   */
  useEffect(() => {
    object.materials.forEach((slot) => {
      const mat = materials.get(slot.name);
      if (!mat) return;
      mat.color.set(slot.color);
      mat.metalness = slot.metalness;
      mat.roughness = slot.roughness;
      if ("specularIntensity" in mat) mat.specularIntensity = slot.specular;
      if (mat.normalMap) mat.normalScale.set(slot.normal, slot.normal);
      mat.needsUpdate = true;
    });
  }, [object.materials, materials]);

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
  onMaterials,
}: {
  object: SceneObject;
  selected: boolean;
  onSelect: (id: string) => void;
  register: (id: string, node: Object3D | null) => void;
  /** a loaded GLB reporting the material slots it actually carries */
  onMaterials?: (id: string, names: string[]) => void;
}) {
  const ref = useRef<Object3D>(null);
  const [hovered, setHovered] = useState(false);
  const material = materialOf(object, 0);

  // Bound to the object here so <Model> never has to know its own id, and stable
  // so reporting the slot list doesn't re-run every time the parent renders.
  const report = useCallback(
    (names: string[]) => onMaterials?.(object.id, names),
    [object.id, onMaterials]
  );

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
      {object.source === "splat" ? (
        <SplatField object={object} lit={selected || hovered} />
      ) : object.modelUrl ? (
        <Model url={object.modelUrl} object={object} onMaterials={report} />
      ) : (
        <>
          {/* A pending object is a placeholder for something still generating.
              It casts no shadow and reads through — the scene should show that
              the spot is taken without claiming the object has arrived. */}
          <mesh castShadow={!object.pending} receiveShadow={!object.pending}>
            <ShapeGeometry shape={object.shape} />
            {/* A placeholder shape is one surface, so it is slot 0 and only
                ever slot 0 — the switcher doesn't appear for it. */}
            <meshStandardMaterial
              color={material.color}
              metalness={material.metalness}
              roughness={material.roughness}
              transparent={object.pending}
              opacity={object.pending ? 0.35 : 1}
              wireframe={object.pending}
            />
          </mesh>

          {/* Silhouette for hover and selection — an inflated back-face shell of
              the same geometry. This is what drei's <Outlines> builds internally,
              but done explicitly: Outlines resolves geometry from its runtime
              parent via layout effects, which proved unreliable when mounted
              conditionally here. Owning the shell keeps it deterministic.
              `raycast` is disabled so the shell can't steal the pointer from the
              mesh and thrash the hover state.

              An object with a dataset role outlines in that role's own colour
              instead of white, so the hero, the clutter and the dressing stay
              identifiable while focused. Hover is the same hue a step dimmer,
              keeping selection the stronger read. */}
          {(selected || hovered) && (
            <mesh scale={OUTLINE_SCALE} raycast={() => null}>
              <ShapeGeometry shape={object.shape} />
              <meshBasicMaterial
                color={
                  ROLE_OUTLINE[object.role]
                    ? selected
                      ? ROLE_OUTLINE[object.role].on
                      : ROLE_OUTLINE[object.role].dim
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
