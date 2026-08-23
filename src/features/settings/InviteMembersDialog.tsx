import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { Button, Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui";
import { Icon } from "@/components/icons";

/**
 * INVITE — one dialog, however many people.
 *
 * Inviting is almost never a single act: you add a team, and asking for one
 * address at a time means reopening the same dialog four times and losing the
 * role you picked on each pass. So the form is a LIST of rows, each with its
 * own seat, and Add Another extends it in place.
 *
 * THE SEAT IS PRICED IN THE PICKER. A Full Access seat costs money and a Viewer
 * seat doesn't, and that is the single fact that decides which one you pick.
 * Burying it in a billing page and putting a bare "Full Access / Viewer" toggle
 * here would make the cheaper choice invisible at the moment it's being made.
 *
 * `viewerOnly` locks every row to Viewer. External guests can't hold a paid
 * seat in someone else's org, so the control is absent rather than present and
 * failing on submit.
 */

export type SeatKind = "full" | "viewer";

interface SeatOption {
  value: SeatKind;
  label: string;
  price: string;
  blurb: string;
}

const SEATS: SeatOption[] = [
  {
    value: "full",
    label: "Full Access",
    price: "$4.99/mo",
    blurb:
      "Users can create new projects, edit existing projects, invite and remove Viewers, manage settings, and perform all administrative actions.",
  },
  {
    value: "viewer",
    label: "Viewer",
    price: "Free",
    blurb:
      "Users can edit project content and invite other users to join, but they cannot start new projects, remove existing members, or delete projects.",
  },
];

export interface InviteRow {
  id: string;
  email: string;
  seat: SeatKind;
}

export function InviteMembersDialog({
  open,
  onOpenChange,
  title,
  description,
  viewerOnly = false,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  description: string;
  /** external guests: Viewer is the only seat they can hold */
  viewerOnly?: boolean;
  onConfirm: (rows: InviteRow[]) => void;
}) {
  const blank = (): InviteRow => ({
    id: `i${Math.random().toString(36).slice(2, 8)}`,
    email: "",
    seat: viewerOnly ? "viewer" : "full",
  });

  const [rows, setRows] = useState<InviteRow[]>([blank()]);

  useEffect(() => {
    if (open) setRows([blank()]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const patch = (id: string, next: Partial<InviteRow>) =>
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...next } : r)));

  const filled = rows.filter((r) => r.email.trim().length > 0);
  const valid = filled.length > 0 && filled.every((r) => /.+@.+\..+/.test(r.email.trim()));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[32rem]">
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{description}</DialogDescription>

        <div className="mt-4 flex flex-col gap-3">
          {rows.map((row, i) => (
            <div key={row.id}>
              <div className="mb-1.5 flex items-baseline justify-between gap-2">
                <span className="type-body-strong text-content">Email</span>
                {/* Only offered from the second row: removing the only row
                    would leave a form with nothing to fill in. */}
                {rows.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setRows((rs) => rs.filter((r) => r.id !== row.id))}
                    className="type-body-dense text-danger transition-colors hover:brightness-125"
                  >
                    Remove
                  </button>
                )}
              </div>

              <div className="field-well flex h-11 items-center rounded-lg border pl-3 pr-1.5 transition-colors focus-within:border-brand">
                <input
                  type="email"
                  value={row.email}
                  autoFocus={i === 0}
                  placeholder="name@gmail.com"
                  aria-label={`Email ${i + 1}`}
                  onChange={(e) => patch(row.id, { email: e.target.value })}
                  className="type-body min-w-0 flex-1 bg-transparent text-content outline-none placeholder:text-content-subtle"
                />
                {viewerOnly ? (
                  <span className="type-body shrink-0 px-2 text-content-subtle">Viewer</span>
                ) : (
                  <SeatPicker value={row.seat} onChange={(seat) => patch(row.id, { seat })} />
                )}
              </div>
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={() => setRows((rs) => [...rs, blank()])}
          className="type-body-strong mt-3 inline-flex items-center gap-1.5 rounded-lg bg-glass/15 px-3 py-2 text-content transition-colors hover:bg-glass/25"
        >
          <Icon name="create" size={15} />
          Add Another
        </button>

        <div className="mt-5 flex justify-end gap-2.5">
          <Button variant="secondary" size="md" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="brand"
            size="md"
            disabled={!valid}
            onClick={() => {
              onConfirm(filled);
              onOpenChange(false);
            }}
          >
            Confirm
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** The seat menu. Each option carries its price and what it actually permits. */
function SeatPicker({
  value,
  onChange,
}: {
  value: SeatKind;
  onChange: (v: SeatKind) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const current = SEATS.find((s) => s.value === value)!;

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("pointerdown", onDown);
    return () => window.removeEventListener("pointerdown", onDown);
  }, [open]);

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="type-body flex items-center gap-1.5 rounded-md px-2 py-1.5 text-content transition-colors hover:bg-glass/15"
      >
        {current.label}
        <Icon
          name="chevron-down"
          size={14}
          className={cn("text-content-subtle transition-transform", open && "rotate-180")}
        />
      </button>

      {open && (
        <div
          role="listbox"
          className="glass glass-overlay absolute right-0 top-[calc(100%+6px)] z-50 w-[22rem] !rounded-xl p-1.5"
        >
          {SEATS.map((s) => (
            <button
              key={s.value}
              type="button"
              role="option"
              aria-selected={s.value === value}
              onClick={() => {
                onChange(s.value);
                setOpen(false);
              }}
              className={cn(
                "flex w-full gap-2 rounded-lg border p-3 text-left transition-colors",
                s.value === value
                  ? "border-brand/50 bg-brand/10"
                  : "border-transparent hover:bg-glass/10"
              )}
            >
              <span className="min-w-0 flex-1">
                <span className="type-body-strong block text-content">
                  {s.label} ({s.price})
                </span>
                <span className="type-body-dense mt-0.5 block text-content-muted">{s.blurb}</span>
              </span>
              <Icon
                name="check"
                size={15}
                className={cn(
                  "mt-0.5 shrink-0 text-brand",
                  s.value !== value && "invisible"
                )}
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
