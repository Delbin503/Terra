import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/icons";
import { DataTable, Select, type Column } from "@/components/ui";
import { Chip, OrgMark, PageTitle, SearchField } from "./settings-parts";
import {
  myOrganizations,
  seats,
  SEAT_ICON,
  SEAT_LABEL,
  SEAT_TONE,
  type OrgRow,
} from "./settings-data";

/**
 * MY ORGANIZATIONS — every org this account belongs to, and its seat in each.
 *
 * The account's own view of membership, as opposed to the Members page which is
 * one org's view of its people. Which one you're signed into is marked on the
 * row rather than sorted to the top, so the list order stays stable.
 */
export function OrganizationsPage() {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState("all");
  const [seatType, setSeatType] = useState("all");

  const rows = useMemo(
    () =>
      myOrganizations.filter(
        (o) =>
          o.name.toLowerCase().includes(query.trim().toLowerCase()) &&
          (seatType === "all" || o.seat === seatType)
      ),
    [query, seatType]
  );

  const columns: Column<OrgRow>[] = [
    {
      key: "org",
      label: "Organization",
      sortValue: (r) => r.name,
      render: (r) => (
        <div className="flex items-center gap-2.5">
          <OrgMark initials={r.initials} size={34} />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="type-body-strong text-content">{r.name}</span>
              {r.current && <Chip tone="neutral">Currently Logged In</Chip>}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              <Chip tone="info">{r.plan}</Chip>
              <span className="type-caption text-content-subtle">
                {r.members} Members
              </span>
            </div>
          </div>
        </div>
      ),
    },
    {
      key: "seat",
      label: "Seats",
      sortValue: (r) => SEAT_LABEL[r.seat],
      /* The seat's own glyph and tone, from the shared map — this drew every
         row with the Owner's accent chip and person glyph, so an org you only
         view looked exactly like the one you own. */
      render: (r) => (
        <span className="flex items-center gap-2">
          <span className={cn("grid h-8 w-8 place-items-center rounded-lg", SEAT_TONE[r.seat])}>
            <Icon name={SEAT_ICON[r.seat]} size={16} />
          </span>
          <span className="type-body text-content">{SEAT_LABEL[r.seat]}</span>
        </span>
      ),
    },
    {
      key: "active",
      label: "Last Active On",
      render: (r) => <span className="type-body text-content">{r.lastActive}</span>,
    },
    {
      key: "joined",
      label: "Joined Date",
      sortValue: (r) => r.joined,
      render: (r) => <span className="type-body text-content-muted">{r.joined}</span>,
    },
  ];

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <PageTitle>My Organizations</PageTitle>
        <div className="flex flex-wrap items-center gap-2.5">
          <SearchField
            value={query}
            onChange={setQuery}
            placeholder="Search organizations"
            className="w-[16rem]"
          />
          <Select
            prefix="Last Active:"
            aria-label="Last active"
            value={active}
            onChange={setActive}
            options={[
              { value: "all", label: "All" },
              { value: "week", label: "This week" },
              { value: "month", label: "This month" },
            ]}
          />
          <Select
            prefix="Seat Type:"
            aria-label="Seat type"
            value={seatType}
            onChange={setSeatType}
            options={[
              { value: "all", label: "All" },
              { value: "owner", label: "Owner" },
              { value: "full", label: "Full Access" },
              { value: "viewer", label: "Viewer" },
            ]}
          />
        </div>
      </div>

      <div className="mt-5">
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(r) => r.id}
          pageSize={7}
          empty="No organizations match your filters"
        />
      </div>

      <p className="type-body-strong mt-4 text-right text-content">
        Current Total: {seats.assignedLabel}
      </p>
    </>
  );
}
