import { useState } from "react";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/icons";
import { Button } from "@/components/ui";
import { HomeTopBar } from "./HomeTopBar";
import {
  CURRENT_PLAN,
  CYCLES,
  PRICING_PLANS,
  type PriceView,
  type PricingPlan,
} from "./pricing-data";
import { SEAT_ICON, SEAT_TONE } from "@/features/settings/settings-data";
import type { BillingCycle } from "@/features/settings/subscription-data";

/**
 * PRICING — the three plans, side by side, before you own any of them.
 *
 * This is the page behind the top bar's "Pricing" link, which until now was a
 * button in brand orange with no handler on it: it looked like the way to the
 * plans from every screen in the app and did nothing on all of them.
 *
 * It is a DESTINATION IN THE SHELL, not a screen of its own — same rail, same
 * top bar, breadcrumbed off Home — because deciding what to pay for is a thing
 * you do in the middle of working, and being thrown out of the app to read a
 * price makes coming back a navigation problem.
 *
 * What it deliberately does NOT do is take the money. The upgrade buttons hand
 * off to Settings → Subscription, where seats, card and review already exist
 * (see PlansPage). One checkout, reached from two places, rather than a second
 * one grown out here where the marketing copy lives.
 *
 * IT FITS THE WINDOW. Three plans are a comparison, and a comparison you have to
 * scroll is three separate readings — by the time Pro's feature list is on
 * screen, Basic's is not, and the whole point of the layout is gone. So every
 * vertical measure on this page is `clamp(floor, Nvh, design)`: on a tall screen
 * each one sits at the value the design drew, and as the window shortens they
 * give way together rather than the page growing a scrollbar. The type does the
 * same for the two figures that carry the most height — the headline and the
 * price — while the prose keeps a fixed floor, because copy that shrinks with
 * the window stops being readable long before it stops fitting.
 */

/** The page's bands. Design value on a tall screen, floor on a short one. */
const BAND = {
  top: "pt-[clamp(0.25rem,2.6vh,3rem)]",
  bottom: "pb-[clamp(0.125rem,1.4vh,2.5rem)]",
  /** headline → copy */
  copy: "mt-[clamp(0.25rem,1.1vh,0.75rem)]",
  /** copy → toggle */
  toggle: "mt-[clamp(0.5rem,2vh,1.75rem)]",
  /** toggle → cards */
  cards: "mt-[clamp(0.5rem,2vh,2rem)]",
  /** cards → the custom-plan line */
  footer: "mt-[clamp(0.375rem,2vh,2.25rem)]",
};

