import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { Button, Dialog, DialogContent, DialogTitle } from "@/components/ui";
import { GlassPanel } from "@/components/glass";
import { Icon } from "@/components/icons";
import { Panel, PanelHeader, PanelTitle, PanelClose, PanelBody, PanelFooter } from "./ui";
import { DockPanel, type DockJob } from "./panel-dock";
import { AssetThumb } from "./AssetThumb";
import { PlaceholderImage } from "./PlaceholderImage";
import type { CameraHandle } from "./SceneCanvas";
import { flatten, matPass } from "./mat-pass";

/** MAT takes exactly one source frame — it's a preview of one view. */
const MAX_IMAGES = 1;

/** Simulated render time, in ms. */
const DURATION = 2600;

/**
 * The result of a MAT run. Held by the editor rather than by this panel: the
 * panel closes itself the moment a preview lands, and the preview has to
 * outlive it — it's what the top-bar play button opens.
 */
export interface MatPreview {
  id: string;
  /** thumbnail seed, carried from the source image so the result reads as
   *  derived from it rather than as an unrelated picture */
  seed: number;
  postProcessed: boolean;
  sourceName: string;
  /** the preview itself, built from the captured view */
  src?: string;
}

interface SourceImage {
  seed: number;
  name: string;
  /** the captured view, flattened onto the editor's backdrop */
  src: string;
}

/**
 * MatPreviewPanel — the MAT tool, opened from the AI rail flyout.
 *
 * One view in, one preview out. The source is not an upload: it is the view
 * the user is looking at, captured as the pure scene — no panels, no gizmos,
 * no cube (CameraHandle.capture) — because MAT is a pass over THIS world, and
 * the question it answers is "what does the shot I have set up look like for
 * real?". The panel is deliberately smaller than the 3D
 * Generate flow next to it in the flyout: MAT has a single input and a single
 * switch, so it gets a single screen with no minimise state and no prompt.
 *
 * On completion the panel closes and hands the preview to the editor. That is
 * the whole reason the top bar grows a play button — the result doesn't live in
 * a panel you can leave open, so there has to be a way back to it, and the
 * completion toast alone would disappear.
 */
