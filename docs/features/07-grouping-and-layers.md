# 7. Object Grouping and the Layers Panel

**Source files:** `scene-tree.ts` (build / filter / flatten the tree, `ancestorIds`, `subtreeIds`) · `group-transform.ts` (what moving a container does to its contents — no React) · `useScene.ts` (`group`, `ungroup`, the cascade inside `update`) · `SceneLayersPanel.tsx` (the panel, rows, search, context menu) · `SceneCanvas.tsx` (`pick`, `GroupGizmo`, focus framing) · `MarqueeSelect.tsx` (Shift-drag box select) · `ObjectTitle.tsx` (the in-scene label and its group badge) · `EditorView.tsx` (the selection bar, `groupMarquee`, the shortcuts) · `scene-types.ts` (`group`, `parentId`, `makeGroup`, `isContentObject`)

---

## 1. What a group is

A group is **a scene object like any other**, with one extra flag:

```
SceneObject {
  …
  group?: true          // this object is a container
  parentId?: string     // the container it sits inside — what the tree nests on
}
```

It is deliberately *not* a fourth kind of scene entity. `parentId` has to point at something; the layers tree already nests on it; and every operation a group needs — rename, delete, copy, transform, hide, lock — already exists for objects. A separate `groups: SceneGroup[]` list would have meant teaching all of that a second vocabulary.

Two consequences worth holding on to:

- **A group draws nothing.** `SceneWorld` filters containers out of the render, so there is no box, no wireframe, no mesh. The only way to reach a group in the viewport is through something it holds — which is what §4 is about.
- **Its transform is real.** Position is where the group *is* (the centre of what it holds when it was made), and moving, turning or scaling it carries its contents.

A group's `objectTypeLabel` is **"Group"**, not an asset source — it didn't come from a file, it came from a selection.

---

## 2. Making a group

### Step by step

1. **Hold Shift and drag a box** across the viewport. Shift arms marquee select and suspends orbit for the duration; the viewport says so while the key is held. A drag shorter than 6px counts as a Shift-click, not a box.
2. Release. Everything caught is selected, and a glass bar appears at the bottom centre: **"N objects selected"**, with a **Group** button and a ✕ to clear.
3. Press **Group** — or **⌘G / Ctrl+G**, or right-click the selection and choose **Group N Objects**.
4. The container is created, named **Group 1**, **Group 2**, … and **selected**. Rename it by double-clicking its row in the Layers panel, or F2.

The number counts the groups that **exist**, not the times you have grouped — so deleting "Group 2" and grouping again gives you a new "Group 2" rather than skipping to "Group 3".

### What the box catches

| Included | Excluded |
|---|---|
| Meshes, images, videos placed in the scene | **Cameras** — a rig is one instrument with a capture plan attached, not furniture |
| Whole groups, when anything inside them is caught | **Environment and skybox** — the world, not things in it |
| | **Hidden objects** — a selection you can't see is one you can't check |

**A box selects roots, not parts.** Candidates are the top of each tree, and a group counts as caught when anything it holds is caught. That matters because a group's origin is the centre of its bounding box — for a horseshoe of chairs, a point in mid-air with nothing at it, which a box drawn over the chairs would miss.

An empty box is a deselect, the same as clicking empty space.

### What actually happens on group

| Rule | Why |
|---|---|
| **Nothing moves.** | Grouping is a statement about what belongs together. A gesture that rearranged the scene as a side effect of naming part of it would be the worst possible way to find out what grouping does. |
| **The group stands at the centre** of the box the selection occupies (`centreOf`). | It needs a position to be moved from, and the centre is the only one that isn't arbitrary. |
| **Only the top of each subtree joins.** | Selecting a chair *and* the group it is already in would otherwise pull the chair out of that group and into the new one — the selection would lose a level of the very structure being built. The chair's existing parent carries it along instead. |
| **A shared parent is inherited.** | Grouping two chairs that both sit in "Dining set" nests the new group *inside* Dining set rather than pulling them out to the root. Only when all members shared one parent. |
| **Camera rigs are skipped.** | Both cameras are one instrument, and a group is not where a capture plan lives. |
| **Fewer than two members → nothing happens.** | `group()` returns `null`. A container around one object is a rename with extra steps. |

