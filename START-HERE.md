# Sink It — Start Here

This folder is everything Claude Code needs. Do the four setup steps below yourself
(15–20 minutes total, no code), then hand the folder to Claude Code with the prompt
at the bottom.

## What's in this folder
- `SINKIT-AUDIT.md` — the full pre-production audit: what's built, what's missing,
  architecture, data formats, physics parameters, legal/store checklist, build phases.
  Claude Code should read this in full before writing anything.
- `prototype/` — the working game logic (`physics.js`, `gen.js`) and the HTML
  prototype (`app.html`) you've been testing. This gets ported, not rewritten.
- `brand/` — the app icon (all sizes), wordmark, monochrome mark, and a brand README
  with exact colors and font.

## Your setup steps (do these first)

1. **GitHub repo.** Create an empty repo — e.g. `ramboJAV87/sink-it` (same account
   pattern as Coastward). Don't add a README or license from GitHub's template;
   Claude Code will initialize it.

2. **App identifiers.** Reserve now on both platforms so you never have to rename
   mid-build like Coastward did:
   - iOS: App Store Connect → My Apps → New App → Bundle ID `com.rustbeltstandards.sinkit`
   - Android: Google Play Console → you'll set this when you create the app listing,
     same value: `com.rustbeltstandards.sinkit`

3. **New Supabase project.** Separate from Coastward's — new project, new URL, new
   keys. Name it `sinkit` or `sink-it-prod`. Free tier covers Phase 1–3 easily.

4. **Domain/URL for policy pages.** Decide now: either `sinkit.rustbeltstandards.com`
   (subdomain, fastest — just add a DNS record) or a standalone domain if you want
   Sink It to feel independent of RBS in the store listing. Either works; subdomain
   is less setup.

That's it. Everything else — the Expo project, the code, the tests — Claude Code sets up.

## Handing it off

Upload this whole folder into your Claude Code session (or push it into the new repo
first and let Claude Code work from there — cleaner, since it can commit as it goes).
Then paste this:

```
You are building Sink It, a golf green-reading mobile game for Rust Belt Standards
LLC, in Expo (React Native, TypeScript) with @shopify/react-native-skia for
rendering. Read ./SINKIT-AUDIT.md in full, then ./prototype/README.md, then look at
./prototype/physics.js, ./prototype/gen.js, and ./prototype/app.html. The app icon
and wordmark are in ./brand — use sinkit-icon-1024.png and the sizes in that folder
for the Expo app icon config, and read brand/README.md for the color palette and
font (Poppins Bold) before building any UI.

Bundle ID: com.rustbeltstandards.sinkit on both platforms. GitHub repo: [paste your
repo URL]. Supabase project: [paste your project URL once created] — Phase 1 doesn't
need it yet, but wire the .env now so it's ready for Phase 3.

Phase 1 scope, in this order:
1. Port physics.js and gen.js to src/engine/physics.ts and src/engine/generator.ts
   with identical numeric behavior. Add Jest tests: (a) golden-path regression —
   simulate 10 fixed (seed, drop) pairs and snapshot the final position, holed, and
   score; (b) generator acceptance — seeds 1000..1023 with diff = min(1, i/20) must
   all pass the fairness rule (holed >= 1.5%, run-over <= 3% (0.5% when diff < 0.3),
   within-8ft >= 25%, moved >= 99%). Tests must pass before anything else.
2. Skia renderer reproducing app.html's draw(): hillshade + rough texture rendered
   once per green to an offscreen image; per-frame current, ball, trails, cup, flag,
   drop zone, aim line + distance, crowd, trees, bunkers, confetti, camera dive to
   2.1x with 40% time in the last 3.2 ft. Respect reduced-motion.
3. Screens: Home (Daily #N with streak, Play, Create), Play (header, stars strip,
   canvas, message, actions), Create (tools, sliders, verdict, undo, play, share code).
4. expo-sqlite persistence: campaign level, stars per green, daily result and
   one-and-done lock per date, streak, custom greens, settings.
5. Drag-to-aim with pointer capture; gesture navigation on Android must not interfere.
6. Wire the app icon and splash from ./brand.

Rules: keep physics numbers exactly as in the prototype; every change to them
requires re-running the acceptance test. No ads, IAP, or backend in Phase 1. After
tsc and tests pass, commit with a clear message and stop — do not run eas update;
I verify on device and say "push it". Flag any change that needs a native rebuild
explicitly.
```

## After Phase 1 is verified on your device

Come back to this chat (or open a new one and paste `SINKIT-AUDIT.md`) and I'll give
you the Phase 2–5 kickoff prompts the same way: sound and onboarding, then the
Supabase backend and verified daily scores, then monetization, then store assets.
Sections 10 and 11 of the audit lay out that whole sequence if you want to read
ahead.

## The one decision still sitting with you

The audit flags it in Phase 0: whether tablets are supported, and confirming
$4.99 as the Pro price. Neither blocks Claude Code from starting Phase 1 — answer
them whenever, before Phase 4.
