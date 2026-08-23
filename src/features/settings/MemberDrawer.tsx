import { useState } from "react";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/icons";
import { Avatar, Button, Dialog, DialogContent, DialogTitle } from "@/components/ui";
import { Chip } from "./settings-parts";
import { SEAT_LABEL, type MemberRow, type SeatKind } from "./settings-data";
import { useSettings } from "./settings-store";
import { EXTRA_SEAT_PRICE, money } from "./subscription-data";

/**
 * MANAGE — one member, in a panel beside the row that opened it.
 *
 * A drawer rather than a menu, because this is not a list of commands: it is a
 * record you read (who they are, what seat they hold) with the things you can
 * do to it underneath. A context menu would have to hide the identity to show
 * the actions, and every one of these actions is one you want to check the name
 * before taking.
 *
 * The panel opens from the RIGHT, against the Action column that summoned it,
 * so what you clicked stays under your eye. The org rail keeps its own side.
 */

/** The two seats a member can be moved between, with what each one buys. */
const SEATS: {
  kind: Exclude<SeatKind, "owner">;
  price: string;
  blurb: string;
  can: string[];
  cannot: string[];
}[] = [
  {
    kind: "full",
    price: `${money(EXTRA_SEAT_PRICE)}/ mo`,
    blurb: "For users who need full creative and operational control.",
    can: [
      "Create and manage projects",
      "Invite Viewers",
      "Use and track data quotas (Img/video generation)",
      "Access settings and asset requests",
    ],
    cannot: [],
  },
  {
    kind: "viewer",
    price: "Free",
    blurb: "For teammates who contribute without managing.",
    can: ["Edit scenes, objects, and data", "View and work on shared projects"],
    cannot: ["Can't create new projects", "Can't assign or remove team members"],
  },
];

type Ask = "seat" | "admin" | "ownership" | "remove" | null;

