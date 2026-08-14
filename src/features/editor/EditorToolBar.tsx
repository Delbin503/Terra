import { GlassBar } from "@/components/glass";
import { cn } from "@/lib/utils";
import { Icon, type IconName } from "@/components/icons";
import { Tooltip } from "@/components/ui";
import { ToolMenu, type ToolMenuItem } from "./ToolMenu";

export type ToolId = "scene" | "assets" | "ai";
export type FlyoutAction = "mat" | "gen3d" | "sab";

const TOOLS: { id: ToolId; icon: IconName; label: string }[] = [
  { id: "scene", icon: "scene", label: "Scene objects" },
  { id: "assets", icon: "assets", label: "Assets" },
  { id: "ai", icon: "ai", label: "AI Tools" },
];

/** The three AI surfaces. All three can be open at once — they stack in the
 *  right-hand dock — so this is a multi-select, not a menu of destinations. */
const AI_TOOLS: ToolMenuItem<FlyoutAction>[] = [
  { id: "sab", icon: "sab", label: "SAB", hint: "Scene agent — build and edit by prompt" },
  { id: "gen3d", icon: "input-3d", label: "3D Generate", hint: "Multi-view images into a mesh" },
  { id: "mat", icon: "mat", label: "MAT", hint: "Domain-adaptation photorealism pass" },
];

/**
 * The tool bar — Scene / Assets / AI, in one glass cluster at the top centre.
 *
 * These used to be a column of circular buttons down the left edge, which cost
 * the viewport its whole left gutter for three controls and put them nowhere
 * near the rest of the chrome. Centred on the top row they join the band the
 * project cluster and the action cluster already sit in: same h-12, same y, one
 * line of chrome across the top and an otherwise clean viewport.
 *
 * `active` is a LIST, not one tool: the panels these open stack in the right-hand
 * dock instead of replacing each other, so more than one surface can be open at a
 * time and the bar has to be able to say so.
 */
export function EditorToolBar({
  active,
  flyoutOpen,
  openTools,
  badges,
  menuBadges,
  onSelect,
  onFlyoutAction,
  onCloseFlyout,
}: {
  active: ToolId[];
  /**
   * Unread counts per tool. A finished generation used to announce itself once,
   * in a toast, and then be gone — so anything produced while you were looking
   * elsewhere was silently waiting in a panel you had no reason to open. The
   * dot is what survives being missed.
   */
  badges?: Partial<Record<ToolId, number>>;
  /** the same, per item inside the AI menu */
  menuBadges?: Partial<Record<FlyoutAction, { count: number; note: string }>>;
  /** the AI tool's menu is showing */
  flyoutOpen: boolean;
  /** which AI panels are open right now — the menu ticks these */
  openTools: FlyoutAction[];
  onSelect: (t: ToolId) => void;
  onFlyoutAction: (a: FlyoutAction) => void;
  onCloseFlyout: () => void;
}) {
  return (
    <GlassBar
      ui="editor-toolbar"
      shape="panel"
      /* h-12 is the shared height of the top row — the project cluster on the
         left and the action cluster on the right are the same, so all three
         read as one band with their centres on a single line. */
      className="pointer-events-auto h-12 gap-1 px-2"
    >
      {TOOLS.map((t) =>
        t.id === "ai" ? (
          /* The menu hangs off the AI button's own centre rather than off the
             bar's corner: the bar's padding and the widths of the buttons before
             it would otherwise have to be baked into its offset, and any change
             to either would skew it. */
          <div key={t.id} className="relative">
            <ToolButton
              tool={t}
              active={active.includes(t.id)}
              badge={badges?.[t.id]}
              onClick={() => onSelect(t.id)}
            />
            {flyoutOpen && (
              <ToolMenu
                items={AI_TOOLS}
                active={openTools}
                badges={menuBadges}
                onToggle={onFlyoutAction}
                onClose={onCloseFlyout}
              />
            )}
          </div>
        ) : (
          <ToolButton
            key={t.id}
            tool={t}
            active={active.includes(t.id)}
            badge={badges?.[t.id]}
            onClick={() => onSelect(t.id)}
          />
        )
      )}
    </GlassBar>
  );
}

/**
 * One tool. A squared-off button rather than the circle the left rail used:
 * inside a shared bar the three of them read as one segmented control, and a row
 * of circles in a rounded rectangle reads as three loose dots.
 *
 * No nested glass — this sits INSIDE glass, and stacking the material on itself
 * is what turns a control into a smudge. The lit state is a brand tint and a
 * brand edge, the same active treatment the tag filter and the type filter use.
 */
function ToolButton({
  tool,
  active,
  badge,
  onClick,
}: {
  tool: { id: ToolId; icon: IconName; label: string };
  active: boolean;
  /** unread items behind this tool — shown as a count, hidden at zero */
  badge?: number;
  onClick: () => void;
}) {
  return (
    // Three glyphs in a row can't say "Scene objects" on their own, and `title`
    // alone was a grey box that took a second to arrive over the scene. The
    // bubble is the bar's own material, so it reads as this button's hover tint
    // carrying a label rather than as a separate thing landing on top of it.
    <Tooltip label={tool.label} side="bottom" tone="glass">
      <button
        type="button"
        aria-label={tool.label}
        aria-pressed={active}
        data-ui={`toolbar-${tool.id}`}
        onClick={onClick}
        className={cn(
          "relative grid h-9 w-9 place-items-center rounded-xl border transition-colors",
          "outline-none focus-visible:ring-2 focus-visible:ring-ring",
          active
            ? "border-brand/60 bg-brand/15 text-brand"
            : "border-transparent text-content-muted hover:bg-glass/15 hover:text-content"
        )}
      >
        <Icon name={tool.icon} size={19} strokeWidth={1.8} />

        {/* Outside the button's own tint so it reads at any active state, and
            ringed in the canvas colour so it stays a separate object rather
            than a smudge on the glyph. */}
        {!!badge && badge > 0 && (
          <span
            data-ui={`toolbar-${tool.id}-badge`}
            aria-label={`${badge} ready to view`}
            className="type-numeric-sm absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-danger px-1 font-semibold leading-none text-white ring-2 ring-canvas"
          >
            {badge > 9 ? "9+" : badge}
          </span>
        )}
      </button>
    </Tooltip>
  );
}
