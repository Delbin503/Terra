# Terra Design System

A token-driven design system built the shadcn/ui way: **CSS variables** are the
source of truth, **Tailwind** maps utilities onto them, components are **Radix
primitives + `cva` variants**, and icons come from a **semantic Lucide registry**.

Everything themes automatically (dark default, light supported) because every
color resolves through a token — no component hardcodes a hex.

---

## 1. Tokens — `src/styles/tokens.css`

Two layers:

1. **Primitive palette** — literal color ramps, mode-stable
   (`--terra-500`, `--indigo-500`, `--moss-500`, `--gray-900`, …). Stored as raw
   HSL channels (`24 90% 52%`) so Tailwind can apply opacity.
2. **Semantic tokens** — the roles the UI actually consumes, remapped per theme:

| Role token | Purpose |
|---|---|
| `--canvas` | App background |
| `--surface` / `--surface-raised` / `--surface-overlay` / `--surface-sunken` | Elevation ladder |
| `--content` / `--content-muted` / `--content-subtle` / `--content-inverse` | Text |
| `--line` / `--line-strong` | Borders (used at low alpha, e.g. `border-line/10`) |
| `--brand` (+ `-hover` / `-soft` / `-foreground`) | Terra orange — primary actions |
| `--accent` (+ variants) | Indigo — AI / generative / 3D actions |
| `--success` / `--warning` / `--danger` (+ `-soft`) | Semantic status (separate from accent) |
| `--ring` | Focus ring |

Type / radius / elevation / layout tokens live in the same file
(`--font-display`, `--font-sans`, `--font-mono`, `--radius-*`, `--shadow-*`,
`--rail-w`).

**Theming:** `data-theme="dark"` (default) / `data-theme="light"` on `<html>`,
with `prefers-color-scheme` as the fallback. Flip themes by changing that one
attribute.

## 2. Tailwind mapping — `tailwind.config.ts`

Utilities are generated from the tokens, so you write intent, not values:

```tsx
className="bg-surface-raised text-content-muted border border-line/10 rounded-xl"
className="bg-brand text-brand-foreground"       // primary
className="bg-accent text-accent-foreground"     // generative / 3D
```

Type scale: `text-2xs … text-4xl`. Fonts: `font-display` (Sora), `font-sans`
(Inter), `font-mono`. Radii: `rounded-sm … rounded-2xl`. Shadows: `shadow-xs …
shadow-pop`.

## 2b. Text styles — `src/styles/globals.css`

Never write `text-sm font-medium` directly. **Every text in the editor uses a
named style.** Terra has two typographic worlds, and the prefix says which:

| | |
|---|---|
| `type-*` | **Chrome** — UI in glass panels and on solid surfaces |
| `type-scene-*` | **Scene** — diegetic type on the tilted 3D object label |

A style sets the **face only** — family, size, weight, tracking, case. Colour
stays a separate utility, so one style works across every tone:

```tsx
<p className="type-body text-content-muted">…</p>
<h2 className="type-eyebrow text-content-subtle">Transform</h2>
```

`-strong` always means **one weight step up** from its base.

### Chrome

**Headings**

| Style | Face | Use |
|---|---|---|
| `type-display` | Sora 2rem semibold | Hero · greeting |
| `type-title` | Sora 1.25rem semibold | Page + asset titles |
| `type-heading` | Sora 1.0625rem semibold | Section headings · dialog titles |
| `type-subheading` | Inter 0.9375rem semibold | Panel titles |
| `type-panel-title` | Inter 0.8125rem semibold | Panel header bar · chat author |
| `type-card-title` | Inter 0.6875rem semibold | Asset card overlay label |

**Body**

| Style | Face | Use |
|---|---|---|
| `type-nav` | Inter 0.875rem | Sidebar + category rows |
| `type-body-lg` | Inter 0.9375rem | Prominent body |
| `type-body-lg-strong` | Inter 0.9375rem medium | Menu rows |
| `type-body` | Inter 0.8125rem | **Default body** |
| `type-body-strong` | Inter 0.8125rem medium | List rows · inline emphasis |
| `type-body-dense` | Inter 0.75rem | Copy inside glass panels |

**Labels**

