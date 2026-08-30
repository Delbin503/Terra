import { useState } from "react";
import { Icon } from "@/components/icons";
import { Button, ConfirmDialog } from "@/components/ui";
import { DetailRow, InlineEditRow, OrgMark, PageTitle, SectionTitle } from "./settings-parts";
import { useSettings } from "./settings-store";
import { useImagePicker } from "./settings-dialogs";

/**
 * ORG PROFILE — how the organization presents itself, and the one lever over its
 * subscription that isn't in Billing.
 *
 * Update stays disabled on the Free plan: there is no subscription to pause, and
 * a button that would fail is worse than one that says it can't.
 */
export function OrgProfilePage() {
  const { org, setOrg, notify } = useSettings();
  const [planOpen, setPlanOpen] = useState(false);
  const onFreePlan = org.plan === "Free Plan";

  const picker = useImagePicker((url) => {
    setOrg({ logo: url });
    notify("Organization logo updated.");
  });

  return (
    <>
      {picker.input}
      <PageTitle>Organization Profile</PageTitle>

      <div className="mt-6">
        <SectionTitle>Organization Details</SectionTitle>

        <div className="mt-4 flex flex-wrap items-center gap-5 border-b border-glass/10 pb-6">
          {org.logo ? (
            <img
              src={org.logo}
              alt={org.name}
              className="h-20 w-20 shrink-0 rounded-full object-cover"
            />
          ) : (
            <OrgMark initials={org.initials} size={80} />
          )}
          <div className="min-w-[16rem] flex-1">
            <p className="type-body-strong text-content">Organization Logo</p>
            <p className="type-body-dense mt-1 text-content-muted">
              Upload a logo that represents your organization!
            </p>
          </div>
          <div className="flex shrink-0 gap-2.5">
            {org.logo && (
              <Button
                variant="danger"
                size="sm"
                className="border border-danger/60 bg-transparent text-danger hover:bg-danger/15 hover:brightness-100"
                onClick={() => {
                  setOrg({ logo: null });
                  notify("Organization logo removed.");
                }}
              >
                <Icon name="trash" size={15} />
                Remove
              </Button>
            )}
            <Button variant="secondary" size="sm" onClick={picker.open}>
              <Icon name={org.logo ? "retry" : "upload"} size={15} />
              {org.logo ? "Replace" : "Upload Photo"}
            </Button>
          </div>
        </div>

        {/* IN PLACE, like My Profile's Name and Work Email.
            This was the only editable fact in Settings that opened a modal to
            change one word: same row, same Edit button, and then a different
            interaction behind it — the page you were reading covered up to
            retype a name already on screen. `InlineEditRow` is the pattern the
            account side settled on, so the org side uses it too. */}
        <InlineEditRow
          label="Organization Name"
          display={org.name}
          fields={[{ key: "name", label: "Organization Name", value: org.name }]}
          onSave={(v) => {
            setOrg({ name: v.name });
            notify("Organization name updated.");
          }}
        />
      </div>

      <div className="mt-8">
        <SectionTitle>Organization Setting</SectionTitle>
        <DetailRow
          className="mt-2"
          label="Cancel or Reactivate Plan"
          value={
            onFreePlan
              ? "Pause or resume your current subscription anytime. There's nothing to pause on the Free plan."
              : org.planActive
                ? "Pause or resume your current subscription anytime."
                : "Your subscription is paused. Reactivate to resume billing and restore full access."
          }
          /* DRAWN LIKE MY PROFILE'S SECURITY SECTION, because it is the same
             kind of row: the one action on the page that takes something away.
             Cancelling wears the danger outline "Delete Account" wears;
             bringing the plan back is an ordinary secondary. It used to be a
             neutral "Update" either way — a word that says nothing about which
             of the two it is about to do. */
          action={
            org.planActive ? (
              <Button
                variant="danger"
                size="sm"
                disabled={onFreePlan}
                className="border border-danger/60 bg-transparent text-danger hover:bg-danger/15 hover:brightness-100"
                onClick={() => setPlanOpen(true)}
              >
                Cancel Plan
              </Button>
            ) : (
              <Button variant="secondary" size="sm" onClick={() => setPlanOpen(true)}>
                Reactivate Plan
              </Button>
            )
          }
        />
      </div>


      <ConfirmDialog
        open={planOpen}
        onOpenChange={setPlanOpen}
        title={org.planActive ? "Cancel this plan?" : "Reactivate this plan?"}
        body={
          org.planActive
            ? "Billing stops at the end of the current period. Your credit balance and generated datasets stay available."
            : "Billing resumes today and full plan access is restored immediately."
        }
        confirmLabel={org.planActive ? "Cancel Plan" : "Reactivate"}
        tone={org.planActive ? "danger" : "brand"}
        onConfirm={() => {
          setOrg({ planActive: !org.planActive });
          notify(org.planActive ? "Plan cancelled." : "Plan reactivated.");
        }}
      />
    </>
  );
}
