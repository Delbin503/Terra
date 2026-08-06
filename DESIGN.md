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
white `--glass-tint`, a thickness ladder (`--glass-thin/regular/thick/chrome`),
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
