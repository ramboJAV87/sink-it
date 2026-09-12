# Green Read — prototype source

- `physics.js` — terrain model, ball simulation, cup rules, scoring. Pure functions, no DOM. Runs in node and browser.
- `gen.js` — seeded green generator + fairness solver. Depends on physics.js.
- `app.html` — the playable prototype. `/*PHYSICS*/` and `/*GEN*/` are replaced by the two files above to make `green-read.html`.

The physics and generator are the product. Port them verbatim to TypeScript; do not "improve" the numbers without re-running the solver.
