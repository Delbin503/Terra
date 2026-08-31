# 6. TerraGen — the Generate Work Order panel

**Source files:** `TerraGenView.tsx` (the mode, the two stages, the dock) · `work-order.ts` (types, counting, preflight — no React) · `useWorkOrder.ts` (the draft store) · `terragen-master.tsx` (Objects) · `terragen-camera.tsx` (Camera Settings) · `terragen-weather.tsx` (Weather & Lighting) · `terragen-axes.tsx` (Scene Environment, Arrangement, Output) · `terragen-budget.tsx` (dispatch review) · `terragen-parts.tsx` (shared controls) · `ObjectPropertiesPanel.tsx` · `SettingControl.tsx` · `camera-rig.ts` · `weather.ts` · `arrange.ts` · `work-order-runs.ts` · `EditorActions.tsx` · `EditorView.tsx`

---

## 1. What it is, and what it is not

Pressing **Generate** does not start a render. It opens the author of a **Work Order** — the document Terra Platform hands to TerraOrchestrator, which splits it into Sub Work Orders and permutes them, and which TerraGen then renders one subset at a time.

```
Terra Web (this panel)  →  Terra Work Order  →  Terra Platform
     →  TerraOrchestrator   (splits into Sub Work Orders, permutes)
          →  TerraGen       (renders one subset, returns dataset + annotation)
```

Everything the panel offers has to be a field the orchestrator can plan and the renderer can execute. That is why there is no physics, no timeline and no keyframes anywhere in it.

---

## 2. Getting there

**Top-right action cluster → Generate** (`EditorActions.tsx`). The button opens `TerraGenView`, which mounts **over** the editor as a full-screen mode (`fixed inset-0 z-50`) rather than replacing it — unmounting the editor would drop its WebGL context, reload the 4K HDRI, and lose the camera where the user left it.

It is a **takeover, not a dialog**: no editor toolbars, no tool panels, no viewport chrome. The argument is that the thing being authored is a picture — *will the master still be in frame at the top of the climb?* — and that question can't be answered against the artist's own orbit camera with gizmos over it.

**The draft outlives the panel.** `useWorkOrder` lives in `EditorView`, not in the sheet, so closing TerraGen and going back to nudge an object doesn't throw the order away.

**The scene is read in once.** `seedIfEmpty` fires the first time Generate is pressed. After that the draft is what the user has been editing, and re-deriving would silently overwrite it.

While the mode assembles it shows *"Preparing TerraGen — Reading {project} into the Work Order…"* over a skeleton dock. The loader clears when the render's assets actually resolve (a `Ready` probe inside the Suspense boundary, watching three's loading manager), with a 15-second timeout as a safety net so a texture that never loads still leaves a usable panel.

---

## 3. The two ideas the whole panel rests on

### The scene is value #1 of every axis

Every axis has a current value already sitting in the scene — the placed HDRI, the arrangement as posed, the object as it stands. An axis that is **off** contributes exactly what the viewport shows. Turning it **on** means "…and also these others."

Consequences you can see everywhere in the UI: every count floors at 1, no editor ever opens as an empty form, and with nothing switched on the Work Order is a single subset that reproduces the scene the user just built.

### The camera sweep is *not* an axis

Pitch, yaw and distance used to be authored in the panel as their own ranges, in parallel with the camera rig sitting in the scene — two descriptions of one sweep, which drifted apart the moment a camera was dragged.

They are now read straight off the rig via `planCapture`, the same call the editor's own capture makes. **The panel edits the rig; the rig is the sweep.** There is nothing to copy and nothing to keep in step.

---

## 4. The Work Order panel itself

```
┌──────────────────────────────────────────────┬──────────────────────┐
│ [Scene preview] [Edit scene]                 │  Generate Work Order │
│                                              │   ↻   ⌄   ✕          │
│                                              ├──────────────────────┤
│                                              │ ▸ Objects            │
│        the stage — full bleed                │ ▸ Camera Settings    │
│        (the dock floats over it)             │ ▸ Weather & Lighting │
│                                              │ ▸ Scene Environment  │
│                                              │ ▸ Arrangement        │
│                                              ├──────────────────────┤
│  ┌────────────────────────────────────┐      │ ▸ Output      pinned │
│  │ ▶ ──●───────────  7.8° · 45° · 2.6 m │    ├──────────────────────┤
│  └────────────────────────────────────┘      │ ⚠ preflight strip    │
│                                              │ [ Review & dispatch ]│
└──────────────────────────────────────────────┴──────────────────────┘
```

