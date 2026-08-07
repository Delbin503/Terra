import { useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { GlassPanel, GlassGhostButton } from "@/components/glass";
import { Button } from "@/components/ui";
import { Icon } from "@/components/icons";
import { AssetCard } from "./AssetCard";
import { AssetActionMenu, type MenuAnchor } from "./AssetActionMenu";
import { MeshUploadPopover } from "./MeshUploadPopover";
import { AssetDetailsPanel } from "./AssetDetailsPanel";
import {
  categories,
  filterByCategory,
  initialAssets,
  type Asset,
  type AssetType,
  type CategoryId,
} from "./assets-data";

type GenMode = "image" | "3d";

/**
 * AssetLibrary — the editor's asset browser (bottom dock). Terra glass idiom.
 * Wires: category filter · live search · Generate (image/3D prompt) · 3D-mesh
 * upload→multiview→model pipeline · hover •••-menu · right-docked details panel.
 * Floating pieces (menu, mesh popover, details) render fixed so they escape the
 * panel's clipping; the panel shrinks its right edge when details is open.
 */
export function AssetLibrary({ onClose, onPlace }: { onClose: () => void; onPlace: (asset: Asset) => void }) {
  const [assets, setAssets] = useState<Asset[]>(initialAssets);
  const [category, setCategory] = useState<CategoryId>("all");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [uploadsOpen, setUploadsOpen] = useState(false);

  const [genMode, setGenMode] = useState<GenMode | null>(null);
  const [genMenuOpen, setGenMenuOpen] = useState(false);
  const [prompt, setPrompt] = useState("");

  const [meshPopover, setMeshPopover] = useState<"upload" | "multiview" | null>(null);
  const meshTarget = useRef<string | null>(null);

  const [menu, setMenu] = useState<MenuAnchor | null>(null);
  const [detailsId, setDetailsId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const idc = useRef(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const newId = (p: string) => `${p}-${(idc.current += 1)}`;

  const visible = useMemo(() => {
    const inCat = filterByCategory(assets, category);
    const q = query.trim().toLowerCase();
    return q ? inCat.filter((a) => a.name.toLowerCase().includes(q)) : inCat;
  }, [assets, category, query]);

  const detailsAsset = detailsId ? assets.find((a) => a.id === detailsId) ?? null : null;
  const showUpload = category === "meshes";

  // ---- selection ----
  const toggleSelect = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  // ---- data mutations ----
  const update = (id: string, patch: Partial<Asset>) =>
    setAssets((prev) => prev.map((a) => (a.id === id ? { ...a, ...patch } : a)));

  const remove = (asset: Asset) => {
    setAssets((prev) => prev.filter((a) => a.id !== asset.id));
    setSelected((prev) => {
      const n = new Set(prev);
      n.delete(asset.id);
      return n;
    });
    if (detailsId === asset.id) setDetailsId(null);
  };

  const flash = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast((t) => (t === msg ? null : t)), 1800);
  };

  // ---- generate (image / 3D from prompt) ----
  const disarm = () => {
    setGenMode(null);
    setPrompt("");
  };
  const armGenerate = (mode: GenMode) => {
    setGenMode(mode);
    setGenMenuOpen(false);
    requestAnimationFrame(() => inputRef.current?.focus());
  };
  const runGenerate = () => {
    if (!genMode || !prompt.trim()) return;
    const type: AssetType = genMode === "image" ? "image" : "mesh";
    const id = newId("gen");
    const name = prompt.trim().slice(0, 48);
    setAssets((prev) => [
      { id, name, type, seed: 210 + idc.current * 17, status: "generating", statusLabel: genMode === "image" ? "Generating image" : "Generating 3D mesh" },
      ...prev,
    ]);
    disarm();
    window.setTimeout(() => update(id, { status: undefined, statusLabel: undefined }), 1600);
  };

  // ---- 3D mesh pipeline ----
  const generateMultiview = () => {
    setMeshPopover(null);
    const id = newId("mesh");
    setAssets((prev) => [
      { id, name: "Uploaded mesh", type: "mesh", seed: 320 + idc.current * 17, uploaded: true, status: "generating", statusLabel: "Generating multi views" },
      ...prev,
    ]);
    setCategory("meshes");
    window.setTimeout(() => update(id, { status: "ready", statusLabel: "Ready" }), 1700);
  };
  const openMultiview = (asset: Asset) => {
    meshTarget.current = asset.id;
    setMeshPopover("multiview");
  };
  const generateModel = () => {
    const id = meshTarget.current;
    setMeshPopover(null);
    if (!id) return;
    update(id, { status: "generating", statusLabel: "Generating 3D mesh" });
    window.setTimeout(() => update(id, { status: undefined, statusLabel: undefined, name: "Generated mesh" }), 1800);
  };

  // ---- uploads (device / url) ----
  const handleUpload = (source: "device" | "url") => {
    const id = newId("upl");
    setAssets((prev) => [
      { id, name: source === "device" ? "Uploaded image" : "Linked asset", type: "image", seed: 400 + idc.current * 17, uploaded: true },
      ...prev,
    ]);
    setCategory("uploads");
    setUploadsOpen(true);
  };

  const openMenu = (asset: Asset, rect: DOMRect) => setMenu({ asset, x: rect.left, y: rect.bottom + 4 });

  return (
    <>
      <GlassPanel
        ui="asset-library"
        thickness="thick"
        className={cn(
          "pointer-events-auto absolute bottom-6 left-6 flex h-[40vh] max-h-[392px] min-h-[260px] overflow-hidden !rounded-3xl transition-[right] duration-300",
          detailsId ? "right-[464px]" : "right-6"
        )}
      >
        {/* Category nav */}
        <nav data-ui="asset-categories" className="flex w-48 shrink-0 flex-col gap-0.5 border-r border-glass/10 p-3">
          {categories.map((c) =>
            c.id === "uploads" ? (
              <div key={c.id} className="flex flex-col">
                <CatButton
                  label={c.label}
                  icon={c.icon}
                  active={category === "uploads"}
                  onClick={() => setCategory("uploads")}
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
                    <SubButton icon="upload" label="From device" onClick={() => handleUpload("device")} />
                    <SubButton icon="link" label="From URL" onClick={() => handleUpload("url")} />
                  </div>
                )}
              </div>
            ) : (
              <CatButton key={c.id} label={c.label} icon={c.icon} active={category === c.id} onClick={() => setCategory(c.id)} />
            )
          )}
        </nav>

        {/* Content */}
        <div className="flex min-w-0 flex-1 flex-col">
          {/* Header */}
          <div className="flex items-center gap-2 border-b border-glass/10 p-3">
            <div
              className={cn(
                "flex h-10 min-w-0 flex-1 items-center gap-2 rounded-full border bg-glass/8 px-3.5 transition-colors",
                genMode ? "border-brand/60 ring-2 ring-brand/25" : "border-glass/12"
              )}
            >
              <Icon name={genMode ? "generate" : "search"} size={16} className={cn("shrink-0", genMode ? "text-brand" : "text-content-subtle")} />
              <input
                ref={inputRef}
                data-ui="asset-search"
                value={genMode ? prompt : query}
                onChange={(e) => (genMode ? setPrompt(e.target.value) : setQuery(e.target.value))}
                onKeyDown={(e) => {
                  if (genMode && e.key === "Enter") runGenerate();
                  if (e.key === "Escape") disarm();
                }}
                placeholder={
                  genMode === "image" ? "Describe the image to generate…" : genMode === "3d" ? "Describe the 3D model to generate…" : "Search assets"
                }
                className="type-body min-w-0 flex-1 bg-transparent text-content outline-none placeholder:text-content-subtle"
              />
              {genMode ? (
                <span className="type-caption hidden shrink-0 items-center gap-1 rounded-md border border-brand/35 px-1.5 py-0.5 text-brand sm:flex">↵ Generate</span>
              ) : query ? (
                <button type="button" aria-label="Clear search" onClick={() => setQuery("")} className="grid h-5 w-5 shrink-0 place-items-center rounded-full text-content-muted hover:bg-glass/15 hover:text-content">
                  <Icon name="close" size={13} />
                </button>
              ) : null}
            </div>

            {showUpload ? (
              <Button variant="brand" size="sm" data-ui="mesh-upload-open" onClick={() => setMeshPopover("upload")} className="!rounded-full">
                <Icon name="upload" size={16} />
                Upload
              </Button>
            ) : (
              <div className="relative">
                <Button variant="brand" size="sm" data-ui="asset-generate" onClick={() => (genMode ? disarm() : setGenMenuOpen((o) => !o))} className="!rounded-full">
                  <Icon name="generate" size={16} />
                  {genMode ? "Cancel" : "Generate"}
                </Button>
                {genMenuOpen && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setGenMenuOpen(false)} />
                    <GlassPanel ui="generate-menu" thickness="overlay" className="absolute right-0 top-[calc(100%+8px)] z-50 w-40 !rounded-xl p-1.5">
                      <GenItem icon="input-2d" label="Image" onClick={() => armGenerate("image")} />
                      <GenItem icon="input-3d" label="3D" onClick={() => armGenerate("3d")} />
                    </GlassPanel>
                  </>
                )}
              </div>
            )}

            <GlassGhostButton ui="asset-close" icon="close" label="Close asset library" onClick={onClose} />
          </div>

          {/* Grid */}
          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            {visible.length > 0 ? (
              <div className="grid grid-cols-[repeat(auto-fill,minmax(128px,1fr))] gap-3">
                {visible.map((a) => (
                  <AssetCard key={a.id} asset={a} selected={selected.has(a.id)} onToggle={toggleSelect} onMenu={openMenu} onReadyClick={openMultiview} />
                ))}
              </div>
            ) : (
              <EmptyState category={category} query={query} onUpload={() => (category === "meshes" ? setMeshPopover("upload") : handleUpload("device"))} />
            )}
          </div>

          {/* Selection footer */}
          {selected.size > 0 && (
            <div data-ui="asset-selection-bar" className="flex items-center gap-3 border-t border-glass/10 p-3">
              <span className="type-body text-content-muted">
                <b className="type-body-strong text-content">{selected.size}</b> selected
              </span>
              <button onClick={() => setSelected(new Set())} className="type-body text-content-muted hover:text-content">
                Clear
              </button>
              <Button
                variant="brand"
                size="sm"
                onClick={() => {
                  selected.forEach((sid) => {
                    const a = assets.find((x) => x.id === sid);
                    if (a) onPlace(a);
                  });
                  setSelected(new Set());
                }}
                className="ml-auto !rounded-full"
              >
                <Icon name="create" size={16} />
                Add to scene
              </Button>
            </div>
          )}
        </div>
      </GlassPanel>

      {/* Floating (fixed) pieces — escape the panel clipping */}
      {menu && (
        <AssetActionMenu
          anchor={menu}
          onClose={() => setMenu(null)}
          onViewDetails={(a) => setDetailsId(a.id)}
          onSelect={(a) => toggleSelect(a.id)}
          onDelete={(a) => remove(a)}
          onPlace={(a) => {
            onPlace(a);
            setMenu(null);
          }}
          onStub={(label) => flash(`${label} — coming soon`)}
        />
      )}

      {meshPopover && (
        <MeshUploadPopover
          mode={meshPopover}
          onClose={() => setMeshPopover(null)}
          onGenerateMultiview={generateMultiview}
          onGenerateModel={generateModel}
        />
      )}

      {detailsAsset && (
        <AssetDetailsPanel asset={detailsAsset} onClose={() => setDetailsId(null)} onUpdate={update} onDelete={(a) => remove(a)} />
      )}

      {toast && (
        <div className="type-body pointer-events-none fixed bottom-6 left-1/2 z-[60] -translate-x-1/2 rounded-full bg-surface-overlay px-4 py-2 text-content shadow-pop">
          {toast}
        </div>
      )}
    </>
  );
}

