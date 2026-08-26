import { useCallback, useRef, useState } from "react";
import type { Asset } from "./assets-data";
import type { SceneApi } from "./useScene";
import {
  deriveWorkOrder,
  type AnnotationId,
  type AxisId,
  type OutputSpec,
  type WorkOrder,
} from "./work-order";

/**
 * The Work Order draft, owned by the editor rather than by the panel.
 *
 * WHY IT LIVES OUTSIDE THE SHEET. The panel unmounts every time it's closed. A
 * Work Order takes real work to assemble — nine axes, an output spec, a budget
 * the user has reasoned about — and losing it because they went back to nudge
 * the master object would be indefensible. So the draft outlives the sheet.
 *
 * WHY IT SEEDS ONCE. Seeding reads the scene (rig geometry, master, placed
 * HDRI) into the axes. Re-reading on every open would quietly discard those
 * edits, so `seedIfEmpty` only fires the first time Generate is pressed;
 * `reseed` is the explicit "pull the scene in again" the panel offers.
 */
export interface WorkOrderStore {
  order: WorkOrder | null;
  /** Read the scene in, but only if nothing has been authored yet. */
  seedIfEmpty: (scene: SceneApi, assets: Asset[]) => void;
  /** Throw the draft away and re-read the scene. */
  reseed: (scene: SceneApi, assets: Asset[]) => void;
  toggle: (id: AxisId) => void;
  patch: <K extends AxisId>(id: K, patch: Partial<WorkOrder[K]>) => void;
  setOutput: (patch: Partial<OutputSpec>) => void;
  toggleAnnotation: (id: AnnotationId) => void;
  setPrompt: (prompt: string) => void;

  /* --- the two shortlists -------------------------------------------------
   * Stand-ins and environments are both "picked from the library, then tuned
   * as a list", so they get the same three verbs rather than each growing its
   * own vocabulary. Adding is idempotent on the asset id: picking the same
   * mesh twice is a mis-click, not a request for two identical subsets.
   */
  addSwap: (target: { id: string; name: string }, asset: { id: string; name: string }) => void;
  toggleSwap: (targetId: string, assetId: string) => void;
  removeSwap: (targetId: string, assetId: string) => void;
  addEnv: (assetId: string) => void;
  toggleEnv: (assetId: string) => void;
  removeEnv: (assetId: string) => void;
}

