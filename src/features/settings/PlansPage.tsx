import { useEffect, useMemo, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/icons";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  Segmented,
} from "@/components/ui";
import { PageTitle, Panel, ReceiptLine as Line, SectionTitle } from "./settings-parts";
import {
  CardBrandMark,
  CardFields,
  CheckField,
  EMPTY_DRAFT,
  billingFrom,
  draftComplete,
  isExpired,
  maskedPan,
  savedCardName,
  type CardDraft,
} from "./card-parts";
import { useSettings, type BillingAddress, type SavedCard } from "./settings-store";
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

/**
 * What the checkout will actually charge, whichever way it was answered.
 *
 * The payment step has two shapes — pick a card already on file, or type a new
 * one — and Review has to read back the same six facts either way. Collapsing
 * both into one value here is what keeps Review from growing a branch for
 * "saved card" and a branch for "typed card" that then disagree about whether
 * Apt is shown when it is empty.
 */
interface ChargeView extends BillingAddress {
  brand: string;
  last4: string;
  holder: string;
}

/** The three steps the checkout rail draws once you're past the confirmation. */
const STEPS: { id: Stage; label: string }[] = [
  { id: "seats", label: "Adjust Seats" },
  { id: "payment", label: "Payment Information" },
  { id: "review", label: "Review" },
];