export function MemberDrawer({ member, onClose }: { member: MemberRow | null; onClose: () => void }) {
  const {
    notify,
    go,
    seatLedger,
    setMemberSeat,
    removeMember,
    grantAdmin,
    transferOwnership,
    buySeats,
  } = useSettings();
  const [ask, setAsk] = useState<Ask>(null);

  if (!member) return null;
  const isOwner = member.seat === "owner";

  /**
   * Moving someone onto a Full Access seat when none are free is NOT refused —
   * it's a purchase. Blocking it would make the admin leave, guess how many
   * seats they need, buy them on another screen and come back; the plan can
   * simply grow by one and say so before it does.
   */
  function applySeat(seat: Exclude<SeatKind, "owner">) {
    if (!member) return;
    if (seat === "full" && seatLedger.fullFree === 0) {
      buySeats(1);
      notify(
        `${member.name} moved to Full Access. ${money(EXTRA_SEAT_PRICE)}/mo added, prorated on your next invoice.`
      );
    } else {
      notify(`${member.name} now holds a ${SEAT_LABEL[seat]} seat.`);
    }
    setMemberSeat(member.id, seat);
    setAsk(null);
  }

  return (
    <>
      {/* A peek, not a place: clicking the page puts it away. */}
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <aside
        aria-label={`Manage ${member.name}`}
        className="glass fixed right-0 top-0 z-50 flex h-screen w-[22rem] flex-col !rounded-none border-y-0 border-r-0 animate-panel-in"
      >
        <header className="flex items-start gap-3 border-b border-glass/10 p-5">
          <Avatar
            name={member.name}
            size={38}
            className={cn(member.status === "pending" && "opacity-45 grayscale")}
          />
          <div className="min-w-0 flex-1">
            <p className="type-body-strong flex items-center gap-1.5 truncate text-content">
              {member.status === "pending" ? "Pending" : member.name}
              {isOwner && <Chip tone="neutral">Owner</Chip>}
            </p>
            <p className="type-body-dense truncate text-content-muted">{member.email}</p>
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-content-subtle transition-colors hover:text-content"
          >
            <Icon name="close" size={17} />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto p-5">
          <p className="type-body-strong text-content">Manage</p>

          <Field label="Name" value={member.status === "pending" ? "—" : member.name} />
          <Field
            label="Email"
            value={member.email}
            action="Copy email"
            onAction={() => {
              navigator.clipboard?.writeText(member.email);
              notify("Email address copied.");
            }}
          />
          <Field
            label="Seat Type"
            value={SEAT_LABEL[member.seat]}
            // The Owner's seat is the one seat that can't be reassigned; there
            // is exactly one and it moves by transfer, not by picker.
            action={isOwner ? undefined : "Change seat"}
            onAction={() => setAsk("seat")}
          />

          {/* Nothing below the fields for your own Owner row: everything here
              is something you'd be doing TO someone else. */}
          {!isOwner && (
            <div className="mt-6 flex flex-col gap-2.5">
              <Button variant="secondary" className="w-full" onClick={() => go("project-access")}>
                Edit Project Access
              </Button>
              {member.role !== "Admin" && member.status === "active" && (
                <Button variant="secondary" className="w-full" onClick={() => setAsk("admin")}>
                  Grant Admin Access
                </Button>
              )}
              {member.status === "active" && (
                <Button variant="secondary" className="w-full" onClick={() => setAsk("ownership")}>
                  Transfer Ownership
                </Button>
              )}
              <Button
                variant="outline"
                className="w-full border-danger/50 text-danger hover:border-danger hover:text-danger"
                onClick={() => setAsk("remove")}
              >
                {member.status === "pending" ? "Revoke this invitation" : "Remove from this Organization"}
              </Button>
            </div>
          )}
        </div>
      </aside>

      <SeatDialog
        open={ask === "seat"}
        member={member}
        buying={seatLedger.fullFree === 0}
        onClose={() => setAsk(null)}
        onPick={applySeat}
      />

      <AskDialog
        open={ask === "admin"}
        title="Grant Admin Access"
        confirmLabel="Grant Access"
        onClose={() => setAsk(null)}
        onConfirm={() => {
          grantAdmin(member.id);
          notify(`${member.name} is now an Admin.`);
          setAsk(null);
          onClose();
        }}
      >
        <p>You&apos;re about to grant admin access to {member.name}.</p>
        <p className="mt-2.5">
          Admins can manage members, billing, organization settings, and have full project
          access. Please confirm this action.
        </p>
      </AskDialog>

      <AskDialog
        open={ask === "ownership"}
        title="Transfer Ownership"
        confirmLabel="Transfer Ownership"
        onClose={() => setAsk(null)}
        onConfirm={() => {
          transferOwnership(member.id);
          notify(`Ownership transferred to ${member.name}.`);
          setAsk(null);
          onClose();
        }}
      >
        <p>You&apos;re about to transfer ownership of this organization to {member.name}.</p>
        <p className="mt-2.5">
          Once transferred, you will no longer be the owner and may lose access to certain
          administrative permissions, including billing, plan management, and team settings.
        </p>
      </AskDialog>

      <AskDialog
        open={ask === "remove"}
        title={member.status === "pending" ? "Revoke this invitation?" : "Remove from this Organization"}
        confirmLabel={member.status === "pending" ? "Revoke invitation" : "Remove User"}
        danger
        onClose={() => setAsk(null)}
        onConfirm={() => {
          removeMember(member.id);
          notify(
            member.status === "pending"
              ? `Invitation to ${member.email} revoked.`
              : `${member.name} has been removed from this organization. They no longer have access to any projects within the organisation.`
          );
          setAsk(null);
          onClose();
        }}
      >
        {member.status === "pending" ? (
          <p>The invitation to {member.email} stops working and its seat is released.</p>
        ) : (
          <p>
            {member.name} will lose access to every project in this organization. Their{" "}
            {SEAT_LABEL[member.seat]} seat is released back to the plan.
          </p>
        )}
      </AskDialog>
    </>
  );
}

