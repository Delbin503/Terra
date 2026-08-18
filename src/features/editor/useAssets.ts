import { useCallback, useMemo, useRef, useState } from "react";
import {
  initialAssets,
  initialFolders,
  type Asset,
  type AssetFolder,
  type AssetType,
} from "./assets-data";

/**
 * The library's data, owned by the editor rather than by the panel.
 *
 * AssetLibrary unmounts every time it's closed, so anything it held locally —
 * an upload, a generated mesh — vanished with it. Generation in particular has
 * to outlive the panel: the 3D Generate flow can finish while the library is
 * shut, and its "Click to view" is only meaningful if the result is actually
 * there when the library reopens.
 */
export interface AssetInit {
  name: string;
  type: AssetType;
  uploaded?: boolean;
  /** came out of a Generate 3D run — drives the Gen3D badge */
  generated?: boolean;
  modelUrl?: string;
}

export interface AssetStore {
  assets: Asset[];
  folders: AssetFolder[];
  /** Insert at the head of the list, minting an id and a thumbnail seed. */
  add: (init: AssetInit) => Asset;
  /**
   * Insert many in ONE state commit. A turntable capture produces hundreds of
   * frames; calling `add` per frame re-renders the whole editor — 3D canvas
   * included — once per frame, and the capture crawls.
   */
  addMany: (inits: AssetInit[]) => Asset[];
  update: (id: string, patch: Partial<Asset>) => void;
  remove: (id: string) => void;
  createFolder: (name: string, assetIds?: string[]) => AssetFolder;
  fileInto: (folderId: string, assetIds: string[]) => void;
}

export function useAssets(): AssetStore {
  const [assets, setAssets] = useState<Asset[]>(initialAssets);
  const [folders, setFolders] = useState<AssetFolder[]>(initialFolders);
  // Monotonic counter — ids and seeds stay deterministic across renders.
  const counter = useRef(0);

  const add = useCallback<AssetStore["add"]>((init) => {
    const n = (counter.current += 1);
    const asset: Asset = { id: `new-${n}`, seed: 400 + n * 17, ...init };
    setAssets((prev) => [asset, ...prev]);
    return asset;
  }, []);

  const addMany = useCallback<AssetStore["addMany"]>((inits) => {
    if (inits.length === 0) return [];
    const made = inits.map((init) => {
      const n = (counter.current += 1);
      return { id: `new-${n}`, seed: 400 + n * 17, ...init } as Asset;
    });
    setAssets((prev) => [...made, ...prev]);
    return made;
  }, []);

  const update = useCallback<AssetStore["update"]>((id, patch) => {
    setAssets((prev) => prev.map((a) => (a.id === id ? { ...a, ...patch } : a)));
  }, []);

  const remove = useCallback<AssetStore["remove"]>((id) => {
    setAssets((prev) => prev.filter((a) => a.id !== id));
    setFolders((prev) => prev.map((f) => ({ ...f, assetIds: f.assetIds.filter((x) => x !== id) })));
  }, []);

  const createFolder = useCallback<AssetStore["createFolder"]>((name, assetIds = []) => {
    const folder: AssetFolder = { id: `folder-${(counter.current += 1)}`, name, assetIds };
    setFolders((prev) => [...prev, folder]);
    return folder;
  }, []);

  const fileInto = useCallback<AssetStore["fileInto"]>((folderId, assetIds) => {
    setFolders((prev) =>
      prev.map((f) =>
        f.id === folderId ? { ...f, assetIds: [...new Set([...f.assetIds, ...assetIds])] } : f
      )
    );
  }, []);

  return useMemo(
    () => ({ assets, folders, add, addMany, update, remove, createFolder, fileInto }),
    [assets, folders, add, addMany, update, remove, createFolder, fileInto]
  );
}
