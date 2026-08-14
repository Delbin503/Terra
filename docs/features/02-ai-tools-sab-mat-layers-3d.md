# 2. SAB · MAT · Layers · 3D Generate

Three of these live behind the **AI Tools** menu in the top-centre panel. **Layers** isn't one of them — it sits on its own button (Scene objects) next to it. They're documented together because all four open into the same right-hand dock.

All four panels are 320px wide, stack in the order they were opened, and can be collapsed, resized or closed independently. Opening one never closes another.

**How the AI menu behaves:** clicking **AI Tools** opens a dropdown listing SAB, 3D Generate and MAT, each with a one-line description and a **tick when it's already open**. Clicking a dark row opens that panel; clicking a lit row closes it. The menu stays open either way, so two or three panels can be arranged in one visit.

**Badges.** A tool can carry unread results. When it does, a red count appears on the **AI Tools button itself** (top right of the glyph, ringed in the canvas colour so it stays a separate object rather than a smudge on the icon), and the tool's row inside the menu grows a matching count with its description line replaced by what's waiting — e.g. *"2 preview images ready to view"* in red. Counts cap at **9+**.

Today only MAT uses this. The reason it exists: a finished generation used to announce itself once in a toast and then be gone, so anything produced while the user was looking elsewhere sat silently in a panel they had no reason to open. The badge is what survives being missed.

---

## MAT Preview

**Source:** `MatPreviewPanel.tsx` · `MatPreviewView.tsx` · MAT state lives in `EditorView.tsx`

### How to access it

Click **AI Tools** → **MAT**. The panel appears in the right-hand dock. Clicking **MAT** again in the menu closes it.

**One special case:** if the MAT row is carrying a badge (finished previews nobody has looked at yet) and the panel is closed, clicking it opens the panel **straight into its History list** rather than the form. The badge said there was something to see, so the click that answers it shouldn't land on an empty form with the results still one more control away. Opening it that way also clears the badge.

### What it does

One image in, one preview image out. It's deliberately the smaller of the two generate tools — a single input and a single switch — but it now **keeps everything it has produced**, so the panel is both the form and the gallery.

### The panel has two modes

| Mode | Body | Footer button |
|---|---|---|
| **Form** (default) | Source image + post-processing switch | **Generate Preview** |
| **History** | A grid of every preview this project has produced | **Back to Preview** |

They're modes, not two sections stacked in one scroll. Both at once meant the thing you came to look at opened above a form you weren't using, and the panel got long enough to scroll for neither job well.

**Swapping between them:** the **History** chip in the panel header (a library glyph, the word History, and a count) or the footer button. There are two exits on purpose — a mode entered from a chip in the header is one people look for an exit from where they're *looking*, which is the list, not the chip.

---

### Form mode

**Step 1 — give it an image.** Two ways:

- **From the library.** Click the library icon at the top-right of the Image row. The Asset Library opens as a chooser, narrowed to the user's own uploaded images. The prompt bar says *"Choose a source image from your uploads"* with a "0 of 1" counter. Pick one, press **Add 1**, and the library closes and hands the image back to the panel.
- **Upload one.** Click the dashed **Upload image** box. The file picker opens, images only.

Either way the image lands in a 92px thumbnail. That's too small to judge a material by, so clicking it opens the image full size in a dialog with its filename and a **Delete** button. Delete is greyed out while a render is in flight — the button stays where it was, it just can't pull the input out from under a job.

The header counts the slot: **Image (1/1)**. The library button greys out once the slot is full.

**Step 2 — post-processing.** A checkbox under the image. It's inert until there's an image, because there'd be nothing for it to act on. Removing the image also clears the checkbox, so it isn't left armed for whatever gets uploaded next.

**Step 3 — generate.** **Generate Preview** is disabled until there's an image. Pressing it starts a run of about 2.6 seconds.

### While it's generating

The panel shows a progress block above the button: a spinner, "Generating MAT preview", a supporting line ("Rendering the material", or "Rendering with post-processing" if the switch is on), a percentage and a real progress bar. The bar is honest — the run has a fixed length, so it moves at a real rate instead of shimmering.

The panel can be collapsed while it runs. Collapsed, the header keeps the spinner, the percentage and a hairline bar along its bottom edge, so the run is still visible.

Closing the panel mid-run cancels the job.

### When it's done

Three things happen, and **the panel stays open** — it's now the only route back to the result, so it holds onto it:

1. **The preview is prepended to the History list** (newest first).
2. **The unread count goes up by one**, which lights the red badge on the AI Tools button and on the MAT row in the menu.
3. **A corner card appears bottom-left:** *"MAT preview generation completed. Click to view"*, with an × to dismiss. Clicking it opens the panel's History.

> **This changed.** The panel used to close itself on completion and hand the single result to a play button in the top-right action cluster, with a one-time orange bubble pointing at it. **That button and its hint are gone.** A MAT pass used to leave nothing behind — the result opened full-screen and the only way back was a toast you had one chance to click, and generating a second preview made the first unreachable. The panel that produced them is the obvious place to keep them.

