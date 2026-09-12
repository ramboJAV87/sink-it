# Sink It — brand assets

## Files
- `sinkit-icon.svg` / `sinkit-icon-*.png` — app icon, full-bleed square (no text). PNGs at every size iOS/Android need: 1024 (store), 512 (Play Store), 180/167/152/120/87/60/40/29/20 (iOS device sizes — export @2x/@3x as needed via your build tool).
- `sinkit-wordmark-dark.svg/png` — horizontal lockup (mark + "sink it") for dark backgrounds: splash screens, store header, dark-mode web.
- `sinkit-wordmark-light.svg/png` — same lockup for light backgrounds: light-mode web, printed materials.
- `sinkit-mark-monochrome.svg/png` — white silhouette of the mark alone, no text. For splash/loading screens and anywhere a single-color version is needed.

## Colors
- Ink / background: `#0B1410`
- Lime (primary accent, "it"): `#B8F53D`
- Cyan: `#4CE0D2`
- Coral flag: `#FF5A5F`
- Cream (light bg): `#F5F1E4`

## Type
Wordmark set in **Poppins**, weight 700 (Bold), letter-spacing -2. Poppins is a free/open Google Font — bundle `Poppins-Bold.ttf` (and Regular/Medium for in-app UI text if desired) with the app rather than depending on a device font.

## Mark
Golf ball → curling break line (the game's core visual, lime-to-cyan) → cup with flag. Reads as golf at any size down to a 20px favicon; the ball/flag/cup silhouette carries it even when the trail dots compress out.

## Usage notes
- Icon SVG is full-bleed to the canvas edge — let iOS/Android apply their own corner mask, don't pre-round it.
- Don't recolor the flag or reverse the ball to a dark fill; both were tuned for contrast against the specific backgrounds provided (dark green icon bg, cream light-wordmark bg).
- The comet-trail motif (tapering dots + arrowhead, lime→cyan) is the recurring brand device — reuse it in loading spinners, transitions, and marketing rather than inventing a new one.
