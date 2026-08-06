import type { AssetType } from "./assets-data";

/**
 * AssetThumb — a self-contained SVG placeholder that *looks like a real asset
 * preview* (seeded mini-scene), rather than a flat color card. Fully offline,
 * theme-agnostic, and crisp at any size. Motif varies by asset type.
 */
export function AssetThumb({ type, seed }: { type: AssetType; seed: number }) {
  const h = (seed * 47) % 360;
  const gid = `sky-${seed}`;
  const vid = `vig-${seed}`;

  const skyTop = `hsl(${h} 58% 64%)`;
  const skyBottom = `hsl(${(h + 28) % 360} 52% 42%)`;
  const hillNear = `hsl(${(h + 20) % 360} 46% 26%)`;
  const hillFar = `hsl(${(h + 10) % 360} 42% 36%)`;

  return (
    <svg viewBox="0 0 120 120" preserveAspectRatio="xMidYMid slice" className="h-full w-full" role="img">
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={skyTop} />
          <stop offset="1" stopColor={skyBottom} />
        </linearGradient>
        <radialGradient id={vid} cx="0.5" cy="0.42" r="0.75">
          <stop offset="0.6" stopColor="#000" stopOpacity="0" />
          <stop offset="1" stopColor="#000" stopOpacity="0.28" />
        </radialGradient>
      </defs>

      <rect width="120" height="120" fill={`url(#${gid})`} />

      {type === "mesh" ? (
        <MeshMotif />
      ) : (
        <SceneMotif type={type} hillNear={hillNear} hillFar={hillFar} hue={h} />
      )}

      <rect width="120" height="120" fill={`url(#${vid})`} />
    </svg>
  );
}

function SceneMotif({
  type,
  hillNear,
  hillFar,
  hue,
}: {
  type: AssetType;
  hillNear: string;
  hillFar: string;
  hue: number;
}) {
  return (
    <>
      {/* sun / light source */}
      <circle cx="88" cy="34" r="13" fill={`hsl(${(hue + 40) % 360} 90% 80%)`} opacity="0.9" />
      {/* far range */}
      <path d="M0 78 Q 34 60 66 74 T 120 70 V120 H0 Z" fill={hillFar} opacity="0.85" />
      {/* near hills */}
      <path d="M0 96 Q 40 78 78 92 T 120 88 V120 H0 Z" fill={hillNear} />
      {/* environments read as panoramas: add a bright horizon seam */}
      {type === "environment" && (
        <rect x="0" y="70" width="120" height="1.5" fill="#fff" opacity="0.35" />
      )}
      {/* videos get a play affordance */}
      {type === "video" && (
        <>
          <circle cx="60" cy="60" r="17" fill="#000" opacity="0.35" />
          <path d="M55 51 L71 60 L55 69 Z" fill="#fff" opacity="0.92" />
        </>
      )}
    </>
  );
}

/** Technical, studio-lit look: grid floor + wireframe cube. */
function MeshMotif() {
  const line = "hsl(0 0% 100%)";
  return (
    <>
      <rect width="120" height="120" fill="#000" opacity="0.28" />
      {/* floor grid */}
      <g stroke={line} strokeOpacity="0.14" strokeWidth="0.8">
        <line x1="0" y1="86" x2="120" y2="86" />
        <line x1="0" y1="98" x2="120" y2="98" />
        <line x1="0" y1="112" x2="120" y2="112" />
        <line x1="24" y1="80" x2="8" y2="120" />
        <line x1="60" y1="80" x2="60" y2="120" />
        <line x1="96" y1="80" x2="112" y2="120" />
      </g>
      {/* wireframe cube */}
      <g stroke={line} strokeOpacity="0.85" strokeWidth="1.4" fill="none" strokeLinejoin="round">
        <polygon points="46,58 74,58 74,86 46,86" fill={line} fillOpacity="0.08" />
        <polygon points="46,58 58,44 86,44 74,58" fill={line} fillOpacity="0.14" />
        <polygon points="74,58 86,44 86,72 74,86" fill={line} fillOpacity="0.05" />
      </g>
    </>
  );
}
