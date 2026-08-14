# 5. Camera Settings

**Source files:** `camera-rig.ts` (all the geometry and planning math) · `CameraPlaceDialog.tsx` · `CameraObjectMesh.tsx` · `CameraPreview.tsx` · `SceneCanvas.tsx` (viewport handles and guides) · `ObjectPropertiesPanel.tsx` · `SettingControl.tsx` · `CaptureExplainer.tsx` · `terragen-camera.tsx` · `useScene.ts` · `EditorView.tsx`

---

## 1. The model — read this first

A camera in Terra is **not one camera**. It's a **rig**: a linked pair of camera objects plus a settings record.

```
CameraRig {
  id
  startId, endId        // the two camera objects in the scene
  mode                  // "rotatable" | "fixed"
  nearDistance          // SAVED number, metres from the master
  orbitStart, orbitEnd  // the arc the master turns through, absolute bearings
  shotsPerDistance      // how many stops between the two ends
  shotsPerRotation      // frames per revolution
}
```

The two camera **positions in the scene are the range**. The capture fills in everything between them.

**What a capture does:** at the near pose the master object turns through the arc while the camera shoots `shotsPerRotation` frames. The rig then moves to the next of `shotsPerDistance` stops along the near→far line and shoots another revolution, until it has stood at every stop.

### The rig is a mast

The two cameras sit **one directly above the other**. `withVerticalSpan` keeps the far camera's x/z and only changes its y:

```ts
withVerticalSpan(start, end, span) => [end[0], start[1] + span, end[2]]
```

So the climb never leans the pair into a slope, and the near camera is always the datum the height is measured from.

### Two numbers that look alike but aren't

| | Where it lives | How it's edited |
|---|---|---|
| **Far distance** | Derived — the actual distance from master to the **end camera** | Move the cameras (drag in the viewport, or the Farthest slider in TerraGen) |
| **Near distance** | **Stored on the rig** (`rig.nearDistance`) | The Distance slider. Nothing moves |

The pair physically **parks at the far distance** — from the moment it's placed (see §2) and for the rest of its life. That makes the first frame the establishing one — whole object in shot, nothing cropped — and it means the near reach can be dialled in later against something already visible. Storing the near end as data is what lets it survive every other edit (orbit, climb, a dragged camera) instead of being whatever a camera position happened to imply.

### Defaults (`CAMERA_DEFAULTS`)

| Field | Default |
|---|---|
| `mode` | `rotatable` |
| `orbitStart` → `orbitEnd` | 0° → 360° |
| `shotsPerDistance` | 3 |
| `shotsPerRotation` | 24 |
| `nearDistance` | 45% of the rig's reach, floored at `nearLimit` |

---

## 2. Placing a rig

**Asset Library → Utilities → Camera.** Drag it into the viewport, or **⋮ → Place in Scene**.

**If the scene has a Master object**, a dialog appears first (`CameraPlaceDialog.tsx`):

> **Place Camera** — Master object · *Torus*
>
> Place camera near the master object to focus on it?
>
> *Either way the rig locks onto Torus — this only decides where its start and end cameras begin.*
>
> **[ No, drop here ]  [ Yes, focus ]**

| Choice | What happens |
|---|---|
| **Yes, focus** | Both cameras are built by `framingPosition` — pulled back along the scene's viewing diagonal and lifted, scaled to the master's size. Start low, end high. Usable sweep immediately. |
| **No, drop here** | The pair lands at the drop point, separated 10m vertically so the sweep still has somewhere to travel. |

**If there's no Master**, there's nothing to frame around, so the dialog never appears and the pair just drops.

### A focused rig always lands at the FAR end of its sweep

This is the part that surprises people, so it's worth stating plainly.

When the user picks **Yes, focus**, the pair does not land somewhere in the middle and it does not land close to the master. **It parks at the furthest point of its own sweep** — the far end — and the near end is stored as a number the capture will travel *in* to.

```
master ●                    · · · · · ▷ [ rig parks HERE ]
       |←—— nearDistance ——→|←— the capture travels in ——|
       |←——————————— farDistance (where it stands) ——————→|
```

**Why:** the far shot is the establishing one — the whole object in frame, nothing cropped — so it's the shot you frame against. Landing there means the near reach can be dialled in later against something the user can already see, instead of opening zoomed in on a crop and having to back out to find the object.