---

## 3. What a group does when you edit it

A group is selectable, and selecting one gives it the same chrome any object gets: the bottom toolbar, the Object / Texture tabs, the properties panel, and a gizmo.

**The gizmo is a proxy.** `TransformControls` needs an `Object3D` and a group has no mesh, so `GroupGizmo` drives an invisible proxy standing at the group's centre and writes each step of the drag back through `scene.update`. All three modes mean something — move the set, turn the set, scale the set — and the Object tab's three rows arm them exactly as they do for a mesh.

**Only two kinds of edit cascade:**

| Edit | Reaches the contents? |
|---|---|
| **Transform** — position, rotation, scale | **Yes.** `group-transform.ts` recovers the delta by comparing the group before and after, then re-places every descendant. |
| **Material** — colour, metallic, roughness, specular, normal | **Yes.** A texture set on the group paints everything in it. |
| Rename, lock, hide, role, description | **No.** They stop at the container — which is the whole point of having one. |

**Children keep world-space positions.** Nothing else in the editor has a parent transform: the gizmo, the containment clamp, the arrangement solver and the capture rig all read `object.position` as where the thing actually *is*. So a group edit resolves to a flat write on each descendant rather than introducing a parent chain everything else would have to learn to walk.

The cascade lives inside `scene.update`, not in a separate `updateGroup`, because everything that can move an object funnels through that one function — the gizmo, the numeric rows, the layers tree, an undo. A group whose contents only followed along on *some* of those routes would be a group that quietly came apart.

**Selecting a group frames what it holds.** A group's own scale is 1 until somebody changes it, so the ordinary focus radius would fly the camera to within a metre of the centre of a twelve-metre set and frame the empty air between the objects. `radiusOf` measures the contents instead.

---

## 4. Clicking: when you get the group and when you get the child

This is the part worth reading twice, because the viewport and the Layers panel deliberately answer it **differently**.

### In the viewport — a click walks *down* the chain

A group draws nothing, so the only way to reach one in the viewport is through something it holds. If every such click landed on the individual object, a group could only ever be moved as a unit by finding its row in the layers tree — grouping things would make them *harder* to handle, not easier.

So clicking builds the chain from the outermost container down to the object under the cursor, and selects **one step further down it than whatever you are already holding**:

```
Building  ▸  Room  ▸  Chair            ← the chain under the cursor
   1st        2nd      3rd  click
```

| You are holding | You click a chair inside Room, inside Building | You get |
|---|---|---|
| nothing | | **Building** — the outermost container |
| Building | | **Room** |
| Room | | **Chair** |
| Chair | | **Chair** (the chain bottoms out) |

**Clicking empty space drops out of the chain entirely** (`onPointerMissed`), so the next click starts at the outermost group again.

**A sibling does not cost a second click.** Once something inside a group is held, that group counts as *open*: clicking a different object in it lands on that object directly rather than bouncing back to the container. Otherwise adjusting six chairs in a room would take twelve clicks, half of them re-selecting a room you are plainly already working inside.

When you're holding something in a *different* branch, the deepest group the two chains share decides where the click lands — so a click inside a nested room doesn't jump back out to the building.

**What you see while a group is selected:** the group's contents all wear the selected outline (`litIds`), which is the only visual a container has.

### In the Layers panel — a row is exactly one object

Row clicks are **not** routed through that rule. The tree already draws the hierarchy, so a row names precisely one thing: clicking a nested child there selects **that child**, not the box around it. Clicking a group row selects the group.

That is the escape hatch when the walk-down rule isn't what you want — one click in the tree reaches any depth directly.

### The group badge — knowing where you are, and getting back out

A group draws nothing, so a chair you had walked down into used to look exactly like a chair that was never grouped: nothing on screen said which container you were inside, and the only way to find out was the layers tree.

**A selected child's label now carries a `Part of {group}` badge.** It sits in the meta row under the name, and it is **last** — the row runs outward from the object itself:

```
[ 3D Model ]   [ Master Object ]   [ ⛶ Part of Dining Set ]
   what it is      what it does        what it's inside
```

The two pills that describe the object stay adjacent, and the one that points somewhere else ends the line, where a link belongs.

