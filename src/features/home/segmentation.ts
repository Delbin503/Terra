/**
 * SEGMENTATION — the browser-side stand-in for Terra's segmentation service.
 *
 * What this genuinely does, on the real pixels of the uploaded photo:
 *   1. downsample the (already erased) canvas to a small working grid;
 *   2. grow a region out of every unvisited cell, absorbing neighbours whose
 *      colour is within tolerance of the region's running mean — so a sky or a
 *      jacket ends up as ONE region even though it is a gradient;
 *   3. absorb the specks into the neighbour they resemble most;
 *   4. trace each survivor with marching squares into a smoothed SVG path.
 * The outlines that come out of it therefore follow real image content, and the
 * cell → region map makes "click a thing to select it" exact rather than faked.
 *
 * What it CANNOT do is recognise what a region depicts — there is no model in
 * the browser. So a keyword ("humans") does not detect humans: it ranks regions
 * by how much each reads as a SUBJECT rather than backdrop — clear of the frame
 * edge, mid-sized, distinct from the colour around it — and takes the top N.
 * N is seeded from however many regions clear the bar, and is then the user's to
 * correct. That is exactly why the keyword row carries a +/− stepper.
 *
 * Swap this module for real inference by keeping `segmentImage`'s shape: a grid
 * size, a label per cell, and a path + score per region is all the UI consumes.
 */

/** Working grid — the long edge of the image is scaled down to this. */
const GRID_MAX = 176;
/** Euclidean RGB distance from a region's running mean that still joins it. */
const TOLERANCE = 26;
/** Regions smaller than this share of the grid get absorbed as specks. */
const MIN_REGION = 0.0016;
/** Cells the eraser has cleared belong to no region. */
const ERASED = -2;

export interface Region {
  id: number;
  /** cells covered, on the working grid */
  size: number;
  /** grid-space centroid, for anchoring a marker */
  cx: number;
  cy: number;
  /** mean colour as `rgb(...)`, for the swatch on a keyword row */
  color: string;
  /** closed contours as one SVG path, in grid space */
  outline: string;
  /** 0…1 — how much this reads as a subject rather than backdrop */
  subject: number;
}

export interface SegmentResult {
  /** working-grid dimensions; also the SVG viewBox for every outline */
  width: number;
  height: number;
  /** region id per cell, or ERASED (-2) */
  labels: Int32Array;
  regions: Region[];
  /** regions worth offering to a keyword, best first */
  subjects: Region[];
}

type Pt = [number, number];

/* ------------------------------------------------------------------ grid --- */

function readGrid(source: HTMLCanvasElement) {
  const scale = Math.min(1, GRID_MAX / Math.max(source.width, source.height));
  const w = Math.max(1, Math.round(source.width * scale));
  const h = Math.max(1, Math.round(source.height * scale));
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d");
  if (!ctx) throw new Error("2D canvas unavailable");
  // Browser-native downsampling doubles as the denoise pass.
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(source, 0, 0, w, h);
  return { data: ctx.getImageData(0, 0, w, h).data, w, h };
}

/* -------------------------------------------------------------- contours --- */

/**
 * Marching squares over one region's mask. Every cell corner is a sample, so
 * segments join the midpoints of cell edges; each midpoint is shared by exactly
 * two cells and so has degree two, which means the segments always stitch into
 * closed loops (holes included) with no special-casing.
 */
function traceMask(mask: Uint8Array, w: number, h: number): Pt[][] {
  const at = (x: number, y: number) =>
    x < 0 || y < 0 || x >= w || y >= h ? 0 : mask[y * w + x];
  const key = (p: Pt) => `${p[0]}|${p[1]}`;
  const nodes = new Map<string, { p: Pt; nbr: string[] }>();

  const add = (a: Pt, b: Pt) => {
    const pairs: [Pt, Pt][] = [
      [a, b],
      [b, a],
    ];
    for (const [u, v] of pairs) {
      const k = key(u);
      let node = nodes.get(k);
      if (!node) {
        node = { p: u, nbr: [] };
        nodes.set(k, node);
      }
      node.nbr.push(key(v));
    }
  };

  for (let y = -1; y < h; y += 1) {
    for (let x = -1; x < w; x += 1) {
      const code =
        (at(x, y) ? 8 : 0) |
        (at(x + 1, y) ? 4 : 0) |
        (at(x + 1, y + 1) ? 2 : 0) |
        (at(x, y + 1) ? 1 : 0);
      if (code === 0 || code === 15) continue;
      // Cell corner (x,y) sits at pixel centre (x+0.5, y+0.5), so the four
      // edge midpoints of this cell are:
      const T: Pt = [x + 1, y + 0.5];
      const R: Pt = [x + 1.5, y + 1];
      const B: Pt = [x + 1, y + 1.5];
      const L: Pt = [x + 0.5, y + 1];
      switch (code) {
        case 1:
        case 14:
          add(B, L);
          break;
        case 2:
        case 13:
          add(R, B);
          break;
        case 3:
        case 12:
          add(R, L);
          break;
        case 4:
        case 11:
          add(T, R);
          break;
        case 6:
        case 9:
          add(T, B);
          break;
        case 7:
        case 8:
          add(T, L);
          break;
        // The two ambiguous saddles. Either resolution is defensible; picking
        // one consistently is what keeps every midpoint at degree two.
        case 5:
          add(T, L);
          add(R, B);
          break;
        default:
          add(T, R);
          add(B, L);
      }
    }
  }

  const loops: Pt[][] = [];
  const used = new Set<string>();
  for (const start of nodes.keys()) {
    if (used.has(start)) continue;
    const loop: Pt[] = [];
    let k: string | undefined = start;
    let prev = "";
    while (k && !used.has(k)) {
      used.add(k);
      const node = nodes.get(k);
      if (!node) break;
      loop.push(node.p);
      const next = node.nbr.find((c) => c !== prev && !used.has(c));
      prev = k;
      k = next;
    }
    // Under ~8 midpoints is a two-or-three-cell nub, not a shape.
    if (loop.length >= 8) loops.push(loop);
  }
  return loops;
}

