import { useMemo, useState } from "react";
import { Icon, type IconName } from "@/components/icons";
import {
  Avatar,
  Button,
  DataTable,
  Select,
  Tabs,
  type Column,
} from "@/components/ui";
import { DateField, PageTitle, Panel, SearchField } from "./settings-parts";
import { useSettings } from "./settings-store";
import { TopUpDialog } from "./TopUpDialog";
import {
  RANGE_LABEL,
  bucket,
  byMemberTotals,
  daysIn,
  duration,
  seedUsage,
  totalsOf,
  usd,
  type CreditEntry,
  type UsageBucket,
  type UsageRange,
} from "./credits-data";

/**
 * TERRA BALANCE — what you have, and what you have made with it.
 *
 * TWO TABS, NOT THREE. There used to be a Subscription Balance tab holding a
 * monthly Img/video allowance beside a credit balance, which meant the page
 * answered "can I afford this?" twice and in two currencies. A run is priced in
 * credits, so credits are the balance; the plan decides what the org can do,
 * and that belongs on Plans where it is bought. Everything quota is gone.
 *
 * What is left is a possession and a record: Credits is the balance and the way
 * to add to it, Usage History is what came out the other end.
 */

type Tab = "credits" | "usage";

export function TerraBalancePage() {
  const [tab, setTab] = useState<Tab>("credits");

  return (
    <>
      <PageTitle>Terra Balance</PageTitle>

      <Tabs
        ariaLabel="Balance sections"
        className="mt-5"
        value={tab}
        onChange={setTab}
        tabs={[
          { id: "credits", label: "Credits" },
          { id: "usage", label: "Usage History" },
        ]}
      />

      {tab === "credits" ? <CreditsTab /> : <UsageTab />}
    </>
  );
}

/* ------------------------------------------------------------------ credits */

function CreditsTab() {
  const { creditBalance, creditLog } = useSettings();
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("default");
  const [topUp, setTopUp] = useState(false);

  /**
   * PURCHASES ONLY.
   *
   * The table used to list the whole ledger — top-ups and every dataset run
   * together — under headings ("Description", "Charged", "Credits") that only
   * half of the rows could fill in: a run has no invoice, a purchase has no
   * project. What came OUT of the balance is a different question with its own
   * tab next door, so this one is the record of putting money in, and every
   * column has something in it on every row.
   */
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const bought = creditLog.filter((e) => e.kind === "purchase");
    const found = q
      ? bought.filter(
          (e) => e.detail.toLowerCase().includes(q) || e.id.toLowerCase().includes(q)
        )
      : bought;
    return [...found].sort(SORTS[sort]);
  }, [creditLog, query, sort]);

  const columns: Column<CreditEntry>[] = [
    {
      key: "id",
      label: "Reference ID",
      sortValue: (r) => r.id,
      render: (r) => <span className="type-numeric-sm text-content">{r.id}</span>,
    },
    {
      /* Date over time, one cell. A top-up is identified by the day it happened
         and disambiguated by the clock when two land on the same one. */
      key: "date",
      label: "Date",
      sortValue: (r) => r.at,
      render: (r) => (
        <span className="whitespace-nowrap">
          <span className="type-body block text-content">
            {new Date(r.at).toLocaleDateString(undefined, {
              day: "numeric",
              month: "short",
              year: "numeric",
            })}
          </span>
          <span className="type-caption text-content-subtle">
            {new Date(r.at).toLocaleTimeString(undefined, {
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
              hour12: false,
            })}
          </span>
        </span>
      ),
    },
    {
      /* TYPED LIKE THE WORK ORDERS PANEL, which is the other table in this
         product that lists one row per thing that cost money: an invoice total
         is a fact you read across a row, so it takes the body size the run's
         project and dataset type take there — not the 11px reserved for the
         figures you scan DOWN. */
      key: "usd",
      label: "Invoice Total",
      sortValue: (r) => r.usd ?? 0,
      render: (r) => (
        <span className="type-body tabular-nums text-content">{r.usd ? usd(r.usd) : "—"}</span>
      ),
    },
    {
      /* And this is that column: the same numeric-sm figure with the same
         credit mark beside it that the Work Orders "Credits" column uses, so a
         credit amount looks the same wherever the product prints one. */
      key: "credits",
      label: "Top Up Amount (Credits)",
      sortValue: (r) => r.credits,
      render: (r) => (
        <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
          <Icon name="credits" size={13} className="shrink-0 text-brand" />
          <span className="type-numeric-sm text-content">
            {r.credits.toLocaleString()}
          </span>
        </span>
      ),
    },
  ];

  return (
    <>
      <BalanceCard balance={creditBalance} onTopUp={() => setTopUp(true)} />

      <div className="mt-8 flex flex-wrap items-center gap-3">
        <h2 className="font-display text-lg font-semibold">Terra Credits</h2>
        <div className="ml-auto flex flex-wrap items-center gap-2.5">
          <SearchField
            value={query}
            onChange={setQuery}
            placeholder="Search"
            className="w-[16rem]"
          />
          <Select
            prefix="Sort By:"
            aria-label="Sort top-ups"
            value={sort}
            onChange={(v) => setSort(v as SortKey)}
            options={SORT_OPTIONS}
          />
          <DateField label="Select date" />
        </div>
      </div>

      <div className="mt-4">
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(r) => r.id}
          pageSize={10}
          empty={query ? "No top-ups match that search." : "No top-ups yet."}
        />
      </div>

      <TopUpDialog open={topUp} onOpenChange={setTopUp} />
    </>
  );
}

