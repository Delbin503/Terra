import { useState } from "react";
import { Button, Select } from "@/components/ui";
import { EditButton, PageTitle, Panel, SectionTitle } from "./settings-parts";
import { useSettings } from "./settings-store";
import { PaymentMethodsDialog } from "./PaymentMethodsDialog";
import { ChoosePlanDialog } from "./PlansPage";
import { CardBrandMark, maskedPan } from "./card-parts";
import { planSpec } from "./subscription-data";

/**
 * PAYMENT DETAILS — the plan, the card, and who is allowed to spend on it.
 *
 * The purchasing restriction is the only setting here that changes what other
 * people can do, which is why it gets a section of its own rather than sitting
 * in the card panel next to a "View Details" link.
 */
export function PaymentDetailsPage() {
  const { org, subscription, cards, card } = useSettings();
  const [who, setWho] = useState("owner-admins");
  /** the cards sheet — the second question this page is asked */
  const [methods, setMethods] = useState(false);
  /** the plan sheet — the first one */
  const [plans, setPlans] = useState(false);

  return (
    <>
      <PageTitle>Payment Details</PageTitle>

      <div className="mt-6 grid gap-5 lg:grid-cols-2">
        <Panel>
          <p className="type-body text-content">
            Subscription for your organization:{" "}
            <span className="type-body-strong">{org.legalName}</span>
          </p>
          <div className="mt-4 flex flex-wrap items-start gap-4">
            <div className="min-w-0 flex-1">
              <p className="font-display text-lg font-semibold text-content">
                {planSpec(subscription.plan).name}
              </p>
              <p className="type-body mt-1 text-content-muted">
                {planSpec(subscription.plan).pitch}
              </p>
            </div>
              {/* The plans open OVER this page rather than throwing an admin out
                of Settings to the marketing site to read them — see
                ChoosePlanDialog. Picking one lands in the same checkout the
                Pricing page hands off to, so there is still one transaction. */}
            <Button variant="brand" size="sm" data-ui="view-plans" onClick={() => setPlans(true)}>
              View Plans
            </Button>
          </div>
        </Panel>

        <Panel>
          <p className="type-body text-content">Payment Methods</p>
          <div className="mt-4 flex flex-wrap items-start gap-4">
            <div className="min-w-0 flex-1">
              <p className="font-display text-lg font-semibold text-content">
                Payment Details
              </p>
              {/* It says what is actually on file. "Manage your saved card"
                  was the same sentence whether the org had three cards or
                  none — and the answer to "what am I charged on" is the one
                  thing a payment panel should be able to state without being
                  opened. */}
              {card ? (
                <p className="type-body mt-1 flex flex-wrap items-center gap-2 text-content-muted">
                  <CardBrandMark brand={card.brand} />
                  <span>
                    {maskedPan(card.last4)} · {cards.length} card
                    {cards.length === 1 ? "" : "s"} on file
                  </span>
                </p>
              ) : (
                <p className="type-body mt-1 text-content-muted">
                  No card on file. Add one to top up credits or change plan.
                </p>
              )}
            </div>
            <Button
              variant="secondary"
              size="sm"
              data-ui="payment-view-details"
              onClick={() => setMethods(true)}
            >
              {cards.length ? "View Details" : "Add card"}
            </Button>
          </div>
        </Panel>
      </div>

      <Panel className="mt-5">
        <SectionTitle>Team purchasing restrictions</SectionTitle>
        <p className="type-body mt-2 text-content-muted">
          Set permissions for who can access your saved payment method:
        </p>
        <p className="type-body mt-3 text-content-muted">
          Who can purchase paid elements?
        </p>
        <Select
          aria-label="Who can purchase paid elements"
          value={who}
          onChange={setWho}
          options={[
            { value: "owner-admins", label: "Owner & Admins" },
            { value: "owner", label: "Owner only" },
            { value: "everyone", label: "Everyone in the org" },
          ]}
          className="mt-2 h-10 w-full"
        />
      </Panel>

      <Panel className="mt-5">
        <p className="type-body-strong text-content">
          Billing Contact Email <span className="text-danger">*</span>
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <span className="field-well type-body flex h-10 min-w-0 flex-1 items-center rounded-lg px-3.5 text-content-subtle">
            {org.billingEmail}
          </span>
          <EditButton />
        </div>
      </Panel>

      <PaymentMethodsDialog open={methods} onOpenChange={setMethods} />
      <ChoosePlanDialog open={plans} onOpenChange={setPlans} />
    </>
  );
}
