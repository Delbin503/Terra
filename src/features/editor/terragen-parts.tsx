import { cn } from "@/lib/utils";
import { Icon, type IconName } from "@/components/icons";
import { Pill, SearchInput } from "./ui";
import { AssetThumb } from "./AssetThumb";
import type { Asset } from "./assets-data";

/**
 * TERRAGEN PARTS — the pieces every section of the dock is built from.
 *
 * They live apart from the sections themselves because three unrelated things
 * now share them: the camera settings, the role assignment panel and the four
 * axes. A block, a note and a chip that look the same in all three is what
 * keeps a 456px column reading as one panel rather than as three.
 */

/**
 * The on/off control, as a shape.
 *
 * Split out from `AxisSwitch` when the weather panel needed a fog toggle: same
 * control, but "Fog axis" is not what it switches, and an aria-label that lies
 * about what a switch does is worse than a duplicated twenty lines of styling.
 * The stopPropagation stays here rather than at the call site — every switch
 * this app draws sits on top of something clickable.
 */
export function Switch({
  label,
  on,
  onToggle,
  ui,
}: {
  /** read verbatim by screen readers — pass the full phrase */
  label: string;
  on: boolean;
  onToggle: () => void;
  ui: string;
}) {
  return (
    <span
      role="switch"
      tabIndex={0}
      aria-checked={on}
      aria-label={label}
      data-ui={ui}
      onClick={(e) => {
        // The row behind this opens the section; the switch must not.
        e.stopPropagation();
        onToggle();
      }}
      onKeyDown={(e) => {
        if (e.key === " " || e.key === "Enter") {
          e.preventDefault();
          e.stopPropagation();
          onToggle();
        }
      }}
      className={cn(
        "relative block h-5 w-9 shrink-0 cursor-pointer rounded-full border transition-colors",
        on ? "border-brand bg-brand/70" : "border-glass/15 bg-glass/10"
      )}
    >
      <span
        className={cn(
          "absolute top-0.5 h-3.5 w-3.5 rounded-full bg-white transition-transform",
          on ? "left-0.5 translate-x-4" : "left-0.5 translate-x-0"
        )}
      />
    </span>
  );
}

/** The axis on/off. Off is not "disabled" — it means the axis contributes the
 *  scene's current value, which the editor keeps showing either way. */
export function AxisSwitch(props: { label: string; on: boolean; onToggle: () => void; ui: string }) {
  return <Switch {...props} label={`${props.label} axis`} />;
}

/** What this section does, in one sentence, at the top of its body. */
export function Cost({ children }: { children: React.ReactNode }) {
  return <p className="type-caption mb-4 text-content-subtle">{children}</p>;
}

/**
 * A labelled slider on one line, with the same boxed readout the rest of Terra
 * Web's parameters use (FactorCard, the camera sliders): a `field-well` value
 * chip so a weather dial reads as the same kind of control as a material factor
 * or a shot count, not a bespoke one.
 *
 * `FactorCard` stacks its label ABOVE the track, which is right for three
 * material factors and too tall for a stack of weather dials in a 456px column;
 * this keeps the boxed value but puts label and track on one line.
 */
export function Dial({
  label,
  value,
  min = 0,
  max = 100,
  step = 1,
  suffix,
  disabled,
  onChange,
}: {
  label: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  /** unit shown after the number — "%" for an intensity, "°" for an angle */
  suffix?: string;
  disabled?: boolean;
  onChange: (v: number) => void;
}) {
  return (
    <div className={cn("flex items-center gap-2.5", disabled && "opacity-45")}>
      <span className="type-caption w-[104px] shrink-0 truncate text-content-muted" title={label}>
        {label}
      </span>
      <input
        type="range"
        aria-label={label}
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="h-1 grow cursor-pointer accent-brand disabled:cursor-not-allowed"
      />
      <span className="field-well type-numeric-sm w-12 shrink-0 rounded-md border px-1.5 py-0.5 text-center tabular-nums text-content">
        {Math.round(value)}
        {suffix}
      </span>
    </div>
  );
}

/** A block inside a section. */
export function Group({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-5 last:mb-0">
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <h3 className="type-eyebrow text-content-muted">{title}</h3>
        {hint && <span className="type-caption shrink-0 text-content-subtle">{hint}</span>}
      </div>
      {children}
    </section>
  );
}

export function Note({
  tone = "info",
  ui,
  className,
  children,
}: {
  tone?: "info" | "warn";
  /** layer name, for notes that a test or a screenshot needs to find */
  ui?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <p
      data-ui={ui}
      className={cn(
        "type-caption flex items-start gap-1.5 rounded-lg border px-2.5 py-2",
        tone === "warn"
          ? "border-warning/40 bg-warning-soft/40 text-warning"
          : "border-glass/10 bg-glass/6 text-content-subtle",
        className
      )}
    >
      <Icon name={tone === "warn" ? "warning" : "info"} size={13} className="mt-px shrink-0" />
      <span>{children}</span>
    </p>
  );
}