**What gets seeded** (`useScene.addCameraRig`):

| | Value |
|---|---|
| Camera positions | `framingPosition(master, radius, "start" \| "end")` — this *is* the far distance |
| `farDistance` | Derived: the actual distance from the master to the **end** camera. Nothing stores it. |
| `nearDistance` | `max(nearLimit, farDistance × 0.45)` — a real move inward, but not so close that the rig opens with the master filling the frame |

For a master at default scale (radius 0.7) that works out to roughly **6.2m far, 2.8m near**.

**One clarification for whoever reads this next to §9:** "furthest" here means the far end of *this rig's own sweep*, not the `farLimit` ceiling. `farLimit` is ~30 × radius (about 21m for a unit master) and is only the point past which the master stops being the subject. A freshly focused rig sits well inside it — `framingPosition` pulls back by `max(3, radius × 4)` and lifts by `max(5, radius × 4)`. So the rig lands at the top of its own range, not at the top of the allowed range.

The pair goes on standing at the far distance for the rest of its life, through every other edit. Orbiting, climbing and dragging all move it; only the Distance slider changes the near number, and that moves nothing at all (see §5).

Both cameras are created by `makeCameraRig`: the start is named **"Camera"** (it stands for the whole rig in the layers panel) and the end is **"Camera (end)"**.

---

## 3. What a rig looks like in the scene

- Two camera bodies with a frustum, tinted differently — start vs end (`CAMERA_RIG.start` / `.end`)
- A **dashed sweep line** between them, drawn before the bodies so it passes behind rather than through
- **One row** in the Layers panel, not two. The eye and the lock speak for both cameras.

**Lock-on.** Each body turns to face the master, but takes **yaw only** from the aim — pitch and roll are dropped. The two cameras sit at different heights, and an aimed pitch made the upper one hang nose-down so the pair stopped reading as one instrument. The lens points at the master in plan; the elevation it shoots from is the rig's geometry. The user's own Rotation value is applied as an **offset on top** of the aim.

**They move as one.** `scene.update` on a rig camera's position carries its partner by the same delta. Deleting one deletes both — half a sweep isn't a thing. Duplicating copies the pair and its rig record.

---

## 4. Selecting a camera

The view pulls back to frame the **whole rig** — the focus centre is the midpoint of the two cameras and the radius is 60% of their separation, floored at 1.5m so a collapsed rig still frames to something.

Two things appear in the bottom-right corner, stacked in one column sharing a width:

1. **The POV inset** (`CameraPreview.tsx`) — a live picture-in-picture of what that camera sees. It's a second `<Canvas>` rendering the same `SceneWorld` from the camera's own position, updated frame for frame. The camera you're looking *from* is hidden so it can't clip the near plane. Header shows the name and "POV", icon tinted to which end of the sweep it is. Non-interactive — pointer events pass through.
2. **The properties panel** for whichever tab is open.

The bottom toolbar shows **Object** and **Capture**. No Master tile.

---

## 5. Object tab — the four rows

A camera has no scale and no material. What it has is a relationship to the master.

| Row | Reads | Edits |
|---|---|---|
| **Position** | x, y, z | Moves the whole rig |
| **Orbit Rotation** | bearing in degrees | Swings the pair around the master |
| **Distance** | near reach in metres | Where the sweep travels in to |
| **Height** | climb in metres | How far the far camera stands above the near one |

### Position

Three number fields. Applied as a shared delta to both cameras (`applyTransform` in `EditorView.tsx`) — the start↔end separation is the capture range, so it has to survive being dragged around the scene.

### Orbit Rotation

The camera is locked on the master, so spinning a camera in place changes nothing about the shot. What matters is **where it's taken from** — so "rotation" on a rig camera means orbit, and the per-object rotate gizmo is never armed for one (`showGizmo` explicitly excludes it).

The control reads left to right as a sentence — *from here, round to there, currently here*:

```
[ 0° ]———————•———————[ 360° ]
 arc origin   now      arc end

Origin · 0°        137° now        360° swept
```

