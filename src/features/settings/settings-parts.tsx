import { useEffect, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Icon, type IconName } from "@/components/icons";
import { Button } from "@/components/ui";

/**
 * The pieces every Settings page is made of. They exist because eleven screens
 * repeat four shapes: a page title, a section heading, a labelled row with one
 * action on the right, and a bordered panel. Retyping those is how eleven screens
 * end up with eleven paddings.
 */

export function PageTitle({
  children,
  avatar,
}: {
  children: ReactNode;
  /** the org mark, for the pages that are about the org rather than the account */
  avatar?: ReactNode;
}) {
  return (
    <div className="flex items-center gap-2.5">
      {avatar}
      <h1 className="font-display text-lg font-semibold tracking-tight">{children}</h1>
    </div>
  );
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return <h2 className="font-display text-base font-bold">{children}</h2>;
}

/**
 * A labelled fact with one thing you can do to it. The action sits at the far
 * right on the label's own line, so a column of these has one edge to scan.
 */
export function DetailRow({
  label,
  value,
  action,
  className,
}: {
  label: string;
  value?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-start gap-4 border-b border-glass/10 py-5 last:border-b-0",
        className
      )}
    >
      <div className="min-w-0 flex-1">
        <p className="type-body-strong text-content">{label}</p>
        {value !== undefined && (
          <div className="type-body-dense mt-1 text-content-muted">{value}</div>
        )}
      </div>
      {action && <div className="shrink-0 pt-0.5">{action}</div>}
    </div>
  );
}

/**
 * A row that becomes its own form.
 *
 * Editing a name is not worth a modal: the field is already on screen, and
 * covering the page to change one word makes you lose the column of facts you
 * were reading down. So Edit swaps the value for inputs IN PLACE, with Cancel
 * and Save on the same line — the row keeps its position and the rest of the
 * page never moves.
 *
 * `fields` is a list because Firstname and Lastname are one edit, not two.
 */
export function InlineEditRow({
  label,
  fields,
  display,
  onSave,
}: {
  label: string;
  fields: { key: string; label: string; value: string; type?: string }[];
  /** what the row reads as when it isn't being edited */
  display: ReactNode;
  onSave: (values: Record<string, string>) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Record<string, string>>({});

  // Opening the editor always starts from what is CURRENTLY stored, not from
  // whatever was abandoned in the box last time.
  useEffect(() => {
    if (editing) setDraft(Object.fromEntries(fields.map((f) => [f.key, f.value])));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing]);

  const dirty = fields.some((f) => (draft[f.key] ?? f.value) !== f.value);
  const complete = fields.every((f) => (draft[f.key] ?? "").trim().length > 0);

  if (!editing) {
    return (
      <DetailRow
        label={label}
        value={display}
        action={<EditButton onClick={() => setEditing(true)} />}
      />
    );
  }

  return (
    <div className="flex flex-wrap items-end gap-3 border-b border-glass/10 py-5 last:border-b-0">
      {fields.map((f) => (
        <label key={f.key} className="min-w-[10rem] flex-1">
          <span className="type-body-strong block text-content">{f.label}</span>
          <input
            type={f.type ?? "text"}
            value={draft[f.key] ?? f.value}
            autoFocus={f === fields[0]}
            onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value }))}
            onKeyDown={(e) => {
              if (e.key === "Enter" && complete) {
                onSave(draft);
                setEditing(false);
              }
              if (e.key === "Escape") setEditing(false);
            }}
            className="field-well type-body mt-1.5 h-10 w-full rounded-lg border px-3 text-content outline-none transition-colors focus:border-brand"
          />
        </label>
      ))}

      <div className="flex shrink-0 gap-2.5">
        <Button variant="secondary" size="md" onClick={() => setEditing(false)}>
          Cancel
        </Button>
        <Button
          variant="brand"
          size="md"
          disabled={!complete || !dirty}
          onClick={() => {
            onSave(draft);
            setEditing(false);
          }}
        >
          Save
        </Button>
      </div>
    </div>
  );
}

export function EditButton({ onClick }: { onClick?: () => void }) {
  return (
    <Button variant="secondary" size="sm" onClick={onClick}>
      Edit
    </Button>
  );
}

