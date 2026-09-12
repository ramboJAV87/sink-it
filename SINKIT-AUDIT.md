# Sink It — Pre-Production Audit

Prepared September 12, 2026 for Rust Belt Standards LLC. This is the handoff from prototype to real build. Everything below is either verified in the prototype, a known gap, or a decision that has to be made before Claude Code writes the first line.

**Bottom line:** the core loop, physics, generator and fairness solver are done and tested. What's missing is everything around them: persistence, backend, sound, onboarding, store assets, and legal housekeeping. None of it is hard. The order matters.

---

## 1. What exists and is verified

| Piece | State | Verified how |
|---|---|---|
| Ball physics (terrain, rolling friction from stimp, cup capture, horseshoe lip-out, rim spiral) | Done | Node simulation over every drop point on 24+ generated greens |
| Terrain model (tiers, mounds, dips, cradle edges, backstop, organic outline) | Done | Same |
| Green generator, seeded and deterministic | Done | 24/24 fair on the acceptance test, ~0.35 s per green |
| Fairness solver (hole-outs available, no dead spots, capped run-overs, pass rate in band) | Done | Same |
| Daily green (seeded from date, all three balls count, max 300) | Done | Headless browser run end to end |
| Campaign (endless, difficulty ramps to max at green 40, best-of-3, 1–3 stars) | Done | Same |
| Green creator (mound/dip/cup/zone, undo, tap-to-remove, solver-gated play and share, share codes) | Done | Same |
| Rendering (night theme, flowing current, true-size cup, slow-mo + camera dive, trails, confetti, crowd, trees, bunkers) | Done | Screenshots at phone size |
| Drag-to-aim with distance readout | Done | Same |
| Share text (Wordle style) | Done | Same |

Source is in `prototype/`. **physics.js and gen.js are the product.** Port them line for line.

## 2. Physics parameters — the numbers, so nobody re-derives them

All in feet and seconds. Screen y grows downward.

- Gravity `G = 32.2`. Rolling deceleration `fr = 18 / stimp` (from the stimpmeter: 6 ft/s release rolls `stimp` feet). Stimp 10 → 1.8 ft/s².
- A ball at rest starts moving only when slope exceeds `fr / G` (5.6% at stimp 10). **This is why arrows show net pull, not raw slope, and why the generator rejects any zone with a resting spot.**
- Fringe (off the green outline): friction × 4.
- A ball under 0.35 ft/s that is decelerating is stopped (grass grabs it). A ball under 0.05 ft/s with gravity below friction rests.
- Cup radius `CUP_R = 0.36 ft` (about 2× regulation, deliberate). Drawn at exactly that size.
- Capture: center inside 70% of the cup radius drops in at any speed under 9 ft/s. Center on the outer rim drops only under `MAX_HOLE_SPEED = 5.8`.
- Lip-out: rim kicks the velocity outward by 0.55 × speed and multiplies speed by 0.88, once per pass.
- Rim spiral on capture: 0.35–1.55 turns scaling with entry speed; a ball under 1.6 ft/s just tips in.
- Integration: dt = 1/240 s, path sampled every 4 steps (1/60 s). Max 25 s per roll. Balls are clamped to the canvas.
- Scoring: proximity `80 × max(0, 1 − dist/8)`, holed = 100. Stars: ★ at target, ★★ at target+18 (cap 80), ★★★ holed.
- Difficulty band for the generator: blind single-drop pass rate from ~40% (easy) down to ~8% (max), lower bound 45% of upper.

**Decision to lock:** these are game-feel numbers, not physics constants. Change them only by re-running the solver acceptance test.

## 3. Known issues and honest gaps

Ranked by how much they'd hurt at launch.

