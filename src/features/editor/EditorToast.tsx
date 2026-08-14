import { cn } from "@/lib/utils";
import { GlassPanel } from "@/components/glass";
import { Icon, type IconName } from "@/components/icons";

/**
 * THE BOTTOM-LEFT TOAST — one component for every "a background job finished".
 *
 * There were three of these: the MAT preview's, the 3D mesh's, and nothing at
 * all for the multi-view pass or a save. Three near-identical copies is how a
 * single idea — something finished, here is where it went — turns into three
 * notifications that drift apart in wording, tint and corner. So it is one
 * object now, and what varies is the sentence and whether there is anywhere to
 * go afterwards.
 *
 * `onView` is optional on purpose. A saved project has nothing to open, so the
 * card is a statement rather than a button; a finished mesh has the library, so
 * the whole card is clickable and says "Click to view".
 */
export function EditorToast({
  ui,
  icon,
  message,
  dockOpen,
  tone = "success",
  onView,
  onDismiss,
}: {
  ui: string;
  icon?: IconName;
  message: string;
  /** the library's bottom dock is up, so sit above it rather than under it */
  dockOpen: boolean;
  tone?: "success" | "brand";
  /** where the result went — omit for a job with nothing to open */
  onView?: () => void;
  onDismiss: () => void;
}) {
  const clickable = onView != null;

  return (
    <GlassPanel
      ui={ui}
      thickness="thick"
      interactive={clickable}
      role={clickable ? "button" : "status"}
      tabIndex={clickable ? 0 : undefined}
      onClick={onView}
      onKeyDown={(e) => {
        if (clickable && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          onView?.();
        }
      }}
      className={cn(
        "pointer-events-auto absolute left-6 z-30 flex items-center gap-3 !rounded-2xl py-3 pl-4 pr-3",
        // The tint goes through `.glass-role`, which layers colour as a
        // background IMAGE over the glass ink. A background-COLOUR would drop
        // the ink instead and leave the label floating on a wash of the scene.
        tone === "success" ? "glass-role glass-role-success" : "glass-role glass-role-brand",
        clickable && "cursor-pointer",
        dockOpen ? "bottom-[calc(3rem+clamp(260px,40vh,392px))]" : "bottom-6"
      )}
    >
      {icon && <Icon name={icon} size={16} className="shrink-0 text-content" />}
      <p className="type-body text-content">
        {message}
        {clickable && (
          <>
            {" "}
            <span className="type-body-strong underline underline-offset-2">Click to view</span>
          </>
        )}
      </p>
      <button
        type="button"
        aria-label="Dismiss"
        data-ui={`${ui}-dismiss`}
        onClick={(e) => {
          // The card itself is the "view" action, so the dismiss inside it has
          // to stop the click before it reaches the card.
          e.stopPropagation();
          onDismiss();
        }}
        className="grid h-6 w-6 shrink-0 place-items-center rounded-md text-content-muted transition-colors hover:bg-glass/20 hover:text-content"
      >
        <Icon name="close" size={13} />
      </button>
    </GlassPanel>
  );
}