**Pressing it selects the group.** This is the one gesture in the scene that goes *up*: a viewport click only ever walks down a chain (above), so without it, leaving a group meant **Back**-then-reselect, or finding the row in the tree. Hovering says *"Select {group}"* rather than restating the label, because a badge is not obviously a control.

Detail worth knowing:

| | |
|---|---|
| **Which group** | The **immediate** parent only. A deep nest would put three ancestors in the row; the chain reads from the tree. |
| **Colour** | Neutral, unlike the brand-orange type badge and the coloured role badges. Those answer *what is this thing*; this answers *what is it inside of* — context, not identity. |
| **Long names** | Truncated with an ellipsis inside the pill; the full name is in the tooltip. The row wraps rather than overflowing, so a grouped master shows type + role on one line and the group badge on the next. |
| **Where it doesn't appear** | Anything with no parent group, and the Space (volume) title, which shares this component. |

---

## 5. The Layers panel

### How to access it

Click **Scene objects** — the leftmost button in the top-centre tool panel. The panel opens in the right-hand dock. It is a separate switch from the AI tools, so opening the library or a generate panel can't close it, and **it stays open while something is selected**: a layers panel that vanishes when you select a layer can't be used to step between them.

### The header

Title, a count of **layers** (rigs count once), then search, fold and close. Fold and close are separate on purpose — the tree is somewhere you keep coming back to, so getting it out of the way shouldn't cost you the panel.

Clicking search swaps the whole header for a search row: a **Find…** field, a **type filter** (3D Mesh, Image, Environment, Video, Camera) and a close button. **While filtering, every surviving group is forced open** — a match hidden inside a collapsed row is a match the search failed to surface. Escape closes search and clears both filters.

### A row, left to right

| Element | Notes |
|---|---|
| **Chevron** | Only when the row has children. Otherwise a fixed empty slot, so names line up down the column instead of stepping in and out. |
| **Type icon** | The group icon for a container, the source icon otherwise. |
| **Name** | Double-click to rename in place — Enter saves, Escape cancels. |
| **Role badge** | The master wears the **crown**, the same glyph every other surface uses for it. Other roles keep a coloured dot, matching the viewport outline. |
| **Lock** | Still selectable and inspectable, just not draggable. |
| **Eye** | Hide. |

Lock and eye appear on hover, but once **on** they stay visible — a hidden object you can't see in the viewport needs its reason showing in the list. Both **cascade over the whole subtree**: a flag is a statement about a branch, not a row, and a visible child inside a hidden group would make the group's closed eye a lie.

Rows indent 14px per level — deep enough to read as nesting, tight enough that a 300px panel still fits a name at depth 4.

### Group rows specifically

- **A row is a container if `group: true`** — *not* if it merely has children. An emptied group is still a group and keeps its own icon and disclosure slot rather than turning into a mesh row the moment its last child is deleted.
- The chevron only appears when there is actually something to disclose.
- **The selected group's whole branch is tinted**, so its contents read as belonging to it.
- **Selecting in the viewport reveals the row here** — every collapsed ancestor of the selection is expanded, or the panel and the scene would disagree about what is selected.
- **A camera rig collapses to one row.** The start camera stands for the pair; which end you're editing is chosen inside the camera's own settings. Filtering happens downstream of the collapse, so a search can never resurrect the end camera as a separate row.
- **An orphan is promoted, not dropped.** An object whose parent is missing shows at the root: a layers panel that silently hides objects is worse than one that shows them at the wrong depth, because the object is still in the scene and still needs a way to be reached.

### The right-click menu

| Item | Shortcut | Notes |
|---|---|---|
| Rename | F2 | |
| View Info | I | **Not shown for a group** — no asset behind it, so no file, format or tags to open |
| Copy Object / Copy Group | ⌘C | |
| Paste Object | ⌘V | Disabled when the clipboard is empty |
| Duplicate Object / Duplicate Group | ⌘D | |
| **Ungroup** | ⇧⌘G | **Groups only.** Sits with the structural operations rather than beside Delete — dissolving a group keeps everything in it, and a row next to the red one reads like it destroys something |
| Show / Hide | ⇧H | |
| Lock / Unlock | — | |
| Mark / Unmark as Master | ⌘M | Only for things that can take a role. **A group can** — its position is the centre of what it holds, so "these eleven crates are the subject" is a sentence the capture plan can execute |
| Delete | ⌫ | Red |

