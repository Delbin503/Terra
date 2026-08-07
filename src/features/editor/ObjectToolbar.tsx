import { cn } from "@/lib/utils";
import { Icon, type IconName } from "@/components/icons";

export type EditTab = "object" | "texture";

/** Bottom-center per-object toolbar. Object / Texture drive the right-side
 *  properties panel (filtered to Transform / Material); Delete and Master
 *  Object act now. Leaving the selection is the "Back" affordance above the
 *  object title. */
export function ObjectToolbar({
  tab,
  isMaster,
  onTab,
  onToggleMaster,
}: {
  tab: EditTab | null;
  isMaster: boolean;
  onTab: (t: EditTab) => void;
  onToggleMaster: () => void;
}) {
  const tiles: {
    icon: IconName;
    label: string;
    onClick: () => void;
    active?: boolean;
    danger?: boolean;
    master?: boolean;
  }[] = [
    { icon: "input-3d", label: "Object", onClick: () => onTab("object"), active: tab === "object" },
    { icon: "texture", label: "Texture", onClick: () => onTab("texture"), active: tab === "texture" },
    { icon: "master", label: "Master Object", onClick: onToggleMaster, master: true },
  ];
  return (
    <div className="pointer-events-auto fixed bottom-6 left-1/2 z-30 flex -translate-x-1/2 gap-2.5">
      {tiles.map((t) => (
        <button
          key={t.label}
          type="button"
          data-ui={`obj-tool-${t.label.toLowerCase().replace(/\s+/g, "-")}`}
          aria-pressed={t.master ? isMaster : undefined}
          onClick={t.onClick}
          className={cn(
            "type-label glass glass-interactive flex min-w-[76px] flex-col items-center gap-1 !rounded-2xl px-4 py-2.5",
            // Active tiles tint via .glass-role (globals.css) rather than a
            // `bg-<role>/x` utility: that sets background-color, which replaces
            // the glass ink and leaves the label — the same role colour — sitting
            // on a wash of itself over the scene.
            t.master
              ? // Master Object owns yellow, on or off, so its role stays readable.
                isMaster
                ? "glass-role glass-role-master text-master-on-glass"
                : "text-master/70 hover:text-master"
              : t.active
                ? "glass-role glass-role-brand text-brand-on-glass"
                : t.danger
                  ? "text-danger"
                  : "text-content-muted hover:text-content"
          )}
        >
          <Icon name={t.icon} size={18} />
          {t.label}
        </button>
      ))}
    </div>
  );
}
