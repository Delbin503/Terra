/**
 * WorldThumb — the stand-in cover render for a project or a community world.
 *
 * WHY THIS IS DRAWN AND NOT A PHOTOGRAPH. The obvious way to make these look
 * real is to ship a folder of environment JPEGs. That trades one problem for
 * three: a dozen large binaries in a repo that already gitignores its only
 * heavy asset, a fixed set of covers that repeats the moment someone makes a
 * thirteenth project, and licensing on every one of them. This draws instead —
 * so every seed is a different world, nothing is downloaded, and the whole
 * thing is a few kilobytes of markup.
 *
 * WHAT MAKES IT READ AS A PHOTO rather than as a flat illustration is the
 * atmosphere, not the shapes. Four things do the work, and they are the same
 * four a real landscape photograph has:
 *
 *   · AERIAL PERSPECTIVE — distant ridges are washed toward the sky colour, not
 *     just darkened. Haze is what the eye actually reads distance from, and a
 *     far ridge painted in its own colour reads as a paper cut-out.
 *   · A LIGHT DIRECTION — the sun sits in one place and everything answers to
 *     it: a bloom around it, a warm gradient on the sky beneath it, a specular
 *     streak on the water aimed back at the viewer.
 *   · TONAL SEPARATION — the foreground goes almost black. Illustrations tend
 *     to keep every band equally legible; photographs let the near edge fall
 *     away.
 *   · GRAIN AND VIGNETTE — a fine noise field over the whole frame. It is the
 *     single cheapest cue that something was captured rather than filled.
 *
 * Deterministic: same seed, same world, every render. To swap in real
 * thumbnails later, replace this component's body with an `<img>` — nothing
 * outside it knows how the cover is produced.
 *
 * The palettes live here rather than in tokens.css because they're this
 * renderer's own recipe. They are content, not theme: they never invert.
 */

interface Biome {
  name: string;
  /** sky: zenith → horizon */
  sky: [string, string];
  sun: string;
  /** the haze the distance dissolves into — usually near the horizon colour */
  haze: string;
  /** ridge ink, far → near. The far one is mixed toward `haze` at render. */
  ridge: [string, string, string];
  ground: string;
  water: string;
}

const BIOMES: Biome[] = [
  {
    name: "alpine dusk",
    sky: ["#1d3a5c", "#7fa8c9"],
    sun: "#ffe9c4",
    haze: "#9dbdd6",
    ridge: ["#5b7f9e", "#33506b", "#16232f"],
    ground: "#2b4a3c",
    water: "#2f5f7d",
  },
  {
    name: "desert noon",
    sky: ["#8a5a2f", "#f0c98d"],
    sun: "#fff4d6",
    haze: "#e8c79a",
    ridge: ["#c08a55", "#8d5c33", "#3d2616"],
    ground: "#b5854f",
    water: "#8a6a44",
  },
  {
    name: "pine morning",
    sky: ["#3d6b84", "#cfe6ea"],
    sun: "#f6fbe8",
    haze: "#c3dbe0",
    ridge: ["#6f979b", "#3d6553", "#132720"],
    ground: "#2f5238",
    water: "#2c6a6f",
  },
  {
    name: "violet evening",
    sky: ["#241a3a", "#d97a52"],
    sun: "#ffd39a",
    haze: "#a9738a",
    ridge: ["#6a4f74", "#3b2b47", "#150f1c"],
    ground: "#241d33",
    water: "#3f3157",
  },
  {
    name: "coastal haze",
    sky: ["#3f7fa0", "#d7eef5"],
    sun: "#f4f9ec",
    haze: "#cbe4ee",
    ridge: ["#7fa6b4", "#4a7183", "#1d3038"],
    ground: "#5c7f63",
    water: "#2d7d94",
  },
  {
    name: "tundra overcast",
    sky: ["#5a6472", "#c3cad3"],
    sun: "#e8edf2",
    haze: "#bcc4cd",
    ridge: ["#8b95a1", "#5a636f", "#22272e"],
    ground: "#6b6f63",
    water: "#5b6b74",
  },
];