/** How the history can be ordered, over and above the sortable headers. */
type SortKey = "default" | "oldest" | "largest" | "smallest";

const SORT_OPTIONS = [
  { value: "default", label: "Default" },
  { value: "oldest", label: "Oldest first" },
  { value: "largest", label: "Largest top-up" },
  { value: "smallest", label: "Smallest top-up" },
];

const SORTS: Record<SortKey, (a: CreditEntry, b: CreditEntry) => number> = {
  default: (a, b) => b.at - a.at,
  oldest: (a, b) => a.at - b.at,
  largest: (a, b) => b.credits - a.credits,
  smallest: (a, b) => a.credits - b.credits,
};

/**
 * THE BALANCE, AS THE ONE OBJECT ON THE PAGE.
 *
 * It was a third of the width with a four-pack buying grid beside it, so the
 * figure everything else on the page resolves to was the smaller half of a
 * two-panel row. Now it is the band across the top: the label, the number, and
 * the only action a balance has — add to it. Buying moved behind that button
 * (see `TopUpDialog`), which is also what stops the page opening on a price
 * list when the question is "how much have I got".
 */
function BalanceCard({ balance, onTopUp }: { balance: number; onTopUp: () => void }) {
  return (
    <Panel className="mt-6 overflow-hidden p-0">
      <div className="flex items-center gap-3 border-b border-glass/10 px-5 py-3.5">
        <h2 className="type-body-lg-strong text-content">Credits</h2>
        <Button variant="brand" size="md" className="ml-auto" onClick={onTopUp} data-ui="credits-top-up">
          <Icon name="create" size={16} />
          Top Up
        </Button>
      </div>

      <div className="relative">
        <Galaxy />

        <div className="relative flex flex-col gap-3 p-6">
          <div className="flex items-center gap-2.5">
            {/* The same mark the top bar, the rail and the Work Orders cost
                column set beside a credit figure — one glyph for one unit. */}
            <Icon name="credits" size={34} className="shrink-0 text-brand" />
            <p className="font-display text-lg font-semibold text-content">Terra Credits</p>
          </div>

          <p
            data-ui="terra-credit-balance"
            className="font-display text-4xl font-semibold tabular-nums text-content"
          >
            {balance.toLocaleString()}
            <span className="type-body-lg ml-2 font-normal text-content-muted">credits</span>
          </p>

          {/* WHICH CARD IS CHARGED IS NOT THIS CARD'S SUBJECT. It stated the
              brand, the last four and the expiry under a balance — three facts
              about a payment method on a panel about a number, with a Change
              link pointing at the page that owns them. Payment Details is that
              page, and it now lists every card with the primary marked. */}
          <p className="type-body max-w-[28rem] text-content-subtle">
            Spent on dataset generation. A run's price is shown before you dispatch it.
          </p>
        </div>
      </div>
    </Panel>
  );
}

/**
 * The ornament on the balance card — drawn, not an asset, so it recolours with
 * the theme and costs no request. Decorative and `aria-hidden`: it says nothing
 * the number beside it doesn't.
 */