| Style | Face | Use |
|---|---|---|
| `type-label` | Inter 0.75rem medium | Control labels · tooltips |
| `type-label-strong` | Inter 0.75rem semibold | Field labels · status pills |
| `type-eyebrow` | Inter 0.6875rem semibold, uppercase | Section eyebrows |
| `type-caption` | Inter 0.6875rem | Meta · hints · timestamps |
| `type-caption-strong` | Inter 0.6875rem medium | Emphasised meta |

**Controls** — buttons and badges own their type rather than borrowing body
styles, because their scale is tied to control height, not to the prose ramp.
`Button` and `Badge` apply these from their `size` variant; you should not need
to set them by hand.

| Style | Face | Use |
|---|---|---|
| `type-button-xs` | Inter 0.75rem medium | Compact buttons |
| `type-button-sm` | Inter 0.8125rem medium | `Button size="sm"` |
| `type-button` | Inter 0.875rem medium | `Button size="md"` |
| `type-button-lg` | Inter 0.9375rem medium | `Button size="lg"` |
| `type-badge-sm` | Inter 0.6875rem medium, uppercase | `Badge size="sm"` |
| `type-badge` | Inter 0.75rem medium | `Badge size="md"` |

**Numeric, mono, glyph**

| Style | Face | Use |
|---|---|---|
| `type-numeric` | Inter 0.75rem, tabular | Transform fields |
| `type-numeric-sm` | Inter 0.6875rem, tabular | Detail readouts |
| `type-code` | Mono 0.8125rem | Token names · paths |
| `type-code-sm` | Mono 0.6875rem | Inline codes · hex values |
| `type-glyph` | 1.0625rem, no family | Emoji marks (falls through to the platform emoji face) |

Sora is reserved for the largest chrome headings — editor panel titles are Inter.

### Scene

Built from the `--type-scene-*` tokens (tokens.css): light Inter (weight 300),
tall-condensed via a synthetic `scaleY/scaleX` pair, because neither Inter nor
Sora ships a width axis. Two tiers, two ratios — the title is squeezed harder
(`1.28/0.8`) than the meta row (`1.18/0.86`) so the block reads as a hierarchy.

| Style | Covers |
|---|---|
| `type-scene-title` | The object name (click to rename) |
| `type-scene-nav` | The "← Back" affordance above it |
| `type-scene-mark` | The ⓘ mark perched on the title's last letter |
| `type-scene-badge` | Image · Master Object · Delete pills |
| `type-scene-body` | The object's description paragraph |
| `type-scene-readout` | The gizmo's live transform value |

`type-scene-title` and `type-scene-nav` carry their own condensing transform.
`type-scene-badge` / `-body` don't, because the transform sometimes belongs to a
wrapping row — use `type-scene-plane` (or `-plane-top`) there. Colour and
`textShadow` stay props: they adapt to scene luminance.

### Rules

- **Modifiers are fine, faces are not.** `tabular-nums`, `truncate`,
  `leading-*`, `uppercase`, and colour utilities compose freely with a style.
  A raw `text-*` or `font-*` next to a `type-*` class means the style is wrong —
  fix the style or add a new role.
- A Tailwind type utility beats a `type-*` class (utilities layer > components
  layer). Never leave a stale `text-xs` next to a `type-body` — it silently
  defeats the style.
- Name a new role when a pattern recurs. Single-use deviations should be rare
  enough to argue about.

Live specimen of every style, chrome and scene: **`<app>/#glass`**.

## 2c. Editor primitives — `src/features/editor/ui/`

The parts every editor panel is assembled from. `@/components/ui` holds the
solid-surface components; these are their glass-panel counterparts.

| Component | Parts |
|---|---|
| `Panel` | `PanelHeader` · `PanelTitle` · `PanelSubtitle` · `PanelEyebrow` · `PanelClose` · `PanelBody` · `PanelFooter` · `PanelSection` · `PanelRow` · `PanelAction` |
| `Field` | `TextInput` · `TextArea` · `Select` · `NumberInput` · `SearchInput` (sizes `sm`/`md`) |
| `Pill` | tones `neutral · muted · brand · master · danger · success · outline`; `PillButton` for toggles |

**Layer names.** Every part emits `data-ui="<instance>-<layer>"`, derived from
the parent's `ui` prop through context — the same Figma ↔ code ↔ runtime
identifier the glass ornaments use. `<Panel ui="object-info">` produces:

