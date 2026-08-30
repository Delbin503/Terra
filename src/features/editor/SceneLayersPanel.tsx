import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { GlassPanel, GlassGhostButton } from "@/components/glass";
import { ContextMenu, IS_MAC, MOD, type MenuItem } from "./ContextMenu";
import { DockPanel } from "./panel-dock";
import { Button } from "@/components/ui";
import { Icon, type IconName } from "@/components/icons";
import { typeIcon, type AssetType } from "./assets-data";
import {
  ROLE_DOT,
  ROLE_LABEL,
  ROLE_TEXT,
  SOURCE_LABEL,
  canTakeRole,
  type ObjectRole,
  type SceneObject,
} from "./scene-types";
import {
  ancestorIds,
  buildTree,
  collapseRigs,
  filterTree,
  flattenTree,
  type TreeNode,
} from "./scene-tree";
import type { SceneApi } from "./useScene";

/**
 * SceneLayersPanel — everything in the scene, as a layer tree.
 *
 * This replaces the bottom tile grid. A grid answers "what does it look like",
 * which the viewport already answers better; a layers list answers "what is in
 * here, in what order, inside what" — the question you actually open the Scene
 * tool to ask. It docks left alongside the rail, matching the AI panel's
 * geometry, so the two rail tools read as the same kind of surface.
 *
 * WHY A TREE WHEN NOTHING NESTS YET. Grouping is coming. The row already
 * indents by depth, collapses, cascades hide/lock over its subtree and reveals
 * itself when a descendant is selected — all driven by `parentId` (see
 * scene-tree.ts). Shipping the flat version first would mean rewriting the row,
 * the search and the menu once groups exist.
 *
 * THE PANEL STAYS OPEN WHILE SELECTED. The old drawer unmounted the moment
 * something was selected, because it covered the viewport. This one doesn't
 * cover anything the selection chrome needs, and a layers panel that vanishes
 * when you select a layer can't be used to step between them.
 */

/** Every source type Terra places — the full type-filter vocabulary. */
const ALL_TYPES: AssetType[] = ["mesh", "skybox", "environment", "image", "video", "camera"];

/** Rows indent by this much per level. Deep enough to read as nesting, tight
 *  enough that a 300px panel still fits a name at depth 4. */
const INDENT = 14;