**Width: 400px** (`TERRAGEN_WIDTH`) — deliberately its own number, not the editor dock's 320. Everything that has to keep clear of the panel derives from it, rather than repeating a literal. The weather dials are a label, a track and a boxed value on one line, and below ~380 the value box ran past the section border.

### The three header controls

| Control | Label | What it does |
|---|---|---|
| ↻ | *Re-read the scene into every axis* | `reseed` — throws the draft away and derives a fresh one from the scene. The explicit "pull the scene in again" that `seedIfEmpty` deliberately doesn't do on its own. |
| ⌄ | *Collapse the Work Order panel* | Folds the dock to a header-height bar in the same corner — mark, the word **Generate**, then expand and close. The Work Order, the open section and the draft are all untouched; only the body is gone, and every overlay reclaims the full width. |
| ✕ | *Back to editor* | Leaves the mode. The draft survives. |

The collapsed bar keeps **both** the expand chevron and the ✕, so a folded panel is still closable in one click.

### The six sections — what each one is for

The dock is the Work Order, read top to bottom. Each row is one decision about the dataset:

| Section | What it decides | Where it writes | Multiplies the run? |
|---|---|---|---|
| **Objects** | What is in the frame. Which object is the **Master** every camera orbits, what else shares the shot, bringing new assets in from the library and posing them — and the **stand-ins** each object can be re-rendered as. | the scene *(stand-ins: the order)* | only through stand-ins |
| **Camera Settings** | The sweep itself. Camera mode, how close and how far the rig stands off the master, how high it climbs, where it orbits, and how many shots it takes. These are the camera rig's own settings, edited in place. | the scene | no — it sets **frames per subset** |
| **Weather & Lighting** | The conditions the scene is rendered under, and the saved **weather sets** the run can sweep. | the scene | only through checked sets |
| **Scene Environment** | Which HDRI lights and backs the scene, plus a shortlist of other skies to render the same sweep under. | the order | **yes** |
| **Arrangement** | Rearranges everything but the master inside a drawn space, *N* times, reproducibly from a seed. | the order *(previews apply to the scene)* | **yes** |
| **Output** | What comes back in the archive — dataset type, frame resolution, and which annotations TerraGen computes. | the order | no — it changes the **archive**, not the count |

### How they behave

- **An accordion, one open at a time.** At 400px there is no room for a nav plus a form, and two open sections put the control you're dragging and the row you're comparing it against on different screens. It opens on **Objects**.
- **Every row carries its own summary**, so the closed stack still says what the order is set to without opening anything — `Torus` · `Torus · 2.6–6.2 m` · `Sunny` · `No HDRI` · `As arranged` · `Images · 1920×1080 · 2 annotations`. Where a section isn't ready, the summary says that instead: `No master object`, `Torus · no camera placed`.
- **The first three sections edit the scene, not the order.** Objects, Camera Settings and Weather & Lighting decide what a *single subset* even looks like. That is why they carry no on/off switch — and why anything you change in them is still there when you go back to the editor.
- **Output is pinned outside the scroll**, directly above Dispatch, in its own capped scroller (`max-h-48vh`). It gates what TerraGen computes rather than how many times it runs, and it is the last thing checked before spending.
- **No running total anywhere on the panel.** Each axis editor carries a plain-language cost line instead — *"3 environments — one subset each"*. The bill is stated once, in the dispatch review.

---

## 5. The stage — two views of one scene

Two tabs, top-left, where the editor keeps its project bar. Both stages stay **mounted**; only one is visible. Toggling must not cost a WebGL context and a 4K environment reload each way.

### Scene preview *(the default)*

The scene from the pose TerraGen would shoot frame *N* from. This is the default because the mode exists to produce frames, and this is the only picture that says what those frames will contain.

- The camera is pinned to the sampled pose and looks at the master. The **capture cameras are hidden** — TerraGen doesn't render its own rig into the dataset.
- A **scrubber** runs the rig's whole sweep, with play/pause (220 ms a frame). The readout is the pose, not a frame number: `pitch° · heading° · distance m`.
- Frames run the way TerraGen shoots them — a full revolution at one stop, then the next stop along the near→far line.
- **It previews the camera only.** Weather, HDRI and arrangement changes can't be rendered by this client.
- With no master it says so: *"Pick a Master object in the Camera section — the camera has nothing to orbit until you do."*

### Edit scene

The editor's own `SceneCanvas`, inside the mode — same selection, same transform gizmo, same orbit controls, same rig guides. The object you drag here is dragged by exactly the machinery that drags it in Terra Web, so there is no second implementation to fall out of step with the first.

