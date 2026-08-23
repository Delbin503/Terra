import { useState } from "react";
import { Segmented, Switch } from "@/components/ui";
import { OrgMark, PageTitle, Panel, SectionTitle } from "./settings-parts";
import { messageTopics, orgNotifyRows } from "./settings-data";
import { useSettings } from "./settings-store";

/**
 * MESSAGE PREFERENCES — what we send, how often, and by which route.
 *
 * Three questions in that order, because each one narrows the last: opting out
 * makes the rest moot, so it comes first and the panel below it dims when the
 * answer is no. The org's own switches are a separate block: they are the org's
 * traffic, not yours, and you may want all of one and none of the other.
 */

type Cadence = "all" | "weekly" | "monthly" | "snooze";
type Route = "both" | "app" | "email";

const CADENCE: { value: Cadence; label: string }[] = [
  { value: "all", label: "All" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "snooze", label: "Snooze for 3 Months" },
];

const ROUTE: { value: Route; label: string }[] = [
  { value: "both", label: "Both" },
  { value: "app", label: "In App Only" },
  { value: "email", label: "Email Only" },
];

export function MessagePreferencesPage() {
  const { org } = useSettings();
  const [optedIn, setOptedIn] = useState(true);
  const [topics, setTopics] = useState<Record<string, boolean>>(
    Object.fromEntries(messageTopics.map((t) => [t.id, true]))
  );
  const [cadence, setCadence] = useState<Cadence>("all");
  const [route, setRoute] = useState<Route>("both");
  const [orgRows, setOrgRows] = useState<Record<string, boolean>>(
    Object.fromEntries(orgNotifyRows.map((r) => [r, true]))
  );

  return (
    <>
      <PageTitle>Message Preferences</PageTitle>

      <h2 className="type-title mt-6">
        {optedIn
          ? "You're Opted In to Platform Notifications"
          : "You're Opted Out of Platform Notifications"}
      </h2>
      <p className="type-body mt-1.5 text-content-muted">
        {optedIn
          ? "You're receiving updates, feature announcements, and important messages related to your account, organization, and Terra Builder updates."
          : "You won't receive platform updates or announcements. Account and security messages are still sent."}
      </p>

      <Segmented
        ariaLabel="Platform notifications"
        className="mt-4 grid w-full grid-cols-2 gap-1 p-1"
        options={[
          { value: "in", label: "Opt In" },
          { value: "out", label: "Opt Out" },
        ]}
        value={optedIn ? "in" : "out"}
        onChange={(v) => setOptedIn(v === "in")}
      />

      <Panel
        className={
          optedIn
            ? "mt-5"
            : "pointer-events-none mt-5 opacity-45"
        }
      >
        <SectionTitle>Which topics would you like updates on?</SectionTitle>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {messageTopics.map((topic) => (
            <div
              key={topic.id}
              className="flex items-start gap-4 rounded-xl border border-glass/10 p-4"
            >
              <div className="min-w-0 flex-1">
                <p className="type-body-strong text-content">{topic.label}</p>
                <p className="type-body mt-1 text-content-muted">{topic.body}</p>
              </div>
              <Switch
                label={topic.label}
                checked={topics[topic.id]}
                onChange={(next) =>
                  setTopics((t) => ({ ...t, [topic.id]: next }))
                }
              />
            </div>
          ))}
        </div>

        <SectionTitle>
          <span className="mt-6 block">Choose how often you want to receive messages</span>
        </SectionTitle>
        <Segmented
          ariaLabel="Message frequency"
          className="mt-3 grid w-full grid-cols-2 gap-1 p-1 sm:grid-cols-4"
          options={CADENCE}
          value={cadence}
          onChange={setCadence}
        />

        <SectionTitle>
          <span className="mt-6 block">Choose how we notify you</span>
        </SectionTitle>
        <Segmented
          ariaLabel="Notification channel"
          className="mt-3 grid w-full grid-cols-1 gap-1 p-1 sm:grid-cols-3"
          options={ROUTE}
          value={route}
          onChange={setRoute}
        />
      </Panel>

      <div className="mt-8 border-t border-glass/10 pt-6">
        <SectionTitle>Organization's Preferences</SectionTitle>

        <div className="mt-4 flex items-center gap-3">
          <OrgMark initials={org.initials} size={44} />
          <div>
            <p className="type-body-strong text-content">{org.name}</p>
            <p className="type-body text-content-muted">
              Choose which emails you receive from your org's activity.
            </p>
          </div>
        </div>

        <p className="type-body-strong mt-5 text-content">Notify me when:</p>
        <div className="mt-1">
          {orgNotifyRows.map((row) => (
            <div
              key={row}
              className="flex items-center gap-4 border-b border-glass/10 py-4 last:border-b-0"
            >
              <span className="type-body min-w-0 flex-1 text-content">{row}</span>
              <Switch
                label={row}
                checked={orgRows[row]}
                onChange={(next) => setOrgRows((r) => ({ ...r, [row]: next }))}
              />
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
