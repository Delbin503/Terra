import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AssetType } from "./assets-data";
import {
  isMaster,
  makeCameraRig,
  isWorldAsset,
  makeMaterialSlot,
  UNNAMED_SLOT,
  makeSceneObject,
  type MaterialSlot,
  nextObjectId,
  type ObjectRole,
  makeGroup,
  type SceneObject,
} from "./scene-types";
import { subtreeIds } from "./scene-tree";
import {
  centreOf,
  paintAllSlots,
  posesDiffer,
  reparentPose,
  type GroupPose,
} from "./group-transform";
import {
  clampIntoVolume,
  halfExtent,
  isInside,
  makeVolume,
  type SceneVolume,
} from "./scene-volume";
import type { Placement } from "./arrange";
import {
  CAMERA_DEFAULTS,
  distance,
  framingPosition,
  nearLimit,
  type CameraRig,
} from "./camera-rig";
import {
  DEFAULT_WEATHER,
  makeSavedWeather,
  nextPresetName,
  patchWeather,
  resetLayers,
  toggleLayer,
  type SavedWeather,
  type SceneWeather,
  type WeatherLayerId,
  type WeatherPatch,
} from "./weather";

/** Scene lighting (chatbot-controllable). brightness 0.3–2, warmth -1..1. */
export interface SceneEnv {
  brightness: number;
  warmth: number;
}

type Vec3 = [number, number, number];

/** Copies land beside the original, not inside it — an exact overlap reads as
 *  "nothing happened" until you drag the top one off. */
const COPY_OFFSET: Vec3 = [0.6, 0, 0.6];

/**
 * Clone a set of objects with fresh ids.
 *
 * `parentId` is re-pointed within the set, so duplicating a group reproduces its
 * internal shape instead of hanging the copies off the original's children. A
 * parent OUTSIDE the set is kept as-is, which is what puts a duplicated child
 * back in the same group as the thing it was copied from.
 *
 * EVERY CLONE IS NUDGED, not just the root. It used to be the root alone, which
 * was indistinguishable from nudging all of them while a copy was a single
 * object with nothing under it. It stopped being indistinguishable the moment
 * groups existed: offsetting a group's origin and leaving its contents where
 * they were produced a copy whose gizmo stood half a metre from the things it
 * moved. The set travels as a set.
 *
 * `ids` comes back so callers can find the clone of a particular original —
 * which top-level members to hold after a bulk duplicate, for instance.
 */
function cloneSubtree(source: SceneObject[], rootId: string) {
  const idMap = new Map(source.map((o) => [o.id, nextObjectId()]));
  const clones = source.map((o) => ({
    ...o,
    id: idMap.get(o.id)!,
    parentId: o.parentId && idMap.has(o.parentId) ? idMap.get(o.parentId) : o.parentId,
    // The scene has exactly one hero object, and it isn't a copy of one. The
    // other two roles DO survive the copy: duplicating a distractor to scatter
    // more clutter is the whole reason you'd duplicate it.
    role: isMaster(o) ? ("none" as const) : o.role,
    name: o.id === rootId ? `${o.name} copy` : o.name,
    position: [
      o.position[0] + COPY_OFFSET[0],
      o.position[1] + COPY_OFFSET[1],
      o.position[2] + COPY_OFFSET[2],
    ] as Vec3,
  }));
  return { clones, rootId: idMap.get(rootId)!, ids: idMap };
}

/**
 * Which objects a volume is entitled to hold.
 *
 * A camera is exempt because the capture rig orbits the master and routinely
 * stands OUTSIDE the room looking into it — clamping one would fight the sweep
 * the whole time. A world asset is exempt because it IS the room; a sky pushed
 * inside a living room is a nonsense, and so is a captured warehouse.
 */
const isContainable = (o: { source: AssetType; group?: true }) =>
  // A group is not a thing in the room, it is a name for some things in it. Its
  // contents are each clamped on their own; clamping the container as well would
  // move all of them to keep a centroid inside a wall it was never against.
  !o.group && o.source !== "camera" && !isWorldAsset(o.source);

/** Everything undo has to put back. */
interface Snapshot {
  objects: SceneObject[];
  rigs: CameraRig[];
  volumes: SceneVolume[];
  selectedId: string | null;
}

interface HistoryEntry {
  snap: Snapshot;
  /** what produced it — consecutive matches inside COALESCE_MS fold together */
  tag: string;
  at: number;
}

/** A gizmo drag fires `update` per frame; this is how long they keep folding
 *  into one step. Long enough for a slow drag, short enough that two deliberate
 *  nudges of the same object stay two undos. */
const COALESCE_MS = 600;

/** Snapshots are cheap (two array refs) but not free — this is roughly a
 *  session's worth of edits. */
const HISTORY_LIMIT = 100;

/**
 * The scene a new project opens with: one hero object, and a camera rig aimed
 * at it.
 *
 * Built in ONE function because the rig has to reference the ids its cameras
 * were actually minted with. Two separate `useState` initializers can't see
 * each other's output, so the rig used to hardcode "cam-1"/"cam-2" — which was
 * off by one, since `makeSceneObject` takes the first number off the shared
 * counter and the cameras come out as cam-2 and cam-3. The seeded rig therefore
 * pointed at a camera that never existed, `rigCameras` returned no start, and
 * every fresh project opened insisting no camera was placed.
 */
function seedScene() {
  const master = { ...makeSceneObject("Torus", "mesh", [0, 0.5, 0]), role: "master" as const };
  const [start, end] = makeCameraRig("rig-seed", [4, 1, 4], [4, 9, 4]);
  return {
    objects: [master, start, end],
    rigs: [
      {
        id: "rig-seed",
        startId: start.id,
        endId: end.id,
        ...CAMERA_DEFAULTS,
        // The pair sits at ~5.7 m out; the sweep travels in to roughly half of
        // that. See `addCameraRig` for why the near end is a saved number.
        nearDistance: 2.6,
      },
    ],
  };
}

