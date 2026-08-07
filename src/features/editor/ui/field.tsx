import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
import { Icon, type IconName } from "@/components/icons";

/**
 * FIELD — text, numeric and select inputs for the editor panels.
 * ------------------------------------------------------------------
 * The editor had fourteen raw form controls across six files, each styled
 * independently — the same well, border and focus ring retyped every time, at
 * two sizes that had drifted apart. This is the primitive they were all
 * approximating.
 *
 * LAYER NAMES. `<Field label="Asset Name">` derives every layer from the label:
 *
 *   field-asset-name           ← label wrapper
 *     field-asset-name-label   ← the caption + required mark
 *     field-asset-name-input   ← the control itself
 *
 * Pass `ui` to override the derived name when the label isn't a stable id.
 *
 * The well and its border are the `.field-well` class (globals.css), so the
 * recess depth is one token rather than a `bg-black/20` retyped per call site.
 */

const slug = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

const FieldCtx = React.createContext<string | null>(null);

/* ---------------------------------------------------------------- control */

const controlVariants = cva(
  "field-well w-full border text-content outline-none transition-colors placeholder:text-content-subtle focus:border-brand/60 disabled:opacity-50",
  {
    variants: {
      size: {
        sm: "type-body-dense rounded-lg px-2.5 py-2",
        md: "type-body rounded-xl px-3.5 py-3",
      },
    },
    defaultVariants: { size: "sm" },
  }
);

type ControlSize = VariantProps<typeof controlVariants>;

/** Resolve the layer name: explicit `ui` wins, else the enclosing Field's. */
function useControlName(ui?: string) {
  const fromField = React.useContext(FieldCtx);
  return ui ? `field-${slug(ui)}-input` : fromField ? `${fromField}-input` : undefined;
}

export interface TextInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "size">,
    ControlSize {
  ui?: string;
}

export const TextInput = React.forwardRef<HTMLInputElement, TextInputProps>(
  ({ className, size, ui, ...props }, ref) => (
    <input
      ref={ref}
      data-ui={useControlName(ui)}
      className={cn(controlVariants({ size }), className)}
      {...props}
    />
  )
);
TextInput.displayName = "TextInput";

export interface TextAreaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement>,
    ControlSize {
  ui?: string;
}

export const TextArea = React.forwardRef<HTMLTextAreaElement, TextAreaProps>(
  ({ className, size, ui, ...props }, ref) => (
    <textarea
      ref={ref}
      data-ui={useControlName(ui)}
      className={cn(controlVariants({ size }), "resize-y leading-relaxed", className)}
      {...props}
    />
  )
);
TextArea.displayName = "TextArea";

export interface SelectProps
  extends React.SelectHTMLAttributes<HTMLSelectElement>,
    ControlSize {
  ui?: string;
}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, size, ui, ...props }, ref) => (
    <select
      ref={ref}
      data-ui={useControlName(ui)}
      className={cn(controlVariants({ size }), className)}
      {...props}
    />
  )
);
Select.displayName = "Select";

/* ------------------------------------------------------------------ label */

/**
 * Label wrapper. Renders a `<label>`, so clicking the caption focuses the
 * control — which the hand-rolled versions only did by accident when they
 * happened to use a label element.
 */
export function Field({
  label,
  required,
  hint,
  ui,
  className,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  /** override the name derived from `label` */
  ui?: string;
  className?: string;
  children: React.ReactNode;
}) {
  const name = `field-${slug(ui ?? label)}`;
  return (
    <FieldCtx.Provider value={name}>
      <label data-ui={name} className={cn("block", className)}>
        <span data-ui={`${name}-label`} className="type-eyebrow mb-1 block text-content-muted">
          {label}
          {required && <span className="text-brand"> *</span>}
        </span>
        {children}
        {hint && (
          <span data-ui={`${name}-hint`} className="type-caption mt-1 block text-content-subtle">
            {hint}
          </span>
        )}
      </label>
    </FieldCtx.Provider>
  );
}

/* ---------------------------------------------------------------- numeric */

/**
 * Compact numeric cell for the transform rows. Bare by default — the axis rows
 * put it inside their own bordered container — with `bordered` for standalone
 * use. Tabular figures via `type-numeric`, so a dragged value doesn't reflow.
 */
export const NumberInput = React.forwardRef<
  HTMLInputElement,
  Omit<React.InputHTMLAttributes<HTMLInputElement>, "size"> & {
    ui?: string;
    bordered?: boolean;
  }
>(({ className, ui, bordered, ...props }, ref) => (
  <input
    ref={ref}
    type="text"
    inputMode="decimal"
    data-ui={useControlName(ui)}
    className={cn(
      "type-numeric text-content outline-none",
      bordered
        ? "field-well w-12 shrink-0 rounded-md border px-1.5 py-0.5 text-center"
        : "w-full min-w-0 bg-transparent",
      className
    )}
    {...props}
  />
));
NumberInput.displayName = "NumberInput";

/* ----------------------------------------------------------------- search */

/** Search box — an icon, a bare input, and a clear affordance in one well. */
export function SearchInput({
  value,
  onValueChange,
  placeholder = "Search",
  ui = "search",
  className,
}: {
  value: string;
  onValueChange: (v: string) => void;
  placeholder?: string;
  ui?: string;
  className?: string;
}) {
  const name = `field-${slug(ui)}`;
  return (
    <div
      data-ui={name}
      className={cn(
        "field-well flex min-w-0 items-center gap-2 rounded-lg border px-2.5 py-1.5",
        className
      )}
    >
      <Icon name="search" size={14} className="shrink-0 text-content-subtle" />
      <input
        data-ui={`${name}-input`}
        value={value}
        onChange={(e) => onValueChange(e.target.value)}
        placeholder={placeholder}
        className="type-body min-w-0 flex-1 bg-transparent text-content outline-none placeholder:text-content-subtle"
      />
      {value && (
        <button
          type="button"
          aria-label="Clear search"
          data-ui={`${name}-clear`}
          onClick={() => onValueChange("")}
          className="grid h-5 w-5 shrink-0 place-items-center rounded-full text-content-muted transition-colors hover:bg-glass/15 hover:text-content"
        >
          <Icon name="close" size={13} />
        </button>
      )}
    </div>
  );
}

export type { IconName };
