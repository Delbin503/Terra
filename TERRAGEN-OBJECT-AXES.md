# TerraGen — Object Role axes (Background Object · Distractor · Main)

Design + implementation doc for the two missing orchestrated axes in the TerraGen
Work Order: **Background Object** and **Foreground / Distractor Objects**, plus the
data-model change they both depend on. Analysis and plan only — nothing here is
implemented yet.

Decision already taken (this drives the whole doc): object identity is carried as a
**role on the scene object**, assigned in the viewport, not picked ad-hoc inside the
panel. That is the "Roles on objects" option — cleaner long-term, and it makes the
TerraGen panel read three object groups directly instead of guessing.

---

## 1. What we're adding, against the spec

The PRD table has nine axes. Seven are already built. The gap:

| Spec row | Status today |
|---|---|
| Viewing Angle · Distance · Weather · Time · Background(HDRI) · Arranged Layouts | ✅ built |
| **Main Objects** | ✅ built as the **Master** axis (`operation: swap \| property`) |
| **Background Object** | ❌ missing |
| **Foreground / Distractor Objects** | ❌ missing |

All three object rows use the *same* operation in the spec — *"Change of Object,
Property operation such as colour change."* The Master axis already implements exactly
that ([`MasterAxis`](src/features/editor/work-order.ts) → `operation`, `swapAssetIds`,
`colors`; editor `MasterEditor` in [terragen-axes.tsx](src/features/editor/terragen-axes.tsx)).
So the two new axes are the **same editor and same math as Master**, pointed at a
different group of objects. The work is 80% the role model, 20% cloning Master.

---

## 2. The blocker: objects have no role

Today a scene object carries a single boolean:

```ts
// scene-types.ts:21
interface SceneObject { …; isMaster: boolean; }
```

`isMaster` can express "this is the hero" and nothing else. There is no way to mark an
object as a *distractor* or a *background object*, so the panel has no group to read.
This is the exact gap the original brief flagged in
[TERRAGEN-PANEL.md](TERRAGEN-PANEL.md) §7.1.

### 2.1 The new field

Replace the boolean with a role enum:

```ts
// scene-types.ts
export type ObjectRole = "none" | "master" | "distractor" | "background";

interface SceneObject {
  …
  role: ObjectRole;   // was: isMaster: boolean
}
```

- **`none`** is the default for a freshly placed object (was `isMaster: false`).
- **Cameras and the HDRI never take a content role.** Cameras are the thing pointed
  *at* the hero; the HDRI is the Background *axis*, a different concept from a
  background *object*. The role control is hidden for `source === "camera"` and
  `source === "environment"`.

### 2.2 Invariants

- **Exactly one master.** Promoting an object to `master` demotes the previous one —
  the same exclusivity `setMaster` enforces today (useScene.ts:358), which also carries
  every camera rig across by the position delta so the framing the user built survives
  the swap. That logic is kept verbatim; only its trigger changes from a boolean to
  `role === "master"`.
- **Distractor and background are many-per-scene.** Setting them is a plain per-object
  write, no exclusivity, no rig follow.

### 2.3 A compatibility helper, so the migration is mechanical

Add one derived helper and route every existing read through it, rather than rewriting
each call's logic:

```ts
// scene-types.ts
export const isMaster = (o: SceneObject) => o.role === "master";
```

Every current `o.isMaster` becomes `isMaster(o)`; every write goes through the new
`setRole` (below). This keeps the diff shallow and greppable.

---

## 3. Migration map — every `isMaster` touchpoint

Confirmed by grep; nothing else references the field.

| File | Line(s) | Change |
|---|---|---|
| `scene-types.ts` | 21, 109, 142 | field `isMaster:false` → `role:"none"`; add `ObjectRole`, `isMaster()` helper |
| `useScene.ts` | 34, 316 | seed `role:"none"` |
| `useScene.ts` | 358 `setMaster` | rename → **`setRole(id, role)`**; keep master exclusivity + rig-delta; add plain-set branch for distractor/background |
| `useScene.ts` | 443 | `master = objects.find(isMaster)` (unchanged behaviour) |
| `useScene.ts` | 490, 504 | expose `setRole` (keep `setMaster` as a thin wrapper `setRole(id, v?"master":"none")` to avoid churn, or replace both call sites) |
| `EditorView.tsx` | 665, 818, 829 | pass `role`/`onSetRole` to toolbar & title instead of `isMaster`/`onToggleMaster` |
| `ObjectToolbar.tsx` | 20–90 | replace the single Master toggle with a **role control** (§4) |
| `ObjectTitle.tsx` | 59, 70, 319 | badge reads `role` (Master pill today → role pill, §4.1) |
| `ObjectInfoPanel.tsx` | 172, 196 | Master pill + "Master Object: Yes/No" row → a **Role** row/pill |
| `SceneLayersPanel.tsx` | 154, 448, 611 | context-menu "Mark as Master" → a **Role ▸** submenu; layer badge reads role |
| `SceneObjectMesh.tsx` | 138 | master highlight ring → keyed on `isMaster(object)` (optionally tint distractor/background differently) |
| `TerraGenPanel.tsx` | 93 | `masterCount = objects.filter(isMaster).length` (unchanged) |