/** A read-only fact with, sometimes, the one thing you can do to it. */
function Field({
  label,
  value,
  action,
  onAction,
}: {
  label: string;
  value: string;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <div className="mt-4">
      <p className="type-body-dense text-content-muted">{label}</p>
      <div className="field-well mt-1.5 flex h-10 items-center gap-2 rounded-lg border px-3">
        <span className="type-body min-w-0 flex-1 truncate text-content-subtle">{value}</span>
        {action && (
          <button
            type="button"
            onClick={onAction}
            className="type-body-dense shrink-0 text-content transition-colors hover:text-brand"
          >
            {action}
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * The seat picker. Both seats are shown in full rather than as a toggle,
 * because the choice is a PRICE and a capability list, not a label — and the
 * one being left is as much a part of the decision as the one being taken.
 */
function SeatDialog({
  open,
  member,
  buying,
  onClose,
  onPick,
}: {
  open: boolean;
  member: MemberRow;
  /** true when taking a Full Access seat means adding one to the plan */
  buying: boolean;
  onClose: () => void;
  onPick: (seat: Exclude<SeatKind, "owner">) => void;
}) {
  const [choice, setChoice] = useState<Exclude<SeatKind, "owner">>(
    member.seat === "owner" ? "full" : member.seat
  );

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="w-[30rem]">
        <DialogTitle>Select a seat for your member</DialogTitle>

        <div className="mt-3 flex items-center gap-2.5">
          <Avatar name={member.name} size={30} className={cn(member.status === "pending" && "opacity-45 grayscale")} />
          <span className="min-w-0">
            <span className="type-body-strong block truncate text-content">
              {member.status === "pending" ? "Pending" : member.name}
            </span>
            <span className="type-body-dense block truncate text-content-muted">{member.email}</span>
          </span>
        </div>

        <p className="type-body mt-3 text-content">Choose a seat for {member.email}</p>

        <div className="mt-3 flex flex-col gap-3">
          {SEATS.map((s) => {
            const on = choice === s.kind;
            const current = member.seat === s.kind;
            return (
              <button
                key={s.kind}
                type="button"
                aria-pressed={on}
                onClick={() => setChoice(s.kind)}
                className={cn(
                  "rounded-xl border p-4 text-left transition-colors",
                  on ? "border-brand bg-brand-soft/20" : "border-glass/12 hover:border-glass/25"
                )}
              >
                <span className="flex items-center gap-2.5">
                  <span
                    className={cn(
                      "grid h-8 w-8 shrink-0 place-items-center rounded-lg",
                      s.kind === "full" ? "bg-brand-soft text-brand" : "bg-warning-soft text-warning"
                    )}
                  >
                    <Icon name={s.kind === "full" ? "layout" : "visible"} size={16} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="type-body-strong block text-content">{SEAT_LABEL[s.kind]}</span>
                    <span className="type-body-dense block text-content-muted">{s.blurb}</span>
                  </span>
                  <span className="type-body-dense shrink-0 text-content-muted">
                    {current ? "Current" : s.price}
                  </span>
                </span>

                <span className="mt-3 flex flex-col gap-1.5">
                  {s.can.map((c) => (
                    <span key={c} className="type-body-dense flex gap-2 text-content">
                      <Icon name="check" size={14} className="mt-0.5 shrink-0 text-success" />
                      {c}
                    </span>
                  ))}
                  {s.cannot.map((c) => (
                    <span key={c} className="type-body-dense flex gap-2 text-content-muted">
                      <Icon name="close" size={14} className="mt-0.5 shrink-0 text-danger" />
                      {c}
                    </span>
                  ))}
                </span>
              </button>
            );
          })}
        </div>

        {/* Said before Confirm, not after: the charge is the part of this
            decision most likely to be the one you'd have changed your mind on. */}
        {choice === "full" && member.seat !== "full" && buying && (
          <p className="type-body-dense mt-3 rounded-lg bg-accent-soft px-3 py-2.5 text-accent">
            An additional {money(EXTRA_SEAT_PRICE)} / mo will be added, with charges prorated
            on your upcoming invoice.
          </p>
        )}

        <div className="mt-5 flex justify-end gap-2.5">
          <Button variant="secondary" size="sm" onClick={onClose}>
            Back
          </Button>
          <Button
            variant="brand"
            size="sm"
            disabled={choice === member.seat}
            onClick={() => onPick(choice)}
          >
            Confirm
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** A decision with consequences spelled out, and one button that takes it. */
function AskDialog({
  open,
  title,
  confirmLabel,
  danger,
  children,
  onClose,
  onConfirm,
}: {
  open: boolean;
  title: string;
  confirmLabel: string;
  danger?: boolean;
  children: React.ReactNode;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="w-[27rem]">
        <DialogTitle>{title}</DialogTitle>
        <div className="type-body mt-2.5 text-content-muted">{children}</div>
        <div className="mt-5 flex justify-end gap-2.5">
          <Button variant="secondary" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button variant={danger ? "danger" : "brand"} size="sm" onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
