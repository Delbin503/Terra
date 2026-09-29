import { useState } from "react";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/icons";
import { Button } from "@/components/ui";
import { NumberInput } from "./ui";
import { FactorCard } from "./controls-ui";
import {
  atDistance,
  azimuthOf,
  distance,
  DISTANCE_SHOTS_RANGE,
  maxStops,
  orbitPoint,
  orbitSweep,
  SHOTS_RANGE,
  withVerticalSpan,
} from "./camera-rig";
import { DistanceControl } from "./SettingControl";
import type { CameraEdit } from "./TerraGenView";
import type { SceneApi } from "./useScene";
import type { RigState } from "./work-order";
import { Group, Note } from "./terragen-parts";

/**
 * CAMERA SETTINGS — what the rig shoots, and from where.
 *
 * WHY THE CONTROLS ARE THE CAMERA'S OWN. These are the same settings the camera
 * object carries in the viewport — mode, reach, climb, orbit, shots per
 * rotation, shots per distance — and they edit the SAME rig. The panel used to
 * keep its own pitch/yaw/distance ranges beside the rig's, which meant two
 * descriptions of one sweep that drifted apart the moment a camera was dragged.
 * There is now one description, and it is the rig.
 *
 * NO MASTER PICKER. It opened this section for a while, on the reasoning that
 * "what does the rig orbit" is a camera question. But the Objects section above
 * is the list of objects and it hands out the crown, so this was a second place
 * to answer one question — and the two could show different answers for as long
 * as it took to scroll between them. The section names the master in its
 * summary row and leaves the choosing where the objects are.
 */
