import { useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { Icon, type IconName } from "@/components/icons";
import { Avatar, IconButton, Tooltip } from "@/components/ui";
import { useDismissable } from "@/features/editor/use-dismissable";
import { credits } from "./data";
import { SHELVES, type Shelf } from "./shelves";
import { useWorkspace } from "./workspace";

/**
 * The destinations the app can actually show.
 *
 * `pricing` is one of them without being a row here: it is reached from the top
 * bar's Pricing link on every page, and a rail entry for it would put a
 * purchase next to the four places your work lives.
 */
export type Destination = "home" | "projects" | "community" | "trash" | "pricing";

interface NavItem {
  icon: IconName;
  label: string;
  /** null = in the design, no screen behind it yet */
  to: Destination | null;
}

/**
 * The four destinations. Deliberately short: Search and Library were rail items
 * that duplicated the command bar and the Projects grid respectively, and every
 * extra row here costs the workspace card at the bottom the room it needs to
 * read as a single block rather than a stack of leftovers.
 */
const NAV: NavItem[] = [
  { icon: "home", label: "Home", to: "home" },
  { icon: "projects", label: "Projects", to: "projects" },
  { icon: "world", label: "Community", to: "community" },
  { icon: "trash", label: "Trash", to: "trash" },
];

/**
 * Sidebar — brand, Create, the four destinations, and the workspace block.
 *
 * The workspace block is pinned to the bottom on purpose. Plan, usage and
 * "Add Credits" are one question — *how much have I got left* — so they sit in
 * one bordered card instead of being spread between a footer row and a top-bar
 * pill. What stays out of it is the balance itself, which lives in the top bar
 * next to Pricing: that's the number you check mid-task, and it shouldn't
 * require looking down here.
 */
export function Sidebar({
  collapsed,
  onToggle,
  onCreate,
  at,
  onNavigate,
  shelf,
  onShelf,
  onDownloads,
  downloads,
  onNotifications,
  unread,
}: {
  collapsed: boolean;
  onToggle: () => void;
  onCreate: () => void;
  /** which destination is showing */
  at: Destination;
  onNavigate: (to: Destination) => void;
  /** which Projects shelf is showing, for the nested rows */
  shelf: Shelf;
  onShelf: (shelf: Shelf) => void;
  /** open the Work Orders table — where an archive actually comes from */
  onDownloads: () => void;
  /** runs still in flight, so the button can say there is something coming */
  downloads: number;
  onNotifications: () => void;
  /** drives the dot — a bell with no unread has nothing to announce */
  unread: number;
}) {
  const { org } = useWorkspace();

  return (
    <aside
      className={cn(
        "glass sticky top-0 flex h-screen shrink-0 flex-col !rounded-none border-y-0 border-l-0 p-3 transition-[width] duration-200",
        collapsed ? "w-rail-collapsed" : "w-rail"
      )}
    >
      {/* Brand. Two files rather than a mark plus a text span: the wordmark is
          drawn into the expanded logo, so the rail swaps the whole lockup and
          nothing has to be kept in visual sync with it. */}
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
          className={cn(
            "ml-auto",
            collapsed && "glass-chrome absolute -right-3.5 top-5"
          )}
        />
      </div>

      {/* Create — the icon tile carries the brand, the label stays plain text.
          A full-width orange button next to four plain nav rows made the rail
          top-heavy and left "Create" competing with the greeting for the eye. */}
      <Tooltip label="Create" hidden={!collapsed}>
        <button
          type="button"
          onClick={onCreate}
          className={cn(
            "mb-2 flex items-center gap-2.5 rounded-lg py-1.5 text-left transition-colors hover:bg-glass/15",
            // Collapsed the row is exactly as wide as the icon tile, so any
            // horizontal padding pushes the tile off the rail's centre line.
            collapsed ? "w-full justify-center px-0" : "-mx-1 px-1 pr-3"
          )}
        >
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-brand text-brand-foreground shadow-xs">
            <Icon name="create" size={18} strokeWidth={2.2} />
          </span>
          {!collapsed && <span className="type-body-strong">Create</span>}
        </button>
      </Tooltip>

      <nav className="flex flex-col gap-0.5">
        {NAV.map((item) => (
          <div key={item.label} className="flex flex-col gap-0.5">
            <NavButton
              item={item}
              collapsed={collapsed}
              active={item.to === at}
              onClick={item.to ? () => onNavigate(item.to as Destination) : undefined}
            />

            {/* The Projects shelves hang off their destination rather than
                living in a second rail on the page: one place answers "where
                am I", and the page keeps the width the covers need. */}
            {item.to === "projects" && at === "projects" && (
              <div
                className={cn(
                  "mb-1 flex flex-col gap-0.5",
                  // Collapsed there is no room for a rule and an indent — the
                  // rows would have ~20px left for a 15px glyph — so the nesting
                  // is carried by the smaller icons and the tooltips instead.
                  collapsed ? "items-center" : "ml-4 border-l border-glass/10 pl-2"
                )}
              >
                {SHELVES.map((s) => (
                  <Tooltip key={s.id} label={s.label} hidden={!collapsed}>
                    <button
                      type="button"
                      aria-current={shelf === s.id ? "page" : undefined}
                      onClick={() => onShelf(s.id)}
                      className={cn(
                        "type-body-dense flex items-center gap-2 rounded-md py-1.5 text-left transition-colors",
                        shelf === s.id
                          ? "bg-glass/20 text-content"
                          : "text-content-muted hover:text-content",
                        collapsed ? "w-full justify-center px-0" : "px-2"
                      )}
                    >
                      <Icon name={s.icon} size={15} />
                      {!collapsed && <span className="truncate">{s.label}</span>}
                    </button>
                  </Tooltip>
                ))}
              </div>
            )}
          </div>
        ))}
      </nav>

      <div className="mx-1 mt-3 h-px bg-glass/10" />

      {/* Workspace + usage + account actions */}
      <div className="mt-auto flex flex-col gap-2">
        {collapsed ? (
          <Tooltip label={`${org.name} · ${org.plan}`}>
            <button type="button" className="mx-auto">
              <Avatar name={org.name} size={30} />
            </button>
          </Tooltip>
        ) : (
          <div className="glass-thin !rounded-lg p-2.5">
            <OrgSwitcher />

            {/* ONE FIGURE, NO METERS. The two bars here were a monthly Img and
                video allowance — a second currency that had to be read
                alongside the credit balance to answer one question, and that
                could say "fine" about a run the balance could not pay for.
                Credits buy every run, so the balance is the whole readout, and
                a bar under it would be measuring against a cap that no longer
                exists. */}
            <div className="mt-3 flex items-baseline gap-2">
              {/* The same bolt the top bar, the dispatch review and the Work
                  Orders table put beside a credit figure. Without it this row
                  was the only place in the app where a credit balance was a
                  bare word and a bare number. */}
              <Icon name="credits" size={13} className="shrink-0 text-brand" />
              <span className="type-caption-strong text-content-muted">Credits</span>
              <span className="type-numeric-sm ml-auto text-content">
                <b className="font-medium">{credits.balance.toLocaleString()}</b>
              </span>
            </div>

            <button
              type="button"
              className="type-button-xs mt-3 flex h-8 w-full items-center justify-center gap-1.5 rounded-md border border-glass/15 bg-glass/10 text-content transition-colors hover:border-brand hover:text-brand"
            >
              <Icon name="payment" size={14} />
              Add Credits
            </button>
          </div>
        )}

        <div className={cn("grid gap-1.5", collapsed ? "grid-cols-1 justify-items-center" : "grid-cols-3")}>
          <IconButton
            icon="download"
            label={
              downloads
                ? `Downloads (${downloads} run${downloads === 1 ? "" : "s"} in progress)`
                : "Downloads"
            }
            variant="solid"
            size="sm"
            iconSize={16}
            /* Lit while something is rendering, like the notification dot: the
               reason to come back to this button is that a run has finished. */
            indicator={downloads > 0}
            onClick={onDownloads}
            className={collapsed ? "w-8" : "w-full"}
          />
          <IconButton
            icon="notifications"
            label={unread ? `Notifications (${unread} unread)` : "Notifications"}
            variant="solid"
            size="sm"
            iconSize={16}
            indicator={unread > 0}
            onClick={onNotifications}
            className={collapsed ? "w-8" : "w-full"}
          />
          <IconButton
            icon="sign-out"
            label="Sign out"
            variant="solid"
            size="sm"
            iconSize={16}
            className={collapsed ? "w-8" : "w-full"}
          />
        </div>
      </div>
    </aside>
  );
}

function NavButton({
  item,
  collapsed,
  active,
  onClick,
}: {
  item: NavItem;
  collapsed: boolean;
  active: boolean;
  onClick?: () => void;
}) {
  return (
    <Tooltip label={item.label} hidden={!collapsed}>
      <button
        type="button"
        onClick={onClick}
        aria-current={active ? "page" : undefined}
        className={cn(
          "flex items-center gap-2.5 rounded-lg px-2.5 py-2 transition-colors",
          active
            ? "bg-glass/20 text-content"
            : "text-content-muted hover:bg-glass/10 hover:text-content",
          collapsed && "justify-center px-0"
        )}
      >
        <Icon name={item.icon} size={17} />
        {!collapsed && <span className="type-body truncate">{item.label}</span>}
      </button>
    </Tooltip>
  );
}

/** One metered allowance. The bar is driven by the numbers beside it. */

/**
 * WHICH ORGANIZATION, AND THE WAY TO ANOTHER.
 *
 * The card used to end in a chevron-up that opened nothing — the rail's own
 * version of the dead Pricing button: an affordance drawn, a menu implied,
 * nothing behind it. A chevron was also the wrong glyph for what belongs here.
 * Up-and-down is disclosure, "there is more of this below"; moving between two
 * organizations is a SWAP, so it gets the swap arrows and says so on hover.
 *
 * The menu opens UPWARD, because the card is pinned to the bottom of the rail
 * and a list hanging below it would be off the screen. Every org the account is
 * in is listed with its plan — the plan is usually the reason you are switching
 * — and the last row leaves for Settings, where orgs are actually joined and
 * left. An account with one org still gets the menu: it says which one you are
 * in and where to go to join another, which is a better answer than a control
 * that does nothing.
 */
function OrgSwitcher() {
  const { org, orgs, switchOrg } = useWorkspace();
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  useDismissable(open, () => setOpen(false), wrap);

  return (
    <div ref={wrap} className="relative">
      <Tooltip label="Switch organization" side="right" hidden={open}>
        <button
          type="button"
          aria-haspopup="menu"
          aria-expanded={open}
          data-ui="org-switcher"
          onClick={() => setOpen((o) => !o)}
          className="flex w-full items-center gap-2 rounded-md text-left"
        >
          <Avatar name={org.name} size={26} />
          <span className="min-w-0 flex-1">
            <span className="type-label-strong block truncate">{org.name}</span>
            <span className="type-caption-strong mt-px inline-block rounded bg-brand-soft px-1 py-px text-brand">
              {org.plan}
            </span>
          </span>
          <Icon
            name="switch"
            size={14}
            className={cn(
              "shrink-0 transition-colors",
              open ? "text-brand" : "text-content-subtle"
            )}
          />
        </button>
      </Tooltip>

      {open && (
        <div
          role="menu"
          data-ui="org-switcher-menu"
          /* THE DROPDOWN SKIN, not glass. Every other list-of-choices in the
             web app — the Select's listbox, the right-click menu — is an
             opaque `surface-overlay` sheet with a `line/12` hairline and the
             pop shadow. This one was frosted glass, so the rail's own menu was
             the only one you could read the page through. */
          className="absolute bottom-[calc(100%+10px)] left-0 z-50 w-[calc(100%+1rem)] min-w-[13rem] origin-bottom-left animate-menu-in rounded-xl border border-line/12 bg-surface-overlay p-1.5 shadow-pop"
        >
          <p className="type-eyebrow px-2 py-1 text-content-subtle">Organizations</p>
          {orgs.map((o) => {
            const on = o.id === org.id;
            return (
              <button
                key={o.id}
                type="button"
                role="menuitemradio"
                aria-checked={on}
                onClick={() => {
                  switchOrg(o.id);
                  setOpen(false);
                }}
                className={cn(
                  "flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors",
                  on ? "bg-surface-raised" : "hover:bg-surface-raised"
                )}
              >
                <Avatar name={o.name} size={22} />
                <span className="min-w-0 flex-1">
                  <span
                    className={cn(
                      "type-body-dense block truncate",
                      on ? "text-content" : "text-content-muted"
                    )}
                  >
                    {o.name}
                  </span>
                  <span className="type-caption block truncate text-content-subtle">
                    {o.plan}
                  </span>
                </span>
                <Icon
                  name="check"
                  size={14}
                  aria-hidden
                  className={cn("shrink-0 text-brand", !on && "invisible")}
                />
              </button>
            );
          })}

          <div className="mx-1 my-1 h-px bg-line/10" />
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              window.location.hash = "#settings/organizations";
            }}
            className="type-body-dense flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-content-muted transition-colors hover:bg-surface-raised hover:text-content"
          >
            <Icon name="organization" size={14} className="shrink-0" />
            Manage organizations
          </button>
        </div>
      )}
    </div>
  );
}
