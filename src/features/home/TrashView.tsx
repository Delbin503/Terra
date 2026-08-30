import { useMemo, useState, type MouseEvent } from "react";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/icons";
import { Button, ConfirmDialog, ContextMenu, Segmented, type MenuItem } from "@/components/ui";
import { HomeTopBar } from "./HomeTopBar";
import { WorldThumb } from "./WorldThumb";
import { CARD_SIZE, LAYOUTS, type Layout } from "./shelves";
import { useWorkspace, type TrashEntry } from "./workspace";

/** Restore, or end it. Nothing else can be done to something already deleted. */
const TRASH_MENU: MenuItem[] = [
  { id: "restore", label: "Restore", icon: "retry" },
  { id: "delete", label: "Delete forever", icon: "trash", danger: true, separated: true },
];

/**
 * The two kinds of thing that can be in here.
 *
 * NO "ALL". A project and a folder are recovered for different reasons and are
 * drawn as different objects — one cover against a 2×2 mosaic — so a mixed
 * grid was two shelves interleaved, and the tab that produced it was the one
 * nobody could act from. Projects opens first because it is what gets thrown
 * away most.
 */
type TrashTab = "project" | "folder";

const TRASH_TABS: { value: TrashTab; label: string }[] = [
  { value: "project", label: "Projects" },
  { value: "folder", label: "Folders" },
];

/**
 * TRASH — what Projects threw away, and the two ways out of it.
 *
 * SPLIT BY KIND, because the two kinds are recovered for different reasons. A
 * project is one piece of work you want back; a folder is a place, and getting
 * it back means getting everything that was filed in it back too. Mixed into
 * one grid the distinction was a small badge on a cover, which is not enough
 * when the question is "did my whole folder go, or just the one project?".
 * The filter is the same segmented control the Projects shelf uses, because it
 * is the same act — narrowing a shelf by what the thing is.
 *
 * Deleting for good is the only destructive act in this app that isn't undoable,
 * so it asks, and for a folder it says how much work goes with it.
 */
