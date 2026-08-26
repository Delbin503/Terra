# TerraArrange — feasibility & design notes

A research pass over the reference video (`WhatsApp Video 2026-08-25 at 21.22.48.mp4`,
2m37s, Unreal Engine "Scene Assembler" plugin) and a feasibility verdict for building the
same capability — **define a space, spawn objects only inside it, randomize the
arrangement across sets** — in Terra's three.js editor.

**Status: Phase 1 and Phase 3 are built** (see §7 for the phasing). The volume, its
handles, containment, the seeded solver and the Arrangement axis in the Generate
panel all ship in `feat/editor-terragen-camera-mat`. Phase 2 is partly in — wall
faces, support surfaces and clearance are implemented; a failure report exists but
the constraint list is per-object rather than per-concept. Phase 4 (the prompt lane)
is untouched. The rest of this document is the reasoning it was built from.

Companion docs:
- [TERRAGEN-DISCUSSION.md](TERRAGEN-DISCUSSION.md) — what the Work Order is and how axes multiply.
- [TERRAGEN-OBJECT-AXES.md](TERRAGEN-OBJECT-AXES.md) — roles, and why they live on the scene.

---

## 1. What the video actually shows

Frames sampled every 2s and read at full resolution. The plugin is a dockable Unreal panel
titled **Scene Assembler**, talking to an out-of-process service (`Connected`, green).

### The panel, top to bottom

| Control | Value in the video |
|---|---|
| `Length (m)` `Width (m)` `Height (m)` | `8`, `8`, `2.7` |
| `Template name` + `Save template` | empty, placeholder `e.g. cozy_bedroom` |
| Prompt box | `Message the scene agent…` + `Send` |
| Suggestion chips | `layout like a bedroom` · `create a c…` · `add a floor lamp` · `remove the cup` |

Those four chips are the whole verb set the product is claiming: **relayout, create, add,
remove**.

### The run

| t | What happens |
|---|---|
| 0–16s | Panel idle. Empty level: a `Floor` static-mesh actor scaled to 8, one light. Outliner: **10 actors**. |
| ~16s | Prompt typed: *"create a kitchen scene with a stove, cabinets a door and a window and a table with 4 chairs"* |
| 18–100s | `Thinking…` — **~80 seconds** of nothing. This is the honest latency number. |
| ~100s | Reply streams in: a `CREATE` badge, a plain-language echo, then a greyed **`Refined:`** line, then **`Placed 11 objects`**. Outliner: **21 actors**. |
| ~108s | Follow-up: *"add a pot on the table"* → **`Updated 1 change(s)`**. Outliner: **22 actors**. The pot lands on the table's top face, not the floor. |
| ~140s | Play-in-editor walkthrough, then a sky/lighting swap. |

The `Refined:` line is the LLM's expanded prompt, shown back to the user:

> Kitchen in an 8m x 8m room with a stove and kitchen cabinets against the back wall facing
> into the room, a door on the front wall, a window on the left wall, and a dining table
> near the room center with 4 chairs facing in.

### Three findings that matter more than the UI

**1. The "space" is three numbers, not a drawn volume.** There is no box gizmo, no
wireframe, no click-drag-to-define. Nothing in the viewport ever shows the 8 × 8 × 2.7
extent. The only thing you can see is the `Floor` plane, which happens to be scaled to
match. The height (2.7 m) is never visualised at all.

**2. Containment is not actually enforced.** At t≈102s, with the placement finished:
several cabinets and counters are sitting **well outside** the 8 × 8 floor plane — one at
the bottom-left, one at the right, both clearly off the deck. The dimensions are being fed
to the LLM as *prompt context*, and the LLM is returning world coordinates it thinks are
reasonable. Nothing clamps them.

**3. The refined prompt describes walls that do not exist.** "Against the back wall",
"a door on the front wall", "a window on the left wall" — the level has a floor and
nothing else. The door and window come in as free-standing slabs, floating in the middle of
open ground with no wall to sit in. The *language* of the room is there; the *geometry* of
the room is not.

So the reference does the hard, expensive part (an LLM that knows what a kitchen contains)
and skips the cheap, deterministic part (making the objects obey the box). **The cheap part
is the part the user asked for, and it is the part three.js is good at.**

---

## 2. Verdict: yes, and most of the scaffolding is already in this repo

Broken into the five capabilities the request implies.

### A. Define a volume — trivial

A volume is `{ center: Vec3, size: Vec3, rotationY: number }`. Drawn as
`EdgesGeometry(BoxGeometry(...))` in a `<lineSegments>`, or drei's `<Edges>`. Add a
translucent floor quad so the footprint reads at a glance — which is already more than the
reference shows.

For a draggable resize gizmo there are two routes, and the second is better here:

- drei `<PivotControls>` with `disableRotations` and `activeAxes` — quick, but it scales
  about a pivot rather than pushing one face.
