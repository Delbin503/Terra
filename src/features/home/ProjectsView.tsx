import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { Icon, type IconName } from "@/components/icons";
import { Button, ContextMenu, Segmented, type MenuItem } from "@/components/ui";
import { HomeTopBar } from "./HomeTopBar";
import { ProjectCard, ProjectRow } from "./ProjectCard";
import { FolderCard } from "./FolderCard";
import { MoveDialog, type MoveRequest } from "./MoveDialog";
import { initialScope, shelfSpec, type Scope, type Shelf } from "./shelves";
import { useWorkspace } from "./workspace";
import type { Folder, Project } from "./data";

/**
 * PROJECTS — everything the workspace has made, under three shelves.
 *
 * One page, not three: All Projects, Folders and Favourites differ only in what
 * they list, so they share the toolbar, the layout switch and the search box.
 * Which shelf is showing is the app rail's business (it lists them under
 * Projects), which is why `shelf` arrives as a prop — a second rail on the page
 * repeated the same question and cost the covers the width they need.
 *
 * Opening a folder stays on this page too: it is this shelf, scoped.
 */

type Layout = "grid" | "list";

const LAYOUTS: { value: Layout; label: string; icon: IconName }[] = [
  { value: "grid", label: "Grid", icon: "grid" },
  { value: "list", label: "List", icon: "list" },
];

const matches = (name: string, query: string) =>
  name.toLowerCase().includes(query.trim().toLowerCase());

/**
 * Card-size range, as the minimum width a column may be. The initial value is
 * chosen so a full-width window lands on the four-up grid the design shows —
 * the slider is for going denser or bigger than that, not for finding it.
 */
const SIZE = { min: 170, max: 380, step: 10, initial: 300 };

/** Where the right-click menu was opened, and on what. */
interface MenuAt {
  kind: "project" | "folder";
  id: string;
  x: number;
  y: number;
}

const MOVE_TARGETS: MenuItem[] = [
  { id: "move-folder", label: "Move to Folder", icon: "folder" },
  { id: "move-org", label: "Move to Organization", icon: "organization" },
];

/**
 * A project's menu and a folder's menu differ, because the things differ: only
 * a project can be kept, and a folder has nowhere to be filed except an
 * organization — this data has no folders inside folders.
 */
function projectMenu(kept: boolean): MenuItem[] {
  return [
    {
      id: "favourite",
      label: kept ? "Remove from Your Favourites" : "Add to Your Favourites",
      icon: "favourite",
    },
    { id: "rename", label: "Rename", icon: "edit", separated: true },
    { id: "copy-link", label: "Copy Link", icon: "link" },
    { id: "move", label: "Move", icon: "move-to", items: MOVE_TARGETS },
    { id: "trash", label: "Move to Trash", icon: "trash", danger: true },
  ];
}

const FOLDER_MENU: MenuItem[] = [
  { id: "copy-link", label: "Copy Link", icon: "link" },
  {
    id: "move",
    label: "Move",
    icon: "move-to",
    items: [MOVE_TARGETS[1]],
  },
  { id: "rename", label: "Rename", icon: "edit" },
  { id: "trash", label: "Move to Trash", icon: "trash", danger: true },
];

