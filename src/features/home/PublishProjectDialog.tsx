import { useEffect, useState } from "react";
import { Icon } from "@/components/icons";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  Select,
} from "@/components/ui";
import { WorldThumb } from "./WorldThumb";
import { PUBLISH_CATEGORIES, type CommunityCategory } from "./data";

/** What is being published — null when the dialog is closed. */
export interface PublishRequest {
  id: string;
  name: string;
  /** the cover, so the sheet shows the thing rather than describing it */
  seed: number;
}

/**
 * PUBLISH — putting your own world on the Community page.
 *
 * One decision is asked for and it is the one the Community page can't guess:
 * WHICH CATEGORY. Everything else about a published world is already known —
 * its name, its cover, who made it — so the sheet states those and asks the
 * single question, rather than a form that makes you re-type facts.
 *
 * The category is not optional and has no "uncategorised" fallback, because
 * every tab on Community is a category: a world filed under nothing would be
 * published to a page that has nowhere to show it. It defaults to Urban and the
 * Publish button names its destination, so the default is visible rather than
 * silently applied.
 *
 * Glass, like every other panel over the home page — `DialogContent` defaults
 * to the glass surface.
 */
export function PublishProjectDialog({
  request,
  onClose,
  onPublish,
}: {
  request: PublishRequest | null;
  onClose: () => void;
  onPublish: (id: string, category: CommunityCategory) => void;
}) {
  const [category, setCategory] = useState<CommunityCategory>("urban");

  /* A fresh project is a fresh question. Keeping the last answer would file the
     next world under whatever the previous one happened to be. */
  useEffect(() => {
    if (request) setCategory("urban");
  }, [request?.id]);

  const label =
    PUBLISH_CATEGORIES.find((c) => c.value === category)?.label ?? "Community";

  return (
    <Dialog open={!!request} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        data-ui="publish-dialog"
        className="w-[min(30rem,calc(100vw-3rem))] max-w-none"
      >
        <div className="min-w-0 pr-8">
          <DialogTitle>Publish to Community</DialogTitle>
          <DialogDescription>
            Anyone in Terra will be able to open “{request?.name ?? ""}” and remix
            it into a project of their own. You keep the original.
          </DialogDescription>
        </div>

        {request && (
          <div className="mt-4 flex items-center gap-3 rounded-xl border border-glass/10 bg-glass/5 p-3">
            <div className="h-14 w-24 shrink-0 overflow-hidden rounded-lg border border-glass/10">
              <WorldThumb seed={request.seed} />
            </div>
            <div className="min-w-0">
              <p className="type-body-strong truncate text-content">{request.name}</p>
              <p className="type-caption mt-0.5 text-content-subtle">
                Published as it is right now
              </p>
            </div>
          </div>
        )}

        <label className="mt-4 block">
          <span className="type-caption text-content-subtle">Category</span>
          <Select
            aria-label="Category"
            value={category}
            onChange={(v) => setCategory(v as CommunityCategory)}
            options={PUBLISH_CATEGORIES.map((c) => ({
              value: c.value,
              label: c.label,
            }))}
            className="mt-1.5 h-10 w-full"
          />
        </label>

        <p className="type-caption mt-3 flex items-start gap-2 text-content-subtle">
          <Icon name="info" size={13} className="mt-px shrink-0" />
          The category is the tab it shows under on the Community page. You can
          publish it again later to move it.
        </p>

        <div className="mt-5 flex justify-end gap-2.5">
          <Button variant="secondary" size="sm" onClick={onClose}>
            Cancel
          </Button>
          {/* The destination is IN the button. "Publish" alone would leave the
              category as something you had to look back up to check. */}
          <Button
            variant="brand"
            size="sm"
            data-ui="publish-confirm"
            onClick={() => request && onPublish(request.id, category)}
          >
            <Icon name="community" size={15} />
            Publish to {label}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