```
glass-object-info              ← surface (from GlassPanel)
  object-info-header
    object-info-title
    object-info-close
  object-info-body
    object-info-section-details
    object-info-row-position          (…-label, …-value)
  object-info-footer
```

`<Field label="Asset Name">` derives `field-asset-name`, `-label`, `-input`.
`<Pill ui="master">` derives `pill-master`, `-icon`, `-label`.

**Rules.** No primitive sets a raw font size, weight or colour — type comes from
the `type-*` styles (§2b), colour from the role tokens (§1). Input wells use the
`.field-well` class so the recess is one token (`--field-well`), not a
`bg-black/20` retyped per call site.

## 3. Components — `src/components/ui/`

All accept `className` and forward refs; variants via `class-variance-authority`.

| Component | Variants / notes |
|---|---|
| `Button` | `brand` · `accent` · `secondary` · `ghost` · `outline` · `danger`; sizes `sm/md/lg`; `asChild` |
| `IconButton` | icon-only, requires `label` (a11y); optional `indicator` dot |
| `Badge` | `brand` · `accent` · `neutral` · `success` · `outline` |
| `Card` | surface card; `interactive` adds hover lift |
| `Avatar` | initials + deterministic gradient fallback, or `src` |
| `Meter` | thin usage bar (`brand/success/warning/danger`) — credits, render time |
| `Tooltip` | Radix; `hidden` prop no-ops it (used for expanded sidebar) |
| `Dialog` | Radix modal: `DialogContent/Title/Description`, animated, ESC + backdrop close |

Import from the barrel: `import { Button, Card, Meter } from "@/components/ui"`.

## 4. Icons — `src/components/icons/index.tsx`

Backed by **lucide-react**. The product never imports raw glyph names — it
references **domain concepts** through one registry:

```tsx
import { Icon } from "@/components/icons";
<Icon name="create" size={18} />
<Icon name="render-time" />
<Icon name="input-3d" />
```

Naming convention: registry keys are **kebab-case concepts**
(`render-time`, `input-2d`, `sidebar-collapse`), each mapped to a Lucide
PascalCase glyph. Swapping an icon = one line here; every call site follows.
`IconName` is a union type, so `name` is autocompleted and type-checked.

## 5. Glass — visionOS overlay material (Terra Web editor)

The Three.js editor's UI is a **DOM overlay layer floating above the WebGL
canvas** — glass ornaments are HTML/CSS, never Three.js objects. The material
is defined entirely in tokens.

**Tokens (`tokens.css`, `--glass-*`):** blur / saturate / brightness knobs, a
white `--glass-tint`, a thickness ladder
(`--glass-thin/regular/thick/chrome/overlay`),
lighting (`--glass-highlight` specular, `--glass-inner` milky glow,
`--glass-border` hairline), ambient shadows (`--glass-shadow-sm/md/lg`), and
interaction deltas (`--glass-hover`, `--glass-frost-selected`). Dark values
suit dark scenes; the light theme adds body + a darker edge. Radius:
`--radius-3xl`.

**Dark glass:** the chrome is a **dark visionOS glass** — a dark ink body
(`--glass-ink`, ~0.6–0.92 opacity by thickness) with heavy blur + saturation, a
bright specular top edge (`--glass-highlight`), a luminous hairline border, and a
soft depth shadow. It stays legible over both bright and dark scenes (no runtime
sampling). Hover / selection add a faint **light wash** (frost-not-color), not a
colour fill. `--glass-tint` stays white — it only feeds the hover/edge utilities.

**Material classes (`globals.css`):** compose the tokens — reuse these, don't
hand-roll glass.

| Class | Use |
|---|---|
| `.glass` | base "regular" material — panels, inspectors |
| `.glass-thin` | lightest — hints, passive chrome |
| `.glass-thick` | heaviest — modals, primary ornaments |
| `.glass-chrome` | near-solid — circular buttons, pills |
| `.glass-interactive` | frost-on-hover + lift transition |
| `.glass-selected` | selection = **more frost, never a color fill** |

**Tailwind:** `glass` color (`bg-glass/10` ad-hoc), `rounded-3xl`,
`shadow-glass-sm/md/lg`.

**Components (`src/components/glass/`):** reusable, ref-forwarding, token-driven.

