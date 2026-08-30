import type { SeatKind } from "@/features/settings/settings-data";
import {
  money,
  planSpec,
  type BillingCycle,
  type PlanId,
} from "@/features/settings/subscription-data";

/**
 * PRICING — the three plan cards, as the public page draws them.
 *
 * WHY THIS ISN'T `subscription-data.ts`. That module is the ledger the checkout
 * runs on: what a plan costs, how many seats it carries, and which rows the
 * upgrade confirmation diffs. This is the SELL — headline, order of the
 * bullets, which figure is lit orange — and the two say different things about
 * the same plans on purpose. The Settings picker lists the quota as
 * "500 Img / 18,000 Sec of video per month"; the page out here says
 * "500 Terra credits per month", because a visitor is being told what they buy
 * and a subscriber is being shown what they hold.
 *
 * The numbers that must NOT drift are imported rather than retyped: the pitch
 * and the monthly price come from `planSpec`, so a price change in the ledger
 * reaches this page without anyone remembering it exists. A pricing page that
 * quietly disagrees with the checkout is the one bug here nobody forgives.
 *
 * THE ANNUAL FIGURES ARE THE DESIGN'S, and they do not agree with the ledger:
 * `planSpec("starter").annual` is 7.99 (a discounted per-month rate) while the
 * design prints $99.99 "/month billed annually". They are left as the design
 * has them rather than silently reconciled — see the note in PricingView.
 */

/** One card's price, in one billing cycle. Every part is optional but `amount`
 *  because "Free" is a price with nothing else around it. */
export interface PriceView {
  /** the crossed-out figure the yearly card puts before the price */
  was?: string;
  amount: string;
  /** the unit beside the amount — "/month" */
  unit?: string;
  /** the small print under the unit — "Billed monthly", "billed annually" */
  note?: string;
  /** the credits line under the price, with its figure lit */
  includes?: { lit: string; rest: string };
}

export interface PricingFeature {
  /** false draws the crossed-out variant — a limit, not a feature */
  included: boolean;
  /** the head of the line, drawn in brand: always a credit figure */
  lit?: string;
  label: string;
  /** the parenthetical under the line */
  note?: string;
}

/**
 * A seat entitlement. It gets a glyph because it is a different KIND of thing
 * from the ticks above it — what the plan seats, not what it can do.
 *
 * It names the SEAT rather than an icon: the roster in Settings already draws
 * every seat kind with a fixed glyph and colour (`SEAT_ICON` / `SEAT_TONE`), and
 * a card that invents its own is telling you a Viewer seat and a Full Access
 * seat are the same thing right up until you go and look at the members table.
 */
export interface SeatLine {
  seat: SeatKind;
  label: string;
  note?: string;
}

export interface PricingPlan {
  id: PlanId;
  /** the card's own name. "Basic" out here, "Free" in the ledger — and the
   *  Starter card says "Everything in Free, plus:", so both are in the design. */
  name: string;
  pitch: string;
  popular?: boolean;
  price: Record<BillingCycle, PriceView>;
  /** "Key Features :" on the entry card, "Everything in X, plus:" above it */
  featuresTitle: string;
  features: PricingFeature[];
  seats: SeatLine[];
}

/**
 * The plan this workspace is on — the one card that offers no upgrade.
 *
 * A constant, because the subscription lives in `SettingsProvider` and this
 * page is mounted outside it. This is the seam: read it from the real
 * subscription and every card below re-labels itself.
 */
export const CURRENT_PLAN: PlanId = "free";

export const PRICING_PLANS: PricingPlan[] = [
  {
    id: "free",
    name: "Basic",
    pitch: planSpec("free").pitch,
    price: {
      monthly: { amount: "Free" },
      annual: { amount: "Free" },
    },
    featuresTitle: "Key Features :",
    features: [
      { included: true, label: "Basic Access to Terra Builder" },
      { included: true, label: "Create up to 2 projects" },
      { included: true, label: "Export up to 10 Img data files (reset every month)" },
      { included: true, label: "1 Full Access seat (for account owner only)" },
      { included: false, label: "No video generation" },
      { included: false, label: "No team sharing or collaboration" },
      { included: false, label: "No Top-Up or data rollover" },
    ],
    /* The owner's own seat, so it is drawn as the Owner is drawn in the roster
       rather than as a generic Full Access one. */
    seats: [{ seat: "owner", label: "1 Full Access seat Included (For Owner)" }],
  },
  {
    id: "starter",
    name: "Starter",
    pitch: planSpec("starter").pitch,
    popular: true,
    price: {
      monthly: {
        amount: money(planSpec("starter").monthly),
        unit: "/month",
        note: "Billed monthly",
      },
      annual: {
        was: "THB 555",
        amount: "$99.99",
        unit: "/month",
        note: "billed annually",
        includes: { lit: "240K Terra", rest: "credits/year" },
      },
    },
    featuresTitle: "Everything in Free, plus:",
    features: [
      { included: true, label: "Full access to Terra platform" },
      { included: true, label: "Unlimited projects" },
      { included: true, lit: "500 Terra", label: "credits per month" },
      { included: true, label: "Team sharing and asset request system" },
      { included: true, label: "Top-Up support (buy more Terra Credits)" },
      { included: true, label: "Standard support and  early access to features" },
    ],
    seats: [
      {
        seat: "full",
        label: "2 Full Access seats Included",
        note: "Add more Full Access seats anytime (charged per seat)",
      },
      { seat: "viewer", label: "Unlimited Viewers (edit-only)" },
    ],
  },
  {
    id: "pro",
    name: "Pro",
    pitch: planSpec("pro").pitch,
    price: {
      monthly: {
        amount: money(planSpec("pro").monthly),
        unit: "/month",
        note: "Billed monthly",
      },
      annual: {
        was: "THB 1,249",
        amount: "$199.99",
        unit: "/month",
        note: "billed annually",
        includes: { lit: "600K Terra", rest: "credits/year" },
      },
    },
    featuresTitle: "Everything in Starter, plus:",
    features: [
      { included: true, label: "Full access to Terra platform" },
      { included: true, label: "Unlimited projects" },
      {
        included: true,
        lit: "1,000 Terra",
        label: "credits per month",
        note: "(replaces Starter quota; not cumulative)",
      },
      { included: true, label: "Team sharing and asset request system" },
      { included: true, label: "Top-Up support (buy more Terra Credits)" },
      { included: true, label: "Standard support and  early access to features" },
    ],
    seats: [
      {
        seat: "full",
        label: "3 Full Access seats Included",
        note: "Add more Full Access seats anytime (charged per seat)",
      },
      { seat: "viewer", label: "Unlimited Viewers (edit-only)" },
    ],
  },
];

/** The two cycles, and what the toggle calls them. */
export const CYCLES: { value: BillingCycle; label: string; badge?: string }[] = [
  { value: "monthly", label: "Monthly" },
  { value: "annual", label: "Yearly", badge: "SAVE 20%" },
];