- **Corner/face handles using the plane-drag idiom this repo already has.**
  `SceneCanvas.tsx:1048–1076` (`orbitAt` / `heightAt` in `ClimbGrip`) is exactly this
  pattern: capture the pointer, build a `Plane`, `ray.intersectPlane` every move, suspend
  `OrbitControls` for the duration. A face handle is the same code with a different plane.
  The comment there about `raycast={dragging ? Mesh.prototype.raycast : () => null}`
  (`SceneCanvas.tsx:902`) is a landmine already defused — reuse it, don't rediscover it.

### B. Clamp objects into the volume — trivial

The important detail: clamp the object's **bounds**, not its origin. A 2 m table whose
origin sits 0.1 m inside the wall still pokes 0.9 m through it.

```
box   = new Box3().setFromObject(mesh)       // world-space
half  = box.getSize(v).multiplyScalar(0.5)
min   = volumeMin + half + margin
max   = volumeMax - half - margin
pos.clamp(min, max)
```

Two hook points, both already exist:

- **`EditorView.tsx:488` `handleDrop`** — currently raycasts against
  `new Plane(new Vector3(0,1,0), 0)` and drops at `y = 0.5`. Swap the plane for the
  volume's floor and clamp `point` in X/Z.
- **`useScene.ts:404` `update`** — every gizmo drag lands here as a `position` patch.
  Clamp there and containment holds for drags, the properties panel, undo/redo and the AI
  agent at once, because they all funnel through this one function. (Watch the rig-partner
  branch: clamping a camera would fight the sweep. See §6.)

`TransformControls` also fires `objectChange`, which `SceneCanvas.tsx:329` already listens
to — that's the place for a live "you're at the wall" affordance if it's wanted.

### C. Spawn only inside the volume — trivial to moderate

Rejection sampling: pick a point in the box, test the candidate's AABB against every
already-placed AABB plus a clearance margin, retry up to N times, then give up and report
honestly rather than stacking objects.

- Axis-aligned: `Box3.intersectsBox` — in core three.
- Rotated: `three/addons/math/OBB.js`, imported explicitly. Worth it once yaw is free.
- "On the table": a downward `Raycaster` from above the candidate against the set of
  registered support surfaces. `SceneWorld` already collects meshes via its `register`
  callback (`SceneCanvas.tsx:60`), so the raycast target list is a filter away.

Rejection sampling with an overlap threshold is what the current scene-synthesis literature
uses too (CasaGPT generates K candidates and rejects on 3D IoU) — the approach is not a
shortcut, it *is* the technique.

Performance: at 10–100 objects this is microseconds. `three-mesh-bvh` (needs three ≥ 0.159;
this repo is on 0.169) only starts to matter if support-surface raycasting runs against
tens of thousands of triangles every frame. **Do not add it up front.**

### D. Randomize across sets — already modelled, deliberately switched off

This is the surprise. `work-order.ts:179` already declares:

```ts
export interface LayoutAxis extends AxisBase {
  count: number;                        // how many arrangements
  volume: [number, number, number];     // metres
  concepts: string[];
}
```

…seeded at `work-order.ts:383` with `{ on: false, count: 4, volume: [10,4,10], concepts: [] }`,
counted by `axisValues` at `work-order.ts:425`, and hidden from the panel by one line:

```ts
export const PANEL_AXES = AXES.filter((a) => a.id !== "layouts");   // work-order.ts:113
```

The comment above it says why: *"TerraArrange doesn't exist yet, so its editor could only
ever author a request nothing can answer."* And the editor UI is **already written** —
`terragen-axes.tsx:188–290` renders the count stepper, the X/Y/Z volume inputs and the
concept chips, ending in a disabled `Preview layouts` button.

So the Work Order side of this feature is mostly **unhiding and wiring**, not building.

One field is missing from the model and should be added before anything is built on it:

```ts
seed: number;   // a layout you cannot regenerate is not a dataset
```

Every arrangement in a run must be reproducible from `(spec, seed, index)`. Without it,
"render me these 4 layouts" produces four arrangements nobody can ever get back.

### E. Chat-driven placement — this is the real gap

`ai-agent-script.ts` is a **scripted mock**. Its `Op` union (`ai-agent-script.ts:168`) only
patches the conversation thread — `add`, `patch`, `patch-run`, `drop-thinking`. There is no
op that touches the scene, and `AiAgentPanel.tsx:158` `applyOps` never calls into
`useScene`. The `terra.scene.query({...})` block at `ai-agent-script.ts:366` is display
text, not a call.

Making the chat actually place things needs a tool-call layer that didn't exist before. That
is the one genuinely new subsystem here — everything in A–D is arithmetic on data the repo
already holds.

---

## 3. The design call that decides whether this is good or bad

**The LLM must return a constraint spec, not world coordinates.**

The reference video asks the model for positions and gets furniture outside the room and
doors floating in space. That failure is structural, not a prompt problem: a language model
has no collision test and no metre stick.

Split it:

```
prompt ──► LLM ──► LayoutSpec (constraints, no numbers) ──► solver ──► Placement[]
                                                            └─ deterministic, seeded,
                                                               collision-aware, testable
```

A spec entry is a sentence the solver can satisfy or honestly refuse:

| Field | Values |
|---|---|
| `anchor` | `floor` · `wall:<back\|front\|left\|right>` · `ceiling` · `on:<objectId>` |
| `clearance` | metres of free space required around the footprint |
| `margin` | metres held back from the volume edge |
| `facing` | `centre` · `out` · `toward:<objectId>` · `free` |
| `yaw` | `free` · `quantised:90` · `locked` |
| `count` | how many of this concept to scatter |
| `onCollision` | `reject` · `pushApart` · `allow` |

"Stove: `wall:back`, clearance 0.1, facing centre" is checkable. "Stove at (312, 0, -84)"
is a guess. The solver either satisfies every constraint or reports which ones it couldn't —
and *that* report is what the panel shows instead of silently producing a broken room.

Seeded RNG is five lines (mulberry32 / sfc32); no dependency needed.

---

## 4. Walls should be a property of the volume

The reference's refined prompt says "against the back wall" for a level with no walls. If
Terra's volume carries a per-face flag — `open` / `wall` / `glass` — then:

- `wall:back` resolves to a real plane the solver can press an object flat against,
- the containment box becomes visible as geometry rather than an invisible rule,
- a door or window becomes a cutout in a face instead of a slab standing in a field.

This is a small amount of geometry (six quads, five of them usually off) that makes the
entire constraint vocabulary honest.

---

## 5. Where the volume lives in the data model

**Scene state, not Work Order state.** Same reasoning already written down for roles at
`work-order.ts:194`: *"Roles are scene state, not order state … which is what keeps 'an axis
that is off contributes what the viewport shows' true without anything to re-sync."*

The volume is something you build in the viewport and see. `LayoutAxis.volume` should stop
being an independent triple of numbers and become a reference to the scene's volume, or the
two will drift and the panel will render a dataset for a room that isn't the one on screen.

Start with one volume; model it as a list (`SceneVolume[]`) from day one so "living room +
kitchen" doesn't need a migration.

---

## 6. Open questions worth answering before code

1. **Do cameras obey the volume?** Recommend **no**. The rig orbits the master and routinely
   stands outside the room looking in. Clamping in `useScene.ts:404` must skip
   `source === "camera"`, or the sweep will fight the box.
2. **What happens to objects already outside when the volume shrinks?** Recommend: leave
   them where they are, flag them in the layers panel. Silently teleporting someone's
   scene on a slider drag is the worst possible behaviour.
3. **Does layout randomization move the master?** Recommend **pinned by default**. The whole
   rig is framed on it (`camera-rig.ts` `framingPosition`); moving it invalidates every
   shot. Distractors and background objects are exactly what should scatter — the role
   vocabulary in `scene-types.ts` already carves this out.
4. **How are N layouts previewed?** Not by instantiating N scenes. Store `Placement[]` per
   layout and swap positions on the existing objects — the same discipline the swap axis
   already keeps (`work-order.ts:163`: *"Nothing here moves anything in the viewport."*).

---

## 7. Build order

Each phase is useful on its own and ships without the next.

**Phase 1 — the box (no AI).**
`SceneVolume` type, wireframe + floor quad, face-drag handles, bounds-aware clamp in
`handleDrop` and `update`, and a `Scatter` button that fills the volume with the selected
objects from a seed. Delivers containment and randomization immediately.

**Phase 2 — constraints.**
Support surfaces (`on:`), wall faces, clearance/margin, facing, yaw quantisation, the
failure report.

**Phase 3 — the axis.**
Drop the `PANEL_AXES` filter, add `seed`, point `LayoutAxis.volume` at the scene volume,
make `computeTotals` and the dispatch review count arrangements.

**Phase 4 — the bridge.**
Replace `planFor` with a real model call that emits a `LayoutSpec`, and add scene-mutating
ops to the agent's `Op` union.

---

## 8. Summary

| Capability | three.js feasible? | Effort | Already in repo |
|---|---|---|---|
| Define a volume | Yes | Low | plane-drag idiom, `Plane`/`Ray` helpers |
| Visualise it (+ walls) | Yes | Low | — |
| Clamp to volume | Yes | Low | `handleDrop`, `update` — two hook points |
| Spawn inside only | Yes | Low–Med | `register` mesh map for raycast targets |
| Support surfaces ("on the table") | Yes | Med | `Raycaster`; BVH only if it gets heavy |
| Seeded randomization | Yes | Low | — |
| Sets / N arrangements | Yes | Low | `LayoutAxis` + full editor UI, both hidden |
| Chat → placement | Yes | **High** | nothing — `Op` never touches the scene |

The reference video's hard part is the LLM. Its weak part — containment — is the part
three.js does trivially, and the part that this repo is already three-quarters wired for.
