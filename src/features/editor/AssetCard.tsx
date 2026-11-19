import { cn } from "@/lib/utils";
import { Icon } from "@/components/icons";
import { Tooltip } from "@/components/ui";
import { AssetThumb } from "./AssetThumb";
import { badgeIcon, badgeLabel, type Asset } from "./assets-data";

/**
 * AssetCard — a library tile. Compact: the thumbnail carries the card, with the
 * type as an icon in the corner (its word on hover of the icon) and the name
 * only while the card is hovered or focused — at 96px a permanent caption and a
 * worded badge covered half the picture you were choosing by. Also renders the
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
          <AssetThumb type={asset.type} seed={asset.seed} src={asset.thumbUrl} />
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
        <AssetThumb type={asset.type} seed={asset.seed} src={asset.thumbUrl} />
      </div>

      {/* TYPE BADGE (top-right) — the icon alone, its word on hover.
          The word used to sit in the badge permanently, because a skybox and
          an HDRI map are two similar glyphs; it is still one hover away, on
          the icon itself, without covering a corner of every small card. */}
      <Tooltip
        label={asset.generated ? `${badgeLabel(asset)} · generated` : badgeLabel(asset)}
        side="top"
        tone="glass"
      >
        <span
          data-ui={`asset-badge-${asset.id}`}
          aria-label={badgeLabel(asset)}
          className="absolute right-1.5 top-1.5 grid h-6 w-6 place-items-center rounded-md bg-black/45 text-white/90 backdrop-blur-sm"
        >
          <Icon name={badgeIcon(asset)} size={12} strokeWidth={2} />
        </span>
      </Tooltip>

      {/* Select mode owns the top-left slot entirely: a persistent checkbox
          (empty until ticked) and no ⋮ — the only meaning of a click here is
          "toggle", so the actions menu would just be a mistrigger. */}
      {selectMode ? (
        <span
          aria-hidden
          data-ui={`asset-check-${asset.id}`}
          className={cn(
            "absolute left-1.5 top-1.5 grid h-6 w-6 place-items-center rounded-md border backdrop-blur-sm transition-colors",
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
            className="absolute left-1.5 top-1.5 hidden h-6 w-6 place-items-center rounded-md bg-black/50 text-white/90 backdrop-blur-sm hover:bg-black/70 group-hover:grid"
          >
            <Icon name="more" size={15} />
          </button>
        )
      )}

      {/* Name, on hover or keyboard focus only. */}
      <span
        data-ui={`asset-name-${asset.id}`}
        className="pointer-events-none absolute inset-x-0 bottom-0 scrim-strong px-1.5 pb-1.5 pt-5 opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100"
      >
        <span className="type-caption-strong block truncate text-white">{asset.name}</span>
      </span>
    </div>
  );
}
