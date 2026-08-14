import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { Button, Dialog, DialogContent, DialogTitle } from "@/components/ui";
import { GlassPanel } from "@/components/glass";
import { Icon } from "@/components/icons";
import { Panel, PanelHeader, PanelTitle, PanelClose, PanelBody, PanelFooter, TextArea, Select } from "./ui";
import { DockPanel } from "./panel-dock";
import { AssetThumb } from "./AssetThumb";
import { PlaceholderImage } from "./PlaceholderImage";
import type { AssetStore } from "./useAssets";
import type { Asset } from "./assets-data";

/** The four angles a multi-view pass produces. Also the dropdown vocabulary. */
const VIEWS = ["Front", "Back", "Left", "Right"] as const;
type ViewLabel = (typeof VIEWS)[number];

const MAX_IMAGES = VIEWS.length;

/** Simulated durations for the two async passes, in ms. */
const DURATION = { multiview: 2400, mesh: 2800 } as const;

interface Slot {
  id: string;
  label: ViewLabel;
  seed: number;
  /** true while this angle is still being rendered by a multi-view pass */
  generating?: boolean;
}

type JobKind = "multiview" | "mesh";

/**
 * Generate3DMeshPanel — the 3D Generate tool, opened from the AI rail flyout.
 *
 * Prompt → reference images → multi-view → mesh. A run reports itself through
 * the dock shell — the progress block above the footer while the panel is open,
 * a spinner and a hairline bar in the header once it's collapsed — so the pass
 * stays visible whatever you do to the panel, and there's no separate hidden
 * mode with its own floating toast to keep in step. A finished mesh lands in
 * the library's 3D Meshes, which is what the footer's "View" opens.
 *
 * Everything here is composed from the Terra glass idiom and the `type-*` /
 * role tokens — no raw sizes or colours.
 */
