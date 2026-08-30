import { ConfirmDialog } from "@/components/ui";

/**
 * Asked before leaving the editor.
 *
 * Exit is one click away from Save in the same cluster, it is the only control
 * up there that throws the viewport away, and there is no undo on the other
 * side of it. So it asks — and it names the project, because "are you sure?"
 * with no subject is a question people click through without reading.
 *
 * It asks in the SHARED confirm sheet (`@/components/ui`), not a dock panel of
 * its own. This used to be modelled on CameraPlaceDialog — same overlay glass,
 * full-width footer buttons — which made the editor internally consistent and
 * inconsistent with every other confirmation in the product. One question, one
 * layout: the sheet that asks you to trash a project is the sheet that asks you
 * to leave one.
 */
export function ExitProjectDialog({
  projectName,
  onConfirm,
  onCancel,
}: {
  projectName: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <ConfirmDialog
      open
      onOpenChange={(o) => !o && onCancel()}
      title={`Exit “${projectName}”?`}
      body="Leave the editor and go back to your projects. Anything you haven't saved stays unsaved — running generations keep going."
      cancelLabel="Stay here"
      confirmLabel="Exit project"
      confirmIcon="sign-out"
      onConfirm={onConfirm}
    />
  );
}