/** The same idea inside a card, where most of the height actually is. */
const CARD = {
  pad: "p-[clamp(1rem,2.1vh,1.75rem)]",
  /** name → pitch */
  pitch: "mt-[clamp(0.375rem,1.4vh,0.875rem)]",
  /**
   * pitch → price, across the rule.
   *
   * THE RULE IS THE POINT. Above it the card is telling you what this plan is
   * for; below it, what it costs. Those are two different questions and they
   * were four lines of unbroken column — the pitch ran straight into the figure
   * with nothing between them but a gap the eye read as line spacing. A hairline
   * and room on both sides of it makes the price the start of something rather
   * than the fourth line of the paragraph above.
   */
  rule: "mt-[clamp(0.625rem,2vh,1.25rem)] border-t border-glass/10 pt-[clamp(0.625rem,2vh,1.25rem)]",
  /** the price well every card reserves, so the buttons line up */
  priceBox: "min-h-[clamp(2.25rem,5.8vh,4.5rem)]",
  /** price → the button. It had none: the figure sat on top of the control. */
  action: "mt-[clamp(0.5rem,1.6vh,1.125rem)] h-[clamp(2.25rem,4.8vh,3rem)]",
  /** price → "Key Features :", and the list → "Seats :" */
  section: "mt-[clamp(0.375rem,1.9vh,1.75rem)]",
  title: "mt-[clamp(0.25rem,1.7vh,1.5rem)]",
  list: "mt-[clamp(0.5rem,1.5vh,0.875rem)] gap-[clamp(0.3125rem,1.1vh,0.625rem)]",
  seatList: "mt-[clamp(0.25rem,1.2vh,0.75rem)] gap-[clamp(0.25rem,1.1vh,0.75rem)]",
  /**
   * The line box, which is where the rest of the height hides.
   *
   * Nine or ten lines of list per card, each carrying the type ramp's fixed
   * 20px line on 13px text: together that is the biggest thing on the card
   * after the price. Both sit at the ramp's values on anything 900px and
   * taller — the leading closes up first, and only below that does the prose
   * itself step down, and only as far as 12px, which is a size this product
   * already sets body copy at (`type-body-dense`). The floor is where it is
   * because a page that fits by becoming unreadable has not fitted.
   */
  line: "text-[clamp(0.75rem,1.55vh,0.8125rem)] leading-[clamp(1.05rem,1.85vh,1.25rem)]",
  noteLine: "text-[clamp(0.6875rem,1.4vh,0.75rem)] leading-[clamp(0.9rem,1.5vh,1.1rem)]",
};
export function PricingView({
  onHome,
  onChat,
}: {
  onHome: () => void;
  /** opens Terra AI from this page's top bar */
  onChat?: () => void;
}) {
  const [cycle, setCycle] = useState<BillingCycle>("monthly");

  return (
    <>
      <HomeTopBar
        /* The account cluster is dropped here, per the design: the credit
           balance and the way to Pricing are both answers to "what am I
           spending" — and this page is the long form of that question. Leaving
           its own link in the bar would point at the page you are reading. */
        minimal
        onChat={onChat}
        breadcrumb={
          <nav aria-label="Breadcrumb" className="type-body flex items-center gap-2">
            <button
              type="button"
              onClick={onHome}
              className="text-content-subtle transition-colors hover:text-content"
            >
              Home
            </button>
            <span aria-hidden className="text-content-subtle">
              /
            </span>
            <span className="text-content-muted">Pricings</span>
          </nav>
        }
      />

      <section className={cn("mx-auto max-w-[1440px]", BAND.top, BAND.bottom)}>
        {/* THE ASK ON THE LEFT, THE SWITCH ON THE RIGHT, one row.
            Centred, the three parts read as three separate announcements and
            cost three bands of height on a page whose whole problem is height.
            Side by side they are one sentence and one control: what you are
            choosing, and the terms you are choosing it on. It wraps to stacked
            when the row can't hold both. */}
        <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-3">
          <div className="min-w-[18rem] max-w-[46rem] flex-1">
            {/* The arbitrary size beside `font-display` is the sanctioned
                override (see the type styles in globals.css): the face stays the
                page's, the size answers to the window. `leading` comes with it —
                the ramp's line heights are fixed to their own sizes, so a
                clamped font in a fixed line box gives back none of the height it
                saved. */}
            <h1 className="font-display text-[clamp(1.375rem,3vh,1.875rem)] font-semibold leading-[1.15] tracking-tight">
              Choose a Plan
            </h1>
            <p
              className={cn(
                "type-body-lg text-[clamp(0.8125rem,1.5vh,0.9375rem)] leading-[1.45] text-content-muted",
                BAND.copy
              )}
            >
              Select the plan that fits your needs. You can upgrade, downgrade, or
              add seats anytime, we&rsquo;ll adjust your next payment automatically.
            </p>
          </div>

          <CycleToggle cycle={cycle} onCycle={setCycle} />
        </div>

        {/* Three columns that stay three: the cards are a comparison, and a
            comparison that wraps stops being one. Below `lg` they stack, which
            is the honest fallback — a column each, read in order. */}
        <div
          className={cn(
            "grid grid-cols-1 items-stretch gap-6 lg:grid-cols-3",
            BAND.cards
          )}
        >
          {PRICING_PLANS.map((plan) => (
            <PlanCard key={plan.id} plan={plan} cycle={cycle} />
          ))}
        </div>

        <p className={cn("type-body text-center text-content-muted", BAND.footer)}>
          Looking for a custom plan that fits your organisation&rsquo;s workflow?{" "}
          <a
            href="mailto:sales@terra.ai?subject=Custom%20plan"
            className="text-brand transition-colors hover:text-brand-hover"
          >
            Reach out to us
          </a>
        </p>
      </section>
    </>
  );
}

