# 9. The Objects section — the cast of the shot

**Source files:** `terragen-master.tsx` (the section, the object card, the swap list) · `work-order.ts` (`ObjectSwap`, `SwapOffset`, `swapPose`, `offsetFromPose`, the swap multiplier) · `useWorkOrder.ts` (`addSwap`, `toggleSwap`, `removeSwap`, `setSwapOffset`) · `TerraGenView.tsx` (the library sheet, the stand-in preview, the corner Transform panel) · `scene-types.ts` (roles) · `AssetLibrary.tsx` · `ObjectPropertiesPanel.tsx` · `SettingControl.tsx`

**Where it sits:** the first section of the Generate Work Order dock, open by default. The whole panel is covered in [sheet 6](06-terragen-generate-panel.md); this sheet is the long form of that section — every flow, every control, and what each one writes to.

---

## 1. In one paragraph

**Objects answers "what is in the frame".** It names the one object every camera orbits (the **Master**), lists everything else sharing the shot, and lets you bring new assets in from the library without leaving the panel. Each object in the list can also carry a **swap list** — other meshes the run should re-render the same scene over, without moving anything in the viewport. Position, rotation and scale are edited in the viewport with the gizmo and by number in the corner panel.

The section exists because every earlier version of this panel opened by telling you what was wrong with the scene and then sent you out of the panel to fix it. A mode you have to leave in order to satisfy it should not have been a mode.

---

## 2. What writes where

This is the distinction the rest of the sheet hangs on:

