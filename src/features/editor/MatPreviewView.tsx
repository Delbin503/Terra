import { GlassBar, GlassDivider } from "@/components/glass";
import { Button } from "@/components/ui";
import { Icon } from "@/components/icons";
import { AssetThumb } from "./AssetThumb";
import { emojiForProject } from "./ProjectEmojiPicker";
import type { MatPreview } from "./MatPreviewPanel";

/**
 * MatPreviewView — the preview "tab".
 *
 * A full takeover rather than another floating panel: this view exists to be
 * looked at, and a MAT preview judged over a live 3D scene isn't being judged
 * at all — the scene behind translucent chrome is exactly the thing that would
 * bias the read. So the viewport, the rail, the cube and the action cluster all
 * go, and what's left is the image and the way back.
 *
 * The project bar stays because leaving it out would make this feel like a
 * different app rather than a different view of the same project. Its mark is
 * static here: swapping the project emoji is an editor action, and this view
 * deliberately offers nothing but Back.
 */
export function MatPreviewView({
  preview,
  projectName,
  onBack,
}: {
  preview: MatPreview;
  projectName: string;
  onBack: () => void;
}) {
  return (
    /* Rendered OVER the editor rather than instead of it. Unmounting the editor
       would tear down the WebGL context and reload the HDRI on the way back —
       a ~20s cold start — and lose the camera where the user left it. */
    <div data-ui="mat-preview-view" className="fixed inset-0 z-50 overflow-hidden bg-canvas">
      {/* Same themed backdrop as the editor — the two views are one project. */}
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(120% 90% at 50% 0%, hsl(var(--brand) / 0.08), transparent 45%), radial-gradient(90% 80% at 85% 15%, hsl(var(--accent) / 0.07), transparent 50%)",
        }}
      />

      <div className="absolute left-4 top-4 z-20">
        <GlassBar ui="mat-preview-topbar" shape="panel" className="h-12 gap-3 pl-2.5 pr-2">
          <span
            data-ui="mat-preview-brand-mark"
            aria-hidden
            className="grid h-9 w-9 place-items-center rounded-lg border-2 border-brand type-glyph"
          >
            {emojiForProject(projectName)}
          </span>
          <span className="type-body-lg-strong text-content">{projectName}</span>

          <GlassDivider className="mx-1" />

          <Button
            variant="secondary"
            size="sm"
            data-ui="mat-preview-back"
            onClick={onBack}
            className="!rounded-full"
          >
            <Icon name="back" size={15} />
            Back to Editor
          </Button>
        </GlassBar>
      </div>

      {/* The preview itself. Sized to the viewport rather than to a fixed box so
          it uses whatever room the window has, and capped by aspect ratio so a
          very wide window doesn't stretch it. */}
      <div className="absolute inset-0 grid place-items-center p-6 pt-24">
        <figure
          data-ui="mat-preview-image"
          className="flex max-h-full min-h-0 flex-col items-center gap-3"
        >
          <div className="min-h-0 overflow-hidden rounded-2xl bg-glass/8 ring-1 ring-glass/15 shadow-pop">
            <div className="aspect-[4/3] h-full max-h-[70vh] w-[min(72rem,86vw)]">
              <AssetThumb type="image" seed={preview.seed} />
            </div>
          </div>
          <figcaption className="type-caption text-content-muted">
            {preview.sourceName}
            {preview.postProcessed && " · Post-processed"}
          </figcaption>
        </figure>
      </div>
    </div>
  );
}