export function Panel({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("glass !rounded-xl p-5", className)}>
      {children}
    </div>
  );
}

/** A headline number with a glyph — the stat cards above Activity Logs. */
export function StatCard({
  icon,
  label,
  value,
  note,
  tone = "neutral",
}: {
  icon: IconName;
  label: string;
  value: ReactNode;
  note?: string;
  tone?: "neutral" | "warning";
}) {
  return (
    <Panel className="flex items-center gap-3.5">
      <span
        className={cn(
          "grid h-10 w-10 shrink-0 place-items-center rounded-lg",
          tone === "warning" ? "bg-warning-soft text-warning" : "bg-brand-soft text-brand"
        )}
      >
        <Icon name={icon} size={18} />
      </span>
      <div className="min-w-0">
        <p className="type-body-dense text-content-muted">{label}</p>
        <p className="font-display text-lg font-semibold text-content">
          {value}
          {note && (
            <span className="type-body-dense ml-1.5 font-normal text-brand">{note}</span>
          )}
        </p>
      </div>
    </Panel>
  );
}

/** The org's round mark. Initials, because most orgs never upload a logo. */
export function OrgMark({
  initials,
  size = 36,
  className,
}: {
  initials: string;
  size?: number;
  className?: string;
}) {
  return (
    <span
      style={{ width: size, height: size, fontSize: size * 0.34 }}
      className={cn(
        "grid shrink-0 place-items-center rounded-full bg-glass/20 font-display font-semibold text-brand",
        className
      )}
    >
      {initials}
    </span>
  );
}

/** A small state word — a role, a plan, a status. */
export function Chip({
  children,
  tone = "neutral",
  className,
}: {
  children: ReactNode;
  tone?: "neutral" | "brand" | "success" | "warning" | "info";
  className?: string;
}) {
  const tones = {
    neutral: "bg-surface-raised text-content-muted",
    brand: "bg-brand-soft text-brand",
    success: "bg-success-soft text-success",
    warning: "bg-warning-soft text-warning",
    info: "bg-accent-soft text-accent",
  };
  return (
    <span
      className={cn(
        "type-caption-strong inline-flex items-center gap-1 rounded-md px-1.5 py-0.5",
        tones[tone],
        className
      )}
    >
      {children}
    </span>
  );
}

/** A search field, at the size the filter rows use. */
export function SearchField({
  value,
  onChange,
  placeholder,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  className?: string;
}) {
  return (
    <label
      className={cn(
        "field-well flex h-9 min-w-[11rem] items-center gap-2 rounded-lg px-3",
        className
      )}
    >
      <Icon name="search" size={16} className="shrink-0 text-content-subtle" />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="type-body min-w-0 flex-1 bg-transparent text-content outline-none placeholder:text-content-subtle"
      />
    </label>
  );
}

/**
 * A date-range control. It opens nothing: the pickers behind these aren't
 * designed yet, so it states what it would filter rather than pretending.
 */
export function DateField({ label }: { label: string }) {
  return (
    <span className="field-well flex h-9 items-center gap-2 rounded-lg px-3 text-content-subtle">
      <Icon name="calendar" size={16} className="shrink-0" />
      <span className="type-body whitespace-nowrap">{label}</span>
    </span>
  );
}


/**
 * A RIGHT-HAND DRAWER — a record you read, beside the row that opened it.
 *
 * Not a dialog: a dialog is centred and takes the screen, which is right for a
 * decision and wrong for a detail. These open against the Action column that
 * summoned them, so the row you clicked stays under your eye and the table
 * behind them is still the thing you are working through.
 *
 * The scrim DIMS rather than merely catching the click. A transparent catcher
 * over a table leaves two competing surfaces at the same brightness, and the
 * one you can't interact with looks like the one you can.
 *
 * SOLID, NOT GLASS — the `solid` surface tier Dialog offers for the same reason
 * (see components/ui/dialog). Glass is right over the 3D canvas, where what
 * shows through is a scene; these open over a dense table, and a receipt read
 * through six columns of somebody else's figures is a receipt you cannot check.
 */