**This is the stage where anything gets positioned.** The Transform panel and the gizmo only appear here; on Scene preview they are hidden, because that stage is a picture rather than a workspace.

---

## 6. Objects

The section holds the whole cast: the master, everything sharing the frame with it, roles, stand-ins, and the way in from the library.

### 6.1 Adding a new asset from the library

1. Open **Objects → Add from library**. The **real asset library** opens as a bottom sheet over the stage — the same component the editor uses, so folders, tags, search, filters and upload all behave exactly as they do outside TerraGen. It opens on **All Assets**, not "3D Models" (that category is the AI-output folder and would show an empty grid to someone who only wanted a chair).
2. The dock **stays open** behind the sheet: the section you opened it from is what you check the result against. The stage switches to **Edit scene** at the same time — what you are about to pick lands in the scene, and the sweep preview is shot *from* the camera, so it can render neither a new object nor a shortlisted environment.
3. Click an asset. It is added to the scene by name, type and model URL, **the sheet closes**, and the object arrives **already selected** — because the next thing you want is the viewport it just landed in.

> Placing is the one library errand that closes the sheet on the first pick. The two shortlists — swap objects and environments — deliberately stay open, because both are multi-select by nature.

### 6.2 Setting its position, rotation and scale

With the object selected on the **Edit scene** stage:

