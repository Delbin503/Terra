# Terra Web — Feature Documentation

One sheet per feature area. Each covers how the user gets to it and what it does, step by step.

| # | Sheet | Covers |
|---|---|---|
| 1 | [Top Navigation Bar](01-top-navigation-bar.md) | The three glass panels along the top — project panel (emoji, name, undo/redo), tool panel (Scene / Assets / AI), action panel (credits, account, preview, Generate → TerraGen) |
| 2 | [SAB · MAT · Layers · 3D Generate](02-ai-tools-sab-mat-layers-3d.md) | The four tool panels: MAT Preview, 3D mesh generation, the AI assistant, and the scene layer tree |
| 3 | [Asset Library](03-asset-library.md) | Categories, cards, search and filters, uploading, folders, multi-select, the View Info panel, and pick mode. Includes what's editable on an upload vs a library asset |
| 4 | [Object Placement and Settings](04-object-placement-and-settings.md) | Getting objects into the scene, selecting them, transform, material, roles, the info card, copy/hide/lock/delete, and viewport navigation |
| 5 | [Camera Settings](05-camera-settings.md) | The camera rig, placement dialog, orbit, distance, climb, capture mode, increments and shots per rotation |
| 6 | [TerraGen — the Generate panel](06-terragen-generate-panel.md) | The Work Order author behind Generate: the two stages, the six dock sections (Objects, Camera, Weather, Environment, Arrangement, Output), the subset/frame arithmetic, preflight and the dispatch review |
| 7 | [Object Grouping and the Layers Panel](07-grouping-and-layers.md) | What a group is, making one from a marquee, what a group edit does to its contents, the click-walks-down selection rule, the Layers tree, its context menu, and ungrouping |

## Where these came from

Written from the code in `src/features/editor/`. Where a control exists in the UI but isn't wired to anything yet, the sheet says so rather than describing intended behaviour as if it were shipped.
