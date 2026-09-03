import { useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { GlassPanel, GlassGhostButton } from "@/components/glass";
import { Button } from "@/components/ui";
import { Icon, type IconName } from "@/components/icons";
import { AssetCard } from "./AssetCard";
import { SpaceThumb } from "./AssetThumb";
import { AssetActionMenu, type MenuAnchor } from "./AssetActionMenu";
import { AssetDetailsPanel } from "./AssetDetailsPanel";
import { FolderPicker } from "./FolderPicker";
import { TextInput } from "./ui";
import type { AssetStore } from "./useAssets";
import {
  applyFilters,
  categories,
  collectTags,
  filterByCategory,
  sortAssets,
  sortOptions,
  typeIcon,
  uploadViews,
  CONTENT_TYPES,
  type Asset,
  type AssetFolder,
  type AssetType,
  type CategoryId,
  type SortOrder,
  type UploadView,
} from "./assets-data";
import { SOURCE_LABEL } from "./scene-types";

/** What the header's primary button does in the current view. */
interface HeaderAction {
  label: string;
  run: () => void;
}

/**
 * Pick mode turns the library into a chooser for another panel (today: the 3D
 * Generate panel's reference images). It narrows the library to the user's own
 * uploaded images and caps how many can come back.
 */
export interface PickRequest {
  /** how many more the caller can accept */
  max: number;
  /** what the caller is collecting — shown in the prompt bar */
  purpose: string;
  onConfirm: (assets: Asset[]) => void;
  onCancel: () => void;
}

/**
 * The formats that can actually BECOME the sky.
 *
 * Not a taste call — it is what the renderer can load. drei picks its loader off
 * the extension (`RGBELoader` for hdr, `EXRLoader` for exr, a JPEG decoder for
 * jpg) and returns null for anything else, which throws inside the canvas
 * rather than failing softly. So a dropped PNG panorama stays an Image: an
 * upload that lands in the wrong category is a nuisance, and one that takes the
 * viewport down with it is a bug.
 */
const SKY_EXT = ["hdr", "exr", "jpg", "jpeg"];

const extOf = (file: File) => file.name.split(".").pop()?.toLowerCase() ?? "";

/**
 * Is this upload a file that could BE the sky?
 *
 * An `.hdr`/`.exr` always is. A JPEG only might be — most uploads are reference
 * photos — which is why the aspect ratio decides (see `panoramaCheck`) rather
 * than the extension alone. Either way the file's own URL is worth keeping: an
 * upload whose bytes the app threw away cannot be placed as anything, which is
 * what used to happen to every dropped HDRI.
 */
const couldBeSky = (file: File) => SKY_EXT.includes(extOf(file));

/**
 * The file's own URL, tagged so the renderer can tell what it is.
 *
 * A blob URL carries no extension — `blob:http://host/uuid` — and drei reads the
 * extension to choose a loader, so an untagged one throws "Unrecognized file
 * extension" and takes the canvas with it. The real extension rides along as a
 * fragment, which blob resolution ignores (the bytes still fetch) and
 * `split(".").pop()` still finds.
 */
const taggedBlobUrl = (file: File) => `${URL.createObjectURL(file)}#.${extOf(file)}`;

/**
 * An equirectangular panorama is 2:1, and that is the only signal a dropped
 * file gives us.
 *
 * Reading the ratio is worth the async hop because the alternative is filing a
 * 2000×1000 sky under Images, where nothing can place it as a sky and the only
 * way out is knowing to retype it by hand. The tolerance is loose — captures
 * come off stitchers a pixel or two out — and anything else stays an Image,
 * which is the safe answer: a reference photo wrongly promoted to a skybox
 * would replace the horizon the moment it was placed.
 */
function panoramaCheck(file: File): Promise<boolean> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img.naturalHeight > 0 && Math.abs(img.naturalWidth / img.naturalHeight - 2) < 0.02);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(false);
    };
    img.src = url;
  });
}

/** Extension → the asset kind we file an upload under. */
function typeForFile(file: File): AssetType {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (["glb", "gltf", "obj", "fbx", "usdz"].includes(ext)) return "mesh";
  if (["hdr", "exr"].includes(ext)) return "environment";
  // The three formats a capture pipeline actually hands back. Without this a
  // dropped .ply lands in Uploads as an "Image" and can never be placed as the
  // world it is.
  if (["ply", "splat", "spz"].includes(ext)) return "splat";
  if (["mp4", "mov", "webm"].includes(ext)) return "video";
  return "image";
}

/**
 * AssetLibrary — the editor's asset browser (bottom dock). Terra glass idiom.
 *
 * Categories: All Assets (the whole catalogue, with a type filter over it) ·
 * Environments (HDRI maps and Gaussian splats) · Skyboxes · Uploads (My Assets /
 * Folders) · 3D Models · Utilities. Each view keeps the same header shape — search, tag
 * filter, one primary action — so moving between them doesn't move the
 * controls; only the action changes (Generate 3D / Upload / Create Folder).
 *
 * ALL ASSETS IS THE ONLY TAB THAT MIXES KINDS, so it and Uploads are the only
 * two that carry a type filter. Everywhere else the tab IS the type, and a
 * filter offering the one type already selected would be a no-op control.
 *
 * Floating pieces (menu, folder picker, details) render fixed so they escape
 * the panel's clipping; the panel shrinks its right edge when details is open.
 */
