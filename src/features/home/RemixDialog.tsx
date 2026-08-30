import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/icons";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui";
import { WorldThumb } from "./WorldThumb";
import type { CommunityWorld } from "./data";

/**
 * REMIX — what clicking somebody else's world actually offers you.
 *
 * A community card used to drop you straight into the editor, which read as
 * "here is their project, open". It isn't: you can't edit what someone else
 * published, and what the button really does is start a NEW project from theirs
 * as a reference. That is a decision, not a navigation, so it gets asked.
 *
 * THE PREVIEW LEADS. The world is the entire subject of this dialog, so it is
 * shown large and first, with the title and the two counts under it — the same
 * order the community grid uses, at a size where the picture is the thing you
 * are actually judging. The controls sit beside the title rather than in a
 * footer: Remix is the answer to the title, not to the picture.
 *
 * Glass, like every other panel over the home page — `DialogContent` defaults
 * to the glass surface, so there is nothing to opt into here.
 */
export function RemixDialog({
  world,
  liked,
  onToggleLike,
  onClose,
  onRemix,
}: {
  /** null when nothing is being considered — the dialog is closed */
  world: CommunityWorld | null;
  /** held by the shell, so this and the card behind it show one figure */
  liked: boolean;
  onToggleLike: (id: string) => void;
  onClose: () => void;
  onRemix: (world: CommunityWorld) => void;
}) {
  /* Confirmed in the button itself and reset when the sheet changes worlds —
     a tick that outlived the thing it referred to would be a claim about the
     wrong link. */
  const [copy, setCopy] = useState<"idle" | "done" | "blocked">("idle");
  useEffect(() => setCopy("idle"), [world?.id]);

  const copyLink = async () => {
    if (!world) return;
    try {
      await navigator.clipboard.writeText(
        `${window.location.origin}/#community/${world.id}`
      );
      setCopy("done");
    } catch {
      /* A DENIED CLIPBOARD IS SAID, NOT SWALLOWED. Browsers refuse the write
         when the permission is off, and the first version of this just reset to
         idle — so the button did nothing, twice, and the user had no way to
         know whether they had missed it or it had failed. The Projects shelf
         already reports this (`copyLink` in ProjectsView); the sheet should
         too. */
      setCopy("blocked");
    }
  };

  const copyLabel =
    copy === "done"
      ? "Link copied"
      : copy === "blocked"
        ? "Couldn't copy — clipboard access is blocked"
        : `Copy link to ${world?.title ?? "world"}`;
  // The count in the data is what everyone else gave it; your own like is on top.
  const likes = world ? world.likes + (liked ? 1 : 0) : 0;

  return (
    <Dialog open={!!world} onOpenChange={(o) => !o && onClose()}>
      {/* 38rem, not 52. This was the widest dialog in the app by a long way —
          wider than the dispatch review, which has a bill in it — and at that
          size the type had been scaled up to fill it, so a card preview read as
          more important than the Work Order screen. The preview still leads;
          it just no longer needs its own wall. */}
      <DialogContent
        data-ui="remix-dialog"
        className="w-[min(38rem,calc(100vw-3rem))] max-w-none p-0"
      >
        {/* `pr-16` clears the panel's own ✕, which is absolutely positioned at
            right-4 top-4 — without it the heart sat underneath the close
            button and one of them was unhittable. */}
        <div className="flex flex-wrap items-start gap-3 p-5 pb-3.5 pr-14">
          <div className="min-w-0 flex-1">
            {/* `type-heading` — the same title size every other dialog in the
                app uses (Move, Confirm, Dispatch). It was `text-xl`, one step
                above the ramp's heading, which is what made this panel feel
                like a different and more important kind of thing. */}
            <DialogTitle className="type-heading truncate">
              {world?.title ?? ""}
            </DialogTitle>
            <DialogDescription className="type-caption mt-0.5 text-content-subtle">
              By {world?.author ?? ""}
            </DialogDescription>
            <div className="type-caption mt-1.5 flex items-center gap-2.5 text-content-subtle">
              <span className="flex items-center gap-1.5">
                <Icon name="like" size={13} className={liked ? "fill-current text-brand" : undefined} />
                {likes.toLocaleString()}
              </span>
              <span aria-hidden>·</span>
              <span className="flex items-center gap-1.5">
                <Icon name="person" size={12} />
                {/* The world's own adoption figure — see `CommunityWorld.users`.
                    This used to be `likes × 43`, which moved every time somebody
                    pressed the heart. */}
                {(world?.users ?? 0).toLocaleString()} users
              </span>
            </div>
          </div>

          {/* Remix is the primary and it is stated as what it does. "Open"
              would have been the lie the card was telling. */}
          <div className="flex shrink-0 items-center gap-1.5">
            <Button
              variant="brand"
              size="sm"
              data-ui="remix-confirm"
              onClick={() => world && onRemix(world)}
            >
              <Icon name="duplicate" size={15} />
              Remix
            </Button>
            {/* SHARING IS THE OTHER THING PEOPLE DO WITH SOMEBODY ELSE'S WORK,
                and it was the one action the sheet didn't offer — you could take
                a copy or like it, but not point a colleague at it. Icon-only
                beside Remix so the primary keeps its weight, with the outcome
                said in the label rather than assumed. */}
            <button
              type="button"
              aria-label={copyLabel}
              title={copyLabel}
              data-ui="remix-copy-link"
              onClick={copyLink}
              className={cn(
                "grid h-8 w-8 place-items-center rounded-lg border transition-colors",
                copy === "done"
                  ? "border-success/50 bg-success/12 text-success"
                  : copy === "blocked"
                    ? "border-warning/50 bg-warning-soft/40 text-warning"
                    : "border-glass/15 text-content-muted hover:border-glass/30 hover:text-content"
              )}
            >
              <Icon
                name={copy === "done" ? "check" : copy === "blocked" ? "warning" : "link"}
                size={15}
              />
            </button>
            <button
              type="button"
              aria-label={liked ? `Unlike ${world?.title}` : `Like ${world?.title}`}
              aria-pressed={liked}
              onClick={() => world && onToggleLike(world.id)}
              className={cn(
                "grid h-8 w-8 place-items-center rounded-lg border transition-colors",
                liked
                  ? "border-brand/50 bg-brand/12 text-brand"
                  : "border-glass/15 text-content-muted hover:border-glass/30 hover:text-content"
              )}
            >
              <Icon name="like" size={15} className={liked ? "fill-current" : undefined} />
            </button>
          </div>
        </div>

        {world && (
          <div className="px-5">
            <div className="overflow-hidden rounded-xl border border-glass/10">
              <div className="aspect-[16/9]">
                <WorldThumb seed={world.seed} />
              </div>
            </div>
          </div>
        )}

        <p className="type-caption flex items-start gap-2 p-5 text-content-subtle">
          <Icon name="info" size={13} className="mt-px shrink-0" />
          Remixing copies this world into a new project of your own. The original
          stays as it is, and {world?.author ?? "the author"} keeps the credit.
        </p>
      </DialogContent>
    </Dialog>
  );
}
