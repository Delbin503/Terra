import { useState } from "react";
import { GlassPanel } from "@/components/glass";
import { Button } from "@/components/ui";
import { Icon } from "@/components/icons";

/**
 * MeshUploadPopover — the 3D Meshes pipeline.
 *  mode="upload"   : drop zone → (upload) preview → "Generate Multi-view Image"
 *  mode="multiview": 3 generated views → "Generate Model"
 * Floats above the asset panel (fixed) so it isn't clipped.
 */
export function MeshUploadPopover({
  mode,
  onClose,
  onGenerateMultiview,
  onGenerateModel,
}: {
  mode: "upload" | "multiview";
  onClose: () => void;
  onGenerateMultiview: () => void;
  onGenerateModel: () => void;
}) {
  const [uploaded, setUploaded] = useState(false);

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <GlassPanel
        ui="mesh-upload-popover"
        thickness="thick"
        className="fixed bottom-[calc(40vh+2.5rem)] left-1/2 z-50 w-[340px] max-w-[92vw] -translate-x-1/2 !rounded-3xl p-4"
      >
        <div className="mb-3 flex items-center justify-between">
          <span className="text-md font-semibold text-content">
            {mode === "multiview" ? "Multi-view result" : "Upload to generate a mesh"}
          </span>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="grid h-7 w-7 place-items-center rounded-full text-content-muted hover:bg-glass/15 hover:text-content"
          >
            <Icon name="close" size={15} />
          </button>
        </div>

        {mode === "upload" ? (
          uploaded ? (
            <>
              <div className="relative aspect-square overflow-hidden rounded-2xl bg-glass/8">
                <div className="grid h-full w-full place-items-center">
                  <span className="h-3/5 w-3/5 rounded-xl bg-gradient-to-br from-accent/70 to-brand/60 shadow-lg" />
                </div>
                <button
                  type="button"
                  aria-label="Remove upload"
                  onClick={() => setUploaded(false)}
                  className="absolute right-2 top-2 grid h-8 w-8 place-items-center rounded-lg border border-danger/50 bg-danger/15 text-danger hover:bg-danger/25"
                >
                  <Icon name="trash" size={15} />
                </button>
              </div>
              <Button variant="brand" onClick={onGenerateMultiview} className="mt-3 w-full !rounded-xl">
                <Icon name="generate" size={16} />
                Generate Multi-view Image
              </Button>
            </>
          ) : (
            <button
              type="button"
              data-ui="mesh-dropzone"
              onClick={() => setUploaded(true)}
              className="flex min-h-[200px] w-full flex-col items-center justify-center gap-2.5 rounded-2xl border border-dashed border-glass/25 bg-glass/5 p-4 text-center text-content-subtle transition-colors hover:border-glass/40 hover:bg-glass/8"
            >
              <span className="grid h-10 w-10 place-items-center rounded-full border border-glass/25">
                <Icon name="create" size={20} />
              </span>
              <span className="text-sm text-content-muted">Upload your asset</span>
              <span className="text-2xs">JPG, PNG, WEBP · size &lt; 20 MB</span>
            </button>
          )
        ) : (
          <>
            <div className="grid grid-cols-3 gap-2">
              {[0, 1, 2].map((i) => (
                <div key={i} className="aspect-square overflow-hidden rounded-xl bg-glass/8">
                  <div className="grid h-full w-full place-items-center">
                    <span className="h-3/5 w-3/5 rounded-lg bg-gradient-to-br from-accent/70 to-brand/60" />
                  </div>
                </div>
              ))}
            </div>
            <Button variant="brand" onClick={onGenerateModel} className="mt-3 w-full !rounded-xl">
              <Icon name="scene" size={16} />
              Generate Model
            </Button>
          </>
        )}
      </GlassPanel>
    </>
  );
}