---

### History mode

A two-column grid, newest first. Each tile:

- A 4:3 thumbnail of the preview
- The **source filename**
- **"Post-processed"** or **"Material only"**
- A hover title with both: *"From dunes-04.png · post-processed"*

Clicking a tile opens that preview **full-screen**.

The header chip shows the total (`History 3`), and its tooltip reads *"3 previews in this project"* — or *"No previews yet"* at zero.

**Empty state:** *"Nothing generated yet. A finished preview lands here and stays."*

### How the badge clears

**Opening the list is reading it.** The unread count drops to zero when History is opened — via the chip, the footer, the toast, or the menu's badge shortcut.

Opening a *single* preview does **not** clear it. If it did, the other results would stay counted as new forever.

### The preview screen

A full takeover. The viewport, the toolbars and the panels all go — a material preview judged over a live 3D scene isn't being judged at all.

What's left: the project bar (emoji and name, static here) with a **Back to Editor** button, and the image itself, sized to the window and capped by aspect ratio. Under it, a caption with the source filename, and "· Post-processed" if that switch was on.

The editor is still mounted behind this screen, so going back is instant and the camera hasn't moved. **Back** returns to exactly what was underneath — including the MAT panel, still on History — so stepping through several previews is open, back, open, back.

### Two cleanup items for whoever picks this up

Neither breaks anything; both will mislead the next person to read the file.

1. **`MatPreviewPanel.tsx` still exports `MatPreviewToast`.** It's dead — the editor uses the shared `EditorToast` for all four corner cards now. Safe to delete.
2. **The panel's own docstring is out of date.** It still says *"On completion the panel closes and hands the preview to the editor. That is the whole reason the top bar grows a play button"* — the panel stays open now, and there is no play button. Same for the opening line, which calls it "the AI rail flyout"; the rail and the fan were both replaced by the top-centre bar and its dropdown.

---

## 3D Generate

### How to access it

Three ways in:

- **AI Tools** → **3D Generate**
- **Asset Library** → **3D Meshes** category → the **Generate 3D** button in the header
- Ask the AI chat to add something, then pick "generate a new mesh" in its reply

### What it does

Prompt and/or reference images in, a 3D mesh out. The result lands in the Asset Library under **3D Meshes**.

**Prompt.** A textarea at the top. Next to the label is an enhance button that appends `highly detailed, studio lighting, neutral pose` to whatever's written (and won't append it twice).

**Reference images — up to four, one per angle.** The angles are fixed: Front, Back, Left, Right. The header counts them: **Image (2/4)**.

Two ways to add them:

- **Upload** — the dashed box while empty, or the dashed **+** tile once there's at least one. Multi-select works; extras beyond the free slots are ignored.
- **From the library** — the library icon opens the Asset Library as a chooser, narrowed to the user's own uploaded images and capped to the number of free slots. Each picked image takes the next free angle.

Clicking any reference thumbnail opens it full size. There the user can change which angle it shows (angles already taken by another image are disabled, because two images both labelled Front would give the mesh pass contradictory input) or delete it. On the small tiles the delete button only appears on hover.

**Generate Multi-View.** Appears once there's at least one image, and greys out at four. It fills the remaining angles: those slots immediately show a spinner labelled "Generating", the pass runs about 2.4 seconds, then all of them become real thumbnails.

**Generating the mesh.** The Generate button is enabled as soon as there's either a prompt or at least one ready image. With images present there are two buttons side by side:

| Button | What it does |
|---|---|
| **Generate** | Runs the pass. The finished mesh goes into the library. |
| **Place into Scene** | Same pass, but the object goes into the viewport too. |

**Place into Scene** doesn't leave the viewport unchanged for three seconds. A stand-in object called "Generating mesh…" drops into the scene immediately and renders as a ghost. When the pass finishes it becomes the real mesh in the same spot — so if the user moved or rotated the placeholder meanwhile, that survives. If the placeholder was deleted before the pass landed, the finished mesh is just placed normally.

### While it's generating

The same progress block as MAT: spinner, title ("Generating 3D mesh"), a supporting line ("Building geometry from your references"), percentage and bar. Roughly 2.8 seconds for the mesh pass.

The panel can be collapsed to watch the viewport while it runs — the header keeps the spinner and the bar. Closing it cancels the run, so a placeholder left in the scene would stay a placeholder.

### When it's done

**Both passes raise a corner card**, whether or not the panel is open:

| Pass | Card |
|---|---|
| Mesh | *"3D mesh generation completed. Click to view"* — opens the library on 3D Meshes |
| Multi-view | *"Multi-view images generated — front, left, right and back."* — nothing to click through to, since the four angles live in the panel that made them |

The panel's own footer says it too — a green row with a **View** link for the mesh — but only while the panel is open and only where the user happens to be looking. A multi-view pass is long enough that they're usually somewhere else by the time it lands.

---

## SAB (the AI assistant)

### How to access it

**AI Tools** → **SAB**. The panel opens in the right-hand dock. Escape closes it, and so does clicking the lit SAB row in the menu.