- **Left field** — `orbitStart`, the arc's origin bearing
- **Slider** — where the rig is standing right now, 0–360°. Dragging it calls `orbitRig`, which applies a **delta** so each camera keeps its own bearing offset rather than being snapped onto one shared heading. `orbitPoint` preserves each one's height and ground radius, so the framing is untouched and only the viewpoint changes.
- **Right field** — `orbitEnd`
- **The readout row** under it restates all three: origin, current, and total swept (`orbitSweep`)

A full revolution is 0 → 360. Anything narrower captures a wedge, which is what you want when the back of the object is a wall or a mirror of the front.

**In the viewport:** a ring is drawn along the circle the cameras actually travel — not around the master's footprint — with both ends of the arc marked. Dragging the ring does the same thing as the slider.

### Distance

```
[ 12.4 m ]————•—————————  [ 5.6 m ]
  far, read-only   near slider, editable
```

- **Left, read-only** — the far reach. It's where the pair is parked; change it by dragging a camera (tooltip says so). Shown on the same line because the near end is only meaningful against it.
- **Slider** — the near reach, from `nearLimit` up to the far distance. A near end beyond the far one would invert the sweep, so it's clamped.
- **A bar underneath** draws the stretch the sweep travels.

**The live preview.** While this control is open, the viewport draws the pair *where the near reach would put them*, leaves **yellow afterimages** at the far positions they'll return to, hides the real cameras, and draws the travel between the two. Nothing is moved — closing the control just stops drawing it. That's exactly why the near number survives the edit.

### Height (the climb)

```
[———•——————————]  [ 4.2 m ]
Level · 0 m          18.0 m · Max
```

- **Slider**, 0 → `spanMax`, step 0.1
- **Numeric readout** on the right
- **Two shortcut buttons** under it: **Level · 0 m** (both cameras at the same height, a flat turntable pass) and **N m · Max**
- Explanation: *"How far the far camera stands above the near one. The near camera holds still and the far one moves straight up and down, so the pair stays a vertical mast over Torus rather than leaning into a slope. Drag the gauge beside the rig in the viewport for the same thing."*

Zero is a legal, useful value — it's a flat pass.

---

## 6. Capture tab — three rows

| Row | Reads |
|---|---|
| **Mode** | Fixed / Rotatable |
| **Increments** | number of stops |
| **Shots / Rotation** | frames per revolution |

### Mode

Two cards:

- **Rotatable** (default) — *"Master turns a full revolution at each height, stepping start → end."*
- **Fixed** — *"One front-on frame. No orbit, no climb."*

In fixed mode `planCapture` returns a single pass, one frame, and the other two settings stop applying.

### Increments (`shotsPerDistance`)

How many stops the rig makes between the near and far ends. Range 1–12.

It's a **count, not a metre step**, and that's deliberate: the count multiplies the frame total directly and doesn't silently change when the rig moves. A 5m step over a 12m sweep gives 3 passes — drag a camera one metre further out and it quietly becomes 4, and nobody asked for more frames.

The slider's ceiling is what the sweep can actually hold: `maxStops(span) = floor(span / 0.25) + 1`, capped at 12. Two stops closer than `MIN_STOP_GAP` (0.25m) are the same shot twice, billed twice.

The line under it states the real numbers:

> *3 stops between the two ends, 1.85 m apart. Room for 9 over this 3.7 m sweep.*

At one stop: *"One stop — the rig shoots its rotation without climbing."*

### Shots / Rotation

Frames per full revolution of the master. Range 4–120, default 24.

### The viewport while either count is open

The plan is drawn in the scene: a marker at every stop the rig will make, and tick marks at every bearing a shot is taken from (`orbitShots`).

---

## 7. The capture explainer (new)

The three capture settings are the ones that decide what a dataset costs and contains, and all three are abstract in a way the viewport can't show — the rig stands still while you edit them, so the numbers have to be taken on faith.

So each has an **info button in the setting panel's header** (`ⓘ`, only present for Mode, Increments and Shots / Rotation). Toggling it opens a card at the foot of the panel with:

1. **An animated SVG diagram** of that setting's pass, drawn from the rig's **real numbers** — change shots/rotation and the shot marks in the picture change with it:
   - *Rotatable* → a ring with one mark per shot, the master rotating in the middle, and a camera stepping mark to mark and flashing as it lands
   - *Increments* → a mast with a tick at every stop, a rig jumping (not gliding) between them, and the revolution it shoots at each drawn beside it
   - *Fixed* → one camera, one subject, one flash
