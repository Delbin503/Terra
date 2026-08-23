import { Icon } from "@/components/icons";
import { Button } from "@/components/ui";
import { OrgMark, PageTitle, Panel } from "./settings-parts";
import { seats } from "./settings-data";
import { useSettings } from "./settings-store";

/**
 * ORG DASHBOARD — the two things an admin opens Settings to deal with: who is
 * waiting for a seat, and how many seats there are to give.
 *
 * Side by side because the second is the answer to the first. Nothing else goes
 * here; every other number has its own page.
 */
export function OrgDashboardPage() {
  const { org, go } = useSettings();
  return (
    <>
      <PageTitle avatar={<OrgMark initials={org.initials} size={34} />}>
        {org.name}'s Organization Admin
      </PageTitle>

      <div className="mt-6 grid gap-5 lg:grid-cols-2">
        <Panel className="flex min-h-[22rem] flex-col p-0">
          <h2 className="font-display text-lg font-semibold border-b border-glass/10 px-5 py-4">
            Seat Request (0)
          </h2>
          <div className="grid flex-1 place-items-center p-5">
            <p className="type-body text-content-subtle">
              No pending access requests.
            </p>
          </div>
        </Panel>

        <Panel className="flex min-h-[22rem] flex-col p-0">
          <div className="flex items-center gap-3 border-b border-glass/10 px-5 py-3.5">
            <h2 className="font-display text-lg font-semibold">Total Seats</h2>
            <span className="type-numeric grid h-6 min-w-6 place-items-center rounded-full bg-surface-raised px-1.5 text-content">
              {seats.total}
            </span>
            <Button variant="brand" size="sm" className="ml-auto" onClick={() => go("members")}>
              Manage
            </Button>
          </div>
          <div className="flex flex-col gap-4 p-5">
            <SeatRow icon="shared" tone="brand" label="Assigned seats (Full Access)" value={seats.assigned} />
            <SeatRow icon="select-check" tone="success" label="Available seats (Full Access)" value={seats.available} />
            <SeatRow icon="visible" tone="warning" label="Viewer seats" value={seats.viewer} />
          </div>
        </Panel>
      </div>
    </>
  );
}

export function SeatRow({
  icon,
  tone,
  label,
  value,
}: {
  icon: "shared" | "select-check" | "visible";
  tone: "brand" | "success" | "warning";
  label: string;
  value: number;
}) {
  const tones = {
    brand: "bg-brand-soft text-brand",
    success: "bg-success-soft text-success",
    warning: "bg-warning-soft text-warning",
  };
  return (
    <div className="flex items-center gap-3">
      <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-md ${tones[tone]}`}>
        <Icon name={icon} size={16} />
      </span>
      <span className="type-body min-w-0 flex-1 text-content">{label}</span>
      <span className="type-body-strong tabular-nums text-content">{value}</span>
    </div>
  );
}
