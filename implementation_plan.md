# Scribe — Implementation Plan

Reference: see `PRD.md` for full scope and success criteria. This file tracks build order and progress. Update checkboxes as items complete. Work through phases in order — each one builds on the last.

## Phase 1 — Setup
- [x] GitHub repo created (Scribe)
- [x] README with scope written
- [x] Next.js + TypeScript + Tailwind scaffolded
- [x] Deployed to Vercel, live URL confirmed working
- [x] PRD.md added
- [x] implementation_plan.md added (this file)

## Phase 2 — One letter through the pipeline (vertical slice)
- [x] Build a full-screen Canvas component with Pointer Events capturing raw (x, y) stroke points
- [x] Render the raw captured points back on screen (confirms capture works)
- [x] Integrate `fit-curve` to smooth the raw points into Bézier curves
- [x] Render the smoothed curve on screen next to the raw version (visual sanity check)
- **Checkpoint**: draw one letter, see it smoothed on screen ✅

## Phase 3 — Real font export for one letter
- [x] Integrate `opentype.js` to map the smoothed curve into a glyph outline
- [x] Compile a font file containing just this one glyph
- [x] Offer it as a download
- [ ] Manually install the font and confirm the one glyph renders correctly when typed
  - Format note: export is OpenType/CFF (`.otf`), not TrueType `glyf`, because
    opentype.js only writes CFF outlines. Installs identically on
    macOS/Windows. PRD updated from `.ttf` to `.otf` to match.
- **Checkpoint**: one real, installable glyph — this is the core pipeline proven end to end

## Phase 4 — Redo/review flow + uppercase A–Z
- [x] Build redo/clear-current-letter UI (test against the single glyph first)
- [x] Build the sequential drawing UI that cycles through characters
- [x] Run all 26 uppercase letters through the pipeline
  - Verified with synthetic strokes for all 26: one shared baseline and scale,
    relative letter heights preserved, 26 glyphs in the compiled font.
- [x] Compile and test an uppercase-only font end to end
- **Checkpoint (fallback point)**: fully working, installable uppercase-only font — if time runs short later, this is already a complete, demoable v1
  - Pipeline is proven; still to do by hand: draw the real 26 letters and
    confirm the installed font renders as your own handwriting.
- Metrics note: glyphs are measured against on-canvas baseline/cap-height
  guides, not each glyph's own bounding box, so letters share a baseline and
  scale. Ink overshoots the guides by the pen radius (round caps), uniformly
  for every letter.

## Phase 5 — Lowercase a–z
- [x] Run all 26 lowercase letters through the pipeline
- [x] Spot-check curve-fitting quality on tricky letters (g, y, s, etc.) and adjust if badly broken
  - Tricky letters are ringed in the progress strip so they're easy to revisit.
    Curve fitting itself needed no adjustment — the three outlining bugs found
    in Phase 4 (caps, slow-stroke tremor, missing joins) were the real issues,
    and are fixed and covered by `npm run test:outline`.
- [x] Compile and test uppercase + lowercase font
  - 52 glyphs, verified in font units: caps and ascenders 716, x-height 515,
    descenders 216 below baseline (each = the metric plus a 16-unit pen
    overshoot). Measured x-height/cap ratio 0.713 against the designed 0.714.
- Added an x-height guide plus per-character prompts ("draw to x-height",
  "tail below baseline"), since lowercase is the first set where letters
  target different vertical zones.

## Phase 6 — Digits, punctuation, kerning
- [x] Run digits 0–9 through the pipeline
- [x] Run punctuation set through the pipeline
- [x] Add basic kerning/spacing pass
  - Per-glyph **optical side bearings**, not pair kerning: opentype.js's writer
    emits neither a `kern` nor a `GPOS` table (verified by round-tripping a
    font with `kerningPairs` set — the table is silently dropped), so pair
    adjustment cannot be exported. Bearings come from profiling how far the
    ink recedes from each edge, so an open shape is spaced closer than a
    closed one. Word space tracks the median advance rather than a fixed em
    fraction.
- [x] Compile and test the full character set as one font
  - 70 glyphs. Advances track drawn width (narrow 182 / normal 225 / wide 281
    units); punctuation lands in its intended zone — `.` and `,` just above
    baseline, `:` to x-height, quotes near cap height, `-` mid-way.

## Phase 7 — Final polish, deploy, document
- [ ] Final full-font compile and install test
- [ ] Fix any visibly broken glyphs or spacing
- [ ] Deploy final version to Vercel
- [ ] Record short demo GIF/video (draw → download → install → type)
- [ ] Write up project case study / update README with real usage instructions and known limitations
- [ ] Note any cut scope explicitly in README (do not cut silently)

## Fallback Rule
If time runs short at any point, protect the final phase (deploy + document + demo) above all else. A smaller, fully working, well-documented font beats a larger, undocumented, half-broken one.