/** The scene's own value, pinned and unremovable — value #1 of every axis. */
export function InSceneChip({ label, dot }: { label: string; dot?: string }) {
  return (
    <div
      data-ui="terragen-in-scene"
      className="flex items-center gap-2 rounded-xl border border-brand/40 bg-brand/10 px-2.5 py-2"
    >
      {dot ? (
        <span aria-hidden className={cn("h-2.5 w-2.5 shrink-0 rounded-full border", dot)} />
      ) : (
        <Icon name="check" size={13} className="shrink-0 text-brand" />
      )}
      <span className="type-body-strong grow truncate text-content">{label}</span>
      <Pill ui="in-scene" tone="brand">
        In scene
      </Pill>
    </div>
  );
}

/** A selectable tile with a thumbnail — the shape every content axis uses. */
export function ThumbTile({
  asset,
  selected,
  onClick,
}: {
  asset: Asset;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      data-ui={`terragen-tile-${asset.id}`}
      onClick={onClick}
      className={cn(
        "group overflow-hidden rounded-xl border text-left transition-colors",
        selected ? "border-brand bg-brand/10" : "border-glass/12 bg-glass/6 hover:border-glass/25"
      )}
    >
      <span className="relative block aspect-[4/3] w-full overflow-hidden">
        <AssetThumb type={asset.type} seed={asset.seed} />
        {selected && (
          <span className="absolute right-1.5 top-1.5 grid h-5 w-5 place-items-center rounded-full bg-brand text-brand-foreground">
            <Icon name="check" size={12} />
          </span>
        )}
      </span>
      <span className="type-caption-strong block truncate px-2 py-1.5 text-content">
        {asset.name}
      </span>
    </button>
  );
}

/**
 * Search + bulk over a list or grid.
 *
 * Select-all acts on what the FILTER shows rather than the whole set — "select
 * all" after typing "cone" meaning "also the forty things I filtered out" is
 * the behaviour nobody wants.
 */
export function PickerBar({
  query,
  onQuery,
  ui,
  placeholder = "Search library",
  shown,
  selected,
  onSelectAll,
  onClear,
}: {
  query: string;
  onQuery: (v: string) => void;
  ui: string;
  placeholder?: string;
  shown: number;
  selected: number;
  onSelectAll: () => void;
  onClear: () => void;
}) {
  return (
    <div className="mb-2 flex items-center gap-2">
      <SearchInput
        value={query}
        onValueChange={onQuery}
        ui={ui}
        className="grow"
        placeholder={placeholder}
      />
      <button
        type="button"
        data-ui={`${ui}-all`}
        onClick={onSelectAll}
        disabled={shown === 0}
        className="type-caption-strong shrink-0 rounded-md border border-glass/15 bg-glass/8 px-2 py-1.5 text-content-muted transition-colors hover:text-content disabled:pointer-events-none disabled:opacity-40"
      >
        All {query && `(${shown})`}
      </button>
      <button
        type="button"
        data-ui={`${ui}-clear`}
        onClick={onClear}
        disabled={selected === 0}
        className="type-caption-strong shrink-0 rounded-md border border-glass/15 bg-glass/8 px-2 py-1.5 text-content-muted transition-colors hover:text-content disabled:pointer-events-none disabled:opacity-40"
      >
        None
      </button>
    </div>
  );
}

