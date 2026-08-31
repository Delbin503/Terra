# 8. TerraArrange — laying out a scene automatically

**Source files:** `arrange.ts` (the solver — pure, no React) · `scene-volume.ts` (the Space and its geometry) · `VolumeInspector.tsx` (the Space panel and its Scatter button) · `terragen-axes.tsx` (the Arrangement axis) · `AiAgentPanel.tsx` (build-from-a-sentence) · `VolumeBox.tsx` (drawing and resizing a Space) · `useScene.ts` (`applyPlacements`, volumes)

---

## 1. In one paragraph

**TerraArrange puts objects where they belong, so you don't have to drag each one.** You draw a **Space** — a box that stands for a room, a yard, a stretch of road — and ask it to arrange what's inside. Every object lands on the floor, inside the box, with a gap around it and nothing overlapping anything else. Ask again and you get a different, equally tidy room.

The point is not tidiness for its own sake. A detector trained on one arrangement of a room learns that room. TerraArrange is how one scene becomes twenty believable variations of itself — and because every arrangement comes from a **seed** (a number), the exact same twenty rooms can be rebuilt later, here or on the render farm.

---

## 2. The mental model

Three ingredients, one result:

```
   a Space            the objects in it            a seed
 (where things       (what may move, and             (which
  are allowed         what must stay put)          arrangement)
   to land)
        \                    |                       /
         └────────────  arrange()  ────────────────┘
                            │
                     one arrangement
              a position + a turn for each object
```

**One solver, three ways to reach it.** The Scatter button, the TerraGen Arrangement axis and the AI assistant all call exactly the same function with the same rules. A room the assistant builds and a room the button builds are the same kind of room — there is no second, slightly different arranger hiding anywhere.

---

## 3. What a Space is

A Space is a **box in the scene**. It isn't rendered in the dataset; it's a boundary you draw so the arranger knows where "inside" is.

**To make one:** open the **Asset Library → Utilities → Space**. The library closes and you drop straight into draw mode, with a hint at the bottom of the screen:

> *Drag a rectangle on the ground, then move up to raise it*