- The **Transform panel** appears in the bottom-right corner (the editor's own `ObjectPropertiesPanel`, `group="Transform"`). It lists exactly three rows — **Position**, **Rotation**, **Scale** — each with a live numeric summary on the right.
- Clicking a row does two things at once: it opens that control in the small draggable panel at the bottom of the screen, **and it arms the matching gizmo** in the viewport — Position → translate arrows, Rotation → rings, Scale → boxes. The rows *are* the gizmo switcher; there is no separate segmented control.

| Row | Control | Range |
|---|---|---|
| **Position** | three number fields, **X / Y / Z**, in metres | free |
| **Rotation** | three sliders, X / Y / Z, shown in degrees | 0–360°, step 1 |
| **Scale** | three sliders, shown as `1.00×` | 0.1–3.0, step 0.01 |

- **Scale has a `Uniform` lock**, on by default: with it on, dragging any axis drives all three together. Turn it off to scale one axis on its own.
- The small control panel can be **dragged anywhere** by its grip, and it stays where you put it as you step between settings.
- Typing a number and dragging the handle are the same edit — both write straight to the scene object.
- **Done** (bottom-left) clears the selection and puts the handles away. Clicking empty space does the same.

### 6.3 Marking an object as Master

Two ways, both one click:

- **The crown on the object's row** — promotes immediately. This is the most common thing anyone does in this list ("no, *that* one is the hero"), so it is not hidden behind a menu. The crown is filled and non-interactive on whatever currently holds the role.
- **The role dot menu → Master Object.**

Promotion is exclusive — the model demotes the previous holder, so two masters is not a reachable state. The **Master** block at the top of the section then names it, with *"Every camera orbits this"* beside it; clicking that name selects it.

**What changes when the master changes:** the camera rig re-frames itself around the new master (also on a first camera, or a resize of the master — but *not* on every move, or a distance you set on purpose would be thrown away), the Camera Settings summary renames, the near/far limits are recomputed from the new master's radius, and the Scene preview re-aims.

### 6.4 Roles

Set from the **role dot** at the left of each row — the dot *is* the menu.

| Role | Means |
|---|---|
| No role | Rendered, but no axis varies it |
| Master Object | The hero every camera orbits. Only one per scene |
| Distractor | Foreground clutter the detector must learn to ignore |
| Background Object | Scene dressing that sets context behind the hero |

Picking the role an object already has clears it back to **No role**. Roles are **scene state**, not order state: they decide what the annotations call each object, and they never multiply subsets — which is why this section carries no switch.

### 6.5 Deleting an object

The **bin** on the row — icon-only, and the only red thing on it, because it is the one action here you can't take back by clicking the same button again.

Deleting also **removes that object's swap list**. Stand-ins for a thing that is no longer in the scene would otherwise keep multiplying the run from a row nobody can see.

### 6.6 Swap objects — rendering the same scene over another mesh

A **swap** is an *order-level substitution*: the run renders the same rig, weather and framing once per stand-in. **Nothing in the scene changes** — the arrangement you posed stays posed. This is why "the same dataset over six chairs" is one visit rather than six, each destroying the scene a little more.

Every object can carry its own list, and each list lives inside that object's own row.

**Adding stand-ins**

1. Open the object's row with the **chevron**. The card expands into its swap list.
2. **Add swap objects** opens the library in *swap* mode. The button on every asset card reads **Swap for {object}**, multi-select is armed, and **the sheet stays open** so you can pick six without re-searching each time. The list behind it updates live.
3. Each pick lands as a row, **checked** by default.
4. A yellow note appears above the list: each stand-in appears where the object stands, so its position, rotation and scale should be checked, or it will overlap whatever is around it.

**What each control on a swap row does**

| Control | Meaning |
|---|---|
| **Checkbox** | *Render this one.* Unchecked, the row stays on the shortlist and costs nothing — shortlisting six meshes is the expensive part, and dropping one out of tonight's run shouldn't mean finding it in the library again tomorrow. |
| **Thumbnail + name** | *Show me this one.* Clicking it stands the mesh in. Two different questions, so two different targets. |
| **Bin** | Off the list entirely. |

The caption under the name tracks the state: `Click to place it in the scene` → `Standing in — adjust it in the scene` → `Adjusted · click to review`.

**Adjusting a stand-in against the object it replaces**

1. Click the stand-in's name. The panel switches to the **Edit scene** stage, selects the object being replaced, and draws the stand-in in its place. (Previewing is not an edit — the substitution happens at draw time, so leaving it needs no undo.)
2. The **Transform panel** in the corner now points at the stand-in, with the same three rows and the same gizmo pairing as any other object. Its title bar's Done pill reads *"Stop standing in for {object}"*.
3. The numbers you see and type are the stand-in's **absolute pose**; what gets stored on the Work Order is the **difference** from the object it replaces — metres added, degrees added, a multiplier on size.

```
stand-in position = target position + offset.position
stand-in rotation = target rotation + offset.rotationDeg
stand-in scale    = target scale    × offset.scale
```

   An offset rather than an absolute pose is what lets a stand-in travel with its target: rearrange the scene or move the master, and the substitution follows. No offset at all means *exactly where the target is, at the target's size* — which is the right default, and the reason a swap needs no adjustment until somebody decides a mesh sits too low or faces the wrong way.

4. Nothing you do here touches the scene object. Only the swap's offset changes; material is not adjustable, because a stand-in's material belongs to its asset.
5. **Done**, or selecting anything else, puts the stand-in away and shows the real object again. Clicking a row in the dock also does this — asking for an object is taken as asking for *that* object.

**What a swap list costs**

The footer line under the list says it plainly: *"This object renders 3 ways — once as Torus, once per checked stand-in. Nothing in the viewport moves."* With nothing checked: *"the run renders this object as it stands."*

Swap lists on different objects **multiply each other** — two stand-ins for the car and one for the bollard is 3 × 2 = six versions of the scene, not five.

---

## 7. Camera Settings

**Row summary:** `Torus · 2.6–6.2 m` — the master, then the sweep's reach, near end first. Deliberately no frame count: that is the bill, and the bill is stated once.

### How it connects to the camera settings in Terra Web

They are **the same rig and the same controls**. Selecting a camera in the editor opens Camera Mode, Distance from Master, Camera Height, Orbit Rotation, Shots per Distance and Shots per Rotation; this section shows those same settings, and `DistanceControl` and `CaptureExplainer` are *imported from the editor* rather than re-cut here.

That matters in three concrete ways:

- **Every control writes to the scene, not to the Work Order draft.** The rig *is* the sweep, so there is nothing to copy and nothing to keep in step. Edit it here, go back to the editor, and the camera is where you left it — and vice versa.
- **The same geometry on screen.** Each control draws the editor's own guides: distance halos with afterimages where the pair will return to, the orbit ring and its arc, the shot markers at every stop and every frame. A control in this panel and the same control in Terra Web put identical geometry in the viewport.
- **One vocabulary.** The panel used to show a shorter, differently worded set — "Nearest/Farthest", "Climb", no orbit, no stop arithmetic — so the same rig had two vocabularies depending on which panel was open, and the one in here was the poorer.

Opening the section is itself taken as *"I am about to move the rig"*: the stage switches to **Edit scene** and frames the rig **before** the first drag, because moving a camera while the sweep preview is up changes the picture from the inside and is unreadable. Closing the section puts the guides away. A note at the top of the section says exactly this.

**The rig re-frames itself.** There is no Framing button — a control that can only ever be pressed for one reason is a chore, not a choice.

### Where the camera lands, and what you are allowed to change

**Placing a camera parks it at the establishing distance.** The pair is stood off the master at the reach where the master fills roughly **10% of the frame** — the whole object in shot, nothing cropped, plenty of context around it. That is the *far* end of the sweep, and the rig physically sits there from the moment it is placed and for the rest of its life.

The rule is geometry, not a guessed number. At the scene's 45° field of view the frame's half-height at distance `d` is `d · tan(22.5°) ≈ 0.414 d`, so a master of radius `r` fills `r / 0.414 d` of it. Holding that at 10% gives:

```
placement distance ≈ 24 × masterRadius        (masterRadius = 0.7 × the master's largest scale)
```

Because it is derived from the master's own size, a large master lands further back and a small one closer, and both arrive framed the same way.

**From there, the only distance you set is the near one.** TerraGen gives you a single Distance control, and it writes `rig.nearDistance` — how far *in* the sweep travels before it stops. There is no far control in this panel, and cameras can't be dragged or transformed here either (they're deliberately left out of the corner Transform panel). So:

