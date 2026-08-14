import type { AssetType } from "./assets-data";
import { THUMB } from "./scene-palette";
import { PlaceholderImage } from "./PlaceholderImage";

const shift = (h: number, by: number) => (h + by) % 360;

/**
 * AssetThumb — the preview shown on asset cards, the layers list and the asset
 * details panel. It prefers the shared placeholder photo and falls back to a
 * self-contained SVG mini-scene (seeded, offline, theme-agnostic) when no photo
 * is available.
 */
export function AssetThumb({ type, seed }: { type: AssetType; seed: number }) {
  return (
    <PlaceholderImage
      className="h-full w-full object-cover"
      fallback={<AssetThumbArt type={type} seed={seed} />}
    />
  );
}

/** The procedural fallback artwork. Motif varies by asset type. */
function AssetThumbArt({ type, seed }: { type: AssetType; seed: number }) {
  const h = (seed * 47) % 360;
  const gid = `sky-${seed}`;
  const vid = `vig-${seed}`;

  const skyTop = `hsl(${h} ${THUMB.band.skyTop})`;
  const skyBottom = `hsl(${shift(h, THUMB.hueShift.skyBottom)} ${THUMB.band.skyBottom})`;
  const hillNear = `hsl(${shift(h, THUMB.hueShift.hillNear)} ${THUMB.band.hillNear})`;
  const hillFar = `hsl(${shift(h, THUMB.hueShift.hillFar)} ${THUMB.band.hillFar})`;

  return (
    <svg viewBox="0 0 120 120" preserveAspectRatio="xMidYMid slice" className="h-full w-full" role="img">
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={skyTop} />
          <stop offset="1" stopColor={skyBottom} />
        </linearGradient>
        <radialGradient id={vid} cx="0.5" cy="0.42" r="0.75">
          <stop offset="0.6" stopColor="#000" stopOpacity="0" />
          <stop offset="1" stopColor="#000" stopOpacity={THUMB.vignette} />
        </radialGradient>
      </defs>

      <rect width="120" height="120" fill={`url(#${gid})`} />

      {type === "mesh" ? (
        <MeshMotif />
      ) : type === "camera" ? (
        <CameraMotif />
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
      <circle cx="88" cy="34" r="13" fill={`hsl(${shift(hue, THUMB.hueShift.sun)} ${THUMB.band.sun})`} opacity="0.9" />
      {/* far range */}
      <path d="M0 78 Q 34 60 66 74 T 120 70 V120 H0 Z" fill={hillFar} opacity="0.85" />
      {/* near hills */}
      <path d="M0 96 Q 40 78 78 92 T 120 88 V120 H0 Z" fill={hillNear} />
      {/* environments read as panoramas: add a bright horizon seam */}
      {type === "environment" && (
        <rect x="0" y="70" width="120" height="1.5" fill="#fff" opacity={THUMB.horizonSeam} />
      )}
      {/* videos get a play affordance */}
      {type === "video" && (
        <>
          <circle cx="60" cy="60" r="17" fill="#000" opacity={THUMB.playScrim} />
          <path d="M55 51 L71 60 L55 69 Z" fill="#fff" opacity="0.92" />
        </>
      )}
    </>
  );
}

/**
 * A utility, not content — so it gets a diagram rather than a scene: the two
 * cameras, the sweep between them, and the subject they both point at.
 */
function CameraMotif() {
  const line = "hsl(0 0% 100%)";
  const brand = "#f36f16";
  return (
    <>
      <rect width="120" height="120" fill="#000" opacity={THUMB.meshBackdrop} />
      {/* the subject on its turntable */}
      <ellipse cx="60" cy="86" rx="26" ry="7" fill="none" stroke={line} strokeOpacity="0.28" strokeWidth="1" />
      <rect x="52" y="64" width="16" height="20" rx="2" fill={line} fillOpacity="0.18" stroke={line} strokeOpacity="0.5" strokeWidth="1" />
      {/* sweep between start and end */}
      <path d="M26 74 L26 36" stroke={brand} strokeOpacity="0.7" strokeWidth="1.2" strokeDasharray="3 3" />
      {/* start (low) + end (high) cameras, both aimed at the subject */}
      <g fill={brand} fillOpacity="0.9">
        <rect x="18" y="68" width="14" height="10" rx="2" />
        <rect x="18" y="30" width="14" height="10" rx="2" fillOpacity="0.6" />
      </g>
      <g stroke={brand} strokeOpacity="0.55" strokeWidth="1">
        <path d="M32 73 L50 78" />
        <path d="M32 35 L50 66" />
      </g>
    </>
  );
}

/** Technical, studio-lit look: grid floor + wireframe cube. */
function MeshMotif() {
  const line = "hsl(0 0% 100%)";
  return (
    <>
      <rect width="120" height="120" fill="#000" opacity={THUMB.meshBackdrop} />
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