export function TrashView({
  onHome,
  onChat,
  onPricing,
}: {
  onHome: () => void;
  /** opens Terra AI from this page's top bar */
  onChat: () => void;
  /** the plans page, from this page's top bar */
  onPricing: () => void;
}) {
  const { trash, restore, deleteForever, emptyTrash } = useWorkspace();
  const [tab, setTab] = useState<TrashTab>("project");
  /* The same two controls the Projects shelf carries, from the same constants:
     this is that shelf, holding what was taken off it. */
  const [layout, setLayout] = useState<Layout>("grid");
  const [cardSize, setCardSize] = useState(CARD_SIZE.initial);
  const [menu, setMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  /** the entry a permanent delete is waiting on */
  const [pending, setPending] = useState<TrashEntry | null>(null);
  const [emptying, setEmptying] = useState(false);

  const shown = useMemo(() => trash.filter((t) => t.kind === tab), [trash, tab]);

  /** How much work a folder is holding — the number both dialogs need. */
  const inside = pending?.projects?.length ?? 0;

  return (
    <>
      <HomeTopBar
        onChat={onChat}
        onPricing={onPricing}
        breadcrumb={
          <nav aria-label="Breadcrumb" className="type-body flex items-center gap-2">
            <button
              type="button"
              onClick={onHome}
              className="text-content-subtle transition-colors hover:text-content"
            >
              Home
            </button>
            <span aria-hidden className="text-content-subtle">
              /
            </span>
            <span className="text-content-muted">Trash</span>
          </nav>
        }
      />

      <section className="mt-6 pb-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="font-display text-lg font-semibold tracking-tight">Trash</h1>
            <p className="type-body mt-0.5 text-content-subtle">
              {trash.length
                ? `${trash.length} ${trash.length === 1 ? "item" : "items"} · right-click one to restore it or delete it for good`
                : "Nothing here."}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            <Segmented
              ariaLabel="Filter by what it is"
              options={TRASH_TABS}
              value={tab}
              onChange={setTab}
            />

            {/* Only the grid has a size to change, so the control isn't there
                when the list is showing — same rule as the Projects shelf. */}
            {layout === "grid" && (
              <input
                type="range"
                min={CARD_SIZE.min}
                max={CARD_SIZE.max}
                step={CARD_SIZE.step}
                value={cardSize}
                onChange={(e) => setCardSize(Number(e.target.value))}
                aria-label="Card size"
                title="Card size"
                className="h-1 w-[92px] shrink-0 cursor-pointer accent-brand"
              />
            )}

            <Segmented
              ariaLabel="Layout"
              iconOnly
              options={LAYOUTS}
              value={layout}
              onChange={setLayout}
            />

            {trash.length > 0 && (
              <Button variant="secondary" size="sm" onClick={() => setEmptying(true)}>
                <Icon name="trash" size={15} />
                Empty Trash
              </Button>
            )}
          </div>
        </div>

        <div className="mt-5">
          {shown.length ? (
            /* THE SHELF IT CAME OFF, at the size and shape you left it in.
               Finding the right thing among a dozen similarly-named deletions
               is browsing, and the cover is what tells them apart — so Trash
               gets the grid, the rows, and the slider that Projects has rather
               than a fixed list of plates. */
            <div
              className={cn(
                layout === "grid"
                  ? "grid gap-5"
                  : "grid grid-cols-1 gap-x-6 gap-y-1.5 md:grid-cols-2"
              )}
              style={
                layout === "grid"
                  ? { gridTemplateColumns: `repeat(auto-fill, minmax(${cardSize}px, 1fr))` }
                  : undefined
              }
            >
              {shown.map((entry) => {
                const Card = layout === "grid" ? TrashCard : TrashRow;
                return (
                  <Card
                    key={entry.id}
                    entry={entry}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      setMenu({ id: entry.id, x: e.clientX, y: e.clientY });
                    }}
                  />
                );
              })}
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-glass/15 py-16 text-center">
              <Icon
                name={tab === "folder" ? "folder" : "file"}
                size={20}
                className="text-content-subtle"
              />
              <p className="type-body text-content-muted">
                {trash.length
                  ? `No deleted ${tab === "folder" ? "folders" : "projects"} — the other tab has what's here.`
                  : "Trash is empty. Anything you remove from Projects lands here first."}
              </p>
            </div>
          )}
        </div>
      </section>

      {menu && (
        <ContextMenu
          at={menu}
          items={TRASH_MENU}
          onSelect={(action) => {
            const entry = trash.find((t) => t.id === menu.id);
            setMenu(null);
            if (!entry) return;
            if (action === "restore") restore(entry.id);
            if (action === "delete") setPending(entry);
          }}
          onClose={() => setMenu(null)}
        />
      )}

      {/* DELETING FOR GOOD IS THE ONE IRREVERSIBLE ACT IN THIS APP, so it is
          the one that gets a typed word. The old inline two-tap armed a red
          button on the row and disarmed itself after four seconds — which made
          the safety a race against a timer. */}
      <ConfirmDialog
        open={!!pending}
        onOpenChange={(o) => !o && setPending(null)}
        title={`Delete “${pending?.name ?? ""}” for good?`}
        body={
          pending?.kind === "folder"
            ? `This cannot be undone. The folder${
                inside
                  ? ` and the ${inside} ${inside === 1 ? "project" : "projects"} inside it are`
                  : " is"
              } removed permanently, with every generated dataset. Restore it first if you want any of it back.`
            : "This cannot be undone. The project and its generated datasets are removed permanently."
        }
        confirmLabel="Delete forever"
        confirmWord="DELETE"
        onConfirm={() => {
          if (pending) deleteForever(pending.id);
          setPending(null);
        }}
      />

      <ConfirmDialog
        open={emptying}
        onOpenChange={setEmptying}
        title={`Empty Trash?`}
        body={`All ${trash.length} ${trash.length === 1 ? "item" : "items"} are deleted permanently. This cannot be undone.`}
        confirmLabel="Empty Trash"
        confirmWord="DELETE"
        onConfirm={() => {
          emptyTrash();
          setEmptying(false);
        }}
      />
    </>
  );
}

/**
 * WHAT THE THING LOOKED LIKE ON THE SHELF.
 *
 * A trashed folder was drawn as a single cover — its first project's thumbnail —
 * which made it indistinguishable from a trashed project except for a small
 * badge in the corner. A folder is a 2×2 mosaic everywhere else in this app
 * (see FolderCard) precisely because that shape says "several things" at a
 * glance, and Trash is the screen where telling the two apart matters most:
 * restoring one brings back one project, restoring the other brings back four.
 *
 * Dimmed, and it stays dimmed on hover: this is not live work, and a cover that
 * brightened under the cursor would invite a click that has nowhere to go.
 */
