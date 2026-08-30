import { ConfirmDialog } from "@/components/ui";

/**
 * CameraPlaceDialog — asked once, on drop, when the scene has a master object.
 *
 * The camera locks onto the master either way; the only question is where the
 * rig starts out. "Focus" frames it around the master so the sweep is usable
 * immediately, "cursor" honours where the user actually dropped it. Without a
 * master there's nothing to frame, so this never appears.
 *
 * BOTH BUTTONS ARE ANSWERS here, which is the one thing this question does not
 * share with the rest — so the left one carries `onCancel` rather than only
 * closing. Dismissing (Escape, the scrim, the X) still means neither: the drop
 * is abandoned, not silently resolved to one of the two.
 */
export function CameraPlaceDialog({
  masterName,
  onFocus,
  onAtCursor,
  onCancel,
}: {
  masterName: string;
  onFocus: () => void;
  onAtCursor: () => void;
  onCancel: () => void;
}) {
  return (
    <ConfirmDialog
      open
      onOpenChange={(o) => !o && onCancel()}
      tone="brand"
      title="Place camera to focus on the master?"
      body={`Either way the rig locks onto ${masterName} — this only decides where its start and end cameras begin.`}
      cancelLabel="No, drop here"
      onCancel={onAtCursor}
      confirmLabel="Yes, focus"
      confirmIcon="camera"
      onConfirm={onFocus}
    />
  );
}
