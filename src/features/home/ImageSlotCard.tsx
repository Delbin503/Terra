import { useState } from "react";
import { cn } from "@/lib/utils";
import { GlassPanel } from "@/components/glass";
import { Icon } from "@/components/icons";
import {
  SLOTS,
  displaySrc,
  labelTotal,
  slotLabel,
  type SlotId,
  type WorldImage,
} from "./world-input";

/**
 * One reference photo in the composer, as a small square that carries three
 * things: the picture, which compass face of the world it is, and a way into the
 * studio. The face lives ON the thumbnail rather than in a list beside it —
 * "which way is this looking" is a property of the picture, and you assign it by
 * looking at the picture.
 */
export function ImageSlotCard({
  image,
  images,
  onAssign,
  onEdit,
  onRemove,
}: {
  image: WorldImage;
  /** the whole set, so the menu can say which face a swap would trade with */
  images: WorldImage[];
  onAssign: (slot: SlotId) => void;
  onEdit: () => void;
  onRemove: () => void;
}) {
  const [open, setOpen] = useState(false);
  const labels = labelTotal(image.edit);

  return (
    <div className="relative h-[88px] w-[88px] shrink-0">
      <div
        className={cn(
          "group relative h-full w-full overflow-hidden rounded-lg border transition-colors",
          open ? "border-brand" : "border-glass/15 hover:border-brand"
        )}
      >
        <img
          src={displaySrc(image)}
          alt={image.name}
          className="absolute inset-0 h-full w-full object-cover"
        />

        {/* The whole tile opens the studio — that is what clicking a photo means. */}
        <button
          type="button"
          onClick={onEdit}
          title={`Edit or segment ${image.name}`}
          className="absolute inset-0 grid place-items-center bg-black/55 text-white opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
        >
          <span className="flex flex-col items-center gap-1">
            <Icon name="edit" size={16} />
            <span className="type-caption-strong">Edit</span>
          </span>
        </button>

        {labels > 0 && (
          <span className="type-caption-strong pointer-events-none absolute left-1 top-1 flex items-center gap-0.5 rounded-full bg-brand px-1.5 py-0.5 text-brand-foreground">
            <Icon name="check" size={10} strokeWidth={2.6} />
            {labels}
          </span>
        )}

        <button
          type="button"
          aria-label={`Remove ${image.name}`}
          onClick={onRemove}
          className="absolute right-1 top-1 grid h-5 w-5 place-items-center rounded-full bg-black/65 text-white opacity-0 transition-opacity hover:bg-danger group-hover:opacity-100 focus-visible:opacity-100"
        >
          <Icon name="close" size={11} strokeWidth={2.4} />
        </button>
      </div>

      {/* Face picker. Opens upward: the strip sits low in the dialog. */}
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="type-caption-strong glass glass-chrome glass-interactive absolute inset-x-1 bottom-1 z-10 flex items-center justify-between gap-1 !rounded-md px-1.5 py-1 text-content"
      >
        {slotLabel(image.slot)}
        <Icon name="chevron-down" size={12} />
      </button>

      {open && (
        <>
          {/* Covers the dialog, so a click anywhere else in it closes the menu. */}
          <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
          <GlassPanel
            ui="slot-menu"
            thickness="overlay"
            role="menu"
            className="absolute bottom-[calc(100%-0.5rem)] left-0 z-30 w-[8.5rem] !rounded-xl p-1"
          >
            {SLOTS.map((slot) => {
              const holder = images.find((i) => i.slot === slot.id);
              const mine = holder?.id === image.id;
              return (
                <button
                  key={slot.id}
                  type="button"
                  role="menuitemradio"
                  aria-checked={mine}
                  onClick={() => {
                    onAssign(slot.id);
                    setOpen(false);
                  }}
                  className={cn(
                    "type-body flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left transition-colors",
                    mine
                      ? "text-brand"
                      : "text-content-muted hover:bg-glass/15 hover:text-content"
                  )}
                >
                  <Icon
                    name="check"
                    size={13}
                    className={mine ? "" : "invisible"}
                  />
                  <span className="flex-1">{slot.label}</span>
                  {!mine && holder && (
                    <span className="type-caption text-content-subtle">swap</span>
                  )}
                </button>
              );
            })}
          </GlassPanel>
        </>
      )}
    </div>
  );
}
