import { Button } from "@/components/ui";
import { Icon } from "@/components/icons";
import { Panel, PanelHeader, PanelTitle, PanelSubtitle, PanelClose, PanelBody, PanelFooter } from "./ui";

/**
 * Asked before leaving the editor.
 *
 * Exit is one click away from Save in the same cluster, it is the only control
 * up there that throws the viewport away, and there is no undo on the other
 * side of it. So it asks — and it names the project, because "are you sure?"
 * with no subject is a question people click through without reading.
 *
 * Modelled on CameraPlaceDialog rather than a generic confirm: same overlay
 * glass, same two-button footer, so the two moments the editor stops to ask
 * something look like the same app asking.
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
    <>
      <div className="pointer-events-auto fixed inset-0 z-[55] bg-black/40" onClick={onCancel} />
      <Panel
        ui="exit-project"
        thickness="overlay"
        className="pointer-events-auto fixed left-1/2 top-1/2 z-[56] w-[400px] max-w-[92vw] -translate-x-1/2 -translate-y-1/2"
      >
        <PanelHeader align="start" className="p-4">
          <div className="min-w-0">
            <PanelTitle>Exit project</PanelTitle>
            <PanelSubtitle>{projectName}</PanelSubtitle>
          </div>
          <PanelClose size="sm" label="Stay in the project" onClick={onCancel} />
        </PanelHeader>

        <PanelBody className="p-4">
          <p className="type-body leading-relaxed text-content">
            Leave the editor and go back to your projects?
          </p>
          <p className="type-caption mt-2 leading-relaxed text-content-subtle">
            Anything you haven't saved stays unsaved. Running generations keep going.
          </p>
        </PanelBody>

        <PanelFooter className="gap-3 p-3">
          <Button
            variant="secondary"
            size="md"
            className="flex-1 !rounded-xl"
            onClick={onCancel}
            data-ui="exit-project-cancel"
          >
            Stay here
          </Button>
          <Button
            variant="danger"
            size="md"
            className="flex-1 !rounded-xl"
            onClick={onConfirm}
            data-ui="exit-project-confirm"
          >
            <Icon name="sign-out" size={16} />
            Exit project
          </Button>
        </PanelFooter>
      </Panel>
    </>
  );
}
