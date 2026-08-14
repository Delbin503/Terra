# 4. Object Placement and Settings

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

Dragging is the precise one. The drop point is projected onto the ground plane, so the object appears exactly where it was released rather than at the origin.

A newly placed object is selected automatically.

Copies land offset rather than exactly on top of the original — an exact overlap reads as "nothing happened" until you drag the top one off. A copy never inherits the **Master** role (a scene has one hero, and it isn't a copy of one), but it does keep Distractor or Background, since scattering more clutter is the whole reason to duplicate one.

---

## Selecting an object

Click it in the viewport, click its row in the **Layers** panel, or click a node chip in the AI chat. All three do the same thing.

On selection the camera flies in to fit the object at the current viewing angle, then starts a slow auto-orbit around it. Deselecting flies back to the view the user was on before. The auto-orbit pauses while the gizmo is being dragged.

Clicking empty space deselects. So does **Back** above the object title.

Selecting a **camera** frames the whole rig — both cameras and the sweep line between them — rather than zooming onto one lens. See [05 — Camera Settings](05-camera-settings.md).

---

## What appears when something is selected

### The object title, in the scene

A large title on a tilted plane at the left of the screen, drawn as if it's standing in the 3D space. Its colour flips between light and dark depending on how bright the render behind it is, sampled five times a second, so it stays readable over anything.

What's in the block, top to bottom:

- **Back** — deselects
- **The name** — click it to rename in place. Enter or clicking away saves, Escape cancels. Long names wrap to a second line and then truncate in the middle ("Building Mech…ine"), so the start stays readable and near-identical names stay distinguishable.
- **An ⓘ mark** perched on the last letter of the first line, like a ® — opens the info card
- A rule
- **Badges** — the object's type, and its role if it has one, each in the role's own colour
- **The description**
- **Delete** — destructive action sits with the object's own label, away from the mode tabs

### The bottom toolbar

Three tiles, centred at the bottom:

| Tile | For a mesh or image | For a camera |
|---|---|---|
| 1 | **Object** (transform) | **Object** (transform) |
| 2 | **Texture** (material) | **Capture** |
| 3 | **Role** | — not offered — |

The tiles **toggle**. Clicking the lit one closes its panel and its setting control but keeps the object selected — so the viewport can be cleared to look at the object without giving up the selection.

Cameras get no Role tile. A capture rig can't be the scene's hero or its clutter; it's the thing pointed *at* them.

### The properties panel (bottom right)

A compact list of the settings for whichever tab is open, each row showing its current value. Picking a row opens a small control panel just above the bottom toolbar. That panel can be **dragged anywhere** by its title bar, and it stays where it's put when switching between settings.

---

## Object tab — Transform

| Row | Control | Range |
|---|---|---|
| **Position** | Three number fields, X / Y / Z | free |
| **Rotation** | Three sliders | 0–360° |
| **Scale** | Three sliders, with a **Uniform** lock (on by default) | 0.1× – 3× |

The panel header carries a segmented move / rotate / scale switcher.

**The panel and the viewport gizmo are one control.** Picking Rotation in the list switches the gizmo to rotation rings; switching the gizmo mode highlights the matching row and opens its control. Without that pairing the two can disagree — the panel saying Rotation while the viewport still shows move arrows.

**The gizmo.** Skinned to read like Unreal's. While dragging, a live readout floats above it:
- Dragging one axis: `X  1.42`
- Dragging a plane or the screen handle: `1.42, 0.00, -0.85`
- Rotating: `37.5°`
- Scaling: `1.250×`

A whole drag, however long, collapses into **one undo step**.

**Locked objects** show no gizmo. They can still be selected, inspected and read — they just can't be dragged. That's the whole point of the lock.

---

## Texture tab — Material

| Row | Control |
|---|---|
| **Color** | Eight swatches, plus a **Custom** entry that opens the system colour picker and shows the hex |
| **Metallic** | Factor card, 0–1 |
| **Roughness** | Factor card, 0–1 |
| **Specular** | Factor card, 0–1 |
| **Normal** | Factor card, 0–8 |

The swatch list is the same one the AI assistant resolves colour words against, so "make it red" and the red swatch always agree.

---

## Role

Only meshes and images get a role. Cameras and HDRIs don't — a camera is the thing pointed at the hero, and an HDRI *is* the Background axis, which is a different concept from a background object.

The Role tile wears the current role's colour, so the toolbar answers "what is this object?" without being opened. Clicking it opens a list (mutually exclusive — a thing is the hero, or clutter, or dressing, never two at once):

| Role | What it means |
|---|---|
| **No role** | Rendered, but no axis varies it |
| **Master Object** | The hero every camera orbits. Only one per scene |
| **Distractor** | Foreground clutter the detector must learn to ignore |
| **Background Object** | Scene dressing that sets context behind the hero |

Each row has a colour dot — the same hue that object outlines with in the viewport and badges with in the layers list.

**Master is exclusive.** Promoting an object to Master demotes whoever held it. Two masters would mean every camera aims at whichever one happens to sort first.

**Camera rigs travel with a Master promotion.** When the hero changes, every rig moves by the distance between the old master and the new one — so the framing the user built (angle, height, distance) survives intact instead of being recomputed from a default. Without this, changing the hero would point the whole capture at empty ground and every rendered frame would be useless.

Distractor and Background have no exclusivity and don't move anything — many objects can hold either.

Roles can also be set from the Layers panel's right-click menu, where picking the role an object already has clears it.

---

## The info card

Opened from the ⓘ mark on the title, or **View Info** in the Layers right-click menu. Docks on the right, 320px wide.

**Reading mode:**

- A thumbnail
- The role as a coloured pill, if it has one
- **Description**
- **Smart Tags** and **Manual Tags**
- **Details** — Saved In (this scene), Type, Role, Position, Rotation, Scale, Color (with a swatch and the hex)

**Edit Object** turns it into a form: name, type, description, smart tags (remove and regenerate) and manual tags (add and remove). **Save Changes** / **Cancel** in the footer.

**Delete** removes the object from the scene.

This is deliberately the same card as the Asset Library's details panel — same width, same header, same rhythm. Both answer "what is this thing?", one about a library asset and one about a placed object. What differs is only what the two actually differ on: a placed object has a transform and a material, a library asset has a file.

---

## Other object operations

All available from the Layers panel's right-click menu, and by keyboard from anywhere except a text field:

| Operation | Shortcut | Notes |
|---|---|---|
| Rename | F2 | Also by double-clicking a layer row |
| Copy | ⌘C | Snapshot by value — editing the original afterwards doesn't change the copy |
| Paste | ⌘V | Lands offset from the original |
| Duplicate | ⌘D | Same |
| Hide / show | ⇧H | Hidden objects stay in the layers list, dimmed |
| Lock / unlock | — | Selectable and readable, not draggable |
| Delete | ⌫ / Del | |

Hide and lock **cascade** over everything nested inside — a visible child inside a hidden group would still render, which makes the group's closed eye a lie.

Deleting a group takes its contents with it. Deleting either camera of a rig removes both.

---

## Moving around the viewport

| Input | What it does |
|---|---|
| Left-drag | Orbit |
| Scroll | Zoom (2m – 60m) |
| **W A S D** | Fly. W/S along the view direction flattened to the ground, A/D strafe. Ignored while typing in any field |
| Click empty space | Deselect |
| Orientation cube (top right) | Click a face, edge or corner to tween to that view |

The cube is drawn as glass panels with the gaps showing the scene through, so it reads as a chamfered cube rather than a solid grey block. It highlights the face nearest the current view, and highlights differently when the camera is exactly on that axis. When a dock panel opens, the cube eases to the left to get out of its way.
