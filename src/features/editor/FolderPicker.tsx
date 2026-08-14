import { useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui";
import { Icon } from "@/components/icons";
import { Panel, PanelHeader, PanelTitle, PanelSubtitle, PanelClose, PanelBody, PanelFooter, TextInput } from "./ui";
import type { AssetFolder } from "./assets-data";

/**
 * FolderPicker — "Add to Folder". Lists the user's folders so one can be
 * picked, and carries its own create-a-folder row so the flow never dead-ends
 * on an empty list: the new folder is created AND receives the assets in one
 * confirm, which is the only reason a user opens this from an asset.
 *
 * Rendered fixed so it escapes the asset panel's clipping, like the other
 * floating pieces of the library.
 */
export function FolderPicker({
  folders,
  count,
  onClose,
  onPick,
  onCreate,
}: {
  folders: AssetFolder[];
  /** how many assets are being filed — drives the header line */
  count: number;
  onClose: () => void;
  onPick: (folderId: string) => void;
  onCreate: (name: string) => void;
}) {
  const [selected, setSelected] = useState<string | null>(folders[0]?.id ?? null);
  const [creating, setCreating] = useState(folders.length === 0);
  const [name, setName] = useState("");

  const confirm = () => {
    if (creating) {
      const trimmed = name.trim();
      if (!trimmed) return;
      onCreate(trimmed);
    } else if (selected) {
      onPick(selected);
    }
  };

  const canConfirm = creating ? name.trim().length > 0 : Boolean(selected);

  return (
    <>
      {/* pointer-events-auto: the editor's overlay layer is pointer-events-none */}
      <div className="pointer-events-auto fixed inset-0 z-[55] bg-black/40" onClick={onClose} />
      <Panel
        ui="folder-picker"
        thickness="overlay"
        className="pointer-events-auto fixed left-1/2 top-1/2 z-[56] max-h-[70vh] w-[400px] max-w-[92vw] -translate-x-1/2 -translate-y-1/2"
      >
        <PanelHeader align="start" className="p-4">
          <div className="min-w-0">
            <PanelTitle>Add to Folder</PanelTitle>
            <PanelSubtitle>
              {count} {count === 1 ? "asset" : "assets"} selected
            </PanelSubtitle>
          </div>
          <PanelClose label="Close folder picker" onClick={onClose} />
        </PanelHeader>

        <PanelBody className="p-3">
          <div className="flex flex-col gap-1">
            {folders.map((f) => (
              <button
                key={f.id}
                type="button"
                data-ui={`folder-option-${f.id}`}
                onClick={() => {
                  setCreating(false);
                  setSelected(f.id);
                }}
                className={cn(
                  "type-body flex items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors",
                  !creating && selected === f.id
                    ? "bg-glass/14 text-content"
                    : "text-content-muted hover:bg-glass/8 hover:text-content"
                )}
              >
                <Icon name={!creating && selected === f.id ? "folder-open" : "folder"} size={17} />
                <span className="min-w-0 flex-1 truncate">{f.name}</span>
                <span className="type-caption text-content-subtle">
                  {f.assetIds.length}
                </span>
                {!creating && selected === f.id && <Icon name="check" size={15} className="text-brand" />}
              </button>
            ))}

            {creating ? (
              <div data-ui="folder-create-row" className="mt-1 flex items-center gap-2 rounded-xl bg-glass/8 p-2">
                <Icon name="folder-add" size={17} className="ml-1 shrink-0 text-brand" />
                <TextInput
                  autoFocus
                  ui="new-folder"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") confirm();
                    if (e.key === "Escape" && folders.length > 0) setCreating(false);
                  }}
                  placeholder="Folder name"
                />
              </div>
            ) : (
              <button
                type="button"
                data-ui="folder-create-open"
                onClick={() => setCreating(true)}
                className="type-body mt-1 flex items-center gap-3 rounded-xl px-3 py-2.5 text-brand transition-colors hover:bg-glass/8"
              >
                <Icon name="folder-add" size={17} />
                Create new folder
              </button>
            )}
          </div>
        </PanelBody>

        <PanelFooter className="gap-3 p-3">
          <Button variant="secondary" size="md" className="flex-1 !rounded-xl" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="brand"
            size="md"
            data-ui="folder-picker-confirm"
            className="flex-1 !rounded-xl"
            disabled={!canConfirm}
            onClick={confirm}
          >
            {creating ? "Create & Add" : "Add to Folder"}
          </Button>
        </PanelFooter>
      </Panel>
    </>
  );
}
