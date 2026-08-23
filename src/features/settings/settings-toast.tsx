import { Icon } from "@/components/icons";
import { useSettings } from "./settings-store";

/**
 * The confirmation line.
 *
 * FLOATING, top-right, and narrow. It used to sit in the document flow under
 * the top bar, which meant the page jumped by its height every time one
 * arrived and settled back when it left — a confirmation that reflows the
 * thing you just confirmed is worse than none. Out of flow it costs the layout
 * nothing, and top-right is where it lands closest to the account controls most
 * of these messages are about.
 *
 * `max-w-sm` because every message here is one clause. A toast as wide as the
 * content column reads as a banner, which implies something you have to deal
 * with rather than something that is already done.
 */
export function SettingsToast() {
  const { toast, dismissToast } = useSettings();
  if (!toast) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      data-ui="settings-toast"
      className="glass glass-overlay fixed right-5 top-5 z-[60] flex max-w-sm animate-panel-in items-center gap-2.5 !rounded-xl py-2 pl-3 pr-2"
    >
      <Icon name="select-check" size={16} className="shrink-0 text-success" />
      <p className="type-body-dense min-w-0 flex-1 text-content">{toast}</p>
      <button
        type="button"
        aria-label="Dismiss"
        onClick={dismissToast}
        className="grid h-6 w-6 shrink-0 place-items-center rounded-md text-content-subtle transition-colors hover:bg-glass/15 hover:text-content"
      >
        <Icon name="close" size={13} />
      </button>
    </div>
  );
}
