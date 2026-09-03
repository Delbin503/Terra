import { useMemo, useState } from "react";
import { Icon } from "@/components/icons";
import { Button, DataTable, Select, Tabs, type Column } from "@/components/ui";
import { DateField, PageTitle, Panel, SearchField } from "./settings-parts";
import { SeatRow } from "./OrgDashboardPage";
import { seats } from "./settings-data";
import { useSettings } from "./settings-store";
import { money, planSpec } from "./subscription-data";
import { InvoiceDrawer, StatusChip } from "./InvoiceDrawer";
import { InvoiceFilterDrawer } from "./InvoiceFilterDrawer";
import {
  INVOICE_SORTERS,
  INVOICE_SORTS,
  INVOICE_STATUS,
  INVOICE_TYPE,
  NO_FILTER,
  filterCount,
  invoiceDate,
  invoiceMatches,
  invoiceTotal,
  type Invoice,
  type InvoiceFilter,
  type InvoiceSort,
} from "./invoice-data";

/**
 * BILLING — the seats you're paying for, and the paperwork for them.
 *
 * Overview answers "what am I being charged for" at a glance; Invoices is the
 * record. Seats appear here as well as on the org Dashboard because they are the
 * thing being billed — the same three numbers, read with money in mind.
 *
 * BOTH TABS NOW OPEN AN INVOICE. They used to be able to list one and nothing
 * more: the Invoices tab printed four strings per row and the overview panel
 * printed two of them, so the record stopped exactly where the question starts —
 * "what am I being charged $23.99 FOR?". The answer is a drawer (see
 * InvoiceDrawer) and every row on both tabs is a way into it, which is why the
 * overview cards carry the same chevron the table's Action column does.
 */

type Tab = "overview" | "invoices";

export function BillingPage() {
  const [tab, setTab] = useState<Tab>("overview");
  /**
   * THE OPEN INVOICE LIVES HERE, above the tabs.
   *
   * Both tabs open the same drawer, and a drawer owned by the tab that opened it
   * would close the moment the tab switched underneath it — which is exactly
   * what the overview's "View" does on its way to the history.
   */
  const [open, setOpen] = useState<Invoice | null>(null);

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
        <OverviewTab onSeeInvoices={() => setTab("invoices")} onOpen={setOpen} />
      ) : (
        <InvoicesTab onOpen={setOpen} />
      )}

      <InvoiceDrawer invoice={open} onClose={() => setOpen(null)} />
    </>
  );
}

/* ----------------------------------------------------------------- overview */

