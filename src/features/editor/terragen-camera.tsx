import { useState } from "react";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/icons";
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
  stopGap,
  withVerticalSpan,
  type CameraRig,
} from "./camera-rig";
import { CaptureExplainer, type CaptureTopic } from "./CaptureExplainer";
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
  /** Which setting has its explainer open — one at a time, as in the editor. */
  const [explain, setExplain] = useState<CaptureTopic | null>(null);

  if (!cameraRig || !start || !end) return null;

  const fixed = cameraRig.mode === "fixed";
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
      <Note>
        These are the camera's own settings — editing them here moves the rig in the scene, and the
        stage switches to the rig so you can see it happen.
      </Note>

      <Group title="Camera mode">
        {/* The editor's own two cards — the choice and what it costs you, not a
            segmented control whose labels have to carry the whole explanation. */}
        <div className="flex flex-col gap-2">
          {(
            [
              {
                value: "rotatable" as const,
                label: "Rotatable",
                hint: "Master turns a full revolution at each height, stepping start → end.",
              },
              {
                value: "fixed" as const,
                label: "Fixed",
                hint: "One front-on frame. No orbit, no climb.",
              },
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
                "flex flex-col items-start gap-0.5 rounded-xl border px-3 py-2 text-left transition-colors",
                cameraRig.mode === m.value
                  ? "border-brand/50 bg-brand/12"
                  : "border-glass/12 hover:bg-glass/8"
              )}
            >
              <span className="type-body-strong flex items-center gap-1.5 text-content">
                {cameraRig.mode === m.value && (
                  <Icon name="check" size={12} strokeWidth={3} className="text-brand" />
                )}
                {m.label}
              </span>
              <span className="type-caption text-content-subtle">{m.hint}</span>
            </button>
          ))}
        </div>
        <Explain
          topic="cameraMode"
          open={explain === "cameraMode"}
          onToggle={() => setExplain((t) => (t === "cameraMode" ? null : "cameraMode"))}
          rig={cameraRig}
        />
      </Group>

      <Group title="Zoom distance" hint="how far in the sweep travels">
        <DistanceControl
          nearDistance={rig.nearDistance}
          farDistance={rig.farDistance}
          nearLimit={rig.nearLimit}
          masterName={rig.masterName ?? "the master"}
          onHandle={() => onEditing("distance")}
          onChange={focused("distance", setNear)}
        />
        {/* NO "FURTHEST" SLIDER. The far end is where the pair physically
            stands, and it is set by dragging the cameras — a slider for it was
            a third way to say a thing the viewport already says better, and it
            re-built the mast on every tick of the drag. The reach it produces
            still reads on the line above, beside the near end it bounds. */}
      </Group>

      {!fixed && (
        <>
          <Group title="Camera height" hint="how high the sweep climbs">
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
            <p className="type-caption mt-2 text-content-subtle">
              How far the far camera stands above the near one. The near camera holds still and the
              far one moves straight up and down, so the pair stays a vertical mast over{" "}
              {rig.masterName ?? "the master"} rather than leaning into a slope.
            </p>
          </Group>

          <Group title="Orbit rotation" hint="where the rig stands">
            {/*
              THE SAME CONTROL THE EDITOR HAS, because it is the same setting.
              This was a lone 0–359 "Bearing" slider, and it was wrong in the
              way a half-copy usually is: the rig's orbit is THREE numbers, not
              one — where the sweep starts (`orbitStart`), where it stops
              (`orbitEnd`), and where the pair is standing right now. Editing
              only the third meant the arc the master actually turns through
              was invisible here and unreachable, while Shots / Rotation right
              below it kept quoting that arc in its own copy.

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

            <p className="type-caption mt-2 text-content-subtle">
              Swings both cameras around {rig.masterName ?? "the master"}, keeping their height and
              reach. Drag the ring in the viewport for the same thing.
            </p>
          </Group>

          <Group title="Shots">
            <div className="space-y-3">
              {/* Capped by what the sweep can actually hold: past that the extra
                  stops are the same frame billed again. */}
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
              <p className="type-caption text-content-subtle">
                {stops <= 1
                  ? "One stop — the rig shoots its rotation without climbing."
                  : `${stops} stops between the two ends, ${stopGap(sweep, stops).toFixed(2)} m apart. ` +
                    `Room for ${maxStops(sweep)} over this ${sweep.toFixed(1)} m sweep.`}
              </p>
              <Explain
                topic="shotsPerDistance"
                open={explain === "shotsPerDistance"}
                onToggle={() =>
                  setExplain((t) => (t === "shotsPerDistance" ? null : "shotsPerDistance"))
                }
                rig={cameraRig}
              />

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
              <Explain
                topic="shotsPerRotation"
                open={explain === "shotsPerRotation"}
                onToggle={() =>
                  setExplain((t) => (t === "shotsPerRotation" ? null : "shotsPerRotation"))
                }
                rig={cameraRig}
              />
            </div>
          </Group>
        </>
      )}
    </>
  );
}

/**
 * The editor's capture explainer, behind the same info button it uses there.
 *
 * Folded rather than always-on: the diagrams are worth their height the first
 * few times and are pure noise afterwards, and this column is already the
 * longest section in the dock.
 */
function Explain({
  topic,
  open,
  onToggle,
  rig,
}: {
  topic: CaptureTopic;
  open: boolean;
  onToggle: () => void;
  rig: CameraRig;
}) {
  return (
    <div className="mt-2">
      <button
        type="button"
        aria-expanded={open}
        data-ui={`terragen-explain-${topic}`}
        onClick={onToggle}
        className="type-caption flex items-center gap-1.5 text-content-subtle transition-colors hover:text-content"
      >
        <Icon name="info" size={13} className="shrink-0" />
        {open ? "Hide how this works" : "How this works"}
      </button>
      {open && <CaptureExplainer topic={topic} rig={rig} />}
    </div>
  );
}