export function SceneLayersPanel({
  scene,
  onClose,
  onBrowseAssets,
  onViewInfo,
}: {
  scene: SceneApi;
  onClose: () => void;
  onBrowseAssets: () => void;
  /** open the right-docked details panel for the selected object */
  onViewInfo: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [types, setTypes] = useState<AssetType[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [typesOpen, setTypesOpen] = useState(false);
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  const [renaming, setRenaming] = useState<string | null>(null);
  /** `id: null` is the panel's own menu — right-clicked empty space. */
  const [menu, setMenu] = useState<{ id: string | null; x: number; y: number } | null>(null);
  /** header-only mode — the panel folded up out of the way */
  const [folded, setFolded] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const { objects, selectedId } = scene;


  const filtering = query.trim() !== "" || types.length > 0;

  const rows = useMemo(() => {
    // Rigs collapse to one row before the tree is built — see `collapseRigs`.
    const tree = filterTree(buildTree(collapseRigs(objects)), query, types);

    // While filtering, every surviving group is forced open — a match hidden
    // inside a collapsed row is a match the search failed to surface.
    return flattenTree(tree, collapsed, filtering);
  }, [objects, query, types, collapsed, filtering]);

  /** What the header badge counts — layers, not scene objects. */
  const layerCount = useMemo(() => collapseRigs(objects).length, [objects]);

  /** Rows nested under the selected group — tinted so a group's contents read
   *  as belonging to it, the way the reference shows a selected group block. */
  const branchIds = useMemo(() => {
    if (!selectedId) return new Set<string>();
    return new Set(
      objects.filter((o) => ancestorIds(objects, o.id).includes(selectedId)).map((o) => o.id)
    );
  }, [objects, selectedId]);

  // Selecting in the viewport has to reveal the row here, or the panel and the
  // scene disagree about what is selected.
  useEffect(() => {
    if (!selectedId) return;
    const chain = ancestorIds(objects, selectedId);
    if (chain.length === 0) return;
    setCollapsed((prev) => {
      if (!chain.some((id) => prev.has(id))) return prev;
      const next = new Set(prev);
      chain.forEach((id) => next.delete(id));
      return next;
    });
  }, [selectedId, objects]);

  useEffect(() => {
    if (searchOpen) searchRef.current?.focus();
  }, [searchOpen]);

  const toggleCollapsed = (id: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const closeSearch = () => {
    setQuery("");
    setTypes([]);
    setTypesOpen(false);
    setSearchOpen(false);
  };

  /* ------------------------------------------------------------ resizing */

  /* ------------------------------------------------------------ operations */

  const object = (id: string) => objects.find((o) => o.id === id) ?? null;

  const actions = {
    rename: (id: string) => setRenaming(id),
    viewInfo: (id: string) => {
      scene.select(id);
      onViewInfo(id);
    },
    copy: (id: string) => scene.copy(id),
    paste: () => scene.paste(),
    duplicate: (id: string) => scene.duplicate(id),
    toggleHidden: (id: string) => {
      const o = object(id);
      if (o) scene.setBranchFlag(id, "hidden", !o.hidden);
    },
    toggleLocked: (id: string) => {
      const o = object(id);
      if (o) scene.setBranchFlag(id, "locked", !o.locked);
    },
    /**
     * Toggle a role rather than only set it: picking the role an object already
     * has clears it back to none, so the same menu item both marks and unmarks
     * and there is no separate "clear role" row to hunt for.
     */
    setRole: (id: string, role: ObjectRole) => {
      const o = object(id);
      if (o) scene.setRole(id, o.role === role ? "none" : role);
    },
    ungroup: (id: string) => scene.ungroup(id),
    remove: (id: string) => scene.remove(id),
  };

  // The context menu advertises shortcuts, so they have to actually fire. Bound
  // at the window because the panel isn't focused while you work in the
  // viewport — and skipped whenever a text field owns the keystroke.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return;

      const mod = IS_MAC ? e.metaKey : e.ctrlKey;
      if (mod && e.key.toLowerCase() === "v") {
        if (!scene.canPaste) return;
        e.preventDefault();
        actions.paste();
        return;
      }
      if (!selectedId) return;

      if (mod && e.key.toLowerCase() === "c") {
        e.preventDefault();
        actions.copy(selectedId);
      } else if (mod && e.key.toLowerCase() === "d") {
        e.preventDefault();
        actions.duplicate(selectedId);
      } else if (mod && e.key.toLowerCase() === "m") {
        e.preventDefault();
        actions.setRole(selectedId, "master");
      } else if (e.key === "F2") {
        e.preventDefault();
        actions.rename(selectedId);
      } else if (e.shiftKey && e.key.toLowerCase() === "h") {
        e.preventDefault();
        actions.toggleHidden(selectedId);
      } else if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        actions.remove(selectedId);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, objects, scene.canPaste]);

  /* ---------------------------------------------------------------- render */

  return (
    <DockPanel
      ui="scene-layers"
      title="Layers"
      defaultHeight={300}
      collapsed={folded}
      onToggleCollapsed={() => setFolded((f) => !f)}
      onClose={onClose}
      /* The header has two shapes — title row and search row — so it replaces
         the shell's default rather than trying to squeeze a search field in
         beside a title that is not there while searching. */
      headerOverride={
        searchOpen ? (
          <div className="flex w-full items-center gap-1">
            <div className="field-well flex h-8 min-w-0 flex-1 items-center gap-2 rounded-lg border px-2.5 transition-colors focus-within:border-brand/50">
              <Icon name="search" size={14} className="shrink-0 text-content-subtle" />
              <input
                ref={searchRef}
                data-ui="scene-layers-search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Escape" && closeSearch()}
                placeholder="Find…"
                className="type-body min-w-0 flex-1 bg-transparent text-content outline-none placeholder:text-content-subtle focus-visible:ring-0 focus-visible:ring-offset-0"
              />
            </div>
            <TypeFilter
              options={ALL_TYPES}
              value={types}
              open={typesOpen}
              onOpenChange={setTypesOpen}
              onChange={setTypes}
            />
            <GlassGhostButton
              ui="scene-layers-search-close"
              size="sm"
              icon="close"
              label="Close search"
              onClick={closeSearch}
            />
          </div>
        ) : (
          <div className="flex w-full items-center gap-1">
            <h2 data-ui="scene-layers-title" className="type-panel-title min-w-0 flex-1 truncate text-content">
              Layers
            </h2>
            {/* Counts what the panel LISTS, so a collapsed camera rig doesn't
                make the badge disagree with the rows under it. */}
            <span className="type-caption shrink-0 px-1 text-content-subtle">
              {layerCount}
            </span>
            <GlassGhostButton
              ui="scene-layers-search-open"
              size="sm"
              icon="search"
              label="Search layers"
              onClick={() => setSearchOpen(true)}
            />
            {/* Fold, not close: the tree is a place you keep coming back to, so
                getting it out of the way shouldn't cost you the panel. */}
            <GlassGhostButton
              ui="scene-layers-fold"
              size="sm"
              icon="chevron-down"
              label={folded ? "Expand layers" : "Collapse layers"}
              onClick={() => setFolded((f) => !f)}
              className={cn("transition-transform", folded && "-rotate-90")}
            />
            <GlassGhostButton
              ui="scene-layers-close"
              size="sm"
              icon="close"
              label="Close layers"
              onClick={onClose}
            />
          </div>
        )
      }
    >
      {/* -------------------------------------------------------------- tree */}
      {/* `min-h-full` so the empty space under the last row is still part of the
          tree: right-clicking down there is how you reach Paste when the thing
          you want to paste next to isn't in the scene yet. */}
      <div
        className="min-h-full p-1.5"
        onContextMenu={(e) => {
          e.preventDefault();
          setMenu({ id: null, x: e.clientX, y: e.clientY });
        }}
      >
        {rows.length > 0 ? (
          <div role="tree" aria-label="Scene layers">
            {rows.map((node) => (
              <LayerRow
                key={node.object.id}
                node={node}
                selected={node.object.id === selectedId}
                inSelectedBranch={branchIds.has(node.object.id)}
                collapsed={collapsed.has(node.object.id)}
                renaming={renaming === node.object.id}
                onSelect={() => scene.select(node.object.id)}
                onStartRename={() => setRenaming(node.object.id)}
                onToggleCollapsed={() => toggleCollapsed(node.object.id)}
                onToggleHidden={() => actions.toggleHidden(node.object.id)}
                onToggleLocked={() => actions.toggleLocked(node.object.id)}
                onDelete={() => actions.remove(node.object.id)}
                onRename={(name) => {
                  const trimmed = name.trim();
                  if (trimmed) scene.update(node.object.id, { name: trimmed });
                  setRenaming(null);
                }}
                onCancelRename={() => setRenaming(null)}
                onContextMenu={(x, y) => {
                  scene.select(node.object.id);
                  setMenu({ id: node.object.id, x, y });
                }}
              />
            ))}
          </div>
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-3 px-4 py-6 text-center">
            <span className="grid h-12 w-12 place-items-center rounded-2xl bg-glass/10 text-content-subtle">
              <Icon name={filtering ? "search" : "scene"} size={22} />
            </span>
            <p className="type-body text-content-muted">
              {filtering
                ? "No layers match the current filters."
                : "Nothing in the scene yet. Drop an asset in to get started."}
            </p>
            <Button
              variant="secondary"
              size="sm"
              className="!rounded-full"
              onClick={() => (filtering ? closeSearch() : onBrowseAssets())}
            >
              {filtering ? "Clear filters" : "Browse assets"}
            </Button>
          </div>
        )}
      </div>

      {menu && (menu.id === null || object(menu.id)) && (
        <LayerContextMenu
          object={menu.id === null ? null : object(menu.id)}
          x={menu.x}
          y={menu.y}
          canPaste={scene.canPaste}
          onBrowseAssets={onBrowseAssets}
          onClose={() => setMenu(null)}
          actions={actions}
        />
      )}
    </DockPanel>
  );
}

