import { CAMERA_RIG } from "./scene-palette";
import { formatZoom, orbitSweep } from "./camera-rig";
import type { SettingKey } from "./ObjectPropertiesPanel";

/**
 * SETTING EXPLAINER — what the control in front of you does, in a sentence.
 * ------------------------------------------------------------------
 * The sibling of CaptureExplainer, behind the same info button in the setting
 * panel's header. The capture settings got there first because they are the
 * ones that multiply into a bill; this covers everything else, because a first
 * session in the editor doesn't know which direction Y is, what "Specular"
 * changes that Roughness doesn't, or that Sky Brightness and Sky Influence are
 * two different jobs.
 *
 * The same setting means different things on different sources, so the copy is
 * keyed by WHAT is selected as well as which setting: Rotation on a chair turns
 * the chair, on a sky it moves the sun, and on a camera it swings the rig round
 * the master.
 *
 * The three camera-geometry settings also get a moving diagram, drawn from the
 * rig's own numbers like the capture ones — they are spatial, and a camera that
 * stands still while you read about it is exactly what makes them abstract.
 */

export type ExplainSource = "object" | "sky" | "splat" | "camera";

const INK = {
  master: CAMERA_RIG.path,
  cam: CAMERA_RIG.start,
  far: CAMERA_RIG.end,
  live: CAMERA_RIG.selected,
} as const;

type Copy = { title: string; body: string };

/** What the camera rows read when there is a master to name. */
export type ExplainCamera = {
  masterName: string;
  /** the rig's arc, for the orbit diagram */
  orbitStart: number;
  orbitEnd: number;
  /** the capture's zoom multiple, for the zoom diagram */
  zoom: number;
  /** the climb, and the most it can be */
  span: number;
  spanMax: number;
};

function copyFor(setting: SettingKey, source: ExplainSource, cam: ExplainCamera | null): Copy | null {
  const master = cam?.masterName ?? "the master object";

  if (source === "camera") {
    switch (setting) {
      case "position":
        return {
          title: "Position — where the rig stands",
          body: "Moves the whole camera pair. Both ends travel together, so the shot keeps its shape. To move around the master, Orbit Rotation, Zoom Distance and Camera Height are easier.",
        };
      case "rotation":
        return {
          title: "Orbit Rotation — which side it shoots from",
          body: `Swings both cameras around ${master}, keeping their height and reach. The numbers on either side set the arc a Rotatable capture sweeps, from the start bearing round to the end one.`,
        };
      case "distance":
        return {
          title: "Zoom Distance — how far in the capture travels",
          body: `The rig's own framing is 1x. The capture moves in from there towards ${master}: at 2x the closest frames are taken from half the distance. Save as set keeps a zoom for the run, so you can capture several; each set is also a stop in the expanded camera view.`,
        };
      case "height":
        return {
          title: "Camera Height — the climb between the two cameras",
          body: `How far the far camera stands above the near one. 0 m shoots everything from one height. More height adds views looking down on ${master}, and Increments set how many heights in between are shot.`,
        };
    }
    return null;
  }

  if (source === "sky") {
    switch (setting) {
      case "position":
        return {
          title: "Height — where the horizon sits",
          body: "A sky wraps the whole world, so the only way it can move is up or down. Raise it to lift the horizon and the ground it projects. Lower it to sink them.",
        };
      case "rotation":
        return {
          title: "Rotation — where the sun is",
          body: "Turns the sky around the scene. Y is the one you'll use most: it swings the sun, and the light it casts, to a different side of your objects.",
        };
      case "scale":
        return {
          title: "Scale — how far the ground reaches",
          body: "Sets the size of the projected dome. Larger values push the ground and horizon further out, so objects look like they stand in a bigger space.",
        };
      case "brightness":
        return {
          title: "Sky Brightness — how bright the backdrop looks",
          body: "Brightens or darkens the sky you see behind the scene. 1.00× is the image as shot. It changes the backdrop only, not the light on your objects. That is Sky Influence.",
        };
      case "skyInfluence":
        return {
          title: "Sky Influence — how much the sky lights your objects",
          body: "How much of the sky's light and colour lands on everything in the scene. At 0, objects are lit by the studio light alone. At 1, the sky fully lights and tints them.",
        };
    }
    return null;
  }

  /* A splat is a world asset too, so its Appearance carries Sky Influence — but
     it only lights the scene when no sky is placed (see the `sky` memo in
     SceneCanvas, which prefers an HDRI or skybox). */
  if (source === "splat" && setting === "skyInfluence") {
    return {
      title: "Sky Influence — how strongly the scene is lit",
      body: "How much environment light lands on your objects. It only applies while no Environment or Skybox is placed; once a sky is in the scene, the sky's own Sky Influence takes over.",
    };
  }

  switch (setting) {
    case "position":
      return {
        title: "Position — where it stands",
        body: "Where the object sits in metres from the centre of the world: X is left and right, Y is up and down, Z is forward and back. Type an exact value here, or drag the arrows in the viewport.",
      };
    case "rotation":
      return {
        title: "Rotation — which way it faces",
        body: "Turns the object around each axis, from 0° to 360°. Y spins it in place like a turntable. X and Z tip it forward or onto its side. The rings in the viewport do the same.",
      };
    case "scale":
      return {
        title: "Scale — how big it is",
        body: "Multiplies the object's size on each axis. 1.00× is the size it was modelled at. With Uniform on, all three axes move together so it keeps its proportions. Turn Uniform off to stretch one axis.",
      };
    case "color":
      return {
        title: "Color — the base colour",
        body: "Tints the surface of the selected element. Pick a swatch, or use Custom for any colour. If the object has several elements, the chip in the header shows which one you are painting.",
      };
    case "metallic":
      return {
        title: "Metallic — metal or not",
        body: "0 is a non-metal like plastic, wood or paint. 1 is bare metal, which reflects its surroundings tinted by its own colour. Most real materials sit near one end; values in between suit dusty or painted metal.",
      };
    case "roughness":
      return {
        title: "Roughness — glossy to matte",
        body: "How sharp the reflections are. Low values give a polished, mirror-like shine. High values scatter the light into a soft, matte finish.",
      };
    case "specular":
      return {
        title: "Specular — how strong the highlight is",
        body: "How strongly a non-metal reflects light that hits it head-on. 0.5 suits most materials. Lower it for dull surfaces like cloth or rubber, and raise it for wet or lacquered ones.",
      };
    case "normal":
      return {
        title: "Normal Intensity — surface detail",
        body: "How deep the bumps and grooves in the texture look. 0 flattens them, 1 is as authored, and higher values exaggerate them. It changes how light falls on the surface, not the shape itself.",
      };
    case "brightness":
      return {
        title: "Brightness — exposure of the capture",
        body: "Multiplies the splat's recorded colours. 1.00× is as captured. Raise it to lift a dim interior, or lower it to calm one that is too bright.",
      };
  }
  return null;
}