export function MatPreviewPanel({
  cameraRef,
  history,
  historyOpen,
  onToggleHistory,
  onOpenPreview,
  onClose,
  onComplete,
  onJobChange,
}: {
  /** the live viewport camera — whose view is captured */
  cameraRef: React.MutableRefObject<CameraHandle | null>;
  /**
   * Every preview this project has produced, newest first.
   *
   * A MAT pass used to leave nothing behind: the result opened in a full-screen
   * view and the only way back to it was a toast you had one chance to click.
   * Generating a second one made the first unreachable. The panel that produced
   * them is the obvious place to keep them.
   */
  history: MatPreview[];
  historyOpen: boolean;
  onToggleHistory: () => void;
  /** open one at full size */
  onOpenPreview: (preview: MatPreview) => void;
  onClose: () => void;
  onComplete: (preview: MatPreview) => void;
  /** the running pass, for the editor's bottom-left activity card */
  onJobChange?: (job: DockJob | null) => void;
}) {
  const [image, setImage] = useState<SourceImage | null>(null);
  const [postProcess, setPostProcess] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [collapsed, setCollapsed] = useState(false);
  /** the source image, opened at full size — a 92px thumbnail is too small to
   *  judge the material you're about to render from */
  const [previewOpen, setPreviewOpen] = useState(false);

  const seed = useRef(320);
  /** true while the viewport is taking the shot */
  const [capture, setCapture] = useState(false);
  const shots = useRef(0);

  const hasImage = image !== null;

  const job: DockJob | null = busy
    ? {
        title: "Generating MAT preview",
        hint: postProcess ? "Rendering with post-processing" : "Rendering the material",
        progress,
      }
    : null;
  // Reported to the editor's bottom-left corner, beside SAB's adds.
  const jobCb = useRef(onJobChange);
  jobCb.current = onJobChange;
  useEffect(() => {
    jobCb.current?.(job);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busy, progress, postProcess]);
  useEffect(() => () => jobCb.current?.(null), []);

  const captureView = async () => {
    const cam = cameraRef.current;
    if (!cam || capture) return;
    setCapture(true);
    try {
      const src = await flatten(await cam.capture());
      shots.current += 1;
      setImage({ seed: (seed.current += 13), name: `View ${shots.current}`, src });
    } finally {
      setCapture(false);
    }
  };

  /* ------------------------------------------------------------------- job */

  // Cleanup clears the timer, so closing mid-run can't fire a completion into
  // unmounted state — the same guard the 3D pass uses.
  useEffect(() => {
    if (!busy || !image) return;
    const started = performance.now();
    setProgress(0);

    // The run is a fixed duration, so the bar can be honest about where it is
    // rather than shimmering — the same driver the 3D pass uses.
    const tick = window.setInterval(() => {
      setProgress(Math.min(100, ((performance.now() - started) / DURATION) * 100));
    }, 80);

    // The pass is built while the bar runs; the bar's end is when it lands.
    let cancelled = false;
    const result = matPass(image.src, postProcess);
    const finish = window.setTimeout(async () => {
      const src = await result.catch(() => undefined);
      if (cancelled) return;
      setBusy(false);
      setProgress(100);
      onComplete({
        id: `mat-${Date.now().toString(36)}`,
        seed: image.seed,
        postProcessed: postProcess,
        sourceName: image.name,
        src,
      });
    }, DURATION);

    return () => {
      cancelled = true;
      window.clearInterval(tick);
      window.clearTimeout(finish);
    };
    // `postProcess` and `image` are read at completion time only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busy]);

  /* --------------------------------------------------------------- actions */

  // Dropping the view drops the switch with it: post-processing is a statement
  // about a frame, and leaving it armed for whatever gets captured next is a
  // setting the user never made.
  const clearImage = () => {
    setImage(null);
    setPostProcess(false);
    // The dialog is a view OF the image; without one there's nothing to look at.
    setPreviewOpen(false);
  };

  return (
    <>
      <DockPanel
        ui="mat-preview"
        title="MAT Preview"
        defaultHeight={320}
        /* Both generate flows are forms: opening one with its primary button
           below the fold makes the first act after opening it a scroll. */
        fitContent
        /* A capture is taller than the empty slot it lands in; grow once so
           the frame and the post-processing switch are both in view. */
        refitKey={image?.src ? image.name : "empty"}
        job={job}
        /* The full block lives in the editor's corner now; the shell keeps
           only its collapsed-header spinner. */
        jobDisplay="collapsed"
        collapsed={collapsed}
        onToggleCollapsed={() => setCollapsed((c) => !c)}
        onClose={onClose}
        actions={
          <button
            type="button"
            aria-pressed={historyOpen}
            data-ui="mat-history-toggle"
            onClick={onToggleHistory}
            title={
              history.length === 0
                ? "No previews yet"
                : `${history.length} preview${history.length === 1 ? "" : "s"} in this project`
            }
            className={cn(
              "type-caption-strong flex shrink-0 items-center gap-1 rounded-full border px-2 py-1 transition-colors",
              historyOpen
                ? "border-brand/50 bg-brand/12 text-brand"
                : "border-glass/14 text-content-muted hover:text-content"
            )}
          >
            <Icon name="library" size={12} />
            History
            {history.length > 0 && <span className="type-numeric-sm">{history.length}</span>}
          </button>
        }
        footer={
          <div className="flex shrink-0 gap-2.5 border-t border-glass/10 p-3">
            {historyOpen ? (
              /* The way back, stated as a button as well as the header toggle.
                 A mode you entered from a chip in the header is a mode people
                 look for an exit from where they are LOOKING — which is the
                 list, not the chip. */
              <Button
                variant="secondary"
                size="md"
                data-ui="mat-history-back"
                onClick={onToggleHistory}
                className="w-full !rounded-xl"
              >
                <Icon name="back" size={17} />
                Back to Preview
              </Button>
            ) : (
              <Button
                variant="brand"
                size="md"
                data-ui="mat-generate-preview"
                disabled={!hasImage || busy}
                onClick={() => setBusy(true)}
                className="w-full !rounded-xl"
              >
                <Icon
                  name={busy ? "spinner" : "generate"}
                  size={17}
                  className={cn(busy && "animate-spin")}
                />
                {busy ? "Generating Preview…" : "Generate Preview"}
              </Button>
            )}
          </div>
        }
      >
        {/* HISTORY IS A MODE, not a section stacked above the form.
            Both at once meant the thing you came to look at opened above a form
            you weren't using, and the panel got long enough to scroll for
            neither job well. One panel, two states, one control to swap them. */}
        {historyOpen ? (
          <div data-ui="mat-history" className="flex flex-col gap-3 p-4">
            <span className="type-eyebrow text-content-muted">
              Previews in this project ({history.length})
            </span>

            {history.length === 0 ? (
              <p className="type-caption rounded-lg border border-glass/10 bg-glass/5 px-2.5 py-2 text-content-subtle">
                Nothing generated yet. A finished preview lands here and stays.
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {history.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    data-ui={`mat-history-${p.id}`}
                    onClick={() => onOpenPreview(p)}
                    title={`From ${p.sourceName}${p.postProcessed ? " · post-processed" : ""}`}
                    className="group overflow-hidden rounded-xl border border-glass/12 bg-glass/6 text-left transition-colors hover:border-brand/50"
                  >
                    <span className="relative block aspect-[4/3] w-full overflow-hidden">
                      <AssetThumb type="image" seed={p.seed} src={p.src} />
                    </span>
                    <span className="block px-2 py-1.5">
                      <span className="type-caption-strong block truncate text-content">
                        {p.sourceName}
                      </span>
                      <span className="type-caption block truncate text-content-subtle">
                        {p.postProcessed ? "Post-processed" : "Material only"}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
        <div className="flex flex-col gap-4 p-4">
          <section className="flex flex-col gap-2.5">
            <div className="flex items-center justify-between gap-3">
              <span className="type-body shrink-0 text-content-subtle">
                View ({image ? 1 : 0}/{MAX_IMAGES})
              </span>
              {/* Recapture without deleting first: frame the shot again, press. */}
              {hasImage && (
                <button
                  type="button"
                  aria-label="Capture the view again"
                  title="Recapture view"
                  data-ui="mat-recapture"
                  disabled={busy || capture}
                  onClick={captureView}
                  className="type-caption-strong flex h-8 items-center gap-1.5 rounded-lg border border-brand/30 bg-brand/12 px-2.5 text-content transition-colors hover:bg-brand/20 disabled:pointer-events-none disabled:opacity-40"
                >
                  <Icon name="camera" size={14} />
                  Recapture
                </button>
              )}
            </div>

            {image ? (
              <div className="flex gap-2 rounded-xl bg-glass/6 p-2">
                <div
                  data-ui="mat-source-image"
                  className="group relative aspect-video w-full overflow-hidden rounded-lg bg-glass/8 ring-1 ring-glass/10"
                >
                  {/* The thumbnail is the way in, exactly as it is for a mesh
                      reference: at 92px you can't tell what material you're
                      about to render, so clicking it opens the image full size. */}
                  <button
                    type="button"
                    aria-label={`Preview ${image.name}`}
                    data-ui="mat-source-image-open"
                    onClick={() => setPreviewOpen(true)}
                    className="absolute inset-0"
                  >
                    <AssetThumb type="image" seed={image.seed} src={image.src} />
                  </button>
                  <button
                    type="button"
                    aria-label={`Remove ${image.name}`}
                    data-ui="mat-remove-image"
                    disabled={busy}
                    onClick={clearImage}
                    className="absolute right-1 top-1 grid h-6 w-6 place-items-center rounded-md bg-black/50 text-white/90 backdrop-blur-sm transition-colors hover:bg-danger/70 disabled:pointer-events-none disabled:opacity-40"
                  >
                    <Icon name="trash" size={13} />
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                data-ui="mat-capture-view"
                disabled={capture}
                onClick={captureView}
                className="relative flex min-h-[100px] w-full flex-col items-center justify-center gap-1.5 overflow-hidden rounded-xl border border-dashed border-glass/25 bg-glass/5 text-content-subtle transition-colors hover:border-glass/40 hover:bg-glass/8 hover:text-content disabled:cursor-wait"
              >
                <PlaceholderImage className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-20" />
                <Icon
                  name={capture ? "spinner" : "camera"}
                  size={20}
                  className={cn("relative", capture && "animate-spin")}
                />
                <span className="type-body relative">{capture ? "Capturing…" : "Capture view"}</span>
                <span className="type-caption relative text-content-subtle">
                  The scene as you see it — no panels
                </span>
              </button>
            )}
          </section>

          {/* Post-processing has nothing to act on until there's a source, so it
              stays inert rather than offering a switch that changes nothing. */}
          <Checkbox
            ui="mat-post-processing"
            checked={postProcess}
            disabled={!hasImage || busy}
            onChange={setPostProcess}
            label="Enable Post-processing"
          />
        </div>
        )}
      </DockPanel>

      {previewOpen && image && (
        <SourceImagePreviewDialog
          image={image}
          canDelete={!busy}
          onDelete={clearImage}
          onClose={() => setPreviewOpen(false)}
        />
      )}
    </>
  );
}

/* ------------------------------------------------------------------ parts */

/**
 * The source image at full size — the same dialog the 3D panel opens for a
 * reference, so "click the thumbnail to see it properly" means one thing across
 * both tools.
 *
 * It carries only Delete. A mesh reference also picks its view angle, because
 * four of them have to agree about which side each one shows; MAT takes exactly
 * one image and asks nothing about it, so there is no second control to invent.
 * Delete is disabled mid-run rather than hidden: the button is where the user
 * left it, it just can't pull the input out from under a render in flight.
 */
function SourceImagePreviewDialog({
  image,
  canDelete,
  onDelete,
  onClose,
}: {
  image: SourceImage;
  canDelete: boolean;
  onDelete: () => void;
  onClose: () => void;
}) {
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        hideClose
        data-ui="mat-source-preview-dialog"
        className="w-[min(560px,calc(100vw-3rem))] border-0 bg-transparent p-0 shadow-none"
      >
        <Panel ui="mat-source-preview" className="overflow-hidden">
          <PanelHeader>
            <DialogTitle asChild>
              <PanelTitle>Captured view</PanelTitle>
            </DialogTitle>
            <PanelClose label="Close preview" onClick={onClose} />
          </PanelHeader>

          <PanelBody className="p-4">
            <div className="aspect-video w-full overflow-hidden rounded-xl ring-1 ring-glass/10">
              <AssetThumb type="image" seed={image.seed} src={image.src} />
            </div>
          </PanelBody>

          <PanelFooter className="items-center justify-between p-3">
            {/* Which capture this is, when there have been several. */}
            <span className="type-body min-w-0 truncate text-content-subtle">{image.name}</span>

            <Button
              variant="danger"
              size="sm"
              className="!rounded-lg"
              data-ui="mat-source-preview-delete"
              disabled={!canDelete}
              onClick={onDelete}
            >
              <Icon name="trash" size={15} />
              Delete
            </Button>
          </PanelFooter>
        </Panel>
      </DialogContent>
    </Dialog>
  );
}

/**
 * The completion toast. Unlike the 3D flow's, this one never shows progress —
 * the MAT panel stays open for its whole run, so by the time the toast exists
 * the work is done and the only thing left to say is where the result went.
 *
 * The tint goes through `.glass-role`, which layers colour as a background
 * IMAGE over the glass ink. A background-COLOUR would drop the ink instead and
 * leave the label floating on a wash of the scene.
 */
export function MatPreviewToast({
  dockOpen,
  onView,
  onDismiss,
}: {
  dockOpen: boolean;
  onView: () => void;
  onDismiss: () => void;
}) {
  return (
    <GlassPanel
      ui="mat-preview-toast"
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
        // Sit above the library dock rather than under it when both are up.
        dockOpen ? "bottom-[calc(3rem+clamp(260px,40vh,392px))]" : "bottom-6"
      )}
    >
      <p className="type-body text-content">
        MAT Preview Generation Completed.{" "}
        <span className="type-body-strong underline underline-offset-2">Click to view</span>
      </p>
      <button
        type="button"
        aria-label="Dismiss"
        data-ui="mat-preview-toast-dismiss"
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

/**
 * A checkbox on glass. Native `<input type=checkbox>` can't be restyled
 * consistently across browsers — the same reason the colour picker overlays a
 * styled swatch — so the input carries the semantics and focus behaviour while
 * a sibling box carries the look.
 */
function Checkbox({
  ui,
  checked,
  disabled,
  onChange,
  label,
}: {
  ui: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <label
      className={cn(
        "flex items-center gap-2.5",
        disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"
      )}
    >
      <span className="relative grid h-5 w-5 shrink-0 place-items-center">
        <input
          type="checkbox"
          data-ui={ui}
          checked={checked}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
          className="peer absolute inset-0 h-full w-full cursor-[inherit] appearance-none rounded-[6px] border border-glass/25 bg-glass/10 outline-none transition-colors checked:border-brand/50 checked:bg-brand/15 focus-visible:ring-2 focus-visible:ring-ring"
        />
        {checked && (
          <Icon
            name="check"
            size={13}
            strokeWidth={3}
            className="pointer-events-none relative text-brand"
          />
        )}
      </span>
      <span className="type-body text-content-muted">{label}</span>
    </label>
  );
}