/* -------------------------------------------------------------------- row */

/**
 * One layer. The eye and the lock only appear on hover — until they're ON, at
 * which point they stay visible, because a hidden object you can't see in the
 * viewport needs its reason showing in the list.
 */
function LayerRow({
  node,
  selected,
  inSelectedBranch,
  collapsed,
  renaming,
  onSelect,
  onStartRename,
  onToggleCollapsed,
  onToggleHidden,
  onToggleLocked,
  onDelete,
  onRename,
  onCancelRename,
  onContextMenu,
}: {
  node: TreeNode;
  selected: boolean;
  /** inside the selected group — tinted, so a group's contents read as its own */
  inSelectedBranch: boolean;
  collapsed: boolean;
  renaming: boolean;
  onSelect: () => void;
  onStartRename: () => void;
  onToggleCollapsed: () => void;
  onToggleHidden: () => void;
  onToggleLocked: () => void;
  onDelete: () => void;
  onRename: (name: string) => void;
  onCancelRename: () => void;
  onContextMenu: (x: number, y: number) => void;
}) {
  const o = node.object;
  /**
   * A CONTAINER, whether or not it currently contains anything.
   *
   * It used to be `children.length > 0`, which was the only test available while
   * nothing created groups: a row with children under it was a group by
   * definition. Now that grouping is real the two questions have come apart — an
   * emptied group is still a group, and it must keep its own icon and its own
   * disclosure slot rather than turning into a mesh row the moment its last
   * child is dragged out or deleted.
   */
  const isGroup = o.group === true || node.children.length > 0;
  const canOpen = node.children.length > 0;

  return (
    <div
      role="treeitem"
      aria-selected={selected}
      aria-expanded={canOpen ? !collapsed : undefined}
      data-ui={`scene-layer-${o.id}`}
      onClick={onSelect}
      /* Double-click renames — the gesture every layers panel uses, and the
         reason Rename leads the context menu rather than owning it. */
      onDoubleClick={(e) => {
        e.stopPropagation();
        onStartRename();
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onContextMenu(e.clientX, e.clientY);
      }}
      style={{ paddingLeft: 6 + node.depth * INDENT }}
      className={cn(
        "group/row flex h-8 cursor-default items-center gap-1.5 rounded-lg pr-1 transition-colors",
        selected
          ? "bg-brand/20 text-content"
          : inSelectedBranch
            ? "bg-brand/10 text-content-muted hover:bg-brand/15"
            : "text-content-muted hover:bg-glass/10 hover:text-content",
        o.hidden && "opacity-45"
      )}
    >
      {/* Disclosure — a fixed slot even when there's nothing to disclose, so
          names line up down the column instead of stepping in and out. */}
      {canOpen ? (
        <button
          type="button"
          aria-label={collapsed ? `Expand ${o.name}` : `Collapse ${o.name}`}
          onClick={(e) => {
            e.stopPropagation();
            onToggleCollapsed();
          }}
          className="grid h-4 w-4 shrink-0 place-items-center rounded text-content-subtle hover:text-content"
        >
          <Icon
            name="chevron-down"
            size={12}
            className={cn("transition-transform", collapsed && "-rotate-90")}
          />
        </button>
      ) : (
        <span aria-hidden className="h-4 w-4 shrink-0" />
      )}

      <Icon
        name={isGroup ? "group" : typeIcon[o.source]}
        size={13}
        className={cn("shrink-0", selected ? "text-content" : "text-content-subtle")}
      />

      {renaming ? (
        <RenameField initial={o.name} onCommit={onRename} onCancel={onCancelRename} />
      ) : (
        <span className="type-body min-w-0 flex-1 truncate">{o.name}</span>
      )}

      {/* THE ROLE BADGE.
          Master gets the CROWN, not a dot. Every other surface that names the
          master uses that glyph — the object title, the role menu, TerraGen's
          object list — and this row was the one place it appeared as an
          anonymous coloured dot, indistinguishable at a glance from the two
          other role dots beside it. Master is also the role you scan a scene
          for: there is exactly one, and "which of these is the hero" is the
          question the list gets asked.

          The other two roles keep the dot. They have no glyph of their own, and
          the dot's hue is the colour the object outlines with in the viewport,
          so the two readings agree. */}
      {o.role !== "none" && !renaming && (
        <span
          data-ui={`layer-role-${o.role}`}
          title={ROLE_LABEL[o.role]}
          className={cn(
            "grid shrink-0 place-items-center",
            o.role === "master" ? ROLE_TEXT.master : ""
          )}
        >
          {o.role === "master" ? (
            <Icon name="master" size={12} />
          ) : (
            <span className={cn("block h-2 w-2 rounded-full border", ROLE_DOT[o.role])} />
          )}
        </span>
      )}

      {/* THE ACTIONS TAKE NO ROOM UNTIL THEY ARE WANTED.
          They were always laid out and merely transparent, which kept the row
          from reflowing under the cursor — but it also parked the role badge
          three invisible buttons in from the right edge, floating in the middle
          of the row with nothing between it and the margin. Collapsing the
          strip puts the badge where a badge belongs, hard against the edge, and
          hovering slides it left to open the space.

          THE WIDTH IS ON THE STRIP, NOT ON EACH BUTTON. The row is a flex line
          with a gap, and a zero-width child still earns its gap — three of them
          would hold 18px open and leave the badge short of the edge anyway.
          One collapsing container has one gap.

          Pinned stays pinned. A locked or hidden object keeps the strip open,
          because the whole point of those two icons staying lit is that a row
          you can't move or can't see says so without being pointed at. Inside
          an open strip the individual buttons keep their own reveal, so the
          eye still shows alone while the lock and the bin wait for the
          cursor. */}
      {!renaming && (
        <div
          className={cn(
            "flex shrink-0 items-center gap-1.5 overflow-hidden transition-[width] duration-200 ease-out",
            o.locked || o.hidden
              ? "w-[4.5rem]"
              : "w-0 focus-within:w-[4.5rem] group-hover/row:w-[4.5rem]"
          )}
        >
          <RowToggle
            icon={o.locked ? "lock" : "unlock"}
            label={o.locked ? `Unlock ${o.name}` : `Lock ${o.name}`}
            active={!!o.locked}
            onClick={onToggleLocked}
          />
          <RowToggle
            icon={o.hidden ? "hidden" : "visible"}
            label={o.hidden ? `Show ${o.name}` : `Hide ${o.name}`}
            active={!!o.hidden}
            onClick={onToggleHidden}
          />
          {/* Last in the row, and never pinned open the way lock and eye are
              when they're ON. The two toggles are states you want to keep
              seeing; this one only ever needs to be reachable, and a delete
              button sitting permanently a few pixels from a lock button is a
              mis-click waiting to happen. */}
          <RowToggle
            icon="trash"
            label={`Delete ${o.name}`}
            active={false}
            danger
            onClick={onDelete}
          />
        </div>
      )}
    </div>
  );
}