export function SideDrawer({
  label,
  onClose,
  children,
  footer,
  width = "30rem",
}: {
  /** what the drawer is about, for the accessible name */
  label: string;
  onClose: () => void;
  children: ReactNode;
  /** pinned to the bottom edge, out of the scroll — the actions */
  footer?: ReactNode;
  width?: string;
}) {
  /* Escape closes it. A panel that covers a third of the window and can only be
     dismissed by finding its own small button is a modal without saying so. */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <>
      <div
        className="fixed inset-0 z-[55] bg-black/70 backdrop-blur-sm animate-fade-in"
        onClick={onClose}
        aria-hidden
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={label}
        style={{ width }}
        className="fixed right-0 top-0 z-[56] flex h-screen max-w-[calc(100vw-1.5rem)] flex-col border-l border-line/12 bg-surface-overlay shadow-lg animate-panel-in"
      >
        {/* One scroller, so a long receipt moves under a header and a footer that
            stay put — the close control and the action are the two things you
            must not have to scroll to reach. */}
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
        {footer && <div className="border-t border-glass/10 p-6">{footer}</div>}
      </aside>
    </>
  );
}

/** The drawer's own header: an icon, a title with a state chip, and the close. */
export function DrawerHeader({
  icon,
  tone = "brand",
  title,
  subtitle,
  badge,
  onClose,
}: {
  icon: IconName;
  tone?: "brand" | "success" | "warning" | "danger";
  title: string;
  subtitle?: string;
  badge?: ReactNode;
  onClose: () => void;
}) {
  const tones = {
    brand: "bg-brand-soft text-brand",
    success: "bg-success-soft text-success",
    warning: "bg-warning-soft text-warning",
    danger: "bg-danger-soft text-danger",
  };
  return (
    <div className="flex items-start gap-3 border-b border-glass/10 p-6">
      <span className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-full", tones[tone])}>
        <Icon name={icon} size={19} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-2">
          <span className="font-display text-lg font-semibold text-content">{title}</span>
          {badge}
        </p>
        {subtitle && <p className="type-body mt-0.5 text-content-muted">{subtitle}</p>}
      </div>
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        data-ui="drawer-close"
        className="-mr-1 grid h-8 w-8 shrink-0 place-items-center rounded-lg text-content-subtle transition-colors hover:bg-glass/15 hover:text-content"
      >
        <Icon name="close" size={16} />
      </button>
    </div>
  );
}

/**
 * A LABELLED FACT — the read-only twin of a form field.
 *
 * The drawers state things you cannot change (an invoice number, the card a
 * charge went to) and the design draws them as fields: a small label with the
 * value under it. They are NOT inputs, so they get no well and no border —
 * a box around a value you can't edit is a control that doesn't respond.
 */
export function FactField({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="type-body-dense text-content-muted">{label}</p>
      <p className="type-body-strong mt-0.5 truncate text-content">{value}</p>
    </div>
  );
}

/**
 * ONE LINE OF A RECEIPT — a label, the rate it came from, and the figure.
 *
 * Shared by the checkout's order summary and the invoice drawer because they are
 * the same object read at two moments: the summary is the receipt before you
 * agree to it. Two copies of this drifted in exactly the way that matters —
 * a subtotal that lines up in one column and not the other.
 */
export function ReceiptLine({
  label,
  note,
  value,
  strong,
  muted,
  rule,
}: {
  label: string;
  note?: string;
  value: string;
  strong?: boolean;
  /** a figure that is not a charge — "Free" */
  muted?: boolean;
  /** the hairline the design puts under each seat line */
  rule?: boolean;
}) {
  return (
    <div className={cn("flex items-start gap-3", rule && "border-b border-glass/10 pb-4")}>
      <span className="min-w-0 flex-1">
        <span
          className={cn(
            "block",
            strong ? "type-body-lg-strong text-content" : "type-body-lg text-content"
          )}
        >
          {label}
        </span>
        {note && <span className="type-body-dense mt-0.5 block text-content-subtle">{note}</span>}
      </span>
      <span
        className={cn(
          "shrink-0 tabular-nums",
          strong ? "type-body-lg-strong text-content" : "type-body-lg",
          muted ? "text-content-muted" : "text-content"
        )}
      >
        {value}
      </span>
    </div>
  );
}