function TrashCover({ entry, plate }: { entry: TrashEntry; plate?: boolean }) {
  const dim = "opacity-55 saturate-[0.6] transition-opacity group-hover:opacity-75";

  if (entry.kind === "folder") {
    const cells = Array.from({ length: 4 }, (_, i) => entry.folder?.seeds[i]);
    return (
      <div
        className={cn(
          "relative overflow-hidden glass-thin",
          plate ? "!rounded-lg p-1" : "!rounded-xl p-1.5"
        )}
      >
        <div className={cn("grid grid-cols-2", plate ? "gap-1" : "gap-1.5", dim)}>
          {cells.map((seed, i) => (
            <span
              key={i}
              className={cn(
                "block aspect-[16/11] overflow-hidden",
                plate ? "rounded-[3px]" : "rounded-md",
                seed === undefined && "bg-glass/20"
              )}
            >
              {seed !== undefined && <WorldThumb seed={seed} />}
            </span>
          ))}
        </div>
        <KindMark kind="folder" plate={plate} />
      </div>
    );
  }

  return (
    <div
      className={cn(
        "relative overflow-hidden border border-glass/10",
        plate ? "rounded-lg" : "rounded-xl"
      )}
    >
      <div className={cn("aspect-[16/11]", dim)}>
        {entry.project ? (
          <WorldThumb seed={entry.project.seed} />
        ) : (
          <span className="grid h-full w-full place-items-center bg-glass/20 text-content-subtle">
            <Icon name="file" size={22} />
          </span>
        )}
      </div>
      <KindMark kind="project" plate={plate} />
    </div>
  );
}

/** Says which shelf it came off, for anyone arriving on a filtered tab. */
function KindMark({ kind, plate }: { kind: "project" | "folder"; plate?: boolean }) {
  if (plate) return null;
  return (
    <span className="type-caption-strong pointer-events-none absolute left-2.5 top-2.5 flex items-center gap-1 rounded-md bg-black/60 px-1.5 py-0.5 text-content backdrop-blur-sm">
      <Icon name={kind === "project" ? "file" : "folder"} size={11} />
      {kind === "project" ? "Project" : "Folder"}
    </span>
  );
}

/** When it went, and what comes back with it. */
function TrashMeta({ entry }: { entry: TrashEntry }) {
  const inside = entry.projects?.length ?? 0;
  return (
    <p className="type-caption mt-0.5 text-content-subtle">
      Deleted {entry.at}
      {inside > 0 && ` · ${inside} ${inside === 1 ? "project" : "projects"} inside`}
    </p>
  );
}

/**
 * One deleted thing, as a cover.
 *
 * NO BUTTONS ON IT. Restore and Delete forever used to sit on every row, which
 * put an irreversible action permanently under the cursor on a page whose whole
 * population is things you already discarded once. They move to the context
 * menu: right-click is where destructive per-item actions live everywhere else
 * in this app (see the Projects shelf), so this is the same gesture rather than
 * a new one, and the hint under the grid says so for anyone who doesn't know.
 */
function TrashCard({
  entry,
  onContextMenu,
}: {
  entry: TrashEntry;
  onContextMenu: (e: MouseEvent) => void;
}) {
  return (
    <div
      data-ui={`trash-card-${entry.id}`}
      onContextMenu={onContextMenu}
      className="group relative cursor-context-menu text-left"
    >
      <TrashCover entry={entry} />

      <div className="mt-2 flex items-baseline gap-3">
        <span className="type-body-strong min-w-0 flex-1 truncate text-content">
          {entry.name}
        </span>
      </div>
      <TrashMeta entry={entry} />
    </div>
  );
}

/** The same thing as a row, at the shape ProjectRow and FolderRow use. */
function TrashRow({
  entry,
  onContextMenu,
}: {
  entry: TrashEntry;
  onContextMenu: (e: MouseEvent) => void;
}) {
  return (
    <div
      data-ui={`trash-row-${entry.id}`}
      onContextMenu={onContextMenu}
      className="group relative flex cursor-context-menu items-center gap-3.5 rounded-xl p-2 text-left transition-colors hover:bg-surface"
    >
      <div className={cn("shrink-0", entry.kind === "folder" ? "w-[92px]" : "w-[128px]")}>
        <TrashCover entry={entry} plate />
      </div>

      <div className="min-w-0 flex-1">
        <span className="type-body-strong block truncate text-content">{entry.name}</span>
        <TrashMeta entry={entry} />
      </div>

      <span className="type-caption-strong shrink-0 rounded-md bg-glass/15 px-2 py-1 text-content-muted">
        {entry.kind === "project" ? "Project" : "Folder"}
      </span>
    </div>
  );
}
