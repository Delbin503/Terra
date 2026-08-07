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
      <span className="type-body-strong text-content">{label}</span>
      <span className="type-caption text-content-muted">{note}</span>
    </div>
  );
}

const barIcons: IconName[] = ["input-3d", "input-2d", "brush", "camera", "spline", "tune"];

/** Every chrome style, grouped by role — see globals.css for the definitions. */
const chromeGroups: [string, [string, string][]][] = [
  ["Headings", [
    ["type-display", "hero · greeting"],
    ["type-title", "page + asset titles"],
    ["type-heading", "section headings · dialog titles"],
    ["type-subheading", "panel titles"],
    ["type-panel-title", "panel header bar · chat author"],
    ["type-card-title", "asset card overlay label"],
  ]],
  ["Body", [
    ["type-nav", "sidebar + category rows"],
    ["type-body-lg", "prominent body"],
    ["type-body-lg-strong", "menu rows"],
    ["type-body", "default body"],
    ["type-body-strong", "list rows · inline emphasis"],
    ["type-body-dense", "copy inside glass panels"],
  ]],
  ["Labels", [
    ["type-label", "control labels · tooltips"],
    ["type-label-strong", "field labels · status pills"],
    ["type-eyebrow", "section eyebrows"],
    ["type-caption", "meta · hints · timestamps"],
    ["type-caption-strong", "emphasised meta"],
  ]],
  ["Controls", [
    ["type-button-xs", "compact buttons"],
    ["type-button-sm", "Button size=sm"],
    ["type-button", "Button size=md"],
    ["type-button-lg", "Button size=lg"],
    ["type-badge-sm", "Badge size=sm"],
    ["type-badge", "Badge size=md"],
  ]],
  ["Numeric + mono", [
    ["type-numeric", "transform fields"],
    ["type-numeric-sm", "detail readouts"],
    ["type-code", "token names · paths"],
    ["type-code-sm", "inline codes · hex"],
  ]],
];

/**
 * The scene ramp — every piece of the tilted object label, each shown with the
 * class that owns it. Samples are upright here; ObjectTitle applies the tilt.
 */
const sceneStyles: [string, string, JSX.Element][] = [
  ["type-scene-title", "the object name — click to rename",
    <h3 className="type-scene-title text-content">Desert Dunes</h3>],
  ["type-scene-nav", "the Back affordance above the title",
    <span className="type-scene-nav inline-flex items-center gap-1.5 text-content-muted">
      <Icon name="back" size={17} strokeWidth={1.6} />
      Back
    </span>],
  ["type-scene-mark", "the ⓘ mark perched on the title's last letter",
    <span className="inline-flex text-content">
      <Icon name="info" className="type-scene-mark" strokeWidth={1.5} />
    </span>],
  ["type-scene-badge", "Image · Master Object · Delete pills",
    <span className="type-scene-plane inline-flex items-center gap-2">
      <span className="type-scene-badge inline-flex items-center gap-1.5 rounded-lg border border-brand/60 bg-brand/10 px-2.5 py-1 text-brand">
        <Icon name="input-3d" size={13} />
        Image
      </span>
      <span className="type-scene-badge inline-flex items-center gap-1.5 rounded-lg border border-danger/60 bg-danger/10 px-2.5 py-1 text-danger">
        <Icon name="trash" size={14} />
        Delete
      </span>
    </span>],
  ["type-scene-body", "the object's description paragraph",
    <p className="type-scene-body type-scene-plane-top max-w-[26rem] text-content-muted">
      Image asset placed in the scene. Customize its transform and material to
      suit your world.
    </p>],
  ["type-scene-readout", "the gizmo's live transform value",
    <span className="type-scene-readout inline-block rounded-md border border-glass/16 bg-black/70 px-2 py-1 text-white">
      X 0.00 Y 0.00 Z 0.00
    </span>],
];

