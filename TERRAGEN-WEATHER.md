# TerraGen — Weather & Lighting

How the weather system is modelled and where it lives, and why it stopped being
two Work Order axes. Companion to [TERRAGEN-PANEL.md](TERRAGEN-PANEL.md) and
[TERRAGEN-OBJECT-AXES.md](TERRAGEN-OBJECT-AXES.md).

Source spec: *TerraWeb Weather System UI Design Specification* (§1–§10).

---

## 1. The decision

The spec describes a **single-configuration, real-time scene control**: one
weather, edited in detail across ~16 parameters (precipitation, wind, sky,
lighting). The old panel had **two variation axes** — a five-condition weather
multi-select and a set-of-clock-times Time of Day — each chosen value costing a
full re-render of the sweep.

Those are incompatible readings, and this is the "Decision A" that
[TERRAGEN-DISCUSSION.md](TERRAGEN-DISCUSSION.md) §5 left open. **Resolved toward
the spec**: weather and time become one detailed configuration, and the axes are
removed.

### What that costs

Subsets no longer multiply by weather or time. The math is now:

```
subsets = background × layouts          (was: weather × time × background × layouts)
```

A default order is 1 subset. The dispatch review's multiplier list loses two
rows automatically — `computeTotals` reads `AXES`, and the two entries are gone
from it.

---

## 2. Weather follows the camera rig's pattern

This is not a new idea in the codebase — it is the one the camera sweep already
went through ([work-order.ts](src/features/editor/work-order.ts), "the sweep is
NOT an axis"). Pitch/yaw/distance used to be authored **in the order**, in
parallel with a rig **in the scene** — two descriptions of one thing that
drifted apart the moment a camera was dragged. The fix was to delete the order's
copy and read the rig live.

Weather was in the same position, so it took the same fix:

```
Weather panel (TerraGen)  →  scene.weather  →  what renders
                                   ↑
                          one description, no seed, no re-sync
```

**Weather is scene state**, owned by `useScene`, not `WorkOrder`. The panel edits
`scene.weather`; the scene renders `scene.weather`. There is nothing to seed into
the order and nothing that can go stale.

Because it edits the scene and multiplies nothing, **Weather & Lighting is a
scene section** — the third one, beside Master Object and Camera Settings — and
like them it **carries no on/off switch**. Only the two remaining axes
(Background, and the hidden Layouts) carry switches.

---

## 3. The model — `weather.ts`

Kept out of React, like `camera-rig.ts`: presets, clamps and the "has this
drifted from its preset" check are decisions about values, testable alone.

```ts
interface SceneWeather {
  preset: WeatherPresetId;                       // sunny | cloudy | rain | storm | snow
  precip: { amount, speed, size, direction:[h,v], surface };   // §3
  wind:   { speed, directionDeg, rainInfluence };              // §4
  sky:    { cloudCoverage, cloudDensity, brightness,
            fog: { on, density, distance } };                  // §5
  sun:    { minutes, intensity, shadow };                      // §6
}
```

Key functions:

| Function | Role |
|---|---|
| `WEATHER_PRESETS` / `applyPreset(id)` | the five §2 conditions, as **complete** states |
| `patchWeather(prev, patch)` | group-by-group clamp of a partial edit |
| `describeWeather(w)` | the closed accordion row's one line — "Rain · 60% · SW 35 · fog · 12:00" |
| `matchesPreset(w)` | drives the "· edited" suffix and the Reset disabled state |
| `HAS_PRECIPITATION` / `surfaceLabel` / `HAS_LIGHTNING` | which controls a condition shows |
| `SavedWeather` / `nextPresetName` | §7 preset library (session-scoped) |

**Presets are complete, not patches.** A partial preset would leave the last
condition's rain amount sitting under a clear sky — invisible in the panel (Sunny
hides precipitation) and live in the render. So switching condition **replaces**
the whole state.

### On `useScene`

`weather`, `setWeather(patch)`, `setWeatherPreset(id)`, `resetWeather()`, plus
the preset library (`savedWeather`, `saveWeather`, `loadWeather`,
`deleteWeather`). Weather is deliberately **not** in the undo `tracked` set — a
history full of slider drags would bury the object edits undo is for, the same
call selection makes.

Save/load read the live values through **refs**, not by nesting one `setState`
inside another's updater — StrictMode double-invokes updaters, which saved two
identically-named presets per click. Verified fixed: two quick saves →
"Sunny", "Sunny 2".

