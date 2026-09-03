import { cn } from "@/lib/utils";
import { Icon } from "@/components/icons";
import { AssetThumb } from "./AssetThumb";
import { badgeIcon, badgeLabel, deriveDetails, type Asset } from "./assets-data";
import { SOURCE_LABEL } from "./scene-types";

/**
 * AssetCard — a library tile. Normal state shows a placeholder thumbnail with a
 * type badge, a hover ⋮ menu, and a hover quick-info line. It also renders the
 * `generating` pipeline state (spinner + label).
 *
 * A plain click means "open info" until multi-select is armed from the ⋮ menu,
 * at which point it means "toggle". One click, one meaning at a time.
 */
export function AssetCard({
  asset,
  selectMode,
  selected,
  disabled,
  showMenu = true,
  onToggle,
  onOpen,
  onMenu,
}: {
  asset: Asset;
  selectMode: boolean;
  selected: boolean;
  /** selection cap reached and this card isn't part of it */
  disabled?: boolean;
  /** the ⋮ trigger is noise while the library is acting as a chooser */
  showMenu?: boolean;
  onToggle: (id: string) => void;
  onOpen: (asset: Asset) => void;
  onMenu: (asset: Asset, rect: DOMRect) => void;
}) {
  if (asset.status === "generating") {
    return (
      <div className="relative aspect-square overflow-hidden rounded-2xl ring-1 ring-brand/40">
        <div className="absolute inset-0 opacity-40">
          <AssetThumb type={asset.type} seed={asset.seed} />
        </div>
        <div className="absolute inset-0 grid place-items-center bg-black/45 text-center">
          <div className="flex flex-col items-center gap-1.5 px-2">
            <Icon name="spinner" size={18} className="animate-spin text-brand" />
            <span className="type-card-title text-content">{asset.statusLabel}</span>
          </div>
        </div>
      </div>
    );
  }

  const details = deriveDetails(asset);
  const activate = () => {
    if (disabled) return;
    selectMode ? onToggle(asset.id) : onOpen(asset);
  };

  return (
    <div
      role="button"
      tabIndex={0}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData(
          "application/terra-asset",
          JSON.stringify({
            name: asset.name,
            type: asset.type,
            modelUrl: asset.modelUrl,
            /* A dragged sky has to carry its file, or dropping one into the
               viewport places a named object with no sky behind it while
               clicking the same card swaps the horizon. */
            skyUrl: asset.skyUrl,
          })
        );
        e.dataTransfer.effectAllowed = "copy";
      }}
      data-ui={`asset-card-${asset.id}`}
      aria-pressed={selectMode ? selected : undefined}
      aria-label={`${asset.name} — ${asset.type}${selected ? ", selected" : ""}`}
      onClick={activate}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          activate();
        }
      }}
      className={cn(
        "group relative aspect-square overflow-hidden rounded-2xl text-left outline-none transition-transform",
        "ring-1 ring-glass/10 focus-visible:ring-2 focus-visible:ring-ring",
        disabled ? "cursor-not-allowed opacity-40" : "cursor-pointer hover:-translate-y-0.5",
        selected && "ring-2 ring-brand"
      )}
    >
      <div className="absolute inset-0">
        <AssetThumb type={asset.type} seed={asset.seed} />
      </div>

      {/* TYPE BADGE (top-right) — icon AND word.
          It used to be the glyph alone, which is fine while the tab you are on
          already tells you what everything is. On All Assets it doesn't: a
          skybox and an HDRI map both render as scenery, and two similar icons
          at 13px is not a distinction anyone can make at a glance. */}
      <span
        title={
          asset.generated
            ? `${SOURCE_LABEL[asset.type]} · generated`
            : SOURCE_LABEL[asset.type]
        }
        className="absolute right-2 top-2 flex h-6 items-center gap-1 rounded-md bg-black/45 px-1.5 text-white/90 backdrop-blur-sm"
      >
        <Icon name={badgeIcon(asset)} size={12} strokeWidth={2} />
        <span className="type-caption-strong leading-none">{badgeLabel(asset)}</span>
      </span>

      {/* Select mode owns the top-left slot entirely: a persistent checkbox
          (empty until ticked) and no ⋮ — the only meaning of a click here is
          "toggle", so the actions menu would just be a mistrigger. */}
      {selectMode ? (
        <span
          aria-hidden
          data-ui={`asset-check-${asset.id}`}
          className={cn(
            "absolute left-2 top-2 grid h-6 w-6 place-items-center rounded-md border backdrop-blur-sm transition-colors",
            selected
              ? "border-brand bg-brand text-brand-foreground"
              : "border-white/70 bg-black/40 text-transparent"
          )}
        >
          <Icon name="check" size={14} strokeWidth={3} />
        </span>
      ) : (
        showMenu && (
          <button
            type="button"
            aria-label={`Actions for ${asset.name}`}
            data-ui={`asset-menu-${asset.id}`}
            onClick={(e) => {
              e.stopPropagation();
              onMenu(asset, (e.currentTarget as HTMLElement).getBoundingClientRect());
            }}
            className="absolute left-2 top-2 hidden h-6 w-6 place-items-center rounded-md bg-black/50 text-white/90 backdrop-blur-sm hover:bg-black/70 group-hover:grid"
          >
            <Icon name="more" size={15} />
          </button>
        )
      )}

      {/* Name + hover quick-info */}
      <span className="absolute inset-x-0 bottom-0 scrim-strong p-2 pt-6">
        <span className="type-label block truncate text-white">{asset.name}</span>
        <span className="type-caption mt-0.5 hidden truncate text-white/70 group-hover:block">
          {details.typeLabel} · {details.smartTags[0]}
        </span>
      </span>
    </div>
  );
}
