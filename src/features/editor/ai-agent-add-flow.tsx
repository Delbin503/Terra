import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/icons";
import { AssetThumb } from "./AssetThumb";
import type { Asset } from "./assets-data";
import type { AssetStore } from "./useAssets";

/**
 * AddObjectFlow — the chatbot's answer to "add a chair".
 *
 * Two ways to get an object into the scene, offered as a fork:
 *   · Add from library — the matching assets, in a horizontal strip; one click
 *     drops it into the scene.
 *   · Create new mesh — describe it or upload a reference, with a shortcut into
 *     the full 3D Generate panel.
 *
 * It reads the library straight off the store, so the strip reflects whatever
 * the user actually has — including meshes they generated earlier this session.
 */

/** Meshes whose name matches the asked-for noun; falls back to every mesh so the
 *  strip is never empty just because the wording didn't line up. */
function matchAssets(assets: Asset[], query: string): { matches: Asset[]; exact: boolean } {
  const meshes = assets.filter((a) => a.type === "mesh" && a.status !== "generating");
  const tokens = query
    .toLowerCase()
    .split(/\s+/)
    .map((t) => t.replace(/s$/, "")) // singularise: "chairs" → "chair"
    .filter((t) => t.length > 2 && !["add", "the", "and", "for"].includes(t));

  const matches = meshes.filter((a) => {
    const name = a.name.toLowerCase();
    return tokens.some((t) => name.includes(t));
  });

  return matches.length ? { matches, exact: true } : { matches: meshes, exact: false };
}

export function AddObjectFlow({
  query,
  store,
  onPlace,
  onOpenGenerate3D,
}: {
  query: string;
  store: AssetStore;
  onPlace: (asset: Asset) => void;
  onOpenGenerate3D: () => void;
}) {
  const [mode, setMode] = useState<"choose" | "library" | "create">("choose");
  const [placed, setPlaced] = useState<Set<string>>(new Set());
  const [describe, setDescribe] = useState("");

  const { matches, exact } = useMemo(() => matchAssets(store.assets, query), [store.assets, query]);

  const place = (asset: Asset) => {
    onPlace(asset);
    setPlaced((prev) => new Set(prev).add(asset.id));
  };

  return (
    <div data-ui="ai-add-flow" className="rounded-xl border border-glass/12 bg-glass/8 p-2.5">
      {/* The fork — always visible, so switching paths is one click either way. */}
      <div className="flex gap-1.5">
        <ChoiceTab
          icon="library"
          label="From library"
          active={mode === "library"}
          onClick={() => setMode("library")}
        />
        <ChoiceTab
          icon="generate"
          label="Create new mesh"
          active={mode === "create"}
          onClick={() => setMode("create")}
        />
      </div>

      {mode === "choose" && (
        <p className="type-caption mt-2 text-content-subtle">
          Pick a source above — I’ll drop it straight into the scene.
        </p>
      )}

      {/* ---------------------------------------------------------- library */}
      {mode === "library" && (
        <div className="mt-2.5">
          <p className="type-caption mb-1.5 text-content-subtle">
            {exact
              ? `${matches.length} ${matches.length === 1 ? "match" : "matches"} for “${query}” — click to add`
              : `No exact match for “${query}”. Here’s everything in 3D Meshes:`}
          </p>
          <div
            data-ui="ai-add-library-strip"
            className="-mx-0.5 flex gap-2 overflow-x-auto px-0.5 pb-1"
          >
            {matches.map((a) => (
              <button
                key={a.id}
                type="button"
                data-ui={`ai-add-asset-${a.id}`}
                onClick={() => place(a)}
                className="group relative w-24 shrink-0 overflow-hidden rounded-xl text-left outline-none ring-1 ring-glass/12 transition-transform hover:-translate-y-0.5 focus-visible:ring-2 focus-visible:ring-ring"
              >
                <div className="aspect-square w-full">
                  <AssetThumb type={a.type} seed={a.seed} />
                </div>
                {placed.has(a.id) && (
                  <span className="absolute inset-0 grid place-items-center bg-brand/35 text-brand-foreground">
                    <Icon name="check" size={20} strokeWidth={3} />
                  </span>
                )}
                <span className="absolute inset-x-0 bottom-0 scrim-strong px-1.5 pb-1 pt-4">
                  <span className="type-caption-strong block truncate text-white">{a.name}</span>
                </span>
              </button>
            ))}
          </div>
          {placed.size > 0 && (
            <p className="type-caption mt-1 flex items-center gap-1 text-success">
              <Icon name="check" size={12} strokeWidth={3} />
              Added {placed.size} to the scene
            </p>
          )}
        </div>
      )}

      {/* ----------------------------------------------------------- create */}
      {mode === "create" && (
        <div className="mt-2.5 space-y-2">
          <p className="type-caption text-content-subtle">
            Describe the {query || "object"} you want, or bring a reference image:
          </p>
          <textarea
            data-ui="ai-add-describe"
            value={describe}
            onChange={(e) => setDescribe(e.target.value)}
            placeholder={`e.g. a weathered wooden ${query || "prop"}, neutral pose`}
            className="field-well type-body min-h-[64px] w-full resize-y rounded-lg border px-2.5 py-2 leading-relaxed text-content outline-none transition-colors placeholder:text-content-subtle focus:border-brand/60"
          />
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              data-ui="ai-add-upload"
              className="type-label flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-dashed border-glass/25 px-2 py-2 text-content-muted transition-colors hover:border-glass/40 hover:text-content"
            >
              <Icon name="upload" size={14} />
              Upload image
            </button>
            <button
              type="button"
              data-ui="ai-add-open-generate"
              onClick={onOpenGenerate3D}
              className="type-label-strong flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-brand px-2 py-2 text-brand-foreground transition-colors hover:bg-brand-hover"
            >
              <Icon name="input-3d" size={14} />
              Open 3D Generate
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function ChoiceTab({
  icon,
  label,
  active,
  onClick,
}: {
  icon: Parameters<typeof Icon>[0]["name"];
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "type-label-strong flex flex-1 items-center justify-center gap-1.5 rounded-lg border px-2 py-1.5 transition-colors",
        active
          ? "border-brand/45 bg-brand/15 text-brand"
          : "border-glass/12 bg-glass/8 text-content-muted hover:text-content"
      )}
    >
      <Icon name={icon} size={14} />
      {label}
    </button>
  );
}
