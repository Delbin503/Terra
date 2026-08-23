import { useState } from "react";
import { Button, Select } from "@/components/ui";
import { EditButton, PageTitle, Panel, SectionTitle } from "./settings-parts";
import { useSettings } from "./settings-store";
import { planSpec } from "./subscription-data";

/**
 * PAYMENT DETAILS — the plan, the card, and who is allowed to spend on it.
 *
 * The purchasing restriction is the only setting here that changes what other
 * people can do, which is why it gets a section of its own rather than sitting
 * in the card panel next to a "View Details" link.
 */
export function PaymentDetailsPage() {
  const { org, go, subscription } = useSettings();
  const [who, setWho] = useState("owner-admins");

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
            <Button variant="brand" size="sm" onClick={() => go("plans")}>
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
              <p className="type-body mt-1 text-content-muted">
                Manage your saved card, billing address, and preferred payment
                method.
              </p>
            </div>
            <Button variant="secondary" size="sm" onClick={() => go("billing")}>
              View Details
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
          onChange={(e) => setWho(e.target.value)}
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
          <span className="type-body flex h-10 min-w-0 flex-1 items-center rounded-lg border border-glass/10 bg-surface px-3.5 text-content-subtle">
            {org.billingEmail}
          </span>
          <EditButton />
        </div>
      </Panel>
    </>
  );
}
