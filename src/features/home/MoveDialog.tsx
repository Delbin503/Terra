import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/icons";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui";
import { organizations, user } from "./data";
import type { Folder } from "./data";

/**
 * MOVE — pick a destination for one project or folder.
 *
 * Two destinations behind one dialog, because the question is the same shape
 * either way: search a list, tick one, confirm. Folders can also be made from
 * here — you often only discover you need one at the moment you're filing
 * something into it.
 *
 * Nothing moves until Move is pressed: the tick is a choice, not the act.
 */
export interface MoveRequest {
  kind: "project" | "folder";
  id: string;
  name: string;
  /** which list of destinations to show */
  mode: "folder" | "organization";
  /** where it currently lives, so that row reads as already-selected */
  currentId?: string;
}

export function MoveDialog({
  request,
  folders,
  onClose,
  onMove,
  onCreateFolder,
}: {
  request: MoveRequest | null;
  folders: Folder[];
  onClose: () => void;
  onMove: (target: string) => void;
  /** returns the new folder's id, so it can be selected straight away */
  onCreateFolder: (name: string) => string;
}) {
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<string | null>(null);
  const [naming, setNaming] = useState(false);
  const [draft, setDraft] = useState("");

  const mode = request?.mode ?? "folder";
  const selected = picked ?? request?.currentId ?? null;

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (mode === "organization") {
      return organizations
        .filter((o) => o.toLowerCase().includes(q))
        .map((o) => ({ id: o, name: o, meta: "Organization" }));
    }
    return folders
      .filter((f) => f.name.toLowerCase().includes(q))
      // A folder can't be filed into itself.
      .filter((f) => !(request?.kind === "folder" && f.id === request.id))
      .map((f) => ({
        id: f.id,
        name: f.name,
        meta: `${f.owner} · ${f.seeds.length} ${f.seeds.length === 1 ? "project" : "projects"}`,
      }));
  }, [mode, folders, query, request]);

  function reset() {
    setQuery("");
    setPicked(null);
    setNaming(false);
    setDraft("");
  }

  function create() {
    const name = draft.trim();
    if (!name) return;
    setPicked(onCreateFolder(name));
    setDraft("");
    setNaming(false);
  }

  return (
    <Dialog
      open={Boolean(request)}
      onOpenChange={(next) => {
        if (!next) {
          reset();
          onClose();
        }
      }}
    >
      <DialogContent className="max-w-md">
        <DialogTitle className="type-heading pr-8">
          Move {request?.kind ?? "project"} “{request?.name ?? ""}”
        </DialogTitle>
        <DialogDescription className="sr-only">
          Choose where to file it, then press Move.
        </DialogDescription>

        <label className="mt-4 flex h-10 items-center gap-2 glass-thin !rounded-lg px-3">
          <Icon name="search" size={16} className="shrink-0 text-content-subtle" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={mode === "organization" ? "Search organization" : "Search folder"}
            aria-label={mode === "organization" ? "Search organization" : "Search folder"}
            className="type-body min-w-0 flex-1 bg-transparent text-content outline-none placeholder:text-content-subtle"
          />
        </label>

        <p className="type-body-strong mt-4 text-content">
          {mode === "organization"
            ? "Organizations"
            : `${user.workspace}’s Folders`}
        </p>

        <div className="mt-1 max-h-[15rem] overflow-y-auto">
          {rows.length ? (
            rows.map((row) => {
              const on = selected === row.id;
              return (
                <button
                  key={row.id}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => setPicked(row.id)}
                  className={cn(
                    "flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left transition-colors",
                    on ? "bg-glass/20" : "hover:bg-glass/10"
                  )}
                >
                  <Icon
                    name={mode === "organization" ? "organization" : "folder"}
                    size={18}
                    className={on ? "text-brand" : "text-content-muted"}
                  />
                  <span className="min-w-0 flex-1">
                    <span
                      className={cn(
                        "type-body-strong block truncate",
                        on ? "text-brand" : "text-content"
                      )}
                    >
                      {row.name}
                    </span>
                    <span
                      className={cn(
                        "type-caption block truncate",
                        on ? "text-brand/80" : "text-content-subtle"
                      )}
                    >
                      {row.meta}
                    </span>
                  </span>
                  {on && <Icon name="check" size={16} className="shrink-0 text-brand" />}
                </button>
              );
            })
          ) : (
            <p className="type-body px-2 py-3 text-content-subtle">
              Nothing matches “{query}”.
            </p>
          )}
        </div>

        {mode === "folder" &&
          (naming ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                create();
              }}
              className="mt-1 flex items-center gap-2 glass-thin !rounded-lg p-1.5"
            >
              <Icon name="folder-add" size={16} className="ml-1 text-content-muted" />
              <input
                autoFocus
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Folder name"
                aria-label="New folder name"
                className="type-body h-8 min-w-0 flex-1 bg-transparent text-content outline-none placeholder:text-content-subtle"
              />
              <Button variant="ghost" size="sm" type="button" onClick={() => setNaming(false)}>
                Cancel
              </Button>
              <Button variant="brand" size="sm" type="submit" disabled={!draft.trim()}>
                Create
              </Button>
            </form>
          ) : (
            <button
              type="button"
              onClick={() => setNaming(true)}
              className="type-body flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left text-content-muted transition-colors hover:bg-glass/15 hover:text-content"
            >
              <Icon name="create" size={18} />
              Create Folder
            </button>
          ))}

        <div className="mt-5 flex justify-end gap-2.5">
          <Button
            variant="secondary"
            onClick={() => {
              reset();
              onClose();
            }}
          >
            Cancel
          </Button>
          <Button
            variant="brand"
            disabled={!selected || selected === request?.currentId}
            onClick={() => {
              if (!selected) return;
              onMove(selected);
              reset();
            }}
          >
            Move
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
