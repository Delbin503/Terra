import { useCallback, useMemo, useState } from "react";
import type { AssetType } from "./assets-data";
import { makeSceneObject, type SceneObject } from "./scene-types";

/** Scene lighting (chatbot-controllable). brightness 0.3–2, warmth -1..1. */
export interface SceneEnv {
  brightness: number;
  warmth: number;
}

/** Central store for objects placed in the 3D scene + the current selection. */
export function useScene() {
  const [objects, setObjects] = useState<SceneObject[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [env, setEnvState] = useState<SceneEnv>({ brightness: 1, warmth: 0 });

  const setEnv = useCallback(
    (patch: Partial<SceneEnv>) =>
      setEnvState((prev) => ({
        brightness: Math.max(0.3, Math.min(2, patch.brightness ?? prev.brightness)),
        warmth: Math.max(-1, Math.min(1, patch.warmth ?? prev.warmth)),
      })),
    []
  );

  const add = useCallback(
    (name: string, source: AssetType, position?: [number, number, number], modelUrl?: string) => {
      const obj = makeSceneObject(name, source, position, modelUrl);
      setObjects((prev) => [...prev, obj]);
      setSelectedId(obj.id);
      return obj.id;
    },
    []
  );

  const update = useCallback(
    (id: string, patch: Partial<SceneObject>) =>
      setObjects((prev) => prev.map((o) => (o.id === id ? { ...o, ...patch } : o))),
    []
  );

  const remove = useCallback((id: string) => {
    setObjects((prev) => prev.filter((o) => o.id !== id));
    setSelectedId((cur) => (cur === id ? null : cur));
  }, []);

  const selected = useMemo(
    () => objects.find((o) => o.id === selectedId) ?? null,
    [objects, selectedId]
  );

  return { objects, selectedId, selected, select: setSelectedId, add, update, remove, env, setEnv };
}

export type SceneApi = ReturnType<typeof useScene>;
