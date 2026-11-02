import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui";
import { GlassPanel } from "@/components/glass";
import { Icon } from "@/components/icons";
import { DockPanel } from "./panel-dock";
import { AssetThumb } from "./AssetThumb";
import type { AssetStore } from "./useAssets";
import type { Asset } from "./assets-data";

/** Simulated duration of a build pass, in ms. */
const DURATION = { multiview: 2400, mesh: 2800 } as const;

type JobKind = "multiview" | "mesh";

/** What one keyword asks for: a thing to find, and optionally its own cap. */
interface Keyword {
  label: string;
  /** "person:2" — at most this many of it, out of the photo's total */
  cap?: number;
}

/** The most objects one photo may become, and the fewest. */
const MAX_OBJECTS = { min: 1, max: 10 } as const;

/** "person:2" → { label: "person", cap: 2 }; a bare phrase has no cap. */
function parseKeyword(raw: string): Keyword | null {
  const m = raw.trim().match(/^(.+?)(?::\s*(\d+))?$/);
  if (!m || !m[1].trim()) return null;
  const cap = m[2] ? Math.max(1, Math.min(MAX_OBJECTS.max, Number(m[2]))) : undefined;
  return { label: m[1].trim().toLowerCase(), cap };
}

/**
 * What a build will make, in order — the list Preview draws and Build places.
 *
 * Capped keywords take their cap first; uncapped ones share what is left of the
 * photo's total, one each round in the order they were added, so "car, person"
 * with a total of 3 is a car, a person and a second car. No keywords means
 * "whatever stands out", up to the total.
 */
function planObjects(keywords: Keyword[], total: number): string[] {
  if (keywords.length === 0) return Array.from({ length: total }, (_, i) => `object ${i + 1}`);
  const out: string[] = [];
  for (const k of keywords) if (k.cap) for (let i = 0; i < k.cap && out.length < total; i++) out.push(k.label);
  const open = keywords.filter((k) => !k.cap);
  for (let round = 0; open.length && out.length < total; round++)
    for (const k of open) if (out.length < total) out.push(k.label);
  return out;
}

/**
 * Where Preview draws object `i` of `n` on a photo.
 *
 * One cell each, in a grid across the frame, jittered inside the cell — so
 * the boxes read as things found at different spots rather than a pile of
 * overlapping labels, and stay put (seeded per photo) when Preview toggles.
 */
function previewBox(seed: number, i: number, n: number) {
  const r = (k: number) => {
    const x = Math.sin(seed * 12.9898 + i * 78.233 + k * 37.719) * 43758.5453;
    return x - Math.floor(x);
  };
  const cols = Math.ceil(Math.sqrt(n));
  const rows = Math.ceil(n / cols);
  const cw = 92 / cols;
  const ch = 80 / rows;
  const w = cw * (0.55 + r(1) * 0.25);
  const h = ch * (0.55 + r(2) * 0.3);
  return {
    left: 4 + (i % cols) * cw + r(3) * (cw - w),
    // 12% clear at the top for the first row's labels
    top: 12 + Math.floor(i / cols) * ch + r(4) * (ch - h) * 0.6,
    width: w,
    height: h,
  };
}

/**
 * Generate3DMeshPanel — 3D Generate, opened from the AI tools menu.
 *
 * ONE PHOTO IN, A SCENE'S WORTH OF OBJECTS OUT. The photo is a real place —
 * a loading bay, a crossing — and the keywords say which things in it to lift
 * out as meshes: "person:2, forklift". Max objects caps the total so a busy
 * photo can't flood the scene. Preview marks what would be taken before any
 * credits are spent; Build scene makes them and puts them in the scene.
 *
 * It replaced prompt → four reference angles → one mesh. A run still reports
 * itself through the dock shell (progress above the footer while open, a
 * hairline in the header when collapsed), and what it built lands in the
 * library's 3D Meshes, which is what the footer's View opens.
 */