function GenItem({ icon, label, onClick }: { icon: Parameters<typeof Icon>[0]["name"]; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-ui={`generate-${label.toLowerCase()}`}
      className="type-body flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-content-muted transition-colors hover:bg-glass/12 hover:text-content"
    >
      <Icon name={icon} size={16} />
      {label}
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
  icon: Parameters<typeof Icon>[0]["name"];
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

function SubButton({ icon, label, onClick }: { icon: Parameters<typeof Icon>[0]["name"]; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-ui={`asset-sub-${label.toLowerCase().replace(/\s+/g, "-")}`}
      className="type-body flex items-center gap-2.5 rounded-lg px-3 py-1.5 text-content-muted transition-colors hover:bg-glass/8 hover:text-content"
    >
      <Icon name={icon} size={15} />
      {label}
    </button>
  );
}

function EmptyState({ category, query, onUpload }: { category: CategoryId; query: string; onUpload: () => void }) {
  const isUploads = category === "uploads" && !query;
  const isMeshes = category === "meshes" && !query;
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
      <span className="grid h-14 w-14 place-items-center rounded-2xl bg-glass/8 text-content-subtle">
        <Icon name={isUploads || isMeshes ? "upload" : "search"} size={24} />
      </span>
      <p className="type-body max-w-xs text-content-muted">
        {query
          ? `No assets match “${query}”.`
          : isMeshes
          ? "No meshes yet. Upload an image to generate a 3D mesh."
          : isUploads
          ? "No uploads yet. Bring in your own images, videos, or meshes."
          : "Nothing here yet."}
      </p>
      {(isUploads || isMeshes) && (
        <Button variant="secondary" size="sm" onClick={onUpload} className="!rounded-full">
          <Icon name="upload" size={15} />
          {isMeshes ? "Upload to generate" : "Upload asset"}
        </Button>
      )}
    </div>
  );
}