export function Generate3DMeshPanel({
  store,
  incoming,
  onClose,
  onPlacePlaceholder,
  onResolvePlaceholder,
  onViewResult,
  onPickFromLibrary,
  onIncomingConsumed,
  onDone,
}: {
  store: AssetStore;
  /** assets chosen in the library's pick mode, waiting to become slots */
  incoming: Asset[] | null;
  onClose: () => void;
  /**
   * Drop a stand-in mesh into the scene NOW, before the pass runs. "Place into
   * Scene" shouldn't leave the viewport unchanged for three seconds — the
   * placeholder is the answer to the click, and the finished asset replaces it.
   */
  onPlacePlaceholder: () => void;
  /** swap the placeholder for the finished asset */
  onResolvePlaceholder: (asset: Asset) => void;
  /** open the library on 3D Meshes — the completed toast's action */
  onViewResult: () => void;
  /** open the library as a chooser for up to `remaining` reference images */
  onPickFromLibrary: (remaining: number) => void;
  onIncomingConsumed: () => void;
  /**
   * A pass finished. The panel says so itself in its footer, but only while it
   * is open — the editor uses this to raise the bottom-left toast for the case
   * where it isn't.
   */
  onDone?: (kind: "multiview" | "mesh") => void;
}) {
  const [prompt, setPrompt] = useState("");
  const [slots, setSlots] = useState<Slot[]>([]);
  const [collapsed, setCollapsed] = useState(false);

  /** slot open in the preview modal — the full-size look at one reference */
  const [previewId, setPreviewId] = useState<string | null>(null);

  const [job, setJob] = useState<JobKind | null>(null);
  const [progress, setProgress] = useState(0);
  /** which pass just finished — drives the green toast */
  const [done, setDone] = useState<JobKind | null>(null);

  const doneCb = useRef(onDone);
  doneCb.current = onDone;

  const seed = useRef(120);
  // `Generate & Place into Scene` has to survive the async pass, so the intent
  // is parked here rather than being re-derived when the job lands.
  const placeAfter = useRef(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const busy = job !== null;
  const hasImages = slots.length > 0;
  const preview = slots.find((s) => s.id === previewId) ?? null;
  const readyCount = slots.filter((s) => !s.generating).length;
  const canGenerate = prompt.trim().length > 0 || readyCount > 0;

  /* ------------------------------------------------------------------ jobs */

  // One driver for both passes: tick a progress bar, then apply the pass's
  // result. Cleanup clears the timers, so closing or restarting mid-run can't
  // leave a stale completion firing into unmounted state.
  useEffect(() => {
    if (!job) return;
    const total = DURATION[job];
    const started = performance.now();
    setProgress(0);

    const tick = window.setInterval(() => {
      setProgress(Math.min(100, ((performance.now() - started) / total) * 100));
    }, 80);

    const finish = window.setTimeout(() => {
      if (job === "multiview") {
        setSlots((prev) => prev.map((s) => ({ ...s, generating: false })));
      } else {
        const name = prompt.trim() ? prompt.trim().slice(0, 48) : "Generated mesh";
        const asset = store.add({ name, type: "mesh" });
        if (placeAfter.current) onResolvePlaceholder(asset);
        placeAfter.current = false;
      }
      setProgress(100);
      setDone(job);
      setJob(null);
      // Read through a ref so a caller passing a fresh arrow each render can't
      // restart the pass — the effect deliberately depends on `job` alone.
      doneCb.current?.(job);
    }, total);

    return () => {
      window.clearInterval(tick);
      window.clearTimeout(finish);
    };
    // `prompt` is read at completion time only — re-running the pass because the
    // user kept typing would restart the timer on every keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job]);

  /* --------------------------------------------------------------- actions */

  const addSlot = (label: ViewLabel) =>
    setSlots((prev) =>
      prev.length >= MAX_IMAGES
        ? prev
        : [...prev, { id: `slot-${(seed.current += 7)}`, label, seed: seed.current }]
    );

  // Assets picked in the library arrive as a prop, since the chooser is the
  // library panel rather than anything this component owns. Each one takes the
  // next free angle; the seed rides along so the slot shows the real thumbnail.
  useEffect(() => {
    if (!incoming || incoming.length === 0) return;
    setSlots((prev) => {
      const used = new Set(prev.map((s) => s.label));
      const free = VIEWS.filter((v) => !used.has(v));
      return [
        ...prev,
        ...incoming.slice(0, free.length).map((a, i) => ({
          id: `slot-${a.id}-${i}`,
          label: free[i],
          seed: a.seed,
        })),
      ];
    });
    onIncomingConsumed();
  }, [incoming, onIncomingConsumed]);

  const handleFiles = (list: FileList | null) => {
    if (!list) return;
    const room = MAX_IMAGES - slots.length;
    Array.from(list)
      .slice(0, room)
      .forEach((_, i) => addSlot(VIEWS[Math.min(slots.length + i, MAX_IMAGES - 1)]));
  };

  const removeSlot = (id: string) => setSlots((prev) => prev.filter((s) => s.id !== id));

  const relabel = (id: string, label: ViewLabel) =>
    setSlots((prev) => prev.map((s) => (s.id === id ? { ...s, label } : s)));

  const enhance = () =>
    setPrompt((p) => {
      const base = p.trim();
      const suffix = "highly detailed, studio lighting, neutral pose";
      if (!base) return suffix;
      return base.includes(suffix) ? base : `${base}, ${suffix}`;
    });

  const generateMultiview = () => {
    // Fill the remaining angles as pending, then run the pass over them.
    setSlots((prev) => {
      const used = new Set(prev.map((s) => s.label));
      const pending = VIEWS.filter((v) => !used.has(v)).map((label, i) => ({
        id: `slot-${(seed.current += 7) + i}`,
        label,
        seed: seed.current + i,
        generating: true,
      }));
      return [...prev, ...pending];
    });
    setDone(null);
    setJob("multiview");
  };

  const generateMesh = (place: boolean) => {
    placeAfter.current = place;
    if (place) onPlacePlaceholder();
    setDone(null);
    setJob("mesh");
  };

  /* The primary action, pinned under the scrolling body. Lifted out of the
     JSX because the dock shell takes it as a prop — the shell owns the
     border and padding so every docked panel's footer sits identically. */
  const footer = (
    <div className="flex shrink-0 flex-col gap-2 border-t border-glass/10 p-3">
        {/* A finished pass used to be announced by the bottom-left toast, which
            only existed while the panel was hidden — so completing with the
            panel open said nothing at all. It says it here instead, next to the
            button that started it, and carries the way through to the result. */}
        {done && !busy && (
          <div
            data-ui="mesh-done"
            className="flex items-center gap-2.5 rounded-xl bg-success-soft/60 px-3 py-2.5"
          >
            <Icon name="check" size={16} strokeWidth={3} className="shrink-0 text-success" />
            <p className="type-body min-w-0 flex-1 truncate text-content">{DONE_COPY[done].title}</p>
            {done === "mesh" && (
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
            )}
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

        {hasImages ? (
          <>
            {/* Two ways to finish the same job, so they sit on one row —
                stacked, the second read as a separate, later step. */}
            <div className="flex w-full gap-2">
              <Button
                variant="brand"
                size="md"
                data-ui="mesh-generate"
                disabled={busy || !canGenerate}
                onClick={() => generateMesh(false)}
                className="flex-1 !rounded-xl"
              >
                <Icon name={job === "mesh" ? "spinner" : "generate"} size={17} className={cn(job === "mesh" && "animate-spin")} />
                {job === "mesh" ? "Generating…" : "Generate"}
              </Button>
              <Button
                variant="outline"
                size="md"
                data-ui="mesh-generate-place"
                disabled={busy || !canGenerate}
                onClick={() => generateMesh(true)}
                className="flex-1 !rounded-xl"
              >
                <Icon name="place" size={17} />
                Place into Scene
              </Button>
            </div>
          </>
        ) : (
          <Button
            variant="brand"
            size="md"
            data-ui="mesh-generate"
            disabled={busy || !canGenerate}
            onClick={() => generateMesh(false)}
            className="w-full !rounded-xl"
          >
            <Icon name={busy ? "spinner" : "generate"} size={17} className={cn(busy && "animate-spin")} />
            {busy ? "Generating…" : "Generate 3D Mesh"}
          </Button>
        )}
    </div>
  );

  /* ------------------------------------------------------------------ open */

  return (
    <>
      <input
        ref={fileRef}
        type="file"
        multiple
        hidden
        accept="image/*"
        data-ui="mesh-image-input"
        onChange={(e) => {
          handleFiles(e.target.files);
          e.target.value = "";
        }}
      />

      <DockPanel
        ui="generate-3d-mesh"
        title="Generate 3D Mesh"
        defaultHeight={380}
        /* Both generate flows are forms: opening one with its primary button
           below the fold makes the first act after opening it a scroll. */
        fitContent
        job={job ? { ...JOB_COPY[job], progress } : null}
        collapsed={collapsed}
        onToggleCollapsed={() => setCollapsed((c) => !c)}
        onClose={onClose}
        footer={footer}
      >
        <div className="flex flex-col gap-5 p-4">
          {/* Prompt */}
          <section className="flex flex-col gap-2.5">
            <div className="flex items-center justify-between">
              <span className="type-body text-content-subtle">Prompt</span>
              <button
                type="button"
                aria-label="Enhance prompt"
                title="Enhance prompt"
                data-ui="prompt-enhance"
                onClick={enhance}
                className="grid h-8 w-8 place-items-center rounded-lg bg-glass/8 text-content-muted transition-colors hover:bg-glass/15 hover:text-content"
              >
                <Icon name="generate" size={16} />
              </button>
            </div>
            <TextArea
              size="md"
              ui="mesh-prompt"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Write a prompt"
              className="min-h-[96px]"
            />
          </section>

          {/* Reference images */}
          <section className="flex flex-col gap-2.5">
            <div className="flex items-center justify-between gap-3">
              <span className="type-body shrink-0 text-content-subtle">
                Image ({slots.length}/{MAX_IMAGES})
              </span>
              <div className="flex items-center gap-2">
                {hasImages && (
                  <button
                    type="button"
                    data-ui="generate-multi-view"
                    disabled={busy || slots.length >= MAX_IMAGES}
                    onClick={generateMultiview}
                    className="type-body rounded-lg border border-brand/30 bg-brand/12 px-2.5 py-1.5 text-content transition-colors hover:bg-brand/20 disabled:pointer-events-none disabled:opacity-50"
                  >
                    Generate Multi-View
                  </button>
                )}
                <button
                  type="button"
                  aria-label="Choose reference images from the asset library"
                  title="Choose from library"
                  data-ui="mesh-pick-from-library"
                  disabled={busy || slots.length >= MAX_IMAGES}
                  onClick={() => onPickFromLibrary(MAX_IMAGES - slots.length)}
                  className="grid h-8 w-8 place-items-center rounded-lg border border-brand/30 bg-brand/12 text-content transition-colors hover:bg-brand/20 disabled:pointer-events-none disabled:opacity-40"
                >
                  <Icon name="library-picker" size={16} />
                </button>
              </div>
            </div>

            {hasImages ? (
              <div className="flex gap-2 rounded-xl bg-glass/6 p-2">
                {slots.map((s) => (
                  <ImageSlot
                    key={s.id}
                    slot={s}
                    onOpen={() => setPreviewId(s.id)}
                    onRemove={() => removeSlot(s.id)}
                  />
                ))}
                {slots.length < MAX_IMAGES && (
                  <button
                    type="button"
                    aria-label="Add reference image"
                    data-ui="mesh-add-image"
                    onClick={() => fileRef.current?.click()}
                    className="grid aspect-[92/84] flex-1 place-items-center rounded-lg border border-dashed border-glass/25 text-content-subtle transition-colors hover:border-glass/40 hover:text-content"
                  >
                    <Icon name="create" size={18} />
                  </button>
                )}
              </div>
            ) : (
              <button
                type="button"
                data-ui="mesh-upload-image"
                onClick={() => fileRef.current?.click()}
                className="relative flex min-h-[100px] w-full flex-col items-center justify-center gap-1.5 overflow-hidden rounded-xl border border-dashed border-glass/25 bg-glass/5 text-content-subtle transition-colors hover:border-glass/40 hover:bg-glass/8 hover:text-content"
              >
                <PlaceholderImage className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-20" />
                <Icon name="create" size={20} className="relative" />
                <span className="type-body relative">Upload image</span>
              </button>
            )}
          </section>
        </div>
      </DockPanel>

      {preview && (
        <ImagePreviewDialog
          slot={preview}
          taken={slots.map((x) => x.label)}
          onRelabel={(label) => relabel(preview.id, label)}
          onDelete={() => {
            removeSlot(preview.id);
            setPreviewId(null);
          }}
          onClose={() => setPreviewId(null)}
        />
      )}
    </>
  );
}

/* ------------------------------------------------------------------ parts */

function ImageSlot({
  slot,
  onOpen,
  onRemove,
}: {
  slot: Slot;
  onOpen: () => void;
  onRemove: () => void;
}) {
  if (slot.generating) {
    return (
      <div
        data-ui={`mesh-slot-${slot.label.toLowerCase()}`}
        className="flex aspect-[92/84] flex-1 flex-col items-center justify-center gap-1.5 rounded-lg bg-glass/8"
      >
        <Icon name="spinner" size={16} className="animate-spin text-brand" />
        <span className="type-caption text-content-muted">Generating</span>
      </div>
    );
  }

  return (
    <div
      data-ui={`mesh-slot-${slot.label.toLowerCase()}`}
      className="group relative aspect-[92/84] flex-1 overflow-hidden rounded-lg bg-glass/8 ring-1 ring-glass/10"
    >
      {/* The card is the way into the preview — a 92px thumbnail is too small
          to judge a reference by, and everything you might do to one (change
          its angle, drop it) lives at that size. */}
      <button
        type="button"
        aria-label={`Preview ${slot.label} reference`}
        data-ui={`mesh-slot-${slot.label.toLowerCase()}-open`}
        onClick={onOpen}
        className="absolute inset-0"
      >
        <AssetThumb type="image" seed={slot.seed} />
      </button>

      {/* Hover-only: at four cards in a row, four permanent delete buttons read
          as the primary action of the whole strip. Focus reveals it too, so
          it's reachable without a pointer. */}
      <button
        type="button"
        aria-label={`Remove ${slot.label} reference`}
        data-ui={`mesh-slot-${slot.label.toLowerCase()}-remove`}
        onClick={onRemove}
        className="absolute right-1 top-1 grid h-6 w-6 place-items-center rounded-md bg-black/50 text-white/90 opacity-0 backdrop-blur-sm transition-[opacity,background-color] hover:bg-danger/70 focus-visible:opacity-100 group-hover:opacity-100"
      >
        <Icon name="trash" size={13} />
      </button>

      <span className="type-caption-strong pointer-events-none absolute inset-x-1 bottom-1 truncate rounded-md border border-white/20 bg-black/55 px-1.5 py-0.5 text-white backdrop-blur-sm">
        {slot.label}
      </span>
    </div>
  );
}

/**
 * The reference at full size, with the two things you can do to it: say which
 * angle it shows, or drop it. Angles are exclusive — two references both
 * labelled Front would give the mesh pass contradictory input — so the taken
 * ones are disabled rather than silently reassigned.
 */
function ImagePreviewDialog({
  slot,
  taken,
  onRelabel,
  onDelete,
  onClose,
}: {
  slot: Slot;
  taken: ViewLabel[];
  onRelabel: (label: ViewLabel) => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        hideClose
        data-ui="mesh-preview-dialog"
        className="w-[min(560px,calc(100vw-3rem))] border-0 bg-transparent p-0 shadow-none"
      >
        <Panel ui="mesh-preview" className="overflow-hidden">
          <PanelHeader>
            <DialogTitle asChild>
              <PanelTitle>Reference image</PanelTitle>
            </DialogTitle>
            <PanelClose label="Close preview" onClick={onClose} />
          </PanelHeader>

          <PanelBody className="p-4">
            <div className="aspect-[4/3] w-full overflow-hidden rounded-xl ring-1 ring-glass/10">
              <AssetThumb type="image" seed={slot.seed} />
            </div>
          </PanelBody>

          <PanelFooter className="items-center justify-between p-3">
            <label className="flex items-center gap-2">
              <span className="type-body text-content-subtle">View</span>
              <Select
                ui="mesh-preview-angle"
                aria-label="View angle"
                value={slot.label}
                onChange={(e) => onRelabel(e.target.value as ViewLabel)}
                className="w-32"
              >
                {VIEWS.map((v) => (
                  <option key={v} value={v} disabled={v !== slot.label && taken.includes(v)}>
                    {v}
                  </option>
                ))}
              </Select>
            </label>

            <Button variant="danger" size="sm" className="!rounded-lg" data-ui="mesh-preview-delete" onClick={onDelete}>
              <Icon name="trash" size={15} />
              Delete
            </Button>
          </PanelFooter>
        </Panel>
      </DialogContent>
    </Dialog>
  );
}

/** What the dock shell says while each pass runs. */
const JOB_COPY: Record<JobKind, { title: string; hint: string }> = {
  multiview: { title: "Generating multi-view images", hint: "Front, left, right and back" },
  mesh: { title: "Generating 3D mesh", hint: "Building geometry from your references" },
};

/** …and what the footer says once it lands. */
const DONE_COPY: Record<JobKind, { title: string }> = {
  multiview: { title: "Multi-view images ready" },
  mesh: { title: "3D mesh ready" },
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