/** Top-down: the rig swinging round the master along its arc. */
function OrbitDiagram({ start, end }: { start: number; end: number }) {
  const cx = 60;
  const cy = 44;
  const r = 30;
  const sweep = Math.max(1, orbitSweep(start, end));
  const at = (deg: number) => {
    const a = (deg - 90) * (Math.PI / 180);
    return { x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r };
  };
  const a = at(start);
  const b = at(start + Math.min(sweep, 359.9));
  const large = sweep > 180 ? 1 : 0;

  return (
    <svg viewBox="0 0 120 88" className="h-[88px] w-full" role="img" aria-label="The rig orbiting the master">
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={INK.master} strokeWidth={1} opacity={0.2} />
      {/* The arc a capture sweeps — brighter than the rest of the circle. */}
      <path
        d={`M${a.x},${a.y} A${r},${r} 0 ${large} 1 ${b.x},${b.y}`}
        fill="none"
        stroke={INK.master}
        strokeWidth={2}
        opacity={0.7}
      />
      <rect x={cx - 6} y={cy - 6} width={12} height={12} rx={2} fill={INK.master} opacity={0.9} />
      <g>
        <circle cx={cx} cy={cy - r} r={4} fill={INK.cam} />
        <line x1={cx} y1={cy - r + 4} x2={cx} y2={cy - 8} stroke={INK.cam} strokeWidth={1} strokeDasharray="2 2" opacity={0.6} />
        <animateTransform
          attributeName="transform"
          type="rotate"
          values={`${start} ${cx} ${cy};${start + sweep} ${cx} ${cy};${start} ${cx} ${cy}`}
          dur="6s"
          repeatCount="indefinite"
        />
      </g>
    </svg>
  );
}