1. **No persistence.** Progress, streaks, stars, one-and-done daily lock — none of it survives a reload in the prototype. First thing in the real build.
2. **No sound design.** Three synthesized tones. The roll needs a grass sound, the drop needs a real "thunk", the crowd needs a murmur and a cheer. Budget 20–30 short clips; license from a library (Epidemic, Soundsnap) or commission. Do not ship synth tones.
3. **No onboarding.** The first-green message is a paragraph. Needs a 3-step overlay: aim, drop, watch — then never again.
4. **Generator runs on the main thread.** 0.35 s is a visible hitch on a mid-range Android phone. Move it to a worker/thread or precompute the next green while the current one plays.
5. **Balls can run past the cup, catch the backstop and come back in.** Physically legitimate and a great moment, but some players will call it unrealistic. Keep it, watch feedback.
6. **Long rolls.** A ball dying in a valley can take 15–20 s. The 9-second hurry-up covers it, but the solver should also cap accepted greens at a median roll time of ~9 s.
7. **Custom greens are only sanity-checked, not balanced.** Fine: player greens are allowed to be unfair, the verdict says so.
8. **Share is text only.** The share image (green + three trails + score) is the viral asset and it's not built.
9. **Difficulty ramp is guessed.** Bands were set by me, not by players. Instrument it and expect to retune after week one.
10. **No accessibility pass.** Color contrast is fine; reduced-motion is respected; no screen-reader labels; no colorblind-safe check on the emoji share line (green/yellow/black is a problem for deuteranopia — use ⛳🎯🟡⚫ or shapes).
11. **Web-only affordances.** `prompt()` for load-code, `navigator.share` fallback to clipboard. Native replaces both.
12. **Off-green ball behavior is approximate.** A ball that leaves the outline just gets 4× friction. There's no rough/bunker interaction. Acceptable.

## 4. Legal, policy and naming — do these before the first store submission