---

## 4. The UI — `terragen-weather.tsx`

One section, shown only in the **TerraGen dock** (the spec's "environment/settings
menu" home was overridden to TerraGen-only per the build brief).

**Progressive disclosure.** Sixteen sliders open at once is a wall, and the
first-run answer is almost always "pick a condition and go" — the preset already
sets sensible values for everything underneath. So only the five condition tiles
show by default; the detail groups each collapse to a one-line summary and open
on demand, **one at a time** (the dock's own accordion rule, one level down).

```
Weather & Lighting
  Condition   [☀ Sunny] [☁ Cloudy] [🌧 Rain] [⛈ Storm] [❄ Snow]     ← always visible
  ▸ Precipitation   60% · ground wetness 55%     ── rain/storm/snow only
  ▸ Wind            SW · 35
  ▸ Atmosphere      90% cloud · fog
  ▸ Lighting        12:00 · sun 95%
  [Reset] [Save preset]                           ← saved chips appear here
```

Opened, each fold holds its dials: Precipitation (Amount · Speed · Particle
size · Surface · Direction pad + leans), Wind (Compass · Speed · Rain influence),
Atmosphere (three cloud/sky dials · Fog toggle → Density · Distance), Lighting
(sun-time band 00:00–24:00 · Sun intensity · Shadow intensity).

The folds are a `Fold` component — lighter than the dock's outer `Section` (a
divider + chevron, not a filled card) so groups read as contents of the weather
card, not cards-in-a-card. Parameter rows use the shared `Dial`, restyled to the
**boxed `field-well` readout** the rest of Terra Web's sliders use (FactorCard,
the camera controls) so a weather dial reads as the same kind of control.

**Gating**, following the old `HAS_INTENSITY` precedent ("a slider that does
nothing is worse than no slider"): precipitation fold hidden for Sunny/Cloudy;
Rain influence disabled without precipitation; surface dial relabels
Wetness↔Accumulation; Lightning shows as a `Coming soon` row under Storm only.

**Two new primitives** (everything else reuses `Dial`/`Check`/`Switch`):
- `Compass` — the §4 wind rose. A bearing is a direction, not a point on a
  0–360 line; the control is the shape of the answer. Stays a `role="slider"`
  with `aria-valuetext` carrying the compass point.
- `Vector2Pad` — the §3 fall angle. The two leans set at once show the resultant
  the particles will fall in; the paired `Dial`s beside it stay the accessible,
  precise path.

Icons added to the registry: `sunny cloudy rain storm snow fog wind bearing`.

---

## 5. Three.js — deferred

The controls and model are complete; **rendering is a later pass**. Until then
the TerraGen preview's **"Camera only"** pill stays honest — weather is authored
but not yet drawn in the viewport. When rendering lands (fog, sun from
`sun.minutes`, sky brightness, a precipitation `<points>` system in `SceneWorld`)
that pill must be revisited, since `SceneWorld` is shared by the editor viewport
and TerraGen's edit stage — weather will appear in both at once.

Hard-to-render fields modelled but no-op for now: cloud coverage/density (needs a
sky shader to replace the fixed HDRI), surface wetness/accumulation (per-object
material writes, overlapping MAT). §10 extensions (lightning, thunder, day/night
cycle, weather API) are out of scope.

---

## 6. Files touched

| File | Change |
|---|---|
| `weather.ts` | **new** — model, presets, clamps, readouts, saved presets |
| `terragen-weather.tsx` | **new** — the section + `Compass` + `Vector2Pad` |
| `useScene.ts` | `weather` state + actions |
| `work-order.ts` | removed `weather`/`time` from `AxisId`, `WorkOrder`, `AXES`, `axisValues`, `deriveWorkOrder`; deleted `StateAxis`/`WeatherAxis`/`TimeAxis` and their helpers |
| `terragen-axes.tsx` | deleted `WeatherEditor` + `TimeEditor` |
| `TerraGenView.tsx` | added the Weather section row; **stage full-bleed** behind the floating dock (was inset to the panel edge) |
| `terragen-parts.tsx` | split a generic `Switch` out of `AxisSwitch`; `Dial` restyled to the boxed `field-well` readout |
| `icons/index.tsx` | 8 weather icons |
| `terragen-budget.tsx` | comment only (math adapts on its own) |