export function GlassPreview() {
  return (
    <div className="relative min-h-screen w-full">
      <MockScene />

      <div className="mx-auto max-w-5xl px-6 py-16">
        <header data-ui="glass-preview-header" className="mb-10">
          <h1 className="type-display text-content">Glass tokens</h1>
          <p className="type-body-lg mt-1 text-content-muted">
            visionOS overlay material · consumes <code className="type-code">--glass-*</code> only
          </p>
        </header>

        {/* Thickness ladder */}
        <section data-ui="glass-section-thickness" className="mb-12">
          <h2 className="type-eyebrow mb-3 text-content-subtle">Thickness</h2>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Swatch name="thin" cls="glass glass-thin" label="Thin" note="hints · passive chrome" />
            <Swatch name="regular" cls="glass" label="Regular" note="panels · inspectors" />
            <Swatch name="thick" cls="glass glass-thick" label="Thick" note="modals · ornaments" />
            <Swatch name="chrome" cls="glass glass-chrome" label="Chrome" note="pills · buttons" />
          </div>
        </section>

        {/* Selection — frost, not color */}
        <section data-ui="glass-section-selection" className="mb-12">
          <h2 className="type-eyebrow mb-3 text-content-subtle">
            Selection — frost, not color
          </h2>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <div data-ui="glass-tile-idle" className="glass glass-interactive flex h-32 items-center justify-center">
              <span className="type-body text-content-muted">Idle · hover me</span>
            </div>
            <div data-ui="glass-tile-selected" className="glass glass-selected flex h-32 items-center justify-center">
              <span className="type-body-strong text-content">Selected</span>
            </div>
            <div data-ui="glass-tile-idle-2" className="glass glass-interactive flex h-32 items-center justify-center">
              <span className="type-body text-content-muted">Idle</span>
            </div>
          </div>
        </section>

        {/* Text styles — the two typographic worlds, side by side */}
        <section data-ui="type-section-chrome" className="mb-12">
          <h2 className="type-eyebrow mb-3 text-content-subtle">Text styles — chrome</h2>
          <div className="glass flex flex-col gap-7 p-6">
            {chromeGroups.map(([group, rows]) => (
              <div key={group} className="flex flex-col gap-3">
                <span className="type-caption text-content-subtle">{group}</span>
                {rows.map(([cls, note]) => (
                  <div
                    key={cls}
                    data-ui={`type-specimen-${cls}`}
                    className="flex flex-wrap items-baseline gap-x-4 gap-y-1"
                  >
                    <span className={`${cls} min-w-[15rem] text-content`}>The quick brown fox</span>
                    <code className="type-code-sm min-w-[11rem] text-content-subtle">.{cls}</code>
                    <span className="type-caption text-content-subtle">{note}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </section>

        <section data-ui="type-section-scene" className="mb-12">
          <h2 className="type-eyebrow mb-3 text-content-subtle">Text styles — scene</h2>
          <p className="type-body mb-4 text-content-muted">
            Diegetic type for the object label. Light Inter, tall-condensed, on the
            tilted plane — colour and shadow stay props because they adapt to scene
            luminance. Shown here upright; the tilt is applied by{" "}
            <code className="type-code">ObjectTitle</code>.
          </p>
          <div className="glass flex flex-col gap-6 p-6">
            {sceneStyles.map(([cls, note, sample]) => (
              <div
                key={cls}
                data-ui={`type-specimen-${cls}`}
                className="flex flex-col gap-1 border-b border-glass/8 pb-5 last:border-0 last:pb-0"
              >
                <div className="flex items-baseline gap-3">
                  <code className="type-code-sm text-brand">.{cls}</code>
                  <span className="type-caption text-content-subtle">{note}</span>
                </div>
                <div className="overflow-hidden">{sample}</div>
              </div>
            ))}
          </div>
        </section>

        {/* Circular controls */}
        <section data-ui="glass-section-controls" className="mb-24">
          <h2 className="type-eyebrow mb-3 text-content-subtle">Circular controls</h2>
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
