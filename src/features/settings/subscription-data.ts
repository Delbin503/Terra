/**
 * THE PLANS — what a subscription costs and what it buys.
 *
 * One module because three screens read the same three plans: the picker, the
 * upgrade confirmation (which diffs two of them), and the checkout summary
 * (which prices one of them against a seat count). Keeping the ladder in one
 * array is also what lets "is this an upgrade or a downgrade" be a comparison
 * of two positions rather than a table of special cases.
 */

export type PlanId = "free" | "starter" | "pro";
export type BillingCycle = "monthly" | "annual";

export interface PlanSpec {
  id: PlanId;
  name: string;
  /** who it's for — the line under the name on the card */
  pitch: string;
  /** dollars per month, billed monthly / billed annually */
  monthly: number;
  annual: number;
  /** the card's bullet list; `false` renders the crossed-out variant */
  features: { label: string; included: boolean; note?: string }[];
  /** seats the plan comes with before you buy any */
  seats: { full: number; viewers: "none" | "unlimited" };
  /** the rows the upgrade confirmation compares plan-to-plan */
  compare: {
    quota: string;
    rollover: string;
    fullSeats: string;
    viewers: string;
    support: string;
    sharing: string;
    topUp: string;
  };
  /** the one the picker badges */
  popular?: boolean;
}

/** What one extra Full Access seat adds to the monthly bill. Viewers are free. */
export const EXTRA_SEAT_PRICE = 4.99;

/** Flat rate applied at Review, so the total isn't a bare subtotal. */
export const TAX_RATE = 0.076;

export const PLANS: PlanSpec[] = [
  {
    id: "free",
    name: "Free",
    pitch: "For individuals testing or learning Terra",
    monthly: 0,
    annual: 0,
    features: [
      { label: "Basic Access to Terra Builder", included: true },
      { label: "Create up to 2 projects", included: true },
      { label: "Export up to 10 Img data files (reset every month)", included: true },
      { label: "1 Full Access seat (for account owner only)", included: true },
      { label: "No video generation", included: false },
      { label: "No team sharing or collaboration", included: false },
      { label: "No Top-Up or data rollover", included: false },
    ],
    seats: { full: 1, viewers: "none" },
    compare: {
      quota: "Up to 10 Img (Export per month)",
      rollover: "Not available",
      fullSeats: "1 seat (Owner only)",
      viewers: "Not available",
      support: "Not available",
      sharing: "Not available",
      topUp: "Not available",
    },
  },
  {
    id: "starter",
    name: "Starter",
    pitch: "For creators or small teams collaborating lightly",
    monthly: 9.99,
    annual: 7.99,
    popular: true,
    features: [
      { label: "Full access to Terra platform", included: true },
      { label: "Unlimited projects", included: true },
      { label: "500 Img / 18,000 Sec of video per month", included: true },
      {
        label: "Rollover cap: 1,500 Img / 54,000 s of videos",
        included: true,
        note: "Img and video data rolls over monthly until it reaches the cap limit",
      },
      { label: "Team sharing and asset request system", included: true },
      { label: "Top-Up support (buy more Img/video data via Terra Credits)", included: true },
      { label: "Standard support and early access to features", included: true },
    ],
    seats: { full: 2, viewers: "unlimited" },
    compare: {
      quota: "500 Img / 18,000 Sec of video per month",
      rollover: "1,500 Img / 54,000 Sec of videos",
      fullSeats: "2 seats",
      viewers: "Unlimited (Edit only)",
      support: "Included",
      sharing: "Included",
      topUp: "Included",
    },
  },
  {
    id: "pro",
    name: "Pro",
    pitch: "For high-output users and professional teams",
    monthly: 12.99,
    annual: 9.99,
    features: [
      { label: "Full access to Terra platform", included: true },
      { label: "Unlimited projects", included: true },
      { label: "6,000 Img / 216,000 Sec of video per month", included: true },
      {
        label: "Rollover cap: 18,000 Img / 648,000 s of videos",
        included: true,
        note: "Img and video data rolls over monthly until it reaches the cap limit",
      },
      { label: "Team sharing and asset request system", included: true },
      { label: "Top-Up support (buy more Img/video data via Terra Credits)", included: true },
      { label: "Standard support and early access to features", included: true },
    ],
    seats: { full: 3, viewers: "unlimited" },
    compare: {
      quota: "6,000 Img / 216,000 Sec of video per month",
      rollover: "18,000 Img / 648,000 Sec of videos",
      fullSeats: "3 seats",
      viewers: "Unlimited (Edit only)",
      support: "Included",
      sharing: "Included",
      topUp: "Included",
    },
  },
];

export const planSpec = (id: PlanId) => PLANS.find((p) => p.id === id) ?? PLANS[0];

/** Where a plan sits on the ladder — what makes a change an upgrade or not. */
export const rank = (id: PlanId) => PLANS.findIndex((p) => p.id === id);

/** The plan label the rest of Settings shows ("Free Plan", "Pro Plan"). */
export const planLabel = (id: PlanId) => `${planSpec(id).name} Plan`;

/** Read a stored label back into an id, so the seeded org state still matches. */
export function planIdFromLabel(label: string): PlanId {
  const found = PLANS.find((p) => label.toLowerCase().startsWith(p.name.toLowerCase()));
  return found?.id ?? "free";
}

export const price = (id: PlanId, cycle: BillingCycle) =>
  cycle === "annual" ? planSpec(id).annual : planSpec(id).monthly;

export const money = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD" });

/** The rows the upgrade confirmation compares, in the order it reads them. */
export const COMPARE_ROWS: { key: keyof PlanSpec["compare"]; label: string }[] = [
  { key: "quota", label: "Monthly free Img/video data" },
  { key: "rollover", label: "Monthly Rollover Cap" },
  { key: "fullSeats", label: "Full Access seats Included" },
  { key: "viewers", label: "Viewer Access" },
  { key: "support", label: "Standard support and early access" },
  { key: "sharing", label: "Team sharing and asset request system" },
  { key: "topUp", label: "Top-Up support" },
];
