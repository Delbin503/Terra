/**
 * GLASS TOKEN PREVIEW — Terra Web editor
 * ------------------------------------------------------------------
 * A living swatch board for the visionOS glass material. It ONLY consumes
 * the --glass-* tokens (tokens.css) via the .glass* classes (globals.css) —
 * no hardcoded colors. Floats over a mock 3D backdrop so the material has
 * something to refract, exactly as it will over the Three.js canvas.
 *
 * View at: <app>/#glass
 * Every surface carries data-ui="glass-*" for Figma↔code↔runtime tracking.
 */
import { Icon, type IconName } from "@/components/icons";

/** Stand-in for the rendered WebGL scene — colorful blurred blobs. */
function MockScene() {
  return (
    <div data-ui="glass-scene-backdrop" className="absolute inset-0 -z-10 overflow-hidden bg-canvas">
      <div className="absolute left-[8%] top-[14%] h-72 w-72 rounded-full bg-brand/70 blur-3xl" />
      <div className="absolute right-[12%] top-[8%] h-80 w-80 rounded-full bg-accent/60 blur-3xl" />
      <div className="absolute bottom-[6%] left-[38%] h-72 w-72 rounded-full bg-success/50 blur-3xl" />
      <div className="absolute bottom-[18%] right-[24%] h-56 w-56 rounded-full bg-warning/50 blur-3xl" />
    </div>
  );
}

function Swatch({ name, cls, label, note }: { name: string; cls: string; label: string; note: string }) {
  return (
    <div
      data-ui={`glass-swatch-${name}`}
      className={`${cls} flex h-40 flex-col justify-end p-4`}
    >
      <span className="text-sm font-medium text-content">{label}</span>
      <span className="text-2xs text-content-muted">{note}</span>
    </div>
  );
}

const barIcons: IconName[] = ["input-3d", "input-2d", "brush", "camera", "spline", "tune"];

export function GlassPreview() {
  return (
    <div className="relative min-h-screen w-full">
      <MockScene />

      <div className="mx-auto max-w-5xl px-6 py-16">
        <header data-ui="glass-preview-header" className="mb-10">
          <h1 className="font-display text-3xl text-content">Glass tokens</h1>
          <p className="mt-1 text-md text-content-muted">
            visionOS overlay material · consumes <code className="font-mono text-sm">--glass-*</code> only
          </p>
        </header>

        {/* Thickness ladder */}
        <section data-ui="glass-section-thickness" className="mb-12">
          <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-content-subtle">Thickness</h2>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Swatch name="thin" cls="glass glass-thin" label="Thin" note="hints · passive chrome" />
            <Swatch name="regular" cls="glass" label="Regular" note="panels · inspectors" />
            <Swatch name="thick" cls="glass glass-thick" label="Thick" note="modals · ornaments" />
            <Swatch name="chrome" cls="glass glass-chrome" label="Chrome" note="pills · buttons" />
          </div>
        </section>

        {/* Selection — frost, not color */}
        <section data-ui="glass-section-selection" className="mb-12">
          <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-content-subtle">
            Selection — frost, not color
          </h2>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <div data-ui="glass-tile-idle" className="glass glass-interactive flex h-32 items-center justify-center">
              <span className="text-sm text-content-muted">Idle · hover me</span>
            </div>
            <div data-ui="glass-tile-selected" className="glass glass-selected flex h-32 items-center justify-center">
              <span className="text-sm font-medium text-content">Selected</span>
            </div>
            <div data-ui="glass-tile-idle-2" className="glass glass-interactive flex h-32 items-center justify-center">
              <span className="text-sm text-content-muted">Idle</span>
            </div>
          </div>
        </section>

        {/* Circular controls */}
        <section data-ui="glass-section-controls" className="mb-24">
          <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-content-subtle">Circular controls</h2>
          <div className="flex flex-wrap gap-3">
            {barIcons.map((n) => (
              <button
                key={n}
                data-ui={`glass-btn-${n}`}
                aria-label={n}
                className="glass glass-chrome glass-interactive grid h-12 w-12 place-items-center !rounded-full text-content"
              >
                <Icon name={n} size={20} />
              </button>
            ))}
          </div>
        </section>
      </div>

      {/* Floating bottom toolbar — the editor's primary ornament */}
      <div
        data-ui="glass-bar"
        className="glass glass-chrome glass-interactive fixed bottom-6 left-1/2 flex -translate-x-1/2 items-center gap-1 !rounded-full px-2 py-2"
      >
        {barIcons.map((n) => (
          <button
            key={n}
            data-ui={`glass-bar-btn-${n}`}
            aria-label={n}
            className="grid h-11 w-11 place-items-center rounded-full text-content transition-colors hover:bg-glass/15"
          >
            <Icon name={n} size={20} />
          </button>
        ))}
      </div>
    </div>
  );
}
