import { CAMERA_RIG } from "./scene-palette";
import { orbitSweep, type CameraRig } from "./camera-rig";

/**
 * CAPTURE EXPLAINER — what a capture setting actually does to the shoot.
 * ------------------------------------------------------------------
 * The three capture settings are the ones that decide what a dataset costs and
 * what it contains, and all three are abstract in a way the viewport can't
 * show: the rig stands still while you edit them, so nothing on screen changes
 * and the numbers have to be taken on faith.
 *
 * So each one gets a moving diagram of its own pass, drawn FROM THE RIG'S REAL
 * NUMBERS rather than as a generic illustration — change shots/rotation and the
 * shot marks in the picture change with it. That's the part a recorded GIF
 * couldn't do, and the reason this is animated SVG instead: it stays truthful
 * as the settings move, scales without blurring, themes with the rest of the
 * editor, and adds no binary asset to the bundle.
 *
 * Motion is SMIL (`<animateTransform>` / `<animate>`) rather than CSS. It keeps
 * each diagram a single self-contained element with no keyframes leaking into a
 * global stylesheet, and no class-name collisions between the three of them.
 */

/** Shot marks stop being countable long before shotsPerRotation's ceiling. */
const MAX_TICKS = 24;

const INK = {
  master: CAMERA_RIG.path,
  cam: CAMERA_RIG.start,
  live: CAMERA_RIG.selected,
} as const;

export type CaptureTopic = "cameraMode" | "shotsPerDistance" | "shotsPerRotation";

/**
 * One revolution: the master turns, the camera holds, and a frame fires at each
 * of `shots` evenly spaced bearings around the arc.
 *
 * Drawn as marks on a ring with a travelling camera, because that is the thing
 * being counted — "24 shots per rotation" is 24 positions around this circle,
 * and seeing them spaced out is what makes the number mean something.
 */
function RotationDiagram({ shots, sweepDeg }: { shots: number; sweepDeg: number }) {
  const n = Math.max(1, Math.min(MAX_TICKS, Math.round(shots)));
  const cx = 60;
  const cy = 44;
  const r = 30;
  const arc = Math.max(1, sweepDeg);

  const marks = Array.from({ length: n }, (_, i) => {
    // A full turn closes on itself, so the last mark would land on the first;
    // a partial arc includes both ends. Same rule the planner uses.
    const t = arc >= 360 ? i / n : n === 1 ? 0 : i / (n - 1);
    const deg = (t * arc - 90) * (Math.PI / 180);
    return { x: cx + Math.cos(deg) * r, y: cy + Math.sin(deg) * r };
  });

  return (
    <svg viewBox="0 0 120 88" className="h-[88px] w-full" role="img" aria-label="One revolution">
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={INK.master} strokeWidth={1} opacity={0.35} />
      {marks.map((m, i) => (
        <circle key={i} cx={m.x} cy={m.y} r={1.6} fill={INK.master} opacity={0.75} />
      ))}

      {/* The subject. It's the master that turns, not the camera — the arrow
          says which, because "shots per rotation" is otherwise easy to read as
          the camera flying round the object. */}
      <g>
        <rect x={cx - 6} y={cy - 6} width={12} height={12} rx={2} fill={INK.master} opacity={0.9} />
        <animateTransform
          attributeName="transform"
          type="rotate"
          from={`0 ${cx} ${cy}`}
          to={`360 ${cx} ${cy}`}
          dur="6s"
          repeatCount="indefinite"
        />
      </g>

      {/* The camera, stepping mark to mark and firing as it lands. */}
      <g>
        <circle r={4} fill={INK.cam}>
          <animate
            attributeName="opacity"
            values="1;0.45;1"
            dur={`${6 / n}s`}
            repeatCount="indefinite"
          />
        </circle>
        <animateMotion dur="6s" repeatCount="indefinite" calcMode="discrete"
          path={marks.map((m, i) => `${i === 0 ? "M" : "L"}${m.x},${m.y}`).join(" ")} />
      </g>
    </svg>
  );
}

/**
 * The climb: `stops` positions between the near camera and the far one, with a
 * whole revolution shot at each. This is the setting that multiplies the frame
 * count, so the diagram counts the stops rather than describing them.
 */