| | Set by | Changes with |
|---|---|---|
| **Far distance** | placement — the 10% framing rule | a new master, a first camera, or a resize of the master (the rig re-frames itself) |
| **Near distance** | **the Distance control** — the one you touch | nothing else; it is stored on the rig |

Storing the near end as data rather than as a camera position is what lets it survive every other edit — an orbit, a climb, a re-frame — instead of being whatever a position happened to imply. Its floor is `nearLimit = max(0.8, masterRadius × 1.15)`, all but touching the master; TerraGen clamps at the same bound, so the panel shows the floor rather than having the value silently overridden server-side.

### The controls

| Control | Range / behaviour |
|---|---|
| **Camera mode** | Two cards. *Rotatable* — master turns a full revolution at each height, stepping start → end. *Fixed* — one front-on frame, no orbit, no climb. Fixed hides Height, Orbit and Shots entirely. |
| **Distance from master** | The **only** distance control. Sets `rig.nearDistance` — a saved number the capture travels *in* to, not a camera position, so nothing moves when you drag it. Clamped to `[nearLimit, farDistance]`. |
| *(no Farthest control)* | The far end is the placement distance and stays there. Nothing in this panel moves it — there is no slider for it, and cameras aren't transformable here. It changes only when the rig re-frames itself on a new or resized master. |
| **Camera height** | The climb: 0 → `climbLimit` (= `farLimit` = `max(6, masterRadius × 30)`), with **Level · 0 m** and **Max** shortcuts either side. Only the far camera moves, straight up, so the pair stays a vertical mast rather than leaning into a slope. |
| **Orbit rotation** | Three numbers read left to right — arc **origin**, the slider (where the pair stands *now*, 0–360°), arc **end**: *"from here, round to there, currently here"*. Underneath: `Origin · N°`, `N° now`, `N° swept`. Applied as a **delta**, so each camera keeps its own bearing offset. Dragging the ring in the viewport is the same edit. |
| **Shots → Increments** | `shotsPerDistance`, 1 → `maxStops(sweep)` — capped at 12, and at whatever the span holds with stops 0.25 m apart. The readout gives the spacing and the ceiling: *"3 stops between the two ends, 1.20 m apart. Room for 9 over this 2.4 m sweep."* |
| **Shots → Shots / Rotation** | `shotsPerRotation`, 4 → 120. |

Camera mode, Increments and Shots / Rotation each carry a folded **"How this works"** explainer — the editor's own `CaptureExplainer`, same diagrams. Folded rather than always-on: worth their height the first few times, noise afterwards.

**Frames per subset** = stops × shots per rotation (rotatable), or 1 (fixed). Defaults are 3 × 24 = **72**.

**Warnings**, in order: no master (*"Mark one in Objects above"*), then no camera (*"Place a Camera in the viewport — its two positions are the sweep"*).

> See sheet 5 for the rig model itself — the mast, the near/far asymmetry, placement, and direct manipulation in the viewport.

---

## 8. Weather & Lighting

**Row summary:** the active conditions.

Weather is **scene state**, like the camera. Editing it here edits the scene.

### The conditions

Five tiles, and they are a **multi-select** — they stack. Rain under heavy cloud, snow in low sun, dust at dawn are all things this panel can say, each one tile away. Every switched-on condition brings **only the dials it owns**, boxed under its own name:

| Condition | Its dials |
|---|---|
| Sunny | Sky brightness |
| Cloudy | Cloud coverage |
| Rain | Rain amount · Wetness level |
| Dusty | Dust amount |
| Snow | Snow amount · Snow coverage |

All dials are percentages. The **last** condition on cannot be switched off — a scene with no condition has no sky to render — and that tile simply stops responding rather than showing a disabled style.