/** One Chaikin pass — takes the staircase off a cell-aligned loop. */
function smooth(loop: Pt[]): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i < loop.length; i += 1) {
    const a = loop[i];
    const b = loop[(i + 1) % loop.length];
    out.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25]);
    out.push([a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]);
  }
  return out;
}

/** Ramer–Douglas–Peucker, so a straight run costs two points instead of forty. */
function simplify(pts: Pt[], tol: number): Pt[] {
  if (pts.length < 3) return pts;
  const keep = new Uint8Array(pts.length);
  keep[0] = 1;
  keep[pts.length - 1] = 1;
  const stack: [number, number][] = [[0, pts.length - 1]];
  while (stack.length) {
    const [lo, hi] = stack.pop() as [number, number];
    const [ax, ay] = pts[lo];
    const [bx, by] = pts[hi];
    const dx = bx - ax;
    const dy = by - ay;
    const len = Math.hypot(dx, dy) || 1;
    let worst = -1;
    let far = tol;
    for (let i = lo + 1; i < hi; i += 1) {
      const d = Math.abs((pts[i][0] - ax) * dy - (pts[i][1] - ay) * dx) / len;
      if (d > far) {
        far = d;
        worst = i;
      }
    }
    if (worst > 0) {
      keep[worst] = 1;
      stack.push([lo, worst], [worst, hi]);
    }
  }
  return pts.filter((_, i) => keep[i] === 1);
}

