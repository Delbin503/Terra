import { useMemo, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/icons";
import { Button, Segmented, Select, Switch } from "@/components/ui";
import { PageTitle, Panel, SectionTitle } from "./settings-parts";
import { useSettings } from "./settings-store";
import {
  COMPARE_ROWS,
  EXTRA_SEAT_PRICE,
  PLANS,
  TAX_RATE,
  money,
  planLabel,
  planSpec,
  price,
  rank,
  type BillingCycle,
  type PlanId,
} from "./subscription-data";

/**
 * SUBSCRIPTION — choosing a plan, and paying for it.
 *
 * One page rather than four, because it is one decision carried through: which
 * plan → how many seats → which card → is this right. Each stage replaces the
 * last in the same column, so the price you agreed to at the top is still the
 * price on screen at the bottom, and Back never loses what you typed.
 *
 * The confirmation between picking and paying is not ceremony: a plan change is
 * the only thing in Settings that alters what the whole org can do AND what it
 * is charged, so it states both — the feature diff, then the money.
 */

type Stage = "picker" | "confirm" | "seats" | "payment" | "review" | "done";

/** The three steps the checkout rail draws once you're past the confirmation. */
const STEPS: { id: Stage; label: string }[] = [
  { id: "seats", label: "Adjust Seats" },
  { id: "payment", label: "Payment Information" },
  { id: "review", label: "Review" },
];

interface CardDetails {
  holder: string;
  number: string;
  expiry: string;
  cvv: string;
  address: string;
  apt: string;
  country: string;
  city: string;
  postal: string;
}

const EMPTY_CARD: CardDetails = {
  holder: "",
  number: "",
  expiry: "",
  cvv: "",
  address: "",
  apt: "",
  country: "",
  city: "",
  postal: "",
};

const COUNTRIES = ["Singapore", "United States", "United Kingdom", "Australia", "Japan"];

export function PlansPage() {
  const { org, subscription, subscribe, notify, go } = useSettings();
  const [stage, setStage] = useState<Stage>("picker");
  const [cycle, setCycle] = useState<BillingCycle>(subscription.cycle);
  /** the plan being bought — null while the picker is still the question */
  const [target, setTarget] = useState<PlanId | null>(null);
  const [extraSeats, setExtraSeats] = useState(subscription.extraSeats);
  const [card, setCard] = useState<CardDetails>(EMPTY_CARD);
  const [agreed, setAgreed] = useState(false);

  const current = subscription.plan;
  const spec = planSpec(target ?? current);

  const bill = useMemo(() => {
    const base = price(target ?? current, cycle);
    const seats = extraSeats * EXTRA_SEAT_PRICE;
    const subtotal = base + seats;
    const tax = Math.round(subtotal * TAX_RATE * 100) / 100;
    return { base, seats, subtotal, tax, total: Math.round((subtotal + tax) * 100) / 100 };
  }, [target, current, cycle, extraSeats]);

  /** Start over rather than resume: a cancelled checkout shouldn't leave a
   *  half-filled card behind for the next plan you look at. */
  function cancel() {
    setTarget(null);
    setCard(EMPTY_CARD);
    setAgreed(false);
    setExtraSeats(subscription.extraSeats);
    setStage("picker");
  }

  function choose(plan: PlanId) {
    setTarget(plan);
    setStage("confirm");
  }

  /** Free is the one plan with nothing to charge, so it skips the checkout. */
  function confirmChoice() {
    if (!target) return;
    if (target === "free") {
      subscribe({ plan: "free", cycle: "monthly", extraSeats: 0, total: 0 });
      notify("You're now on the Free Plan.");
      setStage("done");
      return;
    }
    setStage("seats");
  }

  function checkout() {
    if (!target) return;
    subscribe({ plan: target, cycle, extraSeats, total: bill.total });
    notify(`${planLabel(target)} is active.`);
    setStage("done");
  }

  if (stage === "done") {
    return (
      <Receipt
        plan={target ?? current}
        cycle={cycle}
        extraSeats={extraSeats}
        total={target === "free" ? 0 : bill.total}
        onBilling={() => go("billing")}
        onDone={() => {
          setTarget(null);
          setStage("picker");
        }}
      />
    );
  }

  if (stage === "picker") {
    return (
      <>
        <PageTitle>Choose A Plan</PageTitle>
        <p className="type-body mt-2 text-content-muted">
          Select the plan that fits your needs. You can upgrade, downgrade, or add
          seats anytime — we'll adjust your next payment automatically.
        </p>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <Segmented
            ariaLabel="Billing cycle"
            value={cycle}
            onChange={setCycle}
            options={[
              { value: "monthly", label: "Monthly" },
              { value: "annual", label: "Annual" },
            ]}
          />
          <span className="type-caption-strong rounded-md bg-success-soft px-2 py-1 text-success">
            Save up to 30% annually
          </span>
          <span className="type-body ml-auto text-content-subtle">
            Subscription for {org.legalName}
          </span>
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-3">
          {PLANS.map((p) => (
            <PlanCard
              key={p.id}
              plan={p.id}
              cycle={cycle}
              current={current}
              onChoose={() => choose(p.id)}
            />
          ))}
        </div>

        <p className="type-body mt-6 text-center text-content-subtle">
          Looking for a custom plan for your organization?{" "}
          <button type="button" className="text-brand transition-colors hover:text-brand-hover">
            Reach out to us
          </button>
        </p>
      </>
    );
  }

  if (stage === "confirm" && target) {
    const up = rank(target) > rank(current);
    return (
      <>
        <PageTitle>
          You're {up ? "upgrading" : "switching"} to the {spec.name} Plan
        </PageTitle>
        <p className="type-body mt-2 text-content-muted">
          You're on the {planLabel(current)}. Here's what changes.
        </p>

        <Panel className="mt-5 p-0">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-surface-raised/60">
                  <th className="type-body-strong px-4 py-3 text-left text-content">Feature</th>
                  <th className="type-body-strong px-4 py-3 text-left text-content">
                    {planLabel(current)} (Current)
                  </th>
                  <th className="type-body-strong px-4 py-3 text-left text-content">
                    {planLabel(target)} (New)
                  </th>
                </tr>
              </thead>
              <tbody>
                {COMPARE_ROWS.map((row) => (
                  <tr key={row.key} className="border-t border-line/8">
                    <td className="type-body px-4 py-3 text-content">{row.label}</td>
                    <td className="type-body px-4 py-3 text-content-subtle">
                      {planSpec(current).compare[row.key]}
                    </td>
                    <td className="type-body px-4 py-3 text-brand">
                      {planSpec(target).compare[row.key]}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>

        <p className="type-body mt-4 text-content-muted">
          {target === "free"
            ? "Your plan changes at the end of the current billing period. Seats above the Free allowance are released."
            : "Your plan will be updated immediately. The cost difference will be prorated on your next invoice."}
        </p>

        <div className="mt-5 flex justify-end gap-2.5">
          <Button variant="secondary" onClick={cancel}>
            Cancel
          </Button>
          <Button variant="brand" onClick={confirmChoice}>
            {target === "free" ? "Confirm switch to Free Plan" : `Continue to checkout`}
          </Button>
        </div>
      </>
    );
  }

  // The three checkout steps share one frame: the stepper, the step, the summary.
  const step = STEPS.findIndex((s) => s.id === stage);
  const cardComplete =
    card.holder.trim() !== "" &&
    card.number.replace(/\s/g, "").length >= 12 &&
    card.expiry.trim() !== "" &&
    card.cvv.trim().length >= 3 &&
    card.address.trim() !== "" &&
    card.country !== "" &&
    card.postal.trim() !== "";

  return (
    <>
      <div className="flex items-center gap-4">
        <Button variant="secondary" size="sm" onClick={cancel}>
          Cancel
        </Button>
        <Stepper active={step} />
      </div>

      <div className="mt-8 grid gap-5 lg:grid-cols-[1fr_20rem]">
        <div>
          {stage === "seats" && (
            <SeatsStep
              plan={target ?? current}
              extraSeats={extraSeats}
              onExtraSeats={setExtraSeats}
            />
          )}
          {stage === "payment" && <PaymentStep card={card} onCard={setCard} />}
          {stage === "review" && (
            <ReviewStep card={card} org={org.legalName} agreed={agreed} onAgreed={setAgreed} />
          )}
        </div>

        <OrderSummary
          plan={target ?? current}
          cycle={cycle}
          onCycle={setCycle}
          extraSeats={extraSeats}
          bill={bill}
          showTax={stage === "review"}
          action={
            stage === "review" ? (
              <Button variant="brand" className="w-full" disabled={!agreed} onClick={checkout}>
                Confirm Checkout
              </Button>
            ) : (
              <Button
                variant="brand"
                className="w-full"
                disabled={stage === "payment" && !cardComplete}
                onClick={() => setStage(stage === "seats" ? "payment" : "review")}
              >
                {stage === "seats" ? "Next: Payment Information" : "Next: Review"}
              </Button>
            )
          }
          back={
            stage !== "seats" ? (
              <Button
                variant="ghost"
                size="sm"
                className="w-full"
                onClick={() => setStage(stage === "review" ? "payment" : "seats")}
              >
                Back
              </Button>
            ) : null
          }
        />
      </div>
    </>
  );
}

/* ---------------------------------------------------------------- the picker */

function PlanCard({
  plan,
  cycle,
  current,
  onChoose,
}: {
  plan: PlanId;
  cycle: BillingCycle;
  current: PlanId;
  onChoose: () => void;
}) {
  const spec = planSpec(plan);
  const here = plan === current;
  const up = rank(plan) > rank(current);
  const amount = price(plan, cycle);

  return (
    <Panel
      className={cn(
        "relative flex flex-col p-0",
        spec.popular && !here && "border-brand/40"
      )}
    >
      {spec.popular && (
        <span className="type-caption-strong absolute -top-2.5 left-1/2 -translate-x-1/2 rounded-md bg-brand-soft px-2 py-0.5 text-brand">
          Most Popular
        </span>
      )}

      <div className="border-b border-glass/10 p-5">
        <h2 className="font-display text-lg font-semibold text-content">{spec.name}</h2>
        <p className="type-body mt-1 text-content-muted">{spec.pitch}</p>
      </div>

      <div className="p-5">
        <p className="font-display text-2xl font-semibold text-content">
          {amount === 0 ? "$0" : `${money(amount)} / month`}
        </p>
        <p className="type-body mt-1 text-content-subtle">
          {amount === 0
            ? "(Free with limited features)"
            : cycle === "annual"
              ? "billed annually"
              : `or ${money(spec.annual)} / month for annually`}
        </p>

        <ul className="mt-4 flex flex-col gap-2">
          {spec.features.map((f) => (
            <li key={f.label} className="flex gap-2">
              <Icon
                name={f.included ? "check" : "close"}
                size={15}
                className={cn("mt-0.5 shrink-0", f.included ? "text-success" : "text-danger")}
              />
              <span className="type-body text-content">
                {f.label}
                {f.note && (
                  <span className="type-caption mt-0.5 block text-content-subtle">{f.note}</span>
                )}
              </span>
            </li>
          ))}
        </ul>

        <p className="type-body-strong mt-4 text-content">Seats:</p>
        <ul className="mt-1.5 flex flex-col gap-1.5">
          <SeatLine icon="person" tone="info" label="1 Owner seat included" />
          {spec.seats.full > 1 && (
            <SeatLine
              icon="shared"
              tone="brand"
              label={`${spec.seats.full} Full Access seats included`}
              note="Add more Full Access seats anytime (charged per seat)"
            />
          )}
          {spec.seats.viewers === "unlimited" && (
            <SeatLine icon="visible" tone="warning" label="Unlimited Viewers (edit-only)" />
          )}
        </ul>
      </div>

      <div className="mt-auto p-5 pt-0">
        <Button
          variant={here ? "secondary" : up ? "brand" : "outline"}
          className="w-full"
          disabled={here}
          onClick={onChoose}
        >
          {here ? "Current Plan" : up ? "Upgrade Plan" : "Switch Plan"}
        </Button>
      </div>
    </Panel>
  );
}

function SeatLine({
  icon,
  tone,
  label,
  note,
}: {
  icon: "person" | "shared" | "visible";
  tone: "info" | "brand" | "warning";
  label: string;
  note?: string;
}) {
  const tones = {
    info: "bg-accent-soft text-accent",
    brand: "bg-brand-soft text-brand",
    warning: "bg-warning-soft text-warning",
  };
  return (
    <li className="flex gap-2">
      <span className={cn("mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded", tones[tone])}>
        <Icon name={icon} size={12} />
      </span>
      <span className="type-body text-content">
        {label}
        {note && <span className="type-caption mt-0.5 block text-content-subtle">{note}</span>}
      </span>
    </li>
  );
}

/* -------------------------------------------------------------- the checkout */

function Stepper({ active }: { active: number }) {
  return (
    <ol className="flex flex-1 items-center">
      {STEPS.map((s, i) => (
        <li key={s.id} className="flex flex-1 items-center last:flex-none">
          <span className="flex flex-col items-center gap-1.5">
            <span
              className={cn(
                "grid h-5 w-5 place-items-center rounded-full border-2 transition-colors",
                i < active
                  ? "border-brand bg-brand text-brand-foreground"
                  : i === active
                    ? "border-brand text-brand"
                    : "border-line/20 text-content-subtle"
              )}
            >
              {i < active ? (
                <Icon name="check" size={11} strokeWidth={3} />
              ) : (
                <span className={cn("h-1.5 w-1.5 rounded-full", i === active && "bg-brand")} />
              )}
            </span>
            <span
              className={cn(
                "type-body-dense whitespace-nowrap",
                i <= active ? "text-content" : "text-content-subtle"
              )}
            >
              {s.label}
            </span>
          </span>
          {i < STEPS.length - 1 && (
            <span
              aria-hidden
              className={cn("-mt-5 h-px flex-1", i < active ? "bg-brand" : "bg-line/20")}
            />
          )}
        </li>
      ))}
    </ol>
  );
}

function SeatsStep({
  plan,
  extraSeats,
  onExtraSeats,
}: {
  plan: PlanId;
  extraSeats: number;
  onExtraSeats: (n: number) => void;
}) {
  const spec = planSpec(plan);
  return (
    <>
      <SectionTitle>Choose a seat type for everyone in this organization</SectionTitle>
      <p className="type-body mt-2 text-content-muted">
        The {spec.name} plan includes {spec.seats.full} Full Access seat
        {spec.seats.full === 1 ? "" : "s"}
        {spec.seats.viewers === "unlimited" && " and unlimited Viewer seats"}. Add more
        Full Access seats now, or later if your team grows.
      </p>

      <Panel className="mt-5 flex flex-wrap items-center gap-4">
        <div className="min-w-0 flex-1">
          <p className="type-body-strong text-content">Additional Full Access seats</p>
          <p className="type-body mt-1 text-content-muted">
            {money(EXTRA_SEAT_PRICE)} per seat, per month. Can create, manage, and invite
            others across projects.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            aria-label="Remove a seat"
            disabled={extraSeats === 0}
            onClick={() => onExtraSeats(Math.max(0, extraSeats - 1))}
          >
            <Icon name="step-down" size={15} />
          </Button>
          <span className="type-numeric grid h-8 min-w-10 place-items-center rounded-lg border border-line/12 bg-surface px-2 text-content">
            {extraSeats}
          </span>
          <Button
            variant="secondary"
            size="sm"
            aria-label="Add a seat"
            onClick={() => onExtraSeats(extraSeats + 1)}
          >
            <Icon name="step-up" size={15} />
          </Button>
        </div>
      </Panel>

      <Panel className="mt-4 flex flex-wrap items-center gap-4">
        <div className="min-w-0 flex-1">
          <p className="type-body-strong text-content">Viewer seats</p>
          <p className="type-body mt-1 text-content-muted">
            Can edit but cannot create new projects or manage team roles.
          </p>
        </div>
        <span className="type-body-strong text-success">
          {spec.seats.viewers === "unlimited" ? "Unlimited · Free" : "Not included"}
        </span>
      </Panel>
    </>
  );
}

function PaymentStep({
  card,
  onCard,
}: {
  card: CardDetails;
  onCard: (c: CardDetails) => void;
}) {
  const set = (patch: Partial<CardDetails>) => onCard({ ...card, ...patch });
  return (
    <>
      <SectionTitle>Enter your payment details</SectionTitle>

      <Panel className="mt-5">
        <p className="type-body-strong text-content">Card Information</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Field
            label="Card Holder Name"
            required
            value={card.holder}
            placeholder="e.g. John Doe"
            onChange={(v) => set({ holder: v })}
          />
          <Field
            label="Card Number"
            required
            value={card.number}
            placeholder="1234 1234 1234 1234"
            inputMode="numeric"
            onChange={(v) => set({ number: v })}
          />
          <Field
            label="Expiry Date"
            required
            value={card.expiry}
            placeholder="MM / YY"
            onChange={(v) => set({ expiry: v })}
          />
          <Field
            label="Security Code/CVV"
            required
            value={card.cvv}
            placeholder="123"
            inputMode="numeric"
            onChange={(v) => set({ cvv: v })}
          />
        </div>

        <p className="type-body-strong mt-6 text-content">Billing Address</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Field
            label="Billing Address"
            required
            value={card.address}
            placeholder="e.g. 123 Main Street"
            onChange={(v) => set({ address: v })}
          />
          <Field
            label="Apt, Unit, Suite, etc"
            value={card.apt}
            placeholder="e.g. Apartment, suite, etc."
            onChange={(v) => set({ apt: v })}
          />
          <label className="block">
            <span className="type-body-strong block text-content">
              Country <span className="text-danger">*</span>
            </span>
            <Select
              aria-label="Country"
              value={card.country}
              onChange={(v) => set({ country: v })}
              options={[
                { value: "", label: "Select country" },
                ...COUNTRIES.map((c) => ({ value: c, label: c })),
              ]}
              className="mt-1.5 h-10 w-full"
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <Field
              label="City"
              value={card.city}
              placeholder="e.g. San Francisco"
              onChange={(v) => set({ city: v })}
            />
            <Field
              label="Postal Code"
              required
              value={card.postal}
              placeholder="e.g. 94102"
              onChange={(v) => set({ postal: v })}
            />
          </div>
        </div>
      </Panel>
    </>
  );
}

function ReviewStep({
  card,
  org,
  agreed,
  onAgreed,
}: {
  card: CardDetails;
  org: string;
  agreed: boolean;
  onAgreed: (v: boolean) => void;
}) {
  const masked = card.number.replace(/\s/g, "").slice(-4).padStart(16, "•");
  return (
    <>
      <SectionTitle>Let's make sure everything looks right</SectionTitle>

      <Panel className="mt-5 p-0">
        <p className="type-body-strong border-b border-glass/10 px-5 py-3.5 text-content">
          Details
        </p>
        <dl className="flex flex-col gap-4 p-5">
          <Detail label="Organization Name" value={org} />
          <Detail label="Card Number" value={masked.replace(/(.{4})/g, "$1 ").trim()} />
          <Detail label="Card Holder Name" value={card.holder} />
          <Detail label="Billing Address" value={card.address} />
          <Detail label="Apt, Unit, Suite, etc" value={card.apt || "N/A"} />
          <Detail label="City" value={card.city || "N/A"} />
          <Detail label="Country" value={card.country} />
          <Detail label="Postal Code" value={card.postal} />
        </dl>
      </Panel>

      <label className="mt-4 flex items-center gap-3">
        <Switch checked={agreed} onChange={onAgreed} label="Agree to the terms" />
        <span className="type-body text-content-muted">
          I agree to both the{" "}
          <span className="text-brand">Terms of Service</span> and{" "}
          <span className="text-brand">Privacy Policy</span>
        </span>
      </label>
    </>
  );
}

function Detail({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <dt className="type-body-dense text-content-subtle">{label}</dt>
      <dd className="type-body mt-0.5 text-content">{value}</dd>
    </div>
  );
}

/** The running total, pinned beside every step so the price never leaves. */
function OrderSummary({
  plan,
  cycle,
  onCycle,
  extraSeats,
  bill,
  showTax,
  action,
  back,
}: {
  plan: PlanId;
  cycle: BillingCycle;
  onCycle: (c: BillingCycle) => void;
  extraSeats: number;
  bill: { base: number; seats: number; subtotal: number; tax: number; total: number };
  showTax: boolean;
  action: ReactNode;
  back: ReactNode;
}) {
  const spec = planSpec(plan);
  return (
    <Panel className="h-fit lg:sticky lg:top-6">
      <p className="font-display text-lg font-semibold text-content">Your {spec.name} Plan</p>

      <Segmented
        ariaLabel="Billing cycle"
        className="mt-3 w-full"
        value={cycle}
        onChange={onCycle}
        options={[
          { value: "monthly", label: "Monthly" },
          { value: "annual", label: "Annual" },
        ]}
      />

      <div className="mt-4 flex flex-col gap-3">
        <Line
          label={`${spec.seats.full} Full seat${spec.seats.full === 1 ? "" : "s"}`}
          note={`Included with ${spec.name.toLowerCase()}`}
          value={`${money(bill.base)}/ mo`}
        />
        {extraSeats > 0 && (
          <Line
            label={`${extraSeats} extra Full seat${extraSeats === 1 ? "" : "s"}`}
            note={`${money(EXTRA_SEAT_PRICE)} / month × ${extraSeats}`}
            value={`${money(bill.seats)}/ mo`}
          />
        )}
        {spec.seats.viewers === "unlimited" && (
          <Line label="Viewer seats" note="Unlimited, edit-only" value="Free" />
        )}
      </div>

      <div className="mt-4 border-t border-glass/10 pt-4">
        <Line
          label="Subtotal"
          note={showTax ? undefined : "See your total (including taxes) in Review"}
          value={`${money(bill.subtotal)}/ mo`}
          strong
        />
        {showTax && (
          <>
            <div className="mt-3">
              <Line label="Tax" note={`${(TAX_RATE * 100).toFixed(1)}%`} value={money(bill.tax)} />
            </div>
            <div className="mt-3">
              <Line label="Total due today" value={money(bill.total)} strong />
            </div>
          </>
        )}
      </div>

      <div className="mt-5 flex flex-col gap-2">
        {action}
        {back}
      </div>
    </Panel>
  );
}

function Line({
  label,
  note,
  value,
  strong,
}: {
  label: string;
  note?: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div className="flex items-start gap-3">
      <span className="min-w-0 flex-1">
        <span className={cn("block", strong ? "type-body-strong text-content" : "type-body text-content")}>
          {label}
        </span>
        {note && <span className="type-caption block text-content-subtle">{note}</span>}
      </span>
      <span className={cn("shrink-0 tabular-nums", strong ? "type-body-strong" : "type-body")}>
        {value}
      </span>
    </div>
  );
}

/* --------------------------------------------------------------- the receipt */

function Receipt({
  plan,
  cycle,
  extraSeats,
  total,
  onBilling,
  onDone,
}: {
  plan: PlanId;
  cycle: BillingCycle;
  extraSeats: number;
  total: number;
  onBilling: () => void;
  onDone: () => void;
}) {
  const { subscription } = useSettings();
  const spec = planSpec(plan);
  return (
    <>
      <PageTitle>Subscription updated</PageTitle>

      <Panel className="mt-5 text-center">
        <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-success-soft text-success">
          <Icon name="select-check" size={26} />
        </span>
        <p className="mt-3 font-display text-xl font-semibold text-content">
          You're on the {spec.name} Plan
        </p>
        <p className="type-body mt-1.5 text-content-muted">
          {total > 0
            ? `${money(total)} charged today. Billed ${cycle === "annual" ? "annually" : "monthly"}${
                subscription.renewsOn ? `, renewing ${subscription.renewsOn}` : ""
              }.`
            : "No charge — the Free plan has no billing cycle."}
        </p>

        <div className="mx-auto mt-5 grid max-w-md gap-3 text-left sm:grid-cols-3">
          <Stat label="Full seats" value={String(spec.seats.full + extraSeats)} />
          <Stat
            label="Viewer seats"
            value={spec.seats.viewers === "unlimited" ? "Unlimited" : "—"}
          />
          <Stat label="Monthly Img" value={spec.compare.quota.split(" / ")[0]} />
        </div>

        <div className="mt-6 flex justify-center gap-2.5">
          <Button variant="secondary" onClick={onDone}>
            Back to plans
          </Button>
          <Button variant="brand" onClick={onBilling}>
            View invoice
          </Button>
        </div>
      </Panel>
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-glass/10 px-3 py-2.5">
      <p className="type-body-dense text-content-subtle">{label}</p>
      <p className="type-body-strong mt-0.5 text-content">{value}</p>
    </div>
  );
}

/** One labelled input, at the height the checkout forms use. */
function Field({
  label,
  value,
  onChange,
  placeholder,
  required,
  inputMode,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  required?: boolean;
  inputMode?: "numeric" | "text";
}) {
  return (
    <label className="block">
      <span className="type-body-strong block text-content">
        {label}
        {required && <span className="text-danger"> *</span>}
      </span>
      <input
        value={value}
        inputMode={inputMode}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="field-well type-body mt-1.5 h-10 w-full rounded-lg border px-3 text-content outline-none transition-colors placeholder:text-content-subtle focus:border-brand"
      />
    </label>
  );
}
