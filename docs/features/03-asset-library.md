# 3. Asset Library

## How to access it

Click the **Assets** icon in the top-centre glass panel. The library opens as a sheet along the bottom of the screen — about 40% of the window height, never shorter than 260px or taller than 392px.

Opening it drops whatever object was selected. The library is for choosing what to bring in **next**, which is a different job from inspecting what's already there.

Two things open it on a specific category:

- Finishing a 3D mesh generation and clicking the corner card → opens on **3D Meshes**
- MAT or 3D Generate asking for an image → opens on **Uploads** in pick mode (see the bottom of this page)

---

## Layout

**Left — the category nav:**

| Category | What's in it |
|---|---|
| **Assets** | The whole library, minus camera rigs |
| **Images** | Image assets only |
| **HDRI Map** | Environment maps only |
| **Uploads** | The user's own files. Expands into **My Assets** and **Folders** |
| **3D Meshes** | Mesh assets, including generated ones |
| **Utilities** | Scene rigs — today, the Camera. Things you drop in to *capture* the scene, not things the scene is made of |

Uploads has a chevron to expand or collapse its two sub-items without leaving the category.

**Top — the header.** Same shape in every view, so moving between them doesn't move the controls. Only the primary button changes:

- **Search** field, with a clear button once there's text
- **Types** filter — Uploads only, since it's the one view that mixes kinds. It only offers types the uploads actually contain, so it can never empty the grid.
- **Tags** filter — a checklist of every tag present in the current view, with a count badge and a "Clear tags" row
- **Primary action**, per view:
  - 3D Meshes → **Generate 3D**
  - Uploads / My Assets → **Upload**
  - Folders → **Create Folder**
  - everywhere else → nothing
- **Close**

**Middle — the grid.** Square cards, auto-filling the width.

---

## An asset card

- The thumbnail fills the tile
- A **type badge** in the top-right corner (image / HDRI / 3D / camera)
- The **name** along the bottom
- On hover, a second line under the name: the type and its first smart tag
- On hover, a **⋮** button in the top-left corner
- Cards in the middle of a generation show a spinner and a status label instead

**A plain click opens View Info.** That's what a click means until multi-select is armed, at which point it means "tick this one". One click, one meaning at a time.

**Cards are draggable.** Dragging a card into the viewport places it exactly where it's dropped — the drop point is projected onto the ground plane, so the object lands under the cursor rather than at the origin.

---

## The ⋮ menu

| Item | What it does |
|---|---|
| **View Info** | Opens the details panel on the right |
| **Place in Scene** | Drops the asset straight into the viewport |
| **Select Items** | Arms multi-select, with this card already ticked |
| **Add to Folder** | Opens the folder picker |
| **Delete** | **Uploads only.** A library asset isn't the user's to remove, so the row is absent rather than greyed out |

---

## Multi-select

Armed from **Select Items** in the ⋮ menu. Every card grows a checkbox in its top-left corner (empty until ticked) and the ⋮ disappears — the only meaning of a click now is "toggle".

A footer bar appears with:

- **N selected**
- **Clear all** — reads as an active control the moment there's something to clear
- **Add to folder** — opens the folder picker for all of them
- **Add to scene** — places all of them. One action, so **one undo**, not one per asset.

---

## Uploading

**Uploads → My Assets → Upload**, or the button in the empty state.

Accepted: images, videos, `.glb`, `.gltf`, `.obj`, `.fbx`, `.usdz`, `.hdr`, `.exr`. Multiple files at once is fine.

The extension decides what it's filed as:

| Extension | Filed as |
|---|---|
| `.glb` `.gltf` `.obj` `.fbx` `.usdz` | 3D Mesh |
| `.hdr` `.exr` | HDRI Map |
| `.mp4` `.mov` `.webm` | Video |
| anything else | Image |

The extension is stripped from the name. The view jumps to My Assets and a toast confirms: *"3 files uploaded"*.

---

## Folders

**Uploads → Folders.** A grid of folder tiles, each showing its name and item count. Two exist by default: Vehicles and Street Props.