Net: ~11 files, but most are one-line substitutions behind the `isMaster()` helper.

---

## 4. Assigning roles in the viewport

The role is set where the object lives — the bottom-centre `ObjectToolbar`. Today it has
one two-state "Master Object" tile (ObjectToolbar.tsx:49). Replace it with a **role
picker** covering all three content roles plus clear.

Recommended shape: keep it as a single tile that opens a small popover (Radix) with four
options — **None · Master · Distractor · Background** — each with its role colour. Reasons
over three separate toggle tiles:

- The roles are **mutually exclusive per object** (an object is one thing), so a
  radio-style popover models it correctly; three toggles imply you could stack them.
- The toolbar is width-constrained; three extra tiles crowd it.

Colours reuse the existing role tokens so the whole app agrees:

- `master` → the existing yellow (`glass-role-master`, `text-master`).
- `distractor` / `background` → assign two more role tokens (globals.css `[data-role]`
  blocks + `text-*-on-glass`), matching the pattern Master already uses. Suggest
  distractor = brand/orange-adjacent, background = a muted cyan/slate — needs a token
  decision (see §8).

### 4.1 Where roles surface (read-only)

- **ObjectTitle** (ObjectTitle.tsx:319): the Master pill becomes a role pill, shown for
  any non-`none` role.
- **ObjectInfoPanel** (ObjectInfoPanel.tsx:172/196): the Master pill and the
  "Master Object" details row become a single **Role** row.
- **SceneLayersPanel** (448): the layer badge shows the role; the context menu (611)
  offers a **Role ▸** submenu instead of a single toggle.
- **SceneObjectMesh** (138): the selection/hero ring stays master-only, or gains faint
  per-role tints (optional, §8).

---

## 5. The two new axes in `work-order.ts`

They are structural twins of the Master axis. Master stays exactly as-is.

### 5.1 Axis registry

```ts
// AxisId union (was 7 → 9)
export type AxisId =
  | "angle" | "distance" | "weather" | "time" | "background"
  | "master" | "bgObject" | "distractor" | "layouts";
```

Add two `AXES` entries. They are `kind: "orchestrated"` (they multiply **subsets**, the
expensive kind — a full scene rebuild per value). Group: put them with the object axes.
Two layout choices (§8): keep the current Camera/World split and drop both into **World**,
or introduce a third stack group **"Objects · multiplies subsets"** holding Master +
Background Object + Distractor together. The latter reads better — the three object axes
are one family — but moves Master out of the Camera group where it currently anchors the
rig visually.

```ts
{ id: "bgObject",   kind: "orchestrated", group: "world", label: "Background Object",
  icon: "input-3d",
  blurb: "Swap a background object or change a property (e.g. colour). Each value is a full re-render." },
{ id: "distractor", kind: "orchestrated", group: "world", label: "Distractor Objects",
  icon: "input-3d",
  blurb: "Foreground clutter the detector must ignore. Swap or set a property per distractor; each value re-renders every frame." },
```

`ORCHESTRATED_IDS` (work-order.ts:560) is derived from `AXES`, so both are picked up by
the multiplier machinery automatically — **no change to `computeTotals`**.

### 5.2 Axis state

Generalise `MasterAxis` into a shared `ObjectAxis` shape (Master keeps using it):

```ts
export interface ObjectAxis extends AxisBase {
  operation: "swap" | "property";
  swapAssetIds: string[];   // replacement meshes from the library
  colors: string[];         // extra colours (property op)
}
// WorkOrder gains:  bgObject: ObjectAxis;  distractor: ObjectAxis;
```

The object(s) each axis acts on come from the **scene**, not the draft — read by role,
the same way Master reads `scene.master`. That is what makes "axis off = what the scene
already shows" hold for these too.

### 5.3 `axisValues` (work-order.ts:472)

Clone the `master` case. Base value = the role's object(s) as they stand; `on` adds the
swap/property values:

```ts
case "bgObject":   return objectAxisValues(o.bgObject,   bgObjects,   assetName);
case "distractor": return objectAxisValues(o.distractor, distractors, assetName);
```

where `bgObjects` / `distractors` are `scene.objects.filter(role)`. `axisValues` currently
takes only `master`; extend its signature (or pass a small `{ master, bgObjects,
distractors }` roles bundle) — this ripples to `axisSummary`, `computeTotals`,
`permutationCells`, all of which already thread `master` through.