/** Eye / lock. `active` pins it visible; otherwise it's revealed by row hover. */
function RowToggle({
  icon,
  label,
  active,
  danger,
  onClick,
}: {
  icon: IconName;
  label: string;
  active: boolean;
  /** destructive — reads red on hover so it can't be mistaken for a toggle */
  danger?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={active}
      data-ui={`scene-layer-${icon}`}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={cn(
        "grid h-5 w-5 shrink-0 place-items-center rounded text-content-subtle transition-colors",
        danger ? "hover:bg-danger/20 hover:text-danger" : "hover:bg-glass/20 hover:text-content",
        active
          ? "opacity-100"
          : "opacity-0 focus-visible:opacity-100 group-hover/row:opacity-100"
      )}
    >
      <Icon name={icon} size={12} />
    </button>
  );
}

/** Inline rename. Commits on Enter or blur, reverts on Escape. */
function RenameField({
  initial,
  onCommit,
  onCancel,
}: {
  initial: string;
  onCommit: (name: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(initial);
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    ref.current?.select();
  }, []);

  return (
    <input
      ref={ref}
      data-ui="scene-layer-rename"
      value={value}
      autoFocus
      onChange={(e) => setValue(e.target.value)}
      onClick={(e) => e.stopPropagation()}
      onBlur={() => onCommit(value)}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Enter") onCommit(value);
        if (e.key === "Escape") onCancel();
      }}
      className="type-body min-w-0 flex-1 rounded border border-brand/60 bg-canvas/60 px-1 text-content outline-none focus-visible:ring-0 focus-visible:ring-offset-0"
    />
  );
}

