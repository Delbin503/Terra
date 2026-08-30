import { useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/icons";
import { IconButton, Tooltip } from "@/components/ui";
import { AppBackdrop } from "@/features/home/AppBackdrop";
import type { Destination as AppDestination } from "@/features/home/Sidebar";
import { OrgMark } from "./settings-parts";
import { SETTINGS_NAV, type SettingsPage } from "./settings-data";
import { SettingsProvider, useSettings } from "./settings-store";
import { SettingsToast } from "./settings-toast";
import { ProfilePage } from "./ProfilePage";
import { MessagePreferencesPage } from "./MessagePreferencesPage";
import { OrganizationsPage } from "./OrganizationsPage";
import { OrgDashboardPage } from "./OrgDashboardPage";
import { MembersPage } from "./MembersPage";
import { ProjectAccessPage } from "./ProjectAccessPage";
import { ActivityLogsPage } from "./ActivityLogsPage";
import { TerraBalancePage } from "./TerraBalancePage";
import { OrgProfilePage } from "./OrgProfilePage";
import { PaymentDetailsPage } from "./PaymentDetailsPage";
import { BillingPage } from "./BillingPage";
import { PlansPage } from "./PlansPage";

/**
 * SETTINGS — its own shell, not a page inside the app's.
 *
 * The app rail is about making things; this rail is about the account, and the
 * two lists have nothing to say to each other. So Settings replaces the whole
 * frame — its own slim top bar, its own rail — and the way out is the back arrow
 * at the top of that rail, which is the only navigation the two shells share.
 */
export function SettingsView({
  onExit,
  start,
}: {
  onExit: (to?: AppDestination) => void;
  /** which page to open on — omitted, Settings opens where it always has */
  start?: SettingsPage;
}) {
  return (
    <SettingsProvider start={start} onExit={onExit}>
      <SettingsShell onExit={onExit} />
    </SettingsProvider>
  );
}

/** The screens whose content is a table rather than a column of prose. */
const WIDE = new Set<SettingsPage>([
  "members",
  "project-access",
  "activity",
  "balance",
  "billing",
  "plans",
]);

function SettingsShell({ onExit }: { onExit: (to?: AppDestination) => void }) {
  const { page, go } = useSettings();
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="flex min-h-screen">
      <AppBackdrop />

      {/* Same anatomy as the app shell: a full-height rail on the left, and one
          scrolling column beside it that owns its own top bar. Settings used to
          hang a full-width header ACROSS both, which made it the only screen in
          the product where the rail started below the fold — the frame changed
          shape on the way in, so the account felt like a different application
          rather than a room in this one. */}
      <SettingsRail
        page={page}
        onPage={go}
        onExit={() => onExit("home")}
        collapsed={collapsed}
        onToggle={() => setCollapsed((c) => !c)}
      />

      <main className="h-screen flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[1600px] px-8 pb-20 pt-6">
          <SettingsTopBar onExit={onExit} />
          <SettingsToast />

          {/* Most of Settings is a column of facts you READ, so it's held to a
              comfortable measure. The table screens are the exception: six
              columns of roster don't fit in 62rem and start wrapping every cell
              into a paragraph, so they get the window. */}
          <div className={cn("mx-auto mt-6", WIDE.has(page) ? "max-w-none" : "max-w-[62rem]")}>
            {page === "profile" && <ProfilePage />}
            {page === "messages" && <MessagePreferencesPage />}
            {page === "organizations" && <OrganizationsPage />}
            {page === "dashboard" && <OrgDashboardPage />}
            {page === "members" && <MembersPage />}
            {page === "project-access" && <ProjectAccessPage />}
            {page === "activity" && <ActivityLogsPage />}
            {page === "balance" && <TerraBalancePage />}
            {page === "org-profile" && <OrgProfilePage />}
            {page === "payment" && <PaymentDetailsPage />}
            {page === "billing" && <BillingPage />}
            {page === "plans" && <PlansPage />}
          </div>
        </div>
      </main>
    </div>
  );
}

/**
 * The settings rail. Deliberately the same object as the app's Sidebar — glass,
 * flush to the left edge, brand at the top, full height — because it is the
 * same slot in the frame. Only the list inside it differs, which is the one
 * thing that SHOULD differ: that rail is about making things, this one is about
 * the account.
 */
