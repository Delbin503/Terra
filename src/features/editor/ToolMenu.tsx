import { cn } from "@/lib/utils";
import { Icon, type IconName } from "@/components/icons";
import { Panel, PanelBody } from "./ui";

export interface ToolMenuItem<T extends string> {
  id: T;
  icon: IconName;
  label: string;
  /** one line under the label — what the tool is for */
  hint: string;
}

/**
 * THE AI TOOLS MENU.
 *
 * WHY A DROPDOWN AND NOT THE FAN. The three items used to spring out on an arc
 * below the AI button as circular glass buttons. It looked good and read badly:
 * icons only, names on hover, and — the part that actually mattered — no way to
 * show that a tool was already open. All three panels stack in the right-hand
 * dock and run at the same time, so the control that opens them has to be able
 * to say which ones are running. A fan of identical circles cannot.
 *
 * So it is a multi-select list, in the same shape as the model picker: name,
 * one line of description, and a tick when the tool is open. Clicking a lit row
 * closes that tool; clicking a dark one opens it. The menu stays up either way
 * — you came here to arrange your workspace, and having it vanish after one
 * choice is what made opening two panels a two-trip job.
 */
export function ToolMenu<T extends string>({
  items,
  active,
  badges,
  onToggle,
  onClose,
}: {
  items: ToolMenuItem<T>[];
  /** which tools are open right now */
  active: T[];
  /**
   * Unread results per tool: the count for the dot, and the line that replaces
   * the tool's usual description while anything is waiting. The bar's own badge
   * says only THAT something arrived; this is where it says what.
   */
  badges?: Partial<Record<T, { count: number; note: string }>>;
  onToggle: (id: T) => void;
  onClose: () => void;
}) {
  return (
    <>
      <div className="fixed inset-0 z-20" onClick={onClose} aria-hidden />
      <Panel
        ui="tool-menu"
        thickness="overlay"
        /* Hangs off the AI button's own centre — the bar's padding and the
           widths of the buttons before it would otherwise have to be baked in,
           and any change to either would skew it. */
        className="absolute left-1/2 top-[calc(100%+10px)] z-30 w-[260px] -translate-x-1/2 !rounded-2xl"
      >
        <PanelBody className="p-1.5">
          <div role="menu" aria-label="AI tools" className="space-y-0.5">
            {items.map((it) => {
              const on = active.includes(it.id);
              const badge = badges?.[it.id];
              return (
                <button
                  key={it.id}
                  type="button"
                  role="menuitemcheckbox"
                  aria-checked={on}
                  data-ui={`tool-menu-${it.id}`}
                  onClick={() => onToggle(it.id)}
                  className={cn(
                    "flex w-full items-start gap-2.5 rounded-xl px-2.5 py-2 text-left transition-colors",
                    on ? "bg-brand/12" : "hover:bg-glass/8"
                  )}
                >
                  <Icon
                    name={it.icon}
                    size={16}
                    className={cn("mt-0.5 shrink-0", on ? "text-brand" : "text-content-subtle")}
                  />
                  <span className="min-w-0 grow">
                    <span className="flex items-center gap-1.5">
                      <span
                        className={cn(
                          "type-body-strong truncate",
                          on ? "text-brand-on-glass" : "text-content"
                        )}
                      >
                        {it.label}
                      </span>
                      {!!badge && badge.count > 0 && (
                        <span
                          data-ui={`tool-menu-${it.id}-badge`}
                          className="type-numeric-sm grid h-4 min-w-4 place-items-center rounded-full bg-danger px-1 font-semibold leading-none text-white"
                        >
                          {badge.count > 9 ? "9+" : badge.count}
                        </span>
                      )}
                    </span>
                    <span
                      className={cn(
                        "type-caption block",
                        badge && badge.count > 0 ? "text-danger" : "text-content-subtle"
                      )}
                    >
                      {badge && badge.count > 0 ? badge.note : it.hint}
                    </span>
                  </span>
                  {/* The tick is the only thing that says "this one is already
                      open" — without it the menu would keep offering to open a
                      panel the user is looking at. */}
                  {on && <Icon name="check" size={14} className="mt-0.5 shrink-0 text-brand" />}
                </button>
              );
            })}
          </div>
        </PanelBody>
      </Panel>
    </>
  );
}