export function PlansPage() {
  const { org, subscription, subscribe, notify, go, cards, card: primaryCard, addCard, planIntent, clearPlanIntent } =
    useSettings();
  const [stage, setStage] = useState<Stage>("picker");
  const [cycle, setCycle] = useState<BillingCycle>(subscription.cycle);
  /** the plan being bought — null while the picker is still the question */
  const [target, setTarget] = useState<PlanId | null>(null);
  const [extraSeats, setExtraSeats] = useState(subscription.extraSeats);
  const [draft, setDraft] = useState<CardDraft>(EMPTY_DRAFT);
  /**
   * The saved card this purchase will go to, or null for the one being typed.
   *
   * It starts on the card that already pays for everything else, because that
   * is the answer nine times out of ten and the tenth is one click away. An org
   * with nothing on file starts at null, which is the form.
   */
  const [payWith, setPayWith] = useState<string | null>(primaryCard?.id ?? null);
  const [agreed, setAgreed] = useState(false);

  const current = subscription.plan;
  const spec = planSpec(target ?? current);

  /**
   * ARRIVING WITH THE PLAN ALREADY CHOSEN.
   *
   * The Pricing page and the plan sheet on Payment Details both ask the same
   * question this page's own picker asks, and answering it twice is not a
   * confirmation, it is a dead click on a screen you did not ask to see. So a
   * plan carried in here skips straight to the diff — which is the first thing
   * that tells you something you did not already know — and the intent is
   * cleared as it is consumed so Back lands on the picker rather than bouncing.
   */
  useEffect(() => {
    if (!planIntent) return;
    setTarget(planIntent);
    setStage("confirm");
    clearPlanIntent();
  }, [planIntent, clearPlanIntent]);

  const bill = useMemo(() => {
    const base = price(target ?? current, cycle);
    const seats = extraSeats * EXTRA_SEAT_PRICE;
    const subtotal = base + seats;
    const tax = Math.round(subtotal * TAX_RATE * 100) / 100;
    return { base, seats, subtotal, tax, total: Math.round((subtotal + tax) * 100) / 100 };
  }, [target, current, cycle, extraSeats]);

  /**
   * The date this purchase would renew on.
   *
   * Computed the same way `subscribe` computes the one it stores, because the
   * sentence above Confirm Checkout is a promise about that stored date — a
   * review screen that names a different day from the receipt is the one bug on
   * this page nobody would report and everybody would notice.
   */
  const renewsOn = useMemo(() => {
    const d = new Date();
    if (cycle === "annual") d.setFullYear(d.getFullYear() + 1);
    else d.setMonth(d.getMonth() + 1);
    return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  }, [cycle]);

  /** Start over rather than resume: a cancelled checkout shouldn't leave a
   *  half-filled card behind for the next plan you look at. */
  function cancel() {
    setTarget(null);
    setDraft(EMPTY_DRAFT);
    setPayWith(primaryCard?.id ?? null);
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
    /* A card typed into the checkout is a card the org now has on file. It used
       to be read for the charge and then forgotten, so the next purchase asked
       for the same digits again and Payment Details still said "No card on
       file" the moment after you had paid with one. */
    if (!payWith) {
      addCard({
        number: draft.number,
        expires: draft.expiry,
        holder: draft.holder,
        billing: billingFrom(draft),
        primary: draft.makeDefault || cards.length === 0,
      });
    }
    subscribe({ plan: target, cycle, extraSeats, total: bill.total });
    notify(
      "Plan Upgraded Successfully",
      `Your subscription has been successfully upgraded. Enjoy the new features and increased quota included in your ${planLabel(target)}.`
    );
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
  const saved = cards.find((c) => c.id === payWith) ?? null;
  /* Choosing a card on file is already complete; typing one is not until every
     required field is answered. Same gate either way, one boolean. */
  const cardReady = payWith ? !!saved : draftComplete(draft);

  const charge: ChargeView = saved
    ? { brand: saved.brand, last4: saved.last4, holder: saved.holder, ...saved.billing }
    : {
        brand: "Card",
        last4: draft.number.replace(/\D/g, "").slice(-4),
        holder: draft.holder,
        ...billingFrom(draft),
      };

  return (
    <>
      <div className="flex items-center gap-4">
        <Button variant="secondary" size="sm" onClick={cancel}>
          Cancel
        </Button>
        <Stepper active={step} />
      </div>

      <div className="mt-8 grid gap-5 lg:grid-cols-[1fr_22rem]">
        <div>
          {stage === "seats" && (
            <SeatsStep
              plan={target ?? current}
              extraSeats={extraSeats}
              onExtraSeats={setExtraSeats}
            />
          )}
          {stage === "payment" && (
            <PaymentStep
              cards={cards}
              payWith={payWith}
              onPayWith={setPayWith}
              draft={draft}
              onDraft={(patch) => setDraft((d) => ({ ...d, ...patch }))}
            />
          )}
          {stage === "review" && (
            <ReviewStep
              charge={charge}
              org={org.legalName}
              onEdit={() => setStage("payment")}
            />
          )}
        </div>

        <OrderSummary
          plan={target ?? current}
          cycle={cycle}
          onCycle={setCycle}
          extraSeats={extraSeats}
          bill={bill}
          review={stage === "review"}
          renewsOn={renewsOn}
          agreed={agreed}
          onAgreed={setAgreed}
          action={
            stage === "review" ? (
              <Button variant="brand" className="w-full" disabled={!agreed} onClick={checkout}>
                Confirm Checkout
              </Button>
            ) : (
              <Button
                variant="brand"
                className="w-full"
                disabled={stage === "payment" && !cardReady}
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
        {/* THE THREE VERBS ARE THE THREE DIRECTIONS. "Switch Plan" was doing
            duty for a downgrade, which is the one move on this row that takes
            something away — so it says so, and wears the outline the product
            uses for a destructive-but-reversible action rather than the neutral
            one it shares with "cancel". */}
        <Button
          variant={here ? "secondary" : up ? "brand" : "outline"}
          className={cn("w-full", !here && !up && "border-danger/40 text-danger hover:border-danger hover:text-danger")}
          disabled={here}
          onClick={onChoose}
        >
          {here ? "Current Plan" : up ? "Upgrade Plan" : "Downgrade Plan"}
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

/**
 * PAY WITH WHAT, exactly.
 *
 * The step used to be a blank form every time, which meant an org that had
 * already given Terra a card was asked for it again on every upgrade — and then
 * asked to look at a screen called Payment Details afterwards that listed the
 * card it had just retyped. So the cards on file lead: the one that pays for
 * everything else is preselected, the others are one click away, and the form
 * is the LAST option rather than the only one.
 *
 * An org with nothing on file skips the chooser entirely. A list of no cards
 * above a "use a new card" row is a question with one answer.
 */
function PaymentStep({
  cards,
  payWith,
  onPayWith,
  draft,
  onDraft,
}: {
  cards: SavedCard[];
  payWith: string | null;
  onPayWith: (id: string | null) => void;
  draft: CardDraft;
  onDraft: (patch: Partial<CardDraft>) => void;
}) {
  const adding = payWith === null;

  return (
    <>
      <SectionTitle>
        {cards.length ? "Choose how to pay" : "Enter your payment details"}
      </SectionTitle>

      {cards.length > 0 && (
        <div className="mt-5 flex flex-col gap-2.5" role="radiogroup" aria-label="Payment method">
          {cards.map((c) => (
            <PayWithRow
              key={c.id}
              selected={payWith === c.id}
              onSelect={() => onPayWith(c.id)}
              data-ui={`pay-with-${c.id}`}
            >
              <CardBrandMark brand={c.brand} className="mt-0.5" />
              <span className="min-w-0 flex-1">
                <span className="type-body-strong flex flex-wrap items-center gap-2 text-content">
                  <span className="truncate">{savedCardName(c)}</span>
                  {c.primary && (
                    <span className="type-caption-strong shrink-0 rounded bg-glass/25 px-1.5 py-px text-content">
                      Default Payment
                    </span>
                  )}
                </span>
                <span className="type-body-dense mt-0.5 flex flex-wrap items-center gap-2">
                  <span className="text-content-muted">{maskedPan(c.last4)}</span>
                  <span aria-hidden className="h-3 w-px bg-line/20" />
                  <span className={isExpired(c.expires) ? "text-danger" : "text-content-subtle"}>
                    Expires On {c.expires}
                  </span>
                </span>
              </span>
            </PayWithRow>
          ))}

          <PayWithRow selected={adding} onSelect={() => onPayWith(null)} data-ui="pay-with-new">
            <span className="mt-0.5 grid h-6 w-[34px] shrink-0 place-items-center rounded border border-dashed border-line/25 text-content-muted">
              <Icon name="create" size={13} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="type-body-strong block text-content">Use a new card</span>
              <span className="type-body-dense mt-0.5 block text-content-subtle">
                It is saved to this organization for future charges.
              </span>
            </span>
          </PayWithRow>
        </div>
      )}

      {adding && (
        <Panel className="mt-5">
          <CardFields draft={draft} onDraft={onDraft} wide defaultLocked={cards.length === 0} />
        </Panel>
      )}
    </>
  );
}

/** One choice in the chooser. The whole row is the control, at every width. */
function PayWithRow({
  selected,
  onSelect,
  children,
  ...rest
}: {
  selected: boolean;
  onSelect: () => void;
  children: ReactNode;
} & { "data-ui"?: string }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      {...rest}
      className={cn(
        "flex items-start gap-3 rounded-xl border px-4 py-3.5 text-left transition-colors",
        selected
          ? "border-brand bg-glass/10"
          : "border-glass/10 bg-glass/5 hover:border-line/20"
      )}
    >
      {children}
      <span
        aria-hidden
        className={cn(
          "mt-1 grid h-4 w-4 shrink-0 place-items-center rounded-full border-2 transition-colors",
          selected ? "border-brand" : "border-line/25"
        )}
      >
        {selected && <span className="h-2 w-2 rounded-full bg-brand" />}
      </span>
    </button>
  );
}

/**
 * READ IT BACK BEFORE YOU PAY.
 *
 * Every fact here came from the step before it, so the panel's own action is
 * Edit Details rather than a set of live fields: this screen exists to be
 * checked, and a form you can check and change at the same time is one you
 * check less carefully. Edit Details walks back to the step that owns the
 * fields, which is also where Back goes — one way in, one way out.
 */
function ReviewStep({
  charge,
  org,
  onEdit,
}: {
  charge: ChargeView;
  org: string;
  onEdit: () => void;
}) {
  return (
    <>
      <SectionTitle>Let's make sure everything looks right</SectionTitle>

      <Panel className="mt-5 p-0">
        <div className="flex items-center gap-4 border-b border-glass/10 px-5 py-3.5">
          <p className="type-body-strong min-w-0 flex-1 text-content">Details</p>
          <button
            type="button"
            onClick={onEdit}
            className="type-body-strong shrink-0 text-brand transition-colors hover:text-brand-hover"
          >
            Edit Details
          </button>
        </div>
        <dl className="flex flex-col gap-4 p-5">
          <Detail label="Organization Name" value={org} />
          <Detail
            label="Card Number"
            value={
              <span className="flex items-center gap-2.5">
                <CardBrandMark brand={charge.brand} />
                {maskedPan(charge.last4)}
              </span>
            }
          />
          <Detail label="Card Holder Name" value={charge.holder} />
          <Detail label="Billing Address" value={charge.address} />
          <Detail label="Apt, Unit, Suite, etc" value={charge.apt || "N/A"} />
          <Detail label="City" value={charge.city || "N/A"} />
          <Detail label="Country" value={charge.country} />
          <Detail label="Postal Code" value={charge.postal} />
        </dl>
      </Panel>
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

/**
 * The running total, pinned beside every step so the price never leaves.
 *
 * IT IS TWO PANELS WEARING ONE FRAME. Through seats and payment it is "Your Pro
 * Plan" — the thing you are buying, with the term still switchable, because the
 * cheapest moment to change your mind about annual-vs-monthly is before you
 * have typed a card. At Review it becomes "Overview" and stops being editable:
 * the tax and the total arrive, the renewal date is stated, and the terms box
 * and Confirm Checkout sit under them. The switch moving out of reach at Review
 * is the point — the figure you are agreeing to must not be able to change
 * while you are agreeing to it.
 */
function OrderSummary({
  plan,
  cycle,
  onCycle,
  extraSeats,
  bill,
  review,
  renewsOn,
  agreed,
  onAgreed,
  action,
  back,
}: {
  plan: PlanId;
  cycle: BillingCycle;
  onCycle: (c: BillingCycle) => void;
  extraSeats: number;
  bill: { base: number; seats: number; subtotal: number; tax: number; total: number };
  /** the last step — totals in full, and the agreement */
  review: boolean;
  renewsOn: string;
  agreed: boolean;
  onAgreed: (v: boolean) => void;
  action: ReactNode;
  back: ReactNode;
}) {
  const spec = planSpec(plan);
  return (
    <Panel className="h-fit lg:sticky lg:top-6" data-ui="order-summary">
      <p className="font-display text-lg font-semibold text-content">
        {review ? "Overview" : `Your ${spec.name} Plan`}
      </p>

      {!review && <CycleChoice cycle={cycle} onCycle={onCycle} />}

      <div className="mt-5 flex flex-col gap-4">
        <Line
          label={`${spec.seats.full} Full seat${spec.seats.full === 1 ? "" : "s"}`}
          note={`Included with ${spec.name.toLowerCase()} · ${money(bill.base)}/ month`}
          value={`${money(bill.base)}/ mo`}
          rule
        />

        <p className="type-body-lg-strong text-content">Additional Seats:</p>

        {extraSeats > 0 && (
          <Line
            label={`${extraSeats} Full seat${extraSeats === 1 ? "" : "s"}`}
            note={`${money(EXTRA_SEAT_PRICE)}/ month × ${extraSeats}`}
            value={`${money(bill.seats)}/ mo`}
            rule
          />
        )}
        {spec.seats.viewers === "unlimited" && (
          <Line label="Viewer seats" note="Free/ month · unlimited" value="Free" muted rule />
        )}
      </div>

      <div className="mt-4 flex flex-col gap-4 border-t border-glass/10 pt-4">
        <Line
          label="Subtotal"
          note={review ? undefined : "See your total (Including taxes) in Review"}
          value={`${money(bill.subtotal)}/ mo`}
        />
        {review && (
          <>
            <Line label="Tax" note={`${(TAX_RATE * 100).toFixed(1)}%`} value={money(bill.tax)} />
            <Line label="Total due today" value={money(bill.total)} strong />
          </>
        )}
      </div>

      {review && (
        <div className="mt-5 flex flex-col gap-4">
          <p className="type-body text-content-muted">
            Your new billing cycle will begin today, and you&rsquo;ll be charged the
            full {cycle === "annual" ? "annual" : "monthly"} rate for the {spec.name}{" "}
            plan. Your next renewal will be on{" "}
            <span className="type-body-strong text-content">{renewsOn}</span>.
          </p>
          {/* The agreement gates the button beside it, so it sits above it
              rather than out on the step: a checkbox in one column disabling a
              control in another is how people end up hunting for what is wrong. */}
          <CheckField
            checked={agreed}
            onChange={onAgreed}
            label="I agree to both Terms of Services and Privacy Policy"
          />
        </div>
      )}

      <div className="mt-5 flex flex-col gap-2">
        {action}
        {back}
      </div>
    </Panel>
  );
}

/**
 * Annual or monthly, as two radios rather than a segmented track.
 *
 * The picker upstairs uses `Segmented`, which is right there: it switches what
 * the three cards are SHOWING. This one commits the term of a purchase, and the
 * design draws it as a choice between two options with the saving attached to
 * one of them — which is what a radio group is and what a two-up toggle is not.
 */
function CycleChoice({
  cycle,
  onCycle,
}: {
  cycle: BillingCycle;
  onCycle: (c: BillingCycle) => void;
}) {
  return (
    <div role="radiogroup" aria-label="Billing cycle" className="mt-4 flex flex-col gap-3">
      {(["annual", "monthly"] as BillingCycle[]).map((c) => (
        <div key={c} className="flex items-center gap-4">
          <button
            type="button"
            role="radio"
            aria-checked={cycle === c}
            onClick={() => onCycle(c)}
            className="flex items-center gap-2.5 text-left"
          >
            <span
              aria-hidden
              className={cn(
                "grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full border-2 transition-colors",
                cycle === c ? "border-brand" : "border-line/25"
              )}
            >
              {cycle === c && <span className="h-2 w-2 rounded-full bg-brand" />}
            </span>
            <span className="type-body text-content">{c === "annual" ? "Annual" : "Monthly"}</span>
          </button>
          {c === "annual" && (
            <span className="type-caption-strong rounded-md bg-success-soft px-3 py-1 text-success">
              Save up to 30%
            </span>
          )}
        </div>
      ))}
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

/* ------------------------------------------------------- the picker, as a sheet */

/**
 * CHOOSE A PLAN, WITHOUT LEAVING THE PAGE YOU ASKED FROM.
 *
 * Payment Details used to answer "View Plans" by throwing you out of Settings
 * to the marketing Pricing page — a good instinct badly aimed. The reason that
 * link existed was that Settings' picker and the public one had drifted; the
 * fix for two pickers is not to send billing to the one with the sales copy,
 * because now an admin reviewing the card on file is standing on a landing page
 * and has to find their way back.
 *
 * So the SAME picker the checkout uses opens over Payment Details, and choosing
 * from it hands the plan to the checkout exactly as the Pricing page does — one
 * flow, two doors. The drift the old comment worried about is handled at the
 * source instead: both pickers read `PLANS`, and both now end in this checkout.
 */
export function ChoosePlanDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { subscription, setPlanIntent, go } = useSettings();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="w-[64rem] max-w-[calc(100vw-2rem)] max-h-[calc(100vh-4rem)] overflow-y-auto"
        data-ui="choose-plan"
      >
        <DialogTitle className="type-title">Choose a Plan</DialogTitle>
        <DialogDescription className="mt-2">
          Select the plan that fits your needs. You can upgrade, downgrade, or add
          seats anytime — we&rsquo;ll adjust your next payment automatically.
        </DialogDescription>

        <div className="mt-5 grid items-stretch gap-4 lg:grid-cols-3">
          {PLANS.map((p) => (
            <PlanCard
              key={p.id}
              plan={p.id}
              cycle={subscription.cycle}
              current={subscription.plan}
              onChoose={() => {
                /* The sheet closes and the checkout opens holding the answer.
                   Leaving it open behind the flow would put two live pickers on
                   screen, one of which is already out of date. */
                setPlanIntent(p.id);
                onOpenChange(false);
                go("plans");
              }}
            />
          ))}
        </div>

        <p className="type-body mt-6 text-center text-content-subtle">
          Looking for a custom plan that fits your organisation&rsquo;s workflow?{" "}
          <a
            href="mailto:sales@terra.ai?subject=Custom%20plan"
            className="text-brand transition-colors hover:text-brand-hover"
          >
            Reach out to us
          </a>
        </p>
      </DialogContent>
    </Dialog>
  );
}
