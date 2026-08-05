"use client";

import { useCallback, useMemo, useState } from "react";
import DrawingCanvas, { type Stroke } from "./DrawingCanvas";
import {
  CHARACTER_SETS,
  TRICKY,
  verticalHint,
  type CharacterSetId,
} from "../lib/characterSet";
import { fitStroke } from "../lib/fitStroke";
import type { Guides } from "../lib/fontMetrics";
import {
  buildFont,
  downloadFont,
  strokesToGlyphOutlines,
  type DrawnGlyph,
} from "../lib/buildFont";

/** Strokes drawn for each character, keyed by the character itself. */
type GlyphMap = Record<string, Stroke[]>;

export default function GlyphStudio() {
  const [glyphs, setGlyphs] = useState<GlyphMap>({});
  const [setId, setSetId] = useState<CharacterSetId>("uppercase");
  const [index, setIndex] = useState(0);
  const [guides, setGuides] = useState<Guides | null>(null);
  const [maxError, setMaxError] = useState(4);
  const [penWidth, setPenWidth] = useState(18);
  const [showRaw, setShowRaw] = useState(false);
  const [showFit, setShowFit] = useState(false);
  const [showInk, setShowInk] = useState(true);
  const [status, setStatus] = useState<string | null>(null);

  const characters = CHARACTER_SETS[setId].characters;
  const character = characters[Math.min(index, characters.length - 1)];
  const currentStrokes = useMemo(
    () => glyphs[character] ?? [],
    [glyphs, character]
  );
  const drawnCount = useMemo(
    () => characters.filter((c) => (glyphs[c]?.length ?? 0) > 0).length,
    [glyphs, characters]
  );
  // Which guide this character should reach, so the prompt is unambiguous —
  // it matters most for punctuation, where nothing else says a period belongs
  // on the baseline and a quote up near cap height.
  const targetGuide = verticalHint(character);

  const setStrokesFor = useCallback(
    (char: string, strokes: Stroke[]) => {
      setGlyphs((prev) => ({ ...prev, [char]: strokes }));
      setStatus(null);
    },
    []
  );

  const handleStrokesChange = useCallback(
    (strokes: Stroke[]) => setStrokesFor(character, strokes),
    [character, setStrokesFor]
  );

  const undoStroke = () =>
    setStrokesFor(character, currentStrokes.slice(0, -1));
  const clearLetter = () => setStrokesFor(character, []);

  const go = (delta: number) => {
    setIndex((i) => Math.min(characters.length - 1, Math.max(0, i + delta)));
    setStatus(null);
  };

  // Refit every glyph, not just the visible one: tolerance is a font-wide
  // setting, so leaving other letters on the old fit would export a font whose
  // letters were smoothed inconsistently.
  const handleMaxErrorChange = (next: number) => {
    setMaxError(next);
    setGlyphs((prev) => {
      const out: GlyphMap = {};
      for (const [char, strokes] of Object.entries(prev)) {
        out[char] = strokes.map((s) => ({
          ...s,
          curves: fitStroke(
            s.points.map((p) => [p.x, p.y]),
            next
          ),
        }));
      }
      return out;
    });
  };

  const generateFont = () => {
    if (!guides) {
      setStatus("canvas not ready");
      return;
    }
    // Export everything drawn, not just the visible set — otherwise switching
    // from A–Z to a–z would silently drop the capitals from the font.
    const drawn: DrawnGlyph[] = [];
    for (const char of Object.keys(glyphs).sort()) {
      const strokes = glyphs[char];
      if (!strokes || strokes.length === 0) continue;
      const outlines = strokesToGlyphOutlines(strokes, penWidth, guides);
      if (outlines) drawn.push({ character: char, outlines });
    }
    if (drawn.length === 0) {
      setStatus("draw at least one letter first");
      return;
    }
    try {
      const font = buildFont(drawn);
      const hasUpper = drawn.some((g) => /[A-Z]/.test(g.character));
      const hasLower = drawn.some((g) => /[a-z]/.test(g.character));
      const suffix =
        hasUpper && hasLower ? "" : hasLower ? "-lowercase" : "-uppercase";
      downloadFont(font, `scribe${suffix}.otf`);
      setStatus(`exported ${drawn.length} glyph${drawn.length === 1 ? "" : "s"}`);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "export failed");
    }
  };

  const chip =
    "rounded border border-zinc-200 bg-white px-2.5 py-1.5 text-xs font-mono";
  const button = `${chip} hover:bg-zinc-100 disabled:opacity-40 disabled:hover:bg-white`;

  return (
    <div className="flex flex-1 flex-col bg-zinc-50">
      <header className="flex flex-wrap items-center gap-3 border-b border-zinc-200 bg-white px-4 py-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => go(-1)}
            disabled={index === 0}
            className={button}
            aria-label="previous character"
          >
            ←
          </button>
          <div className="flex h-12 w-12 items-center justify-center rounded border border-zinc-300 text-2xl font-semibold">
            {character}
          </div>
          <button
            onClick={() => go(1)}
            disabled={index === characters.length - 1}
            className={button}
            aria-label="next character"
          >
            →
          </button>
        </div>

        <div className="flex gap-1">
          {(Object.keys(CHARACTER_SETS) as CharacterSetId[]).map((id) => (
            <button
              key={id}
              onClick={() => {
                setSetId(id);
                setIndex(0);
                setStatus(null);
              }}
              className={
                id === setId
                  ? `${chip} bg-zinc-900 text-white`
                  : `${chip} hover:bg-zinc-100`
              }
            >
              {CHARACTER_SETS[id].label}
            </button>
          ))}
        </div>

        <span className={chip}>
          {index + 1} / {characters.length}
        </span>
        <span className={chip}>
          drawn {drawnCount} / {characters.length}
        </span>
        <span className={chip}>strokes {currentStrokes.length}</span>
        <span className={`${chip} text-zinc-700`}>draw to {targetGuide}</span>

        <button
          onClick={undoStroke}
          disabled={currentStrokes.length === 0}
          className={button}
        >
          undo stroke
        </button>
        <button
          onClick={clearLetter}
          disabled={currentStrokes.length === 0}
          className={button}
        >
          clear letter
        </button>

        <label className={`${chip} flex items-center gap-2`} title="fit-curve tolerance">
          error {maxError}
          <input
            type="range"
            min={1}
            max={60}
            value={maxError}
            onChange={(e) => handleMaxErrorChange(Number(e.target.value))}
            className="w-20"
          />
        </label>
        <label className={`${chip} flex items-center gap-2`} title="pen thickness">
          pen {penWidth}
          <input
            type="range"
            min={2}
            max={60}
            value={penWidth}
            onChange={(e) => setPenWidth(Number(e.target.value))}
            className="w-20"
          />
        </label>

        <div className="ml-auto flex items-center gap-2">
          <button onClick={() => setShowInk((v) => !v)} className={button}>
            ink {showInk ? "on" : "off"}
          </button>
          <button onClick={() => setShowRaw((v) => !v)} className={button}>
            raw {showRaw ? "on" : "off"}
          </button>
          <button onClick={() => setShowFit((v) => !v)} className={button}>
            fit {showFit ? "on" : "off"}
          </button>
          <button
            onClick={generateFont}
            className={`${chip} bg-zinc-900 font-semibold text-white hover:bg-zinc-700`}
          >
            generate font
          </button>
          {status && <span className={`${chip} text-zinc-600`}>{status}</span>}
        </div>
      </header>

      <div className="relative flex-1">
        <DrawingCanvas
          strokes={currentStrokes}
          onStrokesChange={handleStrokesChange}
          onGuidesChange={setGuides}
          maxError={maxError}
          penWidth={penWidth}
          showRaw={showRaw}
          showFit={showFit}
          showInk={showInk}
        />
      </div>

      <footer className="flex flex-wrap gap-1 border-t border-zinc-200 bg-white px-4 py-2">
        {characters.map((c, i) => {
          const done = (glyphs[c]?.length ?? 0) > 0;
          // Tricky letters get a ring so they're easy to come back and review;
          // they are where curve fitting is most likely to look wrong.
          const tricky = TRICKY.includes(c);
          return (
            <button
              key={c}
              title={tricky ? "tight curves — worth reviewing" : undefined}
              onClick={() => {
                setIndex(i);
                setStatus(null);
              }}
              className={`h-7 w-7 rounded text-xs font-mono ${
                tricky ? "ring-1 ring-amber-400" : ""
              } ${
                i === index
                  ? "bg-zinc-900 text-white"
                  : done
                    ? "bg-emerald-100 text-emerald-900 hover:bg-emerald-200"
                    : "bg-zinc-100 text-zinc-500 hover:bg-zinc-200"
              }`}
            >
              {c}
            </button>
          );
        })}
      </footer>
    </div>
  );
}