export function AssetLibrary({
  store,
  initialCategory = "all",
  pick,
  placeLabel,
  rightInset = 0,
  onClose,
  onPlace,
  onGenerate3D,
  onDefineSpace,
}: {
  store: AssetStore;
  /** open straight onto a category — used when a generation finishes */
  initialCategory?: CategoryId;
  /** when set, the library acts as a chooser instead of a browser */
  pick?: PickRequest;
  /**
   * What choosing DOES, when it isn't "add to the scene".
   *
   * TerraGen opens this same sheet to build two shortlists — stand-ins for the
   * master, environments for the run — and neither puts anything in the
   * viewport, so a brand button reading "Add to scene" would be a lie in the
   * one place the user is deciding whether to trust the panel. Passing a label
   * also arms multi-select from the start, because a shortlist is a
   * several-at-once errand by nature.
   */
  placeLabel?: string;
  /**
   * Extra px to keep clear on the right. The dock is a bottom sheet spanning
   * the viewport, and in TerraGen a 400px panel is pinned to that edge — without
   * this the library would run underneath the controls it was opened from.
   */
  rightInset?: number;
  onClose: () => void;
  onPlace: (asset: Asset) => void;
  onGenerate3D: () => void;
  /** Put a space in the scene. Shown as a tile under Utilities. */
  onDefineSpace?: () => void;
}) {
  const { assets, folders } = store;
  const picking = Boolean(pick);

  const [category, setCategory] = useState<CategoryId>(picking ? "uploads" : initialCategory);
  const [uploadView, setUploadView] = useState<UploadView>("assets");
  const [uploadsOpen, setUploadsOpen] = useState(picking || initialCategory === "uploads");
  const [openFolderId, setOpenFolderId] = useState<string | null>(null);

  const [query, setQuery] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [tagsOpen, setTagsOpen] = useState(false);
  // Uploads mixes every kind of file the user brought in, so it's the one view
  // that earns a type filter on top of the tag filter.
  const [types, setTypes] = useState<AssetType[]>([]);
  const [typesOpen, setTypesOpen] = useState(false);
  /**
   * Newest first, because that is the order the grid was already in — the store
   * inserts new assets at the head, so a run you just generated is at the top
   * where you left it. The control makes that a choice rather than a habit.
   */
  const [sort, setSort] = useState<SortOrder>("descending");
  const [sortOpen, setSortOpen] = useState(false);

  // Multi-select is armed from the ⋮ menu ("Select Items") rather than being
  // always-on: a plain click on a card otherwise has two meanings at once.
  // Pick mode is the exception — choosing is the only thing a click can mean.
  const [selectMode, setSelectMode] = useState(picking || Boolean(placeLabel));
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const [menu, setMenu] = useState<MenuAnchor | null>(null);
  const [detailsId, setDetailsId] = useState<string | null>(null);
  /** asset ids waiting to be filed — null when the picker is closed */
  const [filing, setFiling] = useState<string[] | null>(null);
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [folderName, setFolderName] = useState("");
  const [toast, setToast] = useState<string | null>(null);

  const fileRef = useRef<HTMLInputElement>(null);

  const inFolders = category === "uploads" && uploadView === "folders";
  const openFolder = openFolderId ? folders.find((f) => f.id === openFolderId) ?? null : null;
  const showFolderGrid = inFolders && !openFolder;

  // The assets this view is about, before search/tags. Pick mode narrows to the
  // user's own uploaded images — the only thing a reference slot can take.
  const scope = useMemo(() => {
    if (picking) return assets.filter((a) => a.uploaded && a.type === "image");
    if (openFolder) return assets.filter((a) => openFolder.assetIds.includes(a.id));
    if (showFolderGrid) return [];
    return filterByCategory(assets, category);
  }, [assets, category, openFolder, showFolderGrid, picking]);

  const visible = useMemo(() => {
    const base = applyFilters(scope, query, tags);
    const filtered = types.length ? base.filter((a) => types.includes(a.type)) : base;
    // Sort last, so it orders what survived the filters rather than deciding
    // which ones did.
    return sortAssets(filtered, sort);
  }, [scope, query, tags, types, sort]);
  const tagOptions = useMemo(() => collectTags(scope), [scope]);
  // Only the types this view actually contains, so the menu never offers a
  // filter that would empty the grid. Sorted by CONTENT_TYPES rather than by
  // first appearance, so All Assets always reads 3D Asset · HDRI Map · Skybox ·
  // Splat regardless of what order the catalogue happens to be in.
  const typeOptions = useMemo(() => {
    const seen: AssetType[] = [];
    scope.forEach((a) => {
      if (!seen.includes(a.type)) seen.push(a.type);
    });
    const rank = (t: AssetType) => {
      const i = CONTENT_TYPES.indexOf(t);
      return i === -1 ? CONTENT_TYPES.length : i;
    };
    return seen.sort((a, b) => rank(a) - rank(b));
  }, [scope]);
  // All Assets and Uploads are the two categories that mix types; everywhere
  // else the category itself already is the type filter.
  const showTypeFilter =
    (category === "all" || category === "uploads") && !showFolderGrid && !picking;
  const visibleFolders = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? folders.filter((f) => f.name.toLowerCase().includes(q)) : folders;
  }, [folders, query]);

  const detailsAsset = detailsId ? assets.find((a) => a.id === detailsId) ?? null : null;

  const flash = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast((t) => (t === msg ? null : t)), 1900);
  };

  /* ------------------------------------------------------------ navigation */

  const goCategory = (id: CategoryId) => {
    setCategory(id);
    setOpenFolderId(null);
    setTags([]);
    setTypes([]);
    if (id === "uploads") setUploadsOpen(true);
  };

  const goUploadView = (v: UploadView) => {
    setCategory("uploads");
    setUploadView(v);
    setOpenFolderId(null);
    setTags([]);
    setTypes([]);
  };

  /* ------------------------------------------------------------- selection */

  const atPickLimit = picking && pick !== undefined && selected.size >= pick.max;

  const toggleSelect = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      // Refuse rather than evict: silently dropping someone's earlier choice to
      // make room for a new one is the worse surprise.
      else if (!atPickLimit) next.add(id);
      return next;
    });

  const clearSelection = () => {
    setSelected(new Set());
    setSelectMode(false);
  };

  const armSelect = (a: Asset) => {
    setSelectMode(true);
    setSelected(new Set([a.id]));
  };

  /* --------------------------------------------------------------- mutation */

  const remove = (asset: Asset) => {
    store.remove(asset.id);
    setSelected((prev) => {
      const n = new Set(prev);
      n.delete(asset.id);
      return n;
    });
    if (detailsId === asset.id) setDetailsId(null);
  };

  /* ---------------------------------------------------------------- uploads */

  /**
   * Take the dropped files.
   *
   * THE FILE IS KEPT NOW. Every upload used to become a name and a placeholder
   * thumbnail with the bytes dropped on the floor — so dropping in your own
   * HDRI produced an Environment card that confirmed a replacement and left the
   * horizon exactly as it was. A sky upload keeps its own object URL, which is
   * what `SceneCanvas` renders when the asset is placed (see `skyUrl`), and it
   * overrides the catalogue's shared stand-in file.
   *
   * The panorama check runs AFTER the card exists rather than gating it. Reading
   * an image's dimensions is a decode, and a batch of them should not hold the
   * grid empty while it finishes: the card lands immediately as an Image and
   * becomes a Skybox a beat later if the ratio says so.
   */
  const handleFiles = (list: FileList | null) => {
    if (!list || list.length === 0) return;
    const files = Array.from(list);
    files.forEach((file) => {
      const type = typeForFile(file);
      const sky = couldBeSky(file);
      const asset = store.add({
        name: file.name.replace(/\.[^.]+$/, ""),
        type,
        uploaded: true,
        skyUrl: sky ? taggedBlobUrl(file) : undefined,
      });
      if (sky && type === "image") {
        void panoramaCheck(file).then((is) => {
          if (is) store.update(asset.id, { type: "skybox" });
        });
      }
    });
    goUploadView("assets");
    flash(`${files.length} ${files.length === 1 ? "file" : "files"} uploaded`);
  };

  /* ---------------------------------------------------------------- folders */

  const fileInto = (folderId: string, assetIds: string[]) => {
    store.fileInto(folderId, assetIds);
    const name = folders.find((f) => f.id === folderId)?.name ?? "folder";
    flash(`Added to ${name}`);
  };

  const submitNewFolder = () => {
    const name = folderName.trim();
    if (!name) return;
    store.createFolder(name);
    setFolderName("");
    setCreatingFolder(false);
    flash(`Folder “${name}” created`);
  };

  /* ----------------------------------------------------------------- header */

  const headerAction: HeaderAction | null =
    category === "meshes"
      ? { label: "Generate 3D", run: onGenerate3D }
      : category === "uploads" && uploadView === "assets"
        ? { label: "Upload", run: () => fileRef.current?.click() }
        : showFolderGrid
          ? { label: "Create Folder", run: () => setCreatingFolder(true) }
          : null;

  const openMenu = (asset: Asset, rect: DOMRect) => setMenu({ asset, x: rect.left, y: rect.bottom + 4 });

  const placeSelected = () => {
    selected.forEach((sid) => {
      const a = assets.find((x) => x.id === sid);
      if (a) onPlace(a);
    });
    clearSelection();
  };

  return (
    <>
      <input
        ref={fileRef}
        type="file"
        multiple
        hidden
        data-ui="asset-upload-input"
        accept="image/*,video/*,.glb,.gltf,.obj,.fbx,.usdz,.hdr,.exr,.ply,.splat,.spz"
        onChange={(e) => {
          handleFiles(e.target.files);
          e.target.value = "";
        }}
      />

      <GlassPanel
        ui="asset-library"
        thickness="thick"
        /* `animate-sheet-in` rises from the bottom edge it is docked to. The
           library opened by snapping into place fully formed, which on a
           surface this large reads as the screen changing rather than as a
           thing arriving — and gave no clue which button had produced it. */
        className="pointer-events-auto absolute bottom-6 left-6 flex h-[40vh] max-h-[392px] min-h-[260px] animate-sheet-in overflow-hidden !rounded-3xl transition-[right] duration-300"
        // Driven by style rather than a class pair so the caller's inset can be
        // added to it — two variants became four the moment TerraGen also
        // needed to push the panel in.
        // details card: 16px right margin + 320px panel + a 16px gutter
        style={{ right: (detailsId ? 352 : 24) + rightInset }}
      >
        {/* Category nav */}
        <nav data-ui="asset-categories" className="flex w-48 shrink-0 flex-col gap-0.5 overflow-y-auto border-r border-glass/10 p-3">
          {/* Pick mode collapses the nav to the one place a reference can come
              from, so there's no branch that leads to an unselectable grid. */}
          {categories
            .filter((c) => !picking || c.id === "uploads")
            .map((c) =>
            c.id === "uploads" ? (
              <div key={c.id} className="flex flex-col">
                <CatButton
                  label={c.label}
                  icon={c.icon}
                  active={category === "uploads"}
                  onClick={() => {
                    goCategory("uploads");
                    setUploadsOpen(true);
                  }}
                  trailing={
                    <span
                      role="button"
                      aria-label={uploadsOpen ? "Collapse uploads" : "Expand uploads"}
                      onClick={(e) => {
                        e.stopPropagation();
                        setUploadsOpen((v) => !v);
                      }}
                      className="ml-auto grid h-6 w-6 place-items-center rounded-md text-content-muted transition-colors hover:bg-glass/15 hover:text-content"
                    >
                      <Icon name="chevron-down" size={15} className={cn("transition-transform", uploadsOpen && "rotate-180")} />
                    </span>
                  }
                />
                {uploadsOpen && (
                  <div className="ml-3.5 mt-0.5 flex flex-col gap-0.5 border-l border-glass/10 pl-2">
                    {uploadViews
                      .filter((v) => !picking || v.id === "assets")
                      .map((v) => (
                      <SubButton
                        key={v.id}
                        icon={v.icon}
                        label={v.label}
                        active={category === "uploads" && uploadView === v.id}
                        onClick={() => goUploadView(v.id)}
                      />
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <CatButton
                key={c.id}
                label={c.label}
                icon={c.icon}
                active={category === c.id}
                onClick={() => goCategory(c.id)}
              />
            )
          )}
        </nav>

        {/* Content */}
        <div className="flex min-w-0 flex-1 flex-col">
          {/* Header — search · tags · primary action · close */}
          <div className="flex items-center gap-2 border-b border-glass/10 p-3">
            <div className="flex h-10 min-w-0 flex-1 items-center gap-2 rounded-full border border-glass/12 bg-glass/8 px-3.5">
              <Icon name="search" size={16} className="shrink-0 text-content-subtle" />
              <input
                data-ui="asset-search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search"
                className="type-body min-w-0 flex-1 bg-transparent text-content outline-none placeholder:text-content-subtle"
              />
              {query && (
                <button
                  type="button"
                  aria-label="Clear search"
                  onClick={() => setQuery("")}
                  className="grid h-5 w-5 shrink-0 place-items-center rounded-full text-content-muted hover:bg-glass/15 hover:text-content"
                >
                  <Icon name="close" size={13} />
                </button>
              )}
            </div>

            {showTypeFilter && (
              <TypeFilter
                options={typeOptions}
                value={types}
                open={typesOpen}
                onOpenChange={setTypesOpen}
                onChange={setTypes}
              />
            )}

            {!showFolderGrid && (
              <TagFilter
                options={tagOptions}
                value={tags}
                open={tagsOpen}
                onOpenChange={setTagsOpen}
                onChange={setTags}
              />
            )}

            {/* Sort sits on EVERY tab, unlike the two filters beside it. A
                filter is about which of these do I want; a sort is about how
                do I read them, and that question survives into the tabs that
                hold one kind of thing. It's icon-only for the same reason —
                three controls with labels crowd the search field off a 40vh
                dock, and the chosen order is already visible in the grid. */}
            {!showFolderGrid && (
              <SortMenu
                value={sort}
                open={sortOpen}
                onOpenChange={setSortOpen}
                onChange={setSort}
              />
            )}

            {headerAction && (
              <Button
                variant="brand"
                size="sm"
                data-ui={`asset-action-${headerAction.label.toLowerCase().replace(/\s+/g, "-")}`}
                onClick={headerAction.run}
                className="!rounded-full"
              >
                <Icon name="create" size={16} />
                {headerAction.label}
              </Button>
            )}

            <GlassGhostButton
              ui="asset-close"
              icon="close"
              label={picking ? "Cancel selection" : "Close asset library"}
              onClick={picking ? pick!.onCancel : onClose}
            />
          </div>

          {/* Pick-mode prompt — says what's being collected and how many fit */}
          {pick && (
            <div
              data-ui="asset-pick-prompt"
              className="flex items-center gap-2 border-b border-glass/10 bg-brand/8 px-3 py-2"
            >
              <Icon name="select-check" size={15} className="shrink-0 text-brand" />
              <span className="type-body text-content">
                Choose {pick.purpose} from your uploads
              </span>
              <span className="type-caption ml-auto text-content-subtle">
                {selected.size} of {pick.max}
              </span>
            </div>
          )}

          {/* Breadcrumb — only when drilled into a folder */}
          {openFolder && (
            <div data-ui="asset-breadcrumb" className="flex items-center gap-2 border-b border-glass/10 px-3 py-2">
              <button
                type="button"
                onClick={() => setOpenFolderId(null)}
                className="type-body flex items-center gap-1.5 text-content-muted transition-colors hover:text-content"
              >
                <Icon name="back" size={15} />
                Folders
              </button>
              <Icon name="chevron-right" size={14} className="text-content-subtle" />
              <span className="type-body-strong truncate text-content">{openFolder.name}</span>
            </div>
          )}

          {/* Grid */}
          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            {showFolderGrid ? (
              <div className="grid grid-cols-[repeat(auto-fill,minmax(128px,1fr))] gap-3">
                {creatingFolder && (
                  <div
                    data-ui="folder-new-tile"
                    className="flex aspect-square flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-brand/50 bg-glass/8 p-3"
                  >
                    <Icon name="folder-add" size={22} className="text-brand" />
                    <TextInput
                      autoFocus
                      ui="folder-name"
                      value={folderName}
                      onChange={(e) => setFolderName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") submitNewFolder();
                        if (e.key === "Escape") {
                          setCreatingFolder(false);
                          setFolderName("");
                        }
                      }}
                      onBlur={submitNewFolder}
                      placeholder="Folder name"
                      className="text-center"
                    />
                  </div>
                )}
                {visibleFolders.map((f) => (
                  <FolderCard key={f.id} folder={f} onOpen={() => setOpenFolderId(f.id)} />
                ))}
                {visibleFolders.length === 0 && !creatingFolder && (
                  <EmptyState
                    icon="folder"
                    message={query ? `No folders match “${query}”.` : "No folders yet. Group your uploads to find them fast."}
                    actionLabel={query ? undefined : "Create Folder"}
                    onAction={() => setCreatingFolder(true)}
                  />
                )}
              </div>
            ) : visible.length > 0 || (category === "utilities" && onDefineSpace) ? (
              <div className="grid grid-cols-[repeat(auto-fill,minmax(128px,1fr))] gap-3">
                {/* A space is a utility in exactly the sense the capture rig is:
                    scene apparatus you drop in, not content you made. It is not
                    an Asset — it has no file, no thumbnail and no type — so it
                    is a tile rather than a row in the list, which keeps
                    `AssetType` from growing a member nothing else can handle. */}
                {category === "utilities" && onDefineSpace && (
                  <SpaceTile onPick={onDefineSpace} />
                )}
                {visible.map((a) => (
                  <AssetCard
                    key={a.id}
                    asset={a}
                    selectMode={selectMode}
                    selected={selected.has(a.id)}
                    // At the cap, unselected cards stop inviting a click they'd refuse.
                    disabled={atPickLimit && !selected.has(a.id)}
                    showMenu={!picking}
                    onToggle={toggleSelect}
                    onOpen={(x) => setDetailsId(x.id)}
                    onMenu={openMenu}
                  />
                ))}
              </div>
            ) : (
              <EmptyState
                icon={category === "uploads" ? "upload" : category === "meshes" ? "input-3d" : "search"}
                message={
                  query || tags.length > 0 || types.length > 0
                    ? "No assets match the current filters."
                    : picking
                      ? "No uploaded images yet. Upload one to use as a reference."
                      : openFolder
                      ? "This folder is empty. Use “Add to Folder” on any asset."
                      : category === "uploads"
                        ? "No uploads yet. Bring in your own images, skyboxes, environments or 3D models."
                        : category === "meshes"
                          ? "No 3D models yet. Generate one from a prompt or reference image."
                          : category === "skyboxes"
                            ? "No skyboxes yet. Upload a panorama to sit behind your scene."
                            : category === "environments"
                              ? "No environments yet. Upload an HDRI or a .ply capture to light the scene."
                              : "Nothing here yet."
                }
                actionLabel={
                  query || tags.length > 0 || types.length > 0
                    ? "Clear filters"
                    : picking
                      ? "Upload image"
                      : category === "uploads"
                      ? "Upload asset"
                      : category === "meshes"
                        ? "Generate 3D"
                        : undefined
                }
                onAction={() => {
                  if (query || tags.length > 0 || types.length > 0) {
                    setQuery("");
                    setTags([]);
                    setTypes([]);
                  } else if (picking || category === "uploads") fileRef.current?.click();
                  else onGenerate3D();
                }}
              />
            )}
          </div>

          {/* Pick footer — confirm/cancel back to whoever opened the chooser */}
          {pick ? (
            <div data-ui="asset-pick-bar" className="flex items-center gap-3 border-t border-glass/10 p-3">
              <button
                onClick={() => setSelected(new Set())}
                disabled={selected.size === 0}
                className="type-body text-content-muted transition-colors hover:text-content disabled:opacity-40"
              >
                Clear
              </button>
              <div className="ml-auto flex items-center gap-2">
                <Button variant="secondary" size="sm" onClick={pick.onCancel} className="!rounded-full">
                  Cancel
                </Button>
                <Button
                  variant="brand"
                  size="sm"
                  data-ui="asset-pick-confirm"
                  disabled={selected.size === 0}
                  onClick={() =>
                    pick.onConfirm(
                      [...selected].map((id) => assets.find((a) => a.id === id)).filter(Boolean) as Asset[]
                    )
                  }
                  className="!rounded-full"
                >
                  <Icon name="check" size={16} />
                  Add {selected.size > 0 ? selected.size : ""}
                </Button>
              </div>
            </div>
          ) : (
            /* Selection footer */
            selectMode && (
            <div data-ui="asset-selection-bar" className="flex items-center gap-3 border-t border-glass/10 p-3">
              <span className="type-body text-content-muted">
                <b className="type-body-strong text-content">{selected.size}</b> selected
              </span>
              {/* Reads as an active control the moment there's something to clear —
                  a plain muted "Clear" was too easy to miss beside a full grid. */}
              <button
                data-ui="selection-clear-all"
                onClick={clearSelection}
                disabled={selected.size === 0}
                className={cn(
                  "type-body-strong rounded-full border px-3 py-1 transition-colors",
                  selected.size > 0
                    ? "border-brand/45 bg-brand/12 text-brand hover:bg-brand/20"
                    : "border-glass/12 text-content-subtle"
                )}
              >
                Clear all
              </button>
              <div className="ml-auto flex items-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  data-ui="selection-add-to-folder"
                  disabled={selected.size === 0}
                  onClick={() => setFiling([...selected])}
                  className="!rounded-full"
                >
                  <Icon name="folder-add" size={16} />
                  Add to folder
                </Button>
                <Button
                  variant="brand"
                  size="sm"
                  data-ui="selection-add-to-scene"
                  disabled={selected.size === 0}
                  onClick={placeSelected}
                  className="!rounded-full"
                >
                  <Icon name="place" size={16} />
                  {placeLabel ?? "Add to scene"}
                </Button>
              </div>
            </div>
            )
          )}
        </div>
      </GlassPanel>

      {/* Floating (fixed) pieces — escape the panel clipping */}
      {menu && (
        <AssetActionMenu
          anchor={menu}
          canDelete={Boolean(menu.asset.uploaded)}
          onClose={() => setMenu(null)}
          onViewInfo={(a) => setDetailsId(a.id)}
          onSelect={armSelect}
          onDelete={remove}
          onAddToFolder={(a) => setFiling([a.id])}
          placeLabel={placeLabel}
          onPlace={(a) => {
            onPlace(a);
            setMenu(null);
          }}
        />
      )}

      {filing && (
        <FolderPicker
          folders={folders}
          count={filing.length}
          onClose={() => setFiling(null)}
          onPick={(id) => {
            fileInto(id, filing);
            setFiling(null);
            clearSelection();
          }}
          onCreate={(name) => {
            store.createFolder(name, filing);
            flash(`Folder “${name}” created`);
            setFiling(null);
            clearSelection();
          }}
        />
      )}

      {detailsAsset && (
        <AssetDetailsPanel asset={detailsAsset} onClose={() => setDetailsId(null)} onUpdate={store.update} onDelete={remove} />
      )}

      {toast && (
        <div className="type-body pointer-events-none fixed bottom-6 left-1/2 z-[60] -translate-x-1/2 rounded-full bg-surface-overlay px-4 py-2 text-content shadow-pop">
          {toast}
        </div>
      )}
    </>
  );
}

/* ------------------------------------------------------------------ parts */

function TagFilter({
  options,
  value,
  open,
  onOpenChange,
  onChange,
}: {
  options: string[];
  value: string[];
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onChange: (v: string[]) => void;
}) {
  const toggle = (t: string) =>
    onChange(value.includes(t) ? value.filter((x) => x !== t) : [...value, t]);

  return (
    <div className="relative shrink-0">
      <button
        type="button"
        data-ui="asset-tags"
        onClick={() => onOpenChange(!open)}
        className={cn(
          "type-body flex h-10 items-center gap-2 rounded-full border px-3.5 transition-colors",
          value.length > 0
            ? "border-brand/50 bg-brand/12 text-content"
            : "border-glass/12 bg-glass/8 text-content-muted hover:text-content"
        )}
      >
        <Icon name="tag" size={15} />
        <span className="hidden sm:inline">Tags</span>
        {value.length > 0 && (
          <span className="type-caption-strong rounded-full bg-brand px-1.5 text-brand-foreground">{value.length}</span>
        )}
        <Icon name="chevron-down" size={14} className={cn("transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => onOpenChange(false)} />
          <GlassPanel
            ui="tag-menu"
            thickness="overlay"
            className="absolute right-0 top-[calc(100%+8px)] z-50 max-h-64 w-52 overflow-y-auto !rounded-2xl p-1.5"
          >
            {options.length === 0 ? (
              <p className="type-body px-3 py-2 text-content-subtle">No tags here yet.</p>
            ) : (
              options.map((t) => (
                <button
                  key={t}
                  type="button"
                  data-ui={`tag-option-${t.toLowerCase()}`}
                  onClick={() => toggle(t)}
                  className="type-body flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-content-muted transition-colors hover:bg-glass/12 hover:text-content"
                >
                  <span
                    className={cn(
                      "grid h-4 w-4 shrink-0 place-items-center rounded border",
                      value.includes(t) ? "border-brand bg-brand text-brand-foreground" : "border-glass/25"
                    )}
                  >
                    {value.includes(t) && <Icon name="check" size={11} strokeWidth={3} />}
                  </span>
                  <span className="truncate">{t}</span>
                </button>
              ))
            )}
            {value.length > 0 && (
              <button
                type="button"
                onClick={() => onChange([])}
                className="type-body mt-1 flex w-full items-center gap-2.5 border-t border-glass/10 px-3 pb-1 pt-2.5 text-brand"
              >
                Clear tags
              </button>
            )}
          </GlassPanel>
        </>
      )}
    </div>
  );
}

/** Type filter for the Uploads view. Mirrors TagFilter's shape, but its options
 *  are asset kinds (with the same badge glyphs the cards carry) rather than tags. */
function TypeFilter({
  options,
  value,
  open,
  onOpenChange,
  onChange,
}: {
  options: AssetType[];
  value: AssetType[];
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onChange: (v: AssetType[]) => void;
}) {
  const toggle = (t: AssetType) =>
    onChange(value.includes(t) ? value.filter((x) => x !== t) : [...value, t]);

  return (
    <div className="relative shrink-0">
      <button
        type="button"
        data-ui="asset-types"
        onClick={() => onOpenChange(!open)}
        className={cn(
          "type-body flex h-10 items-center gap-2 rounded-full border px-3.5 transition-colors",
          value.length > 0
            ? "border-brand/50 bg-brand/12 text-content"
            : "border-glass/12 bg-glass/8 text-content-muted hover:text-content"
        )}
      >
        <Icon name="assets" size={15} />
        <span className="hidden sm:inline">Types</span>
        {value.length > 0 && (
          <span className="type-caption-strong rounded-full bg-brand px-1.5 text-brand-foreground">
            {value.length}
          </span>
        )}
        <Icon name="chevron-down" size={14} className={cn("transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => onOpenChange(false)} />
          <GlassPanel
            ui="asset-type-menu"
            thickness="overlay"
            className="absolute right-0 top-[calc(100%+8px)] z-50 max-h-64 w-52 overflow-y-auto !rounded-2xl p-1.5"
          >
            {options.length === 0 ? (
              <p className="type-body px-3 py-2 text-content-subtle">Nothing uploaded yet.</p>
            ) : (
              options.map((t) => (
                <button
                  key={t}
                  type="button"
                  data-ui={`asset-type-${t}`}
                  onClick={() => toggle(t)}
                  className="type-body flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-content-muted transition-colors hover:bg-glass/12 hover:text-content"
                >
                  <span
                    className={cn(
                      "grid h-4 w-4 shrink-0 place-items-center rounded border",
                      value.includes(t) ? "border-brand bg-brand text-brand-foreground" : "border-glass/25"
                    )}
                  >
                    {value.includes(t) && <Icon name="check" size={11} strokeWidth={3} />}
                  </span>
                  <Icon name={typeIcon[t]} size={15} />
                  <span className="truncate">{SOURCE_LABEL[t]}</span>
                </button>
              ))
            )}
            {value.length > 0 && (
              <button
                type="button"
                onClick={() => onChange([])}
                className="type-body mt-1 flex w-full items-center gap-2.5 border-t border-glass/10 px-3 pb-1 pt-2.5 text-brand"
              >
                Clear types
              </button>
            )}
          </GlassPanel>
        </>
      )}
    </div>
  );
}

/**
 * SORT — icon only.
 *
 * The two controls beside it wear labels because a filter is invisible once
 * applied: nothing in a grid of twelve says "and forty more are hidden". A sort
 * is the opposite — its whole effect is the order you're looking at — so the
 * trigger only has to be findable, not self-explaining. That buys back the
 * width that a third labelled pill would have taken from the search field.
 *
 * A radio list, not checkboxes: the grid has exactly one order at a time.
 */
function SortMenu({
  value,
  open,
  onOpenChange,
  onChange,
}: {
  value: SortOrder;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onChange: (v: SortOrder) => void;
}) {
  const current = sortOptions.find((o) => o.id === value) ?? sortOptions[0];

  return (
    <div className="relative shrink-0">
      <button
        type="button"
        aria-label={`Sort — ${current.label}`}
        aria-haspopup="menu"
        aria-expanded={open}
        title={`Sort — ${current.label}`}
        data-ui="asset-sort"
        onClick={() => onOpenChange(!open)}
        className={cn(
          "grid h-10 w-10 place-items-center rounded-full border transition-colors",
          open
            ? "border-brand/50 bg-brand/12 text-content"
            : "border-glass/12 bg-glass/8 text-content-muted hover:text-content"
        )}
      >
        <Icon name="filter" size={16} />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => onOpenChange(false)} />
          <GlassPanel
            ui="asset-sort-menu"
            thickness="overlay"
            className="absolute right-0 top-[calc(100%+8px)] z-50 w-52 !rounded-2xl p-1.5"
          >
            <p className="type-eyebrow px-3 pb-1 pt-1.5 text-content-muted">Sort by</p>
            {sortOptions.map((o) => {
              const on = o.id === value;
              return (
                <button
                  key={o.id}
                  type="button"
                  role="menuitemradio"
                  aria-checked={on}
                  data-ui={`asset-sort-${o.id}`}
                  onClick={() => {
                    onChange(o.id);
                    // One order at a time, so the choice is the whole errand —
                    // unlike the filters, where you usually tick several.
                    onOpenChange(false);
                  }}
                  className={cn(
                    "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left transition-colors",
                    on ? "bg-brand/12" : "hover:bg-glass/12"
                  )}
                >
                  <Icon
                    name={o.icon}
                    size={15}
                    className={cn(
                      "shrink-0",
                      // The same chevron, flipped — the direction IS the label.
                      o.id === "ascending" && "rotate-180",
                      on ? "text-brand" : "text-content-subtle"
                    )}
                  />
                  <span className="min-w-0 grow">
                    <span
                      className={cn(
                        "type-body block truncate",
                        on ? "text-brand-on-glass" : "text-content"
                      )}
                    >
                      {o.label}
                    </span>
                    <span className="type-caption block text-content-subtle">{o.hint}</span>
                  </span>
                  {on && <Icon name="check" size={14} className="shrink-0 text-brand" />}
                </button>
              );
            })}
          </GlassPanel>
        </>
      )}
    </div>
  );
}