Every label says **Group** rather than **Object** when the row is a container.

Right-clicking **empty space** in the tree gives a shorter menu — **Paste Object** and **Browse Assets** — because a full list scoped to whatever happened to be selected would act on something you can't see from where you clicked.

**Empty state:** *"Nothing in the scene yet. Drop an asset in to get started."* with a **Browse assets** button. If the emptiness is caused by a filter it says so instead, and offers **Clear filters**.

---

## 6. Ungrouping

**⇧⌘G**, or **Ungroup** in the row's context menu. The shortcut is bound at the window and works with the group selected anywhere — it lives with the marquee shortcuts rather than the panel's, because ungrouping is the inverse of the gesture on that bar and the two should be one keystroke apart.

- **Contents are handed to the group's own parent**, not to the root — so ungrouping one level of a nest doesn't empty the whole thing onto the floor.
- **Contents keep their world positions.** The group's transform was already resolved onto them by every edit that touched it, so there is nothing left to bake.
- The container itself is deleted, and the selection clears if it was the group.

---

## 7. Hierarchy in the other operations

| Operation | What it does with a subtree |
|---|---|
| **Delete** | Takes the whole subtree. Deleting one camera of a rig still takes its partner. |
| **Delete many** (marquee) | One undo step for the lot — eleven objects deleted with one keystroke must come back with one undo, and each intermediate state is a scene that never existed as far as the user is concerned. |
| **Copy / Duplicate** | Clones the subtree and re-points `parentId` within the cloned set, so duplicating a group reproduces its structure rather than producing loose copies. |
| **Hide / Lock** | Cascades; each descendant carries its own copy of the flag, so the viewport stays a flat read with no ancestor walk per frame. |
| **Undo** | Grouping and ungrouping are ordinary history steps. Nothing about them is cosmetic — `parentId` is real scene state. |

---

## 8. Groups outside the Layers panel

- **The arrangement solver and the TerraGen Objects list use `isContentObject`**, which excludes containers. A list holding both a group and its contents would act on everything inside it twice — the solver would place the group (moving its contents) and then place the contents again.
- **A group can still be the Master.** TerraGen's Objects list won't show it as a row (every row there carries a swap list, and a container has no asset to swap), but the Master card reads whatever holds the role, so a group that is master shows there by name. See [06 — TerraGen](06-terragen-generate-panel.md).
- **No info card for a group** — the ⓘ has nothing to open.

---

## 9. Keyboard reference

Bound at the window, and ignored while you're typing in any text field.

| Keys | Action |
|---|---|
| **Shift + drag** | Marquee select |
| **⌘G** | Group the marquee selection (needs ≥ 2) |
| **⇧⌘G** | Ungroup the selected group |
| **⌘C / ⌘V / ⌘D** | Copy / paste / duplicate — work on a marquee selection too |
| **⌫ / Delete** | Delete the selection |
| **Escape** | Clear the marquee selection |
| **F2** | Rename |
| **⇧H** | Show / hide |
| **⌘M** | Mark / unmark as master |
| **I** | View info |

---

## 10. Notes and gaps

- **There is no drag-and-drop reparenting in the tree.** `parentId` is written by `group()` and rewritten by `ungroup()`; nothing lets you drag a row into another row. Moving an object between groups today means ungrouping and regrouping.
- **A group can't be created from the Layers panel.** Grouping starts from a marquee selection in the viewport — the panel has no multi-select.
- **Sheet 2's Layers section is out of date** in two places: the context menu no longer carries *Mark as Distractor* / *Mark as Background Object* (master only now), and it gained a **Lock** row and an **Ungroup** row. See [02 — Layers](02-ai-tools-sab-mat-layers-3d.md).
- **`scene-tree.ts`'s header comment still says nothing nests yet** ("Today every object is a root — nothing sets `parentId`"). That was true before grouping shipped; the module is otherwise current.
- **A one-object marquee catch is a dead end.** `selectMany([id])` clears `selectedId`, so a box that catches exactly one thing leaves it outlined with no toolbar, no properties panel and no selection bar — the bar only appears at two or more.