/* ----------------------------------------------------------- context menu */

/**
 * The row's right-click menu — the object operations that have nowhere else to
 * live. The menu CHROME is `ContextMenu`, shared with the viewport's marquee
 * menu; what is left here is the item list, which is the only part that is
 * actually about layers.
 */
function LayerContextMenu({
  object,
  x,
  y,
  canPaste,
  onBrowseAssets,
  onClose,
  actions,
}: {
  /** null when the empty space below the tree was right-clicked */
  object: SceneObject | null;
  x: number;
  y: number;
  canPaste: boolean;
  onBrowseAssets: () => void;
  onClose: () => void;
  actions: {
    rename: (id: string) => void;
    viewInfo: (id: string) => void;
    copy: (id: string) => void;
    paste: () => void;
    duplicate: (id: string) => void;
    toggleHidden: (id: string) => void;
    toggleLocked: (id: string) => void;
    setRole: (id: string, role: ObjectRole) => void;
    ungroup: (id: string) => void;
    remove: (id: string) => void;
  };
}) {
  /**
   * Right-clicking the empty tree offers only what makes sense with nothing
   * under the cursor. Showing the full list scoped to whatever happened to be
   * selected would be a menu that acts on something you can't see from where
   * you clicked.
   */
  const items: MenuItem[] =
    object === null
      ? ([
          {
            icon: "paste",
            label: "Paste Object",
            shortcut: `${MOD}V`,
            run: () => actions.paste(),
            disabled: !canPaste,
          },
          { icon: "assets", label: "Browse Assets", run: onBrowseAssets },
        ] as MenuItem[])
      : buildItems(object);

  function buildItems(o: SceneObject): MenuItem[] {
    const id = o.id;
    const noun = o.group ? "Group" : "Object";
    return [
      { icon: "edit", label: "Rename", shortcut: "F2", run: () => actions.rename(id) },
      // A group has no asset behind it — no file, no format, no tags — so there
      // is no info panel for the ⓘ to open.
      ...(o.group
        ? []
        : ([
            { icon: "info", label: "View Info", shortcut: "I", run: () => actions.viewInfo(id) },
          ] as MenuItem[])),
      { icon: "copy", label: `Copy ${noun}`, shortcut: `${MOD}C`, run: () => actions.copy(id) },
      {
        icon: "paste",
        label: "Paste Object",
        shortcut: `${MOD}V`,
        run: () => actions.paste(),
        disabled: !canPaste,
      },
      {
        icon: "duplicate",
        label: `Duplicate ${noun}`,
        shortcut: `${MOD}D`,
        run: () => actions.duplicate(id),
      },
      // Ungroup sits with the other structural operations rather than beside
      // Delete: dissolving a group keeps everything that was in it, and a row
      // next to the red one reads like it destroys something.
      ...(o.group
        ? ([
            {
              icon: "ungroup",
              label: "Ungroup",
              shortcut: `⇧${MOD}G`,
              run: () => actions.ungroup(id),
            },
          ] as MenuItem[])
        : []),
      {
        icon: o.hidden ? "visible" : "hidden",
        label: o.hidden ? `Show ${noun}` : `Hide ${noun}`,
        shortcut: "⇧H",
        run: () => actions.toggleHidden(id),
      },
      {
        icon: o.locked ? "unlock" : "lock",
        label: o.locked ? `Unlock ${noun}` : `Lock ${noun}`,
        run: () => actions.toggleLocked(id),
      },
      // Master only. Distractor and Background are set where they're reasoned
      // about — the role step in the Work Order, where you're deciding what the
      // dataset contains — and three role rows made this menu long enough that
      // the operations people actually right-click for were below the fold.
      // Cameras and HDRIs are skipped entirely: neither can take a role.
      // A GROUP CAN. The rig frames whatever the master is, and a group's
      // position is the centre of what it holds, so "these eleven crates are the
      // subject" is a sentence the capture plan can actually execute.
      ...(canTakeRole(o.source)
        ? ([
            {
              icon: "master",
              label: `${o.role === "master" ? "Unmark" : "Mark"} as Master ${noun}`,
              shortcut: `${MOD}M`,
              run: () => actions.setRole(id, "master"),
            },
          ] as MenuItem[])
        : []),
      {
        icon: "trash",
        label: `Delete ${noun}`,
        shortcut: IS_MAC ? "⌫" : "Del",
        run: () => actions.remove(id),
        danger: true,
      },
    ];
  }

  return (
    <ContextMenu
      ui="scene-layer-menu"
      title={object?.group ? "Group" : "Setting"}
      items={items}
      x={x}
      y={y}
      onClose={onClose}
    />
  );
}

