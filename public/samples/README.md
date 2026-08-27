# Sample scene

`world-sample.jpg` is the one photograph the image studio segments.

It is fixed on purpose: there is no segmentation model in the browser, so
keywords are answered from a hand-written map of what is in THIS picture —
see `src/features/home/sample-world.ts`. Replacing the file without
re-checking the seed coordinates in that module will point every highlight at
the wrong thing.