### 5.4 Editor

Generalise `MasterEditor` → **`ObjectAxisEditor`** parameterised by role group and axis
key. Master renders it with the rig-framing block it has today; Background Object and
Distractor render the same Swap/Set-property `Segmented` control minus the rig block
(they don't anchor the camera). The empty-group state mirrors Master's "Nothing is marked
as Master" notice: *"No objects marked Distractor — mark one in the viewport."*

### 5.5 Seeding

`deriveWorkOrder` (work-order.ts) gains two defaults, identical to master's:

```ts
bgObject:   { on: false, operation: "swap", swapAssetIds: [], colors: [] },
distractor: { on: false, operation: "swap", swapAssetIds: [], colors: [] },
```

`useWorkOrder`'s `toggle`/`patch` are generic over `AxisId`, so they need **no change**.

---

## 6. Budget, preview, preflight — mostly free

- **Budget** ([terragen-budget.tsx](src/features/editor/terragen-budget.tsx)): multipliers
  come from `ORCHESTRATED_IDS` × `axisValues().length`, so the two axes appear in the
  subset math and the DispatchReview breakdown with zero extra wiring.
- **Permutation preview**: `permutationCells` walks `ORCHESTRATED_IDS` — also automatic.
- **ScenePreview** ([terragen-preview.tsx](src/features/editor/terragen-preview.tsx)): no
  change required; optionally highlight distractors/background objects when their axis is
  selected (nice-to-have).
- **Preflight** ([work-order.ts](src/features/editor/work-order.ts) `preflight`): add a
  soft gate — *"Background Object axis is on but no object is marked Background"* — level
  `warn`, not `block`, so an empty group degrades to a single base value rather than
  failing dispatch. Master's "exactly one" gate is unchanged.

---

## 7. File-by-file change list

**Data model / scene**
- `scene-types.ts` — `ObjectRole`, `role` field, `isMaster()` helper, seeds
- `useScene.ts` — `setRole` (master exclusive + rig-follow kept; distractor/background plain), `master` derivation, exports
- `SceneObjectMesh.tsx` — highlight keyed on role
- `ObjectToolbar.tsx` — role picker popover
- `ObjectTitle.tsx` — role pill
- `ObjectInfoPanel.tsx` — Role row/pill
- `SceneLayersPanel.tsx` — role badge + Role▸ submenu
- `EditorView.tsx` — thread `role`/`onSetRole`

**TerraGen**
- `work-order.ts` — `AxisId` +2, `AXES` +2, `ObjectAxis`, `WorkOrder` +2 fields,
  `axisValues`/`axisSummary` roles bundle, `deriveWorkOrder` defaults, `preflight` warn
- `terragen-axes.tsx` — `ObjectAxisEditor` (generalise `MasterEditor`), `AxisEditor`
  switch +2 cases
- `TerraGenPanel.tsx` — `masterCount` via `isMaster()`; stack grouping if a third
  "Objects" group is chosen
- `useWorkOrder.ts` — none (generic)
- `terragen-budget.tsx`, `terragen-preview.tsx` — none required

No new files strictly needed, though `ObjectAxisEditor` could move to its own file if
`terragen-axes.tsx` grows too large.

---

## 8. Decisions to lock before building

1. **Stack grouping** — drop Background Object + Distractor into the existing **World**
   group, or make a new **"Objects · multiplies subsets"** group that also pulls Master
   in? (Recommend the Objects group; it reads as one family. Cost: Master leaves the
   Camera group.)
2. **Role colours** — Master owns yellow. Need two more role tokens for distractor and
   background (globals.css `[data-role]` + `text-*-on-glass`). Pick the hues.
3. **Property operations** — Master's property op today is colour only. Same scope for
   the new axes, or add more properties (scale, material)? (Recommend colour-only for
   parity now.)
4. **Multi-object groups** — if three objects are marked Distractor and the axis swaps,
   does one value swap *all three*, or is it per-object cross-product? (Recommend the
   simple model: the axis produces N values applied to the group as a set; per-object
   cross-product is a much bigger multiplier and a later enhancement.)
5. **Role control affordance** — popover (recommended) vs. inline segmented vs.
   cycle-on-click tile.

---

## 9. Verification

- Type-check clean after the `isMaster` → `role` migration (the helper keeps reads
  compiling; writes must all move to `setRole`).
- In the viewport: mark objects Master / Distractor / Background; confirm exactly one
  Master holds, rigs follow a master swap, badges/pills update in title, info panel, and
  layers.
- In TerraGen: toggle the two new axes; confirm the subset count in the budget rail and
  DispatchReview moves by the number of values, the permutation grid lists the new axes,
  and the empty-group preflight warning shows and clears.
```
