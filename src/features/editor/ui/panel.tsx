import * as React from "react";
import { cn } from "@/lib/utils";
import { GlassPanel, type GlassThickness } from "@/components/glass";
import { Icon } from "@/components/icons";

/**
 * PANEL — the editor's floating glass panel, split into named layers.
 * ------------------------------------------------------------------
 * Every panel in the editor was hand-assembling the same three parts: a glass
 * surface, a header row with a title and a close affordance, and a scrolling
 * body. The paddings and border alphas drifted between them (p-5 vs px-3.5 py-3,
 * glass/10 vs glass/6), so the panels read as siblings rather than the same
 * component.
 *
 * LAYER NAMES. Each part emits `data-ui="<panel>-<layer>"`, derived from the
 * Panel's `ui` prop through context — the same identifier is then traceable
 * across Figma layer ↔ code ↔ runtime, matching the `data-ui` convention the
 * glass ornaments already use. A panel named `object-info` produces:
 *
 *   glass-object-info          ← surface (emitted by GlassPanel)
 *     object-info-header       ← header row
 *       object-info-title
 *       object-info-subtitle
 *       object-info-close
 *     object-info-body         ← scrolling content
 *       object-info-section-*  ← one per titled section
 *       object-info-row-*      ← one per detail row
 *     object-info-footer       ← pinned actions
 *
 * Type and colour come from the design system only — `type-*` styles and role
 * tokens. No panel part sets a raw size, weight or colour.
 */

const PanelCtx = React.createContext<string>("panel");
const useLayer = (layer: string) => `${React.useContext(PanelCtx)}-${layer}`;

/** `Master Object` → `master-object`, for use inside a layer name. */
const slug = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

export interface PanelProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Instance name — every child layer is prefixed with it. */
  ui: string;
  thickness?: GlassThickness;
}

export function Panel({ ui, thickness = "thick", className, ...props }: PanelProps) {
  return (
    <PanelCtx.Provider value={ui}>
      <GlassPanel
        ui={ui}
        thickness={thickness}
        className={cn("pointer-events-auto flex flex-col !rounded-3xl", className)}
        {...props}
      />
    </PanelCtx.Provider>
  );
}

/** Header row. `align="start"` when the header carries a subtitle. */
export function PanelHeader({
  className,
  align = "center",
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { align?: "center" | "start" }) {
  return (
    <div
      data-ui={useLayer("header")}
      className={cn(
        "flex shrink-0 justify-between gap-3 border-b border-glass/10 px-4 py-3",
        align === "start" ? "items-start" : "items-center",
        className
      )}
      {...props}
    />
  );
}

export function PanelTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h2
      data-ui={useLayer("title")}
      className={cn("type-panel-title truncate text-content", className)}
      {...props}
    />
  );
}

export function PanelSubtitle({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p
      data-ui={useLayer("subtitle")}
      className={cn("type-body-dense mt-1 text-content-subtle", className)}
      {...props}
    />
  );
}

/** Eyebrow used instead of a title on the compact property panels. */
export function PanelEyebrow({ className, ...props }: React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      data-ui={useLayer("eyebrow")}
      className={cn("type-eyebrow text-content-subtle", className)}
      {...props}
    />
  );
}

export function PanelClose({
  label = "Close",
  size = "md",
  className,
  ...props
}: Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "children"> & {
  label?: string;
  size?: "sm" | "md";
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      data-ui={useLayer("close")}
      className={cn(
        "grid shrink-0 place-items-center rounded-lg text-content-muted transition-colors hover:bg-glass/15 hover:text-content",
        size === "sm" ? "h-6 w-6" : "h-8 w-8",
        className
      )}
      {...props}
    >
      <Icon name="close" size={size === "sm" ? 13 : 16} />
    </button>
  );
}

/** Scrolling content region. `min-h-0` is what actually lets it scroll inside
 *  a flex column — without it the body grows and the panel overflows instead. */
export function PanelBody({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      data-ui={useLayer("body")}
      className={cn("min-h-0 flex-1 overflow-y-auto p-4", className)}
      {...props}
    />
  );
}

export function PanelFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      data-ui={useLayer("footer")}
      className={cn("flex shrink-0 gap-2.5 border-t border-glass/10 p-3", className)}
      {...props}
    />
  );
}

/** A titled block inside the body. The title is an eyebrow, always. */
export function PanelSection({
  title,
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { title: string }) {
  const base = React.useContext(PanelCtx);
  return (
    <div data-ui={`${base}-section-${slug(title)}`} className={cn("mb-4", className)} {...props}>
      <h3 data-ui={`${base}-section-${slug(title)}-title`} className="type-eyebrow mb-1.5 text-content-muted">
        {title}
      </h3>
      {children}
    </div>
  );
}

/**
 * A key/value detail row. `numeric` uses tabular figures for values that change
 * under a drag (position, scale) so the row doesn't reflow digit by digit.
 */
export function PanelRow({
  label,
  value,
  numeric,
  className,
}: {
  label: string;
  value: React.ReactNode;
  numeric?: boolean;
  className?: string;
}) {
  const base = React.useContext(PanelCtx);
  const name = `${base}-row-${slug(label)}`;
  return (
    <div
      data-ui={name}
      className={cn(
        "flex items-center justify-between border-b border-glass/6 py-2 last:border-0",
        className
      )}
    >
      <dt data-ui={`${name}-label`} className="type-body text-content-subtle">
        {label}
      </dt>
      <dd
        data-ui={`${name}-value`}
        className={numeric ? "type-numeric-sm text-content-subtle" : "type-body-strong text-content"}
      >
        {value}
      </dd>
    </div>
  );
}

/** Full-width action row inside a body — Edit Asset, Delete. */
export function PanelAction({
  icon,
  tone = "default",
  className,
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  icon: React.ComponentProps<typeof Icon>["name"];
  tone?: "default" | "danger";
}) {
  const base = React.useContext(PanelCtx);
  const name = typeof children === "string" ? slug(children) : "action";
  return (
    <button
      type="button"
      data-ui={`${base}-action-${name}`}
      className={cn(
        "type-body-strong flex items-center gap-2.5 border-b border-glass/8 py-2.5 transition-colors last:border-0",
        tone === "danger"
          ? "text-danger hover:brightness-110"
          : "text-content hover:text-brand",
        className
      )}
      {...props}
    >
      <Icon name={icon} size={15} />
      {children}
    </button>
  );
}
