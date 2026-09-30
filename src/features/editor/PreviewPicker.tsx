import { cn } from "@/lib/utils";
import { Icon } from "@/components/icons";
import { Panel, PanelBody, PanelEyebrow, PanelHeader } from "./ui";
import { CAMERA_RIG } from "./scene-palette";
import type { SceneObject } from "./scene-types";

/** Which end of the rig the viewport is looking through. */
export type PreviewCamera = "top" | "bottom";

/**
 * PREVIEW — the two cameras you can look through.
 * ----------------------------------------------------------------------------
 * Sits where the properties panel sits, because the Preview tile replaces the
 * Object and Capture tiles' panels rather than adding one beside them: while
 * you are looking through a camera there is nothing to set.
 *
 * TOP AND BOTTOM, NOT START AND END. The rig names its ends by the order the
 * capture visits them, which is the right name inside Capture and the wrong one
 * here — the question this panel asks is "which lens", and the rig is a mast, so
 * the answer anybody can see is where it hangs. The end camera always stands at
 * or above the start one (`withVerticalSpan` only ever climbs), so the mapping
 * never flips.
 *
 * Nothing is picked on arrival. Opening the tab flies nowhere — the viewport
 * only moves when a camera is chosen, so a mis-click on the tile costs a second
 * click rather than a camera flight you then have to undo.
 */
export function PreviewPicker({
  active,
  top,
  bottom,
  onPick,
}: {
  active: PreviewCamera | null;
  /** the rig's end camera */
  top: SceneObject | null;
  /** the rig's start camera */
  bottom: SceneObject | null;
  onPick: (which: PreviewCamera) => void;
}) {
  const options: {
    which: PreviewCamera;
    label: string;
    camera: SceneObject | null;
    tint: string;
  }[] = [
    { which: "top", label: "Top Camera", camera: top, tint: CAMERA_RIG.end },
    { which: "bottom", label: "Bottom Camera", camera: bottom, tint: CAMERA_RIG.start },
  ];

  return (
    <Panel ui="camera-preview-picker" thickness="regular" className="pointer-events-auto w-full !rounded-2xl">
      <PanelHeader className="px-3 py-2.5">
        <PanelEyebrow>Preview</PanelEyebrow>
      </PanelHeader>

      <PanelBody className="flex flex-col gap-1 p-2">
        {options.map((o) => {
          const on = active === o.which;
          return (
            <button
              key={o.which}
              type="button"
              data-ui={`preview-${o.which}`}
              aria-pressed={on}
              disabled={!o.camera}
              onClick={() => onPick(o.which)}
              className={cn(
                "type-body group relative flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors disabled:opacity-40",
                on
                  ? "bg-brand/12 text-content ring-1 ring-inset ring-brand/60"
                  : "text-content-muted hover:bg-glass/8 hover:text-content"
              )}
            >
              {/* The camera's own body colour, so the row and the thing in the
                  viewport it names are the same object at a glance. */}
              <Icon name="camera" size={15} style={{ color: o.tint }} className="shrink-0" />
              <span className="flex-1">{o.label}</span>
              {o.camera && (
                <span className="type-numeric shrink-0 text-content-subtle">
                  {o.camera.position[1].toFixed(1)} m
                </span>
              )}
              {on && <Icon name="check" size={13} strokeWidth={3} className="shrink-0 text-brand" />}
            </button>
          );
        })}
      </PanelBody>

      <p className="type-caption border-t border-glass/10 px-3 py-2.5 text-content-subtle">
        {active
          ? "View only — orbit, pan and zoom to look around. Press Preview again to leave."
          : "Pick a camera to look through it."}
      </p>
    </Panel>
  );
}
