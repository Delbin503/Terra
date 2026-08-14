# 1. Top Navigation Bar

The top of the editor is one line of chrome made of **three separate glass panels**: the project panel on the left, the tool panel in the middle, and the action panel on the right. They're all the same height (48px) and sit on the same line, so they read as one band even though they're three separate pieces.

All three float over the 3D viewport. The glass retunes itself to whatever is behind it — the editor samples the rendered frame five times a second and switches the glass between a dark, dim and bright tuning, so labels stay readable over a night scene and over a blown-out sky.

---

## Panel 1 — Project (top left)

**What's in it:** project emoji · project name · undo · redo

### Project emoji

The emoji is picked automatically from the project name. "Traffic Scene" gets 🛣️, anything with "desert" or "dune" gets 🏜️, "robot" gets 🤖, and so on. If nothing matches it falls back to 🗺️.

To change it, the user clicks the emoji. A picker opens with four groups — Places, Nature, Objects, Abstract — ten emoji in each. Clicking one sets it and closes the picker. A **Reset** link in the picker header puts back the auto-picked emoji. Clicking outside or pressing Escape closes it without changing anything.

### Project name

Click the name to edit it in place. Enter saves, Escape cancels, clicking away saves. Leaving it blank counts as a cancel — an empty name would leave nothing to click on to get back in.

Long names are shortened at around 24 characters. The **start** of the name is kept plus the last 3 characters, so "Spiderman Versfwf completely New verse" shows as "Spiderman Versfwf…rse". Hovering a shortened name shows the full one in a tooltip.

Renaming updates the project name everywhere at once: the AI chat's context line, the Work Order, the save toast, the MAT preview screen, the exit dialog.

### Undo / redo

Both grey out when there's nothing to undo or redo.

The important part is what counts as *one* step:

- Dragging the gizmo for three seconds is **one** undo, not sixty.
- Selecting four assets in the library and pressing "Add to scene" is **one** undo, not four.
- Dropping three assets one at a time is **three** undos.
- Clicking around to select things isn't recorded at all.

Undo also restores what was selected at the time, so undoing a delete gives the object back *and* re-selects it.

---

## Panel 2 — Tools (top centre)

Three buttons: **Scene objects**, **Assets**, **AI Tools**. Each shows its name on hover. A button lights up orange while its surface is open.

The three don't close each other. The user can have the layer tree, the AI chat and a generation panel open at the same time; clicking a tool button only decides whether *its* panel is open.

| Button | What it opens |
|---|---|
| Scene objects | The Layers panel, in the right-hand dock |
| Assets | The Asset Library, as a bottom sheet |
| AI Tools | A dropdown menu of the three AI tools |

A tool button can also carry a **red count badge** for results waiting to be looked at — today that's finished MAT previews on the AI Tools button. See [02 — AI Tools](02-ai-tools-sab-mat-layers-3d.md).

**Assets is the one exception:** opening the library drops whatever object is selected. The library is a full-width sheet for choosing what to bring in next, which is a different job from inspecting the thing already selected. Scene and AI leave the selection alone, because reading the tree or asking the AI about the selected object is exactly why you'd open them mid-focus.

### The AI Tools menu

Clicking **AI Tools** opens a 260px dropdown under the button. Three rows, each with a name, a one-line description, and a tick when that tool is already open:

| Row | Description |
|---|---|
| **SAB** | Scene agent — build and edit by prompt |
| **3D Generate** | Multi-view images into a mesh |
| **MAT** | Domain-adaptation photorealism pass |

How it behaves:

- **Clicking a dark row opens that panel. Clicking a lit row closes it.** Same row, both directions.
- **The menu stays open** after a pick. All three panels stack in the right-hand dock and run at the same time, so arranging two of them shouldn't cost two trips out to the AI button.
- **The tick is the state.** Without it the menu would keep offering to open a panel the user is already looking at.
- Clicking anywhere outside closes the menu and leaves every panel as it is.

Full details for each tool are in [02 — AI Tools](02-ai-tools-sab-mat-layers-3d.md).

### The right-hand dock

Every tool panel — Layers, MAT Preview, Generate 3D Mesh, AI — opens in one column on the right, under the orientation cube. They're all 320px wide, they stack in the order they were opened, and the column scrolls if the stack gets too tall. Nothing is ever closed on the user's behalf.

Each panel can be:

- **Collapsed** to just its header. A collapsed panel that's still working keeps a spinner, a percentage and a hairline progress bar in its header.
- **Resized** by dragging the grip at its bottom edge. Double-clicking the grip restores its default height.
- **Closed** with the × button.