function outlinePath(mask: Uint8Array, w: number, h: number): string {
  const clamp = (v: number, hi: number) => Math.min(hi, Math.max(0, v));
  return traceMask(mask, w, h)
    .map((loop) => {
      const pts = simplify(smooth(loop), 0.35).map(
        ([x, y]) => [clamp(x, w), clamp(y, h)] as Pt
      );
      const head = `M${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
      const rest = pts
        .slice(1)
        .map((p) => `L${p[0].toFixed(1)} ${p[1].toFixed(1)}`)
        .join("");
      return `${head}${rest}Z`;
    })
    .join("");
}

/* ------------------------------------------------------------- the pass --- */

export function segmentImage(source: HTMLCanvasElement): SegmentResult {
  const { data, w, h } = readGrid(source);
  const n = w * h;
  const labels = new Int32Array(n).fill(-1);
  /** running colour sums per raw region, so growth compares against a mean */
  const sum: { r: number; g: number; b: number; count: number }[] = [];
  const cells: number[][] = [];
  const stack: number[] = [];
  const tol2 = TOLERANCE * TOLERANCE;

  for (let seed = 0; seed < n; seed += 1) {
    if (labels[seed] !== -1) continue;
    if (data[seed * 4 + 3] < 128) {
      labels[seed] = ERASED;
      continue;
    }
    const id = sum.length;
    const acc = {
      r: data[seed * 4],
      g: data[seed * 4 + 1],
      b: data[seed * 4 + 2],
      count: 1,
    };
    sum.push(acc);
    const own: number[] = [seed];
    cells.push(own);
    labels[seed] = id;
    stack.length = 0;
    stack.push(seed);

    while (stack.length) {
      const p = stack.pop() as number;
      const px = p % w;
      const py = (p - px) / w;
      for (let k = 0; k < 4; k += 1) {
        const nx = px + (k === 0 ? -1 : k === 1 ? 1 : 0);
        const ny = py + (k === 2 ? -1 : k === 3 ? 1 : 0);
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const q = ny * w + nx;
        if (labels[q] !== -1) continue;
        const o = q * 4;
        if (data[o + 3] < 128) {
          labels[q] = ERASED;
          continue;
        }
        const dr = data[o] - acc.r / acc.count;
        const dg = data[o + 1] - acc.g / acc.count;
        const db = data[o + 2] - acc.b / acc.count;
        if (dr * dr + dg * dg + db * db > tol2) continue;
        labels[q] = id;
        acc.r += data[o];
        acc.g += data[o + 1];
        acc.b += data[o + 2];
        acc.count += 1;
        own.push(q);
        stack.push(q);
      }
    }
  }

  /* Absorb the specks. Smallest first, and repeated, so a chain of specks
     collapses inward instead of each one hunting for a survivor. */
  const minSize = Math.max(6, Math.round(n * MIN_REGION));
  const alive = cells.map((c) => c.length > 0);
  for (let pass = 0; pass < 2; pass += 1) {
    const order = cells
      .map((_, id) => id)
      .filter((id) => alive[id] && cells[id].length < minSize)
      .sort((a, b) => cells[a].length - cells[b].length);

    for (const id of order) {
      const touching = new Map<number, number>();
      for (const p of cells[id]) {
        const px = p % w;
        const py = (p - px) / w;
        for (let k = 0; k < 4; k += 1) {
          const nx = px + (k === 0 ? -1 : k === 1 ? 1 : 0);
          const ny = py + (k === 2 ? -1 : k === 3 ? 1 : 0);
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const other = labels[ny * w + nx];
          if (other === id || other === ERASED || other < 0) continue;
          touching.set(other, (touching.get(other) ?? 0) + 1);
        }
      }
      if (!touching.size) continue;
      // Longest shared border wins — the neighbour it is most part of.
      let host = -1;
      let best = -1;
      for (const [other, shared] of touching) {
        if (shared > best) {
          best = shared;
          host = other;
        }
      }
      if (host < 0) continue;
      for (const p of cells[id]) labels[p] = host;
      cells[host] = cells[host].concat(cells[id]);
      sum[host].r += sum[id].r;
      sum[host].g += sum[id].g;
      sum[host].b += sum[id].b;
      sum[host].count += sum[id].count;
      cells[id] = [];
      alive[id] = false;
    }
  }

  /* Re-number what survived, then measure and trace it. */
  const ring = 2 * (w + h) - 4;
  const regions: Region[] = [];
  const remap = new Int32Array(cells.length).fill(-1);

  cells.forEach((own, id) => {
    if (!alive[id] || own.length === 0) return;
    const next = regions.length;
    remap[id] = next;

    const mask = new Uint8Array(n);
    let sx = 0;
    let sy = 0;
    let border = 0;
    for (const p of own) {
      mask[p] = 1;
      const px = p % w;
      const py = (p - px) / w;
      sx += px;
      sy += py;
      if (px === 0 || py === 0 || px === w - 1 || py === h - 1) border += 1;
    }

    const size = own.length;
    const frac = size / n;
    // A region that lines the frame edge is the backdrop the subject stands in.
    const edge = Math.min(1, (border / ring) * 2.6);
    // Subjects live in a size band: a speck is texture, a third of the frame
    // is scenery. Fall off smoothly on both sides of it.
    const band =
      frac < 0.004
        ? frac / 0.004
        : frac > 0.14
          ? Math.max(0, 1 - (frac - 0.14) / 0.16)
          : 1;

    regions.push({
      id: next,
      size,
      cx: sx / size,
      cy: sy / size,
      color: `rgb(${Math.round(sum[id].r / sum[id].count)} ${Math.round(
        sum[id].g / sum[id].count
      )} ${Math.round(sum[id].b / sum[id].count)})`,
      outline: outlinePath(mask, w, h),
      subject: Math.max(0, 1 - edge) * band,
    });
  });

  for (let i = 0; i < n; i += 1) {
    if (labels[i] >= 0) labels[i] = remap[labels[i]];
  }

  const subjects = regions
    .filter((r) => r.subject > 0.34 && r.outline)
    .sort((a, b) => b.subject - a.subject);

  return { width: w, height: h, labels, regions, subjects };
}

/** The region under a point given in 0…1 image coordinates, or null. */
export function regionAt(
  seg: SegmentResult,
  u: number,
  v: number
): Region | null {
  const x = Math.min(seg.width - 1, Math.max(0, Math.floor(u * seg.width)));
  const y = Math.min(seg.height - 1, Math.max(0, Math.floor(v * seg.height)));
  const id = seg.labels[y * seg.width + x];
  return id >= 0 ? (seg.regions[id] ?? null) : null;
}

/**
 * Hand the ranked subjects out to the keywords in order, `count` each — the
 * highlight set behind a keyword run.
 */
export function assignSubjects(
  seg: SegmentResult,
  counts: number[]
): { region: Region; word: number }[] {
  const out: { region: Region; word: number }[] = [];
  let cursor = 0;
  counts.forEach((count, word) => {
    for (let i = 0; i < count && cursor < seg.subjects.length; i += 1) {
      out.push({ region: seg.subjects[cursor], word });
      cursor += 1;
    }
  });
  return out;
}

/**
 * Seed counts for a keyword run: what the ranking found, spread over the words.
 * Never more than the pass can actually point at — a row reading "3" while three
 * nothings are highlighted is worse than a row reading "0".
 */
export function seedCounts(seg: SegmentResult, words: number): number[] {
  const n = Math.max(1, words);
  const total = Math.min(seg.subjects.length, 12);
  const each = Math.floor(total / n);
  const spare = total % n;
  return Array.from({ length: n }, (_, i) => each + (i < spare ? 1 : 0));
}
