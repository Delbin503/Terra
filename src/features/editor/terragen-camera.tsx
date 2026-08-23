import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/icons";
import { Pill, SearchInput } from "./ui";
import { FactorCard } from "./controls-ui";
import { canTakeRole, ROLE_BADGE, ROLE_DOT } from "./scene-types";
import { atDistance, DISTANCE_SHOTS_RANGE, SHOTS_RANGE, withVerticalSpan } from "./camera-rig";
import type { SceneApi } from "./useScene";
import type { RigState, SceneRoles } from "./work-order";
import { Group, Note, Segmented } from "./terragen-parts";

/**
 * CAMERA & MASTER — one section, because they are one decision.
 *
 * WHY THEY MERGED. Pitch, distance and "which object is the hero" were three
 * separate rows, and every one of them was a way of asking the same question:
 * what does this rig shoot, and from where. Reading them apart is how you end
 * up with a sweep pointed at nothing.
 *
 * WHY THE CONTROLS ARE THE CAMERA'S OWN. These are the same six settings the
 * camera object carries in the viewport — mode, near and far reach, climb,
 * shots per rotation, shots per distance — and they edit the SAME rig. The
 * panel used to keep its own pitch/yaw/distance ranges beside the rig's, which
 * meant two descriptions of one sweep that drifted apart the moment a camera
 * was dragged, plus a "Match rig" button to paper over the drift. There is now
 * one description, and it is the rig.
 */
export function CameraSection({ scene, rig, roles }: { scene: SceneApi; rig: RigState; roles: SceneRoles }) {
  return (
    <div data-ui="terragen-editor-camera">
      <MasterPicker scene={scene} roles={roles} />

      {/* Framing is no longer a button. TerraGen re-frames the rig on the master
          itself (see TerraGenView), so the only thing left to say here is when
          there is no rig to frame. */}
      {rig.hasMaster && !rig.hasRig && (
        <Note tone="warn">
          No camera in the scene. Place a Camera in the viewport — its two positions are the sweep,
          and these controls edit it.
        </Note>
      )}

      {rig.hasRig && rig.rig && <RigControls scene={scene} rig={rig} />}
    </div>
  );
}

/* --------------------------------------------------------------- master --- */

/**
 * The master, as a FIELD that opens — not a list that is always open.
 *
 * It used to render the whole candidate list inline, search box and all, which
 * meant the section's first ~180px were spent on a decision that is made once
 * per scene and then left alone. Worse, on a scene of same-named objects the
 * one fact you actually wanted — WHICH of them is currently the master — was a
 * checkmark somewhere in a scrolling list rather than the thing at the top.
 *
 * So the resting state is one row naming the current master, and choosing a
 * different one is a click that opens the list and a second that closes it.
 * Same control, and the answer is legible without opening anything.
 */
function MasterPicker({ scene, roles }: { scene: SceneApi; roles: SceneRoles }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const eligible = useMemo(
    () => scene.objects.filter((o) => canTakeRole(o.source)),
    [scene.objects]
  );

  const candidates = useMemo(() => {
    const q = query.trim().toLowerCase();
    return eligible.filter((o) => o.name.toLowerCase().includes(q));
  }, [eligible, query]);

  const master = roles.master;

  return (
    <Group title="Master object" hint={master ? undefined : "none marked"}>
      {eligible.length === 0 ? (
        <Note tone="warn">
          Nothing in the scene can be the master yet. Place an object from the library first.
        </Note>
      ) : (
        <>
          <button
            type="button"
            aria-expanded={open}
            data-ui="terragen-master-field"
            onClick={() => {
              setOpen((o) => !o);
              setQuery("");
            }}
            className={cn(
              "flex w-full items-center gap-2.5 rounded-xl border px-2.5 py-2 text-left transition-colors",
              master
                ? "border-master/45 bg-master/10"
                : "border-glass/12 bg-glass/6 hover:border-glass/25"
            )}
          >
            <span
              aria-hidden
              className={cn(
                "h-2.5 w-2.5 shrink-0 rounded-full border",
                master ? "border-master bg-master" : "border-glass/25"
              )}
            />
            <span className="min-w-0 grow">
              <span className="type-body-strong block truncate text-content">
                {master ? master.name : "Choose a master object"}
              </span>
              <span className="type-caption block truncate text-content-subtle">
                {master ? "Every camera orbits this" : `${eligible.length} eligible in scene`}
              </span>
            </span>
            <Icon
              name="chevron-down"
              size={14}
              className={cn("shrink-0 text-content-subtle transition-transform", open && "rotate-180")}
            />
          </button>

          {open && (
            <div className="mt-2">
              {/* Search only earns its line once the list is long enough to need
                  it — under a handful of objects it's a control between you and
                  four buttons. */}
              {eligible.length > 5 && (
                <SearchInput
                  value={query}
                  onValueChange={setQuery}
                  ui="terragen-master-search"
                  className="mb-2 w-full"
                  placeholder="Search objects in the scene"
                />
              )}

              <div
                data-ui="terragen-master-list"
                className="max-h-[184px] space-y-1 overflow-y-auto pr-0.5"
              >
                {candidates.length === 0 ? (
                  <Note>No object matches "{query}".</Note>
                ) : (
                  candidates.map((o) => {
                    const isMasterObj = o.role === "master";
                    return (
                      <button
                        key={o.id}
                        type="button"
                        role="radio"
                        aria-checked={isMasterObj}
                        data-ui={`terragen-master-${o.id}`}
                        onClick={() => {
                          scene.setRole(o.id, "master");
                          // The field now says what you just chose, so the list
                          // has nothing left to tell you.
                          setOpen(false);
                        }}
                        className={cn(
                          "flex w-full items-center gap-2.5 rounded-lg border px-2.5 py-2 text-left transition-colors",
                          isMasterObj
                            ? "border-master/55 bg-master/12"
                            : "border-glass/10 bg-glass/5 hover:border-glass/25"
                        )}
                      >
                        <span
                          className={cn(
                            "grid h-4 w-4 shrink-0 place-items-center rounded-full border",
                            isMasterObj ? "border-master bg-master text-canvas" : "border-glass/25"
                          )}
                        >
                          {isMasterObj && <Icon name="check" size={11} />}
                        </span>
                        <span className="type-body grow truncate text-content">{o.name}</span>
                        {!isMasterObj && o.role !== "none" && (
                          <span
                            aria-hidden
                            className={cn("h-2.5 w-2.5 shrink-0 rounded-full border", ROLE_DOT[o.role])}
                            title={ROLE_BADGE[o.role]}
                          />
                        )}
                        {isMasterObj && (
                          <Pill ui="master-current" tone="master">
                            Master
                          </Pill>
                        )}
                      </button>
                    );
                  })
                )}
              </div>

              <p className="type-caption mt-2 text-content-subtle">
                One master per Work Order — picking another releases the current one.
              </p>
            </div>
          )}
        </>
      )}
    </Group>
  );
}

