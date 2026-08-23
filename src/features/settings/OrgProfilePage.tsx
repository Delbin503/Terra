import { useState } from "react";
import { Icon } from "@/components/icons";
import { Button } from "@/components/ui";
import { DetailRow, EditButton, OrgMark, PageTitle, SectionTitle } from "./settings-parts";
import { useSettings } from "./settings-store";
import { ConfirmDialog, EditFieldDialog, useImagePicker } from "./settings-dialogs";

/**
 * ORG PROFILE — how the organization presents itself, and the one lever over its
 * subscription that isn't in Billing.
 *
 * Update stays disabled on the Free plan: there is no subscription to pause, and
 * a button that would fail is worse than one that says it can't.
 */
export function OrgProfilePage() {
  const { org, setOrg, notify } = useSettings();
  const [nameOpen, setNameOpen] = useState(false);
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

        <DetailRow
          label="Organization Name"
          value={org.name}
          action={<EditButton onClick={() => setNameOpen(true)} />}
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
                : "Your subscription is paused. Reactivate to resume billing and restore quota."
          }
          action={
            <Button
              variant="secondary"
              size="sm"
              disabled={onFreePlan}
              onClick={() => setPlanOpen(true)}
            >
              {org.planActive ? "Update" : "Reactivate"}
            </Button>
          }
        />
      </div>

      <EditFieldDialog
        open={nameOpen}
        onOpenChange={setNameOpen}
        title="Edit organization name"
        label="Organization name"
        hint="This is what members and shared projects will see."
        initial={org.name}
        onSave={(value) => {
          setOrg({ name: value });
          notify("Organization name updated.");
        }}
      />

      <ConfirmDialog
        open={planOpen}
        onOpenChange={setPlanOpen}
        title={org.planActive ? "Cancel this plan?" : "Reactivate this plan?"}
        body={
          org.planActive
            ? "Billing stops at the end of the current period. Your quota drops to the Free plan and generated datasets stay available."
            : "Billing resumes today and your plan quota is restored immediately."
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