function OverviewTab({
  onSeeInvoices,
  onOpen,
}: {
  onSeeInvoices: () => void;
  onOpen: (inv: Invoice) => void;
}) {
  const { go, invoices, subscription } = useSettings();

  return (
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
            <Button variant="brand" size="sm" className="ml-auto" onClick={onSeeInvoices}>
              View
            </Button>
          </div>
          {invoices.length ? (
            /* THE TOP THREE, not the whole year. What an admin opens this panel
               for is the charge that hasn't happened yet and the one that went
               wrong, both of which are at the top of a list dated newest-first;
               a fifth paid renewal underneath them is the tab next door's job. */
            <div className="flex flex-col gap-3 p-5">
              {invoices.slice(0, 3).map((inv) => (
                <InvoiceCard key={inv.id} invoice={inv} onOpen={() => onOpen(inv)} />
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
  );
}

/**
 * One invoice as a card — the overview's row.
 *
 * It states the KIND, the state and the date, and deliberately not the total:
 * this panel is a shortlist you scan for the one you want to open, and a column
 * of money on a card that is already the width of the panel invites you to add
 * up figures that aren't a set.
 */
function InvoiceCard({ invoice, onOpen }: { invoice: Invoice; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      data-ui="invoice-card"
      className="flex w-full items-center gap-3 rounded-xl border border-glass/12 bg-glass/8 p-3 text-left transition-colors hover:border-brand/50 hover:bg-glass/15"
    >
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-2">
          <span className="type-body-strong text-content">{INVOICE_TYPE[invoice.kind]}</span>
          <StatusChip status={invoice.status} />
        </span>
        <span className="type-body-dense mt-1 block text-content-muted">
          Invoice date{" "}
          <span className="type-body-dense font-medium text-content">
            {invoiceDate(invoice.at)}
          </span>
        </span>
      </span>
      <Icon name="chevron-right" size={18} className="shrink-0 text-content-subtle" />
    </button>
  );
}

/* ----------------------------------------------------------------- invoices */

function InvoicesTab({ onOpen }: { onOpen: (inv: Invoice) => void }) {
  const { invoices } = useSettings();
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<InvoiceSort>("default");
  const [filter, setFilter] = useState<InvoiceFilter>(NO_FILTER);
  const [filtering, setFiltering] = useState(false);

  /**
   * SEARCH, THEN FILTER, THEN SORT — in that order, and all three at once.
   *
   * The search reads the type, the invoice number and the total as WRITTEN,
   * because those are the three things a person has in front of them when they
   * come looking: a line on a bank statement, a reference from an email, or a
   * figure they are trying to account for.
   */
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const found = invoices.filter((inv) => {
      if (!invoiceMatches(inv, filter)) return false;
      if (!q) return true;
      return [
        INVOICE_TYPE[inv.kind],
        INVOICE_STATUS[inv.status],
        inv.number ?? "",
        invoiceDate(inv.at),
        money(invoiceTotal(inv)),
      ]
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
    return sort === "default" ? found : [...found].sort(INVOICE_SORTERS[sort]);
  }, [invoices, query, filter, sort]);

  const columns: Column<Invoice>[] = [
    {
      key: "due",
      label: "Due Date",
      sortValue: (r) => r.at,
      render: (r) => <span className="whitespace-nowrap">{invoiceDate(r.at)}</span>,
    },
    {
      key: "type",
      label: "Invoice Type",
      sortValue: (r) => INVOICE_TYPE[r.kind],
      render: (r) => INVOICE_TYPE[r.kind],
    },
    {
      key: "status",
      label: "Status",
      sortValue: (r) => INVOICE_STATUS[r.status],
      render: (r) => <StatusChip status={r.status} />,
    },
    {
      key: "total",
      label: "Invoice Total",
      sortValue: (r) => invoiceTotal(r),
      render: (r) =>
        /* An upcoming invoice has a projected subtotal, not a total — the tax is
           taken when the charge is. A dash says that; a figure would be a
           promise about an amount the charge might not match. */
        r.status === "upcoming" ? (
          <span className="text-content-subtle">—</span>
        ) : (
          <span className="type-numeric-sm text-content">{money(invoiceTotal(r))}</span>
        ),
    },
    {
      key: "actions",
      label: "Action",
      align: "right",
      render: () => (
        <span className="inline-grid h-8 w-8 place-items-center rounded-lg border border-glass/10 text-content-muted">
          <Icon name="chevron-right" size={16} />
        </span>
      ),
    },
  ];

  const picked = filterCount(filter);

  return (
    <>
      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-lg font-semibold">Invoice History</h2>
        <div className="flex flex-wrap items-center gap-2.5">
          <SearchField
            value={query}
            onChange={setQuery}
            placeholder="Search"
            className="w-[16rem]"
          />
          <Select
            aria-label="Sort invoices"
            value={sort}
            onChange={(v) => setSort(v as InvoiceSort)}
            options={INVOICE_SORTS}
            className="h-9"
          />
          {/* The count is ON the control, not only inside the drawer: a filtered
              table that looks like an unfiltered short one is how people conclude
              their invoices have gone missing. */}
          <button
            type="button"
            data-ui="invoice-filter"
            onClick={() => setFiltering(true)}
            className="field-well flex h-9 items-center gap-2 rounded-lg px-3 text-content-muted transition-colors hover:text-content"
          >
            <Icon name="filter" size={16} />
            <span className="type-body">Filter</span>
            {picked > 0 && (
              <span className="type-caption-strong grid h-5 min-w-5 place-items-center rounded-full bg-brand px-1 text-brand-foreground">
                {picked}
              </span>
            )}
          </button>
          <DateField label="Select date" />
        </div>
      </div>

      <div className="mt-4">
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(r) => r.id}
          pageSize={7}
          onRowClick={onOpen}
          empty={
            query || picked
              ? "No invoices match this search"
              : "No invoices found"
          }
        />
      </div>

      {filtering && (
        <InvoiceFilterDrawer
          filter={filter}
          onApply={setFilter}
          onClose={() => setFiltering(false)}
        />
      )}
    </>
  );
}