function IncrementDiagram({ stops }: { stops: number }) {
  const n = Math.max(1, Math.min(12, Math.round(stops)));
  const x = 30;
  const top = 12;
  const bottom = 72;
  const at = (i: number) => (n === 1 ? bottom : bottom - ((bottom - top) * i) / (n - 1));

  return (
    <svg viewBox="0 0 120 88" className="h-[88px] w-full" role="img" aria-label="Stops along the climb">
      {/* The mast, and every height the rig pauses at. */}
      <line x1={x} y1={top} x2={x} y2={bottom} stroke={INK.master} strokeWidth={1} strokeDasharray="3 3" opacity={0.5} />
      {Array.from({ length: n }, (_, i) => (
        <g key={i}>
          <line x1={x - 5} y1={at(i)} x2={x + 5} y2={at(i)} stroke={INK.master} strokeWidth={1.5} opacity={0.7} />
          {/* The revolution shot at that stop, drawn small beside it. */}
          <ellipse cx={x + 34} cy={at(i)} rx={13} ry={4} fill="none" stroke={INK.master} strokeWidth={0.8} opacity={0.35} />
        </g>
      ))}

      {/* The rig, resting at each stop in turn. `discrete` is the point: it
          jumps and holds, because that is what the capture does — it does not
          glide up shooting continuously. */}
      <g>
        <rect x={-5} y={-3.5} width={10} height={7} rx={1.5} fill={INK.cam} />
        <animateTransform
          attributeName="transform"
          type="translate"
          calcMode="discrete"
          dur={`${Math.max(2, n * 0.9)}s`}
          repeatCount="indefinite"
          values={Array.from({ length: n }, (_, i) => `${x} ${at(i)}`).join(";")}
        />
      </g>

      {/* The frame fired at whichever stop the rig is standing on. */}
      <g>
        <circle r={3} fill={INK.live}>
          <animate
            attributeName="opacity"
            values="0;1;0"
            dur={`${Math.max(2, n * 0.9) / n}s`}
            repeatCount="indefinite"
          />
        </circle>
        <animateTransform
          attributeName="transform"
          type="translate"
          calcMode="discrete"
          dur={`${Math.max(2, n * 0.9)}s`}
          repeatCount="indefinite"
          values={Array.from({ length: n }, (_, i) => `${x + 34} ${at(i)}`).join(";")}
        />
      </g>
    </svg>
  );
}

/** Fixed mode: one frame, from where the rig already stands. */
function FixedDiagram() {
  return (
    <svg viewBox="0 0 120 88" className="h-[88px] w-full" role="img" aria-label="A single frame">
      <rect x={54} y={38} width={12} height={12} rx={2} fill={INK.master} opacity={0.9} />
      <rect x={20} y={40} width={10} height={7} rx={1.5} fill={INK.cam} />
      <line x1={30} y1={44} x2={52} y2={44} stroke={INK.master} strokeWidth={1} strokeDasharray="3 3" opacity={0.5} />
      <circle cx={41} cy={44} r={3} fill={INK.live}>
        <animate attributeName="opacity" values="0;1;0;0;0" dur="2.4s" repeatCount="indefinite" />
      </circle>
    </svg>
  );
}

/**
 * The explainer card: what this setting is, what it costs, and the pass it
 * produces, moving.
 */
export function CaptureExplainer({ topic, rig }: { topic: CaptureTopic; rig: CameraRig }) {
  const sweep = orbitSweep(rig.orbitStart, rig.orbitEnd);
  const fixed = rig.mode === "fixed";

  const copy: Record<CaptureTopic, { title: string; body: string }> = {
    cameraMode: {
      title: fixed ? "Fixed — one frame" : "Rotatable — a turntable pass",
      body: fixed
        ? "The rig stands still and takes a single front-on frame. No revolution, no climb, so the two settings below don't apply."
        : "At every height the rig stops at, the master turns through the arc while the camera shoots. Increments set how many heights; Shots / Rotation sets how many frames each turn produces.",
    },
    shotsPerDistance: {
      title: "Increments — how many heights",
      body: "The stops the rig pauses at between the near camera and the far one. It's a count, not a metre step, so moving the rig doesn't silently change how many frames you're buying. Each stop shoots a full revolution.",
    },
    shotsPerRotation: {
      title: "Shots / Rotation — frames per turn",
      body: `Frames captured as the master turns through ${Math.round(sweep)}°. Narrowing the arc doesn't change this count — it packs the same number of frames into a smaller wedge, so they land closer together.`,
    },
  };

  const { title, body } = copy[topic];

  return (
    <div
      data-ui={`capture-explainer-${topic}`}
      className="mt-2 flex flex-col gap-2 rounded-xl border border-glass/10 bg-glass/5 p-2.5"
    >
      <div className="rounded-lg bg-canvas/40 py-1">
        {fixed ? (
          <FixedDiagram />
        ) : topic === "shotsPerDistance" ? (
          <IncrementDiagram stops={rig.shotsPerDistance} />
        ) : (
          <RotationDiagram shots={rig.shotsPerRotation} sweepDeg={sweep} />
        )}
      </div>

      <div>
        <p className="type-label-strong text-content">{title}</p>
        <p className="type-caption mt-0.5 text-content-subtle">{body}</p>
      </div>

      {/* The arithmetic, spelled out. The frame count is what a dataset is
          billed and judged on, so it shouldn't have to be inferred. */}
      {!fixed && (
        <p className="type-caption border-t border-glass/10 pt-1.5 text-content-subtle">
          <span className="text-content">{rig.shotsPerDistance}</span> increments ×{" "}
          <span className="text-content">{rig.shotsPerRotation}</span> shots ={" "}
          <span className="type-caption-strong text-brand">
            {rig.shotsPerDistance * rig.shotsPerRotation} frames
          </span>
        </p>
      )}
    </div>
  );
}