/* ------------------------------------------------------------------ rig --- */

/**
 * The rig's own settings, edited in place.
 *
 * Every control here writes to the scene, not to the Work Order draft: the rig
 * IS the sweep, so there is nothing to copy and nothing to keep in step. The
 * geometry helpers are the same ones the viewport's gizmos use, which is what
 * keeps dragging a camera and typing a number the same edit.
 */
function RigControls({ scene, rig }: { scene: SceneApi; rig: RigState }) {
  const { rig: cameraRig, start, end, target } = rig;
  if (!cameraRig || !start || !end) return null;

  const fixed = cameraRig.mode === "fixed";

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

  /**
   * The far end IS where the pair stands, so this moves them — the far camera
   * down its own sight line, then the near one back underneath it.
   *
   * The rig is a mast: the two ends sit one above the other and the climb is
   * the gap between them. Moving only the far camera would lean it away from
   * its partner, so the column is rebuilt after every reach change.
   */
  const setFar = (metres: number) => {
    const d = Math.max(rig.nearLimit, Math.min(rig.farLimit, metres));
    const moved = atDistance(target, end.position, d);
    scene.updateOne(end.id, { position: moved });
    scene.updateOne(start.id, {
      position: [moved[0], moved[1] - rig.climb, moved[2]] as [number, number, number],
    });
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

  return (
    <>
      <Group title="Mode">
        <Segmented
          value={cameraRig.mode}
          options={[
            { id: "rotatable", label: "Rotatable" },
            { id: "fixed", label: "Fixed" },
          ]}
          onChange={(v) => scene.updateRig(cameraRig.id, { mode: v })}
        />
        <p className="type-caption mt-2 text-content-subtle">
          {fixed
            ? "Fixed — one frame from where the near camera stands."
            : "Rotatable — the master turns a full revolution at each stop along the sweep."}
        </p>
      </Group>

      <Group title="Distance" hint="from the master">
        <div className="space-y-3">
          <FactorCard
            label="Nearest"
            value={rig.nearDistance}
            min={rig.nearLimit}
            max={Math.max(rig.nearLimit + 0.1, rig.farDistance)}
            step={0.1}
            precision={1}
            unit=" m"
            onChange={setNear}
          />
          {!fixed && (
            <FactorCard
              label="Farthest"
              value={rig.farDistance}
              min={rig.nearLimit}
              max={rig.farLimit}
              step={0.1}
              precision={1}
              unit=" m"
              onChange={setFar}
            />
          )}
        </div>
        <p className="type-caption mt-2 text-content-subtle">
          Closer than {rig.nearLimit} m is inside {rig.masterName ?? "the master"}'s bounding box —
          TerraGen clamps there too.
        </p>
      </Group>

      {!fixed && (
        <>
          <Group title="Viewing angle" hint="how high the sweep climbs">
            <FactorCard
              label="Climb"
              value={rig.climb}
              min={0}
              max={Math.max(0.5, rig.climbLimit)}
              step={0.1}
              precision={1}
              unit=" m"
              onChange={setClimb}
            />
            <p className="type-caption mt-2 text-content-subtle">
              The far camera rises straight up, so the pair stays a mast — the two ends one above
              the other, with the climb as the gap between them.
            </p>
          </Group>

          <Group title="Shots">
            <div className="space-y-3">
              <FactorCard
                label="Shots / rotation"
                value={cameraRig.shotsPerRotation}
                min={SHOTS_RANGE.min}
                max={SHOTS_RANGE.max}
                step={SHOTS_RANGE.step}
                precision={0}
                onChange={(v) =>
                  scene.updateRig(cameraRig.id, { shotsPerRotation: Math.round(v) })
                }
              />
              <FactorCard
                label="Shots / distance"
                value={cameraRig.shotsPerDistance}
                min={DISTANCE_SHOTS_RANGE.min}
                max={DISTANCE_SHOTS_RANGE.max}
                step={DISTANCE_SHOTS_RANGE.step}
                precision={0}
                onChange={(v) =>
                  scene.updateRig(cameraRig.id, { shotsPerDistance: Math.round(v) })
                }
              />
            </div>
          </Group>
        </>
      )}

      <Note>
        These are the camera's own settings — editing them here moves the rig in the scene.
      </Note>
    </>
  );
}
