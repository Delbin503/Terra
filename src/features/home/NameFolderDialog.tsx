import { useEffect, useState } from "react";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui";
import { Icon } from "@/components/icons";

/** Room for a real name, short enough to fit a folder card without eliding. */
const MAX = 60;

/**
 * NameFolderDialog — the one question a new folder asks: what is it called.
 *
 * The same shape as NameProjectDialog, so naming a folder and naming a project
 * feel like one act. Unlike a project, a folder has no sensible default name,
 * so the field starts empty and Create waits until something is typed.
 */
export function NameFolderDialog({
  open,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  onCancel: () => void;
  onConfirm: (name: string) => void;
}) {
  const [draft, setDraft] = useState("");

  // Cleared on every open, so a cancelled name doesn't come back next time.
  useEffect(() => {
    if (open) setDraft("");
  }, [open]);

  const name = draft.trim();

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="max-w-md" data-ui="name-folder-dialog">
        <div className="pr-8">
          <DialogTitle>New folder</DialogTitle>
          <DialogDescription>Give your folder a name. You can rename it later.</DialogDescription>
        </div>

        <form
          className="mt-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (name) onConfirm(name);
          }}
        >
          <label className="field-well flex h-11 items-center gap-2.5 rounded-lg px-3">
            <Icon name="folder" size={16} className="shrink-0 text-content-subtle" />
            <input
              autoFocus
              value={draft}
              maxLength={MAX}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Folder name"
              aria-label="Folder name"
              data-ui="name-folder-input"
              // The well shows focus around the whole field; a second ring on the input itself doubled it.
              className="type-body min-w-0 flex-1 bg-transparent text-content outline-none placeholder:text-content-subtle focus-visible:ring-0 focus-visible:ring-offset-0"
            />
          </label>

          <div className="mt-5 flex justify-end gap-2.5">
            <Button variant="secondary" type="button" onClick={onCancel}>
              Cancel
            </Button>
            <Button variant="brand" type="submit" disabled={!name} data-ui="name-folder-confirm">
              Create Folder
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