/** Deterministic 0…1 stream from one integer seed. */
function rng(seed: number) {
  let s = (seed * 2654435761) % 4294967296;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

/** Mix two hex colours. `t` = 0 keeps `a`, 1 keeps `b`. */
function mix(a: string, b: string, t: number) {
  const parse = (h: string) => [
    parseInt(h.slice(1, 3), 16),
    parseInt(h.slice(3, 5), 16),
    parseInt(h.slice(5, 7), 16),
  ];
  const [r1, g1, b1] = parse(a);
  const [r2, g2, b2] = parse(b);
  const ch = (x: number, y: number) => Math.round(x + (y - x) * t);
  return `rgb(${ch(r1, r2)},${ch(g1, g2)},${ch(b1, b2)})`;
}

/**
 * A ridge line as a closed path.
 *
 * Two frequencies rather than one: a slow swell that gives the range its
 * overall shape, and a faster jitter riding on it. A single frequency reads as
 * a saw blade — evenly spaced teeth of the same size, which no landform has.
 */
function ridgePath(next: () => number, baseY: number, height: number, steps: number) {
  const dx = 200 / steps;
  const phase = next() * Math.PI * 2;
  let d = `M0 ${baseY.toFixed(1)}`;
  for (let i = 0; i <= steps; i += 1) {
    const swell = Math.sin(phase + (i / steps) * Math.PI * 1.7) * 0.5 + 0.5;
    const jitter = 0.55 + next() * 0.45;
    const y = baseY - height * (0.35 + swell * 0.65) * jitter;
    d += ` L${(i * dx).toFixed(1)} ${y.toFixed(1)}`;
  }
  return `${d} L200 ${baseY.toFixed(1)} L200 125 L0 125 Z`;
}

export function WorldThumb({ seed }: { seed: number }) {
  const biome = BIOMES[seed % BIOMES.length];
  const next = rng(seed);
  const uid = `wt${seed}`;

  // The sun holds the upper band so it never fights the title scrim that feed
  // cards lay over the bottom edge.
  const sunX = 34 + next() * 132;
  const sunY = 20 + next() * 20;
  const horizon = 66 + next() * 8;

  // Aerial perspective: each ridge is its own ink washed toward the haze, most
  // for the furthest. This is the depth cue — darkness alone isn't one.
  const far = mix(biome.ridge[0], biome.haze, 0.55);
  const mid = mix(biome.ridge[1], biome.haze, 0.28);
  const near = biome.ridge[2];

  return (
    <svg
      viewBox="0 0 200 125"
      preserveAspectRatio="xMidYMid slice"
      className="h-full w-full"
      role="img"
      aria-label={`${biome.name} environment preview`}
    >
      <defs>
        <linearGradient id={`${uid}sky`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={biome.sky[0]} />
          <stop offset="0.72" stopColor={biome.sky[1]} />
          <stop offset="1" stopColor={biome.haze} />
        </linearGradient>

        {/* The sun's bloom, and a wider warm lift on the sky around it. */}
        <radialGradient id={`${uid}bloom`}>
          <stop offset="0" stopColor={biome.sun} stopOpacity="0.95" />
          <stop offset="0.35" stopColor={biome.sun} stopOpacity="0.35" />
          <stop offset="1" stopColor={biome.sun} stopOpacity="0" />
        </radialGradient>

        {/* Ground light: the near terrain is lit at the top and falls into
            shadow at the bottom edge, which is what pulls the eye up the frame. */}
        <linearGradient id={`${uid}ground`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={mix(biome.ground, biome.sun, 0.22)} />
          <stop offset="0.55" stopColor={biome.ground} />
          <stop offset="1" stopColor={mix(biome.ground, "#000000", 0.62)} />
        </linearGradient>

        <linearGradient id={`${uid}vig`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#000" stopOpacity="0.22" />
          <stop offset="0.45" stopColor="#000" stopOpacity="0" />
          <stop offset="1" stopColor="#000" stopOpacity="0.45" />
        </linearGradient>

        {/* Film grain. `stitchTiles` keeps it seamless when the SVG is sliced
            to fill a card of a different aspect ratio. */}
        <filter id={`${uid}grain`} x="0" y="0" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="3" stitchTiles="stitch" />
          <feColorMatrix type="saturate" values="0" />
        </filter>
      </defs>

      <rect width="200" height="125" fill={`url(#${uid}sky)`} />

      {/* Cloud banding — long, flat, and low-contrast, the way stratus reads at
          this size. Drawn before the sun so the bloom sits over them. */}
      {Array.from({ length: 4 }, (_, i) => {
        const y = 12 + i * 13 + next() * 6;
        const w = 60 + next() * 110;
        const x = next() * 190 - 30;
        return (
          <ellipse
            key={i}
            cx={x + w / 2}
            cy={y}
            rx={w / 2}
            ry={2.2 + next() * 2.4}
            fill="#fff"
            opacity={0.06 + next() * 0.08}
          />
        );
      })}

      <circle cx={sunX} cy={sunY} r="34" fill={`url(#${uid}bloom)`} />
      <circle cx={sunX} cy={sunY} r="4.6" fill={biome.sun} opacity="0.95" />

      {/* Three ranges, back to front. */}
      <path d={ridgePath(next, horizon - 6, 30, 11)} fill={far} />
      <path d={ridgePath(next, horizon + 2, 22, 9)} fill={mid} />

      {/* The valley floor. */}
      <path
        d={`M0 ${horizon + 12} Q50 ${horizon + 7} 100 ${horizon + 11} T200 ${horizon + 9} L200 125 L0 125 Z`}
        fill={`url(#${uid}ground)`}
      />

      {/* Water, with a specular path running back toward the sun's column —
          the reflection has to agree with where the light is. */}
      <rect y={horizon + 20} width="200" height="11" fill={biome.water} opacity="0.9" />
      {Array.from({ length: 5 }, (_, i) => (
        <rect
          key={i}
          x={sunX - 26 + next() * 52}
          y={horizon + 21.5 + i * 2}
          width={10 + next() * 26}
          height="0.9"
          fill={biome.sun}
          opacity={0.3 - i * 0.05}
        />
      ))}

      {/* Near ridge last and nearly black: the frame needs one band that is
          pure silhouette, or everything sits at the same distance. */}
      <path d={ridgePath(next, horizon + 34, 16, 7)} fill={near} />

      {/* Conifer silhouettes along the near edge, at the same ink. */}
      {Array.from({ length: 14 }, (_, i) => {
        const x = i * 15 + next() * 8;
        const h = 7 + next() * 9;
        const base = horizon + 36 + next() * 4;
        return (
          <path
            key={i}
            d={`M${x.toFixed(1)} ${base.toFixed(1)} L${(x + 2.6).toFixed(1)} ${(base - h).toFixed(1)} L${(x + 5.2).toFixed(1)} ${base.toFixed(1)} Z`}
            fill={near}
          />
        );
      })}

      <rect width="200" height="125" fill={`url(#${uid}vig)`} />
      <rect
        width="200"
        height="125"
        filter={`url(#${uid}grain)`}
        opacity="0.13"
        style={{ mixBlendMode: "overlay" }}
      />
    </svg>
  );
}