export function CameraSection({
  scene,
  rig,
  onFocusCamera,
  onEditing,
}: {
  scene: SceneApi;
  rig: RigState;
  /** put the edit stage in front with the rig framed — see TerraGenView */
  onFocusCamera: () => void;
  /** which control is in hand, so the stage draws the matching guide */
  onEditing: (edit: CameraEdit) => void;
}) {
  return (
    <div data-ui="terragen-editor-camera">
      {!rig.hasMaster && (
        <Note tone="warn">
          No master object. Mark one in Objects above — every camera orbits it, and these controls
          have nothing to aim at until you do.
        </Note>
      )}

      {/* Framing is no longer a button. TerraGen re-frames the rig on the master
          itself (see TerraGenView), so the only thing left to say here is when
          there is no rig to frame. */}
      {rig.hasMaster && !rig.hasRig && (
        <Note tone="warn">
          No camera in the scene. Place a Camera in the viewport — its two positions are the sweep,
          and these controls edit it.
        </Note>
      )}

      {rig.hasRig && rig.rig && (
        <RigControls scene={scene} rig={rig} onFocusCamera={onFocusCamera} onEditing={onEditing} />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ rig --- */

/** 0…360, whichever side of zero the geometry came back on. */
const norm360 = (v: number) => ((v % 360) + 360) % 360;

/**
 * The rig's own settings, edited in place — the SAME controls Terra Web shows.
 *
 * WHY THEY ARE THE EDITOR'S, LITERALLY. Selecting a camera in the editor opens
 * Camera Mode, Zoom Distance, Camera Height, Orbit Rotation, Shots per
 * Distance and Shots per Rotation. This section used to show a shorter, differently
 * worded set — "Nearest/Farthest", "Climb", no orbit, no stop arithmetic — so the
 * same rig had two vocabularies depending on which panel you had open, and the
 * one in here was the poorer of the two: it dropped the ceiling on increments,
 * the stop spacing, and the explainers that say what a frame count buys.
 * `DistanceControl` and `CaptureExplainer` are now imported from the editor
 * rather than re-cut here, so there is one implementation of each.
 *
 * Every control writes to the scene, not to the Work Order draft: the rig IS
 * the sweep, so there is nothing to copy and nothing to keep in step.
 *
 * AND EVERY ONE OF THEM SHOWS ITS WORK. `onFocusCamera` puts the edit stage in
 * front with the rig framed before the first drag — moving a camera while the
 * sweep preview is up changes the picture from the inside, which is unreadable.
 */
function RigControls({
  scene,
  rig,
  onFocusCamera,
  onEditing,
}: {
  scene: SceneApi;
  rig: RigState;
  onFocusCamera: () => void;
  onEditing: (edit: CameraEdit) => void;
}) {
  const { rig: cameraRig, start, end, target } = rig;
  if (!cameraRig || !start || !end) return null;

  const sweep = distance(atDistance(target, start.position, rig.nearDistance), end.position);
  const orbit = norm360(azimuthOf(target, end.position));

  /**
   * Every edit is also a request to LOOK at the rig — the stage comes forward,
   * the rig is framed, and the guide for the control in hand is drawn over it.
   */
  const focused =
    <T,>(edit: CameraEdit, fn: (v: T) => void) =>
    (v: T) => {
      onFocusCamera();
      onEditing(edit);
      fn(v);
    };

  /**
   * The near end is a SAVED NUMBER, not a camera position — the pair parks at
   * the far distance and the capture travels in to this. Editing it therefore
   * writes to the rig, which is what makes it survive every other edit (a
   * dragged camera, a new climb) instead of being whatever a position implied.
   */
  const setNear = (metres: number) => {
    const d = Math.min(rig.farDistance, Math.max(rig.nearLimit, metres));
    scene.updateRig(cameraRig.id, { nearDistance: d });
  };

  /** The climb — straight up and down, so the mast stays a mast. */
  const setClimb = (metres: number) => {
    scene.updateOne(end.id, {
      position: withVerticalSpan(
        start.position,
        end.position,
        Math.max(0, Math.min(rig.climbLimit, metres))
      ),
    });
  };

  /**
   * Swing the pair around the master.
   *
   * Applied as a DELTA, exactly as the editor's own orbit handle applies it, so
   * each camera keeps whatever bearing offset it has rather than being snapped
   * onto one shared heading. `orbitPoint` preserves height and ground radius,
   * so the framing is unchanged — only where the shot is taken from.
   */
  const setOrbit = (deg: number) => {
    const delta = deg - orbit;
    [start, end].forEach((cam) => {
      scene.updateOne(cam.id, {
        position: orbitPoint(target, cam.position, azimuthOf(target, cam.position) + delta),
      });
    });
  };

  const stops = Math.min(cameraRig.shotsPerDistance, maxStops(sweep));

  return (
    <>
      {/* AT THE TOP, NOT THE BOTTOM. This says what editing anything below it
          will DO — the rig moves, and the stage jumps to the rig to show it —
          which is a thing to know before you touch the first control, not a
          footnote under the last one. Sat at the end it was reached only by
          someone who had already scrolled past every dial it was warning
          about. */}
      <Group title="Camera mode">
        {/* SIDE BY SIDE. Two mutually exclusive answers to one question read as
            a choice when they sit on one line and as a list when they stack —
            and the labels are one word each, so the row costs nothing. */}
        <div className="grid grid-cols-2 gap-2">
          {(
            [
              { value: "rotatable" as const, label: "Rotatable" },
              { value: "fixed" as const, label: "Fixed" },
            ]
          ).map((m) => (
            <button
              key={m.value}
              type="button"
              data-ui={`terragen-camera-mode-${m.value}`}
              onClick={() => {
                onFocusCamera();
                // Mode has no guide of its own — the rig itself is the picture.
                onEditing(null);
                scene.updateRig(cameraRig.id, { mode: m.value });
              }}
              className={cn(
                "flex items-center justify-center gap-1.5 rounded-xl border px-3 py-2 transition-colors",
                cameraRig.mode === m.value
                  ? "border-brand/50 bg-brand/12"
                  : "border-glass/12 hover:bg-glass/8"
              )}
            >
              {cameraRig.mode === m.value && (
                <Icon name="check" size={12} strokeWidth={3} className="text-brand" />
              )}
              <span className="type-body-strong text-content">{m.label}</span>
            </button>
          ))}
        </div>
      </Group>

      {/* EVERY CONTROL STAYS ON SCREEN IN BOTH MODES.
          Fixed used to hide the climb, the orbit and the two shot counts,
          on the reasoning that a single front-on frame does not use them. That
          reasoning is right about the RENDER and wrong about the PANEL: the
          settings still exist on the rig, switching to Fixed and back is how
          you check one frame before committing to a sweep, and a panel that
          loses four of its six controls when you do that reads as having
          thrown them away. They stay, they keep their values, and the mode
          decides what the run does with them. */}
      <Group title="Camera height">
          {/* The editor's climb control, ends and all: the two numbers worth
              jumping to are level and straight overhead, and both are one
              click rather than a careful drag to the end of a track. */}
          <div className="flex items-center gap-2">
            <Icon name="move" size={13} className="shrink-0 text-content-subtle" />
            <input
              type="range"
              aria-label="Height between the two cameras"
              data-ui="terragen-camera-height"
              min={0}
              max={Math.max(0.1, rig.climbLimit)}
              step={0.1}
              value={Math.min(Math.max(0, rig.climb), Math.max(0.1, rig.climbLimit))}
              onChange={(e) => focused("distance", setClimb)(parseFloat(e.target.value))}
              className="h-1 flex-1 cursor-pointer accent-brand"
            />
            <div className="field-well type-numeric w-16 shrink-0 rounded-md border px-1.5 py-0.5 text-center text-content">
              {rig.climb.toFixed(1)} m
            </div>
          </div>
          <div className="mt-1.5 flex items-center justify-between">
            <button
              type="button"
              data-ui="terragen-camera-height-level"
              onClick={() => focused("distance", setClimb)(0)}
              className="type-caption text-content-subtle transition-colors hover:text-content"
            >
              Level · 0 m
            </button>
            <button
              type="button"
              data-ui="terragen-camera-height-overhead"
              onClick={() => focused("distance", setClimb)(rig.climbLimit)}
              className="type-caption text-content-subtle transition-colors hover:text-content"
            >
              {rig.climbLimit.toFixed(1)} m · Max
            </button>
          </div>
        </Group>

        {/* ZOOM AND ITS STOPS, IN ONE GROUP.
            The two numbers are one decision — how far the sweep travels, and how
            many times it stops on the way — and reading them a section apart is
            what made the old column feel like a form rather than a setting. The
            stop count is capped by what the reach can actually hold. */}
        <Group title="Zoom distance" hint={`${stops} stops`}>
          <DistanceControl
            nearDistance={rig.nearDistance}
            farDistance={rig.farDistance}
            nearLimit={rig.nearLimit}
            masterName={rig.masterName ?? "the master"}
            onHandle={() => onEditing("distance")}
            onChange={focused("distance", setNear)}
            note={false}
          />

          <ZoomSets scene={scene} onShow={focused("distance", (id: string) => scene.loadZoom(id))} />

          <div className="mt-3">
            <FactorCard
              label="Increments"
              value={stops}
              min={DISTANCE_SHOTS_RANGE.min}
              max={maxStops(sweep)}
              step={DISTANCE_SHOTS_RANGE.step}
              precision={0}
              onChange={focused("shotsDistance", (v: number) =>
                scene.updateRig(cameraRig.id, { shotsPerDistance: Math.round(v) })
              )}
            />
          </div>
        </Group>

        {/* ORBIT AND ITS SHOTS, IN ONE GROUP — the same pairing as zoom: the
            arc the master turns through, and how many frames come out of it. */}
        <Group title="Orbit rotation" hint={`${cameraRig.shotsPerRotation} shots`}>
          {/*
            The two ends BRACKET the slider rather than sitting under it: left
            is where the sweep starts, right is where it stops, the handle
            between them is where the rig is now. Read across, it is the
            sentence "from here, round to there, currently here".
          */}
          <div className="flex items-center gap-2">
            <NumberInput
              bordered
              className="w-14 shrink-0"
              aria-label="Arc origin bearing"
              data-ui="terragen-arc-start"
              value={Math.round(cameraRig.orbitStart)}
              onChange={(e) => {
                onFocusCamera();
                onEditing("orbit");
                scene.updateRig(cameraRig.id, {
                  orbitStart: parseFloat(e.target.value) || 0,
                });
              }}
            />
            <input
              type="range"
              aria-label="Orbit cameras around master"
              data-ui="terragen-orbit-slider"
              min={0}
              max={360}
              step={1}
              value={Math.round(orbit)}
              onChange={(e) => focused("orbit", setOrbit)(parseFloat(e.target.value))}
              className="h-1 flex-1 cursor-pointer accent-brand"
            />
            <NumberInput
              bordered
              className="w-14 shrink-0"
              aria-label="Arc maximum bearing"
              data-ui="terragen-arc-end"
              value={Math.round(cameraRig.orbitEnd)}
              onChange={(e) => {
                onFocusCamera();
                onEditing("orbit");
                scene.updateRig(cameraRig.id, {
                  orbitEnd: parseFloat(e.target.value) || 0,
                });
              }}
            />
          </div>

          <div className="mt-2 flex items-center justify-between">
            <span className="type-caption text-content-subtle">
              Origin · {Math.round(cameraRig.orbitStart)}°
            </span>
            <span className="type-caption-strong text-content">{Math.round(orbit)}° now</span>
            <span className="type-caption text-content-subtle">
              {Math.round(orbitSweep(cameraRig.orbitStart, cameraRig.orbitEnd))}° swept
            </span>
          </div>

          <div className="mt-3">
            <FactorCard
              label="Shots / Rotation"
              value={cameraRig.shotsPerRotation}
              min={SHOTS_RANGE.min}
              max={SHOTS_RANGE.max}
              step={SHOTS_RANGE.step}
              precision={0}
              onChange={focused("shotsRotation", (v: number) =>
                scene.updateRig(cameraRig.id, { shotsPerRotation: Math.round(v) })
              )}
            />
        </div>
      </Group>
    </>
  );
}

/* ------------------------------------------------------------- zoom sets -- */

/**
 * THE REACHES THIS RUN SWEEPS.
 *
 * Deliberately the Time of Day section's list, down to the order of the
 * buttons and the anatomy of a row: checkbox, name, pencil, bin. Two lists that
 * behave identically should look identical — the moment one of them puts its
 * checkbox on the other side, people start checking the wrong thing.
 *
 * CLICKING A NAME STANDS THE RIG AT THAT REACH and draws the distance halo over
 * it, because a list of numbers is not a thing anyone can judge. Loading is not
 * an edit: it moves the saved near number onto the rig, which is where the
 * control above was already writing.
 */
function ZoomSets({ scene, onShow }: { scene: SceneApi; onShow: (id: string) => void }) {
  const [editing, setEditing] = useState<string | null>(null);
  const saved = scene.savedZooms;
  const inRun = saved.filter((z) => z.inRun).length;
  const editingSet = editing ? saved.find((z) => z.id === editing) ?? null : null;

  return (
    <div className="mt-3 border-t border-glass/10 pt-3">
      {editingSet ? (
        <div data-ui="terragen-zoom-editing">
          <p className="type-caption mb-2 flex items-center gap-1.5 text-content-subtle">
            <Icon name="edit" size={13} className="shrink-0 text-brand" />
            Editing <span className="text-content">{editingSet.name}</span>
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              className="grow"
              data-ui="terragen-zoom-edit-cancel"
              onClick={() => setEditing(null)}
            >
              Done
            </Button>
            <Button
              variant="brand"
              size="sm"
              className="grow"
              data-ui="terragen-zoom-edit-save"
              onClick={() => {
                scene.updateZoomSet(editingSet.id);
                setEditing(null);
              }}
            >
              <Icon name="save" size={15} />
              Update set
            </Button>
          </div>
        </div>
      ) : (
        <Button
          variant="brand"
          size="sm"
          className="w-full"
          data-ui="terragen-zoom-save"
          onClick={scene.saveZoom}
        >
          <Icon name="save" size={15} />
          Save as set
        </Button>
      )}

      {saved.length > 0 && (
        <>
          <div className="mb-1.5 mt-3 flex items-baseline justify-between gap-3">
            <h3 className="type-eyebrow text-content-muted">Zoom sets</h3>
            <span className="type-caption shrink-0 text-content-subtle">
              {inRun} of {saved.length} in run
            </span>
          </div>

          <div className="space-y-1.5">
            {saved.map((z) => (
              <div
                key={z.id}
                data-ui={`terragen-zoom-set-${z.id}`}
                className={cn(
                  "flex items-center gap-2 rounded-lg border px-2.5 py-2 transition-colors",
                  editing === z.id
                    ? "border-brand bg-brand/12"
                    : z.inRun
                      ? "border-brand/40 bg-brand/8"
                      : "border-glass/12 bg-glass/6"
                )}
              >
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={z.inRun}
                  aria-label={`Include ${z.name} in the run`}
                  data-ui={`terragen-zoom-set-${z.id}-inrun`}
                  onClick={() => scene.toggleZoomInRun(z.id)}
                  className={cn(
                    "grid h-4 w-4 shrink-0 place-items-center rounded border transition-colors",
                    z.inRun ? "border-brand bg-brand text-brand-foreground" : "border-glass/25"
                  )}
                >
                  {z.inRun && <Icon name="check" size={11} strokeWidth={3} />}
                </button>

                <button
                  type="button"
                  data-ui={`terragen-zoom-set-${z.id}-show`}
                  onClick={() => onShow(z.id)}
                  className="min-w-0 grow text-left"
                >
                  <span className="type-body block truncate text-content">{z.name}</span>
                  <span className="type-caption block truncate text-content-subtle">
                    {z.nearDistance.toFixed(1)} m from the master
                  </span>
                </button>

                <button
                  type="button"
                  aria-label={`Edit ${z.name}`}
                  title="Load this set and update it"
                  data-ui={`terragen-zoom-set-${z.id}-edit`}
                  onClick={() => {
                    onShow(z.id);
                    setEditing(z.id);
                  }}
                  className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-content-muted transition-colors hover:bg-glass/15 hover:text-content"
                >
                  <Icon name="edit" size={13} />
                </button>
                <button
                  type="button"
                  aria-label={`Delete ${z.name}`}
                  data-ui={`terragen-zoom-set-${z.id}-delete`}
                  onClick={() => {
                    scene.deleteZoom(z.id);
                    setEditing((cur) => (cur === z.id ? null : cur));
                  }}
                  className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-content-muted transition-colors hover:bg-danger-soft/40 hover:text-danger"
                >
                  <Icon name="trash" size={13} />
                </button>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
