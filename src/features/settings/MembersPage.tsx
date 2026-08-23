import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/icons";
import {
  Avatar,
  Button,
  ContextMenu,
  DataTable,
  Select,
  type Column,
  type MenuItem,
} from "@/components/ui";
import { Chip, PageTitle, SearchField } from "./settings-parts";
import { ConfirmDialog } from "./settings-dialogs";
import {
  SEAT_INCLUDES,
  SEAT_LABEL,
  type MemberRow,
  type SeatKind,
} from "./settings-data";
import { useSettings } from "./settings-store";
import { planSpec } from "./subscription-data";
import { InviteMembersDialog } from "./InviteMembersDialog";

/**
 * MEMBERS — one org's people, and what each of them can do.
 *
 * `Includes` spells out the seat in a sentence rather than leaving "Owner" to be
 * interpreted: the difference between an Owner and a Viewer is exactly the thing
 * an admin is trying to decide when they're on this screen.
 *
 * Every row is now live. The seat cell and the Action cell were both decorative
 * — a chevron drawn onto a span — which is the worst state for a settings table
 * to be in: it looks like the answer to "how do I change this" and isn't. They
 * open the same menu now, because "change the seat" and "manage this person"
 * are the same question asked from two columns.
 *
 * The seat ledger is what makes this more than a list. A Full Access seat costs
 * money and the plan includes a fixed number of them, so promoting someone can
 * run out — and running out is a state the screen has to be able to show rather
 * than a silent no-op.
 */
