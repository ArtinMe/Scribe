# Scribe — Product Requirements Document

## Overview
Scribe is a web app that turns a user's handwriting into a real, installable font file. The user draws each letter on a canvas in their browser; the app converts each drawing into smooth vector curves and compiles them into a downloadable `.otf` font that works anywhere fonts work — Word, Figma, phones, websites.

## Demo Moment
A user draws the alphabet, digits, and basic punctuation on screen, clicks "Generate Font," downloads a `.otf` file, installs it on their computer, and types a sentence in their own handwriting in any app.

## Goals
- Ship a fully working, end-to-end pipeline: draw → smooth → export → install.
- Deployed and demoable, not just running locally.
- Every design decision explainable in an interview (why this curve-fitting algorithm, why this export approach).

## Non-Goals (out of scope for v1)
- Multi-user accounts or saved fonts on a server (single-session, local-only for now).
- Ligatures, contextual alternates, or advanced OpenType features.
- Mobile/touch-optimized drawing (desktop mouse/trackpad/stylus is the target input).
- Collaborative or shared font editing.

## Target Character Set (v1, full scope)
- Uppercase A–Z
- Lowercase a–z
- Digits 0–9
- Basic punctuation: `. , ! ? ' " - :`

## Core User Flow
1. User lands on the app, sees a canvas and a prompt for the current character to draw (e.g., "Draw: A").
2. User draws the character using mouse/trackpad/stylus.
3. User can redo/clear the current letter before confirming.
4. On confirm, the app advances to the next character in the set.
5. Once all characters are drawn, user clicks "Generate Font."
6. App compiles all glyphs into a `.otf` file and offers it as a download.
7. User installs the font locally and can type with it.

## Technical Pipeline
1. **Capture** — HTML5 Canvas + Pointer Events record raw (x, y) stroke points per character.
2. **Smooth** — Raw points are fitted to smooth Bézier curves via `fit-curve` (implementing Schneider's curve-fitting algorithm).
3. **Assemble** — Smoothed curves for each glyph are mapped into a font's glyph outline format.
4. **Export** — `opentype.js` compiles all glyphs into a single `.otf` font file, including basic spacing/kerning metadata. OpenType/CFF rather than TrueType `glyf`: opentype.js only writes CFF outlines, and a CFF font installs identically on macOS/Windows.
5. **Deliver** — Font file is offered as a browser download.

## Stack
- Next.js (App Router), TypeScript, Tailwind CSS
- HTML5 Canvas + Pointer Events (drawing capture)
- `fit-curve` (curve smoothing)
- `opentype.js` (font compilation/export)
- Deployed on Vercel (free/Hobby tier)

## Feature Scope for This Build (7-Day Full Scope)
- [x] Canvas capture for a single character, raw points visible/renderable
- [x] Curve fitting integrated — raw points become smooth Bézier curves
- [ ] Single glyph exported as a real, installable `.otf`
- [ ] Full drawing UI cycling through the entire character set (uppercase, lowercase, digits, punctuation)
- [ ] Redo/clear flow per character before confirming
- [ ] Basic kerning/spacing pass so words don't look cramped or overly loose
- [ ] Full font compiled and downloadable
- [ ] Deployed, working demo on Vercel
- [ ] Short demo GIF/video for the portfolio

## Success Criteria
- A user can complete the full flow start to finish without errors.
- The exported `.otf` installs correctly on macOS/Windows and renders recognizably as the user's own handwriting.
- The live Vercel deployment reflects the latest working version at all times.

## Risks / Known Unknowns
- Curve-fitting quality may vary significantly by letter shape — lowercase cursive-adjacent letters (g, y, s) are the highest-risk cases.
- Kerning/spacing is inherently approximate without manual per-pair tuning; a simple uniform-width fallback is acceptable if time runs short.
- If time runs short: uppercase-only is the fallback demoable version (see checkpoint after core alphabet in build plan), with lowercase/digits/punctuation noted as "next steps" in the README rather than cut silently.
