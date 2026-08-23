import { useState } from "react";
import { Icon } from "@/components/icons";
import { Button, DataTable, Select, Tabs, type Column } from "@/components/ui";
import {
  DateField,
  PageTitle,
  Panel,
  QuotaCell,
  SearchField,
} from "./settings-parts";
import { quota } from "./settings-data";
import { useSettings } from "./settings-store";

/**
 * TERRA BALANCE — what the plan gives you, what you bought on top, and what you
 * spent.
 *
 * Three tabs because they are three different questions with three different
 * time bases: an allowance resets, credits accumulate, usage accrues. Merging
 * them into one page of numbers is how you end up unable to say which is which.
 */

type Tab = "subscription" | "credits" | "usage";
type CreditTab = "credits" | "quota";

interface Empty {
  id: string;
}

export function TerraBalancePage() {
  const [tab, setTab] = useState<Tab>("subscription");

  return (
    <>
      <PageTitle>Terra Balance</PageTitle>

      <Tabs
        ariaLabel="Balance sections"
        className="mt-5"
        value={tab}
        onChange={setTab}
        tabs={[
          { id: "subscription", label: "Subscription Balance" },
          { id: "credits", label: "Credits" },
          { id: "usage", label: "Usage History" },
        ]}
      />

      {tab === "subscription" && <SubscriptionTab />}
      {tab === "credits" && <CreditsTab />}
      {tab === "usage" && <UsageTab />}
    </>
  );
}

function SubscriptionTab() {
  const { org, go, subscription } = useSettings();
  const columns: Column<Empty>[] = [
    { key: "plan", label: "Plan Type", sortValue: (r) => r.id, render: () => null },
    { key: "date", label: "Subscribed Date", sortValue: (r) => r.id, render: () => null },
    { key: "quota", label: "Monthly Quota", render: () => null },
    { key: "balance", label: "Current Balance", render: () => null },
    { key: "expires", label: "Expires On", sortValue: (r) => r.id, render: () => null },
  ];

  return (
    <>
      <Panel className="mt-6 p-0">
        <div className="flex flex-wrap items-center gap-3 border-b border-glass/10 p-5">
          <h2 className="font-display text-lg font-semibold">Subscription Balance</h2>
          <div className="ml-auto flex flex-wrap items-center gap-3">
            <span className="type-body rounded-lg border border-glass/10 bg-surface px-3 py-2 text-content-muted">
              You're currently on the {org.plan}.{" "}
              <button
                type="button"
                onClick={() => go("plans")}
                className="text-brand transition-colors hover:text-brand-hover"
              >
                View Plans
              </button>
            </span>
            <span className="type-body-strong text-warning">
              {subscription.renewsOn ? "Renews On" : "Expires On"} :{" "}
              {subscription.renewsOn ?? quota.planExpires}
            </span>
          </div>
        </div>
        <div className="flex flex-col divide-y divide-line/10 sm:flex-row sm:divide-x sm:divide-y-0">
          <QuotaCell
            icon="image-credits"
            label="Img Generation Quota"
            used={quota.images.used}
            total={quota.images.total}
          />
          <QuotaCell
            icon="video"
            label="Video Generation Quota"
            used={quota.videos.used}
            total={quota.videos.total}
            unit="s"
          />
        </div>
      </Panel>

      <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-lg font-semibold">Subscription History</h2>
        <div className="flex flex-wrap items-center gap-2.5">
          <SearchField value="" onChange={() => {}} placeholder="Search by plan" className="w-[16rem]" />
          <DateField label="Pick a date range" />
        </div>
      </div>
      <div className="mt-4">
        <DataTable
          columns={columns}
          rows={[]}
          rowKey={(r) => r.id}
          empty="No subscriptions found"
        />
      </div>
    </>
  );
}