| Component | Notes |
|---|---|
| `GlassPanel` | base surface; `thickness` (thin/regular/thick/chrome), `interactive`, `selected`, `ui` |
| `GlassBar` | pill/panel container for floating toolbars (`shape` pill \| panel); wraps GlassPanel |
| `GlassDivider` | hairline separator inside a bar |
| `GlassIconButton` | standalone circular control; `label` (a11y), `active` = frost selection, `size` sm/md/lg |
| `GlassGhostButton` | icon control that sits *inside* a GlassBar (no nested glass); `label`, `size` sm/md |

**Tracking convention:** every glass instance carries `data-ui="glass-<name>"`
(via the `ui` prop), matching the Figma layer name and the `Glass<Thing>`
component name — one identifier across Figma ↔ code ↔ runtime. Preview:
`<app>/#glass` ([GlassPreview.tsx](src/features/editor/GlassPreview.tsx)).

### The `overlay` tier — menus and popovers

Every tier below `overlay` assumes glass floats over the **scene**. A menu
doesn't: the emoji picker covers the left rail, the action menu covers the asset
grid. Blur alone can't fix that — it smears a shape without removing it, so a
glass button underneath stays perfectly readable at 4–8px.

`overlay` therefore shares `--glass-thick`'s **body** — a popover and a docked
panel sitting side by side have to read as the same surface, so the tier can't
buy opacity — and spends its whole budget on **blur** instead
(`--glass-blur-overlay`, 24px vs the panel's 8px).

Used by the emoji picker, asset action menu, mesh-upload popover and generate
menu. Reach for it whenever a surface covers other chrome rather than the scene.

### Scene lighting variants

Glass is translucent over a scene we don't control, so one tuning can't work
everywhere. `EditorView` samples the rendered frame (~5×/sec, one readback,
shared with the object-title flip) and stamps `data-scene` on the editor root;
the `[data-scene]` blocks in tokens.css override the thickness ladder and edge
treatment, and inherit to every ornament below.

| Tier | Body | Edge | Why |
|---|---|---|---|
| `dark` | lighter (`regular` 0.22) | strong hairline `/0.30`, brighter specular | The ink has nothing to darken — pull the body back and let the edge define the shape |
| `dim` | default (0.30) | `/0.18` | The tuned baseline |
| `bright` | heavier (0.40) | softer `/0.14` | The light label is what's at risk; the edge already reads |

The trade runs the same way in both directions but inverted: **body** hides the
scene and protects the label, **edge** defines the panel's shape.

Thresholds are calibrated against measured frames — the default desert HDRI sits
at ~0.39 mean luminance, and a frame only passes ~0.6 if a blown-out sky fills
it. Each bound has a dead band so a slow orbit doesn't oscillate the chrome.

### Overlay layer order

Two things make z-index non-obvious in the editor, so the order is set
explicitly in `EditorView`:

- `.glass` sets `backdrop-filter`, which **creates a stacking context** — a
  popover's own `z-50` can't escape the bar it lives in.
- An element with no `z-index` paints in DOM order no matter how high its
  children reach.

Top bar `z-40` (it owns the emoji popover) · left rail `z-20` · object title
`z-20`. Docked panels sit in the root context at `z-30`/`z-40`.

## 6. Editor view — `src/features/editor/`

The default project view (`<app>/#editor`, [EditorView.tsx](src/features/editor/EditorView.tsx)):
a full-bleed **React Three Fiber** viewport (`SceneCanvas` — transparent WebGL
so theme tokens drive the backdrop; soft lights + infinite `drei` grid +
`OrbitControls` + orientation `GizmoViewcube`) with floating glass chrome on
top: `EditorTopBar` (brand mark · project name · undo/redo), `EditorLeftRail`
(scene/assets/AI circular tools), `EditorActions` (scene selector · account ·
Generate/download/save/exit), and home/fit gizmo buttons. The overlay is
`pointer-events-none`; controls opt back in — so the canvas keeps orbit/zoom.

**Panels** open from the rail (controlled by `EditorView`). `AssetLibrary`
(rail → Assets) is a **bottom-docked** glass drawer (two rows tall) using our
nav pattern (active = tint + brand bar): category filter, live search,
multi-select (brand ring + check), Uploads (expandable → device/URL).
Thumbnails are `AssetThumb` — self-contained seeded SVG mini-scenes per type
(sun/hills, play overlay for video, wireframe cube for mesh), **not flat color
cards** — no network/image deps.

Around that core:
- **Generate** is a menu (Image / 3D) that *arms the search field* into a
  prompt; Enter spawns a `generating` cell that resolves into the asset.
- **3D Meshes** uses `MeshUploadPopover`: upload → Generate Multi-view →
  `ready` cell → Generate Model → finished mesh (async cells carry
  `status`/`statusLabel` on the `Asset`).
- Each card has a hover **•••** → `AssetActionMenu` (View Details, Place in
  Scene, Generate 3D Mesh, Select, Add to Folder, Delete; secondary items are
  stubs) and a hover quick-info line.
- **View Details** opens `AssetDetailsPanel` — a right-docked glass panel
  (view + edit modes: description, smart/manual tags, details table). While
  open, the asset drawer shrinks its right edge (`right-[464px]`) so the
  details panel is **never covered**. Menu/popover/details render `fixed` to
  escape the drawer's `overflow-hidden`. Details derive from `deriveDetails()`.

## 7. Scene editing — objects, gizmo, contextual panels

Assets **drag/drop** from the library into the viewport: `AssetCard` is
`draggable`; `EditorView`'s drop handler raycasts the drop point onto the
ground plane (`CameraHandle` captured from inside the Canvas) and places a
`SceneObject`. Scene state lives in `useScene()` (objects + selection).

The viewport is a **stylized room** (`SceneCanvas` → `Room`: floor + two walls +
`ContactShadows`) you can orbit/pan around — a stand-in until real environment
assets load. Placed objects (`SceneObjectMesh`, varied placeholder primitives —
sphere/cylinder/cone/torus/capsule/ico/dodec per `SceneObject.shape` — with live
PBR material)
are **click-selectable**; the selected one gets an orange `Outlines` highlight,
a drei `TransformControls` gizmo (translate/rotate/scale), and the camera
**zooms to fit** it (`FocusRig` dollies in along the current view angle, saving
the room view and flying back to it on deselect; refocuses only on selection
change, not while dragging).

On focus the left rail icons fade out and `ObjectTitle` shows the object's name
as a big display title on the left (visionOS style). Its colour auto-adapts:
`EditorView` samples the scene luminance behind the title (only while an object
is focused) and flips the text light/dark with hysteresis, plus a contrasting
text-shadow — so it reads on any background.

Selection shows `ObjectToolbar` (bottom-center): **Object · Texture · Delete ·
Back**. Object/Texture open `ObjectPropertiesPanel` — a **compact bottom-right
panel** listing only that group's settings (Object → Position/Rotation/Scale +
gizmo-mode segmented; Texture → Color/Metallic/Roughness/Specular/Normal), each
row with a live value summary. Picking a row surfaces `SettingControl` — a
**small panel stacked above the toolbar** showing only that one control (axis
inputs/sliders from `controls-ui`, colour swatches, or a factor card). Edits
write back through `useScene().update`, so mesh, gizmo, summaries, and controls
stay in sync.