2. **A title and a paragraph** for the current state
3. **The arithmetic, spelled out:** `3 increments × 24 shots = 72 frames`

Design notes for whoever maintains it (`CaptureExplainer.tsx`):

- Motion is **SMIL** (`<animateTransform>` / `<animate>`), not CSS — each diagram stays one self-contained element with no keyframes leaking into a global stylesheet and no class-name collisions between the three.
- Shot marks cap at **24** (`MAX_TICKS`); past that they stop being countable.
- The `calcMode="discrete"` on the increment diagram is the point — it jumps and holds, because that's what the capture does. It doesn't glide up shooting continuously.
- The explainer is **asked for, not served**. It used to sit permanently under the control, which is a lot of a 340px panel floating over the thing the user is trying to judge, for something you read once. The open/closed preference persists while the panel is open, so someone who wants the diagrams keeps them as they step from Increments to Shots / Rotation.

---

## 8. Direct manipulation in the viewport

Two gestures, because a turntable rig has two degrees of freedom worth dragging once the master is chosen (`RigHandles` in `SceneCanvas.tsx`).

### Grab either camera → orbit

Grab spheres sit on both camera bodies. Dragging either swings **both** — the pair is one instrument, and orbiting half a sweep would tilt the plane the capture runs in. Each keeps its own height and ground radius. A dashed guide ring is drawn at each camera's own height so the result is legible before it's made.

### Grab the bar on the sweep line → climb

