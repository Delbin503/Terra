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
 *
 * TWO LINES WHEN THERE IS A CONSEQUENCE. The billing confirmations say what
 * happened AND what it means for the next charge — "Default Payment Method
 * Changed" is not, on its own, the thing an admin needs to read back. So a
 * toast carries an optional body under its headline, and the headline stays
 * the strong line either way so a one-part toast still looks like the same
 * object rather than a body with nothing above it.
 */
export function SettingsToast() {
  const { toast, dismissToast } = useSettings();
  if (!toast) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      data-ui="settings-toast"
      className="glass glass-overlay fixed right-5 top-5 z-[60] flex max-w-sm animate-panel-in items-start gap-2.5 !rounded-xl py-2.5 pl-3 pr-2"
    >
      <Icon name="select-check" size={16} className="mt-px shrink-0 text-success" />
      <div className="min-w-0 flex-1">
        <p className="type-body-strong text-content">{toast.title}</p>
        {toast.body && (
          <p className="type-body-dense mt-1 text-content-muted">{toast.body}</p>
        )}
      </div>
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
