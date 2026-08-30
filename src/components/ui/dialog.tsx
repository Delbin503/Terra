import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/icons";

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

/**
 * What the dialog is made of.
 *
 * `glass` is the DEFAULT, and the editor's own material: the `overlay` tier of
 * the glass ladder, the same one the dock panels and popovers over the 3D canvas
 * are cut from. Every modal in the product is one surface now — a confirmation
 * in Settings and a composer in the editor should not look like they came from
 * two applications. Anything placed inside follows the in-glass rules: frost and
 * hairlines (`bg-glass/10`, `border-glass/10`), input recesses via
 * `.field-well`, and never a second sheet of glass nested in the first.
 *
 * `solid` remains for the rare case that needs to hide what is behind it
 * outright — nothing currently does.
 *
 * ABOVE EVERYTHING. The tier is z-65 rather than z-50 because the editor floats
 * its own overlays at z-55/56 over the canvas, and a modal that opens behind the
 * panel that opened it is worse than no modal. A dialog is the topmost thing on
 * screen wherever it is raised from.
 */
export type DialogSurface = "solid" | "glass";

/**
 * The scrim under the panel. Glass has to have something to refract, so it gets
 * a lighter one — behind an opaque panel that depth is wasted anyway. It still
 * carries its own blur: the editor's glass floats over a rendered scene, where
 * there is nothing to read; over the home page there is text and thumbnails, and
 * without softening them first the panel competes with what shows through it.
 */
const SCRIM: Record<DialogSurface, string> = {
  solid: "bg-black/70 backdrop-blur-sm",
  glass: "bg-black/60 backdrop-blur-[6px]",
};

/** The panel itself. Glass brings its own radius, hairline and shadow, so the
 *  solid skin's utilities must not be in play — they would win the cascade. */
const PANEL: Record<DialogSurface, string> = {
  solid: "rounded-2xl border border-line/12 bg-surface-overlay shadow-lg",
  glass: "glass glass-overlay",
};

const CLOSE: Record<DialogSurface, string> = {
  solid: "hover:bg-surface-raised hover:text-content",
  glass: "hover:bg-glass/15 hover:text-content",
};

export const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & {
    hideClose?: boolean;
    surface?: DialogSurface;
  }
>(({ className, children, hideClose, surface = "glass", ...props }, ref) => (
  <DialogPrimitive.Portal>
    <DialogPrimitive.Overlay
      className={cn("fixed inset-0 z-[65] animate-overlay-in", SCRIM[surface])}
    />
    <DialogPrimitive.Content
      ref={ref}
      data-ui={surface === "glass" ? "glass-dialog" : undefined}
      className={cn(
        "fixed left-1/2 top-1/2 z-[65] w-full max-w-lg -translate-x-1/2 -translate-y-1/2",
        "p-5 animate-modal-in focus:outline-none",
        PANEL[surface],
        className
      )}
      {...props}
    >
      {children}
      {!hideClose && (
        <DialogPrimitive.Close
          className={cn(
            "absolute right-4 top-4 grid h-8 w-8 place-items-center rounded-md text-content-muted transition-colors",
            CLOSE[surface]
          )}
          aria-label="Close"
        >
          <Icon name="close" size={18} />
        </DialogPrimitive.Close>
      )}
    </DialogPrimitive.Content>
  </DialogPrimitive.Portal>
));
DialogContent.displayName = "DialogContent";

export function DialogTitle({
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      className={cn("type-heading", className)}
      {...props}
    />
  );
}

export function DialogDescription({
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      className={cn("type-body text-content-muted", className)}
      {...props}
    />
  );
}