## 8. AI assistant

The **AI Tools** rail button opens a `RailFlyout` — three circular glass options
(**AI Chat / ASA / MAT**) that pop out with a staggered spring; icons only,
names on hover. **AI Chat** opens `AiChatPanel`, a left-docked glass chat.

The chat drives the shared scene store (`useScene`) via simulated NL intents:
- **add** ("add a chair") → assistant replies with pickable option cards →
  click places a `SceneObject`.
- **generate** ("generate a wooden crate", or with an attached image) →
  a `generating` bubble resolves into a placed object.
- **restyle** the selected object ("make it blue / metallic / bigger") →
  `scene.update`.
- **lighting** ("warmer / dimmer") → `scene.setEnv`, wired to the SceneCanvas
  lights (`brightness` + `warmth`). Lighting lives in `useScene` as `env`.

Intents are keyword-routed (add → generate → lighting → restyle → help); no
network/LLM — the responses are local so the flows are fully demonstrable.

## 9. Adding to the system

- **New color role** → add the semantic token in `tokens.css` (both themes) →
  expose it in `tailwind.config.ts` under `colors`.
- **New icon** → add one line to `iconRegistry`.
- **New component** → build on tokens + `cva`, export from `components/ui/index.ts`.
- **New text** → use a `type-*` style (§2b). Only add a new style if the role
  genuinely doesn't exist yet — reach for an override utility first.
