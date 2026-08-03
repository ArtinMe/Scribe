"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { type BezierCurve, countSegments, fitStroke } from "../lib/fitStroke";
import {
  buildSingleGlyphFont,
  downloadFont,
  strokesToGlyphOutlines,
} from "../lib/buildFont";
import { expandStroke, flattenCurves } from "../lib/strokeToOutline";

export type Point = {
  x: number;
  y: number;
  pressure: number;
  t: number;
};

export type Stroke = {
  id: number;
  pointerType: string;
  points: Point[];
  /** Fitted lazily when the stroke ends; invalidated when tolerance changes. */
  curves: BezierCurve[] | null;
};

const RAW_COLOR = "#c9ccd1";
const POINT_COLOR = "#e5484d";
const FIT_COLOR = "#0b6bcb";
const OUTLINE_COLOR = "#18181b";

export default function DrawingCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // Strokes live in a ref so pointermove never triggers a React render — we
  // repaint the canvas directly and only sync counts to state for the HUD.
  const strokesRef = useRef<Stroke[]>([]);
  const activeStrokeRef = useRef<Stroke | null>(null);
  const strokeIdRef = useRef(0);

  const [showRaw, setShowRaw] = useState(true);
  const [showFit, setShowFit] = useState(true);
  const [showOutline, setShowOutline] = useState(false);
  const [maxError, setMaxError] = useState(4);
  const [penWidth, setPenWidth] = useState(18);
  const [character, setCharacter] = useState("A");
  const [exportError, setExportError] = useState<string | null>(null);
  const [stats, setStats] = useState({ strokes: 0, points: 0, segments: 0 });
  const [lastPoint, setLastPoint] = useState<Point | null>(null);

  const toXY = (points: Point[]): [number, number][] =>
    points.map((p) => [p.x, p.y]);

  const syncStats = useCallback(() => {
    const strokes = strokesRef.current;
    setStats({
      strokes: strokes.length,
      points: strokes.reduce((n, s) => n + s.points.length, 0),
      segments: countSegments(strokes.map((s) => s.curves ?? [])),
    });
  }, []);

  const drawCurves = (ctx: CanvasRenderingContext2D, curves: BezierCurve[]) => {
    if (curves.length === 0) return;
    ctx.strokeStyle = FIT_COLOR;
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(curves[0][0][0], curves[0][0][1]);
    for (const [, c1, c2, end] of curves) {
      ctx.bezierCurveTo(c1[0], c1[1], c2[0], c2[1], end[0], end[1]);
    }
    ctx.stroke();
  };

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr);

    const active = activeStrokeRef.current;
    const all = active ? [...strokesRef.current, active] : strokesRef.current;

    for (const stroke of all) {
      const pts = stroke.points;
      if (pts.length === 0) continue;

      // Raw polyline through the captured points — deliberately unsmoothed, so
      // any gap against the blue fit is the fitting error made visible.
      if (showRaw || stroke === active) {
        ctx.strokeStyle = RAW_COLOR;
        ctx.lineWidth = stroke === active ? 2 : 1.5;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
        ctx.stroke();

        ctx.fillStyle = POINT_COLOR;
        for (const p of pts) {
          ctx.beginPath();
          ctx.arc(p.x, p.y, 1.75, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      if (showFit && stroke.curves) drawCurves(ctx, stroke.curves);

      // The filled outline is what actually becomes the glyph, so previewing it
      // catches expansion problems here rather than in an installed font.
      if (showOutline && stroke.curves && stroke.curves.length > 0) {
        const outline = expandStroke(flattenCurves(stroke.curves), penWidth);
        if (outline.length >= 3) {
          ctx.fillStyle = OUTLINE_COLOR;
          ctx.beginPath();
          ctx.moveTo(outline[0][0], outline[0][1]);
          for (const [x, y] of outline.slice(1)) ctx.lineTo(x, y);
          ctx.closePath();
          ctx.fill();
        }
      }
    }
  }, [showRaw, showFit, showOutline, penWidth]);

  // Size the backing store to the device pixel ratio so lines stay crisp.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      canvas.width = Math.round(rect.width * dpr);
      canvas.height = Math.round(rect.height * dpr);
      draw();
    };

    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [draw]);

  // Tolerance is the whole point of the sanity check, so refit everything when
  // it moves rather than making the user redraw to see the effect.
  const handleMaxErrorChange = (next: number) => {
    setMaxError(next);
    strokesRef.current = strokesRef.current.map((stroke) => ({
      ...stroke,
      curves: fitStroke(toXY(stroke.points), next),
    }));
    syncStats();
    draw();
  };

  const toPoint = (e: React.PointerEvent<HTMLCanvasElement>): Point => {
    const rect = e.currentTarget.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
      pressure: e.pressure,
      t: e.timeStamp,
    };
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.button !== 0 && e.pointerType === "mouse") return;
    // Capture keeps a stroke alive when the pointer leaves the canvas, but it
    // throws if the pointer is already gone — never let that lose the stroke.
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Non-fatal: we just won't track this stroke outside the canvas bounds.
    }
    const point = toPoint(e);
    activeStrokeRef.current = {
      id: strokeIdRef.current++,
      pointerType: e.pointerType,
      points: [point],
      curves: null,
    };
    setLastPoint(point);
    draw();
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const stroke = activeStrokeRef.current;
    if (!stroke) return;

    // Coalesced events recover the full-rate samples a stylus emits between
    // animation frames; without them fast strokes come back visibly sparse.
    const events =
      typeof e.nativeEvent.getCoalescedEvents === "function"
        ? e.nativeEvent.getCoalescedEvents()
        : [];

    if (events.length > 0) {
      const rect = e.currentTarget.getBoundingClientRect();
      for (const ev of events) {
        stroke.points.push({
          x: ev.clientX - rect.left,
          y: ev.clientY - rect.top,
          pressure: ev.pressure,
          t: ev.timeStamp,
        });
      }
    } else {
      stroke.points.push(toPoint(e));
    }

    setLastPoint(stroke.points[stroke.points.length - 1]);
    draw();
  };

  const endStroke = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const stroke = activeStrokeRef.current;
    if (!stroke) return;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    activeStrokeRef.current = null;
    if (stroke.points.length > 0) {
      // Fit once on release: mid-stroke the point set is still growing, and
      // refitting per sample would burn time on a curve about to be replaced.
      stroke.curves = fitStroke(toXY(stroke.points), maxError);
      strokesRef.current.push(stroke);
    }
    syncStats();
    draw();
  };

  const clear = () => {
    strokesRef.current = [];
    activeStrokeRef.current = null;
    setLastPoint(null);
    syncStats();
    draw();
  };

  const exportFont = () => {
    setExportError(null);
    const char = character.trim();
    if (char.length === 0) {
      setExportError("pick a character");
      return;
    }
    try {
      const outlines = strokesToGlyphOutlines(strokesRef.current, penWidth);
      if (!outlines) {
        setExportError("draw something first");
        return;
      }
      const font = buildSingleGlyphFont(char, outlines);
      downloadFont(font, `scribe-${char.codePointAt(0)}.otf`);
    } catch (err) {
      setExportError(err instanceof Error ? err.message : "export failed");
    }
  };

  const logStrokes = () => {
    console.log(JSON.parse(JSON.stringify(strokesRef.current)));
  };

  const chip = "rounded bg-white/90 px-2 py-1 ring-1 ring-zinc-200";
  const button = `${chip} pointer-events-auto hover:bg-zinc-100`;

  return (
    <div className="relative flex-1">
      <canvas
        ref={canvasRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endStroke}
        onPointerCancel={endStroke}
        onContextMenu={(e) => e.preventDefault()}
        // touch-none stops the browser from panning/zooming instead of drawing.
        className="absolute inset-0 h-full w-full touch-none bg-white"
      />

      <div className="pointer-events-none absolute inset-x-0 top-0 flex flex-wrap items-center gap-3 p-4 font-mono text-xs text-zinc-600">
        <span className={`${chip} pointer-events-auto`}>
          strokes {stats.strokes}
        </span>
        <span className={`${chip} pointer-events-auto`}>
          points {stats.points}
        </span>
        <span className={`${chip} pointer-events-auto`}>
          segments {stats.segments}
        </span>
        <span className={`${chip} pointer-events-auto`}>
          {lastPoint
            ? `x ${lastPoint.x.toFixed(1)}  y ${lastPoint.y.toFixed(1)}`
            : "x —  y —"}
        </span>

        <label
          className={`${chip} pointer-events-auto flex items-center gap-2`}
          title="Squared-distance tolerance passed to fit-curve"
        >
          error {maxError}
          <input
            type="range"
            min={1}
            max={60}
            step={1}
            value={maxError}
            onChange={(e) => handleMaxErrorChange(Number(e.target.value))}
            className="w-28"
          />
        </label>

        <label
          className={`${chip} pointer-events-auto flex items-center gap-2`}
          title="Pen thickness used to expand the centerline into a filled outline"
        >
          pen {penWidth}
          <input
            type="range"
            min={2}
            max={60}
            step={1}
            value={penWidth}
            onChange={(e) => setPenWidth(Number(e.target.value))}
            className="w-24"
          />
        </label>

        <label className={`${chip} pointer-events-auto flex items-center gap-2`}>
          char
          <input
            type="text"
            value={character}
            onChange={(e) => setCharacter(e.target.value.slice(-1))}
            className="w-8 rounded border border-zinc-300 px-1 text-center"
          />
        </label>

        <button
          onClick={exportFont}
          className={`${button} font-semibold text-zinc-900`}
        >
          export .otf
        </button>

        {exportError && (
          <span className={`${chip} pointer-events-auto text-red-600`}>
            {exportError}
          </span>
        )}

        <div className="ml-auto flex gap-2">
          <button
            onClick={() => setShowOutline((v) => !v)}
            className={button}
            style={{ color: showOutline ? OUTLINE_COLOR : undefined }}
          >
            outline {showOutline ? "on" : "off"}
          </button>
          <button
            onClick={() => setShowRaw((v) => !v)}
            className={button}
            style={{ color: showRaw ? POINT_COLOR : undefined }}
          >
            raw {showRaw ? "on" : "off"}
          </button>
          <button
            onClick={() => setShowFit((v) => !v)}
            className={button}
            style={{ color: showFit ? FIT_COLOR : undefined }}
          >
            fit {showFit ? "on" : "off"}
          </button>
          <button onClick={logStrokes} className={button}>
            log
          </button>
          <button onClick={clear} className={button}>
            clear
          </button>
        </div>
      </div>
    </div>
  );
}