- **Name.** "Sink It" is descriptive: the category is literally called green-reading apps and WhyGolf ships a "Sink Iter" feature. A descriptive mark is hard to register and easy to collide with. Options: keep it as a working title and pick a distinctive name (one invented word, or a two-word phrase that isn't the category), or accept weak trademark protection. Run a USPTO TESS search and check both stores for exact matches before deciding. My recommendation: pick a distinctive name now; renaming after launch throws away search rank.
- **Real courses.** Never use course names, hole nicknames, or logos (Augusta, Amen Corner, Pebble, etc.). Fictional names only. This also applies to "inspired by" marketing.
- **Kids.** Do not list as a kids' app. General audience, rated 9+ (iOS) / Everyone (Google). No behavioral ads, non-personalized ad config by default, no chat, no user-generated text beyond a display name that's filtered. This keeps COPPA obligations manageable while the audience can still include kids. If you later want a Kids category listing, that's a separate build with no third-party ads.
- **Privacy.** You'll collect: device ID, optional display name, country from locale, scores and drop coordinates, purchase state. Write the privacy policy to match exactly that. Apple's privacy nutrition labels and Google's data safety form must agree with it.
- **Monetization policy already agreed:** rewarded ad for a campaign mulligan (never in the daily), one-time Pro unlock, cosmetics later. No loot boxes, no currencies, no forced interstitials.
- **Sound and font licensing.** Every audio clip and any bundled font needs a license that permits app distribution. System fonts (SF Pro Rounded / Roboto) cost nothing and look right.
- **Ohio LLC housekeeping:** the app should be published under Rust Belt Standards LLC on both stores, same as Coastward.

## 5. Architecture for the real build

### Client
- **Expo (React Native), TypeScript.** Same toolchain as Coastward, so the account, EAS, and pilot-push rules already exist.
- **Rendering: `@shopify/react-native-skia`.** The whole green is one Skia canvas. Hillshade and rough texture render once per green to an offscreen image; the current, ball, crowd, and particles draw each frame. Target 60 fps on a 2020 mid-range Android phone.
- **Physics and generator: pure TypeScript modules**, ported from physics.js/gen.js, with a Jest test that reproduces the acceptance run (24 seeds, all fair). Run the generator and solver in a worker thread (`react-native-worklets` or a JS thread via `expo-threads` equivalent); precompute green N+1 during green N.
- **Persistence: SQLite via `expo-sqlite`** for progress, results, custom greens, settings. Small and boring. Do not use AsyncStorage for anything you'd be sad to lose.
- **Audio: `expo-av`** with preloaded clips. Haptics: `expo-haptics`.
- **Share: `expo-sharing` + `react-native-view-shot`** to render the share image from a hidden Skia canvas.
- **Ads: `react-native-google-mobile-ads`** rewarded only, non-personalized config. **IAP: `expo-in-app-purchases` or RevenueCat** (RevenueCat is worth its free tier for receipt validation and cross-platform entitlements).
- **Analytics: PostHog or Amplitude free tier.** Events listed in §7.

### Backend (Supabase)
Tables:
- `players` (id, device_id, display_name, country, created_at)
- `daily_results` (player_id, day, drops jsonb[3], score int, verified bool, created_at) — unique on (player_id, day)
- `custom_greens` (id, author_id, code, name, plays, best_score)
- `entitlements` (player_id, pro bool) — mirrored from RevenueCat webhook

**Anti-cheat, the cheap version:** the daily green is `generate(hash("daily-" + YYYY-MM-DD), 0.35)`. The client submits three drop coordinates, not a score. A Supabase Edge Function re-runs the same TypeScript physics on the same seed and computes the score server-side. A submitted score never exists. Two rules on top: one submission per player per day (DB constraint), and drops must be inside the zone. That's the whole system; it's a few hundred lines because the physics is deterministic.

**Determinism warning:** `Math.exp`, `Math.hypot`, `Math.atan2` can differ in the last bits across JS engines. Either accept a tolerance (server compares to within 1 point) or replace them with fixed implementations. Tolerance is fine.

**Leaderboards:** daily (score), weekly and monthly (sum of dailies — missed days count as zero). Filters: world / country / friends (friend = mutual code exchange, no social graph needed). Materialize weekly/monthly with a scheduled function; don't sum on every request.

## 6. Data formats — lock these now

Level JSON (already what the generator emits):
```
{ W, H, edge, stimp, zone:{x,y,w,h}, hole:{x,y}, tilt:{dx,dy},
  features:[ {ramp:'x'|'y', from, to, drop} | {x,y,a,s} ],
  shape:{cx,cy,rx,ry,h:[{k,a,p}]}, target, name, seed, diff, reveal }
```
Share code: `GR1.` + base64(JSON of editor state). Version-prefixed so the format can change. In the app this becomes a universal link: `https://<domain>/g/GR1....`

Result record: `{ level_seed, mode, drops:[[x,y],...], scores:[...], best, total, stars, at }`.

## 7. Analytics — the only numbers that matter for the first 60 days

Events: `green_started {mode, seed, diff}`, `ball_dropped {x,y,dist_to_cup}`, `ball_finished {score, holed, lipped, roll_seconds}`, `green_finished {stars, total, balls_used}`, `daily_completed {total}`, `share_opened`, `share_completed`, `custom_created`, `custom_played {code}`, `mulligan_offered`, `mulligan_watched`, `pro_purchased`.

Dashboards: D1/D7/D30 retention, daily-green completion rate, share rate per daily completion, custom greens created per 100 players, run-over rate and average stars by difficulty (to retune the generator).

## 8. Testing plan

- **Unit:** physics regression (golden paths for 10 fixed seeds/drops, must match within 1e-6), generator acceptance (24 seeds fair), scoring, star thresholds, share-code round-trip.
- **Determinism:** run the same daily seed on iOS, Android, and the server; scores must match within tolerance.
- **Performance:** frame time on a Pixel 4a / iPhone 11 during the celebration (worst case: particles + crowd + zoom). Budget 16 ms.
- **Device matrix:** smallest supported screen (iPhone SE), largest (tablet — decide whether to support or letterbox), Android with gesture nav (the drag-to-aim must not trigger back).
- **Store review traps:** rewarded ad must be skippable-by-not-watching; IAP restore button must exist; privacy labels must match the policy; the app must be playable fully offline except leaderboards.

## 9. Store readiness checklist

- Distinctive name decided and checked (§4)
- App icon (1024²), adaptive Android icon, splash
- 6–8 screenshots per platform showing: the current, a hole-out, the daily share card, the creator, the leaderboard
- 15–30 s preview video: one full roll into the cup with the crowd. This is also the first marketing clip.
- Short description (80 chars), long description, keywords (green reading, putting, golf puzzle, daily golf)
- Age rating questionnaires (no violence, no gambling — rewarded ads are not gambling, IAP disclosed)
- Privacy policy URL and support URL on the company site (already set up for Coastward — add a Sink It page)
- Test accounts and a reviewer note explaining the daily lock and how to trigger a hole-out (give them an easy custom-green code)

## 10. Build plan

Phase 0 — decisions (this week, you): name; Pro price; whether tablets are supported; whether the first release includes the creator (my vote: yes, it's built).

Phase 1 — foundation (weeks 1–2): Expo project, Skia renderer, physics/generator port with the acceptance test passing, SQLite persistence, campaign and daily playable offline, one-and-done lock, streaks.

Phase 2 — feel (week 3): sound design, haptics, onboarding overlay, share image, worker-thread generation, reduced-motion path, accessibility labels.

Phase 3 — backend (week 4): Supabase schema, verified daily submission, leaderboards, friend codes, custom-green links.

Phase 4 — money (week 5): rewarded mulligan, Pro unlock via RevenueCat, restore purchases, analytics events.

Phase 5 — release (week 6): store assets, TestFlight + internal Play track through the existing pilot process, review submission. Soft launch; watch D1 and share rate for two weeks before any spend.

## 11. Kickoff prompt for Claude Code

Paste this to start. It follows the same pilot rules as Coastward (no `eas update` without "push it").

```
You are building Sink It, a golf green-reading mobile game for Rust Belt Standards LLC, in Expo (React Native, TypeScript) with @shopify/react-native-skia for rendering. The prototype is in ./prototype (physics.js, gen.js, app.html, README.md) and the product audit is in ./SINKIT-AUDIT.md. Read both fully before writing code.

Phase 1 scope, in this order:
1. Port physics.js and gen.js to src/engine/physics.ts and src/engine/generator.ts with identical numeric behavior. Add Jest tests: (a) golden-path regression — simulate 10 fixed (seed, drop) pairs and snapshot the final position, holed, and score; (b) generator acceptance — seeds 1000..1023 with diff = min(1, i/20) must all pass the fairness rule (holed >= 1.5%, run-over <= 3% (0.5% when diff < 0.3), within-8ft >= 25%, moved >= 99%). Tests must pass before anything else.
2. Skia renderer that reproduces app.html's draw(): hillshade + rough texture rendered once per green to an offscreen image; per-frame current, ball, trails, cup, flag, drop zone, aim line + distance, crowd, trees, bunkers, confetti, camera dive to 2.1x with 40% time in the last 3.2 ft. Respect reduced-motion.
3. Screens: Home (Daily #N with streak, Play, Create), Play (header, stars strip, canvas, message, actions), Create (tools, sliders, verdict, undo, play, share code).
4. expo-sqlite persistence: campaign level, stars per green, daily result and one-and-done lock per date, streak, custom greens, settings.
5. Drag-to-aim with pointer capture; gesture navigation on Android must not interfere.

Rules: keep physics numbers exactly as in the prototype; every change to them requires re-running the acceptance test. No ads, IAP, or backend in Phase 1. After tsc and tests pass, commit with a clear message and stop — do not run eas update; Tyler verifies on device and says "push it". Flag any change that needs a native rebuild explicitly.
```

## 12. What I'd cut if we had to ship in three weeks instead of six

Cut in this order: friend filter on leaderboards, cosmetics, the creator's share links (keep codes), country leaderboard. Never cut: persistence, the daily lock, sound, the share image, verified scores.
