import { Button } from "@/components/ui";
import { Icon } from "@/components/icons";
import { Panel, PanelHeader, PanelTitle, PanelSubtitle, PanelClose, PanelBody, PanelFooter } from "./ui";

/**
 * CameraPlaceDialog — asked once, on drop, when the scene has a master object.
 *
 * The camera locks onto the master either way; the only question is where the
 * rig starts out. "Focus" frames it around the master so the sweep is usable
 * immediately, "cursor" honours where the user actually dropped it. Without a
 * master there's nothing to frame, so this never appears.
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
    <>
      <div className="pointer-events-auto fixed inset-0 z-[55] bg-black/40" onClick={onCancel} />
      <Panel
        ui="camera-place"
        thickness="overlay"
        className="pointer-events-auto fixed left-1/2 top-1/2 z-[56] w-[400px] max-w-[92vw] -translate-x-1/2 -translate-y-1/2"
      >
        <PanelHeader align="start" className="p-4">
          <div className="min-w-0">
            <PanelTitle>Place Camera</PanelTitle>
            <PanelSubtitle>Master object · {masterName}</PanelSubtitle>
          </div>
          <PanelClose size="sm" label="Cancel placement" onClick={onCancel} />
        </PanelHeader>

        <PanelBody className="p-4">
          <p className="type-body leading-relaxed text-content">
            Place camera near the master object to focus on it?
          </p>
          <p className="type-caption mt-2 leading-relaxed text-content-subtle">
            Either way the rig locks onto {masterName} — this only decides where its start and end
            cameras begin.
          </p>
        </PanelBody>

        <PanelFooter className="gap-3 p-3">
          <Button variant="secondary" size="md" className="flex-1 !rounded-xl" onClick={onAtCursor} data-ui="camera-place-cursor">
            No, drop here
          </Button>
          <Button variant="brand" size="md" className="flex-1 !rounded-xl" onClick={onFocus} data-ui="camera-place-focus">
            <Icon name="camera" size={16} />
            Yes, focus
          </Button>
        </PanelFooter>
      </Panel>
    </>
  );
}