Drag the footprint, move the mouse up to set the height, click to place. **Escape** backs out. It arrives named **Space 1**, **Space 2**, … at a minimum of 0.5 m a side, with its walls hidden (a room that arrives boxed in on four sides hides the things you're about to put in it).

Selecting a Space gives it the same chrome as any object — its name over the viewport, tiles along the bottom, a panel bottom-right:

| Tile | Rows |
|---|---|
| **Objects** | Move · Rotate · Size — the box's own transform, each row arming its gizmo |
| **Contents** | Keep inside · the seed · the **Scatter** button |

The Contents header counts what's in there: *"7 inside"*.

**Keep inside** (containment) is the one real setting:

| | What arranging does |
|---|---|
| **On** *(default)* | Everything lands **inside the box**, held 0.1 m clear of the walls. Anything you drag in later is clamped to stay inside too. |
| **Off** | The box stops being a fence and becomes a **hint** — objects still cluster around it but may land outside, spread over about 2.4× the footprint. The floor stays where it was, so nothing ends up buried or hovering. |

---

## 4. Arranging in Terra Web — the Scatter button

**Space → Contents → Scatter N Objects.**

1. Select the Space.
2. Open **Contents**. The header tells you how many objects are in there; the button tells you how many will actually move.
3. Press **Scatter**. Everything shuffles at once.
4. Don't like it? Press the **seed** button (🎲) for a new number and scatter again. Repeat until the room looks right.
5. **Undo** puts back the arrangement you had.

Under the button, a line tells you what just happened:

> *Placed 7 objects.*
> *Placed 5 of 7. No room left for 2 — widen the space or lower the clearance.*
> *Nothing to scatter — every object here is the master, locked or hidden.*

With containment off it adds *"— some outside, since containment is off"*, so a room that looks scattered to the winds says why.

### What moves, and what doesn't

| Moves | Stays put |
|---|---|
| Ordinary objects inside the Space | **The master object** — every camera in the Work Order is framed on it, so moving it would invalidate every shot |
| | **Locked** objects — that's what the lock means |
| | **Hidden** objects — you can't check a placement you can't see |
| | **Cameras and environments** — not furniture |
| | Anything **outside** the Space, while containment is on |

Objects that stay put aren't ignored — the solver places everything else **around** them.

**Groups count once.** A group and its members in one list would arrange the members twice, so the list is of things in the room, not names for them.

### Two warnings the room can show

| Warning | Where | What to do |
|---|---|---|
| **"N objects sit outside. Nothing was moved."** | Contents panel | Press **Bring them inside →** — it clamps each stray to the nearest legal spot, without shuffling anything else |
| **An object is bigger than the room** | Bottom-left corner notice, naming each one | Widen the Space. There's no button for it, because the answer is a bigger room |

---

## 5. Arranging in TerraGen — the Arrangement axis

Same solver, different question. Scatter is *one* shuffle you keep. The Arrangement axis says: **render N of them**.

**Generate → Arrangement.** Four blocks:

| Block | What it does |
|---|---|
| **Space** | Shows the armed Space, named and measured (`Living room · 8.0 × 2.7 × 8.0 m`). Without one, Dispatch is **blocked** — with no bounds the solver has nothing to sample inside, so the run would render the same scene N times and bill you for each |
| **How many** | 1 to **10**. **The count is the switch:** at 1 the run uses the room exactly as you posed it; from 2 it's a sweep. Ten because every arrangement is a whole subset — it multiplies against the weather sets, the swap lists and the camera's frames |
| **Seed** | The number every arrangement in the set descends from. Type one, or press 🎲 for a new one |
| **Preview** | One chip per arrangement — **1 2 3 4**. Clicking one **applies it to the viewport** so you can look at it |

**About the preview chips.** There's nowhere else to show an arrangement — a thumbnail strip would mean rendering the scene N times offscreen while it's already on screen in front of you. So clicking a chip rearranges the real scene. **Undo puts it back**, and it doesn't matter either way: the run rebuilds every arrangement from the seed regardless of what the viewport happens to be showing.

After you click a chip, that arrangement's **own seed** is printed underneath. That's the number to write down if you want *that particular room* back — see §7.

Each arrangement is one subset of the Work Order, so 4 arrangements × 72 frames from the camera rig = 288 frames, before anything else multiplies. See [06 — TerraGen §12](06-terragen-generate-panel.md).

---

## 6. Arranging by asking — the AI assistant

**AI Tools → the assistant**, with a Space selected. Describe what you want in it:

> *put four chairs and a table in here*

It reads the nouns and the counts, finds matching assets in the library (a stand-in shape when there's no match), places one object per item, and hands the whole lot to the same solver. What comes back is a room, not a stack — the objects arrive already spread out and clear of each other, and of anything that was in the Space already.

It honours containment exactly as Scatter does: with the fence down, the new objects cluster on the Space but may land outside it.

---

## 7. Seeds — why the same room comes back

**A seed is just a number, and it is the whole arrangement.** Same seed + same objects + same Space = the same room, every time, on any machine.

That matters for two different reasons:

- **While you're working:** press 🎲 until you like what you see. The number in the field *is* what you're looking at.
- **For a dataset:** the render farm rebuilds the scene headlessly from the Work Order and nothing else. Without a seed the four rooms in a run would be four rooms nobody — including the backend — could ever get back.

A seed is six digits: long enough not to collide in a session, short enough to read out loud and type back in.

**The set and the room aren't the same number.** The Arrangement axis holds *one* seed and derives the rest from it, so arrangement 3 of a set runs on its own derived number rather than on the one in the field. That's what the seed printed under a clicked preview chip is — the room's seed, not the set's.

Two Work Orders authored in the same session start from different seeds, so you can't accidentally produce the same four rooms twice without meaning to.

*(Technically: `mulberry32` seeded PRNG; arrangement N derives from the golden-ratio mix `seedFor(seed, n)` rather than `seed + n`, because consecutive seeds put their first object in almost the same spot and the shuffle would look broken.)*

---

## 8. What the solver actually does

Plain version: **it guesses, checks, and keeps what works.**

For each object, in order:

1. Pick a random spot on the floor of the box.
2. Check it against everything already placed — including the things that never move.
3. Overlapping, or too close? Throw it away and try again, up to **220 times**.
4. Landed? Give it a turn, write it down, and it becomes an obstacle for everything after it.

This is rejection sampling, and it's what indoor-scene-synthesis work uses for the same reason: these constraints are cheap to *check* and expensive to *solve* properly, and at a roomful of objects the checking is free.

**Clearance** is the empty ring each object asks for — **0.2 m** by default. It inflates only the object being placed, not both, so two objects each asking for 0.2 m end up 0.2 m apart rather than 0.4 m.

**A turned Space still fills along its own walls.** Sampling happens in the room's own frame, so a Space rotated 30° doesn't lay its contents out along the world axes it happens to be near.

**When it can't fit everything**, it says so rather than stacking two chairs in one place. Unplaced objects are named in the result, and both the Scatter report and the Arrangement preview tell you the count and the fix: *widen the space, or lower the clearance.*

---

## 9. What the solver can do that nothing asks it for yet

The rules model is richer than any of the three entry points uses. Every caller today builds the same default rule for every object — **on the floor, 0.2 m clear, any angle** — so these are capabilities sitting behind a UI that hasn't been designed:

| Rule field | Options in the model | Exposed anywhere? |
|---|---|---|
| **Anchor** | On the floor · Against a wall · On the ceiling · On another object | No — always *floor* |
| **Which wall** | North / south / east / west, or let the solver pick | No |
| **Support** | A named object to sit on, or "any object big enough" | No |
| **Clearance** | Any distance in metres | No — always 0.2 m |
| **Turn** | Any angle · Quarter turns · Face the centre · Keep its angle | No — always *any angle* |

The solver honours all of them today, including the awkward cases: a pot can be placed on a table that this same run put down a moment earlier, a support too small for its passenger falls back to the floor rather than balancing it on a corner, and an object pushed past a wall by its support is clamped back inside — the room's edge outranks the tabletop.

Ruled objects would also go down **first**, before the unruled remainder, so a stove that must be against a wall doesn't lose its last stretch of wall to a randomly-scattered box.

---

## 10. Quick reference

| I want to… | Do this |
|---|---|
| Make a place to arrange in | Asset Library → **Utilities → Space**, drag a footprint, move up, click |
| Tidy the room once | Select the Space → **Contents → Scatter** |
| Try a different layout | 🎲 next to the seed, then Scatter again |
| Get a layout back later | Write down the seed |
| Let things spill outside the box | **Contents → Keep inside → Off**, then Scatter |
| Pull strays back in | **Bring them inside →** in the Contents warning |
| Render several layouts as a dataset | **Generate → Arrangement → How many**, 2 or more |
| See what arrangement 3 looks like | Click preview chip **3** (Undo puts the scene back) |
| Fill a room by describing it | Select the Space, then ask the AI assistant |
| Keep one object where it is | **Lock** it, or make it the **Master** |

---

## 11. Notes and gaps

- **No per-object rules in the UI** — see §9. All three entry points use the same default.
- **One armed Space at a time.** The model holds a list of volumes (a living room *and* a kitchen is the obvious next ask), but containment and the Arrangement axis both read the single armed one.
- **The Arrangement axis follows whichever Space is armed**, synced for as long as the TerraGen panel is open — so arming a different Space while authoring changes what the run will arrange.
- **Nothing prevents arranging into a room the camera can't see.** The rig is framed on the master, which never moves, but a Space dragged away from the master will happily arrange objects out of shot.