export function MembersPage() {
  const {
    notify,
    go,
    members,
    seatLedger,
    inviteMembers,
    setMemberSeat,
    removeMember,
    resendInvite,
    subscription,
  } = useSettings();

  /** Free orgs have no Viewer seats either, so "invite them as Viewers" is
   *  advice that would fail — the two plans need two different sentences. */
  const sharesViewers = planSpec(subscription.plan).seats.viewers === "unlimited";

  const [inviteOpen, setInviteOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [role, setRole] = useState("all");
  /** the row whose menu is open, and where to draw it */
  const [menu, setMenu] = useState<{ row: MemberRow; at: { x: number; y: number } } | null>(null);
  /** the row awaiting a removal confirmation */
  const [removing, setRemoving] = useState<MemberRow | null>(null);
  /** set when a promotion was refused for want of a seat */
  const [seatBlock, setSeatBlock] = useState<MemberRow | null>(null);

  const rows = useMemo(
    () =>
      members.filter((m) => {
        const q = query.trim().toLowerCase();
        return (
          (m.name.toLowerCase().includes(q) || m.email.toLowerCase().includes(q)) &&
          (role === "all" || m.role.toLowerCase() === role)
        );
      }),
    [members, query, role]
  );

  /** Open the row menu from wherever it was summoned — the cell or the caret. */
  function openMenu(row: MemberRow, e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    const box = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setMenu({ row, at: { x: box.left, y: box.bottom + 4 } });
  }

  /** A promotion that has no seat behind it stops here rather than half-applying. */
  function changeSeat(row: MemberRow, seat: SeatKind) {
    if (seat === row.seat) return;
    if (seat === "full" && seatLedger.fullFree === 0) {
      setSeatBlock(row);
      return;
    }
    setMemberSeat(row.id, seat);
    notify(`${row.name} now holds a ${SEAT_LABEL[seat]} seat.`);
  }

  const columns: Column<MemberRow>[] = [
    {
      key: "name",
      label: "Name",
      sortValue: (r) => r.name,
      render: (r) => (
        <div className="flex items-center gap-2.5">
          {/* A pending invitee has no face yet — a filled initials avatar would
              claim someone is here who hasn't answered. */}
          <Avatar
            name={r.name}
            size={34}
            className={cn(r.status === "pending" && "opacity-45 grayscale")}
          />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="type-body-strong text-content">
                {r.status === "pending" ? "Pending" : r.name}
              </span>
              <Chip tone={r.status === "pending" ? "warning" : "neutral"}>
                {r.status === "pending" ? "Invited" : r.role}
              </Chip>
            </div>
            <p className="type-caption mt-0.5 truncate text-content-subtle">{r.email}</p>
          </div>
        </div>
      ),
    },
    {
      key: "seat",
      label: "Seats",
      sortValue: (r) => SEAT_LABEL[r.seat],
      render: (r) => <SeatCell row={r} onOpen={(e) => openMenu(r, e)} />,
    },
    {
      key: "projects",
      label: "Project Access",
      sortValue: (r) => r.projects,
      render: (r) => (
        <span className="type-body text-content">
          {r.projects} {r.projects === 1 ? "project" : "projects"}
        </span>
      ),
    },
    {
      key: "active",
      label: "Last Active On",
      sortValue: (r) => r.lastActive,
      render: (r) => (
        <span
          className={cn(
            "type-body",
            r.status === "pending" ? "text-content-subtle" : "text-content"
          )}
        >
          {r.lastActive}
        </span>
      ),
    },
    {
      key: "includes",
      label: "Includes",
      render: (r) => (
        <span className="type-body text-content-muted">{SEAT_INCLUDES[r.seat]}</span>
      ),
    },
    {
      key: "action",
      label: "Action",
      align: "right",
      render: (r) => (
        <button
          type="button"
          aria-label={`Manage ${r.status === "pending" ? r.email : r.name}`}
          aria-haspopup="menu"
          onClick={(e) => openMenu(r, e)}
          className="inline-grid h-8 w-8 place-items-center rounded-lg border border-glass/10 text-content-muted transition-colors hover:border-brand hover:text-brand"
        >
          <Icon name="more" size={16} />
        </button>
      ),
    },
  ];

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <PageTitle>Members</PageTitle>
        <div className="flex flex-wrap items-center gap-2">
          {/* Four SEAT KINDS, in the order they're spent: the seat that can't
              move, the ones paid for and taken, the free read-only ones, and
              what's left. All four come off the roster, so removing someone
              moves two of them at once. */}
          <Counter icon="person" tone="info" value={seatLedger.owner} label="Owner Seat" />
          <Counter icon="layout" tone="brand" value={seatLedger.fullUsed} label="Full Access Seat" />
          <Counter icon="visible" tone="warning" value={seatLedger.viewer} label="Viewer Seat" />
          <Counter icon="layout" tone="success" value={seatLedger.fullFree} label="Available Seat" />
          <Button variant="brand" size="sm" onClick={() => setInviteOpen(true)}>
            <Icon name="create" size={15} />
            Invite Users
          </Button>
        </div>
      </div>

      {/* The one state worth pre-empting: you can read the strip above and still
          not notice there is nothing left to invite anyone INTO. */}
      {seatLedger.fullFree === 0 && (
        <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-warning/25 bg-warning-soft/40 px-4 py-3">
          <Icon name="warning" size={17} className="shrink-0 text-warning" />
          <p className="type-body min-w-0 flex-1 text-content">
            All {seatLedger.fullTotal} Full Access seat
            {seatLedger.fullTotal === 1 ? "" : "s"} are taken.{" "}
            {sharesViewers
              ? "Viewer seats are still free and unlimited."
              : "Your plan doesn't include team sharing — upgrade to invite anyone else."}
          </p>
          <Button variant="secondary" size="sm" onClick={() => go("plans")}>
            {sharesViewers ? "Add seats" : "Upgrade plan"}
          </Button>
        </div>
      )}

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <SearchField
          value={query}
          onChange={setQuery}
          placeholder="Search by name or email"
          className="w-[20rem]"
        />
        <Select
          prefix="Filter by role:"
          aria-label="Filter by role"
          value={role}
          onChange={(e) => setRole(e.target.value)}
          options={[
            { value: "all", label: "All Roles" },
            { value: "owner", label: "Owner" },
            { value: "admin", label: "Admin" },
            { value: "editor", label: "Editor" },
            { value: "viewer", label: "Viewer" },
          ]}
        />
      </div>

      <div className="mt-4">
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(r) => r.id}
          empty="Nobody matches those filters"
        />
      </div>

      {/* What the table foots to. The seat strip counts by KIND; this counts
          heads, and the two answer different questions. */}
      <p className="type-body mt-3 text-right text-content-muted">
        Current Total:{" "}
        <span className="type-body-strong text-content">
          {seatLedger.assigned} assigned seat{seatLedger.assigned === 1 ? "" : "s"}
        </span>
      </p>

      {menu && (
        <ContextMenu
          at={menu.at}
          items={menuFor(menu.row)}
          onClose={() => setMenu(null)}
          onSelect={(id) => {
            const row = menu.row;
            if (id === "seat-full") changeSeat(row, "full");
            if (id === "seat-viewer") changeSeat(row, "viewer");
            if (id === "resend") {
              resendInvite(row.id);
              notify(`Invitation resent to ${row.email}.`);
            }
            if (id === "copy") {
              navigator.clipboard?.writeText(row.email);
              notify("Email address copied.");
            }
            if (id === "projects") go("project-access");
            if (id === "remove") setRemoving(row);
          }}
        />
      )}

      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(v) => !v && setRemoving(null)}
        title={
          removing?.status === "pending"
            ? "Revoke this invitation?"
            : "Remove this member?"
        }
        body={
          removing?.status === "pending" ? (
            <>
              The invitation to <b className="text-content">{removing?.email}</b> stops
              working and its seat is released. You can invite them again later.
            </>
          ) : (
            <>
              <b className="text-content">{removing?.name}</b> loses access to every
              project in this organization. Their {SEAT_LABEL[removing?.seat ?? "viewer"]}{" "}
              seat is released back to the plan.
            </>
          )
        }
        confirmLabel={removing?.status === "pending" ? "Revoke invitation" : "Remove member"}
        onConfirm={() => {
          if (!removing) return;
          removeMember(removing.id);
          notify(
            removing.status === "pending"
              ? `Invitation to ${removing.email} revoked.`
              : `${removing.name} removed from the organization.`
          );
          setRemoving(null);
        }}
      />

      <ConfirmDialog
        open={seatBlock !== null}
        onOpenChange={(v) => !v && setSeatBlock(null)}
        tone="brand"
        title="No Full Access seats left"
        body={
          <>
            Your plan includes {seatLedger.fullTotal} Full Access seat
            {seatLedger.fullTotal === 1 ? "" : "s"} and all of them are taken. Add a seat
            to move <b className="text-content">{seatBlock?.name}</b> off Viewer.
          </>
        }
        confirmLabel="Add seats"
        onConfirm={() => {
          setSeatBlock(null);
          go("plans");
        }}
      />

      <InviteMembersDialog
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        title="Invite the rest of the Team Members"
        description="You can invite more people to your organization after finished registration."
        onConfirm={(invited) => {
          inviteMembers(invited.map((i) => ({ email: i.email, seat: i.seat })));
          notify(
            invited.length === 1
              ? `Invitation sent to ${invited[0].email}.`
              : `${invited.length} invitations sent.`
          );
        }}
      />
    </>
  );
}

