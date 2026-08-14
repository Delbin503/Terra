import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { GlassPanel, GlassGhostButton } from "@/components/glass";
import { DockPanel } from "./panel-dock";
import { Button } from "@/components/ui";
import { Icon, type IconName } from "@/components/icons";
import { typeIcon, type AssetType } from "./assets-data";
import {
  ROLE_DOT,
  ROLE_LABEL,
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
const ALL_TYPES: AssetType[] = ["mesh", "image", "environment", "video", "camera"];

/** Rows indent by this much per level. Deep enough to read as nesting, tight
 *  enough that a 300px panel still fits a name at depth 4. */
const INDENT = 14;

/** The editor's content line and bottom gutter — see EditorView's rail comment. */
const IS_MAC =
  typeof navigator !== "undefined" && /Mac|iPhone|iPad|iPod/.test(navigator.userAgent);
const MOD = IS_MAC ? "⌘" : "Ctrl+";

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
  const [menu, setMenu] = useState<{ id: string; x: number; y: number } | null>(null);
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
      <div className="p-1.5">
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

      {menu && object(menu.id) && (
        <LayerContextMenu
          object={object(menu.id)!}
          x={menu.x}
          y={menu.y}
          canPaste={scene.canPaste}
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
  onRename: (name: string) => void;
  onCancelRename: () => void;
  onContextMenu: (x: number, y: number) => void;
}) {
  const o = node.object;
  const isGroup = node.children.length > 0;

  return (
    <div
      role="treeitem"
      aria-selected={selected}
      aria-expanded={isGroup ? !collapsed : undefined}
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
      {isGroup ? (
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

      {/* The role badge is a dot in the role's own colour — at this row height
          a word doesn't fit, and the dot is the same hue the object outlines
          with in the viewport, so the two readings agree. */}
      {o.role !== "none" && !renaming && (
        <span
          data-ui={`layer-role-${o.role}`}
          className={cn("h-2 w-2 shrink-0 rounded-full border", ROLE_DOT[o.role])}
          title={ROLE_LABEL[o.role]}
        />
      )}

      {!renaming && (
        <>
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
        </>
      )}
    </div>
  );
}

/** Eye / lock. `active` pins it visible; otherwise it's revealed by row hover. */
function RowToggle({
  icon,
  label,
  active,
  onClick,
}: {
  icon: IconName;
  label: string;
  active: boolean;
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
        "grid h-5 w-5 shrink-0 place-items-center rounded text-content-subtle transition-colors hover:bg-glass/20 hover:text-content",
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

interface MenuItem {
  icon: IconName;
  label: string;
  shortcut: string;
  run: () => void;
  disabled?: boolean;
  danger?: boolean;
}

/**
 * The row's right-click menu — the object operations that have nowhere else to
 * live. Rendered fixed at the cursor and clamped to the viewport so a row near
 * the bottom of the panel doesn't open a menu off-screen.
 */
function LayerContextMenu({
  object,
  x,
  y,
  canPaste,
  onClose,
  actions,
}: {
  object: SceneObject;
  x: number;
  y: number;
  canPaste: boolean;
  onClose: () => void;
  actions: {
    rename: (id: string) => void;
    viewInfo: (id: string) => void;
    copy: (id: string) => void;
    paste: () => void;
    duplicate: (id: string) => void;
    toggleHidden: (id: string) => void;
    setRole: (id: string, role: ObjectRole) => void;
    remove: (id: string) => void;
  };
}) {
  const id = object.id;
  const items: MenuItem[] = [
    { icon: "edit", label: "Rename", shortcut: "F2", run: () => actions.rename(id) },
    { icon: "info", label: "View Info", shortcut: "I", run: () => actions.viewInfo(id) },
    { icon: "copy", label: "Copy Object", shortcut: `${MOD}C`, run: () => actions.copy(id) },
    {
      icon: "paste",
      label: "Paste Object",
      shortcut: `${MOD}V`,
      run: () => actions.paste(),
      disabled: !canPaste,
    },
    {
      icon: "duplicate",
      label: "Duplicate Object",
      shortcut: `${MOD}D`,
      run: () => actions.duplicate(id),
    },
    {
      icon: object.hidden ? "visible" : "hidden",
      label: object.hidden ? "Show Object" : "Hide Object",
      shortcut: "⇧H",
      run: () => actions.toggleHidden(id),
    },
    // One row per content role. They read as three items rather than a
    // submenu because the menu has no submenu machinery, and because picking a
    // role is a single decision — burying three mutually exclusive options one
    // level down would cost a hover to answer "what is this object?".
    // Cameras and HDRIs are skipped entirely: neither can take a role.
    ...(canTakeRole(object.source)
      ? ([
          {
            icon: "master",
            label: `${object.role === "master" ? "Unmark" : "Mark"} as Master Object`,
            shortcut: `${MOD}M`,
            run: () => actions.setRole(id, "master"),
          },
          {
            icon: "input-3d",
            label: `${object.role === "distractor" ? "Unmark" : "Mark"} as Distractor`,
            run: () => actions.setRole(id, "distractor"),
          },
          {
            icon: "input-3d",
            label: `${object.role === "background" ? "Unmark" : "Mark"} as Background Object`,
            run: () => actions.setRole(id, "background"),
          },
        ] as MenuItem[])
      : []),
    {
      icon: "trash",
      label: "Delete Object",
      shortcut: IS_MAC ? "⌫" : "Del",
      run: () => actions.remove(id),
      danger: true,
    },
  ];

  // Height tracks the row count so the clamp doesn't reserve space that isn't
  // used — the same approach as the asset card's ⋮ menu.
  const height = items.length * 34 + 20;
  const left = Math.min(Math.max(x, 8), window.innerWidth - 248);
  const top = Math.min(Math.max(y, 8), window.innerHeight - height - 8);

  return (
    <>
      <div className="pointer-events-auto fixed inset-0 z-40" onClick={onClose} onContextMenu={(e) => { e.preventDefault(); onClose(); }} />
      <GlassPanel
        ui="scene-layer-menu"
        thickness="overlay"
        role="menu"
        style={{ left, top }}
        className="pointer-events-auto fixed z-50 w-60 !rounded-2xl p-1.5"
      >
        <p className="type-eyebrow truncate px-2.5 pb-1.5 pt-1 text-content-subtle">Setting</p>
        {items.map((it) => (
          <button
            key={it.label}
            type="button"
            role="menuitem"
            disabled={it.disabled}
            data-ui={`scene-layer-action-${it.label.toLowerCase().replace(/\s+/g, "-")}`}
            onClick={() => {
              it.run();
              onClose();
            }}
            className={cn(
              "type-body flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 transition-colors disabled:opacity-35 disabled:hover:bg-transparent",
              it.danger
                ? "mt-1 border-t border-glass/10 pt-2 text-danger hover:bg-danger/10"
                : "text-content-muted hover:bg-glass/10 hover:text-content"
            )}
          >
            <Icon name={it.icon} size={15} className="shrink-0" />
            <span className="min-w-0 flex-1 truncate text-left">{it.label}</span>
            <kbd className="type-caption shrink-0 font-sans text-content-subtle">{it.shortcut}</kbd>
          </button>
        ))}
      </GlassPanel>
    </>
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