The orientation cube and the camera POV inset ease to the left when a panel opens, and step back when the last one closes.

---

## Panel 3 — Actions (top right)

**What's in it:** credits · account · download · save · exit · Generate

### Credits

The lightning icon opens a compact 248px popover:

- Workspace name, with a **History** link
- A balance card: the Terra Credits number and a **Top Up** button

### Account

The avatar opens a people popover, also 248px:

- The signed-in user at the top with their role, marked "(You)"
- A "Find someone..." search field
- Every other user on the scene, with their seat and a live status — "Editing…" or "Viewing…"
- "No one found" if the search matches nothing

### Download

An icon button with a tooltip. No behaviour wired to it yet.

### Save

Pressing it raises a brand-tinted card in the bottom-left corner: **"Traffic Scene saved."** It clears itself after about four seconds — unlike the other corner cards it has nowhere to send you, so it says its piece and goes.

There's no backend behind it yet. What it does is answer, which is the part that was missing: a save button that gives no response is one people press three times.

### Exit project

The only control in the bar that throws the viewport away, so it's the only one that isn't grey — a sign-out glyph in red. It never leaves on its own; it asks first:

> **Exit project** — *Traffic Scene*
>
> Leave the editor and go back to your projects?
>
> *Anything you haven't saved stays unsaved. Running generations keep going.*
>
> **[ Stay here ]  [ Exit project ]**

Confirming returns to the projects list. Cancelling, clicking the backdrop or the × keeps the user where they were.

### Generate (orange pill button)

Opens **TerraGen**, the Work Order author. It's a full-screen takeover, not a dialog.

What happens when it opens:

1. The first time, TerraGen reads the current scene into a draft Work Order. After that the draft is whatever the user has been editing — it doesn't silently re-read and overwrite their work. There's a re-read button in the header for that.
2. A loading state shows while the render assembles: *"Preparing TerraGen — Reading Traffic Scene into the Work Order…"*. It's real work: the mode mounts a second 3D canvas and re-fetches the 4K environment map.

Once it's up:

**Left side — the render.** A live picture of the scene from the pose TerraGen would actually shoot from. A scrubber along the bottom moves through every frame of the camera's sweep, with a play button to run through them. The readout shows the pose (pitch · heading · distance), not a frame number. A pill says **"Camera only"** — weather and HDRI changes can't be rendered here, so the preview says so instead of pretending.

If no object is marked as Master, this side says so instead: *"Pick a Master object in the Camera section — the camera has nothing to orbit until you do."*

**Right side — the sections.** An accordion, one open at a time:

| Section | What it sets |
|---|---|
| **Camera & Master** | Which object is the hero, and the rig's mode, distances, climb and shot counts |
| **Object Roles** | Marks the rest of the scene as background or distractor, in bulk |
| **The four axes** | Each has an on/off switch and its own editor |
| **Output** | Image output and which annotations to produce |

The switch on a row arms that axis; the row itself opens its editor. Separate targets on purpose, so arming an axis doesn't close the editor you're reading.

Camera & Master and Object Roles carry no switch — they don't multiply anything, they decide what a single subset even looks like. Both edit the **scene** directly, not the draft. See [05 — Camera Settings](05-camera-settings.md) and [04 — Object Placement](04-object-placement-and-settings.md) for what's in them.

**Footer.** A live validity strip shows the first problem found (red for a blocker, amber for a warning, with a "+N" pill if there are more). **Review & dispatch** is disabled while a blocker stands.

Pressing it opens the review dialog. This is the only place in TerraGen where frames, archive size and credits are stated — it's the moment they become a decision. Confirming queues the order and the footer changes to *"Work Order queued — N subsets"* with a **Back to scene** button. Touching any axis afterwards turns it back into a draft.

The editor stays mounted behind TerraGen, so going back is instant and the camera is exactly where it was left.

---

## The corner toasts

Every "a background job finished" message uses one shape, in the bottom-left corner:

| What finished | Message | Clicking it |
|---|---|---|
| MAT preview | "MAT preview generation completed. **Click to view**" | Opens the MAT panel on its History list |
| 3D mesh | "3D mesh generation completed. **Click to view**" | Opens the library on 3D Meshes |
| Multi-view images | "Multi-view images generated — front, left, right and back." | Nothing to open — the four angles are in the generate panel |
| Save | "*Project* saved." | Nothing to open — clears itself after 4s |

**One at a time, newest wins.** Stacking them would push the oldest up over the object toolbar, and three cards about three finished jobs is a log, not a notification. Every card has an × to dismiss. When the Asset Library is open they sit above it rather than under it.
