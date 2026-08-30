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

