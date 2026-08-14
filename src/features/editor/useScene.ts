import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AssetType } from "./assets-data";
import {
  isMaster,
  makeCameraRig,
  makeSceneObject,
  nextObjectId,
  type ObjectRole,
  type SceneObject,
} from "./scene-types";
import { subtreeIds } from "./scene-tree";
import {
  CAMERA_DEFAULTS,
  distance,
  framingPosition,
  nearLimit,
  type CameraRig,
} from "./camera-rig";

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
    position:
      o.id === rootId
        ? ([
            o.position[0] + COPY_OFFSET[0],
            o.position[1] + COPY_OFFSET[1],
            o.position[2] + COPY_OFFSET[2],
          ] as Vec3)
        : o.position,
  }));
  return { clones, rootId: idMap.get(rootId)! };
}

/** Everything undo has to put back. */
interface Snapshot {
  objects: SceneObject[];
  rigs: CameraRig[];
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
  const [env, setEnvState] = useState<SceneEnv>({ brightness: 1, warmth: 0 });
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
  const live = useRef<Snapshot>({ objects, rigs, selectedId });
  useEffect(() => {
    live.current = { objects, rigs, selectedId };
  }, [objects, rigs, selectedId]);

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

  const add = useCallback(
    (name: string, source: AssetType, position?: Vec3, modelUrl?: string) => {
      const obj = makeSceneObject(name, source, position, modelUrl);
      setObjects((prev) => [...prev, obj]);
      setSelectedId(obj.id);
      return obj.id;
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

      const partnerId =
        target.rigId && patch.position
          ? prev.find((o) => o.rigId === target.rigId && o.id !== id)?.id
          : undefined;

      if (!partnerId || !patch.position) {
        return prev.map((o) => (o.id === id ? { ...o, ...patch } : o));
      }

      const d: Vec3 = [
        patch.position[0] - target.position[0],
        patch.position[1] - target.position[1],
        patch.position[2] - target.position[2],
      ];
      return prev.map((o) => {
        if (o.id === id) return { ...o, ...patch };
        if (o.id !== partnerId) return o;
        return {
          ...o,
          position: [o.position[0] + d[0], o.position[1] + d[1], o.position[2] + d[2]] as Vec3,
        };
      });
    });
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
  }, []);

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

  const paste = useCallback((): string | null => {
    if (!clipboard) return null;
    const { clones, rootId } = cloneSubtree(clipboard.objects, clipboard.rootId);
    setObjects((prev) => [...prev, ...clones]);
    setSelectedId(rootId);
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
      updateRig: (rigId: string, patch: Partial<CameraRig>) => (
        commit(`rig:${rigId}:${Object.keys(patch).join(",")}`), updateRig(rigId, patch)
      ),
      remove: (...a: Parameters<typeof remove>) => (commit(), remove(...a)),
      duplicate: (...a: Parameters<typeof duplicate>) => (commit(), duplicate(...a)),
      paste: (...a: Parameters<typeof paste>) => (commit(), paste(...a)),
      setBranchFlag: (...a: Parameters<typeof setBranchFlag>) => (commit(), setBranchFlag(...a)),
      setRole: (...a: Parameters<typeof setRole>) => (commit(), setRole(...a)),
      reframeRig: (...a: Parameters<typeof reframeRig>) => (commit(), reframeRig(...a)),
    }),
    [
      commit, add, addCameraRig, update, updateOne, updateRig, remove, duplicate, paste,
      setBranchFlag, setRole, reframeRig,
    ]
  );

  return {
    objects,
    rigs,
    selectedId,
    selected,
    master,
    distractors,
    backgroundObjects,
    selectedRig,
    rigCameras,
    // Selection is NOT tracked. Clicking around the scene isn't an edit, and a
    // history full of look-at-this steps buries the edits you actually want back.
    select: setSelectedId,
    ...tracked,
    copy,
    canPaste: clipboard !== null,
    undo,
    redo,
    canUndo: past.current.length > 0,
    canRedo: future.current.length > 0,
    env,
    setEnv,
  };
}

export type SceneApi = ReturnType<typeof useScene>;
