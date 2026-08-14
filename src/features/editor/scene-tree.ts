import { SOURCE_LABEL, type SceneObject } from "./scene-types";
import type { AssetType } from "./assets-data";

/**
 * SCENE TREE
 * ------------------------------------------------------------------
 * The layers panel renders a tree, not a list. Today every object is a root —
 * nothing sets `parentId` yet — but grouping is coming, and the difference
 * between "a list that will later need nesting" and "a tree that currently
 * happens to be one level deep" is the whole cost of that change. So the panel
 * consumes this module rather than `objects` directly, and grouping ships as a
 * write to `parentId` plus a menu item.
 *
 * Three things live here because all three have to agree about what a subtree
 * is: building it, filtering it, and flattening it back down for render.
 */

export interface TreeNode {
  object: SceneObject;
  /** 0 for a root; each nested level adds one indent step in the panel. */
  depth: number;
  children: TreeNode[];
}

/**
 * Collapse each capture rig to a single entry.
 *
 * A rig's two cameras are one object as far as the user is concerned — they
 * move together, they're deleted together, and every capture setting belongs to
 * the pair rather than to either one. Listing both invites treating them as
 * independent layers, which they aren't; the start camera stands for the rig,
 * and which end you're editing is picked inside the camera's own settings.
 *
 * Filtering happens downstream of this, so a search never resurrects the end
 * camera as a separate row.
 */
export function collapseRigs(objects: SceneObject[]): SceneObject[] {
  return objects.filter((o) => !(o.rigId && o.cameraRole === "end"));
}

/**
 * Nest a flat object list by `parentId`.
 *
 * An object whose parent is missing (deleted group, filtered-out reference)
 * is promoted to a root rather than dropped — a layers panel that silently
 * hides objects is worse than one that shows them at the wrong depth, because
 * the object is still in the scene and still needs a way to be reached.
 *
 * Sibling order follows scene order, so the tree matches the order things were
 * placed in the viewport.
 */
export function buildTree(objects: SceneObject[]): TreeNode[] {
  const byId = new Map(objects.map((o) => [o.id, o]));
  const nodes = new Map<string, TreeNode>(
    objects.map((o) => [o.id, { object: o, depth: 0, children: [] }])
  );

  const roots: TreeNode[] = [];
  for (const o of objects) {
    const node = nodes.get(o.id)!;
    const parent = o.parentId && byId.has(o.parentId) ? nodes.get(o.parentId) : undefined;
    // A cycle would otherwise recurse forever in `setDepth` below.
    if (parent && !isAncestor(nodes, o.id, o.parentId!)) parent.children.push(node);
    else roots.push(node);
  }

  const setDepth = (list: TreeNode[], depth: number) => {
    for (const n of list) {
      n.depth = depth;
      setDepth(n.children, depth + 1);
    }
  };
  setDepth(roots, 0);
  return roots;
}

/** Would making `candidate` the parent of `id` close a loop? */
function isAncestor(nodes: Map<string, TreeNode>, id: string, candidate: string): boolean {
  let cur: string | undefined = candidate;
  const seen = new Set<string>();
  while (cur && !seen.has(cur)) {
    if (cur === id) return true;
    seen.add(cur);
    cur = nodes.get(cur)?.object.parentId;
  }
  return false;
}

/** Does this one object match the search box and the type filter? */
function matches(o: SceneObject, query: string, types: AssetType[]): boolean {
  if (types.length > 0 && !types.includes(o.source)) return false;
  if (query === "") return true;
  return (
    o.name.toLowerCase().includes(query) || SOURCE_LABEL[o.source].toLowerCase().includes(query)
  );
}

/**
 * Filter the tree without breaking it.
 *
 * A hit deep in a group is useless if the group above it disappears, so an
 * ancestor is kept whenever a descendant matches. And a group that matches on
 * its own name keeps its whole subtree — searching "rig" should show you what
 * is in the rig, not an empty folder.
 */
export function filterTree(nodes: TreeNode[], rawQuery: string, types: AssetType[]): TreeNode[] {
  const query = rawQuery.trim().toLowerCase();
  if (query === "" && types.length === 0) return nodes;

  const walk = (list: TreeNode[]): TreeNode[] =>
    list.flatMap((n) => {
      if (matches(n.object, query, types)) return [n];
      const children = walk(n.children);
      return children.length > 0 ? [{ ...n, children }] : [];
    });

  return walk(nodes);
}

/**
 * Depth-first render order, skipping the children of collapsed groups.
 *
 * `forceOpen` is what makes search feel right: while filtering, every surviving
 * group is expanded regardless of how the user left it, so matches aren't
 * hidden behind a collapsed row — and their own expand/collapse state is
 * untouched, so it comes back when the search is cleared.
 */
export function flattenTree(
  nodes: TreeNode[],
  collapsed: ReadonlySet<string>,
  forceOpen = false
): TreeNode[] {
  const out: TreeNode[] = [];
  const walk = (list: TreeNode[]) => {
    for (const n of list) {
      out.push(n);
      if (n.children.length === 0) continue;
      if (forceOpen || !collapsed.has(n.object.id)) walk(n.children);
    }
  };
  walk(nodes);
  return out;
}

/** An object plus everything nested under it — what delete and hide act on. */
export function subtreeIds(objects: SceneObject[], id: string): string[] {
  const childrenOf = new Map<string, string[]>();
  for (const o of objects) {
    if (!o.parentId) continue;
    const list = childrenOf.get(o.parentId);
    if (list) list.push(o.id);
    else childrenOf.set(o.parentId, [o.id]);
  }

  const out: string[] = [];
  const stack = [id];
  const seen = new Set<string>();
  while (stack.length > 0) {
    const cur = stack.pop()!;
    if (seen.has(cur)) continue;
    seen.add(cur);
    out.push(cur);
    stack.push(...(childrenOf.get(cur) ?? []));
  }
  return out;
}

/** The chain of group ids above an object — used to reveal it when selected. */
export function ancestorIds(objects: SceneObject[], id: string): string[] {
  const byId = new Map(objects.map((o) => [o.id, o]));
  const out: string[] = [];
  const seen = new Set<string>([id]);
  let cur = byId.get(id)?.parentId;
  while (cur && !seen.has(cur)) {
    out.push(cur);
    seen.add(cur);
    cur = byId.get(cur)?.parentId;
  }
  return out;
}