| What you change | Lands in | Survives leaving TerraGen | Multiplies the run |
|---|---|---|---|
| Adding an object | **the scene** | yes | no |
| Position / rotation / scale | **the scene** | yes | no |
| Master | **the scene** (`role`) | yes | no |
| Roles (Distractor, Background) | **the scene** (`role`) | yes | no |
| Deleting an object | **the scene** | yes | no |
| **Swap lists** | **the Work Order** | yes (they're on the order) | **yes** |
| A stand-in's offset | **the Work Order** (`ObjectSwap.offset`) | yes | no |

Only one thing in this section costs money: a swap list. That is why the section header carries no on/off switch — there is no axis to disable — and why the swap count is the one figure repeated on the closed row.

---

## 3. Anatomy

```
┌─ Objects ─────────────────────────── Torus ─ ▲ ┐   row summary = the master's name
│                                                │
│  MASTER                                        │
│  ┌────────────────────────────────────────┐    │
│  │ ● Torus            Every camera orbits │    │   click the name → selects it
│  └────────────────────────────────────────┘    │
│                                                │
│  SCENE OBJECTS                     1 in scene  │
│  ┌────────────────────────────────────────┐    │
│  │       ⊕  Add from library              │    │   → §4
│  └────────────────────────────────────────┘    │
│  ┌────────────────────────────────────────┐    │
│  │ ● Torus                    ♛   🗑   ▾  │    │   ● role menu  ♛ promote
│  │   Master · No swap objects             │    │   🗑 delete     ▾ swap list
│  └────────────────────────────────────────┘    │
└────────────────────────────────────────────────┘
```

- **Content objects only.** Cameras are excluded — a camera can't be a master and has no role. Groups are excluded from the *list* (every row carries a swap list and a group has no asset to swap) but can still hold the master role from the viewport, and the Master block above names whatever holds it.
- **The Master block is exactly-one; the list is many.** Hence the split: one gets a block, the rest share a list.
- **With no master** the block is a yellow note — *"Nothing is marked Master…"* — and preflight blocks dispatch until one is set.
- **One swap list open at a time.** Two open lists in a 400px column is a scroll, not a comparison.

---

## 4. Flow A — adding a new asset from the library

1. **Objects → Add from library.**
2. Three things happen at once:
   - the **real asset library** opens as a bottom sheet over the stage — the same component the editor uses, so folders, tags, search, filters and upload behave exactly as they do outside TerraGen;
   - the **stage switches to Edit scene**, because what you are about to pick lands in the scene and the sweep preview is shot *from* the camera — it can render neither a new object you now have to position nor an environment you just shortlisted;
   - the **dock stays open** behind the sheet: the section you opened it from is what you check the result against.
3. The sheet opens on **All Assets**, not "3D Models". That category is the AI-output folder (`filterByCategory` narrows it to meshes with `generated` set), so opening there would show an empty grid and a Generate 3D button to someone who only wanted a chair.
4. **Click an asset.** It is added by name, type and model URL (`scene.add`), the **sheet closes**, and the object arrives **already selected** — the gizmo is on it, and the corner Transform panel is pointed at it.

> **Placing is the one library errand that closes on the first pick.** The two shortlists — swap objects (§6) and environments — deliberately stay open, because both are multi-select by nature: six stand-ins, four skies. Their lists update live behind the sheet, so what you have chosen so far is visible while you choose the rest.

**The same sheet, three errands.** The mode decides what a click does with what it finds, and the button on every asset card says so:

| Errand | Opens on | Card button | On pick | Sheet |
|---|---|---|---|---|
| **place** (Objects → Add from library) | All Assets | *Place* | `scene.add` | closes |
| **swap** (a row's Add swap objects) | All Assets | *Swap for {object}* | `store.addSwap` | **stays open** |
| **env** (Scene Environment) | Environments | *Add to run* | `store.addEnv` | **stays open** |

The sheet is keyed on the errand, so switching from one to another while it is already up remounts it — otherwise the swap sheet's filter would sit over the place sheet's job.

---

## 5. Flow B — the parameters: position, rotation, scale

With an object selected on the **Edit scene** stage, two things appear:

- **The corner Transform panel** (bottom-right, inside the dock's inset) — the editor's own `ObjectPropertiesPanel` with `group="Transform"`. Three rows, each with a live numeric summary on the right.
- **A Done pill** (bottom-left) reading *"Deselect {name}"*.

Clicking a row does two things at once: it opens that control in the small draggable panel at the bottom of the screen, **and it arms the matching gizmo** in the viewport. The rows *are* the gizmo switcher — there is no separate segmented control, and the section deliberately holds no fourth copy of that choice.

| Row | Gizmo | Control | Range |
|---|---|---|---|
| **Position** | translate arrows | three number fields **X / Y / Z**, in metres | free |
| **Rotation** | rings | three sliders, X / Y / Z, in degrees | 0–360°, step 1 |
| **Scale** | boxes | three sliders, shown as `1.00×` | 0.1–3.0, step 0.01 |

- **Scale has a `Uniform` lock**, on by default: dragging any axis drives all three. Turn it off to scale one axis alone.
- **Typing and dragging are the same edit.** Both write straight to the scene object (`scene.update`). Numbers matter because "sits 40 cm too low" is a figure someone reads off a model, not something you find by dragging.
- The small control panel can be **dragged anywhere** by its grip and stays where you put it as you step between settings.
- **Done**, or clicking empty space, clears the selection and puts the handles away.
- **Cameras are excluded** from this panel — they get their own guides and controls from Camera Settings, and this panel has no rig-aware branch to move a paired camera correctly.
- **Material is not here.** The Transform panel is `group="Transform"` only; material lives in the editor's own object panel.

---

## 6. Flow C — swap objects

### 6.1 What a swap is

A **swap** is an *order-level substitution*: the run renders the same rig, weather and framing **once per stand-in**. **Nothing in the scene changes** — the arrangement you posed stays posed.

It used to replace an object's mesh in the scene, one at a time, so "the same dataset over six chairs" was six visits, each destroying the scene a little more. And it used to belong to the master alone, which said swapping was the master's privilege — a scene is a whole frame, and the bollard beside the car matters to the model being trained as much as the car does. **Every object can hold a list now, and each list lives inside its own row.**

### 6.2 Adding stand-ins

1. Open the object's row with the **chevron** (▾). The card expands into that object's swap list.
2. **Add swap objects** opens the library in *swap* mode: every card's button reads **Swap for {object}**, multi-select is armed, and the sheet **stays open**.
3. Each pick lands as a row, **checked** by default.
4. Once the list has anything in it, a **yellow note** sits above it — *"Each stand-in appears where {object} stands. Click one to place it in the scene, then check its position, rotation and scale — otherwise it will overlap whatever is around it."*

> The note is **warning yellow, not danger red**, and it sits under the button that *adds* stand-ins rather than under the list. Red is this app's colour for something broken or about to be destroyed; a stand-in you haven't positioned is a routine next step. Under the list you would have added four before reading it.

### 6.3 What each control on a swap row does

| Control | Question it answers |
|---|---|
| **Checkbox** | *Render this one.* Unchecked, the row stays on the shortlist and costs nothing — shortlisting six meshes is the expensive part, and dropping one out of tonight's run shouldn't mean finding it in the library again tomorrow. |
| **Thumbnail + name** | *Show me this one.* Clicking it stands the mesh in the scene. Two different questions, so two different targets. |
| **Bin** | Off the list entirely. |

The caption under the name tracks state: `Click to place it in the scene` → `Standing in — adjust it in the scene` → `Adjusted · click to review`.

Row colour follows the same three states: showing = brand border + fill, checked = faint brand, unchecked = plain glass.

### 6.4 Adjusting a stand-in

1. **Click the stand-in's name.** The stage switches to **Edit scene**, the object being replaced is selected, and the stand-in is drawn in its place. Previewing is not an edit — the substitution happens at draw time, so leaving it needs no undo.
2. The **corner Transform panel** now points at the stand-in — same three rows, same gizmo pairing. The Done pill reads *"Stop standing in for {object}"*.
3. **What you see is absolute; what is stored is the difference.**

```
stand-in position = target position + offset.position       (metres added)
stand-in rotation = target rotation + offset.rotationDeg    (degrees added)
stand-in scale    = target scale    × offset.scale          (a multiplier)
```

   `swapPose()` applies it, `offsetFromPose()` inverts it, and one function does both jobs for all three places that must agree: the viewport preview, the dispatched job, and the gizmo handing a pose back.

   An offset rather than an absolute pose is what lets a stand-in **travel with its target** — rearrange the scene or move the master and the substitution follows. No offset at all means *exactly where the target is, at the target's size*, which is the right default and the reason a swap needs no adjustment until somebody decides a mesh sits too low or faces the wrong way.

4. **Nothing here touches the scene object.** Only the swap's offset changes. Material is not adjustable — a stand-in's material belongs to its asset.
5. **Done**, or selecting anything else, puts the stand-in away. Clicking a row in the dock does the same: asking for an object is taken as asking for *that* object, not for what is standing in for it.

### 6.5 What a swap list costs

The footer under the list says it plainly:

- with stand-ins checked — *"This object renders 3 ways — once as Torus, once per checked stand-in. Nothing in the viewport moves."*
- with none checked — *"Nothing checked — the run renders this object as it stands."*

The arithmetic, from `computeTotals`:

```
one row per object with checked stand-ins,  count = checked + 1
                                                    └─ the object you posed is value #1
                                                       of its own list; the run always
                                                       contains the scene as it stands

subsets = ∏ (every axis and every swap row)
```

**Swap lists on different objects multiply each other.** Two stand-ins for the car and one for the bollard is 3 × 2 = **six** versions of the scene, not five. Collapsing them into a single "Object swaps ×4" would understate the bill by a factor — which is the one mistake this screen exists to prevent. Each row appears by name in the dispatch review's multiplier list (`{object} swaps`).

---

## 7. Flow D — marking the Master

Two ways, both one click:

- **The crown on the row** — promotes immediately. This is the most common thing anyone does in this list ("no, *that* one is the hero"), so it is not behind a menu. On whatever currently holds the role the crown is filled, disabled and titled *"This is the master object"*.
- **The role dot → Master Object.**

Promotion is **exclusive** — the model demotes the previous holder, so two masters is not a reachable state.

**What changes when the master changes:** the camera rig re-frames itself around the new master (also on a first camera, or a resize of the master — but not on every move, or a distance you set on purpose would be thrown away), the Camera Settings summary renames, the near/far limits are recomputed from the new master's radius, and the Scene preview re-aims.

---

## 8. Flow E — roles

Set from the **role dot** at the left of each row — the dot *is* the menu. It used to be a decoration next to a crown that opened the menu, which left the row with two controls saying "role" and neither saying "make this the master".

| Role | Means |
|---|---|
| **No role** | Rendered, but no axis varies it |
| **Master Object** | The hero every camera orbits. Only one per scene |
| **Distractor** | Foreground clutter the detector must learn to ignore |
| **Background Object** | Scene dressing that sets context behind the hero |

Picking the role an object already has **clears it back to No role**. Roles are scene state: they decide what the annotations call each object, and they never multiply subsets.

The closed row's caption reads `{Role} · {n} of {m} swap objects selected` — the two facts about this object that aren't its name.

---

## 9. Flow F — deleting an object

The **bin** on the row — icon-only, and the only red thing on it, because it is the one action here you can't take back by clicking the same button again.

Deleting also **removes that object's swap list**. Stand-ins for a thing that is no longer in the scene would otherwise keep multiplying the run from a row nobody can see.

---

## 10. Things worth knowing

- **The section is editable because the panel used to be a nag.** Add, select, transform, promote, delete and shortlist all happen here, and the viewport on the left answers every one immediately.
- **`terragen-roles.tsx` is not mounted.** The old bulk role-assignment panel — searchable list, "Let AI assign roles" — was folded into this section; roles are set from each row's dot, and nothing imports that file.
- **No transform switcher in the dock.** It was three buttons that armed a gizmo plus a line telling you to go and use it. The handles are in the viewport and the rows that arm them are beside them.
- **Selecting goes through the view, not `scene.select`.** A stand-in occupies its target's id, so selecting the target while one was previewing was a no-op — the row was already selected and the viewport carried on showing the substitution. The view's handler is what makes a row a way back to the actual object.
- **Layer names in the DOM** follow the section: `terragen-editor-master`, `terragen-add-object`, `terragen-object-{slug}`, `terragen-make-master-{slug}`, `terragen-remove-{slug}`, `terragen-swaps-{slug}`, `terragen-add-swap-{slug}`, `terragen-swap-{assetId}` (+ `-inrun`, `-preview`, `-remove`), `terragen-swap-inspector`, `terragen-object-inspector`, `terragen-inspector-done`.