/**
 * The Define-a-space tile.
 *
 * BUILT LIKE AN `AssetCard`, DELIBERATELY. It is not an Asset — no file, no
 * thumbnail, no type — but it sits in the same grid as things that are, and a
 * card with its own proportions, its own corner radius and a label under the
 * picture instead of over it read as a piece of chrome that had landed in the
 * library by mistake. Same square, same radius, same ring, same lift on hover,
 * same badge in the top-right corner, same scrim carrying the name: the tile
 * differs from its neighbours in what it depicts, which is the only way it
 * should differ.
 */
function SpaceTile({ onPick }: { onPick: () => void }) {
  return (
    <div
      role="button"
      tabIndex={0}
      data-ui="asset-card-space"
      aria-label="Space — define an area"
      onClick={onPick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onPick();
        }
      }}
      className={cn(
        "group relative aspect-square cursor-pointer overflow-hidden rounded-2xl text-left outline-none transition-transform",
        "ring-1 ring-glass/10 hover:-translate-y-0.5 focus-visible:ring-2 focus-visible:ring-ring"
      )}
    >
      <div className="absolute inset-0">
        <SpaceThumb />
      </div>

      {/* The same badge slot the type badge uses, saying the same kind of thing
          the rig's "Rig" says: what this is for, not what it is made of. */}
      <span
        title="Utility · define an area"
        className="absolute right-2 top-2 flex h-6 items-center gap-1 rounded-md bg-black/45 px-1.5 text-white/90 backdrop-blur-sm"
      >
        <Icon name="space" size={12} strokeWidth={2} />
        <span className="type-caption-strong leading-none">Utility</span>
      </span>

      <span className="absolute inset-x-0 bottom-0 scrim-strong p-2 pt-6">
        <span className="type-label block truncate text-white">Space</span>
        <span className="type-caption mt-0.5 hidden truncate text-white/70 group-hover:block">
          Define an area
        </span>
      </span>
    </div>
  );
}

