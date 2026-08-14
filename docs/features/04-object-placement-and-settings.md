# 4. Object Placement and Settings

**Source files:** `EditorView.tsx` · `ObjectToolbar.tsx` · `ObjectPropertiesPanel.tsx` · `SettingControl.tsx` · `ObjectTitle.tsx` · `ObjectInfoPanel.tsx` · `useScene.ts` · `scene-types.ts` · `SceneCanvas.tsx`

---

## Getting an object into the scene

Six ways in:

| Method | Where it lands |
|---|---|
| Drag a card from the Asset Library into the viewport | Under the cursor, on the ground |
| Asset card **⋮ → Place in Scene** | At the scene origin |
| Multi-select → **Add to scene** | At the origin, all in one undo step |
| **3D Generate → Place into Scene** | At the origin, as a ghost that becomes the real mesh |
| Ask the AI to add something, then pick from its reply | At the origin |
| **⌘V** paste or **⌘D** duplicate | Offset 0.6m from the original |

Dragging is the precise one. `handleDrop` in `EditorView.tsx` raycasts the drop point onto the ground plane (y = 0), then places at `[hit.x, 0.5, hit.z]` — so the object appears where it was released rather than at the origin.

A newly placed object is selected automatically.

Copies land offset rather than exactly on top of the original — an exact overlap reads as "nothing happened" until you drag the top one off. A copy never inherits **Master** (a scene has one hero, and it isn't a copy of one) but does keep Distractor or Background, since scattering more clutter is the whole reason to duplicate one.

---

## Selecting an object

Click it in the viewport, click its row in **Layers**, or click a node chip in the AI chat. All three call `scene.select(id)`.

On selection the camera flies in to fit the object at the current viewing angle, then starts a slow auto-orbit around it. Deselecting flies back to the view the user was on before. The auto-orbit is held off until the fly-in lands, and pauses while the gizmo is being dragged.

Clicking empty space deselects (`onPointerMissed`). So does **Back** above the object title.

Selecting a **camera** frames the whole rig — both cameras and the sweep line between them — rather than zooming onto one lens. See [05 — Camera Settings](05-camera-settings.md).

---

## What appears when something is selected

### 1. The object title, in the scene

A large title on a tilted plane at the left of the screen, drawn as if it's standing in the 3D space. Its colour flips between light and dark depending on how bright the render behind it is — `EditorView` samples the frame every 200ms and reads the mean luminance of the region behind the title, with hysteresis so it doesn't flicker at the threshold.

Top to bottom:

- **Back** — deselects
- **The name** — click to rename in place. Enter or blur saves, Escape cancels. Long names wrap to two lines then truncate in the middle ("Building Mech…ine"), binary-searched against real measurement rather than a character count, because the face is condensed by a scale transform.
- **An ⓘ mark** perched on the last letter of the first line, like a ® — opens the info card. Its position is measured from the rendered text rects, and re-measured on resize and after fonts load.
- A rule
- **Badges** — the object's type, and its role if it has one, each in the role's own colour
- **The description**
- **Delete** — destructive action sits with the object's own label, away from the mode tabs

### 2. The bottom toolbar

Three tiles, centred at the bottom:

| Tile | Mesh / image | Camera |
|---|---|---|
| 1 | **Object** (transform) | **Object** (transform) |
| 2 | **Texture** (material) | **Capture** |
| 3 | **Master** (toggle) | — not offered — |

The tiles **toggle**. Clicking the lit one closes its panel and its setting control but keeps the object selected — so the viewport can be cleared to look at the object without giving up the selection. `tab === null` is a normal resting state.

Cameras get no Master tile. A capture rig can't be the hero; it's the thing pointed *at* it.

### 3. The properties panel (bottom right)

A compact list of the settings for whichever tab is open, each row showing its current value. Picking a row opens a small control panel just above the bottom toolbar. That panel can be **dragged anywhere** by its title bar, and the offset survives switching between settings.

**There is no gizmo mode switcher in the panel header any more.** The three Transform rows *are* the switcher — picking Position, Rotation or Scale arms the matching gizmo handles (`selectSetting` in `EditorView.tsx`). The pairing now runs one way only: row → gizmo. A segmented control above the list was a second copy of a choice the list already makes.

---

## Object tab — Transform

| Row | Control | Range |
|---|---|---|
| **Position** | Three number fields, X / Y / Z | free |
| **Rotation** | Three sliders | 0–360° |
| **Scale** | Three sliders, with a **Uniform** lock (on by default) | 0.1× – 3× |

**The gizmo.** Skinned to read like Unreal's (`unreal-gizmo.ts`). While dragging, a live readout floats above it:

- One axis: `X  1.42`
- Plane or screen handle: `1.42, 0.00, -0.85`
- Rotating: `37.5°`
- Scaling: `1.250×`

The readout is written straight to the DOM node on the gizmo's own `objectChange` event rather than through React state, so a drag doesn't re-render every frame.

A whole drag, however long, collapses into **one undo step** (`commit(tag)` in `useScene.ts` coalesces same-tag commits within 600ms).

**Locked objects** show no gizmo. They can still be selected, inspected and read — they just can't be dragged. The gizmo is also suppressed while a distance preview has hidden the object, because `TransformControls` throws if its target leaves the scene graph and that throw comes from inside the render loop.

---

## Texture tab — Material

| Row | Control |
|---|---|
| **Color** | Eight swatches, plus a **Custom** entry that opens the native colour picker and shows the hex |
| **Metallic** | Factor card, 0–1 |
| **Roughness** | Factor card, 0–1 |
| **Specular** | Factor card, 0–1 |
| **Normal** | Factor card, 0–8 |

The swatch list (`OBJECT_COLORS`) is the same one the AI assistant resolves colour words against, so "make it red" and the red swatch always agree.

---

## Roles

There are four role values on a scene object (`ObjectRole` in `scene-types.ts`):

| Role | What it means |
|---|---|
| `none` | Rendered, but no axis varies it |
| `master` | The hero every camera orbits. Exactly one per scene |
| `distractor` | Foreground clutter the detector must learn to ignore |
| `background` | Scene dressing that sets context behind the hero |

Cameras and HDRIs can't take any of them (`canTakeRole`) — a camera is the thing pointed at the hero, and an HDRI is the environment around it.

### Where each role is set

This split changed. **The viewport toolbar now handles Master only.**

| Role | Where it's assigned |
|---|---|
| **Master** | The **Master** tile in the object toolbar (a switch, not a menu) · Layers right-click · TerraGen → Camera & Master |
| **Distractor / Background** | TerraGen → **Object Roles** (bulk) · Layers right-click (one at a time) |

**Why:** distractor and background are many-per-scene and are decided against the whole scene at once, so they belong in a list where you can see the set you're building. What's left for a single selected object is the one role that's exactly-one-per-scene and worth setting the moment you look at the thing. A popover with one item in it is a menu that has forgotten what it's for.

### The Master tile

`role="switch"`, `aria-checked` on whether the object is the master. It lights (master colour) only in the on state — a distractor or background object still reads as itself in the layer tree and the viewport outline, but this tile answers one question so it only lights for one answer.

Clicking it when the object already is the master **releases** it back to `none`. Otherwise the only way to unset the hero would be to promote something else, and a scene can legitimately have none while the user decides.

### What a Master promotion does to the scene

In `useScene.setRole`:

1. The previous master is demoted to `none`. Two masters would mean every camera aims at whichever one sorts first.
2. **Every camera rig translates by the delta** between the old master's position and the new one. The framing the user built — bearing, height, distance — survives intact instead of being recomputed from a default. Without this, changing the hero points the whole capture at empty ground and every rendered frame is useless.
3. Demotions and the two non-hero roles move nothing.

### TerraGen → Object Roles (bulk assignment)

`terragen-roles.tsx`. One panel for background, distractor and unassigned:

- A searchable, checkbox list of every object that can take a role, each row showing its current role as a coloured dot and a chip
- A picker bar with select-all / clear and a live count
- **Mark selected** → three buttons: **Background**, **Distractor**, **Clear role**. Disabled until something is ticked, so a role button can never silently do nothing.
- A hint line for each role under the buttons
- **Let AI assign roles** — present but deliberately inert (`onAutoAssignRoles` logs and returns). It needs a service that can reason about what a detector should ignore; guessing from bounding boxes would produce confident wrong answers that are harder to correct than no answer.

The selection is intersected with what's actually in the scene on every render, so deleting an object from the viewport can't leave the count claiming it.

Master is deliberately absent from this panel — it belongs with the cameras that orbit it, and it's exactly-one where these are many.

---

## The info card

Opened from the ⓘ mark on the title, or **View Info** in the Layers right-click menu. Docks on the right, 320px wide.

**Reading mode:**

- A thumbnail
- The role as a coloured pill, if it has one
- **Description**
- **Smart Tags** and **Manual Tags**
- **Details** — Saved In (this scene), Type, Role, Position, Rotation, Scale, Color (swatch + hex)

**Edit Object** turns it into a form: name, type, description, smart tags (remove and regenerate) and manual tags (add and remove). **Save Changes** / **Cancel** in the footer.

**Delete** removes the object from the scene.

This is deliberately the same card as the Asset Library's details panel — same width, same header, same rhythm. Both answer "what is this thing?", one about a library asset and one about a placed object. What differs is only what the two actually differ on: a placed object has a transform and a material, a library asset has a file.

---

## Other object operations

From the Layers right-click menu, and by keyboard from anywhere except a text field:

| Operation | Shortcut | Notes |
|---|---|---|
| Rename | F2 | Also by double-clicking a layer row |
| Copy | ⌘C | Snapshot by value — editing the original afterwards doesn't change the copy |
| Paste | ⌘V | Lands offset from the original |
| Duplicate | ⌘D | Same. A camera rig duplicates as a pair |
| Hide / show | ⇧H | Hidden objects stay in the layers list, dimmed |
| Lock / unlock | — | Selectable and readable, not draggable |
| Delete | ⌫ / Del | |

Hide and lock **cascade over the subtree** — a visible child inside a hidden group would still render, which makes the group's closed eye a lie. Children carry their own copy of the flag so the viewport stays a flat read of `hidden` with no ancestor walk per frame.

Deleting a group takes its contents. Deleting either camera of a rig removes both.

---

## Moving around the viewport

| Input | What it does |
|---|---|
| Left-drag | Orbit |
| Scroll | Zoom (2m – 60m) |
| **W A S D** | Fly. W/S along the view direction flattened to the ground, A/D strafe. Ignored while typing in any field |
| Click empty space | Deselect |
| Orientation cube (top right) | Click a face, edge or corner to tween to that view |

The cube is drawn as glass panels with the gaps showing the scene through, so it reads as a chamfered cube rather than a solid grey block. It highlights the face nearest the current view, and highlights differently when the camera is exactly on that axis. When a dock panel opens, the cube eases left over 300ms to match the panel's own arrival.

---

## Known issue — the "Height" row leaks onto ordinary objects

**`ObjectPropertiesPanel.tsx:129-138`.** The filter excludes `distance` for non-cameras but not `height`:

```ts
(s.key !== "distance" || isCamera) &&
```

`height` is in the `Transform` group, so a mesh or image shows a fourth Transform row — **Height**, reading `—` — under Position / Rotation / Scale. Clicking it opens a `SettingControl` whose body renders nothing, because the height block is guarded on `camera && onHeight` (`SettingControl.tsx:439`) and `camera` is null for anything that isn't a rig camera. The user gets an empty panel with a title bar.

Fix is one line — make the exclusion cover both keys, e.g.:

```ts
((s.key !== "distance" && s.key !== "height") || isCamera) &&
```

`height` is already in `CAMERA_TRANSFORM`, so cameras keep the row either way.
