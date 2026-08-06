# Terra — Session Notes

Working session log for the TerraWeb editor. Captures what changed, **why**, and the
non-obvious things discovered along the way so none of it has to be re-derived.

Date: 2026-08-05 → 2026-08-06

---

## 0. Read this first — the two-copies hazard (RESOLVED 2026-08-06)

There used to be **two diverging copies** of this project. This is now resolved:
the iCloud path is a **symlink** to the canonical local copy, so there is one real folder.

| Path | Role |
| --- | --- |
| `/Users/PROM1/projects/Terra` | **Canonical — the single source of truth.** Edit this one; dev server runs from here. |
| `~/Library/Mobile Documents/com~apple~CloudDocs/Terra` | **Symlink → the canonical copy.** No longer a separate copy. |

**How it was resolved:** the stale iCloud copy (contents from Aug 4, no unique files,
no HDRI/models) was backed up, deleted, and replaced with
`ln -s /Users/PROM1/projects/Terra "<iCloud>/Terra"`. Confirmed same inode through both
paths. The local copy (Aug 6, with `public/hdri/aarfontein_dusk_4k.exr`) won.
> Note: because iCloud stores only the symlink, the file contents are **not** synced to
> other devices — this is a link for consistency, not a cross-device backup.

Historical consequences of the divergence (kept for context — no longer active):

- A whole round of edits once landed in the iCloud copy and never reached the running
  app. Absolute paths into `projects/Terra` are still the safe habit.
- The shell cwd could silently reset to the iCloud path; now that path resolves to the
  same folder, so a bare `sed src/...` no longer reads a different file.
- `preview_start {name}` reads `.claude/launch.json` from the session cwd; both paths
  now resolve to the same `launch.json`.

Verify a change actually shipped by reading it off the live page, e.g.
`getComputedStyle(document.documentElement).getPropertyValue('--glass-regular')`,
rather than trusting the file on disk.

---

## 1. Design system / glass material

Aligned to Figma node `285:15760` (`get_design_context`), which specs the toolbar
button as `rgba(12,12,12,0.3)`, radius 16, padding 20/10, text `#d4d4d4`.

**`src/styles/tokens.css`**

- `--glass-ink: 0 0% 5%` — neutral `rgb(12,12,12)`, previously blue-tinted `225 16% 10%`.
- Thickness ladder pinned to the Figma value: `thin .20 / regular .30 / thick .40 / chrome .50`.
- `--glass-saturate: 185% → 125%`. The big boost amplified the desert HDRI's oranges
  and the glass read muddy brown. Vibrancy should come from blur, not chroma.
- `--glass-brightness: 1.02 → 1`.
- `--glass-blur: 30px → 4px` (strong `44px → 8px`), tuned down over several rounds.
  At 30px the scene smeared into a flat wash; the Figma reference still reads rock
  texture through the button.
- Shadows softened from near-opaque blue-blacks (`0.5–0.72`) to neutral `0.12–0.24`
  so panels float rather than sit.
- `--glass-border: 0.12 → 0.18`.
- `--master: 45 93% 58%` (dark: `42 88% 45%`) — Master Object's own role colour,
  registered in `tailwind.config.ts` as `master`.

**Text legibility** (`--content-muted` `62% → 82%`, `--content-subtle` `44% → 70%`).
`subtle` sits over transparent glass on an unpredictable scene, so it can't go as dim
as it could on a solid surface — at 44% the panel values were effectively invisible.
A `0.1px` black `-webkit-text-stroke` on `.glass` (globals.css) inherits to children.

**Material consistency** — everything floating now uses plain `.glass` (`0.30`):
`GlassIconButton` default tone `chrome → regular`, `GlassBar` `thick → regular`.
Rail, top bar and object toolbar all compute to `rgba(13, 13, 13, 0.3)`.

> Known deviation: toolbar radius renders 18px (`!rounded-2xl`) vs Figma's 16px.
> Left alone rather than adding an off-scale token.

---

## 2. Object title block (`ObjectTitle.tsx`)

The focused object's diegetic label — everything lives on one tilted plane
(`rotateY(19deg) rotateX(7deg)`).

- **Back** button above the title, matching the title's face exactly (same family,
  weight 300, same `scaleY(1.28) scaleX(0.8)` condensed scale). Only the *label* is
  scaled — scaling the button would squash the arrow.
