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
    setOrder((prev) => (prev ? { ...prev, [id]: { ...prev[id], ...next } } : prev));
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

  return { order, seedIfEmpty, reseed, toggle, patch, setOutput, toggleAnnotation, setPrompt };
}