export function ProjectsView({
  shelf,
  onShelf,
  onHome,
  onChat,
  onCreateProject,
  onOpenProject,
}: {
  shelf: Shelf;
  onShelf: (shelf: Shelf) => void;
  onHome: () => void;
  /** opens Terra AI from this page's top bar */
  onChat: () => void;
  /** the composer — "New Project" is the same act as Create on the home page */
  onCreateProject: () => void;
  onOpenProject: (project: Project) => void;
}) {
  const [scope, setScope] = useState<Scope>(() => initialScope(shelf));
  const [layout, setLayout] = useState<Layout>("grid");
  const [query, setQuery] = useState("");
  const [openFolderId, setOpenFolderId] = useState<string | null>(null);
  const [naming, setNaming] = useState(false);
  const [draftName, setDraftName] = useState("");
  /** the narrowest a card may be — the slider writes this, the grid reads it */
  const [cardSize, setCardSize] = useState(SIZE.initial);
  const [menu, setMenu] = useState<MenuAt | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [move, setMove] = useState<MoveRequest | null>(null);
  const [note, setNote] = useState<string | null>(null);

  // The work itself belongs to the workspace, not to this screen: Trash has to
  // show what was thrown away here, and the notification list what happened.
  const {
    projects,
    folders,
    addFolder,
    rename: renameItem,
    toggleFavourite,
    moveToFolder,
    moveToOrganization,
    trashItem,
  } = useWorkspace();

  const spec = shelfSpec(shelf);
  const openFolder = folders.find((f) => f.id === openFolderId) ?? null;

  /* A new shelf is a new question: its own filter, and none of the last one's
     scoping. The rail switches shelves, so this is where that lands. */
  useEffect(() => {
    setScope(initialScope(shelf));
    setOpenFolderId(null);
    setNaming(false);
    setQuery("");
    setRenamingId(null);
  }, [shelf]);

  /* Confirmations speak once and go. */
  useEffect(() => {
    if (!note) return;
    const t = window.setTimeout(() => setNote(null), 2600);
    return () => window.clearTimeout(t);
  }, [note]);

  const toggleProject = (id: string) => toggleFavourite("project", id);
  const toggleFolder = (id: string) => toggleFavourite("folder", id);

  function createFolder() {
    const name = draftName.trim();
    if (!name) return;
    addFolder(name);
    setDraftName("");
    setNaming(false);
  }

  const named = (at: MenuAt) =>
    at.kind === "project"
      ? (projects.find((p) => p.id === at.id)?.name ?? "project")
      : (folders.find((f) => f.id === at.id)?.name ?? "folder");

  function rename(at: MenuAt, name: string) {
    renameItem(at.kind, at.id, name);
    setRenamingId(null);
  }

  async function copyLink(at: MenuAt) {
    const url = `${window.location.origin}/#${at.kind}/${at.id}`;
    try {
      await navigator.clipboard.writeText(url);
      setNote("Link copied to clipboard");
    } catch {
      // Denied clipboard permission is the user's call, not a failure to hide.
      setNote("Couldn't copy the link — clipboard access was blocked");
    }
  }

  function trash(at: MenuAt) {
    const name = named(at);
    trashItem(at.kind, at.id);
    if (at.kind === "folder" && openFolderId === at.id) setOpenFolderId(null);
    setNote(`“${name}” moved to Trash — find it under Trash`);
  }

  function applyMove(target: string) {
    if (!move) return;
    if (move.mode === "folder") {
      moveToFolder(move.id, target);
      const folderName = folders.find((f) => f.id === target)?.name ?? target;
      setNote(`“${move.name}” moved to “${folderName}”`);
    } else {
      moveToOrganization(move.kind, move.id, target);
      setNote(`“${move.name}” moved to ${target}`);
    }
    setMove(null);
  }

  function onMenuSelect(at: MenuAt, action: string) {
    switch (action) {
      case "favourite":
        if (at.kind === "project") toggleProject(at.id);
        else toggleFolder(at.id);
        break;
      case "rename":
        setRenamingId(at.id);
        break;
      case "copy-link":
        void copyLink(at);
        break;
      case "move-folder":
      case "move-org":
        setMove({
          kind: at.kind,
          id: at.id,
          name: named(at),
          mode: action === "move-folder" ? "folder" : "organization",
          currentId:
            action === "move-folder"
              ? projects.find((p) => p.id === at.id)?.folderId
              : at.kind === "folder"
                ? folders.find((f) => f.id === at.id)?.owner
                : projects.find((p) => p.id === at.id)?.owner,
        });
        break;
      default:
        trash(at);
    }
  }

  /** Right-click opens the menu where the pointer is, on the thing under it. */
  const openMenu = (kind: MenuAt["kind"], id: string) => (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setMenu({ kind, id, x: e.clientX, y: e.clientY });
  };

  /** Cards size themselves from the slider rather than a column count. */
  const gridStyle = {
    gridTemplateColumns: `repeat(auto-fill, minmax(${cardSize}px, 1fr))`,
  };

  /* What this shelf is actually showing. */
  const shownProjects = useMemo(() => {
    let list = projects;
    if (openFolder) list = list.filter((p) => p.folderId === openFolder.id);
    else if (shelf === "favourites") list = list.filter((p) => p.favourite);
    else if (scope === "shared") list = list.filter((p) => p.shared);
    return list.filter((p) => matches(p.name, query));
  }, [projects, openFolder, shelf, scope, query]);

  const shownFolders = useMemo(() => {
    let list = folders;
    if (shelf === "favourites") list = list.filter((f) => f.favourite);
    else if (scope === "shared") list = list.filter((f) => f.shared);
    return list.filter((f) => matches(f.name, query));
  }, [folders, shelf, scope, query]);

  /** Folders are the body on the Folders shelf, and on Favourites when asked. */
  const showingFolders =
    !openFolder &&
    (shelf === "folders" || (shelf === "favourites" && scope === "folders"));

  return (
    <>
      <HomeTopBar
        onChat={onChat}
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
            <button
              type="button"
              onClick={() => onShelf("all")}
              className={cn(
                "transition-colors hover:text-content",
                openFolder ? "text-content-subtle" : "text-content-muted"
              )}
            >
              Projects
            </button>
            {openFolder && (
              <>
                <span aria-hidden className="text-content-subtle">
                  /
                </span>
                <button
                  type="button"
                  onClick={() => setOpenFolderId(null)}
                  className="text-content-muted transition-colors hover:text-content"
                >
                  {shelfSpec("folders").label}
                </button>
              </>
            )}
          </nav>
        }
      />

      <section className="mt-6 pb-8">
        {openFolder && (
          <button
            type="button"
            onClick={() => setOpenFolderId(null)}
            className="type-body mb-2.5 flex items-center gap-1.5 text-content-muted transition-colors hover:text-content"
          >
            <Icon name="chevron-left" size={16} />
            Back
          </button>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3">
          {openFolder ? (
            <FolderTitle
              folder={openFolder}
              folders={folders}
              onPick={setOpenFolderId}
            />
          ) : (
            <h1 className="font-display text-lg font-semibold tracking-tight">
              {spec.label}
            </h1>
          )}

          <div className="flex min-w-0 flex-wrap items-center gap-2.5">
            <label className="flex h-9 w-full min-w-[11rem] flex-1 items-center gap-2 glass-thin !rounded-lg px-3 sm:w-[300px] sm:flex-none">
              <Icon name="search" size={16} className="shrink-0 text-content-subtle" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={openFolder ? "Search project" : spec.searchLabel}
                aria-label={openFolder ? "Search project" : spec.searchLabel}
                className="type-body min-w-0 flex-1 bg-transparent text-content outline-none placeholder:text-content-subtle"
              />
              {/* The design's filter glyph. It labels the field's scope rather
                  than opening anything — the filter flow isn't designed yet. */}
              <Icon
                name="filter"
                size={16}
                aria-hidden
                className="shrink-0 text-content-subtle"
              />
            </label>

            {/* A folder is already a scope, so it carries no second filter. */}
            {!openFolder && (
              <Segmented
                ariaLabel={shelf === "favourites" ? "Show" : "Filter by who can see it"}
                options={spec.scopes}
                value={scope}
                onChange={setScope}
              />
            )}

            {/* Card size. Only the grid has a size to change, so the control
                isn't there when the list is showing. */}
            {layout === "grid" && (
              <input
                type="range"
                min={SIZE.min}
                max={SIZE.max}
                step={SIZE.step}
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

            <Button
              variant="brand"
              size="sm"
              onClick={() => {
                if (openFolder || spec.action.label === "New Project") {
                  onCreateProject();
                  return;
                }
                setNaming(true);
              }}
            >
              <Icon name={openFolder ? "file" : spec.action.icon} size={15} />
              {openFolder ? "New Project" : spec.action.label}
            </Button>
          </div>
        </div>

        {naming && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              createFolder();
            }}
            className="mt-4 flex flex-wrap items-center gap-2 glass-thin !rounded-lg p-2"
          >
            <Icon name="folder-add" size={16} className="ml-1.5 text-content-muted" />
            <input
              autoFocus
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              placeholder="Folder name"
              aria-label="Folder name"
              className="type-body h-8 min-w-0 flex-1 bg-transparent text-content outline-none placeholder:text-content-subtle"
            />
            <Button variant="ghost" size="sm" type="button" onClick={() => setNaming(false)}>
              Cancel
            </Button>
            <Button variant="brand" size="sm" type="submit" disabled={!draftName.trim()}>
              Create folder
            </Button>
          </form>
        )}

        <div className="mt-5">
          {showingFolders ? (
            shownFolders.length ? (
              <div
                className={cn("grid gap-5", layout === "list" && "xl:grid-cols-2")}
                style={layout === "grid" ? gridStyle : undefined}
              >
                {shownFolders.map((folder) => (
                  <FolderCard
                    key={folder.id}
                    folder={folder}
                    onOpen={() => setOpenFolderId(folder.id)}
                    onFavourite={() => toggleFolder(folder.id)}
                    onContextMenu={openMenu("folder", folder.id)}
                    renaming={renamingId === folder.id}
                    onRename={(name) =>
                      rename({ kind: "folder", id: folder.id, x: 0, y: 0 }, name)
                    }
                    onRenameCancel={() => setRenamingId(null)}
                  />
                ))}
              </div>
            ) : (
              <Empty
                icon="folder"
                text={
                  query
                    ? `No folder matches “${query}”.`
                    : shelf === "favourites"
                      ? "No folders kept yet — use the heart on a folder to keep it."
                      : "No shared folders yet."
                }
              />
            )
          ) : shownProjects.length ? (
            layout === "grid" ? (
              <div className="grid gap-5" style={gridStyle}>
                {shownProjects.map((project) => (
                  <ProjectCard
                    key={project.id}
                    project={project}
                    onOpen={() => onOpenProject(project)}
                    onFavourite={() => toggleProject(project.id)}
                    onContextMenu={openMenu("project", project.id)}
                    renaming={renamingId === project.id}
                    onRename={(name) =>
                      rename({ kind: "project", id: project.id, x: 0, y: 0 }, name)
                    }
                    onRenameCancel={() => setRenamingId(null)}
                  />
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-x-6 gap-y-1.5 xl:grid-cols-2">
                {shownProjects.map((project) => (
                  <ProjectRow
                    key={project.id}
                    project={project}
                    onOpen={() => onOpenProject(project)}
                    onFavourite={() => toggleProject(project.id)}
                    onContextMenu={openMenu("project", project.id)}
                    renaming={renamingId === project.id}
                    onRename={(name) =>
                      rename({ kind: "project", id: project.id, x: 0, y: 0 }, name)
                    }
                    onRenameCancel={() => setRenamingId(null)}
                  />
                ))}
              </div>
            )
          ) : (
            <Empty
              icon="file"
              text={
                query
                  ? `No project matches “${query}”.`
                  : openFolder
                    ? "This folder is empty."
                    : shelf === "favourites"
                      ? "No projects kept yet — use the heart on a cover to keep it."
                      : "No shared projects yet."
              }
            />
          )}
        </div>
      </section>

      {menu && (
        <ContextMenu
          at={menu}
          items={
            menu.kind === "project"
              ? projectMenu(
                  Boolean(projects.find((p) => p.id === menu.id)?.favourite)
                )
              : FOLDER_MENU
          }
          onSelect={(action) => onMenuSelect(menu, action)}
          onClose={() => setMenu(null)}
        />
      )}

      <MoveDialog
        request={move}
        folders={folders}
        onClose={() => setMove(null)}
        onMove={applyMove}
        onCreateFolder={addFolder}
      />

      {note && (
        <p
          role="status"
          className="type-body fixed bottom-6 left-1/2 z-50 -translate-x-1/2 glass-overlay !rounded-lg px-3.5 py-2 text-content"
        >
          {note}
        </p>
      )}
    </>
  );
}

/**
 * The open folder's name, and a way out of it. The chevron switches folders
 * rather than opening an actions menu: in a scoped shelf the question the title
 * answers is "which one am I in", so the useful thing it can offer is the others.
 */
function FolderTitle({
  folder,
  folders,
  onPick,
}: {
  folder: Folder;
  folders: Folder[];
  onPick: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 font-display text-lg font-semibold tracking-tight transition-colors hover:text-brand"
      >
        {folder.name}
        <Icon name="chevron-down" size={17} className="text-content-muted" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
          <div
            role="menu"
            className="absolute left-0 top-[calc(100%+8px)] z-30 max-h-[18rem] w-[14rem] overflow-y-auto glass-overlay !rounded-lg p-1"
          >
            {folders.map((f) => (
              <button
                key={f.id}
                type="button"
                role="menuitemradio"
                aria-checked={f.id === folder.id}
                onClick={() => {
                  onPick(f.id);
                  setOpen(false);
                }}
                className={cn(
                  "type-body-dense flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors",
                  f.id === folder.id
                    ? "text-brand"
                    : "text-content-muted hover:bg-glass/15 hover:text-content"
                )}
              >
                <Icon
                  name="check"
                  size={13}
                  className={f.id === folder.id ? "" : "invisible"}
                />
                <span className="flex-1 truncate">{f.name}</span>
                <span className="type-caption text-content-subtle">
                  {f.seeds.length}
                </span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function Empty({ icon, text }: { icon: IconName; text: string }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-glass/15 py-14 text-center">
      <Icon name={icon} size={20} className="text-content-subtle" />
      <p className="type-body text-content-muted">{text}</p>
    </div>
  );
}