- **Info icon** on the Back row (replaced an earlier "View Info" text link).
- **Badges**: type (`Image` / `3D Mesh`) first, then `Master Object` when set.
- **Description**, then **Delete** (moved out of the bottom toolbar so the
  destructive action isn't adjacent to the mode tabs).

### Gotchas encoded here

- **`relative z-10` on the Back row is load-bearing.** The title's `scaleY(1.28)`
  makes its *painted* box creep upward over the row; without the stacking fix,
  `elementFromPoint` at the Back button's own centre returned the `<h1>`, so
  clicking Back started a rename instead.
- **Badge legibility comes from the fill, not a stroke.** A `0.5px` black
  text-stroke was tried and read muddy — it thickens small letterforms rather than
  separating them. Each badge now tints its **own dark hue at 30%**
  (`hsl(26 90% 13% / .3)` etc.) over a 6px blur.
- **Title truncation** is middle-ellipsis, binary-searched against real measurement:
  `Building Mechanical Machine Assembly Rig → Building Mec…Rig`. Measured, not
  estimated, because the condensed scale transform means character counts don't
  track the true wrap point. A `-webkit-line-clamp: 2` + `overflow: hidden` is a
  structural cap underneath (a single unbreakable word could still overflow).
  Line-fit is calibrated against a **real rendered line**, not `2 × lineHeight` —
  `line-height` is `0.95`, tighter than the glyphs, so a naive 2× test rejects text
  that does fit. The full name is restored on rename so edits act on real text.
- The container needs a **definite width** (`w-[30rem] max-w-[44vw]`). `inline-block`
  shrink-to-fit collapsed the title into a ~9-line column, and
  `w-[min(30rem,44vw)]` generated no CSS at all (Tailwind didn't emit it).

---

## 3. Selection / hover outline (`SceneObjectMesh.tsx`)

Rewritten from scratch after drei's `<Outlines>` proved unreliable.

**The original bug:** `<Outlines>` was a child of the `<group>`, not the `<mesh>`.
It clones its **parent mesh's** geometry, so as a group sibling it silently rendered
nothing — meaning **the old orange selection outline had never worked either**.

Even parented correctly it kept failing (`transparent` broke it; conditional
mounting was flaky because it resolves geometry via layout effects). It's now an
**explicit inflated back-face shell** — the same technique `Outlines` uses
internally, but owned:

```tsx
<mesh scale={OUTLINE_SCALE} raycast={() => null}>
  <ShapeGeometry shape={object.shape} />
  <meshBasicMaterial color={…} side={BackSide} toneMapped={false} />
</mesh>
```

- `raycast={() => null}` — otherwise the shell steals the pointer and thrashes hover.
- Colours: selected `#ffffff`, hover `#d8d8d8`, **master `#f8c630`**, master-hover
  `#c79c25`. Master colour is a hand-synced literal of `--master` (three.js
  materials can't read CSS tokens).
- `OUTLINE_SCALE = 1.014`.

> **Thickness is proportional to the object, not the viewport.** It's a uniform
> scale-up, so a large object gets a thick stroke and a small one a thin stroke —
> which is why it looked heavy in focus mode. A constant pixel width at any zoom
> would need a screen-space shader offset instead.

---

## 4. Camera: auto-orbit on focus (`SceneCanvas.tsx`)

`OrbitControls.autoRotate` orbits the **camera** around the focused object. The
object itself is never rotated — that would overwrite `rotationDeg` every frame and
fight the rotate gizmo. Verified: rotation stayed `0°, 0°, 0°` throughout.

Two guards were required:

1. Held off until `FocusRig`'s fly-in lands, else the spin fights the lerp.
2. **Paused while the transform gizmo is dragged** — three.js `OrbitControls` keeps
   auto-rotating even when `enabled = false`, so the existing "disable controls on
   drag" was not enough; the camera would spin under the cursor mid-drag.

---

## 5. Unreal Engine 5.8 gizmo skin (`unreal-gizmo.ts`)

UE 5.8 shipped June 2026 with a new Editor Gizmo System (thinner profile with bigger
hit targets, renders above the object, axes hide during interaction, numeric delta
readout, delta lines, plane handles further out, larger screen-space centre,
precision/nudge modes, interaction presets).

### The critical discovery

**@react-three/drei constructs `three-stdlib`'s TransformControls, not
`three/examples`.** They are structurally different, and targeting the wrong one
**silently no-ops**:

| | `three/examples` | `three-stdlib` (what drei uses) |
| --- | --- | --- |
| Gizmo root | `controls._gizmo` (private) | `controls.gizmo` (public) |
| Material restore cache | `_color` / `_opacity` | `tempColor` / `tempOpacity` |
| Axis shafts | `Mesh` cylinders | `Line` |
| Plane handles | axis-tinted | yellow / cyan / magenta |

Two more constraints baked into the code:

- **Handle offsets are baked into geometry.** `setupGizmo()` bakes each mesh's local
  matrix into a cloned geometry then resets the transform to identity — so moving a
  handle means rebuilding its geometry. Writing `.position` does nothing (it's
  overwritten with the gizmo's world position every frame).
- **Materials are restored every frame** from the cache. Setting `.color` alone is
  reverted a frame later; the cache must be overwritten too.

Applied: UE axis colours, plane handles recoloured to their normal axis with border
lines dropped, plane handles pushed out (`0.15 → 0.28`), enlarged **billboarded**
screen-space square, white outer rotate ring (stock is yellow), axes hide during
drag, live numeric delta readout.

The readout is **event-driven** (`objectChange` / `dragging-changed`) rather than
`useFrame` — it updates exactly when the value does and costs nothing on idle frames.

---

## 6. Other feature work

- **Gizmo gated to Object settings** (`showGizmo={editTab === "object"}`); otherwise
  selection reads as the white outline alone.
- **Texture toggles removed.** The `metalnessOn` / `roughnessOn` / `specularOn` /
  `normalOn` flags were deleted from `SceneObject` entirely (plus the orphaned
  `Toggle` component). ⚠️ **Behaviour change:** Specular and Normal used to default
  to *off*; they're now always live at their stored defaults. Neither is wired into
  the material yet, so nothing changes visually today — but it matters when they are.
- **Colour picker** in `SettingControl` — native `<input type="color">` as a
  transparent overlay on a styled swatch (styling the control directly is
  inconsistent across browsers), with a live hex readout.
- **Setting panel** narrowed 440 → 340px and given a **drag handle** (pointer
  capture; stores an *offset* so it stays centred until moved and keeps placement
  across settings). `GripHorizontal` registered as `drag` in the icon registry.
- **Master Object** — `isMaster` on `SceneObject`, yellow toolbar toggle, title
  badge, info-panel row, yellow outline.
- **`ObjectInfoPanel`** — right-docked view/edit panel, type scale matched to
  `ObjectPropertiesPanel`, `top-20` so it clears the Generate bar.
- **`ProjectEmojiPicker`** — the top-bar mark is now an emoji button with a grouped
  palette on `GlassPanel` (identical material to the rest of the chrome). Default is
  derived from the project name via a keyword table (`Traffic Scene → 🛣️`).

---

## 7. Verification pitfalls (cost real time — worth knowing)

- **HMR staleness.** After editing `SceneCanvas`, HMR kept old component state and
  the orbit looked broken until a full reload. Reload before concluding a bug.
- **HMR resets the scene.** Objects live in React state only, so an HMR update or
  reload clears them — an empty viewport after an edit is usually this.
- **Spent WebGL context.** A tab through dozens of HMR cycles went permanently black
  (drei's `EnvironmentGround` crashing the Canvas). A fresh tab rendered fine.
- **Console buffer is retained across reloads** — stale errors from a broken
  intermediate build keep appearing. Check the timestamp query (`?t=…`) on the stack
  frames before believing them.
- **Synthetic pointer events don't engage the gizmo raycast** (`setPointerCapture`
  needs a real pointer id), so scripted drags silently do nothing. Use real drags,
  and confirm engagement by checking the object actually moved.
- **Instant scripted drags never tick `useFrame`** — down/move/up in one burst means
  no frame renders while `dragging` is true, so frame-driven UI looks broken.
- **Canvas downsampling hides thin lines.** A 300×340 downsample counted 0 pixels for
  a 1–2px outline that was clearly visible in the screenshot.
- The 79 MB HDRI takes ~20s on a cold server — a black viewport is often just that.

---

## 8. Open items / decisions for you

| Item | Note |
| --- | --- |
| Emoji not persisted | Lives in `EditorTopBar` state; resets on reload. Needs project state or localStorage. |
| GLB models have no outline | Outline shell only exists in the placeholder-shape branch; the `modelUrl` `<Model>` branch is unhandled. |
| Outline thickness | Proportional to object size, not viewport-constant. Needs a screen-space offset for uniform width. |
| Master Object not exclusive | Several objects can be master at once; one-per-scene was never specified. |
| Setting panel drag unbounded | Can be dragged off-screen with no way back except close/reopen. |
| Specular / Normal | Always-on now, but not wired into the material. |
| ~~Stale iCloud copy~~ | ✅ Resolved 2026-08-06 — iCloud path is now a symlink to the canonical copy (see §0). |
| Toolbar radius | 18px vs Figma 16px. |

---

## 9. Handy commands

```bash
# typecheck just the app (vite.config/tsconfig.node errors are pre-existing)
cd /Users/PROM1/projects/Terra && npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "^src/"
```

```bash
cd /Users/PROM1/projects/Terra && npm run dev
```
