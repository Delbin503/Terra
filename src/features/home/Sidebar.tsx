import { useState } from "react";
import { cn } from "@/lib/utils";
import { Icon, type IconName } from "@/components/icons";
import { Avatar, IconButton, Meter, Tooltip, Button } from "@/components/ui";
import { credits, user } from "./data";

interface NavItem {
  icon: IconName;
  label: string;
  active?: boolean;
  badge?: string;
}

const primaryNav: NavItem[] = [
  { icon: "home", label: "Home", active: true },
  { icon: "search", label: "Search" },
  { icon: "explore", label: "Explore" },
  { icon: "projects", label: "Projects" },
  { icon: "library", label: "Library" },
  { icon: "shared", label: "Shared" },
  { icon: "trash", label: "Trash" },
];

const starred: NavItem[] = [
  { icon: "starred", label: "Sand Dune Project" },
  { icon: "starred", label: "Voxel Valley" },
];

export function Sidebar({
  collapsed,
  onToggle,
  onCreate,
}: {
  collapsed: boolean;
  onToggle: () => void;
  onCreate: () => void;
}) {
  const imgPct = (credits.images.used / credits.images.total) * 100;
  const timePct =
    (credits.renderSeconds.used / credits.renderSeconds.total) * 100;

  return (
    <aside
      className={cn(
        "sticky top-0 flex h-screen shrink-0 flex-col gap-3.5 border-r border-line/8 bg-surface p-3.5 transition-[width] duration-200",
        collapsed ? "w-rail-collapsed" : "w-rail"
      )}
    >
      {/* Brand */}
      <div className={cn("flex items-center px-1.5", collapsed && "justify-center")}>
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-brand to-terra-700 font-display text-base font-bold text-white">
          T
        </div>
        {!collapsed && (
          <span className="ml-2.5 font-display text-lg font-semibold tracking-tight">
            Terra
          </span>
        )}
        <IconButton
          icon={collapsed ? "sidebar-expand" : "sidebar-collapse"}
          label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          variant="ghost"
          size="sm"
          onClick={onToggle}
          className={cn(
            "ml-auto",
            collapsed &&
              "absolute -right-3.5 top-5 border border-line/12 bg-surface-raised"
          )}
        />
      </div>

      {/* Create */}
      <Tooltip label="Create" hidden={!collapsed}>
        <Button
          variant="brand"
          size="lg"
          onClick={onCreate}
          className={cn("w-full font-semibold", collapsed && "px-0")}
        >
          <Icon name="create" size={19} />
          {!collapsed && "Create"}
        </Button>
      </Tooltip>

      {/* Primary nav */}
      <nav className="flex flex-col gap-0.5">
        {primaryNav.map((item) => (
          <NavButton key={item.label} item={item} collapsed={collapsed} />
        ))}
      </nav>

      <div className="mx-1.5 h-px bg-line/8" />
      {!collapsed && (
        <span className="px-2.5 text-2xs font-semibold uppercase tracking-wider text-content-subtle">
          Starred
        </span>
      )}
      <nav className="flex flex-col gap-0.5">
        {starred.map((item) => (
          <NavButton key={item.label} item={item} collapsed={collapsed} />
        ))}
      </nav>

      {/* Footer: credits + user (migrated from the old top bar) */}
      <div className="mt-auto flex flex-col gap-3">
        {!collapsed && (
          <div className="flex flex-col gap-2.5 rounded-xl border border-line/10 bg-surface-raised p-3">
            <CreditRow
              icon="image-credits"
              label="Images"
              value={`${credits.images.used.toLocaleString()} / ${credits.images.total.toLocaleString()}`}
              pct={imgPct}
              tone="success"
            />
            <CreditRow
              icon="render-time"
              label="Render time"
              value={`${credits.renderSeconds.total.toLocaleString()}s`}
              pct={100 - timePct}
              tone="brand"
            />
            <button className="mt-0.5 flex items-center justify-center gap-1.5 text-xs font-semibold text-brand hover:text-brand-hover">
              <Icon name="credits" size={14} />
              Add credits
            </button>
          </div>
        )}

        <div className={cn("flex items-center gap-2", collapsed && "flex-col")}>
          <Tooltip label={user.name} hidden={!collapsed}>
            <button
              className={cn(
                "flex min-w-0 flex-1 items-center gap-2.5 rounded-lg p-1.5 text-left transition-colors hover:bg-surface-raised",
                collapsed && "flex-none"
              )}
            >
              <Avatar name={user.name} />
              {!collapsed && (
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{user.name}</span>
                  <span className="block text-2xs text-content-subtle">{user.plan}</span>
                </span>
              )}
            </button>
          </Tooltip>
          {!collapsed && (
            <div className="flex items-center gap-1">
              <IconButton icon="download" label="Downloads" variant="solid" size="sm" />
              <IconButton
                icon="notifications"
                label="Notifications"
                variant="solid"
                size="sm"
                indicator
              />
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}

function NavButton({ item, collapsed }: { item: NavItem; collapsed: boolean }) {
  return (
    <Tooltip label={item.label} hidden={!collapsed}>
      <button
        className={cn(
          "group relative flex items-center gap-3 rounded-lg px-3 py-2 text-base transition-colors",
          item.active
            ? "bg-surface-raised text-content"
            : "text-content-muted hover:bg-surface-raised hover:text-content",
          collapsed && "justify-center px-0"
        )}
      >
        {item.active && (
          <span className="absolute left-0 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-full bg-brand" />
        )}
        <Icon name={item.icon} size={18} />
        {!collapsed && <span className="truncate">{item.label}</span>}
        {!collapsed && item.badge && (
          <span className="ml-auto rounded-full bg-brand px-1.5 text-2xs font-semibold text-white">
            {item.badge}
          </span>
        )}
      </button>
    </Tooltip>
  );
}

function CreditRow({
  icon,
  label,
  value,
  pct,
  tone,
}: {
  icon: IconName;
  label: string;
  value: string;
  pct: number;
  tone: "brand" | "success";
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2 text-xs text-content-muted">
        <Icon name={icon} size={14} />
        <span>{label}</span>
        <b className="ml-auto font-medium tabular-nums text-content">{value}</b>
      </div>
      <Meter value={pct} tone={tone} />
    </div>
  );
}