export function Generate3DMeshPanel({
  store,
  incoming,
  onClose,
  onBuildScene,
  onViewResult,
  onPickFromLibrary,
  onIncomingConsumed,
  onDone,
}: {
  store: AssetStore;
  /** an asset chosen in the library's pick mode, waiting to become the photo */
  incoming: Asset[] | null;
  onClose: () => void;
  /** put what a build made into the scene */
  onBuildScene: (assets: Asset[]) => void;
  /** open the library on 3D Meshes — the finished banner's action */
  onViewResult: () => void;
  /** open the library as a chooser for the photo */
  onPickFromLibrary: (remaining: number) => void;
  onIncomingConsumed: () => void;
  /** a build finished — the editor raises the corner toast for when the panel
   *  isn't where you're looking */
  onDone?: (kind: "multiview" | "mesh") => void;
}) {
  /** `url` is set for an uploaded file, so the panel shows the actual photo;
   *  a library pick draws from its seed like every other library thumbnail. */
  const [photo, setPhoto] = useState<{ seed: number; name: string; url?: string } | null>(null);
  // An uploaded file's object URL is let go of when the photo is replaced or
  // removed, and when the panel closes.
  const photoUrl = useRef<string | undefined>(undefined);
  const releasePhoto = () => {
    if (photoUrl.current) URL.revokeObjectURL(photoUrl.current);
    photoUrl.current = undefined;
  };
  useEffect(() => () => releasePhoto(), []);
  const [keywords, setKeywords] = useState<Keyword[]>([]);
  const [draft, setDraft] = useState("");
  const [maxObjects, setMaxObjects] = useState(3);
  const [previewing, setPreviewing] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  const [job, setJob] = useState<JobKind | null>(null);
  const [progress, setProgress] = useState(0);
  const [done, setDone] = useState<{ count: number } | null>(null);

  const doneCb = useRef(onDone);
  doneCb.current = onDone;
  const buildCb = useRef(onBuildScene);
  buildCb.current = onBuildScene;
  const fileRef = useRef<HTMLInputElement>(null);
  const seed = useRef(300);

  const busy = job !== null;
  const plan = planObjects(keywords, maxObjects);

  /* ------------------------------------------------------------------ build */

  // Tick the dock shell's progress, then make the objects. The plan is read at
  // the moment the pass lands, through a ref, so typing a keyword mid-run
  // doesn't restart it.
  const planRef = useRef(plan);
  planRef.current = plan;
  useEffect(() => {
    if (!job) return;
    const total = DURATION[job];
    const started = performance.now();
    setProgress(0);
    const tick = window.setInterval(() => {
      setProgress(Math.min(100, ((performance.now() - started) / total) * 100));
    }, 80);
    const finish = window.setTimeout(() => {
      const counts = new Map<string, number>();
      const made = planRef.current.map((label) => {
        const n = (counts.get(label) ?? 0) + 1;
        counts.set(label, n);
        const name = `${label.charAt(0).toUpperCase()}${label.slice(1)} ${n}`;
        // `generated` earns the Gen3D badge in the library.
        return store.add({ name, type: "mesh", generated: true });
      });
      buildCb.current(made);
      setProgress(100);
      setDone({ count: made.length });
      setJob(null);
      doneCb.current?.("mesh");
    }, total);
    return () => {
      window.clearInterval(tick);
      window.clearTimeout(finish);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job]);

  /* ---------------------------------------------------------------- inputs */

  // A photo picked in the library arrives as a prop: the chooser is the
  // library panel, not this one.
  useEffect(() => {
    if (!incoming || incoming.length === 0) return;
    releasePhoto();
    setPhoto({ seed: incoming[0].seed, name: incoming[0].name });
    setPreviewing(false);
    onIncomingConsumed();
  }, [incoming, onIncomingConsumed]);

  const takeFile = (list: FileList | null) => {
    const f = list?.[0];
    if (!f || !f.type.startsWith("image/")) return;
    releasePhoto();
    photoUrl.current = URL.createObjectURL(f);
    setPhoto({ seed: (seed.current += 13), name: f.name, url: photoUrl.current });
    setPreviewing(false);
  };

  const addKeyword = () => {
    const k = parseKeyword(draft);
    if (!k) return;
    setKeywords((prev) => [...prev.filter((x) => x.label !== k.label), k]);
    setDraft("");
  };

  /* ---------------------------------------------------------------- footer */

  const footer = (
    <div className="flex shrink-0 flex-col gap-2 border-t border-glass/10 p-3">
      {done && !busy && (
        <div data-ui="mesh-done" className="flex items-center gap-2.5 rounded-xl bg-success-soft/60 px-3 py-2.5">
          <Icon name="check" size={16} strokeWidth={3} className="shrink-0 text-success" />
          <p className="type-body min-w-0 flex-1 truncate text-content">
            {done.count} {done.count === 1 ? "object" : "objects"} built and placed
          </p>
          <button
            type="button"
            data-ui="mesh-done-view"
            onClick={() => {
              setDone(null);
              onViewResult();
            }}
            className="type-body-strong shrink-0 text-brand underline underline-offset-2"
          >
            View
          </button>
          <button
            type="button"
            aria-label="Dismiss"
            data-ui="mesh-done-dismiss"
            onClick={() => setDone(null)}
            className="grid h-6 w-6 shrink-0 place-items-center rounded-md text-content-muted transition-colors hover:bg-glass/20 hover:text-content"
          >
            <Icon name="close" size={13} />
          </button>
        </div>
      )}
      {/* Preview first, Build second — look before you spend. Both wait for
          a photo: there is nothing to preview or build from without one. */}
      <div className="flex w-full gap-2">
        <Button
          variant="outline"
          size="md"
          data-ui="mesh-preview"
          aria-pressed={previewing}
          disabled={!photo || busy}
          onClick={() => setPreviewing((v) => !v)}
          className="flex-1 !rounded-xl"
        >
          <Icon name="scan" size={17} />
          {previewing ? "Hide preview" : "Preview"}
        </Button>
        <Button
          variant="brand"
          size="md"
          data-ui="mesh-build"
          disabled={!photo || busy}
          onClick={() => {
            setDone(null);
            setJob("mesh");
          }}
          className="flex-1 !rounded-xl"
        >
          <Icon name={busy ? "spinner" : "generate"} size={17} className={cn(busy && "animate-spin")} />
          {busy ? "Building…" : "Build scene"}
        </Button>
      </div>
    </div>
  );

  /* ------------------------------------------------------------------ open */

  return (
    <>
      <input
        ref={fileRef}
        type="file"
        hidden
        accept="image/*"
        data-ui="mesh-image-input"
        onChange={(e) => {
          takeFile(e.target.files);
          e.target.value = "";
        }}
      />

      <DockPanel
        ui="generate-3d-mesh"
        title="3D Generate"
        defaultHeight={380}
        fitContent
        job={job ? { ...JOB_COPY[job], progress } : null}
        collapsed={collapsed}
        onToggleCollapsed={() => setCollapsed((c) => !c)}
        onClose={onClose}
        footer={footer}
      >
        <div className="flex flex-col gap-5 p-4">
          {/* ----------------------------------------------------------- photo */}
          <section className="flex flex-col gap-2.5">
            <div className="flex items-center justify-between">
              <span className="type-body-strong text-content">Photo</span>
              <button
                type="button"
                aria-label="Choose a photo from the asset library"
                title="Choose from library"
                data-ui="mesh-pick-from-library"
                disabled={busy}
                onClick={() => onPickFromLibrary(1)}
                className="grid h-8 w-8 place-items-center rounded-lg border border-brand/30 bg-brand/12 text-content transition-colors hover:bg-brand/20 disabled:pointer-events-none disabled:opacity-40"
              >
                {/* The Asset Library's own glyph — the same one on the toolbar
                    button that opens it — so this reads as "from the library". */}
                <Icon name="assets" size={16} />
              </button>
            </div>

            {photo ? (
              <div
                data-ui="mesh-photo"
                className="group relative aspect-[4/3] overflow-hidden rounded-xl bg-glass/8 ring-1 ring-glass/10"
              >
                {photo.url ? (
                  <img src={photo.url} alt={photo.name} className="absolute inset-0 h-full w-full object-cover" />
                ) : (
                  <AssetThumb type="image" seed={photo.seed} />
                )}
                {previewing &&
                  plan.map((label, i) => {
                    const b = previewBox(photo.seed, i, plan.length);
                    return (
                      <div
                        key={i}
                        data-ui="mesh-preview-box"
                        className="absolute rounded-md border-2 border-brand shadow-[0_0_0_1px_rgba(0,0,0,0.35)]"
                        style={{ left: `${b.left}%`, top: `${b.top}%`, width: `${b.width}%`, height: `${b.height}%` }}
                      >
                        <span className="type-caption-strong absolute -top-px left-0 -translate-y-full whitespace-nowrap rounded-t-md bg-brand px-1.5 py-px text-brand-foreground">
                          {label}
                        </span>
                      </div>
                    );
                  })}
                <span className="type-caption pointer-events-none absolute inset-x-2 bottom-2 truncate rounded-md bg-black/55 px-2 py-1 text-white backdrop-blur-sm">
                  {photo.name}
                </span>
                <button
                  type="button"
                  aria-label="Remove photo"
                  data-ui="mesh-photo-remove"
                  disabled={busy}
                  onClick={() => {
                    releasePhoto();
                    setPhoto(null);
                    setPreviewing(false);
                  }}
                  className="absolute right-2 top-2 grid h-7 w-7 place-items-center rounded-md bg-black/55 text-white/90 backdrop-blur-sm transition-colors hover:bg-danger/70"
                >
                  <Icon name="trash" size={14} />
                </button>
              </div>
            ) : (
              <button
                type="button"
                data-ui="mesh-upload-image"
                onClick={() => fileRef.current?.click()}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOver(false);
                  takeFile(e.dataTransfer.files);
                }}
                className={cn(
                  "flex min-h-[150px] w-full flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed px-4 text-center transition-colors",
                  dragOver
                    ? "border-brand/60 bg-brand/10 text-content"
                    : "border-glass/25 bg-glass/5 text-content-subtle hover:border-glass/40 hover:bg-glass/8 hover:text-content"
                )}
              >
                <Icon name="upload" size={22} className="text-content" />
                <span className="type-body-strong text-content">Upload photo</span>
                <span className="type-caption">Drop an image here, or choose one from the library</span>
              </button>
            )}
          </section>

          {/* -------------------------------------------------------- keywords */}
          <section className="flex flex-col gap-2">
            <span className="type-body-strong text-content">Keywords</span>
            {keywords.length > 0 && (
              <div data-ui="mesh-keywords" className="flex flex-wrap gap-1.5">
                {keywords.map((k) => (
                  <span
                    key={k.label}
                    className="type-label flex items-center gap-1 rounded-full border border-glass/15 bg-glass/10 py-0.5 pl-2.5 pr-1 text-content"
                  >
                    {k.label}
                    {k.cap && <span className="text-content-subtle">· {k.cap}</span>}
                    <button
                      type="button"
                      aria-label={`Remove ${k.label}`}
                      onClick={() => setKeywords((prev) => prev.filter((x) => x.label !== k.label))}
                      className="grid h-4 w-4 place-items-center rounded-full text-content-subtle transition-colors hover:bg-glass/25 hover:text-content"
                    >
                      <Icon name="close" size={11} />
                    </button>
                  </span>
                ))}
              </div>
            )}
            <input
              data-ui="mesh-keyword-input"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addKeyword();
                }
                if (e.key === "Backspace" && !draft && keywords.length) setKeywords((prev) => prev.slice(0, -1));
              }}
              placeholder="Add a keyword"
              className="field-well type-body h-11 w-full rounded-xl border px-3 text-content outline-none placeholder:text-content-subtle focus:border-brand/50"
            />
            <p className="type-caption text-content-subtle">
              Press Enter to add. Use <span className="font-mono text-content-muted">person:2</span> when one
              phrase needs its own cap.
            </p>
          </section>

          {/* ----------------------------------------------------- max objects */}
          <section className="flex items-center justify-between gap-3">
            <div>
              <p className="type-body-strong text-content">Max objects</p>
              <p className="type-caption text-content-subtle">Total for this photo</p>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                aria-label="Fewer objects"
                data-ui="mesh-max-down"
                disabled={maxObjects <= MAX_OBJECTS.min}
                onClick={() => setMaxObjects((n) => Math.max(MAX_OBJECTS.min, n - 1))}
                className="grid h-8 w-8 place-items-center rounded-lg text-content-muted transition-colors hover:bg-glass/15 hover:text-content disabled:opacity-35"
              >
                <Icon name="step-down" size={15} />
              </button>
              <span data-ui="mesh-max-value" className="type-body-strong w-7 text-center tabular-nums text-content">
                {maxObjects}
              </span>
              <button
                type="button"
                aria-label="More objects"
                data-ui="mesh-max-up"
                disabled={maxObjects >= MAX_OBJECTS.max}
                onClick={() => setMaxObjects((n) => Math.min(MAX_OBJECTS.max, n + 1))}
                className="grid h-8 w-8 place-items-center rounded-lg text-content-muted transition-colors hover:bg-glass/15 hover:text-content disabled:opacity-35"
              >
                <Icon name="step-up" size={15} />
              </button>
            </div>
          </section>
        </div>
      </DockPanel>
    </>
  );
}