*Not in this section:* wind bearing, wind speed and the sun clock. The state still exists and a saved set still carries it; the controls were removed because no condition owned them and a dataset run almost never touches them.

### Creating a weather set

1. Switch on the conditions you want and set their dials. The scene updates live.
2. **Save as set.** The combination is stored and appears in the **Weather sets** list below, checked and in the run, with a caption of its conditions and its sun time.

A set is a **value on an axis** — that is why each row has a checkbox rather than just load-and-delete. Every subset renders once per checked set, so two sets is two passes over the whole sweep. The list header counts them (`2 of 3 in run`) and the footer states the cost: *"Every subset renders 2 times — once per checked set."*

### Modifying a set

1. Press the **pencil** on its row. This **loads** the set into the conditions and dials above *and* remembers which one you loaded — the row highlights, and the footer becomes that set's footer.
2. Adjust anything.
3. **Update set** writes it back. **Done** walks away without writing.

Editing is a mode, not a second copy: there is deliberately **no "Save as set" beside Update**, because a third button that silently forks the set is how a run ends up sweeping "Rain" and "Rain 2", one of which is the mistake.

### Loading, checking, deleting, resetting

| Action | Where |
|---|---|
| Load a set into the dials (without entering edit mode) | click its **name** |
| Include / exclude it from the run | its **checkbox** |
| Delete it | the **bin** on its row |
| Reset the current conditions and dials to defaults | **Reset**, beside Save as set |

If the set being edited is deleted from under the edit, the footer falls back to the plain save footer.

**Sets last for this session** — there is no backend to persist to, and the panel says so.

---

## 9. Scene Environment *(an axis)*

Swaps the HDRI the scene is lit and backed by. **The environment already in your scene is always value #1** and cannot be removed from the axis.

### Adding an HDRI to the run

1. Open **Scene Environment**. The **In scene** block shows the placed HDRI as a chip. If nothing is placed, a yellow note says so — this axis *varies* the background, it can't supply the first one.
2. **Add from library** opens the library sheet on the **Environments** category, with multi-select armed and the button on every card reading **Add to run**.
3. Pick as many skies as you want. **The sheet stays open**, and the shortlist behind it fills in live.
4. Close the sheet. Each pick is now a row with a thumbnail, a **checkbox** (sweep this one) and a **bin** (off the list).
5. The footer states the result: *"The run renders 3 times — once under Dune Dusk, once per checked sky."* With nothing checked: *"the run keeps the scene's own environment."*

**There is no on/off switch on this row.** The axis arms itself from its picks — an empty list already says "off", and a switch would only add a second way to say it plus a third state to get stuck in (rows chosen, axis silently off).

**There is no upload button either.** Bringing a file in is the library's job — it has the drop target, the folders and the progress. Upload in the sheet, then pick it.

---

## 10. Arrangement *(an axis)*

Rearranges the objects inside a drawn space and renders each arrangement — a way to get *N* believable rooms out of one scene, all reproducible.

The axis and the Space panel's **Scatter** call the **same** `arrange()` solver with the same rules; the only difference is how many times. Scatter is one shuffle you keep; this is a sweep the run renders one subset per arrangement.

**What moves:** every content object that isn't the master and isn't locked or hidden. **The master never moves** — the capture rig is framed on it, so moving it would invalidate every shot in the order.

### Using it

1. **Space** — the section shows the armed volume, named and measured. Without one you get a yellow note, and preflight **blocks dispatch**: with no bounds the solver has nothing to sample inside, so the axis would multiply the bill and render the same scene *N* times. Draw one from the asset library, under **Utilities**.
2. **How many** — 1 to **10** (`MAX_ARRANGEMENTS`). **The count is the switch:** at 1 the axis multiplies nothing and the run renders the room exactly as posed; from 2 it becomes a sweep. Ten rather than a larger cap because every arrangement is a whole subset — it multiplies against the weather sets, the swap lists and the camera's frames.
3. **Seed** — the number every arrangement descends from (`seedFor(seed, n)`). Type one, or press the seed button for a fresh one. *"Write it down and this exact set of rooms comes back — here, and on the render farm."* A fresh seed is generated per Work Order, so two orders authored in the same session don't silently produce the same rooms.
4. **Preview** — one chip per arrangement. Clicking chip *N* **applies that arrangement to the viewport** so you can look at it — there is nowhere else to show it, and a thumbnail strip would need *N* offscreen renders of a scene already on screen. **Undo puts it back**, and the run rebuilds every arrangement from the seed regardless of what the viewport is currently showing.
5. After a click, that arrangement's **own derived seed** is printed under the chips — the number to write down to get one particular room back. Only the clicked one, because ten eight-digit numbers is a column nobody asked for.
6. If the solver couldn't fit everything: *"2 couldn't be fitted — widen the space or lower the clearance."*

