import { CREDIT_PACKS, priceOf } from "./credits-data";
import {
  EXTRA_SEAT_PRICE,
  TAX_RATE,
  money,
  planSpec,
  price,
  type BillingCycle,
  type PlanId,
} from "./subscription-data";

/**
 * INVOICES — the paperwork a charge leaves behind.
 * ------------------------------------------------------------------
 * An invoice used to be four strings (`due`, `type`, `status`, `total`), which
 * was enough to fill a table row and nothing else: the Invoices tab could list
 * them but not open one, so the record stopped exactly where the question
 * starts — "what am I being charged $23.99 FOR?"
 *
 * So an invoice carries its own body. Four kinds arrive at that body from two
 * directions: a subscription renewal is a list of SEATS, and a top-up or a data
 * purchase is a QUANTITY times a rate. Both reduce to the same shape — a title,
 * some headed groups of lines, a subtotal and a tax — which is why the drawer
 * that reads one doesn't branch per kind, and why a fifth kind wouldn't need it
 * to.
 *
 * EVERY FIGURE IS DERIVED, never typed twice. The lines are built from the same
 * `planSpec` / `EXTRA_SEAT_PRICE` / `TAX_RATE` / credit-pack constants the
 * checkout and the top-up dialog price against, and the total is the subtotal
 * plus the tax rather than a third number stored beside them. A receipt whose
 * parts don't add up to its total is the fastest way to make a billing screen
 * look broken, and a stored total is how that happens.
 */

/** Where a charge got to. `upcoming` has not been attempted yet. */
export type InvoiceStatus = "paid" | "failed" | "upcoming";

/** What was bought. The first two renew; the last three are one-off purchases. */
export type InvoiceKind = "monthly" | "annual" | "credits" | "img" | "video";

/** One line of a receipt: what it was, the rate under it, and the figure. */
export interface InvoiceLine {
  label: string;
  /** the rate or quantity the figure comes from — "$4.99/ month × 2" */
  note?: string;
  /** rendered as written: "Free", "$12.99/ mo", "5,500 Credits" */
  value: string;
  /** a figure that is not a charge, so it doesn't read as one */
  muted?: boolean;
}

/** A run of lines under an optional sub-heading — "Additional Seats:". */
export interface InvoiceGroup {
  heading?: string;
  rows: InvoiceLine[];
}