### What it does

A conversation about the scene, with the work it does separated out from the prose.

**The header is a control, not a label.** It's the model picker: **Terra AI** (balanced — plans, builds, restyles), **Terra AI Fast** (quicker, shallower edits), **Terra AI Pro** (long capture plans and audits).

**Context banner.** A line at the top of the thread saying what it can see: *"Sedan selected · 7 objects in Traffic Scene · Terra Library on"*, or "Nothing selected". Dismissable.

**Empty state.** A short "Try" row of clickable prompt chips, filtered to what the scene can actually answer — an empty project isn't offered "Audit my scene", because the only possible reply is "there's nothing here". Hovering a chip shows a longer explanation.

**The composer.** Grows as the user types, up to five lines, then scrolls. Enter sends, Shift+Enter makes a new line. The attach button offers three things, up to four attachments per message:

- The currently selected object (greyed out when nothing is selected)
- An image from the library
- A file upload

Attachments show as removable chips above the field.

### How replies are shown

| Type | What it looks like |
|---|---|
| **Thinking** | A short animated row while it works |
| **Agent prose** | No bubble. Just text, so the thread reads as one voice talking to you |
| **User message** | An orange-tinted bubble on the right |
| **Work card** | A label, a category glyph, a status, and an **Undo** once it's finished |
| **Node chip** | The name of a scene object. Clicking it selects that object and flies the camera to it, exactly like clicking the mesh |
| **Permission card** | Allow / Deny, for anything that needs a decision before it runs |
| **Error** | A red-tinted card with "Couldn't finish" and a **Try again** button |
| **Suggestions** | Follow-up prompt chips under the reply |

Work is kept out of the prose on purpose: the sentence says what it means, the card says what changed. That's what makes the thread auditable, and it's why the card carries the objects it touched behind a disclosure.

### Two flows worth knowing

**"Add a chair."** Not answered with a paragraph. The agent replies with a fork: pull one from the library, or generate a fresh mesh. Picking the second closes the chat and opens the 3D Generate panel.

**"Make it darker" / "make it metallic" / "make it matte".** This one really edits the selected object's material, and the Undo on its card really puts it back. The other intents are scripted for now.

**Usage banner.** If the day's request count gets close to the cap, a warning strip appears at the top of the panel: *"17 of 20 AI requests used today. Edits still apply; new plans may queue."* Dismissable.

---

## Layers

### How to access it

Click the **Scene objects** icon (the leftmost of the three in the top-centre panel). The Layers panel opens in the right-hand dock. It's a separate switch from the AI tools — opening the library or a generate panel can't close it.

The panel stays open while an object is selected, which is the point: a layers panel that vanishes when you select a layer can't be used to step between them.

### What it does

Everything in the scene, as a list.

**Header.** The title, a count of layers, a search button, a fold button and a close button. Fold and close are different on purpose — the tree is somewhere the user keeps coming back to, so getting it out of the way shouldn't cost them the panel.

Clicking search swaps the whole header for a search row: a "Find…" field, a type filter (3D Mesh, Image, Environment, Video, Camera) and a close button. While filtering, every group is forced open — a match hidden inside a collapsed row is a match the search failed to surface. Escape closes search and clears both filters.

**A row.** From left to right:

- A chevron, if the row has children (a fixed empty slot otherwise, so names line up)
- The type icon
- The name
- A coloured dot if the object has a role — the same colour it outlines with in the viewport
- A **lock** toggle
- An **eye** toggle

Lock and eye only appear on hover, but once they're **on** they stay visible — a hidden object the user can't see in the viewport needs its reason showing in the list. Both cascade over everything nested inside the row.

A **camera rig collapses to one row**, since the pair is one instrument.

**Interactions:**

| Gesture | What happens |
|---|---|
| Click a row | Selects that object in the viewport |
| Double-click | Rename in place (Enter saves, Escape cancels) |
| Right-click | Context menu |
| Select in the viewport | The matching row is revealed and highlighted |

**The right-click menu:**

| Item | Shortcut |
|---|---|
| Rename | F2 |
| View Info | I |
| Copy Object | ⌘C |
| Paste Object | ⌘V |
| Duplicate Object | ⌘D |
| Show / Hide Object | ⇧H |
| Mark / Unmark as Master Object | ⌘M |
| Mark / Unmark as Distractor | — |
| Mark / Unmark as Background Object | — |
| Delete Object | ⌫ |

The three role rows toggle: picking the role an object already has clears it, so there's no separate "clear role" item. Cameras and HDRIs don't get those three rows at all — neither can take a role.

This menu and TerraGen's Object Roles panel are the two places distractor and background get set. The viewport toolbar only handles Master. (See [04 — Object Placement](04-object-placement-and-settings.md).)

The shortcuts work from the viewport too, not just inside the panel, and they're ignored while the user is typing in any text field.

**Empty state.** *"Nothing in the scene yet. Drop an asset in to get started."* with a **Browse assets** button that opens the Asset Library. If the emptiness is caused by a filter it says so instead, and offers **Clear filters**.