/** Central store for objects placed in the 3D scene + the current selection. */
export function useScene() {
  // Lazy so the counter is only advanced once, and shared so the two pieces of
  // state agree about which cameras exist.
  const [seed] = useState(seedScene);
  const [objects, setObjects] = useState<SceneObject[]>(seed.objects);
  const [rigs, setRigs] = useState<CameraRig[]>(seed.rigs);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  /**
   * A MARQUEE SELECTION — several objects held at once, with no focus.
   *
   * Deliberately a SECOND piece of state rather than turning `selectedId` into a
   * list. One selected object opens focus mode: a title over the viewport, a fly
   * -in, a bottom toolbar, an inspector column, a gizmo. None of that has a
   * meaning for eleven objects, and the thirty-odd call sites that read
   * `scene.selected` would each have had to decide what "the selected object"
   * meant when there were eleven of them.
   *
   * So the two are mutually exclusive and each keeps its own vocabulary: exactly
   * one of them is non-empty, `select` clears this and `selectMany` clears that,
   * and a multi-selection's whole UI is the outlines in the viewport plus the
   * one menu that acts on all of them.
   */
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  /**
   * The volumes drawn in the scene, and which one is armed.
   *
   * A LIST FROM DAY ONE even though the UI only draws one at a time: "living
   * room and kitchen" is the obvious second thing anyone asks for, and adding
   * the second later would mean migrating every reader of a singular field.
   *
   * `activeVolumeId` is what containment and the Arrangement axis read. It is a
   * separate piece of state from `selectedId` on purpose — a volume is not a
   * SceneObject, so selecting a chair must not disarm the room it sits in.
   */
  const [volumes, setVolumes] = useState<SceneVolume[]>([]);
  const [activeVolumeId, setActiveVolumeId] = useState<string | null>(null);
  /**
   * The volume the editor is FOCUSED ON — the one wearing its title, its
   * toolbar and its purple.
   *
   * SEPARATE FROM `activeVolumeId` because they answer different questions.
   * "Active" is which room this project is about: it survives clicking away,
   * and it is what the Arrangement axis renders long after you stopped editing
   * the box. "Selected" is whether you are editing it RIGHT NOW, and it is what
   * containment reads — so an object dropped while the space is selected lands
   * inside it, and the same drop with nothing selected lands where you let go.
   */
  const [selectedVolumeId, setSelectedVolumeId] = useState<string | null>(null);
  const [env, setEnvState] = useState<SceneEnv>({ brightness: 1, warmth: 0 });
  /**
   * The atmosphere the scene stands in — one configuration, not a set to
   * permute. It is SCENE state rather than Work Order state for the same reason
   * the camera rig is: the panel edits it, the scene renders it, and there is
   * therefore only one description of it to keep true. See weather.ts.
   */
  const [weather, setWeatherState] = useState<SceneWeather>(DEFAULT_WEATHER);
  /** Named states someone kept this session — §7 of the weather spec. */
  const [savedWeather, setSavedWeather] = useState<SavedWeather[]>([]);
  // Mirrors of the two above, so save/load can read the live values without
  // nesting one setState inside another's updater — which StrictMode
  // double-invokes, and which saved two identically-named presets per click.
  const weatherRef = useRef(weather);
  weatherRef.current = weather;
  const savedWeatherRef = useRef(savedWeather);
  savedWeatherRef.current = savedWeather;
  /** Scene clipboard for the layers panel's Copy / Paste. Snapshot by value. */
  const [clipboard, setClipboard] = useState<{ rootId: string; objects: SceneObject[] } | null>(
    null
  );

  /* --------------------------------------------------------------- history */

  /**
   * Undo / redo over the scene graph.
   *
   * Snapshots, not inverse operations. Every mutation here already produces a
   * fresh immutable `objects` array, so a snapshot is two array references and
   * restoring one is exactly as correct as the forward operation was — whereas
   * hand-written inverses would need a new one per command, and `setRole`
   * alone (which re-homes every camera rig) would be an evening's work to invert
   * correctly.
   *
   * `selectedId` rides along, because half of these commands change it. Undoing
   * a delete that leaves you selecting nothing has undone the wrong amount.
   *
   * ONE GESTURE IS ONE STEP, and the mirror below is what delivers that. It
   * refreshes in an effect, so several commands dispatched in the SAME tick all
   * record the same pre-gesture snapshot and collapse to a single entry. That is
   * deliberate: the library's "Add to scene" places every selected asset in one
   * loop, and a user who picked four things and pressed one button expects one
   * undo to take back what that button did — not four.
   */
  const live = useRef<Snapshot>({ objects, rigs, volumes, selectedId });
  useEffect(() => {
    live.current = { objects, rigs, volumes, selectedId };
  }, [objects, rigs, volumes, selectedId]);

  const past = useRef<HistoryEntry[]>([]);
  const future = useRef<Snapshot[]>([]);
  /** Bumped on every history change so `canUndo` / `canRedo` re-render. */
  const [, setHistoryTick] = useState(0);

  /**
   * Record the state as it is NOW, before the caller changes it.
   *
   * `tag` is what makes a DRAG one step instead of sixty: the transform gizmo
   * calls `update` on every frame it moves, so consecutive commits carrying the
   * same tag inside COALESCE_MS fold into the entry already on the stack — the
   * whole drag undoes at once, which is what "undo" means to the person who
   * dragged it.
   *
   * An empty tag never folds, and that's the default for every DISCRETE command.
   * Only a continuous edit has intermediate states nobody asked to keep; three
   * objects dropped in quickly are three things that happened, and one undo must
   * not take all three back.
   */
  const commit = useCallback((tag = "") => {
    const now = performance.now();
    const top = past.current[past.current.length - 1];
    // Any new edit forks the timeline: whatever was redoable is now unreachable.
    future.current = [];

    if (tag && top && top.tag === tag && now - top.at < COALESCE_MS) {
      top.at = now;
      setHistoryTick((t) => t + 1);
      return;
    }
    past.current = [...past.current, { snap: live.current, tag, at: now }].slice(-HISTORY_LIMIT);
    setHistoryTick((t) => t + 1);
  }, []);

  const restore = useCallback((snap: Snapshot) => {
    setObjects(snap.objects);
    setRigs(snap.rigs);
    setVolumes(snap.volumes);
    setSelectedId(snap.selectedId);
  }, []);

  const undo = useCallback(() => {
    const top = past.current[past.current.length - 1];
    if (!top) return;
    past.current = past.current.slice(0, -1);
    future.current = [...future.current, live.current];
    restore(top.snap);
    setHistoryTick((t) => t + 1);
  }, [restore]);

  const redo = useCallback(() => {
    const next = future.current[future.current.length - 1];
    if (!next) return;
    future.current = future.current.slice(0, -1);
    // No tag: a redone step must never coalesce with whatever is edited next.
    past.current = [...past.current, { snap: live.current, tag: "", at: 0 }].slice(-HISTORY_LIMIT);
    restore(next);
    setHistoryTick((t) => t + 1);
  }, [restore]);

  const setEnv = useCallback(
    (patch: Partial<SceneEnv>) =>
      setEnvState((prev) => ({
        brightness: Math.max(0.3, Math.min(2, patch.brightness ?? prev.brightness)),
        warmth: Math.max(-1, Math.min(1, patch.warmth ?? prev.warmth)),
      })),
    []
  );

  /* --------------------------------------------------------------- weather */

  /**
   * Nudge one or more weather values. Clamping lives in `patchWeather` rather
   * than here, so the ranges are stated once and testable without React.
   */
  const setWeather = useCallback(
    (patch: WeatherPatch) => setWeatherState((prev) => patchWeather(prev, patch)),
    []
  );

  /**
   * Switch one condition on or off. Conditions COMBINE, so this adds to the mix
   * rather than replacing it — see weather.ts for why.
   */
  const toggleWeatherLayer = useCallback(
    (id: WeatherLayerId) => setWeatherState((prev) => toggleLayer(prev, id)),
    []
  );

  /** Back to the stock dial values of whichever conditions are on. */
  const resetWeather = useCallback(() => setWeatherState((prev) => resetLayers(prev)), []);

  /**
   * Keep the current weather under a name. The name is computed INSIDE the
   * updater, against the fresh `prev` list — so two quick saves become "Rain"
   * then "Rain 2" rather than two "Rain"s racing the same stale snapshot.
   */
  const saveWeather = useCallback(() => {
    setSavedWeather((prev) => {
      const state = weatherRef.current;
      return [...prev, makeSavedWeather(nextPresetName(state, prev), state)];
    });
  }, []);

  const loadWeather = useCallback((id: string) => {
    const hit = savedWeatherRef.current.find((s) => s.id === id);
    // Copied on the way in: loading a preset twice and editing between must not
    // mutate the stored one.
    if (hit) setWeatherState(patchWeather(hit.state, {}));
  }, []);

  const deleteWeather = useCallback(
    (id: string) => setSavedWeather((prev) => prev.filter((s) => s.id !== id)),
    []
  );

  /**
   * Write the live weather back over a set you loaded to edit.
   *
   * WHY THIS EXISTS. Saving was the only way in, so correcting a set meant
   * loading it, changing a dial, saving — and ending up with "Rain" and
   * "Rain 2", both checked into the run, one of them wrong. Overwriting keeps
   * the id, the name and the checkbox, so a set that was in the run stays in it
   * and the subset count doesn't move under the edit.
   */
  const updateWeatherSet = useCallback(
    (id: string) =>
      setSavedWeather((prev) =>
        prev.map((s) =>
          // Copied on the way in, for the same reason `loadWeather` copies on
          // the way out: the stored state must not alias the live one.
          s.id === id ? { ...s, state: patchWeather(weatherRef.current, {}) } : s
        )
      ),
    []
  );

  /** Rename a set. The name is how it's identified in the run, so it's editable
   *  in place rather than only at save time. */
  const renameWeatherSet = useCallback(
    (id: string, name: string) =>
      setSavedWeather((prev) =>
        prev.map((s) => (s.id === id ? { ...s, name: name.trim() || s.name } : s))
      ),
    []
  );

  /** Check a saved set into the run, or out of it — see `SavedWeather.inRun`. */
  const toggleWeatherInRun = useCallback(
    (id: string) =>
      setSavedWeather((prev) =>
        prev.map((s) => (s.id === id ? { ...s, inRun: !s.inRun } : s))
      ),
    []
  );

  /* --------------------------------------------------------------- volumes */

  /**
   * The armed volume, mirrored for the mutators.
   *
   * `add` and `update` are `useCallback([])` — stable for the life of the editor,
   * which is what stops every panel below them re-rendering on each keystroke.
   * They cannot close over `volumes` without giving that up, so the one value
   * they need reads off a ref instead. Same bargain `weatherRef` already makes.
   *
   * It holds null when containment is off, so the clamp sites don't each have to
   * remember to check the flag.
   */
  const containRef = useRef<SceneVolume | null>(null);
  containRef.current = volumes.find((v) => v.id === selectedVolumeId && v.contain) ?? null;

  const addVolume = useCallback((center: Vec3, size: Vec3, name?: string) => {
    const v = makeVolume(center, size, name);
    setVolumes((prev) => [...prev, v]);
    setActiveVolumeId(v.id);
    // A space you just drew is a space you are editing — it opens focused, the
    // same way a dropped object used to.
    setSelectedVolumeId(v.id);
    setSelectedId(null);
    return v.id;
  }, []);

  /**
   * Resize, rename, wall off, arm or disarm a volume.
   *
   * IT NEVER MOVES AN OBJECT. Dragging a face inward past a sofa leaves the sofa
   * exactly where it is; the panel counts it as outside and offers to bring it
   * in. Silently relocating someone's scene on a slider drag would be the worst
   * available behaviour, and the clamp is a rule about EDITS, not a rule the
   * scene is continuously re-validated against.
   */
  const updateVolume = useCallback((id: string, patch: Partial<SceneVolume>) => {
    setVolumes((prev) => prev.map((v) => (v.id === id ? { ...v, ...patch } : v)));
  }, []);

  const removeVolume = useCallback((id: string) => {
    setVolumes((prev) => {
      const next = prev.filter((v) => v.id !== id);
      // Arm whatever is left rather than leaving the editor with volumes drawn
      // and none of them holding anything.
      setActiveVolumeId((cur) => (cur === id ? next[0]?.id ?? null : cur));
      setSelectedVolumeId((cur) => (cur === id ? null : cur));
      return next;
    });
  }, []);

  /**
   * Focus a volume, or clear the focus.
   *
   * ONE SELECTION AT A TIME across the whole scene: focusing a space drops the
   * object selection and vice versa, because both drive the same three pieces
   * of chrome — the title, the bottom toolbar and the inspector column — and
   * two things claiming them at once is two titles over one viewport.
   */
  const selectVolume = useCallback((id: string | null) => {
    setSelectedVolumeId(id);
    if (id) {
      setSelectedId(null);
      setSelectedIds([]);
      setActiveVolumeId(id);
    }
  }, []);

  /** Select an object. Clears any focused volume and any marquee, for the
   *  reason above: three things claiming the same chrome is three titles over
   *  one viewport. */
  const selectObject = useCallback((id: string | null) => {
    setSelectedId(id);
    if (id) {
      setSelectedVolumeId(null);
      setSelectedIds([]);
    }
  }, []);

  /**
   * Hold several objects at once.
   *
   * ONE OBJECT IS NOT A MULTI-SELECTION. A marquee that happened to catch a
   * single chair should behave exactly like clicking that chair — focus mode,
   * gizmo, inspector — otherwise the editor has two different states for the
   * same fact, and the user has to know which gesture produced the one they are
   * in before they know what they can do.
   */
  const selectMany = useCallback((ids: string[]) => {
    if (ids.length === 0) {
      setSelectedIds([]);
      return;
    }
    if (ids.length === 1) {
      setSelectedIds([]);
      setSelectedId(ids[0]);
      setSelectedVolumeId(null);
      return;
    }
    setSelectedIds(ids);
    setSelectedId(null);
    setSelectedVolumeId(null);
  }, []);

  /* --------------------------------------------------------------- objects */

  /**
   * Place an object.
   *
   * IT DOES NOT SELECT WHAT IT PLACED. Selecting an object opens focus mode —
   * the title takeover, the fly-in, the bottom toolbar — so adding four things
   * from the library used to mean being thrown into and out of focus four
   * times, each one hiding the scene you were building. Placing puts a thing
   * in the world; clicking it is how you say you want to work on it.
   *
   * Paste and Duplicate still focus what they made, and should: those act on
   * something you already had hold of, so landing on the copy is continuing the
   * gesture rather than interrupting one.
   */
  const add = useCallback(
    (name: string, source: AssetType, position?: Vec3, modelUrl?: string, skyUrl?: string) => {
      const obj = makeSceneObject(name, source, position, modelUrl, skyUrl);
      const vol = containRef.current;
      const placed =
        vol && isContainable(obj)
          ? { ...obj, position: clampIntoVolume(vol, obj.position, halfExtent(obj)) }
          : obj;
      setObjects((prev) => [...prev, placed]);
      return placed.id;
    },
    []
  );

  /**
   * Drop a capture rig. `focusOn` frames both cameras around the master; without
   * it the pair lands at the cursor, still separated so the sweep has a range.
   */
  const addCameraRig = useCallback(
    (at: Vec3, focusOn?: { position: Vec3; radius: number }) => {
      const rigId = `rig-${Date.now().toString(36)}`;
      const [startPos, endPos]: [Vec3, Vec3] = focusOn
        ? [
            framingPosition(focusOn.position, focusOn.radius, "start"),
            framingPosition(focusOn.position, focusOn.radius, "end"),
          ]
        : // No master to frame around: separate the pair vertically so the
          // sweep still has somewhere to travel the moment it lands.
          [at, [at[0], at[1] + 10, at[2]]];

      const [start, end] = makeCameraRig(rigId, startPos, endPos);

      /**
       * A rig lands at its FURTHEST reach and keeps its near end as a number.
       *
       * Dropping a camera at the far distance is what makes the first frame the
       * establishing one — the whole object in shot, nothing cropped — and it
       * means the near reach can be dialled in later against something you can
       * already see. `nearDistance` seeds at a little under half the reach: a
       * real move inward, but not so close that the rig opens with the master
       * filling the frame.
       */
      const reach = focusOn ? distance(focusOn.position, endPos) : distance(startPos, endPos);
      const floor = focusOn ? nearLimit([focusOn.radius / 0.7]) : 1;

      setObjects((prev) => [...prev, start, end]);
      setRigs((prev) => [
        ...prev,
        {
          id: rigId,
          startId: start.id,
          endId: end.id,
          ...CAMERA_DEFAULTS,
          nearDistance: Math.max(floor, reach * 0.45),
        },
      ]);
      setSelectedId(start.id);
      setSelectedVolumeId(null);
      return rigId;
    },
    []
  );

  /**
   * Patch an object. A position change on a rig camera carries its partner by
   * the same delta — the pair is one rig, and the start↔end separation is the
   * capture range, so it has to survive being dragged around the scene.
   */
  const update = useCallback((id: string, patch: Partial<SceneObject>) => {
    setObjects((prev) => {
      const target = prev.find((o) => o.id === id);
      if (!target) return prev;

      /**
       * CONTAINMENT, APPLIED ONCE.
       *
       * Every position change in the editor funnels through here — the transform
       * gizmo, the properties panel's numeric rows, paste, the layers tree and
       * the arrangement solver — so clamping in this one spot is clamping in all
       * of them, and there is no route into the scene that can quietly bypass it.
       *
       * The clamp reads the object's SCALE, incoming if this same patch changes
       * it: scaling a chair up against a wall has to push it back off the wall,
       * not clamp the new size against the old footprint.
       */
      const vol = containRef.current;
      const next: Partial<SceneObject> =
        vol && patch.position && isContainable(target)
          ? {
              ...patch,
              position: clampIntoVolume(vol, patch.position, halfExtent({
                scale: patch.scale ?? target.scale,
              })),
            }
          : patch;

      /**
       * A GROUP EDIT IS AN EDIT TO ITS CONTENTS.
       *
       * Here rather than in a `updateGroup` of its own, because everything that
       * can move an object funnels through this function — the gizmo, the
       * numeric rows, the layers tree, an undo — and a group whose contents only
       * followed along on SOME of those routes would be a group that quietly
       * came apart.
       *
       * ONE kind of patch cascades here: a transform, which re-places every
       * descendant (`group-transform.ts` does the arithmetic). A rename, a lock,
       * a role or a description stops at the container, which is the whole point
       * of having one.
       *
       * Material used to cascade here too. It moved to `updateMaterial`, which
       * is the only route that can write one now — a patch of five loose fields
       * could ride along inside any `update`, but a slot edit has to say WHICH
       * slot, and that is a different signature.
       */
      if (target.group) {
        const before: GroupPose = {
          position: target.position,
          rotationDeg: target.rotationDeg,
          scale: target.scale,
        };
        const after: GroupPose = {
          position: next.position ?? target.position,
          rotationDeg: next.rotationDeg ?? target.rotationDeg,
          scale: next.scale ?? target.scale,
        };
        const moved = posesDiffer(before, after);
        if (moved) {
          const kids = new Set(subtreeIds(prev, id));
          kids.delete(id);
          return prev.map((o) => {
            if (o.id === id) return { ...o, ...next };
            if (!kids.has(o.id)) return o;
            return { ...o, ...reparentPose(o, before, after) };
          });
        }
      }

      const partnerId =
        target.rigId && next.position
          ? prev.find((o) => o.rigId === target.rigId && o.id !== id)?.id
          : undefined;

      if (!partnerId || !next.position) {
        return prev.map((o) => (o.id === id ? { ...o, ...next } : o));
      }

      const d: Vec3 = [
        next.position[0] - target.position[0],
        next.position[1] - target.position[1],
        next.position[2] - target.position[2],
      ];
      return prev.map((o) => {
        if (o.id === id) return { ...o, ...next };
        if (o.id !== partnerId) return o;
        return {
          ...o,
          position: [o.position[0] + d[0], o.position[1] + d[1], o.position[2] + d[2]] as Vec3,
        };
      });
    });
  }, []);

  /**
   * EDIT ONE MATERIAL SLOT.
   *
   * The only way a material is written now. `update` takes everything else about
   * an object; this takes the one thing that needs to say WHICH surface, because
   * an excavator's roughness is a question with three answers.
   *
   * THE §3.1 GUARANTEE LIVES HERE, and it lives here by being unremarkable: the
   * function rewrites exactly one entry of `materials` and copies the rest
   * through untouched. Switching the slot you are looking at calls nothing at
   * all — it moves a cursor in the panel — so there is no path on which viewing
   * slot 2 can disturb slot 1. The bug the spec is guarding against is the one
   * where switching re-reads defaults into the object; there is nothing here to
   * re-read from.
   *
   * A GROUP PAINTS EVERYTHING IT HOLDS, every slot of every descendant. That is
   * what a group's Texture panel has always meant, and a slot index chosen on
   * the container would have no meaning on contents whose files disagree about
   * how many they have.
   */
  const updateMaterial = useCallback(
    (id: string, slot: number, patch: Partial<MaterialSlot>) => {
      setObjects((prev) => {
        const target = prev.find((o) => o.id === id);
        if (!target) return prev;

        if (target.group) {
          const kids = new Set(subtreeIds(prev, id));
          return prev.map((o) => (kids.has(o.id) ? paintAllSlots(o, patch) : o));
        }

        const i = Math.min(Math.max(slot, 0), target.materials.length - 1);
        return prev.map((o) =>
          o.id === id
            ? { ...o, materials: o.materials.map((m, n) => (n === i ? { ...m, ...patch } : m)) }
            : o
        );
      });
    },
    []
  );

  /**
   * PAINT AN OBJECT — every slot of it.
   *
   * What "make it metallic" means when it arrives as a sentence rather than as
   * a slider. The assistant is talking about the thing, not about one of its
   * elements, and nothing in "make the excavator matte" chooses between its
   * paintwork and its glass. Aiming a chat restyle at whichever slot the panel
   * happened to be pointed at would make the same sentence do different things
   * depending on where the user last clicked.
   *
   * The Texture panel is where one element is singled out; this is the bulk
   * instrument, and it is the same one a group edit uses.
   */
  const paintMaterial = useCallback((id: string, patch: Partial<MaterialSlot>) => {
    setObjects((prev) => {
      const target = prev.find((o) => o.id === id);
      if (!target) return prev;
      const ids = target.group ? new Set(subtreeIds(prev, id)) : new Set([id]);
      return prev.map((o) => (ids.has(o.id) ? paintAllSlots(o, patch) : o));
    });
  }, []);

  /**
   * THE FILE SAYS HOW MANY SLOTS THERE ARE.
   *
   * A placed GLB carries one nominal slot until the loader has actually read it;
   * `SceneObjectMesh` calls this once the model is in hand, with the material
   * names it found. Slot counts are a property of the asset, not something the
   * editor can invent — a fixed three would be wrong for every model that isn't.
   *
   * IT WILL NOT OVERWRITE EDITS. The seed only runs while the object still has
   * its single untouched placeholder slot. A second load of the same url — a
   * duplicate placed, an undo, React re-running an effect — finds real slots
   * already there and leaves them alone, which is the difference between this
   * and a bug that wipes your work every time the model remounts.
   */
  const discoverMaterials = useCallback((id: string, names: string[]) => {
    if (names.length === 0) return;
    setObjects((prev) =>
      prev.map((o) => {
        if (o.id !== id) return o;
        const virgin = o.materials.length === 1 && o.materials[0].name === UNNAMED_SLOT;
        if (!virgin) return o;
        // The one placeholder slot's values carry into the first real slot: the
        // model may have been recoloured while it loaded, and that edit belongs
        // to the surface the user was looking at.
        return {
          ...o,
          materials: names.map((n, i) =>
            i === 0 ? { ...o.materials[0], name: n } : makeMaterialSlot(n)
          ),
        };
      })
    );
  }, []);

  /**
   * Apply a whole arrangement in one go.
   *
   * One `setObjects` rather than a `update()` per object, because the solver
   * produced a ROOM: applying it object by object would put twenty entries on
   * the undo stack for one click, and each intermediate state would be a room
   * half-rearranged. The positions arrive already clamped — the solver never
   * samples outside the volume — so this deliberately does not clamp again.
   */
  const applyPlacements = useCallback((placements: Placement[]) => {
    if (placements.length === 0) return;
    const byId = new Map(placements.map((p) => [p.id, p]));
    setObjects((prev) =>
      prev.map((o) => {
        const p = byId.get(o.id);
        return p ? { ...o, position: p.position, rotationDeg: p.rotationDeg } : o;
      })
    );
  }, []);

  /**
   * Patch a single object, never touching its rig partner. `update` carries the
   * partner along on a position change (the rig moves as one); this is the
   * escape hatch for editing one camera on its own — the "Uniform off" path.
   */
  const updateOne = useCallback((id: string, patch: Partial<SceneObject>) => {
    setObjects((prev) => prev.map((o) => (o.id === id ? { ...o, ...patch } : o)));
  }, []);

  const updateRig = useCallback((rigId: string, patch: Partial<CameraRig>) => {
    setRigs((prev) => prev.map((r) => (r.id === rigId ? { ...r, ...patch } : r)));
  }, []);

  /** Deleting either camera removes the whole rig — half a sweep isn't a thing.
   *  Deleting a group takes its contents with it; leaving orphans behind would
   *  scatter them back to the tree root with no way to undo the grouping. */
  const remove = useCallback((id: string) => {
    let gone: string[] = [id];
    setObjects((prev) => {
      const target = prev.find((o) => o.id === id);
      if (!target) return prev;
      if (target.rigId) {
        setRigs((rs) => rs.filter((r) => r.id !== target.rigId));
        gone = prev.filter((o) => o.rigId === target.rigId).map((o) => o.id);
        return prev.filter((o) => o.rigId !== target.rigId);
      }
      gone = subtreeIds(prev, id);
      const doomed = new Set(gone);
      return prev.filter((o) => !doomed.has(o.id));
    });
    setSelectedId((cur) => (cur && gone.includes(cur) ? null : cur));
    setSelectedIds((cur) => (cur.length === 0 ? cur : cur.filter((id) => !gone.includes(id))));
  }, []);

  /**
   * SWAP ONE OBJECT FOR ANOTHER — one edit, not two.
   *
   * Built for the backdrop swap (see BackdropReplaceDialog), and it exists
   * because doing it as `remove` then `add` is subtly wrong rather than merely
   * verbose. Both are discrete commands, so both commit with an empty tag, and
   * an empty tag never folds (see `commit`) — the swap lands as TWO history
   * entries with a state between them where the old sky is gone and the new one
   * has not arrived. One undo would drop you into a scene with no backdrop at
   * all, which is not a state anybody asked for and not what "undo the replace"
   * means.
   *
   * So it is one `setObjects` under one commit: undo puts the previous backdrop
   * back, exactly as it was.
   *
   * Selection follows the swap rather than being dropped. Replacing the thing
   * you had selected is still an act on that slot in the scene — the same
   * reasoning that makes Paste and Duplicate focus what they made.
   */
  const replaceWith = useCallback(
    (id: string, name: string, source: AssetType, position?: Vec3, modelUrl?: string, skyUrl?: string) => {
      const obj = makeSceneObject(name, source, position, modelUrl, skyUrl);
      const vol = containRef.current;
      const placed =
        vol && isContainable(obj)
          ? { ...obj, position: clampIntoVolume(vol, obj.position, halfExtent(obj)) }
          : obj;

      setObjects((prev) =>
        prev.some((o) => o.id === id)
          ? prev.map((o) => (o.id === id ? placed : o))
          : [...prev, placed]
      );
      setSelectedId((cur) => (cur === id ? placed.id : cur));
      setSelectedIds((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : cur));
      return placed.id;
    },
    []
  );

  /**
   * Copy an object (with anything nested inside it) onto the scene clipboard.
   * The snapshot is by value, so editing or deleting the original afterwards
   * doesn't change what comes back on paste.
   */
  const copy = useCallback(
    (id: string) => {
      const ids = new Set(subtreeIds(objects, id));
      const snapshot = objects.filter((o) => ids.has(o.id));
      if (snapshot.length > 0) setClipboard({ rootId: id, objects: snapshot });
    },
    [objects]
  );

  /**
   * Copy a whole marquee selection.
   *
   * It reuses the single-object clipboard by nominating the FIRST id as the
   * root and carrying the rest alongside. `cloneSubtree` re-points `parentId`
   * within whatever set it is handed, so a paste rebuilds the selection's own
   * shape — the only thing the root is used for is which clone gets the " copy"
   * suffix and the nudge, and one nudged member of a set that all moved together
   * is what tells you the paste landed.
   */
  const copyMany = useCallback(
    (ids: string[]) => {
      const all = new Set(ids.flatMap((id) => subtreeIds(objects, id)));
      const snapshot = objects.filter((o) => all.has(o.id));
      if (snapshot.length > 0) setClipboard({ rootId: ids[0], objects: snapshot });
    },
    [objects]
  );

  const paste = useCallback((): string | null => {
    if (!clipboard) return null;
    const { clones, rootId } = cloneSubtree(clipboard.objects, clipboard.rootId);
    setObjects((prev) => [...prev, ...clones]);
    setSelectedId(rootId);
    setSelectedVolumeId(null);
    return rootId;
  }, [clipboard]);

  /**
   * Duplicate in place. Ids are minted here rather than inside the state
   * updater: an updater must be pure, and StrictMode runs it twice in
   * development — minting inside would burn ids on the render React discards.
   */
  const duplicate = useCallback(
    (id: string): string | null => {
      const target = objects.find((o) => o.id === id);
      if (!target) return null;

      // A rig is one instrument. Duplicating half a sweep would produce a
      // camera that no capture plan can use, so the pair copies together.
      if (target.rigId) {
        const rig = rigs.find((r) => r.id === target.rigId);
        const members = objects.filter((o) => o.rigId === target.rigId);
        if (!rig || members.length === 0) return null;

        const newRigId = `rig-${Date.now().toString(36)}`;
        const idMap = new Map(members.map((o) => [o.id, nextObjectId("cam")]));
        const clones = members.map((o) => ({
          ...o,
          id: idMap.get(o.id)!,
          rigId: newRigId,
          // Cameras never carry a content role; this is belt-and-braces.
          role: "none" as const,
          position: [
            o.position[0] + COPY_OFFSET[0],
            o.position[1] + COPY_OFFSET[1],
            o.position[2] + COPY_OFFSET[2],
          ] as Vec3,
        }));

        setObjects((prev) => [...prev, ...clones]);
        setRigs((prev) => [
          ...prev,
          { ...rig, id: newRigId, startId: idMap.get(rig.startId)!, endId: idMap.get(rig.endId)! },
        ]);
        const first = idMap.get(rig.startId)!;
        setSelectedId(first);
        return first;
      }

      const ids = new Set(subtreeIds(objects, id));
      const { clones, rootId } = cloneSubtree(
        objects.filter((o) => ids.has(o.id)),
        id
      );
      setObjects((prev) => [...prev, ...clones]);
      setSelectedId(rootId);
      return rootId;
    },
    [objects, rigs]
  );

  /* ---------------------------------------------------------------- groups */

  /**
   * COLLAPSE A SELECTION INTO A CONTAINER.
   *
   * The group is a new object standing at the centre of the box the selection
   * occupies, and each member gets its `parentId` pointed at it. Nothing moves:
   * grouping is a statement about what belongs together, and a gesture that
   * rearranged the scene as a side effect of naming part of it would be the
   * worst possible way to find out what grouping does.
   *
   * ONLY THE TOP OF EACH SUBTREE JOINS. Passing a chair and the group it is
   * already inside would otherwise reparent the chair out of that group and into
   * the new one — the selection would lose a level of the very structure the
   * user is building. So a member whose ancestor is also in the set is dropped
   * here, and its existing parent carries it along.
   *
   * A rig is skipped for the same reason it is skipped everywhere else: both its
   * cameras are one instrument, and a group is not where a capture plan lives.
   */
  const group = useCallback(
    (ids: string[], name: string): string | null => {
      const chosen = new Set(ids);
      const members = objects.filter((o) => chosen.has(o.id) && !o.rigId);
      const tops = members.filter((o) => {
        let cur = o.parentId;
        const seen = new Set<string>([o.id]);
        while (cur && !seen.has(cur)) {
          if (chosen.has(cur)) return false;
          seen.add(cur);
          cur = objects.find((x) => x.id === cur)?.parentId;
        }
        return true;
      });
      if (tops.length < 2) return null;

      const g = makeGroup(name, centreOf(tops));
      // The group inherits the parent the selection shared, if they shared one:
      // grouping two chairs that both sat in "Dining set" should nest inside it
      // rather than pulling them out to the root.
      const parents = new Set(tops.map((o) => o.parentId ?? null));
      if (parents.size === 1) {
        const only = [...parents][0];
        if (only) g.parentId = only;
      }

      const joining = new Set(tops.map((o) => o.id));
      setObjects((prev) => [
        ...prev.map((o) => (joining.has(o.id) ? { ...o, parentId: g.id } : o)),
        g,
      ]);
      setSelectedIds([]);
      setSelectedId(g.id);
      setSelectedVolumeId(null);
      return g.id;
    },
    [objects]
  );

  /**
   * Dissolve a group, keeping what was in it.
   *
   * The children are handed to the group's own parent rather than to the root,
   * so ungrouping one level of a nest does not empty the whole thing onto the
   * floor. Contents keep their world positions — the group's transform was
   * already resolved onto them by every edit that touched it, so there is
   * nothing left to bake.
   */
  const ungroup = useCallback((id: string) => {
    setObjects((prev) => {
      const g = prev.find((o) => o.id === id);
      if (!g?.group) return prev;
      return prev
        .map((o) => (o.parentId === id ? { ...o, parentId: g.parentId } : o))
        .filter((o) => o.id !== id);
    });
    setSelectedId((cur) => (cur === id ? null : cur));
  }, []);

  /**
   * Delete everything in a marquee selection, as ONE step.
   *
   * Not a loop over `remove`: eleven objects deleted with one keystroke must come
   * back with one undo, and each intermediate state would be a scene that never
   * existed as far as the user is concerned.
   */
  const removeMany = useCallback((ids: string[]) => {
    setObjects((prev) => {
      const doomed = new Set(ids.flatMap((id) => subtreeIds(prev, id)));
      // Deleting one camera of a rig takes its partner, as it does singly.
      for (const o of prev) if (o.rigId && doomed.has(o.id)) {
        for (const p of prev) if (p.rigId === o.rigId) doomed.add(p.id);
      }
      const rigsGone = new Set(prev.filter((o) => doomed.has(o.id) && o.rigId).map((o) => o.rigId!));
      if (rigsGone.size > 0) setRigs((rs) => rs.filter((r) => !rigsGone.has(r.id)));
      return prev.filter((o) => !doomed.has(o.id));
    });
    setSelectedIds([]);
    setSelectedId(null);
  }, []);

  /** Duplicate a whole selection in one step, and hold the copies. */
  const duplicateMany = useCallback(
    (ids: string[]): string[] => {
      const all = new Set(ids.flatMap((id) => subtreeIds(objects, id)));
      const source = objects.filter((o) => all.has(o.id));
      if (source.length === 0) return [];
      const { clones, ids: map } = cloneSubtree(source, ids[0]);
      setObjects((prev) => [...prev, ...clones]);
      // The copies are what you are now holding — the same courtesy the single
      // duplicate does by selecting what it made. Tops are read off the SOURCE
      // (a clone's `parentId` has already been re-pointed to a new id, so asking
      // whether it is in the old set would always say no).
      const fresh = source
        .filter((o) => !o.parentId || !all.has(o.parentId))
        .map((o) => map.get(o.id)!);
      setSelectedIds(fresh.length > 1 ? fresh : []);
      setSelectedId(fresh.length === 1 ? fresh[0] : null);
      return fresh;
    },
    [objects]
  );

  /**
   * Set an object's dataset role.
   *
   * MASTER IS EXCLUSIVE, THE OTHERS ARE NOT. Promoting to master demotes
   * whoever held it — two masters means every camera aims at whichever one
   * happens to sort first. Distractor and background are many-per-scene by
   * definition (a scene with one distractor is barely a scene), so those are a
   * plain per-object write with no exclusivity and no rig follow.
   *
   * Every camera rig travels with a MASTER promotion. A rig is aimed at the
   * master by construction, so leaving it behind when the hero changes points
   * the whole capture at empty ground — the frames still render, and every one
   * of them is useless. Translating by the delta between the old master and the
   * new one carries the framing the user built (azimuth, elevation, distance)
   * intact rather than recomputing it from a default. Demotions and the two
   * non-hero roles don't move anything: the rig still frames whatever the master
   * is, and that hasn't changed.
   */
  const setRole = useCallback((id: string, role: ObjectRole) => {
    setObjects((prev) => {
      // Only a promotion to master touches other objects.
      const next =
        role === "master"
          ? prev.map((o) =>
              o.id === id ? { ...o, role } : isMaster(o) ? { ...o, role: "none" as const } : o
            )
          : prev.map((o) => (o.id === id ? { ...o, role } : o));
      if (role !== "master") return next;

      const from = prev.find(isMaster) ?? null;
      const to = prev.find((o) => o.id === id) ?? null;
      if (!from || !to || from.id === to.id) return next;

      const d: Vec3 = [
        to.position[0] - from.position[0],
        to.position[1] - from.position[1],
        to.position[2] - from.position[2],
      ];
      if (d[0] === 0 && d[1] === 0 && d[2] === 0) return next;

      return next.map((o) =>
        o.rigId
          ? {
              ...o,
              position: [
                o.position[0] + d[0],
                o.position[1] + d[1],
                o.position[2] + d[2],
              ] as Vec3,
            }
          : o
      );
    });
  }, []);

  /**
   * Re-frame a rig around a target from scratch — the explicit "point this at
   * the master" action, as opposed to the silent delta-follow above.
   *
   * This one deliberately discards the current camera placement and rebuilds it
   * from `framingPosition`, the same rule used when a rig is dropped with focus
   * on the master. That is the whole point: it's the way back to a known-good
   * framing after the master has been moved, scaled or swapped enough times that
   * the rig no longer frames anything.
   */
  const reframeRig = useCallback(
    (rigId: string, target: Vec3, radius: number) => {
      const rig = rigs.find((r) => r.id === rigId);
      if (!rig) return;
      setObjects((prev) =>
        prev.map((o) => {
          if (o.rigId !== rigId || !o.cameraRole) return o;
          return { ...o, position: framingPosition(target, radius, o.cameraRole) };
        })
      );
    },
    [rigs]
  );

  /**
   * Hide / lock, cascaded over the subtree.
   *
   * Both flags are a statement about a branch, not a row: a visible child
   * inside a hidden group would still render in the viewport, which makes the
   * group's closed eye a lie. Children carry their own copy of the flag so the
   * viewport stays a flat read of `hidden` with no ancestor walk per frame.
   */
  const setBranchFlag = useCallback((id: string, key: "hidden" | "locked", value: boolean) => {
    setObjects((prev) => {
      const target = prev.find((o) => o.id === id);
      // A rig is one row in the layers panel, so its eye and its lock speak for
      // both cameras. Flagging only the one that happens to stand for the rig
      // would leave its partner visible under a closed eye.
      const ids = target?.rigId
        ? new Set(prev.filter((o) => o.rigId === target.rigId).map((o) => o.id))
        : new Set(subtreeIds(prev, id));
      return prev.map((o) => (ids.has(o.id) ? { ...o, [key]: value } : o));
    });
  }, []);

  const selected = useMemo(
    () => objects.find((o) => o.id === selectedId) ?? null,
    [objects, selectedId]
  );

  /** The scene's hero object — what every camera aims at. */
  const master = useMemo(() => objects.find(isMaster) ?? null, [objects]);

  /**
   * The other two role groups, read straight off the objects.
   *
   * TerraGen's Distractor and Background Object axes vary these the way the
   * Master axis varies `master`. Derived here rather than in the panel so
   * "which objects are distractors" has exactly one answer, whoever is asking —
   * the layers badge, the viewport tint and the Work Order all read this.
   */
  const distractors = useMemo(() => objects.filter((o) => o.role === "distractor"), [objects]);
  const backgroundObjects = useMemo(
    () => objects.filter((o) => o.role === "background"),
    [objects]
  );

  /**
   * The objects a marquee is holding.
   *
   * Filtered against the live scene rather than trusted: a delete, an undo or a
   * group can remove something the marquee caught, and a menu that then offered
   * to duplicate eleven objects when nine were left would be counting ghosts.
   */
  const selectedObjects = useMemo(
    () => (selectedIds.length === 0 ? [] : objects.filter((o) => selectedIds.includes(o.id))),
    [objects, selectedIds]
  );

  /** The volume wearing the editor's focus chrome, or null. */
  const selectedVolume = useMemo(
    () => volumes.find((v) => v.id === selectedVolumeId) ?? null,
    [volumes, selectedVolumeId]
  );

  /** The volume the Arrangement axis and the Space panel work on, or null. */
  const activeVolume = useMemo(
    () => volumes.find((v) => v.id === activeVolumeId) ?? null,
    [volumes, activeVolumeId]
  );

  /**
   * Objects that fall outside the armed volume.
   *
   * The only way this list is ever non-empty is a face dragged inward over
   * something, or containment switched on over a scene built without it — both
   * cases where moving things on the user's behalf would be wrong. So it is
   * reported, and the panel offers a button.
   */
  const outsideVolume = useMemo(() => {
    if (!activeVolume) return [];
    return objects.filter(
      (o) =>
        isContainable(o) &&
        !o.hidden &&
        // A LOCKED object is where somebody put it, deliberately. Counting it
        // as stray would have "Bring them inside" promise to move something the
        // lock exists to stop moving — and the button, which goes through
        // `applyPlacements`, would have kept that promise.
        !o.locked &&
        !isInside(activeVolume, o)
    );
  }, [objects, activeVolume]);


  /** The rig the current selection belongs to, if it's a camera. */
  const selectedRig = useMemo(
    () => (selected?.rigId ? rigs.find((r) => r.id === selected.rigId) ?? null : null),
    [selected, rigs]
  );

  const rigCameras = useCallback(
    (rig: CameraRig) => ({
      start: objects.find((o) => o.id === rig.startId) ?? null,
      end: objects.find((o) => o.id === rig.endId) ?? null,
    }),
    [objects]
  );

  /* --------------------------------------------------- history-wrapped API */

  /**
   * The mutators, each recording a step before it runs.
   *
   * Wrapped here rather than inside each `useCallback` above so the commands
   * stay readable as commands — the history is one concern in one place, and a
   * new mutator is one line here away from being undoable.
   *
   * `update` and friends tag by target id so a drag on ONE object coalesces
   * while alternating edits to two objects stay separate steps.
   */
  const tracked = useMemo(
    () => ({
      add: (...a: Parameters<typeof add>) => (commit(), add(...a)),
      addCameraRig: (...a: Parameters<typeof addCameraRig>) => (commit(), addCameraRig(...a)),
      update: (id: string, patch: Partial<SceneObject>) => (
        commit(`update:${id}:${Object.keys(patch).join(",")}`), update(id, patch)
      ),
      updateOne: (id: string, patch: Partial<SceneObject>) => (
        commit(`updateOne:${id}:${Object.keys(patch).join(",")}`), updateOne(id, patch)
      ),
      // The slot rides in the coalesce tag, so dragging Roughness on Element 0
      // and then on Element 1 leaves two undo steps rather than folding into
      // one — they are edits to two different surfaces.
      updateMaterial: (id: string, slot: number, patch: Partial<MaterialSlot>) => (
        commit(`material:${id}:${slot}:${Object.keys(patch).join(",")}`),
        updateMaterial(id, slot, patch)
      ),
      paintMaterial: (id: string, patch: Partial<MaterialSlot>) => (
        commit(`paint:${id}:${Object.keys(patch).join(",")}`), paintMaterial(id, patch)
      ),
      updateRig: (rigId: string, patch: Partial<CameraRig>) => (
        commit(`rig:${rigId}:${Object.keys(patch).join(",")}`), updateRig(rigId, patch)
      ),
      remove: (...a: Parameters<typeof remove>) => (commit(), remove(...a)),
      replaceWith: (...a: Parameters<typeof replaceWith>) => (commit(), replaceWith(...a)),
      removeMany: (...a: Parameters<typeof removeMany>) => (commit(), removeMany(...a)),
      duplicate: (...a: Parameters<typeof duplicate>) => (commit(), duplicate(...a)),
      duplicateMany: (...a: Parameters<typeof duplicateMany>) => (
        commit(), duplicateMany(...a)
      ),
      // Grouping and ungrouping are edits to the scene graph, so they are
      // undoable like any other. Nothing about them is cosmetic: `parentId`
      // decides what delete takes, what a transform carries and what the tree
      // shows.
      group: (...a: Parameters<typeof group>) => (commit(), group(...a)),
      ungroup: (...a: Parameters<typeof ungroup>) => (commit(), ungroup(...a)),
      paste: (...a: Parameters<typeof paste>) => (commit(), paste(...a)),
      setBranchFlag: (...a: Parameters<typeof setBranchFlag>) => (commit(), setBranchFlag(...a)),
      setRole: (...a: Parameters<typeof setRole>) => (commit(), setRole(...a)),
      reframeRig: (...a: Parameters<typeof reframeRig>) => (commit(), reframeRig(...a)),
      // Volumes join the same history as the objects they hold. Drawing a room,
      // dragging a face and scattering its contents are all edits, and an undo
      // that could take back the scatter but not the face that caused it would
      // be undoing half a gesture.
      addVolume: (...a: Parameters<typeof addVolume>) => (commit(), addVolume(...a)),
      updateVolume: (id: string, patch: Partial<SceneVolume>) => (
        commit(`volume:${id}:${Object.keys(patch).join(",")}`), updateVolume(id, patch)
      ),
      removeVolume: (...a: Parameters<typeof removeVolume>) => (commit(), removeVolume(...a)),
      applyPlacements: (...a: Parameters<typeof applyPlacements>) => (
        commit(), applyPlacements(...a)
      ),
    }),
    [
      commit, add, addCameraRig, update, updateOne, updateRig, remove, removeMany,
      duplicate, duplicateMany, group, ungroup, paste, setBranchFlag, setRole,
      reframeRig, addVolume, updateVolume, removeVolume, applyPlacements,
    ]
  );

  return {
    objects,
    rigs,
    selectedId,
    selectedIds,
    selectedObjects,
    selected,
    master,
    distractors,
    backgroundObjects,
    selectedRig,
    rigCameras,
    volumes,
    activeVolume,
    activeVolumeId,
    selectedVolume,
    selectedVolumeId,
    outsideVolume,
    // Arming a volume is not an edit for the same reason selecting an object
    // isn't — it changes what the next edit will do, not what the scene is.
    armVolume: setActiveVolumeId,
    selectVolume,
    // Selection is NOT tracked. Clicking around the scene isn't an edit, and a
    // history full of look-at-this steps buries the edits you actually want back.
    select: selectObject,
    selectMany,
    ...tracked,
    copy,
    copyMany,
    canPaste: clipboard !== null,
    undo,
    redo,
    canUndo: past.current.length > 0,
    canRedo: future.current.length > 0,
    // Reading a model's slot list off the file it was placed from is not an
    // edit — it is the placement finishing — so it is untracked. Putting it in
    // the history would give every placed GLB a phantom undo step that lands
    // between the object arriving and its own materials being known.
    discoverMaterials,
    env,
    setEnv,
    // Weather is deliberately NOT in `tracked`: undo covers the scene graph, and
    // a history full of slider drags would bury the object edits you actually
    // want back. Same call the selection makes, for the same reason.
    weather,
    setWeather,
    toggleWeatherLayer,
    resetWeather,
    savedWeather,
    saveWeather,
    loadWeather,
    deleteWeather,
    updateWeatherSet,
    renameWeatherSet,
    toggleWeatherInRun,
  };
}

export type SceneApi = ReturnType<typeof useScene>;
