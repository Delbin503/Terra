# 5. Camera Settings

## The one thing to understand first

A camera in Terra isn't one camera. It's a **rig** — a linked pair: one camera at the start of the capture sweep and one at the end. The two positions in the scene **are** the range, and the capture fills in everything between them.

At the start position, the master object turns a full revolution while the camera shoots N frames. The camera then moves to the next stop along the start→end line and shoots another revolution, until it has stood at every stop.

---

## How to place one

**Asset Library → Utilities → Camera.** Drag it into the viewport, or use **⋮ → Place in Scene**.

**If the scene has a Master object**, a dialog appears first:

> **Place Camera** — Master object · *Torus*
>
> Place camera near the master object to focus on it?
>
> *Either way the rig locks onto Torus — this only decides where its start and end cameras begin.*
>
> **[ No, drop here ]  [ Yes, focus ]**

- **Yes, focus** — both cameras are framed around the master, scaled to how big it is, with the start camera low and the end camera high. The sweep is usable immediately.
- **No, drop here** — the pair lands where it was dropped, still separated vertically so the sweep has somewhere to travel.

**If there's no Master**, there's nothing to frame around, so the dialog never appears and the pair just drops.

A fresh rig lands at its **furthest** reach. That makes the first frame the establishing one — the whole object in shot, nothing cropped — and the near reach can be dialled in later against something already visible.

---

## What a rig looks like in the scene

- Two camera bodies, tinted differently (start vs end)
- A **dashed sweep line** between them — the path the capture travels
- One row in the **Layers** panel, not two. The pair is one instrument, so its eye and its lock speak for both.

The two move as one. Dragging either camera carries the other by the same amount. Deleting one deletes both — half a sweep isn't a thing. Duplicating copies the pair with its settings.

---

## Selecting a camera

The view pulls back to frame the **whole rig**, not one lens.

Two things appear in the bottom-right corner, stacked in one column sharing the same width:

1. **The POV inset** — a live picture-in-picture of what that camera actually sees, rendered from the camera's own position and updated frame for frame as either the camera or the master moves. The header shows the camera's name and "POV", with the icon tinted to match which end of the sweep it is. It's non-interactive; clicks pass through to the viewport.
2. **The properties panel** for whichever tab is open.

The POV sits directly on top of the controls that aim it — they used to be in opposite corners, which put the picture of what the camera sees as far from the aiming controls as the screen allows.

The bottom toolbar shows **Object** and **Capture**. No Role tile.

---

## Object tab

A camera has no scale and no material. What it has instead is a relationship to the master.

| Row | Reads | What it edits |
|---|---|---|
| **Position** | x, y, z | Moves the whole rig |
| **Orbit Rotation** | the rig's bearing, in degrees | Swings the pair around the master |
| **Distance** | the near reach, in metres | Where the sweep travels in to |

### Position

Moves both cameras by the same amount. The start↔end separation is the capture range, so it has to survive being dragged around the scene.

### Orbit Rotation

The camera is locked on the master, so spinning a camera in place changes nothing about the shot. What matters is **where it's taken from** — so "rotation" on a rig camera means orbit.

The control has:

- A **0–360° slider** that swings both cameras around the master, each keeping its own height and reach
- An **Arc**: a start bearing and an end bearing, with a live "**N° swept**" readout. Two bearings rather than a width, because "from 30° round to 210°" is how you describe a wedge you can see in the viewport. A full revolution is 0 → 360; anything narrower captures a wedge, which is what you want when the back of the object is a wall or a mirror of the front.

While this control is open, the viewport draws a **ring along the circle the cameras actually travel**, with both ends of the arc marked. Dragging that ring does the same thing as the slider.

The per-object rotate gizmo is deliberately never shown on a rig camera. Two rotation affordances that disagree is worse than one that works.

### Distance

The pair physically stands at the **far** distance. That's set by dragging a camera in the viewport, and it's shown here as a read-only field on the left of the slider.

The **near** distance is a number the rig carries, not a place a camera stands. It's what the capture travels in to. Keeping it as data means it survives every other edit — orbiting, climbing, dragging a camera — instead of being whatever a camera position happened to imply.

The slider is bounded by real limits:
- **Nearest** — all but touching the master. TerraGen would clamp here anyway, so the floor is shown rather than applied silently.
- **Furthest** — the rig's own far reach. A near end beyond the far one would invert the sweep.

**While the Distance control is open**, the viewport previews the pair at the near end, with yellow afterimages left where they'll return to, and the real cameras hidden (two solid rigs a metre apart is a picture of two rigs). Nothing is moved. Closing the control just stops drawing the preview, which is why the near number survives the edit.

### The climb

Not a row in the panel — a knob on the sweep line itself, at its midpoint, with a metre readout beside it. Dragging it moves the **far** camera up or down; the near end is the datum the climb is measured from.

The far camera travels along the sphere it already sits on, so **the distance to the master doesn't change**. It climbs by swinging inward over the master, which is the arc a turntable rig actually sweeps. A camera lifted straight up would get further away with every metre and silently re-frame every shot in the pass.

The climb has a ceiling: directly overhead, where there's nowhere higher to go on that sphere.

---

## Capture tab

| Row | Reads |
|---|---|
| **Mode** | Fixed / Rotatable |
| **Increments** | number of stops |
| **Shots / Rotation** | frames per revolution |

### Mode

- **Rotatable** (default) — the master turns a full revolution at each height, stepping start → end.
- **Fixed** — one front-on frame. No orbit, no climb.

### Increments (shots per distance)

How many stops the camera makes between the near and far ends. Default 3, range 1–12.

It's a **count**, not a metre step, because the count is the one you can budget with: it multiplies the frame total directly and it doesn't silently change when the rig is moved. (A 5m step over a 12m sweep gives 3 passes — drag a camera one metre further out and it quietly becomes 4.)

The ceiling is what the sweep can actually hold, at a minimum gap of 0.25m between stops. Asking for 12 stops across a 2m climb would make ten of them the same frame, billed ten times. The panel says what fits:

> *3 stops between the two ends, 1.85 m apart. Room for 9 over this 3.7 m sweep.*

At one stop: *"One stop — the rig shoots its rotation without climbing."*

### Shots / Rotation

Frames captured per full revolution of the master. Default 24, range 4–120.

### The viewport while these are open

Picking either count draws the plan in the scene: a marker at every stop the camera will make, and tick marks at every bearing a shot is taken from.

---

## The frame maths

```
total frames = stops × shots per rotation
```

Narrowing the arc **doesn't drop frames** — it packs the same shots-per-rotation into a wedge instead. That's what makes the arc safe to adjust without re-reading the budget.

The frame total, archive size and credit cost are **not** shown in this panel. They're stated once, in TerraGen's dispatch review, at the moment they become a decision. Repeating them here would make the properties panel read as a second, narrower place to decide the same thing.

---

## Fixing a rig that's drifted

Inside TerraGen (**Generate** → **Camera & Master** section) there's a re-frame action. It throws away the current camera placement and rebuilds it from scratch using the same rule that's used when a rig is dropped with focus — the way back to a known-good framing after the master has been moved, scaled or swapped enough times that the rig no longer frames anything.

---

## Note on the current build

The full capture run — the panel that renders every frame and files them into **Uploads** with names like `Torus — pass 2/3 · 7` — exists and works, but nothing in the editor currently triggers it. The **Generate** button opens TerraGen instead, and TerraGen's dispatch confirms the Work Order rather than running the capture locally.