/** What the dock shell says while each pass runs. */
const JOB_COPY: Record<JobKind, { title: string; hint: string }> = {
  multiview: { title: "Generating multi-view images", hint: "Front, left, right and back" },
  mesh: { title: "Building scene objects", hint: "Lifting each keyword out of the photo" },
};


/**
 * MESH READY — the bottom-left toast.
 *
 * The panel's own footer announces a finished pass, which is the right place
 * while the panel is open. But a mesh takes long enough that people close the
 * panel and carry on working, and then nothing said anything at all: the asset
 * appeared in the library silently. So the announcement exists in both places,
 * and the editor shows whichever one can actually be seen.
 *
 * Deliberately the same object as MatPreviewToast — same corner, same glass,
 * same success tint, same click-to-view — because "a background job finished"
 * is one idea and two different-looking notifications would make it two.
 */
export function MeshDoneToast({
  dockOpen,
  onView,
  onDismiss,
}: {
  /** the library's bottom dock is up, so sit above it rather than under it */
  dockOpen: boolean;
  onView: () => void;
  onDismiss: () => void;
}) {
  return (
    <GlassPanel
      ui="mesh-done-toast"
      thickness="thick"
      interactive
      role="button"
      tabIndex={0}
      onClick={onView}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onView();
        }
      }}
      className={cn(
        "glass-role glass-role-success pointer-events-auto absolute left-6 z-30 flex cursor-pointer items-center gap-3 !rounded-2xl py-3 pl-4 pr-3",
        dockOpen ? "bottom-[calc(3rem+clamp(260px,40vh,392px))]" : "bottom-6"
      )}
    >
      <p className="type-body text-content">
        3D Mesh Generation Completed.{" "}
        <span className="type-body-strong underline underline-offset-2">Click to view</span>
      </p>
      <button
        type="button"
        aria-label="Dismiss"
        data-ui="mesh-done-toast-dismiss"
        onClick={(e) => {
          // The card itself is the "view" action, so the dismiss inside it has
          // to stop the click before it reaches the card.
          e.stopPropagation();
          onDismiss();
        }}
        className="grid h-6 w-6 shrink-0 place-items-center rounded-md text-content-muted transition-colors hover:bg-glass/20 hover:text-content"
      >
        <Icon name="close" size={13} />
      </button>
    </GlassPanel>
  );
}
