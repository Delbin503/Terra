import { useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { Icon, type IconName } from "@/components/icons";
import {
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui";
import { ImageSlotCard } from "./ImageSlotCard";
import { ImageStudioDialog } from "./ImageStudioDialog";
import {
  CREATE_COST,
  MAX_IMAGES,
  assignSlot,
  freeSlot,
  inSlotOrder,
  type ImageEdit,
  type SlotId,
  type WorldImage,
} from "./world-input";

type InputMode = "2d" | "text";

const modes: {
  id: InputMode;
  icon: IconName;
  title: string;
  desc: string;
}[] = [
  {
    id: "2d",
    icon: "input-2d",
    title: "2D Input",
    desc: "Add image(s) or a panorama to generate a world.",
  },
  {
    id: "text",
    icon: "input-text",
    title: "Text Input",
    desc: "Build an entire world in just a second by describing in words.",
  },
];

/** Ids only have to be unique within one composing session. */
let seq = 0;
const uid = () => `img-${(seq += 1)}`;

/**
 * START A NEW WORLD — the composer.
 *
 * Two ways in: photographs, or a sentence. Photographs are the richer path, so
 * they get the machinery — four faces of the world, and a studio behind each
 * thumbnail (see ImageStudioDialog) for erasing what shouldn't be generated and
 * labelling what should. Everything the user does here is still local: Create is
 * the moment any of it is handed over.
 */
export function CreateWorldModal({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [mode, setMode] = useState<InputMode>("2d");
  const [prompt, setPrompt] = useState("");
  const [images, setImages] = useState<WorldImage[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const is2d = mode === "2d";
  const strip = inSlotOrder(images);
  const full = images.length >= MAX_IMAGES;
  const editing = images.find((i) => i.id === editingId) ?? null;
  const canCreate = is2d
    ? images.length > 0 || prompt.trim().length > 0
    : prompt.trim().length > 0;

  function addFiles(files: FileList | null) {
    if (!files?.length) return;
    const all = Array.from(files);
    const pictures = all.filter((f) => f.type.startsWith("image/"));
    const taking = pictures.slice(0, MAX_IMAGES - images.length);
    // The object URLs are minted out here rather than inside the updater: the
    // updater has to stay pure, or a double-invoked render leaks one per file.
    const arriving = taking.map((file) => ({
      id: uid(),
      name: file.name,
      url: URL.createObjectURL(file),
    }));

    if (arriving.length) {
      setImages((prev) => {
        const next = [...prev];
        for (const { id, name, url } of arriving) {
          const slot = freeSlot(next);
          if (!slot) break;
          next.push({ id, name, src: url, slot, edit: null });
        }
        return next;
      });
    }

    // Say what was dropped on the floor, and why — silently ignoring half a
    // multi-select reads as a bug.
    const overflow = pictures.length - taking.length;
    const rejected = all.length - pictures.length;
    const parts: string[] = [];
    if (overflow) {
      parts.push(`${overflow} didn't fit — a world takes four images`);
    }
    if (rejected) {
      parts.push(
        `${rejected} ${rejected === 1 ? "file wasn't an image" : "files weren't images"}`
      );
    }
    setNotice(parts.length ? parts.join(" · ") : null);
    // Let the same file be chosen again after a remove.
    if (fileRef.current) fileRef.current.value = "";
  }

  function remove(id: string) {
    const gone = images.find((i) => i.id === id);
    if (gone) URL.revokeObjectURL(gone.src);
    setImages((prev) => prev.filter((i) => i.id !== id));
    setNotice(null);
  }

  function saveEdit(edit: ImageEdit) {
    setImages((prev) =>
      prev.map((i) => (i.id === editingId ? { ...i, edit } : i))
    );
    setEditingId(null);
  }

  function assign(id: string, slot: SlotId) {
    setImages((prev) => assignSlot(prev, id, slot));
  }

  /** Hand it over. The generated world opens in the editor. */
  function create() {
    if (!canCreate) return;
    for (const image of images) URL.revokeObjectURL(image.src);
    setImages([]);
    setPrompt("");
    setNotice(null);
    onOpenChange(false);
    window.location.hash = "#editor";
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          hideClose
          surface="glass"
          data-ui="glass-create-world"
          className="max-w-2xl p-4"
        >
          <DialogTitle className="sr-only">Start a new world</DialogTitle>
          <DialogDescription className="sr-only">
            Choose how you want to describe the world, then let Terra generate it.
          </DialogDescription>

          <div className="mb-1 flex justify-end">
            <DialogClose
              aria-label="Close"
              className="grid h-7 w-7 place-items-center rounded-md text-content-muted transition-colors hover:bg-glass/15 hover:text-content"
            >
              <Icon name="close" size={17} />
            </DialogClose>
          </div>

          {/* How the world gets described. Selection is FROST, not a colour fill
              — the glass direction's rule, and it reads on a tile this size
              without the orange claiming to be the primary action. */}
          <div className="grid grid-cols-2 gap-2">
            {modes.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => setMode(m.id)}
                aria-pressed={mode === m.id}
                className={cn(
                  "rounded-xl border p-3 text-left transition-colors",
                  mode === m.id
                    ? "border-glass/20 bg-glass/10"
                    : "border-transparent hover:bg-glass/5"
                )}
              >
                <div className="mb-1 flex items-center gap-2">
                  <Icon
                    name={m.icon}
                    size={18}
                    className={
                      mode === m.id ? "text-content" : "text-content-muted"
                    }
                  />
                  <span
                    className={cn(
                      "font-display text-sm font-semibold",
                      mode === m.id ? "text-content" : "text-content-muted"
                    )}
                  >
                    {m.title}
                  </span>
                </div>
                <p className="text-xs leading-snug text-content-muted">
                  {m.desc}
                </p>
              </button>
            ))}
          </div>

          {/* The prompt, and everything that rides along with it. A recess
              (`.field-well`) rather than another light sheet: inside glass, a
              lighter fill reads as a second pane stacked on the panel, and this
              is a place you type into. */}
          <div className="field-well mt-2.5 rounded-xl border p-3">
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Imagine a world…"
              autoFocus
              rows={is2d && strip.length > 0 ? 2 : 2}
              aria-label="Describe the world"
              className="w-full resize-none bg-transparent text-sm text-content outline-none placeholder:text-content-subtle"
            />

            <div className="mt-2.5 flex items-end gap-2.5">
              {is2d && strip.length > 0 && (
                <div className="flex min-w-0 flex-1 flex-wrap gap-2">
                  {strip.map((image) => (
                    <ImageSlotCard
                      key={image.id}
                      image={image}
                      images={images}
                      onAssign={(slot) => assign(image.id, slot)}
                      onEdit={() => setEditingId(image.id)}
                      onRemove={() => remove(image.id)}
                    />
                  ))}
                </div>
              )}

              <div className="ml-auto flex shrink-0 items-center gap-2.5">
                <button
                  type="button"
                  className="flex items-center gap-1.5 rounded-lg border border-glass/15 px-2.5 py-1.5 text-sm text-content-muted transition-colors hover:bg-glass/10 hover:text-content"
                >
                  <Icon name="tune" size={15} />
                  Terra 1.1
                  <Icon name="chevron-down" size={15} />
                </button>
                <Button variant="brand" disabled={!canCreate} onClick={create}>
                  Create
                  <span className="flex items-center gap-1">
                    <Icon name="credits" size={14} />
                    {CREATE_COST}
                  </span>
                </Button>
              </div>
            </div>
          </div>

          {/* Reference photos. Only the 2D path has any use for them. */}
          {is2d && (
            <>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                multiple
                className="sr-only"
                onChange={(e) => addFiles(e.target.files)}
              />
              <div
                role="button"
                tabIndex={full ? -1 : 0}
                aria-disabled={full}
                onClick={() => !full && fileRef.current?.click()}
                onKeyDown={(e) => {
                  if (full) return;
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    fileRef.current?.click();
                  }
                }}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  if (!full) addFiles(e.dataTransfer.files);
                }}
                className={cn(
                  "mt-2.5 flex flex-col items-center gap-1 rounded-xl border border-dashed border-glass/20 p-3 text-center transition-colors",
                  full
                    ? "opacity-60"
                    : "cursor-pointer hover:border-brand/60 hover:bg-glass/5"
                )}
              >
                <Icon name="input-2d" size={18} className="text-content-muted" />
                <p className="type-body text-content-muted">
                  {full
                    ? "All four faces filled — remove one to add another"
                    : "For best results, add image(s) or a panorama"}
                </p>
                <a
                  href="#"
                  onClick={(e) => e.stopPropagation()}
                  className="type-body-dense text-content-subtle underline"
                >
                  View our file guidelines
                </a>
              </div>
              {notice && (
                <p className="type-body mt-2 text-center text-warning">
                  {notice}
                </p>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>

      <ImageStudioDialog
        image={editing}
        onClose={() => setEditingId(null)}
        onSave={saveEdit}
      />
    </>
  );
}