/**
 * The row menu. The Owner's row is deliberately short: its seat can't be
 * reassigned and it can't be removed, so those items are absent rather than
 * present and disabled — a greyed row you can't act on is a question the screen
 * makes you ask twice.
 */
function menuFor(row: MemberRow): MenuItem[] {
  if (row.seat === "owner") {
    return [
      { id: "projects", label: "View project access", icon: "file" },
      { id: "copy", label: "Copy email address", icon: "copy" },
    ];
  }

  const items: MenuItem[] = [
    {
      id: "seat",
      label: "Change seat",
      icon: "shared",
      items: [
        { id: "seat-full", label: "Full Access", icon: "layout" },
        { id: "seat-viewer", label: "Viewer", icon: "visible" },
      ],
    },
    { id: "projects", label: "View project access", icon: "file" },
    { id: "copy", label: "Copy email address", icon: "copy" },
  ];

  if (row.status === "pending") {
    items.push({ id: "resend", label: "Resend invitation", icon: "send", separated: true });
  }

  items.push({
    id: "remove",
    label: row.status === "pending" ? "Revoke invitation" : "Remove from organization",
    icon: "trash",
    danger: true,
    separated: row.status !== "pending",
  });

  return items;
}

/** The seat, as the control that changes it. The Owner's is a plain label. */
function SeatCell({
  row,
  onOpen,
}: {
  row: MemberRow;
  onOpen: (e: React.MouseEvent) => void;
}) {
  const tones: Record<SeatKind, string> = {
    owner: "bg-accent-soft text-accent",
    full: "bg-brand-soft text-brand",
    viewer: "bg-warning-soft text-warning",
  };
  const icons: Record<SeatKind, "person" | "layout" | "visible"> = {
    owner: "person",
    full: "layout",
    viewer: "visible",
  };

  const face = (
    <>
      <span className={cn("grid h-8 w-8 shrink-0 place-items-center rounded-lg", tones[row.seat])}>
        <Icon name={icons[row.seat]} size={16} />
      </span>
      <span className="type-body text-content">{SEAT_LABEL[row.seat]}</span>
    </>
  );

  if (row.seat === "owner") {
    return <span className="flex items-center gap-2">{face}</span>;
  }

  return (
    <button
      type="button"
      aria-haspopup="menu"
      aria-label={`Change ${row.name}'s seat — currently ${SEAT_LABEL[row.seat]}`}
      onClick={onOpen}
      className="-mx-1.5 flex items-center gap-2 rounded-lg px-1.5 py-1 transition-colors hover:bg-glass/10"
    >
      {face}
      <Icon name="chevron-right" size={15} className="shrink-0 text-content-subtle" />
    </button>
  );
}

/** A count with its own colour, so four of them in a row stay tellable apart. */
function Counter({
  icon,
  tone,
  value,
  label,
}: {
  icon: "person" | "layout" | "visible";
  tone: "info" | "brand" | "warning" | "success";
  value: number;
  label: string;
}) {
  const tones = {
    info: "bg-accent-soft text-accent",
    brand: "bg-brand-soft text-brand",
    warning: "bg-warning-soft text-warning",
    success: "bg-success-soft text-success",
  };
  return (
    <span className="flex items-center gap-1.5" title={label}>
      <span className={`grid h-8 w-8 place-items-center rounded-lg ${tones[tone]}`}>
        <Icon name={icon} size={16} />
      </span>
      <span className="type-numeric grid h-8 min-w-8 place-items-center rounded-lg border border-glass/10 px-2 text-content">
        {value}
      </span>
    </span>
  );
}