function CreditsTab() {
  const { go } = useSettings();
  const [sub, setSub] = useState<CreditTab>("credits");

  const columns: Column<Empty>[] = [
    { key: "ref", label: "Reference ID", render: () => null },
    { key: "date", label: "Date", sortValue: (r) => r.id, render: () => null },
    { key: "total", label: "Invoice Total", sortValue: (r) => r.id, render: () => null },
    { key: "topup", label: "Top Up Amount (Credits)", sortValue: (r) => r.id, render: () => null },
  ];

  return (
    <>
      <Panel className="mt-6 p-0">
        <div className="flex items-center gap-3 border-b border-glass/10 p-5">
          <h2 className="font-display text-lg font-semibold">Credits</h2>
          <Button variant="brand" size="sm" className="ml-auto" onClick={() => go("payment")}>
            <Icon name="create" size={15} />
            Top Up
          </Button>
        </div>
        <div className="flex flex-col divide-y divide-line/10 sm:flex-row sm:divide-x sm:divide-y-0">
          <QuotaCellSingle icon="credits" label="Terra Credits" value={`$ ${quota.credits}`} />
          <QuotaCellSingle icon="image-credits" label="Img Generation Quota" value={`${quota.videos.total} Img`} />
          <QuotaCellSingle icon="video" label="Video Generation Quota" value={`${quota.videos.total} Sec`} />
        </div>
      </Panel>

      <div className="mt-6 flex gap-1 rounded-lg bg-surface p-1 w-fit">
        {(
          [
            { id: "credits", label: "Terra Credits" },
            { id: "quota", label: "Quota" },
          ] as const
        ).map((t) => (
          <button
            key={t.id}
            type="button"
            aria-pressed={sub === t.id}
            onClick={() => setSub(t.id)}
            className={`type-button-sm rounded-md px-4 py-1.5 transition-colors ${
              sub === t.id
                ? "bg-surface-raised text-content"
                : "text-content-muted hover:text-content"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-lg font-semibold">
          {sub === "credits" ? "Terra Credits" : "Quota"}
        </h2>
        <div className="flex flex-wrap items-center gap-2.5">
          <SearchField value="" onChange={() => {}} placeholder="Search by ID" className="w-[16rem]" />
          <DateField label="Pick a date range" />
        </div>
      </div>
      <div className="mt-4">
        <DataTable
          columns={columns}
          rows={[]}
          rowKey={(r) => r.id}
          empty="No transactions found"
        />
      </div>
    </>
  );
}

function UsageTab() {
  const [range, setRange] = useState("month");

  const columns: Column<Empty>[] = [
    { key: "name", label: "Name", sortValue: (r) => r.id, render: () => null },
    { key: "seats", label: "Seats", render: () => null },
    { key: "checked", label: "Last Checked On", sortValue: (r) => r.id, render: () => null },
    { key: "img", label: "Image Generation (Usage)", sortValue: (r) => r.id, render: () => null },
    { key: "vid", label: "Video Generation (Usage)", sortValue: (r) => r.id, render: () => null },
  ];

  return (
    <>
      <Panel className="mt-6 p-0">
        <div className="flex flex-wrap items-center gap-3 border-b border-glass/10 p-5">
          <h2 className="font-display text-lg font-semibold">Usage History</h2>
          <div className="ml-auto flex flex-wrap items-center gap-2.5">
            <Select
              prefix="Sort By:"
              aria-label="Period"
              value={range}
              onChange={(e) => setRange(e.target.value)}
              options={[
                { value: "month", label: "This month" },
                { value: "week", label: "This week" },
                { value: "year", label: "This year" },
              ]}
            />
            <DateField label="Pick a date range" />
          </div>
        </div>

        <div className="grid gap-5 p-5 lg:grid-cols-[minmax(0,20rem)_1fr]">
          <div className="rounded-xl border border-glass/10">
            <p className="type-body-strong border-b border-glass/10 p-4">Total Usage</p>
            <div className="grid grid-cols-2 divide-x divide-line/10">
              <UsageCell icon="image-credits" label="Image Generation Quota" value={`${quota.videos.total} Img`} />
              <UsageCell icon="video" label="Video Generation Quota" value={`${quota.videos.total} Sec`} />
            </div>
          </div>
          <div className="grid min-h-[16rem] place-items-center rounded-xl border border-glass/10 p-4">
            <div className="text-center">
              <p className="type-body-strong mb-2 text-content">Quota Usage Overview</p>
              <p className="type-body text-content-subtle">
                No data available for the selected period
              </p>
            </div>
          </div>
        </div>
      </Panel>

      <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-lg font-semibold">Members Usage</h2>
        <div className="flex flex-wrap items-center gap-2.5">
          <SearchField value="" onChange={() => {}} placeholder="Search by member name" className="w-[18rem]" />
          <DateField label="Pick a date range" />
        </div>
      </div>
      <div className="mt-4">
        <DataTable
          columns={columns}
          rows={[]}
          rowKey={(r) => r.id}
          empty="No transactions found"
        />
      </div>
    </>
  );
}

/** One figure with a glyph — the Credits row and the Total Usage cells. */
function QuotaCellSingle({
  icon,
  label,
  value,
}: {
  icon: "credits" | "image-credits" | "video";
  label: string;
  value: string;
}) {
  return (
    <div className="flex-1 p-5">
      <div className="flex items-center gap-2.5">
        <span className="grid h-8 w-8 place-items-center rounded-md bg-brand-soft text-brand">
          <Icon name={icon} size={17} />
        </span>
        <p className="type-body-strong text-content">{label}</p>
      </div>
      <p className="mt-3 font-display text-lg font-semibold text-content">{value}</p>
    </div>
  );
}

function UsageCell({
  icon,
  label,
  value,
}: {
  icon: "image-credits" | "video";
  label: string;
  value: string;
}) {
  return (
    <div className="p-4">
      <span className="grid h-8 w-8 place-items-center rounded-md bg-brand-soft text-brand">
        <Icon name={icon} size={17} />
      </span>
      <p className="type-body mt-3 text-content">{label}</p>
      <p className="type-body mt-3 text-content-muted">Usage:</p>
      <p className="font-display text-lg font-semibold text-content">{value}</p>
    </div>
  );
}