function FolderCard({ folder, onOpen }: { folder: AssetFolder; onOpen: () => void }) {
  return (
    <button
      type="button"
      data-ui={`folder-card-${folder.id}`}
      onClick={onOpen}
      className="group flex aspect-square flex-col items-center justify-center gap-2 rounded-2xl bg-glass/8 ring-1 ring-glass/10 transition-transform hover:-translate-y-0.5 hover:bg-glass/12"
    >
      <Icon name="folder" size={30} className="text-content-muted transition-colors group-hover:text-brand" />
      <span className="type-label max-w-full truncate px-2 text-content">{folder.name}</span>
      <span className="type-caption text-content-subtle">
        {folder.assetIds.length} {folder.assetIds.length === 1 ? "item" : "items"}
      </span>
    </button>
  );
}

function CatButton({
  label,
  icon,
  active,
  onClick,
  trailing,
}: {
  label: string;
  icon: IconName;
  active: boolean;
  onClick: () => void;
  trailing?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-ui={`asset-cat-${label.toLowerCase().replace(/\s+/g, "-")}`}
      className={cn(
        "type-nav group relative flex items-center gap-3 rounded-lg px-3 py-2 transition-colors",
        active ? "bg-glass/14 text-content" : "text-content-muted hover:bg-glass/8 hover:text-content"
      )}
    >
      {active && <span className="absolute left-0 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-full bg-brand" />}
      <Icon name={icon} size={18} />
      <span className="truncate">{label}</span>
      {trailing}
    </button>
  );
}

function SubButton({
  icon,
  label,
  active,
  onClick,
}: {
  icon: IconName;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-ui={`asset-sub-${label.toLowerCase().replace(/\s+/g, "-")}`}
      className={cn(
        "type-body flex items-center gap-2.5 rounded-lg px-3 py-1.5 transition-colors",
        active ? "bg-glass/12 text-content" : "text-content-muted hover:bg-glass/8 hover:text-content"
      )}
    >
      <Icon name={icon} size={15} />
      {label}
    </button>
  );
}

function EmptyState({
  icon,
  message,
  actionLabel,
  onAction,
}: {
  icon: IconName;
  message: string;
  actionLabel?: string;
  onAction: () => void;
}) {
  return (
    <div className="col-span-full flex h-full flex-col items-center justify-center gap-3 py-8 text-center">
      <span className="grid h-14 w-14 place-items-center rounded-2xl bg-glass/8 text-content-subtle">
        <Icon name={icon} size={24} />
      </span>
      <p className="type-body max-w-xs text-content-muted">{message}</p>
      {actionLabel && (
        <Button variant="secondary" size="sm" onClick={onAction} className="!rounded-full">
          {actionLabel}
        </Button>
      )}
    </div>
  );
}