function Galaxy() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 420 240"
      className="pointer-events-none absolute right-0 top-1/2 hidden h-[130%] -translate-y-1/2 sm:block"
      fill="none"
    >
      <defs>
        <radialGradient id="galaxy-core" cx="50%" cy="50%">
          <stop offset="0%" stopColor="#c9b6ff" stopOpacity="0.9" />
          <stop offset="45%" stopColor="#7b5cf0" stopOpacity="0.45" />
          <stop offset="100%" stopColor="#3b2a80" stopOpacity="0" />
        </radialGradient>
      </defs>

      <g stroke="#8fa5d8" strokeOpacity="0.22" strokeWidth="1">
        <ellipse cx="250" cy="120" rx="185" ry="96" transform="rotate(-18 250 120)" />
        <ellipse cx="250" cy="120" rx="140" ry="70" transform="rotate(-18 250 120)" />
      </g>

      <ellipse
        cx="268"
        cy="126"
        rx="86"
        ry="34"
        transform="rotate(-18 268 126)"
        fill="url(#galaxy-core)"
      />

      {[
        [96, 74],
        [148, 176],
        [214, 46],
        [330, 66],
        [372, 158],
        [286, 196],
        [190, 118],
      ].map(([cx, cy], i) => (
        <circle key={i} cx={cx} cy={cy} r={i % 3 === 0 ? 1.8 : 1.1} fill="#7fe4f5" opacity="0.7" />
      ))}
    </svg>
  );
}


/* -------------------------------------------------------------------- usage */

