import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
import { Icon, type IconName } from "@/components/icons";

/**
 * PILL — the editor's small labelled chip: tags, status marks, filter toggles.
 * ------------------------------------------------------------------
 * Six near-identical chips were hand-rolled across the editor (the Master
 * Object mark, the Beta tag, smart-tag chips, AI suggestions, the Uniform
 * toggle, the count badge), each picking its own radius, padding, border alpha
 * and text style. `Badge` in components/ui/ covers the solid-surface case; this
 * is its glass-panel counterpart, where chips are outlined and tinted rather
 * than filled.
 *
 * LAYER NAMES. `<Pill ui="master">` emits:
 *
 *   pill-master
 *     pill-master-icon
 *     pill-master-label
 *
 * Tone drives border, fill and text together — they're one decision, and
 * splitting them is how the hand-rolled versions drifted.
 */

const slug = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

const pillVariants = cva("inline-flex shrink-0 items-center border transition-colors", {
  variants: {
    tone: {
      neutral: "border-glass/12 bg-glass/6 text-content",
      muted: "border-glass/12 bg-glass/6 text-content-muted",
      brand: "border-brand/55 bg-brand/12 text-brand",
      // The three object roles. Master had a tone before the other two existed;
      // they are siblings, so they are toned the same way rather than being
      // hand-rolled at each call site.
      master: "border-master/55 bg-master/15 text-master",
      distractor: "border-distractor/55 bg-distractor/15 text-distractor",
      backdrop: "border-backdrop/55 bg-backdrop/15 text-backdrop",
      danger: "border-danger/55 bg-danger/12 text-danger",
      success: "border-success/55 bg-success/12 text-success",
      /** no fill — for a tag that must not compete with the content behind it */
      outline: "border-brand/35 bg-transparent text-brand",
    },
    size: {
      sm: "type-caption-strong gap-1 px-2 py-0.5",
      md: "type-body-dense gap-1.5 px-2.5 py-1.5",
    },
    shape: {
      round: "rounded-md",
      pill: "rounded-full",
    },
    interactive: {
      true: "cursor-pointer hover:bg-glass/12 hover:text-content",
      false: "",
    },
  },
  compoundVariants: [
    // A round chip at md reads too boxy against the panel's own radius.
    { size: "md", shape: "round", class: "rounded-lg" },
  ],
  defaultVariants: { tone: "neutral", size: "sm", shape: "round", interactive: false },
});

export interface PillProps
  extends Omit<React.HTMLAttributes<HTMLSpanElement>, "children">,
    VariantProps<typeof pillVariants> {
  /** layer name; derived from the label when omitted */
  ui?: string;
  icon?: IconName;
  iconSize?: number;
  children: React.ReactNode;
}

export function Pill({
  ui,
  icon,
  iconSize,
  tone,
  size,
  shape,
  interactive,
  className,
  children,
  ...props
}: PillProps) {
  const name = `pill-${slug(ui ?? (typeof children === "string" ? children : "chip"))}`;
  return (
    <span
      data-ui={name}
      className={cn(pillVariants({ tone, size, shape, interactive }), className)}
      {...props}
    >
      {icon && (
        <Icon
          name={icon}
          size={iconSize ?? (size === "md" ? 13 : 11)}
          data-ui={`${name}-icon`}
        />
      )}
      <span data-ui={`${name}-label`} className="truncate">
        {children}
      </span>
    </span>
  );
}

/**
 * The button form — a filter chip or toggle. Same skin, but focusable and
 * announcing its pressed state, which the hand-rolled `<button>` chips didn't.
 */
export interface PillButtonProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "children">,
    VariantProps<typeof pillVariants> {
  ui?: string;
  icon?: IconName;
  iconSize?: number;
  /** drives `aria-pressed` and the active tone */
  active?: boolean;
  children: React.ReactNode;
}

export function PillButton({
  ui,
  icon,
  iconSize,
  tone,
  size,
  shape = "pill",
  active,
  className,
  children,
  ...props
}: PillButtonProps) {
  const name = `pill-${slug(ui ?? (typeof children === "string" ? children : "chip"))}`;
  return (
    <button
      type="button"
      aria-pressed={active ?? undefined}
      data-ui={name}
      className={cn(
        pillVariants({ tone: active ? "brand" : tone ?? "muted", size, shape, interactive: !active }),
        "outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas",
        className
      )}
      {...props}
    >
      {icon && (
        <Icon
          name={icon}
          size={iconSize ?? (size === "md" ? 13 : 11)}
          data-ui={`${name}-icon`}
        />
      )}
      <span data-ui={`${name}-label`} className="truncate">
        {children}
      </span>
    </button>
  );
}