**A flat bar lying across the sweep line at its midpoint**, not a ball on it. A sphere reads as a joint — something to swing the line around — and this is a slider, so it wears the shape people already know for one (the same short bar the dock panels' resize grips use). It billboards about Y only, so it stays horizontal (it measures height) while its face keeps turning to the camera. A metre readout sits beside it.

Two details that matter if you touch this code:

- **The grip rides the midpoint, so it moves half as far as the far camera.** The drag solves the midpoint back into a climb: `onSpan(2 * (y - grabOffset - start.y))`. Without that the gesture reads as "set a number" rather than "pull the rig down".
- **`grabOffset` is captured on pointer-down.** Without it the climb jumps to wherever the cursor happened to be on the first frame — and since the grip is the midpoint, that jump *halved the rig's height* the instant you touched it.

Both gestures suspend OrbitControls for the duration. R3F's `stopPropagation` can't hold it off — it binds its own DOM listeners — so without suspending, the view tumbles underneath the drag and neither movement is controllable.

The grab target is a **transparent** box, not `visible={false}`: an invisible object is skipped by the raycaster, and the pointer fell straight through to OrbitControls.

---

## 9. Limits, and where they come from

None of these are guessed. All in `camera-rig.ts`, all derived from the master's own size (`masterRadius = 0.7 × max(scale)`).

| Limit | Formula | Why |
|---|---|---|
| `nearLimit` | `max(0.8, radius × 1.15)` | All but touching the master. Any nearer and the lens is inside the bounding box, which TerraGen clamps anyway — this mirrors that rule so the UI shows the floor instead of having the value silently overridden server-side. |
| `farLimit` | `max(6, radius × 30)` | Where the master stops being the subject. At the scene's 45° FOV the frame half-height at distance *d* is ≈ 0.414*d*, so the master fills `radius / 0.414d` of it. Holding that at ~8% gives *d* ≈ 30 × radius. |
| `spanLimit` | `= farLimit` | The climb ceiling. It used to be a geometric pole (straight overhead on the camera's sphere); now the far camera rises straight, and nothing stops a mast being tall — so the ceiling is the same one Distance uses: past it, more height stops buying a usable shot. |
| `MIN_STOP_GAP` | 0.25 m | Two stops closer than this are the same frame twice. |
| `maxStops(span)` | `min(12, floor(span / 0.25) + 1)` | A count the rig can't honour is worse than a lower ceiling. |
| `DISTANCE_SHOTS_RANGE` | 1 – 12, step 1 | |
| `SHOTS_RANGE` | 4 – 120, step 1 | |

---

## 10. The frame maths

```
total frames = shotsPerDistance × shotsPerRotation
```

Fixed mode is always **1**.

`planCapture(nearPose, farPose, rig)` returns the passes, the shots per pass, the total, the sweep length and the swept degrees. Three behaviours worth knowing:

- It's planned **from the near pose to the far one** — the pair parks at the far distance and `nearDistance` is where the capture travels in to. Passing the parked start camera would plan a sweep with no travel at all.
- **Narrowing the arc never drops frames.** It packs the same `shotsPerRotation` into a smaller wedge, so they land closer together. That's what makes the arc safe to adjust without re-reading the budget.
- **The stop count floors at 1.** A rig whose two cameras sit on top of each other still yields one pass — a capture can never be a no-op that reports success.

`orbitStep` divides a full revolution by the shot count (the last shot would land on the first) but a partial arc by the gaps between them (both ends are included).

**The frame total, archive size and credit cost are not shown in this panel.** They're stated once, in TerraGen's dispatch review, where they become a decision. Repeating them under the capture settings made the panel read as a second, narrower place to decide the same thing. The only arithmetic here is inside the explainer card, which is about understanding the setting rather than approving a bill.

---

## 11. The same rig, edited from TerraGen

**Generate → Camera & Master** (`terragen-camera.tsx`). Every control here writes to the **scene**, not to the Work Order draft — the rig *is* the sweep, so there's nothing to copy and nothing to keep in step. It uses the same geometry helpers as the viewport gizmos, which is what keeps dragging a camera and typing a number the same edit.

The section merged what used to be three separate rows (pitch, distance, "which object is the hero"), because all three were asking the same question: what does this rig shoot, and from where.

| Group | Controls |
|---|---|
| **Master object** | A searchable **radio list** of every object that can take a role. Picking one calls `scene.setRole(id, "master")`, which demotes the previous holder — exclusivity is enforced by the model, not by the list remembering to. Shows a "Master" pill on the current one and a role dot on the others. Footnote: *"One master per Work Order — picking another releases the current one."* |
| **Framing** | **Frame rig around *Torus*** — rebuilds both camera positions from `framingPosition`, the same rule used when a rig is dropped with focus. The way back to a known-good framing after the master has been moved, scaled or swapped. If there's no camera in the scene it shows a warning instead. |
| **Mode** | Rotatable / Fixed segmented control |
| **Distance** | **Nearest** (writes `rig.nearDistance`) and **Farthest** (moves the cameras). Note: *"Closer than 1.4 m is inside Torus's bounding box — TerraGen clamps there too."* |
| **Viewing angle** | **Climb**, 0 → `climbLimit` |
| **Shots** | **Shots / rotation** and **Shots / distance** |

Two things here that differ from the viewport panel:

- **Farthest is editable.** `setFar` moves the far camera down its own sight line with `atDistance`, then puts the near camera back underneath it — the column is rebuilt after every reach change, because moving only the far camera would lean it away from its partner and the rig would stop being a mast.
- **Fixed mode hides Farthest, Climb and Shots entirely** — none of them apply to a single frame.

The section closes with: *"These are the camera's own settings — editing them here moves the rig in the scene."*

The collapsed row summary reads `Torus · 5.6–12.4 m`, or `Torus · no camera placed`, or `No master object`. No frame count — that's the bill, and the bill is stated once.

---

## 12. Not wired yet

**The capture run doesn't have a trigger.** `CaptureRunPanel.tsx` is complete and working — it renders frames against a `CapturePlan`, commits them into the library in batches of 250ms (named `Torus — pass 2/3 · 7`), shows live progress, and turns into a success card with "Click to view" — but nothing in the editor ever calls `setCapture(plan)`. The **Generate** button opens TerraGen instead, and TerraGen's dispatch confirms the Work Order (`console.info("[terra] Work Order dispatched", order)`) rather than running a capture locally.

If you want to wire it up, the plan is already computed every render: `capturePlan` in `EditorView.tsx` (line ~660). `setCapture(capturePlan)` is all it needs.

**Stale comment:** `RigHandles` in `SceneCanvas.tsx` still says the far camera "stays exactly as far from the master as it was (see `withVerticalSpan`)". That was true when the climb travelled on a sphere; it now moves straight up, so the distance to the master *does* change as the rig climbs. The behaviour is intentional (the mast model) — only the comment is out of date.