/** Side-on: the camera travelling from its own framing in to the zoom. */
function ZoomDiagram({ zoom }: { zoom: number }) {
  const mx = 98;
  const y = 50;
  const farX = 14;
  const z = Math.max(1, zoom);
  const nearX = mx - (mx - farX) / z;

  return (
    <svg viewBox="0 0 120 88" className="h-[88px] w-full" role="img" aria-label="The capture zooming in">
      <line x1={farX} y1={y + 12} x2={mx} y2={y + 12} stroke={INK.master} strokeWidth={1} opacity={0.25} />
      <rect x={mx - 6} y={y - 6} width={12} height={12} rx={2} fill={INK.master} opacity={0.9} />
      {/* Where the rig stands, and where the capture travels in to. */}
      <line x1={farX} y1={y + 8} x2={farX} y2={y + 16} stroke={INK.far} strokeWidth={1.5} />
      <text x={farX} y={y + 26} textAnchor="middle" fontSize={8} fill={INK.far}>1x</text>
      <line x1={nearX} y1={y + 8} x2={nearX} y2={y + 16} stroke={INK.cam} strokeWidth={1.5} />
      <text x={nearX} y={y + 26} textAnchor="middle" fontSize={8} fill={INK.cam}>{formatZoom(z)}</text>
      <g>
        <rect x={-5} y={-3.5} width={10} height={7} rx={1.5} fill={INK.cam} />
        <animateTransform
          attributeName="transform"
          type="translate"
          values={`${farX} ${y};${nearX} ${y};${farX} ${y}`}
          dur="4s"
          repeatCount="indefinite"
        />
      </g>
    </svg>
  );
}

/** Side-on: the far camera standing above the near one, as a mast. */
function HeightDiagram({ span, spanMax }: { span: number; spanMax: number }) {
  const x = 30;
  const ground = 74;
  const top = 10;
  const t = spanMax > 0 ? Math.min(1, Math.max(0, span / spanMax)) : 0;
  const farY = ground - 6 - (ground - 6 - top) * t;

  return (
    <svg viewBox="0 0 120 88" className="h-[88px] w-full" role="img" aria-label="The climb between the two cameras">
      <line x1={8} y1={ground} x2={112} y2={ground} stroke={INK.master} strokeWidth={1} opacity={0.25} />
      <rect x={86} y={ground - 12} width={12} height={12} rx={2} fill={INK.master} opacity={0.9} />
      <line x1={x} y1={ground - 6} x2={x} y2={farY} stroke={INK.master} strokeWidth={1} strokeDasharray="3 3" opacity={0.5} />
      {/* Near camera holds still; far camera sits at the climb, and the line
          of sight from it shows the view looking down. */}
      <rect x={x - 5} y={ground - 9.5} width={10} height={7} rx={1.5} fill={INK.cam} />
      <g>
        <rect x={x - 5} y={farY - 3.5} width={10} height={7} rx={1.5} fill={INK.far} />
        <line x1={x + 5} y1={farY} x2={86} y2={ground - 6} stroke={INK.far} strokeWidth={1} strokeDasharray="2 2" opacity={0.6} />
        <animate attributeName="opacity" values="1;0.55;1" dur="2.4s" repeatCount="indefinite" />
      </g>
    </svg>
  );
}

export function SettingExplainer({
  setting,
  source,
  camera,
}: {
  setting: SettingKey;
  source: ExplainSource;
  /** the rig's numbers, for the camera diagrams — null with no master */
  camera: ExplainCamera | null;
}) {
  const copy = copyFor(setting, source, camera);
  if (!copy) return null;

  const diagram =
    source === "camera" && camera ? (
      setting === "rotation" ? (
        <OrbitDiagram start={camera.orbitStart} end={camera.orbitEnd} />
      ) : setting === "distance" ? (
        <ZoomDiagram zoom={camera.zoom} />
      ) : setting === "height" ? (
        <HeightDiagram span={camera.span} spanMax={camera.spanMax} />
      ) : null
    ) : null;

  return (
    <div
      data-ui={`setting-explainer-${setting}`}
      className="mt-2 flex flex-col gap-2 rounded-xl border border-glass/10 bg-glass/5 p-2.5"
    >
      {diagram && <div className="rounded-lg bg-canvas/40 py-1">{diagram}</div>}
      <div>
        <p className="type-label-strong text-content">{copy.title}</p>
        <p className="type-caption mt-0.5 text-content-subtle">{copy.body}</p>
      </div>
    </div>
  );
}
