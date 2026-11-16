import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { loadCatalogue } from "./assets-api";
import { preloadThumbs, prioritizeThumbs } from "./thumb-cache";
import {
  filterByCategory,
  sortAssets,
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
  /** an uploaded sky's own file — see `handleFiles` in AssetLibrary */
  skyUrl?: string;
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
  /** the Assets API catalogue: still arriving, all in, or unreachable */
  catalogue: { status: "loading" | "ready" | "error"; loaded: number; total: number };
}

/**
 * The seeded stand-ins the real catalogue replaces. Meshes and HDRIs come from
 * the Assets API once it answers; the two meshes with a real local GLB stay,
 * and so do skyboxes and the camera, which the API doesn't carry.
 */
const isStandIn = (a: Asset) =>
  !a.remote && !a.uploaded && !a.generated &&
  ((a.type === "mesh" && !a.modelUrl) || a.type === "environment");

export function useAssets(): AssetStore {
  const [assets, setAssets] = useState<Asset[]>(initialAssets);
  const [folders, setFolders] = useState<AssetFolder[]>(initialFolders);
  // Monotonic counter — ids and seeds stay deterministic across renders.
  const counter = useRef(0);
  const [catalogue, setCatalogue] = useState<AssetStore["catalogue"]>({
    status: "loading",
    loaded: 0,
    total: 0,
  });

  /* THE REAL CATALOGUE, page by page. The first page swaps the stand-ins out
     (if the API is unreachable they stay, so the library is never empty);
     later pages append. Local uploads and generations keep their place. */
  useEffect(() => {
    const ctrl = new AbortController();
    let first = true;
    /* …and its thumbnails, in the background (see thumb-cache.ts), so the
       library opens onto pictures rather than onto empty tiles filling in.
       The first screen of each kind goes ahead of the rest. */
    const perType = new Map<string, number>();
    const FIRST_SCREEN = 60;
    loadCatalogue((page, meta) => {
      if (ctrl.signal.aborted) return;
      const lead: string[] = [];
      const later: string[] = [];
      for (const a of page) {
        if (!a.thumbUrl) continue;
        const n = perType.get(a.type) ?? 0;
        perType.set(a.type, n + 1);
        (n < FIRST_SCREEN ? lead : later).push(a.thumbUrl);
      }
      preloadThumbs(lead, true);
      preloadThumbs(later);
      const swap = first;
      first = false;
      setAssets((prev) => {
        const kept = swap ? prev.filter((a) => !isStandIn(a)) : prev;
        const have = new Set(kept.map((a) => a.id));
        return [...kept, ...page.filter((a) => !have.has(a.id))];
      });
      setCatalogue((c) => ({
        status: meta.page >= meta.totalPages ? "ready" : "loading",
        loaded: c.loaded + page.length,
        total: meta.total,
      }));
    }, ctrl.signal).catch((err: unknown) => {
      if (ctrl.signal.aborted) return;
      console.warn("[Assets API]", err);
      setCatalogue((c) => ({ ...c, status: c.loaded > 0 ? "ready" : "error" }));
    });
    return () => ctrl.abort();
  }, []);

  /* Once the whole catalogue is in, the order is final: the cards the library
     shows first — All Assets and Environments, sorted the way the grid sorts —
     go to the front of the thumbnail queue. Arrival order only approximates
     it, since the grid sorts by its own key rather than the API's. */
  const settled = catalogue.status === "ready";
  useEffect(() => {
    if (!settled) return;
    const screen = (cat: "all" | "environments") =>
      sortAssets(filterByCategory(assets, cat), "descending")
        .slice(0, 60)
        .map((a) => a.thumbUrl)
        .filter((u): u is string => Boolean(u));
    prioritizeThumbs([...screen("all"), ...screen("environments")]);
    // Only when the catalogue settles — not on every later edit to the list.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settled]);

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
    setAssets((prev) => {
      /* AN UPLOADED SKY OWNS A BLOB. `URL.createObjectURL` pins the file in
         memory until it is revoked, so deleting the asset has to hand it back —
         otherwise a session spent trying HDRIs holds every one of them, and
         they are the largest files this app touches. Only `blob:` URLs: the
         catalogue's paths are static files and revoking one is meaningless. */
      const gone = prev.find((a) => a.id === id);
      // The `#.hdr` tag that rides on an uploaded sky's URL (see
      // `taggedBlobUrl`) is not part of the blob's identity, so it comes off
      // before revoking — otherwise the revoke silently matches nothing.
      if (gone?.skyUrl?.startsWith("blob:")) URL.revokeObjectURL(gone.skyUrl.split("#")[0]);
      return prev.filter((a) => a.id !== id);
    });
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
    () => ({ assets, folders, add, addMany, update, remove, createFolder, fileInto, catalogue }),
    [assets, folders, add, addMany, update, remove, createFolder, fileInto, catalogue]
  );
}