export interface Invoice {
  id: string;
  /**
   * The number on the document. NULL until one is issued — an upcoming invoice
   * has a date and a projection but no paperwork yet, and the drawer says so
   * rather than inventing a reference for something that hasn't been billed.
   */
  number: string | null;
  kind: InvoiceKind;
  status: InvoiceStatus;
  /** ms since epoch: the day it falls due, which for a paid one is the day it
   *  was taken. One date, because a receipt only ever shows one. */
  at: number;
  /** the account reference it is issued against */
  account: string;
  /** brand and last four — never a card number. Null when no card was charged. */
  method: string | null;
  /** what the body is about: "Renewing Seats", or "Payment Summary" */
  bodyTitle: string;
  body: InvoiceGroup[];
  subtotal: number;
  tax: number;
  /** the rate the tax was taken at, for the note under it */
  taxRate: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Subtotal plus tax. Never stored — see the note at the top of this file. */
export const invoiceTotal = (inv: Invoice) => round2(inv.subtotal + inv.tax);

/**
 * What the table and the drawer title call each kind.
 *
 * The purchases say "Purchase" and the renewals say "Invoice" because that is
 * the difference a reader is scanning the column for: one of these is a thing
 * you decided to buy on a particular day, the other happened on its own.
 */
export const INVOICE_TYPE: Record<InvoiceKind, string> = {
  monthly: "Monthly Invoice",
  annual: "Annual Invoice",
  credits: "Credit Top Up",
  img: "Purchase Img Data Output",
  video: "Purchase Video Data Output",
};

export const INVOICE_STATUS: Record<InvoiceStatus, string> = {
  paid: "Paid",
  failed: "Failed",
  upcoming: "Upcoming",
};

/** A renewal rather than a purchase — which decides the total's label. */
export const isRenewal = (kind: InvoiceKind) => kind === "monthly" || kind === "annual";

/** "Total due today" for a renewal you are being billed; "Total" for a receipt. */
export const totalLabel = (kind: InvoiceKind) =>
  isRenewal(kind) ? "Total due today" : "Total";

/** The day an invoice is stamped with, as the drawer and the table read it. */
export const invoiceDate = (at: number) =>
  new Date(at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

/* ------------------------------------------------------------------ filters */

/**
 * THE FILTER, as two independent sets.
 *
 * Empty means "All" rather than "nothing" — the drawer's All row is the state
 * where no box in that group is ticked, not a sixth value to store. That keeps
 * one truth about a group ("which of these did you pick") instead of an `all`
 * flag that can disagree with the boxes under it.
 */
export type TypeFilter = "subscription" | "credits" | "img" | "video";

export const STATUS_FILTERS: { id: InvoiceStatus; label: string }[] = [
  { id: "paid", label: "Paid" },
  { id: "failed", label: "Failed" },
  { id: "upcoming", label: "Upcoming" },
];

/** Annual renewals sit under the subscription row: the difference between them
 *  is the term, and nobody filters a year of invoices by billing period. */
export const TYPE_FILTERS: { id: TypeFilter; label: string; kinds: InvoiceKind[] }[] = [
  { id: "subscription", label: "Monthly Invoices", kinds: ["monthly", "annual"] },
  { id: "credits", label: "One-Time Top Up Credits", kinds: ["credits"] },
  { id: "img", label: "Img Data Output", kinds: ["img"] },
  { id: "video", label: "Video Data Output", kinds: ["video"] },
];

export interface InvoiceFilter {
  statuses: InvoiceStatus[];
  types: TypeFilter[];
}

export const NO_FILTER: InvoiceFilter = { statuses: [], types: [] };

/** How many boxes are ticked, for the drawer's "Filter selected: n" readout. */
export const filterCount = (f: InvoiceFilter) => f.statuses.length + f.types.length;

export function invoiceMatches(inv: Invoice, f: InvoiceFilter) {
  if (f.statuses.length && !f.statuses.includes(inv.status)) return false;
  if (f.types.length) {
    const kinds = TYPE_FILTERS.filter((t) => f.types.includes(t.id)).flatMap((t) => t.kinds);
    if (!kinds.includes(inv.kind)) return false;
  }
  return true;
}

/** How the history can be ordered over and above the sortable headers. */
export type InvoiceSort = "default" | "newest" | "oldest" | "high" | "low";

export const INVOICE_SORTS: { value: InvoiceSort; label: string }[] = [
  { value: "default", label: "Sort By: Default" },
  { value: "newest", label: "Sort By: Newest" },
  { value: "oldest", label: "Sort By: Oldest" },
  { value: "high", label: "Sort By: Highest total" },
  { value: "low", label: "Sort By: Lowest total" },
];

export const INVOICE_SORTERS: Record<InvoiceSort, (a: Invoice, b: Invoice) => number> = {
  /* The order the data arrived in — newest first, which is how a ledger is
     handed to you and the order it is worth being able to return to. */
  default: () => 0,
  newest: (a, b) => b.at - a.at,
  oldest: (a, b) => a.at - b.at,
  high: (a, b) => invoiceTotal(b) - invoiceTotal(a),
  low: (a, b) => invoiceTotal(a) - invoiceTotal(b),
};

/* ----------------------------------------------------------------- builders */

/** The reference an invoice is issued against — one org, one account number. */
export const ACCOUNT_REF = "6363G332-0832";

/**
 * An invoice number, from the day it was issued and what it was for.
 *
 * DERIVED, not random. `Math.random()` here would hand the same invoice a
 * different number on every render, and the number is the one thing on the sheet
 * a person might write down or quote to support.
 *
 * Built from the DATE PARTS rather than the raw timestamp: every seeded invoice
 * falls on the same clock time, so the tail of the epoch millis was almost all
 * zeros and a year of references came out looking like the same one typed twice.
 */
function numberFor(at: number, kind: InvoiceKind) {
  const d = new Date(at);
  const pad = (n: number) => String(n).padStart(2, "0");
  const stamp = `${String(d.getFullYear()).slice(-2)}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
  return `A${stamp}-${kind.slice(0, 3).toUpperCase()}`;
}

/**
 * SEATS, AS A RECEIPT.
 *
 * The same three groups the checkout's order summary shows, at the same rates —
 * a renewal invoice is the bill for what that summary agreed to, so if the two
 * disagreed one of them would be lying about the charge.
 */
function seatBody(plan: PlanId, cycle: BillingCycle, extraSeats: number) {
  const spec = planSpec(plan);
  const base = price(plan, cycle);
  const extra = round2(extraSeats * EXTRA_SEAT_PRICE);
  const included: InvoiceLine[] = [
    {
      label: "1 Owner seat",
      note: `Included with ${spec.name.toLowerCase()}`,
      value: "Free",
      muted: true,
    },
    {
      label: `${spec.seats.full} Full seat${spec.seats.full === 1 ? "" : "s"}`,
      note: `Included with ${spec.name.toLowerCase()} · ${money(base)}/ month`,
      value: `${money(base)}/ mo`,
    },
  ];

  const additional: InvoiceLine[] = [];
  if (extraSeats > 0) {
    additional.push({
      label: `${extraSeats} Full seat${extraSeats === 1 ? "" : "s"}`,
      note: `${money(EXTRA_SEAT_PRICE)}/ month × ${extraSeats}`,
      value: `${money(extra)}/ mo`,
    });
  }
  if (spec.seats.viewers === "unlimited") {
    additional.push({
      label: "Viewer seats",
      note: "Free/ month · unlimited",
      value: "Free",
      muted: true,
    });
  }

  const groups: InvoiceGroup[] = [{ rows: included }];
  if (additional.length) groups.push({ heading: "Additional Seats:", rows: additional });
  return { groups, subtotal: round2(base + extra) };
}

/** A renewal — the invoice a `subscribe` leaves behind, and the seeded ones. */
export function renewalInvoice(next: {
  at: number;
  plan: PlanId;
  cycle: BillingCycle;
  extraSeats: number;
  status: InvoiceStatus;
  method: string | null;
}): Invoice {
  const { groups, subtotal } = seatBody(next.plan, next.cycle, next.extraSeats);
  const kind: InvoiceKind = next.cycle === "annual" ? "annual" : "monthly";
  return {
    id: `inv-${next.at}-${kind}`,
    /* No number on one that hasn't been billed — see `number` above. */
    number: next.status === "upcoming" ? null : numberFor(next.at, kind),
    kind,
    status: next.status,
    at: next.at,
    account: ACCOUNT_REF,
    method: next.method,
    bodyTitle: "Renewing Seats",
    body: groups,
    subtotal,
    /* An upcoming invoice is a projection of the SUBTOTAL only: the tax is
       taken at the moment of the charge, and quoting one before then would be
       stating a total the charge might not match. */
    tax: next.status === "upcoming" ? 0 : round2(subtotal * TAX_RATE),
    taxRate: TAX_RATE,
  };
}

/** A top-up — what `buyCredits` records, and what the ledger row points at. */
export function creditsInvoice(next: {
  at: number;
  credits: number;
  usd: number;
  /** the pack it came off, or the amount itself for a custom one */
  label: string;
  method: string | null;
}): Invoice {
  return {
    id: `inv-${next.at}-credits`,
    number: numberFor(next.at, "credits"),
    kind: "credits",
    status: "paid",
    at: next.at,
    account: ACCOUNT_REF,
    method: next.method,
    bodyTitle: "Payment Summary",
    body: [
      {
        rows: [
          {
            label: "Credit Top Up",
            note: `100 credits / ${money(priceOf(100))}`,
            value: `${next.credits.toLocaleString()} Credits`,
          },
        ],
      },
      {
        heading: "Payment Breakdown:",
        rows: [
          {
            label: "Credits Cost",
            note: `${next.label} · ${next.credits.toLocaleString()} Credits`,
            value: money(next.usd),
          },
        ],
      },
    ],
    subtotal: next.usd,
    tax: round2(next.usd * TAX_RATE),
    taxRate: TAX_RATE,
  };
}

/**
 * DATA OUTPUT, PRICED PER UNIT.
 *
 * Images are counted one at a time and video by the second, so they are two
 * rates rather than one — and the rate goes in the note under the line, which
 * is what lets a reader check the figure beside it instead of taking it.
 */
const OUTPUT_RATES = {
  img: { per: 1, usd: 0.99, unit: "Img", plural: "Img" },
  video: { per: 100, usd: 0.99, unit: "Sec", plural: "Seconds" },
} as const;

export function outputInvoice(next: {
  at: number;
  kind: "img" | "video";
  /** images, or seconds */
  units: number;
  status?: InvoiceStatus;
  method: string | null;
}): Invoice {
  const rate = OUTPUT_RATES[next.kind];
  const subtotal = round2((next.units / rate.per) * rate.usd);
  const quantity = `${next.units.toLocaleString()} ${rate.unit}`;
  const status = next.status ?? "paid";
  return {
    id: `inv-${next.at}-${next.kind}`,
    number: numberFor(next.at, next.kind),
    kind: next.kind,
    status,
    at: next.at,
    account: ACCOUNT_REF,
    method: next.method,
    bodyTitle: "Payment Summary",
    body: [
      {
        rows: [
          {
            label: next.kind === "img" ? "Image Data Output" : "Video Data Output",
            note: `${rate.per} ${rate.unit} / ${money(rate.usd)}`,
            value: quantity,
          },
        ],
      },
      {
        heading: "Payment Breakdown:",
        rows: [
          {
            label: "Data Output Cost",
            note: `${next.units.toLocaleString()} ${rate.plural}`,
            value: money(subtotal),
          },
        ],
      },
    ],
    subtotal,
    tax: round2(subtotal * TAX_RATE),
    taxRate: TAX_RATE,
  };
}

/* -------------------------------------------------------------- the history */

/**
 * The card the seeded invoices were charged to.
 *
 * A literal rather than a read of the store's seeded card, because this module
 * is the store's data and not the other way round. Both say Visa ···· 4242; if
 * the placeholder card ever changes, the receipts it already issued shouldn't.
 */
const SEED_METHOD = "Visa ···· 4242";

const SEED_PLAN: PlanId = "pro";
/** Two Full Access seats bought on top of the three the Pro plan includes. */
const SEED_EXTRA_SEATS = 2;

/**
 * A year and a bit of billing, dated BACKWARDS FROM NOW.
 *
 * Same reason the credit ledger is seeded this way (see `seedLedger`): a
 * prototype that opens on invoices dated to a month in the past reads as stale
 * every day after the one it was written, and the first thing anyone checks on
 * a billing screen is whether the dates make sense.
 *
 * The series is deliberately mixed — a renewal that hasn't happened yet, one
 * that failed, top-ups and both flavours of data purchase — because every one
 * of those is a different sheet in the drawer, and a history of nine identical
 * paid renewals would show one of them.
 */
export function seedInvoices(now: number): Invoice[] {
  /* The billing day is today's, so the next renewal is a month out and every
     invoice behind it lands on the same day of its own month. */
  const on = (monthsFromNow: number) => {
    const d = new Date(now);
    d.setMonth(d.getMonth() + monthsFromNow);
    d.setHours(9, 0, 0, 0);
    return d.getTime();
  };

  const renewal = (months: number, status: InvoiceStatus, cycle: BillingCycle = "monthly") =>
    renewalInvoice({
      at: on(months),
      plan: SEED_PLAN,
      cycle,
      extraSeats: SEED_EXTRA_SEATS,
      status,
      /* Nothing has been charged for one that hasn't been attempted, and the
         card that failed is the one the drawer offers to replace. */
      method: SEED_METHOD,
    });

  const pack = (id: string) => CREDIT_PACKS.find((p) => p.id === id) ?? CREDIT_PACKS[0];
  const topUp = (months: number, packId: string) => {
    const p = pack(packId);
    return creditsInvoice({
      at: on(months),
      credits: p.credits + p.bonus,
      usd: p.usd,
      label: `${packId.charAt(0).toUpperCase()}${packId.slice(1)} pack`,
      method: SEED_METHOD,
    });
  };

  const output = (months: number, kind: "img" | "video", units: number) =>
    outputInvoice({ at: on(months), kind, units, method: SEED_METHOD });

  return [
    renewal(1, "upcoming"),
    renewal(0, "failed"),
    renewal(-1, "paid"),
    topUp(-2, "studio"),
    output(-3, "img", 50),
    renewal(-4, "paid"),
    output(-5, "video", 5_000),
    renewal(-6, "paid"),
    topUp(-7, "starter"),
    renewal(-8, "paid"),
    output(-9, "img", 120),
    renewal(-12, "paid", "annual"),
  ];
}
