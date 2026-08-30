import { useMemo, useState } from "react";
import { Icon } from "@/components/icons";
import { Avatar, Button, DataTable, Select, type Column } from "@/components/ui";
import { Chip, DateField, PageTitle, SearchField, StatCard } from "./settings-parts";
import { activityLogs, logStats, type LogCategory, type LogRow } from "./settings-data";
import { useSettings } from "./settings-store";

/**
 * ACTIVITY LOGS — the audit trail.
 *
 * Two readings of the same rows: the description for a human, the action code
 * for anyone matching against it later, which is also why Export CSV is on this
 * page and nowhere else. Category is coloured because scanning a log is looking
 * for one kind of event among many.
 */

const CATEGORY_TONE: Record<LogCategory, "warning" | "success" | "info" | "brand"> = {
  Prj: "warning",
  Auth: "success",
  Org: "info",
  Bill: "brand",
};

export function ActivityLogsPage() {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [category, setCategory] = useState("all");

  const { notify } = useSettings();

  /**
   * Export what is ON SCREEN, not the whole log.
   *
   * If you've filtered to failed auth events, that filter IS the query you want
   * out — handing back all five hundred rows would mean redoing the work in a
   * spreadsheet. Fields are quoted and inner quotes doubled, per RFC 4180, so a
   * description containing a comma can't shift every later column.
   */
  const exportCsv = () => {
    const header = ["Date", "Time", "User", "Role", "Category", "Action", "Description", "Status"];
    const cell = (v: string | undefined) => `"${(v ?? "").replace(/"/g, '""')}"`;
    const csv = [
      header.join(","),
      ...rows.map((r) =>
        [r.date, r.time, r.name, r.role, r.category, r.code, r.description, r.status]
          .map(cell)
          .join(",")
      ),
    ].join("\r\n");

    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `terra-activity-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    notify(`Exported ${rows.length} ${rows.length === 1 ? "row" : "rows"} to CSV.`);
  };

  const rows = useMemo(
    () =>
      activityLogs.filter((l) => {
        const q = query.trim().toLowerCase();
        return (
          (l.name.toLowerCase().includes(q) ||
            l.code.toLowerCase().includes(q) ||
            l.description.toLowerCase().includes(q) ||
            l.category.toLowerCase().includes(q)) &&
          (status === "all" || l.status.toLowerCase() === status) &&
          (category === "all" || l.category === category)
        );
      }),
    [query, status, category]
  );

  const columns: Column<LogRow>[] = [
    {
      key: "time",
      label: "Timestamp",
      sortValue: (r) => `${r.date} ${r.time}`,
      render: (r) => (
        <div>
          <p className="type-body-strong tabular-nums text-content">{r.time}</p>
          <p className="type-caption text-content-subtle">{r.date}</p>
        </div>
      ),
    },
    {
      key: "name",
      label: "Name",
      sortValue: (r) => r.name,
      render: (r) => (
        <div className="flex items-center gap-2.5">
          <Avatar name={r.name} size={30} />
          <div>
            <p className="type-body text-content">{r.name}</p>
            {r.role && <p className="type-caption text-content-subtle">{r.role}</p>}
          </div>
        </div>
      ),
    },
    {
      key: "category",
      label: "Category",
      sortValue: (r) => r.category,
      render: (r) => <Chip tone={CATEGORY_TONE[r.category]}>{r.category}</Chip>,
    },
    {
      key: "code",
      label: "Action Code",
      sortValue: (r) => r.code,
      render: (r) => (
        <span className="type-code-sm rounded-md bg-surface-raised px-2 py-1 text-content-muted">
          {r.code}
        </span>
      ),
    },
    {
      key: "description",
      label: "Description",
      sortValue: (r) => r.description,
      render: (r) => <span className="type-body text-content-muted">{r.description}</span>,
    },
    {
      key: "status",
      label: "Status",
      sortValue: (r) => r.status,
      render: (r) => (
        <span className="type-body flex items-center gap-1.5">
          <span
            aria-hidden
            className={`h-1.5 w-1.5 rounded-full ${r.status === "Success" ? "bg-success" : "bg-danger"}`}
          />
          <span className={r.status === "Success" ? "text-success" : "text-danger"}>
            {r.status}
          </span>
        </span>
      ),
    },
  ];

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <PageTitle>Activity Logs</PageTitle>
        <Button variant="brand" size="sm" onClick={exportCsv}>
          <Icon name="export" size={15} />
          Export CSV
        </Button>
      </div>

      <div className="mt-5 grid gap-4 sm:grid-cols-3">
        <StatCard icon="file" label="Total Logs Today" value={logStats.today} />
        <StatCard icon="shared" label="Active Members" value={logStats.activeMembers} />
        <StatCard
          icon="warning"
          tone="warning"
          label="Failed Actions"
          value={logStats.failed}
          note="require attention"
        />
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-2.5">
        <SearchField
          value={query}
          onChange={setQuery}
          placeholder="Search user, action, category"
          className="w-[19rem]"
        />
        <Select
          prefix="Status:"
          aria-label="Status"
          value={status}
          onChange={setStatus}
          options={[
            { value: "all", label: "All" },
            { value: "success", label: "Success" },
            { value: "failed", label: "Failed" },
          ]}
        />
        <Select
          aria-label="Category"
          value={category}
          onChange={setCategory}
          options={[
            { value: "all", label: "All Categories" },
            { value: "Prj", label: "Project" },
            { value: "Auth", label: "Auth" },
            { value: "Org", label: "Organization" },
            { value: "Bill", label: "Billing" },
          ]}
          className="w-[12rem]"
        />
        <DateField label="Select date range" />
      </div>

      <div className="mt-4">
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(r) => r.id}
          empty="No activity matches those filters"
        />
      </div>
    </>
  );
}
