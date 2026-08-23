import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { Icon, type IconName } from "@/components/icons";
import { Select } from "@/components/ui";
import { NOTIFICATION_TABS, type NotificationCategory } from "./data";
import { useWorkspace } from "./workspace";

/**
 * NOTIFICATIONS — the activity log, docked beside the rail.
 *
 * It opens from the LEFT because that is where its button is: a panel that
 * arrives from the far side of the window makes you look away from what you
 * clicked. It sits against the rail rather than over it, so the rail stays
 * usable and the panel reads as an extension of it.
 *
 * The six tabs each answer a different question, so there is no "all" — a merged
 * feed of billing, security and project noise is the thing people stop reading.
 */

/** One glyph per category, so a row is identifiable before it is read. */
const MARK: Record<NotificationCategory, IconName> = {
  project: "projects",
  organization: "organization",
  billing: "payment",
  security: "lock",
  collaboration: "shared",
  system: "news",
};

export function NotificationsDrawer({
  open,
  railCollapsed,
  onClose,
}: {
  open: boolean;
  /** the rail's width decides where this panel starts */
  railCollapsed: boolean;
  onClose: () => void;
}) {
  const { notifications } = useWorkspace();
  const [tab, setTab] = useState<NotificationCategory | "all">("all");

  const shown = useMemo(
    () => (tab === "all" ? notifications : notifications.filter((n) => n.category === tab)),
    [notifications, tab]
  );

  const unreadTotal = notifications.filter((n) => n.unread).length;

  if (!open) return null;

  return (
    <>
      {/* Clicking the page puts it away — this is a peek, not a place. */}
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <aside
        aria-label="Notifications"
        style={{
          left: railCollapsed ? "var(--rail-w-collapsed)" : "var(--rail-w)",
        }}
        className="fixed top-0 z-50 flex h-screen w-[26rem] max-w-[calc(100vw-4rem)] animate-drawer-in flex-col glass-overlay !rounded-none border-y-0 border-l-0"
      >
        <header className="flex shrink-0 items-center gap-2 px-4 pb-3 pt-4">
          <h2 className="type-heading flex-1">Notifications</h2>
          <button
            type="button"
            aria-label="Close notifications"
            onClick={onClose}
            className="grid h-8 w-8 place-items-center rounded-md text-content-muted transition-colors hover:bg-glass/15 hover:text-content"
          >
            <Icon name="close" size={17} />
          </button>
        </header>

        {/* ONE filter, not six tabs.
            The categories were a horizontally scrolling tab row, which meant
            four of the six were always off-screen and the list only ever showed
            one slice — there was no way to see everything at once, which is the
            normal reason to open this. A select defaults to All and puts the
            narrowing one click away, and the counts ride in the option labels
            so you can still see where the unread ones are before choosing. */}
        <div className="shrink-0 border-b border-glass/10 px-3 pb-3">
          <Select
            aria-label="Filter notifications"
            className="w-full"
            value={tab}
            onChange={(e) => setTab(e.target.value as NotificationCategory | "all")}
            options={[
              { value: "all", label: `All${unreadTotal ? ` (${unreadTotal})` : ""}` },
              ...NOTIFICATION_TABS.map((t) => {
                const n = notifications.filter((x) => x.category === t.id && x.unread).length;
                return { value: t.id, label: n ? `${t.label} (${n})` : t.label };
              }),
            ]}
          />
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          {shown.length ? (
            shown.map((n) => (
              <article
                key={n.id}
                className={cn(
                  "flex gap-3 rounded-lg p-2.5 transition-colors hover:bg-glass/10",
                  n.unread && "bg-glass/10"
                )}
              >
                <span
                  className={cn(
                    "grid h-8 w-8 shrink-0 place-items-center rounded-lg",
                    n.unread
                      ? "bg-brand text-brand-foreground"
                      : "bg-glass/20 text-content-muted"
                  )}
                >
                  <Icon name={MARK[n.category]} size={16} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <h3 className="type-body-strong min-w-0 flex-1 text-content">
                      {n.title}
                    </h3>
                    <span className="type-caption shrink-0 text-content-subtle">
                      {n.at}
                    </span>
                  </div>
                  <p className="type-body mt-0.5 text-content-muted">{n.body}</p>
                </div>
              </article>
            ))
          ) : (
            <p className="type-body px-2.5 py-8 text-center text-content-subtle">
              Nothing here yet.
            </p>
          )}
        </div>
      </aside>
    </>
  );
}