/**
 * Monthly or yearly, and what yearly saves you.
 *
 * Not the `Segmented` control the Projects toolbar uses: that one is a
 * control-height track for switching a view, and this is a 48px pill carrying a
 * promotional badge inside one of its two options. Same idea, different object
 * — forcing the badge into `Segmented` would put a marketing concern into every
 * filter in the product.
 */
function CycleToggle({
  cycle,
  onCycle,
}: {
  cycle: BillingCycle;
  onCycle: (c: BillingCycle) => void;
}) {
  return (
    <div
      role="group"
      aria-label="Billing cycle"
      className="flex w-fit shrink-0 items-center gap-1 rounded-full bg-surface p-1"
    >
      {CYCLES.map((c) => {
        const on = c.value === cycle;
        return (
          <button
            key={c.value}
            type="button"
            aria-pressed={on}
            onClick={() => onCycle(c.value)}
            className={cn(
              "type-button-sm flex h-[clamp(2rem,4.2vh,2.5rem)] items-center gap-2 rounded-full px-6 transition-colors",
              /* `surface-raised` is the pill everywhere else in the app, and it
                 is two lightness points off `surface` — at control scale that
                 reads, but on a 48px track with a badge in it the selection
                 vanished. `surface-overlay` is the next rung up the same ladder,
                 and the unselected label steps DOWN to subtle so the pair is
                 legible as one choice made rather than two labels sitting there. */
              on
                ? "bg-surface-overlay text-content"
                : "text-content-subtle hover:text-content"
            )}
          >
            {c.label}
            {c.badge && (
              <span className="type-badge-sm rounded-full bg-brand px-2 py-0.5 text-brand-foreground">
                {c.badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

function PlanCard({ plan, cycle }: { plan: PricingPlan; cycle: BillingCycle }) {
  const current = plan.id === CURRENT_PLAN;

  return (
    <div
      data-ui={`plan-card-${plan.id}`}
      className={cn(
        "glass flex flex-col !rounded-2xl",
        CARD.pad,
        // The popular one is lifted by its frost, not by an orange outline: the
        // brand is already spent on its button, and two brand marks on one card
        // leaves nothing louder for the thing you actually press.
        plan.popular && "bg-glass/8 border-glass/20"
      )}
    >
      <div className="flex items-start gap-3">
        <h2 className="font-display text-[clamp(1rem,2.1vh,1.25rem)] font-semibold leading-[1.2] tracking-tight">
          {plan.name}
        </h2>
        {plan.popular && (
          <span className="type-badge-sm ml-auto mt-1 shrink-0 rounded-md bg-brand-soft px-2 py-1 text-brand">
            Most Popular
          </span>
        )}
      </div>

      <p className={cn("type-body text-content-muted", CARD.line, CARD.pitch)}>
        {plan.pitch}
      </p>

      {/* ONE HEIGHT FOR EVERY PRICE, so the three buttons land on one line. The
          cards carry different amounts of it — a bare "Free", a figure with
          small print, a figure with a struck-through "was" and a credits line —
          and letting each size itself staggered the primary action across the
          row. */}
      <div className={cn("flex flex-col justify-start", CARD.rule, CARD.priceBox)}>
        <Price price={plan.price[cycle]} />
      </div>

      {current ? (
        /* NOT A BUTTON. This is the plan you are on: there is nothing to press,
           and a disabled control here would read as "temporarily unavailable"
           rather than "already yours". */
        <p
          aria-current="true"
          className={cn(
            "type-button-sm grid place-items-center rounded-lg border border-line/20 text-content",
            CARD.action
          )}
        >
          Current Plan
        </p>
      ) : (
        <Button
          variant={plan.popular ? "brand" : "secondary"}
          className={cn("w-full !rounded-lg", CARD.action)}
          data-ui={`plan-upgrade-${plan.id}`}
          /* Settings owns the checkout — seats, card, review — so the sell ends
             here and the transaction starts there. */
          onClick={() => {
            window.location.hash = "#settings/plans";
          }}
        >
          Upgrade Plan
        </Button>
      )}

      <p className={cn("type-body-strong text-content", CARD.section)}>
        {plan.featuresTitle}
      </p>

      <ul className={cn("flex flex-col", CARD.list)}>
        {plan.features.map((f) => (
          <li key={f.label} className="flex gap-2.5">
            <Icon
              name={f.included ? "check" : "close"}
              size={16}
              strokeWidth={2.4}
              aria-hidden
              className={cn(
                "mt-0.5 shrink-0",
                f.included ? "text-success" : "text-danger"
              )}
            />
            <span className="min-w-0">
              <span className={cn("type-body block text-content", CARD.line)}>
                {f.lit && <span className="text-brand">{f.lit} </span>}
                {f.label}
              </span>
              {f.note && (
                <span
                  className={cn(
                    "type-body-dense block text-content-subtle",
                    CARD.noteLine
                  )}
                >
                  {f.note}
                </span>
              )}
            </span>
            {/* The accessible name has to carry the tick's meaning: a crossed
                row reads identically to an included one without it. */}
            <span className="sr-only">{f.included ? "included" : "not included"}</span>
          </li>
        ))}
      </ul>

      <p className={cn("type-body-strong text-content", CARD.title)}>Seats :</p>

      <ul className={cn("flex flex-col", CARD.seatList)}>
        {plan.seats.map((s) => (
          <li key={s.label} className="flex gap-2.5">
            {/* Same glyph, same tone as the Members roster — see SEAT_ICON. */}
            <span
              className={cn(
                "mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-[6px]",
                SEAT_TONE[s.seat]
              )}
            >
              <Icon name={SEAT_ICON[s.seat]} size={12} aria-hidden />
            </span>
            <span className="min-w-0">
              <span className={cn("type-body block text-content", CARD.line)}>
                {s.label}
              </span>
              {s.note && (
                <span
                  className={cn(
                    "type-body-dense block text-content-subtle",
                    CARD.noteLine
                  )}
                >
                  {s.note}
                </span>
              )}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** The figure, and everything the design hangs off it. */
function Price({ price }: { price: PriceView }) {
  return (
    <>
      <div className="flex flex-wrap items-baseline gap-x-2.5">
        {price.was && (
          <span className="type-body-lg text-content-subtle line-through">
            {price.was}
          </span>
        )}
        <span className="font-display text-[clamp(1.25rem,2.7vh,1.75rem)] font-semibold leading-[1.1] tracking-tight">
          {price.amount}
        </span>
        {price.unit &&
          /* Two shapes for the small print, both from the design: monthly puts
             the unit beside the figure and "Billed monthly" on the line below;
             yearly stacks unit over note in the same slot beside the figure. */
          (price.was ? (
            <span className="flex flex-col leading-tight">
              <span className="type-body-dense text-content-muted">{price.unit}</span>
              {price.note && (
                <span className="type-caption text-content-subtle">{price.note}</span>
              )}
            </span>
          ) : (
            <span className="type-body text-content-muted">{price.unit}</span>
          ))}
      </div>

      {price.note && !price.was && (
        <span className="type-caption mt-1.5 text-content-subtle">{price.note}</span>
      )}

      {price.includes && (
        <span className="type-body mt-2 text-content">
          Includes <span className="text-brand">{price.includes.lit}</span>{" "}
          {price.includes.rest}
        </span>
      )}
    </>
  );
}
