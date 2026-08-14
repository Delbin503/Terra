# Terra Web — Feature Documentation

One sheet per feature area. Each covers how the user gets to it and what it does, step by step.

| # | Sheet | Covers |
|---|---|---|
| 1 | [Top Navigation Bar](01-top-navigation-bar.md) | The three glass panels along the top — project panel (emoji, name, undo/redo), tool panel (Scene / Assets / AI), action panel (credits, account, preview, Generate → TerraGen) |
| 2 | [SAB · MAT · Layers · 3D Generate](02-ai-tools-sab-mat-layers-3d.md) | The four tool panels: MAT Preview, 3D mesh generation, the AI assistant, and the scene layer tree |
| 3 | [Asset Library](03-asset-library.md) | Categories, cards, search and filters, uploading, folders, multi-select, the View Info panel, and pick mode. Includes what's editable on an upload vs a library asset |
| 4 | [Object Placement and Settings](04-object-placement-and-settings.md) | Getting objects into the scene, selecting them, transform, material, roles, the info card, copy/hide/lock/delete, and viewport navigation |
| 5 | [Camera Settings](05-camera-settings.md) | The camera rig, placement dialog, orbit, distance, climb, capture mode, increments and shots per rotation |

## Where these came from

Written from the code in `src/features/editor/`. Where a control exists in the UI but isn't wired to anything yet, the sheet says so rather than describing intended behaviour as if it were shipped.