function SettingsRail({
  page,
  onPage,
  onExit,
  collapsed,
  onToggle,
}: {
  page: SettingsPage;
  onPage: (p: SettingsPage) => void;
  onExit: () => void;
  collapsed: boolean;
  onToggle: () => void;
}) {
  const { org } = useSettings();
  return (
    <aside
      aria-label="Settings"
      className={cn(
        "glass sticky top-0 hidden h-screen shrink-0 flex-col overflow-y-auto !rounded-none border-y-0 border-l-0 p-3 transition-[width] duration-200 md:flex",
        collapsed ? "w-rail-collapsed" : "w-rail"
      )}
    >
      {/* Brand + the collapse control, in the app rail's exact arrangement:
          the lockup swaps between two files and the toggle floats off the edge
          once there's no room for it inline. */}
      <div className={cn("mb-5 flex items-center", collapsed && "justify-center")}>
        <img
          src={collapsed ? "/logo-collapse.svg" : "/logo-expand.svg"}
          alt="Terra"
          className={cn("shrink-0", collapsed ? "h-5" : "h-6")}
        />
        <IconButton
          icon={collapsed ? "sidebar-expand" : "sidebar-collapse"}
          label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          variant="solid"
          size="sm"
          iconSize={16}
          onClick={onToggle}
          className={cn("ml-auto", collapsed && "glass-chrome absolute -right-3.5 top-5")}
        />
      </div>

      {/* The way back out. It's the only navigation the two shells share, so it
          leads the rail rather than hiding in a corner of the top bar. */}
      <Tooltip label="Back to Terra" hidden={!collapsed}>
        <button
          type="button"
          onClick={onExit}
          className={cn(
            "mb-3 flex items-center gap-2 rounded-lg py-1.5 text-content transition-colors hover:bg-glass/15 hover:text-brand",
            collapsed ? "justify-center px-0" : "px-1.5"
          )}
        >
          <Icon name="chevron-left" size={18} className="shrink-0" />
          {!collapsed && <span className="font-display text-base font-bold">Settings</span>}
        </button>
      </Tooltip>

      {SETTINGS_NAV.map((group) => (
        <div key={group.section} className="border-t border-glass/10 py-3">
          {/* A section label is a word, and a word has nowhere to go in a 60px
              rail. Collapsed, the rule between groups carries the grouping on
              its own — which is what it was doing anyway. */}
          {!collapsed && (
            <p className="type-caption mb-2 px-2 text-content-subtle">{group.section}</p>
          )}

          {/* The org this rail is administering, named once above its own
              group rather than repeated in every row's label. */}
          {group.section === "Organization Management" &&
            (collapsed ? (
              <Tooltip label={`${org.name} · ${org.plan}`}>
                <div className="mb-2 flex justify-center">
                  <OrgMark initials={org.initials} size={26} />
                </div>
              </Tooltip>
            ) : (
              <div className="glass-thin mb-2 flex items-center gap-2.5 !rounded-lg px-2.5 py-2">
                <OrgMark initials={org.initials} size={26} />
                <span className="min-w-0 flex-1">
                  <span className="type-body-strong block truncate">{org.name}</span>
                  <span className="mt-0.5 flex items-center gap-1.5">
                    <span className="type-caption-strong rounded bg-accent-soft px-1.5 py-px text-accent">
                      {org.plan}
                    </span>
                    <span className="type-caption text-content-subtle">{org.members} Member</span>
                  </span>
                </span>
              </div>
            ))}

          <div className="flex flex-col gap-0.5">
            {group.items.map((item) => (
              <Tooltip key={item.id} label={item.label} hidden={!collapsed}>
                <button
                  type="button"
                  aria-current={page === item.id ? "page" : undefined}
                  onClick={() => onPage(item.id)}
                  className={cn(
                    "flex items-center gap-2.5 rounded-lg py-2 text-left transition-colors",
                    page === item.id
                      ? "bg-glass/20 text-content"
                      : "text-content-muted hover:bg-glass/10 hover:text-content",
                    collapsed ? "justify-center px-0" : "px-2.5"
                  )}
                >
                  <Icon name={item.icon} size={17} className="shrink-0" />
                  {!collapsed && <span className="type-body truncate">{item.label}</span>}
                </button>
              </Tooltip>
            ))}
          </div>
        </div>
      ))}
    </aside>
  );
}

/**
 * The settings bar. One thing only: the trail back into the app.
 *
 * It used to carry Pricing, the quota pill, downloads, notifications and the
 * avatar — the dashboard's bar, copied. But none of that is what you came here
 * for: Settings is a place you arrive at deliberately and leave deliberately,
 * and a row of app chrome above it just repeats controls that belong to the
 * work, not to the account. So the bar is a breadcrumb, and the account
 * material lives on the pages that are actually about it.
 */
function SettingsTopBar({ onExit }: { onExit: (to?: AppDestination) => void }) {
  const { page } = useSettings();
  // The rail names most pages; the ones you only arrive at name themselves.
  const here =
    SETTINGS_NAV.flatMap((g) => g.items).find((i) => i.id === page) ??
    (page === "plans" ? { label: "Plans" } : null);

  return (
    <nav aria-label="Breadcrumb" className="type-body flex items-center gap-2">
      <Crumb onClick={() => onExit("home")}>Home</Crumb>
      <Slash />
      <Crumb onClick={() => onExit("projects")}>Projects</Crumb>
      <Slash />
      <span className="text-content-muted">Settings</span>
      {here && (
        <>
          <Slash />
          <span className="text-content">{here.label}</span>
        </>
      )}
    </nav>
  );
}

/** A crumb that leaves Settings entirely — the app shell is the parent here. */
function Crumb({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-content-subtle transition-colors hover:text-content"
    >
      {children}
    </button>
  );
}

function Slash() {
  return (
    <span aria-hidden className="text-content-subtle">
      /
    </span>
  );
}