/* ------------------------------------------------------------ type filter */

/** Note 2's filter: the same type vocabulary the old drawer offered, moved onto
 *  the search row's filter icon. */
function TypeFilter({
  options,
  value,
  open,
  onOpenChange,
  onChange,
}: {
  options: AssetType[];
  value: AssetType[];
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onChange: (v: AssetType[]) => void;
}) {
  const toggle = (t: AssetType) =>
    onChange(value.includes(t) ? value.filter((x) => x !== t) : [...value, t]);

  return (
    <div className="relative shrink-0">
      <button
        type="button"
        data-ui="scene-layers-types"
        aria-label="Filter by type"
        title="Filter by type"
        onClick={() => onOpenChange(!open)}
        className={cn(
          "relative grid h-8 w-8 place-items-center rounded-lg transition-colors",
          value.length > 0
            ? "bg-brand/20 text-brand"
            : "text-content-muted hover:bg-glass/15 hover:text-content"
        )}
      >
        <Icon name="filter" size={15} />
        {value.length > 0 && (
          <span className="type-caption-strong absolute -right-0.5 -top-0.5 grid h-3.5 min-w-[14px] place-items-center rounded-full bg-brand px-0.5 text-brand-foreground">
            {value.length}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => onOpenChange(false)} aria-hidden />
          <GlassPanel
            ui="scene-layers-type-menu"
            thickness="overlay"
            className="absolute right-0 top-[calc(100%+6px)] z-50 w-52 !rounded-2xl p-1.5"
          >
            {options.map((t) => (
              <button
                key={t}
                type="button"
                data-ui={`scene-layers-type-${t}`}
                onClick={() => toggle(t)}
                className="type-body flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-content-muted transition-colors hover:bg-glass/10 hover:text-content"
              >
                <span
                  className={cn(
                    "grid h-4 w-4 shrink-0 place-items-center rounded border",
                    value.includes(t) ? "border-brand bg-brand text-brand-foreground" : "border-glass/25"
                  )}
                >
                  {value.includes(t) && <Icon name="check" size={11} strokeWidth={3} />}
                </span>
                <Icon name={typeIcon[t]} size={14} className="shrink-0" />
                <span className="truncate">{SOURCE_LABEL[t]}</span>
              </button>
            ))}
            {value.length > 0 && (
              <button
                type="button"
                onClick={() => onChange([])}
                className="type-body mt-1 flex w-full items-center gap-2.5 border-t border-glass/10 px-2.5 pb-1 pt-2 text-brand"
              >
                Clear types
              </button>
            )}
          </GlassPanel>
        </>
      )}
    </div>
  );
}
