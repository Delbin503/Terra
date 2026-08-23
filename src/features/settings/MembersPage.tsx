import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/icons";
import { Avatar, Button, DataTable, Select, type Column } from "@/components/ui";
import { Chip, PageTitle, SearchField } from "./settings-parts";
import { MemberDrawer } from "./MemberDrawer";
import { SEAT_INCLUDES, SEAT_LABEL, type MemberRow, type SeatKind } from "./settings-data";
import { useSettings } from "./settings-store";
import { InviteMembersDialog } from "./InviteMembersDialog";
import { EXTRA_SEAT_PRICE, money } from "./subscription-data";

/**
 * MEMBERS — one org's people, and what each of them can do.
 *
 * `Includes` spells out the seat in a sentence rather than leaving "Owner" to be
 * interpreted: the difference between an Owner and a Viewer is exactly the thing
 * an admin is trying to decide when they're on this screen.
 *
 * Every row is now live. The seat cell and the Action cell were both decorative
 * — a chevron drawn onto a span — which is the worst state for a settings table
 * to be in: it looks like the answer to "how do I change this" and isn't. Both
 * now open the Manage drawer, because "change the seat" and "manage this
 * person" are the same question asked from two columns.
 *
 * The filters are Last Active and Seat Type rather than role. Role is already
 * legible in the row — the chip is right there next to the name — whereas "who
 * has gone quiet" and "who is costing me a paid seat" are the two questions you
 * can't answer by looking.
 */
export function MembersPage() {
  const { notify, members, seatLedger, inviteMembers, buySeats, account } = useSettings();

  const [inviteOpen, setInviteOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [seatType, setSeatType] = useState("all");
  const [active, setActive] = useState("all");
  /** the member whose Manage drawer is open */
  const [managing, setManaging] = useState<MemberRow | null>(null);

  const rows = useMemo(
    () =>
      members.filter((m) => {
        const q = query.trim().toLowerCase();
        const matches =
          m.name.toLowerCase().includes(q) || m.email.toLowerCase().includes(q);
        const seatOk = seatType === "all" || m.seat === seatType;
        // "Pending" is the only bucket that can be told apart without a real
        // activity feed behind it, so it's the only one offered.
        const activeOk =
          active === "all" ||
          (active === "pending" ? m.status === "pending" : m.status === "active");
        return matches && seatOk && activeOk;
      }),
    [members, query, seatType, active]
  );

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
                {r.email === account.email && (
                  <span className="ml-1 font-normal text-content-muted">(You)</span>
                )}
              </span>
              {/* Only the roles that CHANGE what someone can do are worth a
                  chip; "Editor" beside a seat that already says Full Access is
                  the same fact twice. */}
              {r.status === "active" && (r.role === "Owner" || r.role === "Admin") && (
                <Chip tone="neutral">{r.role}</Chip>
              )}
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
      render: (r) => <SeatCell row={r} onOpen={() => setManaging(r)} />,
    },
    {
      key: "projects",
      label: "Project Access",
      sortValue: (r) => r.projects,
      render: (r) => (
        <span className="type-body text-content">
          {/* A Full Access seat isn't scoped to a list of projects — it reaches
              all of them, and printing "0 projects" against one reads as a
              permissions bug rather than as the whole org. */}
          {r.seat === "viewer"
            ? `${r.projects} ${r.projects === 1 ? "project" : "projects"}`
            : "All"}
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
          {r.status === "pending" ? "-" : r.lastActive}
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
          onClick={() => setManaging(r)}
          className="inline-grid h-8 w-8 place-items-center rounded-lg border border-glass/10 text-content-muted transition-colors hover:border-brand hover:text-brand"
        >
          <Icon name="chevron-right" size={16} />
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

      <div className="mt-5 flex flex-wrap items-center gap-2.5">
        <SearchField
          value={query}
          onChange={setQuery}
          placeholder="Search members"
          className="w-[20rem]"
        />
        <Select
          prefix="Last Active:"
          aria-label="Filter by activity"
          value={active}
          onChange={(e) => setActive(e.target.value)}
          options={[
            { value: "all", label: "All" },
            { value: "joined", label: "Joined" },
            { value: "pending", label: "Pending" },
          ]}
        />
        <Select
          prefix="Seat Type:"
          aria-label="Filter by seat type"
          value={seatType}
          onChange={(e) => setSeatType(e.target.value)}
          options={[
            { value: "all", label: "All" },
            { value: "owner", label: "Owner" },
            { value: "full", label: "Full Access" },
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

      <MemberDrawer member={managing} onClose={() => setManaging(null)} />

      <InviteMembersDialog
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        title="Invite the rest of the Team Members"
        description="You can invite more people to your organization after finished registration."
        onConfirm={(invited) => {
          inviteMembers(invited.map((i) => ({ email: i.email, seat: i.seat })));
          // Inviting past the plan's Full Access seats buys the shortfall
          // rather than refusing the invite — same rule as a seat change.
          const wanted = invited.filter((i) => i.seat === "full").length;
          const short = Math.max(0, wanted - seatLedger.fullFree);
          if (short > 0) buySeats(short);
          notify(
            short > 0
              ? `${invited.length} invitation${invited.length === 1 ? "" : "s"} sent. ${short} Full Access seat${short === 1 ? "" : "s"} added at ${money(EXTRA_SEAT_PRICE)}/mo each, prorated on your next invoice.`
              : invited.length === 1
                ? `Invitation sent to ${invited[0].email}.`
                : `${invited.length} invitations sent.`
          );
        }}
      />
    </>
  );
}

/** The seat, as the way into the panel that changes it. The Owner's is flat. */
function SeatCell({ row, onOpen }: { row: MemberRow; onOpen: () => void }) {
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
