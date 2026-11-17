import { PRDS, PRD_UPDATED } from "./prd-data";
import { StatusChip } from "./PrdPage";

/**
 * THE FRONT PAGE.
 *
 * What Terra opens on when the server starts: three PRDs to choose from. The
 * product itself (Home, projects, the editor) is one click away at `#home`, so
 * putting this first costs the app nothing but a click.
 */
/** Where each card goes: the UI that PRD describes. */
const APP: Record<(typeof PRDS)[number]["id"], { href: string; label: string }> = {
  platform: { href: "#home", label: "Open Terra" },
  web: { href: "#editor", label: "Open the editor" },
  "phase-2": { href: "/prototypes/vfx/", label: "Open the VFX prototype" },
};

export function PrdHub() {
  return (
    <main className="min-h-screen bg-canvas text-content">
      <div className="mx-auto flex max-w-[1040px] flex-col gap-12 px-6 pb-24 pt-14">
        <header className="flex flex-col gap-4">
          <div className="type-eyebrow text-brand">Product requirements</div>
          <h1 className="type-display text-[clamp(2.25rem,6vw,3.5rem)] leading-[1.05]">Terra PRD</h1>
          <p className="type-body-lg max-w-[62ch] text-content-muted">
            Terra turns a 3D scene into labelled synthetic datasets. Choose one of the three PRDs: the
            account platform, the web editor, or Phase 2.
          </p>
          <div className="type-body flex flex-wrap items-center gap-x-4 gap-y-1 text-content-subtle">
            <span>Updated {PRD_UPDATED}</span>
            <span aria-hidden>·</span>
            <span>Draft</span>
          </div>
        </header>

        <nav aria-label="Terra PRDs" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {PRDS.map((p) => {
            const app = APP[p.id];
            return (
              /* THE CARD OPENS THE UI IT DESCRIBES. The whole card is one link
                 (the title's link, stretched over it), so a click anywhere
                 lands in the product; the PRD itself is the smaller link in
                 the corner, raised above the stretched one. */
              <div
                key={p.id}
                data-ui={`prd-card-${p.id}`}
                className="group relative flex min-w-0 flex-col gap-3 rounded-2xl border border-glass/15 bg-surface p-6 transition-[border-color,transform] focus-within:border-brand/60 hover:-translate-y-0.5 hover:border-brand/60 motion-reduce:transition-none motion-reduce:hover:translate-y-0"
              >
                <div className="type-eyebrow text-brand">{p.area}</div>
                <h2 className="type-title">
                  <a
                    href={app.href}
                    data-ui={`prd-card-${p.id}-open`}
                    className="outline-none after:absolute after:inset-0 after:rounded-2xl after:content-['']"
                  >
                    {p.name}
                  </a>
                </h2>
                <p className="type-body flex-1 text-content-muted">{p.summary}</p>
                <div className="flex items-center justify-between gap-3 pt-1">
                  <StatusChip prd={p} />
                  <span aria-hidden className="type-label-strong text-brand">
                    {app.label} →
                  </span>
                </div>
                <a
                  href={`#prd/${p.id}`}
                  data-ui={`prd-card-${p.id}-doc`}
                  className="type-label-strong relative z-10 self-start text-content-muted underline-offset-4 hover:text-content hover:underline"
                >
                  Read the PRD
                </a>
              </div>
            );
          })}
        </nav>

        <footer className="flex flex-wrap gap-x-8 gap-y-2 border-t border-glass/15 pt-6">
          <a href="#home" className="type-label-strong text-content-muted hover:text-content">
            Open the Terra app →
          </a>
          <a href="/prototypes/vfx/" className="type-label-strong text-content-muted hover:text-content">
            Open the VFX prototype →
          </a>
        </footer>
      </div>
    </main>
  );
}
