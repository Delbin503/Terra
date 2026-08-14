import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { Button, Dialog, DialogContent, DialogTitle } from "@/components/ui";
import { GlassPanel } from "@/components/glass";
import { Icon } from "@/components/icons";
import { Panel, PanelHeader, PanelTitle, PanelClose, PanelBody, PanelFooter } from "./ui";
import { DockPanel } from "./panel-dock";
import { AssetThumb } from "./AssetThumb";
import { PlaceholderImage } from "./PlaceholderImage";
import type { Asset } from "./assets-data";

/** MAT takes exactly one source image — it's a material preview of one thing. */
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
}

interface SourceImage {
  seed: number;
  name: string;
}

/**
 * MatPreviewPanel — the MAT tool, opened from the AI rail flyout.
 *
 * One image in, one preview out. The panel is deliberately smaller than the 3D
 * Generate flow next to it in the flyout: MAT has a single input and a single
 * switch, so it gets a single screen with no minimise state and no prompt.
 *
 * On completion the panel closes and hands the preview to the editor. That is
 * the whole reason the top bar grows a play button — the result doesn't live in
 * a panel you can leave open, so there has to be a way back to it, and the
 * completion toast alone would disappear.
 */
export function MatPreviewPanel({
  incoming,
  history,
  historyOpen,
  onToggleHistory,
  onOpenPreview,
  onClose,
  onComplete,
  onPickFromLibrary,
  onIncomingConsumed,
}: {
  /** an asset chosen in the library's pick mode, waiting to become the source */
  incoming: Asset | null;
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
  /** open the library as a chooser for the source image */
  onPickFromLibrary: () => void;
  onIncomingConsumed: () => void;
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
  const fileRef = useRef<HTMLInputElement>(null);

  const hasImage = image !== null;

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

    const finish = window.setTimeout(() => {
      setBusy(false);
      setProgress(100);
      onComplete({
        id: `mat-${Date.now().toString(36)}`,
        seed: image.seed,
        postProcessed: postProcess,
        sourceName: image.name,
      });
    }, DURATION);

    return () => {
      window.clearInterval(tick);
      window.clearTimeout(finish);
    };
    // `postProcess` and `image` are read at completion time only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busy]);

  /* --------------------------------------------------------------- actions */

  // An asset picked in the library arrives as a prop, since the chooser is the
  // library panel rather than anything this component owns. Its seed rides
  // along so the slot shows that asset's real thumbnail.
  useEffect(() => {
    if (!incoming) return;
    setImage({ seed: incoming.seed, name: incoming.name });
    onIncomingConsumed();
  }, [incoming, onIncomingConsumed]);

  const handleFiles = (list: FileList | null) => {
    const file = list?.[0];
    if (!file) return;
    setImage({ seed: (seed.current += 13), name: file.name });
  };

  // Dropping the image drops the switch with it: post-processing is a statement
  // about an image, and leaving it armed for whatever gets uploaded next is a
  // setting the user never made.
  const clearImage = () => {
    setImage(null);
    setPostProcess(false);
    // The dialog is a view OF the image; without one there's nothing to look at.
    setPreviewOpen(false);
  };

  return (
    <>
      <input
        ref={fileRef}
        type="file"
        hidden
        accept="image/*"
        data-ui="mat-image-input"
        onChange={(e) => {
          handleFiles(e.target.files);
          e.target.value = "";
        }}
      />

      <DockPanel
        ui="mat-preview"
        title="MAT Preview"
        defaultHeight={320}
        /* Both generate flows are forms: opening one with its primary button
           below the fold makes the first act after opening it a scroll. */
        fitContent
        job={
          busy
            ? {
                title: "Generating MAT preview",
                hint: postProcess ? "Rendering with post-processing" : "Rendering the material",
                progress,
              }
            : null
        }
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
          </div>
        }
      >
        <div className="flex flex-col gap-4 p-4">
          {historyOpen && (
            <section data-ui="mat-history" className="flex flex-col gap-2.5">
              <span className="type-eyebrow text-content-muted">
                Previews in this project ({history.length})
              </span>

              {history.length === 0 ? (
                <p className="type-caption rounded-lg border border-glass/10 bg-glass/5 px-2.5 py-2 text-content-subtle">
                  Nothing generated yet. A finished preview lands here and stays.
                </p>
              ) : (
                <div className="grid grid-cols-3 gap-2">
                  {history.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      data-ui={`mat-history-${p.id}`}
                      onClick={() => onOpenPreview(p)}
                      title={`From ${p.sourceName}${p.postProcessed ? " · post-processed" : ""}`}
                      className="group overflow-hidden rounded-lg border border-glass/12 bg-glass/6 text-left transition-colors hover:border-brand/50"
                    >
                      <span className="relative block aspect-[4/3] w-full overflow-hidden">
                        <AssetThumb type="image" seed={p.seed} />
                      </span>
                      <span className="type-caption-strong block truncate px-1.5 py-1 text-content">
                        {p.sourceName}
                      </span>
                    </button>
                  ))}
                </div>
              )}

              <div className="h-px bg-glass/10" />
            </section>
          )}

          <section className="flex flex-col gap-2.5">
            <div className="flex items-center justify-between gap-3">
              <span className="type-body shrink-0 text-content-subtle">
                Image ({image ? 1 : 0}/{MAX_IMAGES})
              </span>
              <button
                type="button"
                aria-label="Choose a source image from the asset library"
                title="Choose from library"
                data-ui="mat-pick-from-library"
                disabled={busy || hasImage}
                onClick={onPickFromLibrary}
                className="grid h-8 w-8 place-items-center rounded-lg border border-brand/30 bg-brand/12 text-content transition-colors hover:bg-brand/20 disabled:pointer-events-none disabled:opacity-40"
              >
                <Icon name="library-picker" size={16} />
              </button>
            </div>

            {image ? (
              <div className="flex gap-2 rounded-xl bg-glass/6 p-2">
                <div
                  data-ui="mat-source-image"
                  className="group relative aspect-[92/84] w-[92px] overflow-hidden rounded-lg bg-glass/8 ring-1 ring-glass/10"
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
                    <AssetThumb type="image" seed={image.seed} />
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
                data-ui="mat-upload-image"
                onClick={() => fileRef.current?.click()}
                className="relative flex min-h-[100px] w-full flex-col items-center justify-center gap-1.5 overflow-hidden rounded-xl border border-dashed border-glass/25 bg-glass/5 text-content-subtle transition-colors hover:border-glass/40 hover:bg-glass/8 hover:text-content"
              >
                <PlaceholderImage className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-20" />
                <Icon name="create" size={20} className="relative" />
                <span className="type-body relative">Upload image</span>
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
              <PanelTitle>Source image</PanelTitle>
            </DialogTitle>
            <PanelClose label="Close preview" onClick={onClose} />
          </PanelHeader>

          <PanelBody className="p-4">
            <div className="aspect-[4/3] w-full overflow-hidden rounded-xl ring-1 ring-glass/10">
              <AssetThumb type="image" seed={image.seed} />
            </div>
          </PanelBody>

          <PanelFooter className="items-center justify-between p-3">
            {/* The filename is the only thing MAT knows about the image, and the
                thumbnail is generated from a seed rather than being the file —
                so without it the dialog can't say WHICH image this is. */}
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
