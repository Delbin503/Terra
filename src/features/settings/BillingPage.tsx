import { useState } from "react";
import { Icon } from "@/components/icons";
import { Button, DataTable, Tabs, type Column } from "@/components/ui";
import { DateField, PageTitle, Panel } from "./settings-parts";
import { SeatRow } from "./OrgDashboardPage";
import { seats } from "./settings-data";
import { useSettings, type Invoice } from "./settings-store";
import { planSpec } from "./subscription-data";

/**
 * BILLING — the seats you're paying for, and the paperwork for them.
 *
 * Overview answers "what am I being charged for" at a glance; Invoices is the
 * record. Seats appear here as well as on the org Dashboard because they are the
 * thing being billed — the same three numbers, read with money in mind.
 */

type Tab = "overview" | "invoices";

export function BillingPage() {
  const { go, invoices, subscription } = useSettings();
  const [tab, setTab] = useState<Tab>("overview");

  return (
    <>
      <PageTitle>Billing</PageTitle>

      <Tabs
        ariaLabel="Billing sections"
        className="mt-5"
        value={tab}
        onChange={setTab}
        tabs={[
          { id: "overview", label: "Overview" },
          { id: "invoices", label: "Invoices" },
        ]}
      />

      {tab === "overview" ? (
        <>
        {/* What's being billed, before the seats and the paperwork for it. */}
        <Panel className="mt-6 flex flex-wrap items-center gap-4">
          <div className="min-w-0 flex-1">
            <p className="type-body text-content-muted">Current plan</p>
            <p className="font-display text-lg font-semibold text-content">
              {planSpec(subscription.plan).name}
              <span className="type-body ml-2 font-normal text-content-subtle">
                {subscription.renewsOn
                  ? `${subscription.cycle === "annual" ? "Annual" : "Monthly"} · renews ${subscription.renewsOn}`
                  : "No billing cycle"}
              </span>
            </p>
          </div>
          <Button variant="brand" size="sm" onClick={() => go("plans")}>
            {subscription.plan === "pro" ? "Change Plan" : "Upgrade Plan"}
          </Button>
        </Panel>

        <div className="mt-5 grid gap-5 lg:grid-cols-2">
          <Panel className="flex min-h-[22rem] flex-col p-0">
            <div className="flex items-center gap-3 border-b border-glass/10 px-5 py-3.5">
              <h2 className="font-display text-lg font-semibold">Total Seats</h2>
              <span className="type-numeric grid h-6 min-w-6 place-items-center rounded-full bg-surface-raised px-1.5 text-content">
                {seats.assigned}
              </span>
              <Button variant="secondary" size="sm" className="ml-auto" onClick={() => go("members")}>
                Manage
              </Button>
            </div>
            <div className="flex flex-col gap-4 p-5">
              <SeatRow icon="shared" tone="brand" label="Assigned seats (Full Access)" value={seats.assigned} />
              <SeatRow icon="select-check" tone="success" label="Available seats (Full Access)" value={seats.available} />
              <SeatRow icon="visible" tone="warning" label="Viewer seats" value={seats.viewer} />
            </div>
          </Panel>

          <Panel className="flex min-h-[22rem] flex-col p-0">
            <div className="flex items-center gap-3 border-b border-glass/10 px-5 py-3.5">
              <h2 className="font-display text-lg font-semibold">Invoices</h2>
              <Button
                variant="brand"
                size="sm"
                className="ml-auto"
                onClick={() => setTab("invoices")}
              >
                View
              </Button>
            </div>
            {invoices.length ? (
              <div className="flex flex-1 flex-col gap-3 p-5">
                {invoices.slice(0, 3).map((inv) => (
                  <div key={inv.id} className="flex items-center gap-3">
                    <span className="min-w-0 flex-1">
                      <span className="type-body-strong block truncate text-content">
                        {inv.type}
                      </span>
                      <span className="type-caption text-content-subtle">{inv.due}</span>
                    </span>
                    <span className="type-body-strong tabular-nums">{inv.total}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="grid flex-1 place-items-center p-5">
                <p className="type-body text-content-subtle">No invoices found</p>
              </div>
            )}
          </Panel>
        </div>
        </>
      ) : (
        <InvoicesTab />
      )}
    </>
  );
}

function InvoicesTab() {
  const { invoices } = useSettings();
  const columns: Column<Invoice>[] = [
    { key: "due", label: "Due Date", sortValue: (r) => r.due, render: (r) => r.due },
    { key: "type", label: "Invoice Type", render: (r) => r.type },
    { key: "status", label: "Status", render: (r) => r.status },
    {
      key: "total",
      label: "Invoice Total",
      sortValue: (r) => r.total,
      render: (r) => r.total,
    },
    {
      key: "actions",
      label: "Actions",
      align: "right",
      render: () => (
        <span className="inline-grid h-8 w-8 place-items-center rounded-lg border border-glass/10 text-content-muted">
          <Icon name="download" size={16} />
        </span>
      ),
    },
  ];

  return (
    <>
      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-lg font-semibold">Invoices</h2>
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="flex h-9 items-center gap-2 rounded-lg border border-glass/10 bg-surface px-3 text-content-muted">
            <Icon name="filter" size={16} />
            <span className="type-body">Filter</span>
          </span>
          <DateField label="Pick a date range" />
        </div>
      </div>
      <div className="mt-4">
        <DataTable
          columns={columns}
          rows={invoices}
          rowKey={(r) => r.id}
          empty="No invoices found"
        />
      </div>
    </>
  );
}