/** Checkbox row — annotations and dataset types. */
export function Check({
  label,
  note,
  checked,
  disabled,
  comingSoon,
  onChange,
}: {
  label: string;
  note?: string;
  checked: boolean;
  disabled?: boolean;
  comingSoon?: boolean;
  onChange: () => void;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      disabled={disabled}
      data-ui={`terragen-check-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
      onClick={onChange}
      className={cn(
        "flex w-full items-center gap-2.5 rounded-lg border px-2.5 py-2 text-left transition-colors",
        checked ? "border-brand/45 bg-brand/10" : "border-glass/10 bg-glass/5",
        disabled ? "cursor-not-allowed opacity-45" : "hover:border-glass/25"
      )}
    >
      <span
        className={cn(
          "grid h-4 w-4 shrink-0 place-items-center rounded border",
          checked ? "border-brand bg-brand text-brand-foreground" : "border-glass/25"
        )}
      >
        {checked && <Icon name="check" size={11} />}
      </span>
      <span className="type-body grow truncate text-content">{label}</span>
      {note && !comingSoon && <span className="type-caption text-content-subtle">{note}</span>}
      {comingSoon && (
        <Pill ui="coming-soon" tone="muted">
          Coming soon
        </Pill>
      )}
    </button>
  );
}

/** Segmented control — a small set of mutually exclusive choices. */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { id: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="inline-flex rounded-lg border border-glass/12 bg-glass/6 p-0.5">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          aria-pressed={value === o.id}
          data-ui={`terragen-seg-${o.id}`}
          onClick={() => onChange(o.id)}
          className={cn(
            "type-label rounded-[7px] px-3 py-1.5 transition-colors",
            value === o.id ? "bg-brand text-brand-foreground" : "text-content-muted hover:text-content"
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/**
 * A MULTI-SELECT FIELD — a labelled row that opens into its own checkbox list.
 *
 * WHY THIS REPLACED THE CHIP ROWS. Chips were the answer to height: nine
 * full-width checkboxes made Output the tallest section in the dock, and it is
 * the one pinned above Dispatch. But they paid for it in type — a chip's label
 * has to fit inside a pill, so it ran at `type-caption-strong`, two steps under
 * the `type-body-strong` every other field in every other section uses. Output
 * ended up the one panel whose contents were visibly smaller than its
 * neighbours', and the annotation labels had to be abbreviated to fit
 * ("Object Detection — AABB" → "AABB") with the full phrase surviving only as a
 * tooltip.
 *
 * A closed field is ONE row regardless of how many options it holds, so this is
 * shorter than the chips were, not taller — and the options inside it are rows
 * again, at full size, with their explanatory notes visible rather than hovered
 * for.
 *
 * IT OPENS IN PLACE, not into a floating layer. The Output section sits in a
 * `max-h-[48vh] overflow-y-auto` container: an absolutely-positioned menu would
 * be clipped by that scroller the moment the field near the bottom was opened.
 * Expanding in place is also what the Frame resolution field beside it already
 * does, so the four fields in the section behave identically.
 */
export function MultiSelectField({
  icon,
  label,
  options,
  open,
  onToggleOpen,
  onToggle,
  ui,
  /** shown instead of the count when nothing can be picked yet */
  disabledNote,
}: {
  icon: IconName;
  label: string;
  options: {
    id: string;
    label: string;
    /** the sentence under the label — what the chips could only put on hover */
    note?: string;
    checked: boolean;
    disabled?: boolean;
    comingSoon?: boolean;
  }[];
  open: boolean;
  onToggleOpen: () => void;
  onToggle: (id: string) => void;
  ui: string;
  disabledNote?: string;
}) {
  const chosen = options.filter((o) => o.checked);
  const selectable = options.filter((o) => !o.disabled);
  /* THE SUMMARY NAMES THE CHOICES WHILE IT CAN. "2 of 5 selected" is a fact
     about the form; "Bounding boxes, Segmentation" is a fact about the run —
     and the run is what someone re-reads this field to check. The count takes
     over once the list of names would no longer fit on the line. */
  const summary = disabledNote
    ? disabledNote
    : chosen.length === 0
      ? "None selected"
      : chosen.length <= 2
        ? chosen.map((o) => o.label).join(", ")
        : `${chosen.length} of ${selectable.length} selected`;

  return (
    <div data-ui={`terragen-multiselect-${ui}`}>
      <button
        type="button"
        aria-expanded={open}
        data-ui={`terragen-multiselect-${ui}-trigger`}
        onClick={onToggleOpen}
        className="flex w-full items-center gap-2.5 rounded-xl border border-glass/12 bg-glass/6 px-2.5 py-2 text-left transition-colors hover:border-glass/25"
      >
        <Icon name={icon} size={14} className="shrink-0 text-brand" />
        <span className="min-w-0 grow">
          <span className="type-body-strong block truncate text-content">{label}</span>
          <span className="type-caption block truncate text-content-subtle">{summary}</span>
        </span>
        {chosen.length > 0 && !disabledNote && (
          <Pill ui={`multiselect-${ui}-count`} tone="brand">
            {chosen.length}
          </Pill>
        )}
        <Icon
          name="chevron-down"
          size={14}
          className={cn(
            "shrink-0 text-content-subtle transition-transform",
            open && "rotate-180"
          )}
        />
      </button>

      {open && (
        <ul
          role="group"
          aria-label={label}
          data-ui={`terragen-multiselect-${ui}-options`}
          className="mt-2 space-y-1 rounded-xl border border-glass/12 bg-glass/6 p-1.5"
        >
          {options.map((o) => (
            <li key={o.id}>
              <button
                type="button"
                role="checkbox"
                aria-checked={o.checked}
                disabled={o.disabled}
                data-ui={`terragen-option-${o.id}`}
                onClick={() => onToggle(o.id)}
                className={cn(
                  "flex w-full items-start gap-2 rounded-lg px-2 py-1.5 text-left transition-colors",
                  o.disabled ? "cursor-not-allowed opacity-45" : "hover:bg-glass/12"
                )}
              >
                <span
                  className={cn(
                    "mt-px grid h-4 w-4 shrink-0 place-items-center rounded-[5px] border",
                    o.checked ? "border-brand bg-brand text-brand-foreground" : "border-glass/25"
                  )}
                >
                  {o.checked && <Icon name="check" size={10} strokeWidth={3} />}
                </span>
                <span className="min-w-0 grow">
                  <span className="type-body block text-content">{o.label}</span>
                  {o.note && (
                    <span className="type-caption block text-content-subtle">{o.note}</span>
                  )}
                </span>
                {o.comingSoon && (
                  <Pill ui={`option-${o.id}-soon`} tone="muted">
                    Soon
                  </Pill>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
