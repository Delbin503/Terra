import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { Icon, type IconName } from "@/components/icons";
import { Select } from "@/components/ui";
import { NOTIFICATION_TABS, daysAgo, type NotificationCategory } from "./data";
import { useWorkspace } from "./workspace";

/**
 * NOTIFICATIONS — the activity log, docked beside the rail.
 *
 * It opens from the LEFT because that is where its button is: a panel that
 * arrives from the far side of the window makes you look away from what you
 * clicked. It sits against the rail rather than over it, so the rail stays
 * usable and the panel reads as an extension of it.
 *
 * The six categories each answer a different question, which is why the list
 * can be narrowed to one of them — a merged feed of billing, security and
 * project noise is the thing people stop reading.
 *
 * IT IS TYPED LIKE THE ASSISTANT, not like a page. This panel sits inches from
 * Terra AI and the editor's SAB thread, and it was set a whole step larger than
 * both — 14px titles and 14px bodies against their 12px — so two panels of the
 * same chrome, often open at once, read as two different applications. The list
 * follows the same ramp they do: a 12px semibold line, 12px prose under it, a
 * 10px timestamp, under a 14px panel title.
 */

/** How far back the list reaches. `null` is "however far the log goes". */
type Since = "any" | "today" | "week" | "month";

const WINDOW: Record<Since, number | null> = {
  any: null,
  today: 0,
  week: 7,
  month: 30,
};

const SINCE_OPTIONS: { value: Since; label: string }[] = [
  { value: "any", label: "Any time" },
  { value: "today", label: "Today" },
  { value: "week", label: "Last 7 days" },
  { value: "month", label: "Last 30 days" },
];

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
  const [since, setSince] = useState<Since>("any");

  const shown = useMemo(() => {
    const days = WINDOW[since];
    return notifications.filter(
      (n) =>
        (tab === "all" || n.category === tab) &&
        (days === null || daysAgo(n.at) <= days)
    );
  }, [notifications, tab, since]);

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
          <h2 className="type-panel-title flex-1 text-content">Notifications</h2>
          <button
            type="button"
            aria-label="Close notifications"
            onClick={onClose}
            className="grid h-8 w-8 place-items-center rounded-md text-content-muted transition-colors hover:bg-glass/15 hover:text-content"
          >
            <Icon name="close" size={16} />
          </button>
        </header>

        {/* TWO NARROWINGS, because there are two questions asked of a log:
            what kind of thing, and how recently.

            The categories were a horizontally scrolling tab row, which meant
            four of the six were always off-screen and the list only ever showed
            one slice — there was no way to see everything at once, which is the
            normal reason to open this. A select defaults to All and puts the
            narrowing one click away, and the counts ride in the option labels
            so you can still see where the unread ones are before choosing.

            The date filter is the other half of that. A month of activity is
            one scroll with no gaps in it, so "did anything happen since
            Friday?" meant reading every row until the timestamps got old.
            Both default to everything, and they compose. */}
        <div className="flex shrink-0 gap-2 border-b border-glass/10 px-3 pb-3">
          <Select
            aria-label="Filter notifications"
            className="min-w-0 flex-1"
            value={tab}
            onChange={(v) => setTab(v as NotificationCategory | "all")}
            options={[
              { value: "all", label: `All${unreadTotal ? ` (${unreadTotal})` : ""}` },
              ...NOTIFICATION_TABS.map((t) => {
                const n = notifications.filter((x) => x.category === t.id && x.unread).length;
                return { value: t.id, label: n ? `${t.label} (${n})` : t.label };
              }),
            ]}
          />
          <Select
            aria-label="Filter notifications by date"
            className="min-w-0 flex-1"
            value={since}
            onChange={(v) => setSince(v as Since)}
            options={SINCE_OPTIONS}
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
                    "grid h-7 w-7 shrink-0 place-items-center rounded-lg",
                    n.unread
                      ? "bg-brand text-brand-foreground"
                      : "bg-glass/20 text-content-muted"
                  )}
                >
                  <Icon name={MARK[n.category]} size={14} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <h3 className="type-label-strong min-w-0 flex-1 text-content">
                      {n.title}
                    </h3>
                    <span className="type-caption shrink-0 text-content-subtle">
                      {n.at}
                    </span>
                  </div>
                  <p className="type-body-dense mt-0.5 text-content-muted">{n.body}</p>
                </div>
              </article>
            ))
          ) : (
            <p className="type-body-dense px-2.5 py-8 text-center text-content-subtle">
              {notifications.length
                ? "Nothing in this slice — widen the category or the date."
                : "Nothing here yet."}
            </p>
          )}
        </div>
      </aside>
    </>
  );
}
