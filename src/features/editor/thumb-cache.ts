/**
 * THE LIBRARY'S THUMBNAILS, FETCHED BEFORE ANYONE ASKS FOR THEM.
 *
 * An Assets API screenshot is a 302 to a freshly signed Cloudflare R2 URL —
 * a new signature, so a new URL, every time — and the redirect carries no
 * cache headers. The HTTP cache can therefore never answer for it: every time
 * the library opened, every visible card went back to the network, and the
 * grid filled in tile by tile over a second or two.
 *
 * What does hold is the document's own list of available images: once an
 * image has loaded on the page, a later `<img>` with the same `src` is painted
 * from memory, without a request, whatever the cache headers say. So the
 * editor loads the thumbnails itself, quietly, while the user is working on
 * the scene — a few at a time, at low priority, the first screen of each kind
 * first — and keeps each loaded image alive here so the browser keeps it too.
 * By the time the library is opened the cards have nothing left to fetch.
 *
 * Image elements rather than `fetch`: R2 sends no CORS header, so a script
 * fetch of the file is blocked in production, while an image load is not.
 */

const loaded = new Map<string, HTMLImageElement>();
const failed = new Set<string>();
const queued = new Set<string>();
/** the first screen of each library view — fetched ahead of the rest */
const first: string[] = [];
const rest: string[] = [];
let running = 0;
/** the start delay is pending */
let scheduled = false;
/** the start delay is over — loads may run */
let started = false;

/**
 * How many load at once. The API answers over HTTP/1.1, where the browser
 * opens six connections per host, so more than six only queues inside the
 * browser instead of here — where it can still be paused and reordered.
 */
const CONCURRENCY = 6;
/** while the library is open its own cards come first — see `pauseThumbPreload` */
let paused = false;
/** How long after the editor opens before the first one starts. */
const START_DELAY_MS = 1500;

export const isThumbLoaded = (url: string): boolean => loaded.has(url);

function pump() {
  if (!started || paused) return;
  while (running < CONCURRENCY && (first.length || rest.length)) {
    const url = (first.length ? first : rest).shift()!;
    if (loaded.has(url) || failed.has(url)) continue;
    running += 1;
    const img = new Image();
    img.decoding = "async";
    (img as HTMLImageElement & { fetchPriority?: string }).fetchPriority = "low";
    const done = (ok: boolean) => {
      running -= 1;
      if (ok) loaded.set(url, img);
      else failed.add(url);
      pump();
    };
    img.onload = () => done(true);
    img.onerror = () => done(false);
    img.src = url;
  }
}

/**
 * Queue thumbnails to load in the background. `priority` ones (the first
 * screen of a view) jump the queue. Safe to call again with the same URLs.
 */
export function preloadThumbs(urls: string[], priority = false) {
  for (const url of urls) {
    if (!url || queued.has(url)) continue;
    queued.add(url);
    (priority ? first : rest).push(url);
  }
  if (!scheduled) {
    scheduled = true;
    const go = () => {
      started = true;
      pump();
    };
    const ric = (window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => void })
      .requestIdleCallback;
    window.setTimeout(() => (ric ? ric(go, { timeout: 2000 }) : go()), START_DELAY_MS);
    return;
  }
  pump();
}

/**
 * Move these to the very front, in this order — the cards a view shows first.
 * Already-loaded ones are skipped; unknown ones are queued.
 */
export function prioritizeThumbs(urls: string[]) {
  const want = urls.filter((u) => u && !loaded.has(u) && !failed.has(u));
  const set = new Set(want);
  const keep = (q: string[]) => q.filter((u) => !set.has(u));
  const restLeft = keep(rest);
  const firstLeft = keep(first);
  rest.length = 0;
  rest.push(...restLeft);
  first.length = 0;
  first.push(...want, ...firstLeft);
  want.forEach((u) => queued.add(u));
  pump();
}

/**
 * Hold the background queue while the library is open. Its visible cards load
 * themselves, and they would otherwise wait behind six background loads for a
 * connection. Loads already under way finish; nothing new starts until resumed.
 */
export function pauseThumbPreload(on: boolean) {
  paused = on;
  if (!on) pump();
}

/** For checking the queue from the console in development. */
export const thumbStats = () => ({
  loaded: loaded.size,
  failed: failed.size,
  queued: queued.size,
  running,
});
if (import.meta.env.DEV) (window as Window & { __terraThumbs?: typeof thumbStats }).__terraThumbs = thumbStats;