---

## 11. Output

Output does **not** change the frame count — it changes what comes back in the archive. It is pinned above Dispatch for that reason: it is the last thing you check before spending.

Four fields of one shape — a labelled row that opens into its choices, one open at a time, so the section's height stays at one field's worth however deep the list.

| Field | Contents |
|---|---|
| **Dataset type** | **Static images** — one frame per camera sample. **Video** is present, disabled, marked *Coming soon* (continuous capture along the rig path). |
| **Image configuration → Frame resolution** | Four presets — HD 1280×720 · **Full HD 1920×1080** *(default)* · QHD 2560×1440 · 4K UHD 3840×2160 — plus a custom **width × height** pair, 256–7680 px, step 16. A partially-typed field falls back to the old value rather than asking for a 0-pixel frame. |
| **Per-frame annotations** | Object Detection — AABB *(on by default)* · Object Detection — OBB *(coming soon)* · Pose Estimation · Polygonal Segmentation · Semantic Segmentation *(on by default)* · Keypoint & Landmark. Greys out with the reason *"Needs the Static images type"* when images are off. |
| **Per-video annotations** | Cosmos-compatible prompts — disabled, *coming soon*, *"Needs the Video type"*. |

Below them, a **fact rather than a toggle**: *"MAT photorealism is applied to every frame after render."* It is a post-render step in the pipeline, not something the user opts into.

And a closing line: *"Frames, archive size and credits are shown in the dispatch review."*

**Resolution is the one output setting with a bill attached** — not in frames, but in bytes. The archive estimate scales with frame area, so a 4K run is four times a 1080p one.

---

## 12. The arithmetic

Kept in `work-order.ts`, out of React, for the same reason `planCapture` is: the frame count is what the dataset is billed and judged on, so it has to be testable on its own.

```
subsets  = ∏ (values on each active multiplier)
frames   = subsets × planCapture(rig).totalFrames
credits  = round(frames × 0.125 + subsets × 7)
bytes    = frames × 0.5 MB × (width × height ÷ (1920 × 1080))
```

| Multiplier | Lives on | Worth |
|---|---|---|
| Scene Environment | the order | base HDRI + each checked pick |
| Arrangement | the order | the count, when ≥ 2 |
| Weather sets | the **scene** | how many sets are checked, when ≥ 2 |
| Object swaps | the order | **one row per object** — the object itself + its checked stand-ins |

**Worked example** — defaults (3 stops × 24 shots = 72 frames), two extra environments checked, two weather sets, one object with two stand-ins:

```
subsets =  3 (environments) × 2 (weather sets) × 3 (car + 2 stand-ins) =    18
frames  = 18 × 72                                                     = 1,296
credits = 1,296 × 0.125 + 18 × 7                                      =   288
archive = 1,296 × 0.5 MB at 1920×1080                                 = 648 MB
```

The per-subset term is the headless scene reconstruction TerraGen does on every restart — which is what makes an orchestrated value expensive, and why the review can explain itself. Constants are back-fitted to the pipeline docs' worked example (24 subsets × 360 frames ≈ 1,240 credits · 4.2 GB).

---

## 13. Preflight

A **live validity strip** in the footer rather than failing on click: by the time someone reaches for Dispatch they should already know. It shows the first gate — blocks before warnings — with a `+N` pill for the rest.

| Gate | Level | Message |
|---|---|---|
| No master object | **block** | "Mark one object as Master — every camera orbits it." |
| No camera rig | **block** | "Place a Camera to define the sweep." |
| Arrangement on, no space drawn | **block** | "Draw a space before sweeping arrangements — the solver needs bounds." |
| No dataset type | **block** | "Choose at least one dataset type." |
| No annotation type | **block** | "Choose at least one annotation type." |
| Credits short | **block** | "N credits needed — you have M." |
| Over 10,000 frames | warn | "This is a long run — check the axes in the dispatch review before spending." |

**Review & dispatch** is disabled while any block stands.

There is deliberately **no environment gate**. There was one, and it read the scene for an object with `source === "environment"` — which is not how every route into the scene places a sky, so it stayed lit after the user had already added one. A check that cries wolf about the one condition it exists to catch teaches people to dispatch through the warning strip.

---

## 14. The Review & dispatch modal