function UsageTab() {
  const [range, setRange] = useState<UsageRange>("30d");
  /* Seeded once per mount. Regenerating on every render would redraw the bars
     under the cursor — see `seedUsage`. */
  const all = useMemo(() => seedUsage(Date.now()), []);
  const days = useMemo(() => daysIn(all, range), [all, range]);
  const buckets = useMemo(() => bucket(days, range), [days, range]);
  const totals = useMemo(() => totalsOf(days), [days]);
  /** The point held open under the chart, if any. Cleared when the period
   *  changes, since the key it refers to may not exist in the new range. */
  const [pick, setPick] = useState<string | null>(null);
  const picked = buckets.find((b) => b.key === pick) ?? null;
  /** Who spent what across the whole period — the page's main subject now. */
  const perMember = useMemo(() => byMemberTotals(days), [days]);

  /**
   * One row per person per day. The table used to have one row per day with the
   * team's output summed into it, which is the number an admin already has at
   * the top of the page — what they cannot get anywhere else is whose spend it
   * was.
   */
  type MemberDayRow = {
    key: string;
    day: string;
    name: string;
    images: number;
    videoSeconds: number;
    credits: number;
  };

  const memberRows: MemberDayRow[] = useMemo(
    () =>
      [...buckets]
        .reverse()
        .flatMap((b) =>
          b.byMember
            .filter((m) => m.credits > 0)
            .map((m) => ({
              key: `${b.key}-${m.memberId}`,
              day: b.label,
              name: m.name,
              images: m.images,
              videoSeconds: m.videoSeconds,
              credits: m.credits,
            }))
        ),
    [buckets]
  );

  const columns: Column<MemberDayRow>[] = [
    {
      key: "day",
      label: range === "12m" ? "Month" : "Day",
      sortValue: (r) => r.key,
      render: (r) => <span className="type-body text-content">{r.day}</span>,
    },
    {
      key: "name",
      label: "Member",
      sortValue: (r) => r.name,
      render: (r) => (
        <span className="flex items-center gap-2.5">
          <Avatar name={r.name} size={26} />
          <span className="type-body truncate text-content">{r.name}</span>
        </span>
      ),
    },
    {
      key: "images",
      label: "Images generated",
      align: "right",
      sortValue: (r) => r.images,
      render: (r) => (
        <span className="type-numeric-sm text-content">{r.images.toLocaleString()}</span>
      ),
    },
    {
      key: "video",
      label: "Video generated",
      align: "right",
      sortValue: (r) => r.videoSeconds,
      render: (r) => (
        <span className="type-numeric-sm whitespace-nowrap text-content">
          {duration(r.videoSeconds)}
        </span>
      ),
    },
    {
      key: "credits",
      label: "Credits spent",
      align: "right",
      sortValue: (r) => r.credits,
      render: (r) => (
        <span className="type-numeric-sm text-content">{r.credits.toLocaleString()}</span>
      ),
    },
  ];

  return (
    <>
      <Panel className="mt-6 p-0">
        <div className="flex flex-wrap items-center gap-3 border-b border-glass/10 p-5">
          <h2 className="font-display text-lg font-semibold">Usage History</h2>
          {/* One filter, one row, above everything it filters. */}
          <Select
            prefix="Period:"
            aria-label="Period"
            className="ml-auto"
            value={range}
            onChange={(v) => {
              setRange(v as UsageRange);
              setPick(null);
            }}
            options={(Object.keys(RANGE_LABEL) as UsageRange[]).map((r) => ({
              value: r,
              label: RANGE_LABEL[r],
            }))}
          />
        </div>

        <div className="grid gap-4 p-5 sm:grid-cols-3">
          <StatTile icon="image-credits" label="Images generated" value={totals.images.toLocaleString()} note={RANGE_LABEL[range]} />
          <StatTile icon="video" label="Video generated" value={duration(totals.videoSeconds)} note={RANGE_LABEL[range]} />
          <StatTile icon="credits" label="Credits spent" value={totals.credits.toLocaleString()} note={RANGE_LABEL[range]} />
        </div>

        <div className="border-t border-glass/10 p-5">
          <CreditsLine buckets={buckets} selected={pick} onSelect={setPick} />

          {/* THE SECOND QUESTION, asked of one day. Images and video are what
              the credits bought, so they belong to a point on the line rather
              than to charts of their own — and a count and a duration have no
              shared y-axis anyway. */}
          {picked ? (
            <div className="mt-4 rounded-xl border border-brand/30 bg-brand/5 p-4">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className="type-body-strong text-content">{picked.label}</span>
                <span className="type-numeric text-content-muted">
                  {picked.images.toLocaleString()} images · {duration(picked.videoSeconds)} video ·{" "}
                  {picked.credits.toLocaleString()} credits
                </span>
                <button
                  type="button"
                  onClick={() => setPick(null)}
                  className="type-body-dense ml-auto text-content-subtle transition-colors hover:text-content"
                >
                  Clear
                </button>
              </div>

              <ul className="mt-3 flex flex-col gap-1.5">
                {picked.byMember
                  .filter((m) => m.credits > 0)
                  .map((m) => (
                    <li key={m.memberId} className="flex items-center gap-3">
                      <span className="type-body min-w-0 flex-1 truncate text-content">{m.name}</span>
                      <span className="type-numeric-sm text-content-subtle">
                        {m.images.toLocaleString()} img · {duration(m.videoSeconds)}
                      </span>
                      <span className="type-numeric w-16 text-right text-content">
                        {m.credits.toLocaleString()}
                      </span>
                    </li>
                  ))}
              </ul>
            </div>
          ) : (
            <p className="type-caption mt-3 text-center text-content-subtle">
              Select a point to see what was generated that day, and by whom.
            </p>
          )}
        </div>

      </Panel>

      {/* WHO SPENT IT, for the whole period. The question the page is asked most
          — "why is the balance going down" — is answered by a name, and this is
          the shortest path to one. */}
      <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-lg font-semibold">Credits by member</h2>
        <span className="type-body text-content-subtle">{RANGE_LABEL[range]}</span>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {perMember.map((m) => {
          const share = totals.credits ? Math.round((m.credits / totals.credits) * 100) : 0;
          return (
            <div
              key={m.memberId}
              data-ui={`usage-member-${m.memberId}`}
              className="rounded-xl border border-glass/10 bg-glass/5 p-4"
            >
              <div className="flex items-center gap-2.5">
                <Avatar name={m.name} size={28} />
                <span className="type-body-strong min-w-0 flex-1 truncate text-content">
                  {m.name}
                </span>
              </div>
              <p className="font-display mt-3 text-2xl font-semibold tabular-nums text-content">
                {m.credits.toLocaleString()}
              </p>
              <p className="type-caption mt-0.5 text-content-subtle">
                {share}% of spend · {m.images.toLocaleString()} images · {duration(m.videoSeconds)}
              </p>
              {/* The share as a bar, so four cards can be compared without
                  reading four percentages. */}
              <div className="mt-3 h-1 overflow-hidden rounded-full bg-glass/10">
                <div className="h-full rounded-full bg-brand" style={{ width: `${share}%` }} />
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-lg font-semibold">Breakdown</h2>
        <span className="type-body text-content-subtle">{RANGE_LABEL[range]}</span>
      </div>
      <div className="mt-4">
        <DataTable
          columns={columns}
          rows={memberRows}
          rowKey={(r) => r.key}
          pageSize={10}
          empty="Nothing generated in this period."
        />
      </div>
    </>
  );
}

function StatTile({
  icon,
  label,
  value,
  note,
}: {
  icon: IconName;
  label: string;
  value: string;
  note: string;
}) {
  return (
    <div className="rounded-xl border border-glass/10 bg-glass/5 p-4">
      <div className="flex items-center gap-2.5">
        <span className="grid h-8 w-8 place-items-center rounded-md bg-brand-soft text-brand">
          <Icon name={icon} size={17} />
        </span>
        <p className="type-body text-content-muted">{label}</p>
      </div>
      <p className="font-display mt-3 text-2xl font-semibold tabular-nums text-content">{value}</p>
      <p className="type-caption mt-0.5 text-content-subtle">{note}</p>
    </div>
  );
}

/**
 * CREDITS PER DAY, as one line.
 *
 * This was two bar charts — images and video — side by side. Neither answered
 * the question the page exists for: credits are the currency, and the other two
 * are what the credits BOUGHT. A reader asking "are we spending more than last
 * week" had to convert two counts in their head.
 *
 * One series, so no legend — the caption names it. Clicking a point holds that
 * day open below, because the images/video split is a second question asked of
 * one day, not a permanent second axis. (A count and a duration share no y.)
 */
function CreditsLine({
  buckets,
  selected,
  onSelect,
}: {
  buckets: UsageBucket[];
  selected: string | null;
  onSelect: (key: string | null) => void;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const peak = Math.max(1, ...buckets.map((b) => b.credits));
  const n = buckets.length;

  // 0–100 viewBox with headroom, so the line never touches the top edge.
  const x = (i: number) => (n <= 1 ? 50 : (i / (n - 1)) * 100);
  const y = (v: number) => 100 - (v / peak) * 88;

  const line = buckets.map((b, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(b.credits)}`).join(" ");
  const area = `${line} L100,100 L0,100 Z`;

  const activeIndex =
    hover ?? (selected ? buckets.findIndex((b) => b.key === selected) : -1);
  const active = activeIndex >= 0 ? activeIndex : null;
  const shown = active != null ? buckets[active] : null;

  return (
    <figure>
      <figcaption className="flex items-baseline gap-2">
        <span className="type-body-strong text-content">Credits spent per day</span>
        <span className="type-caption ml-auto tabular-nums text-content-subtle">
          {shown
            ? `${shown.label} · ${shown.credits.toLocaleString()} credits`
            : `peak ${peak.toLocaleString()}`}
        </span>
      </figcaption>

      <div
        className="relative mt-4 h-44"
        onPointerLeave={() => setHover(null)}
        role="img"
        aria-label="Credits spent per day over the selected period"
      >
        <svg
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          className="h-full w-full overflow-visible"
        >
          <defs>
            <linearGradient id="credits-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="hsl(var(--brand))" stopOpacity="0.28" />
              <stop offset="1" stopColor="hsl(var(--brand))" stopOpacity="0" />
            </linearGradient>
          </defs>

          {/* Recessive grid — rules with no numbers on them; the caption carries
              the value, so the plot itself stays quiet. */}
          {[0, 1, 2, 3].map((g) => (
            <line
              key={g}
              x1="0"
              x2="100"
              y1={12 + g * 22}
              y2={12 + g * 22}
              stroke="hsl(var(--glass-tint) / 0.08)"
              strokeWidth="1"
              vectorEffect="non-scaling-stroke"
            />
          ))}

          <path d={area} fill="url(#credits-fill)" />
          <path
            d={line}
            fill="none"
            stroke="hsl(var(--brand))"
            strokeWidth="2"
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />

          {shown && active != null && (
            <line
              x1={x(active)}
              x2={x(active)}
              y1="0"
              y2="100"
              stroke="hsl(var(--brand) / 0.5)"
              strokeWidth="1"
              strokeDasharray="3 3"
              vectorEffect="non-scaling-stroke"
            />
          )}
        </svg>

        {/* Hit targets are full-height columns, not the 2px line — a point you
            have to land on is a point nobody hits. */}
        <div className="absolute inset-0 flex">
          {buckets.map((b, i) => (
            <button
              key={b.key}
              type="button"
              aria-label={`${b.label}: ${b.credits.toLocaleString()} credits`}
              aria-pressed={selected === b.key}
              data-ui={`credits-point-${b.key}`}
              onPointerEnter={() => setHover(i)}
              onFocus={() => setHover(i)}
              onClick={() => onSelect(selected === b.key ? null : b.key)}
              className="h-full flex-1 cursor-pointer rounded-sm outline-none focus-visible:bg-glass/10"
            />
          ))}
        </div>

        {/* Above the hit layer, and pointer-events-none so it can't swallow it. */}
        {shown && active != null && (
          <span
            aria-hidden
            className="pointer-events-none absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand ring-2 ring-canvas"
            style={{ left: `${x(active)}%`, top: `${y(shown.credits)}%` }}
          />
        )}
      </div>

      <div className="type-caption mt-2 flex justify-between text-content-subtle">
        <span>{buckets[0]?.label}</span>
        <span>{buckets[buckets.length - 1]?.label}</span>
      </div>
    </figure>
  );
}