- **Create Folder** adds an empty tile with a name field in it. Enter or clicking away creates it; Escape cancels.
- Clicking a folder opens it. A breadcrumb appears — *Folders › Vehicles* — with the arrow back.
- **Add to Folder** (from a card's ⋮ or from the selection bar) opens the folder picker. It lists existing folders and also lets the user type a new folder name, which creates it with those assets already in it.
- Search works on folder names while in the folder grid.
- Deleting an asset also removes it from any folder it was filed into.

---

## View Info — the details panel

Opened from a card click or **⋮ → View Info**. It docks on the right, 320px wide, running from under the top bar to the bottom gutter. While it's open the library sheet shrinks its right edge so the two don't overlap.

### What everyone sees

- A large thumbnail
- **Description**
- **Smart Tags** — the AI's read of the asset
- **Manual Tags** — the user's own labels
- A rule, then **Details**: Saved In, Type, Format, Size, Dimensions, Owner, Date Created

The actions are pinned in a footer rather than sitting at the end of the list, because this card is as tall as the screen and its detail list grows.

### Uploaded assets vs library assets

This is the one real difference between them.

| | **Your upload** | **Library asset** |
|---|---|---|
| Badge | A "Your upload" pill above the description | none |
| Saved In | Uploads | Library |
| Footer actions | **Edit Asset** and **Delete** | **Rename** only |
| Change the name | yes | yes |
| Change the type | yes | no |
| Change the description | yes | no |
| Edit tags | yes | no |
| Delete | yes | no |

The reasoning is simple: an upload belongs to the user, so it gets the full form. A library asset doesn't, so the most it accepts is a rename — and offering a Delete that can't be honoured is worse than not offering one.

### Editing an upload

**Edit Asset** turns the body into a form:

- **Asset Name** (required)
- **Type** — Image / HDRI Map / 3D Mesh
- **Description** (required)
- **Smart Tags** — each has an × to remove it. There's no field to type one in, because a hand-typed tag would be a manual tag wearing the AI's badge. Instead there's a **Regenerate** link that puts back any AI tag that was removed, without disturbing the ones that were kept.
- **Manual Tags** — same removal, plus a field and an **Add** button. Enter also adds.

The footer becomes **Cancel** / **Save Changes**. Cancel puts every field back as it was.

**Rename** on a library asset opens the same form cut down to just the name field.

---

## Pick mode — the library as a chooser

When MAT or 3D Generate asks for an image, the library opens in pick mode instead of browse mode.

What changes:

- **The left nav collapses** to just Uploads → My Assets. There's no branch that leads to a grid you can't select from.
- **The grid narrows** to the user's own **uploaded images** — the only thing a reference slot can take.
- **A prompt bar** appears under the header: *"Choose up to 4 reference images from your uploads"* (or "a source image" for MAT), with a **"1 of 4"** counter on the right.
- **Multi-select is already on** — choosing is the only thing a click can mean here, so there's no ⋮ and no arming step.
- **At the cap**, unselected cards go dim and stop responding. Clicking one is refused rather than swapping out an earlier choice — silently dropping someone's earlier pick to make room is the worse surprise.
- **The footer** becomes **Clear** / **Cancel** / **Add N**.

Confirming closes the library and hands the picked assets back to the panel that asked for them. Cancelling does the same with nothing.

---

## Empty states

Each view has its own, and each carries the right action:

| View | Message | Button |
|---|---|---|
| Uploads | "No uploads yet. Bring in your own images, HDRIs or meshes." | Upload asset |
| 3D Meshes | "No meshes yet. Generate one from a prompt or reference image." | Generate 3D |
| Inside a folder | "This folder is empty. Use 'Add to Folder' on any asset." | — |
| Folders | "No folders yet. Group your uploads to find them fast." | Create Folder |
| Pick mode | "No uploaded images yet. Upload one to use as a reference." | Upload image |
| Any filter with no matches | "No assets match the current filters." | Clear filters |