The button opens a modal over the mode — Radix `Dialog` for the scrim, focus trap and Escape, with the **same glass as the dock** so it reads as the same surface rather than a second, flatter one. It closes from its own top-right ✕ (*Back to settings*) as well as from the footer.

This is the **only** place the bill appears. The trade is deliberate: the running cost is no longer ambient, so someone can author an expensive order without watching it get expensive — and what that buys is one unmissable checkpoint where the number is the only thing on screen.

### What it shows, top to bottom

**1 · The headline — frames.** One caption carrying the working, then the figure alone in brand colour:

> **Frames this run** *(18 subsets × 72 frames from the camera rig)*
> **1,296**

Every other figure on the screen stays in ink. This is the number the whole screen exists to show.

**2 · Two cost cells, side by side.** Two independent answers to *what does pressing the button cost me* — credits out of the balance, bytes onto the disk — neither read before the other:

| Cell | Figure | The line under it |
|---|---|---|
| **Credits** | `288` | `(3,440 left)` — the balance *after* the run. If it doesn't fit, the whole block turns red and the line reads *"N more than your balance of M."* |
| **Archive** | `648 MB` | `1,296 frames at 1920×1080` |

**3 · What you added.** A row per thing the user actually put into this order, because by this point they have been through six sections and a library sheet, and *"did the second chair make it in?"* is a fair question with a Dispatch button in front of you.

Rows appear **only when there is something to say** — never a zero: objects in the scene *(containers excluded — counting a group and its four crates as five overstates the scene)*, swap objects, environments added, **arrangements named with their seed**, weather sets in the run, annotation types, and frame resolution.

**4 · Why this many.** Each multiplier and its `×N`, then the subset total:

```
Scene Environment   ×3
Weather sets        ×2
Torus swaps         ×3
─────────────────────
Subsets             18
```

Under it, **folded**, the permutation table — the first 12 subsets spelled out as chips, one row each, last axis varying fastest. This is the moment the axis model pays for itself: the user sees the table TerraOrchestrator will walk rather than trusting a multiplication they can't check. Folded, because it is the check you run when a total looks wrong, not part of reading the total.

The whole "Why this many" block is hidden on a one-subset order, where it would only restate the caption at the top of the same dialog.

**5 · Warnings.** Warn-level gates are repeated in the footer — blockers already disabled the button that opened this, but a warning is exactly the kind of thing worth restating on the last screen before spending.

**6 · The two buttons.** **Back to settings** and **Dispatch 1,296 frames** — the confirm names the quantity rather than saying "Confirm", and stays disabled if any blocker stands.

---

## 15. After dispatch

Confirming closes the review. The panel footer becomes:

> ✓ **Work Order queued — 18 subsets.**  ·  **[ Back to scene ]**

Editing anything afterwards drops that message — the footer can't keep claiming something is queued while the user edits what it was queued from.

The run is added to the **Work Orders** list, reached from the download button in the editor's top bar, which carries a **count badge** while anything is in flight. Each row holds the project, the frame total, the progress and the **credits it was charged** — stored, not recomputed, so a two-week-old run isn't re-priced at today's rate. A run still in flight can be cancelled; anything else has already spent what it was going to spend.

---

## 16. Known gaps

Recorded here rather than described as if shipped:

- **Render time is computed but never shown.** `computeTotals` returns `seconds` and `work-order.ts` exports `formatDuration`; nothing in the review displays either.
- **The SAB prompt row doesn't exist.** `WorkOrder.prompt` and `store.setPrompt` are in the model, but no control writes to them.
- **`terragen-roles.tsx` is not mounted.** `RolesSection` — the bulk role-assignment panel with the searchable list and "Let AI assign roles" — was folded into the Objects section; roles are now set from each object card's dot menu, and nothing imports the file.
- **The axis on/off switch is never rendered.** `Section` still accepts `onToggle` and `AxisSwitch` still exists, but the dock passes neither: both axes arm themselves (environments from their picks, arrangements from their count).
- **Video is modelled and disabled** throughout — dataset type and per-video annotations both.
- **One rig.** `rigState` reads `scene.rigs[0]`, and the editor's re-frame does the same. The model allows more.
- **The 10% placement rule isn't in the code yet.** `framingPosition` currently backs a new rig off by `max(3, radius × 4)`, which frames the master at roughly 60% of the frame rather than 10%; the 10% reach exists only as `farLimit` (`radius × 30`, ≈ 8% fill), the ceiling the near distance is measured against. Making placement match §7 is a one-line change to `framingPosition`.
- **Run progress is simulated.** `work-order-runs.ts` advances rows on a timer whose shape matches what a socket will report, so swapping it doesn't change the table.