export function useWorkOrder(): WorkOrderStore {
  const [order, setOrder] = useState<WorkOrder | null>(null);
  // Guards the seed against React 18's double-invoked effects in StrictMode,
  // which would otherwise re-derive over a draft mid-edit.
  const seeded = useRef(false);

  const reseed = useCallback((scene: SceneApi, assets: Asset[]) => {
    seeded.current = true;
    setOrder(deriveWorkOrder(scene, assets));
  }, []);

  const seedIfEmpty = useCallback(
    (scene: SceneApi, assets: Asset[]) => {
      if (seeded.current) return;
      reseed(scene, assets);
    },
    [reseed]
  );

  const toggle = useCallback((id: AxisId) => {
    setOrder((prev) => (prev ? { ...prev, [id]: { ...prev[id], on: !prev[id].on } } : prev));
  }, []);

  const patch = useCallback<WorkOrderStore["patch"]>((id, next) => {
    setOrder((prev) => {
      if (!prev) return prev;
      const merged = { ...prev[id], ...next };
      /**
       * The Arrangement axis arms itself from its COUNT.
       *
       * Same bargain the environment axis makes with its picks, and the same
       * one `computeTotals` already makes with weather sets: one arrangement is
       * the scene exactly as it is posed, so it multiplies nothing and there is
       * nothing to switch on; two or more is a sweep, and then it earns its row
       * beside the axes that also multiply. A separate on/off switch would only
       * have added a second way to say the same thing — and a third state to get
       * stuck in, where four arrangements are configured and the axis is
       * silently off.
       */
      if (id === "layouts") {
        const l = merged as WorkOrder["layouts"];
        return { ...prev, layouts: { ...l, on: l.count > 1 } };
      }
      return { ...prev, [id]: merged };
    });
  }, []);

  const setOutput = useCallback((next: Partial<OutputSpec>) => {
    setOrder((prev) => (prev ? { ...prev, output: { ...prev.output, ...next } } : prev));
  }, []);

  const toggleAnnotation = useCallback((id: AnnotationId) => {
    setOrder((prev) =>
      prev
        ? {
            ...prev,
            output: {
              ...prev.output,
              annotations: { ...prev.output.annotations, [id]: !prev.output.annotations[id] },
            },
          }
        : prev
    );
  }, []);

  const setPrompt = useCallback((prompt: string) => {
    setOrder((prev) => (prev ? { ...prev, prompt } : prev));
  }, []);

  /**
   * Idempotent PER TARGET, not per asset: the same chair can stand in for two
   * different objects — that is a legitimate thing to ask for — but adding it
   * twice to one object is a mis-click, not a request for two identical
   * subsets.
   */
  const addSwap = useCallback<WorkOrderStore["addSwap"]>((target, asset) => {
    setOrder((prev) =>
      prev && !prev.swaps.some((s) => s.targetId === target.id && s.assetId === asset.id)
        ? {
            ...prev,
            swaps: [
              ...prev.swaps,
              {
                targetId: target.id,
                targetName: target.name,
                assetId: asset.id,
                name: asset.name,
                inRun: true,
              },
            ],
          }
        : prev
    );
  }, []);

  const isSwap = (s: { targetId: string; assetId: string }, targetId: string, assetId: string) =>
    s.targetId === targetId && s.assetId === assetId;

  const toggleSwap = useCallback((targetId: string, assetId: string) => {
    setOrder((prev) =>
      prev
        ? {
            ...prev,
            swaps: prev.swaps.map((s) =>
              isSwap(s, targetId, assetId) ? { ...s, inRun: !s.inRun } : s
            ),
          }
        : prev
    );
  }, []);

  const removeSwap = useCallback((targetId: string, assetId: string) => {
    setOrder((prev) =>
      prev
        ? { ...prev, swaps: prev.swaps.filter((s) => !isSwap(s, targetId, assetId)) }
        : prev
    );
  }, []);

  /**
   * The environment axis arms itself.
   *
   * Its switch is gone from the row — an axis with one control and one list has
   * nothing a switch adds that emptying the list doesn't say better — so `on`
   * is derived from the picks here, in the one place they change.
   */
  const withEnv = (prev: WorkOrder, picks: WorkOrder["background"]["picks"]): WorkOrder => ({
    ...prev,
    background: { ...prev.background, picks, on: picks.some((p) => p.inRun) },
  });

  const addEnv = useCallback((assetId: string) => {
    setOrder((prev) =>
      prev && !prev.background.picks.some((p) => p.assetId === assetId)
        ? withEnv(prev, [...prev.background.picks, { assetId, inRun: true }])
        : prev
    );
  }, []);

  const toggleEnv = useCallback((assetId: string) => {
    setOrder((prev) =>
      prev
        ? withEnv(
            prev,
            prev.background.picks.map((p) =>
              p.assetId === assetId ? { ...p, inRun: !p.inRun } : p
            )
          )
        : prev
    );
  }, []);

  const removeEnv = useCallback((assetId: string) => {
    setOrder((prev) =>
      prev ? withEnv(prev, prev.background.picks.filter((p) => p.assetId !== assetId)) : prev
    );
  }, []);

  return {
    order,
    seedIfEmpty,
    reseed,
    toggle,
    patch,
    setOutput,
    toggleAnnotation,
    setPrompt,
    addSwap,
    toggleSwap,
    removeSwap,
    addEnv,
    toggleEnv,
    removeEnv,
  };
}
