"use client";

import { useCallback, useEffect, useRef } from "react";
import { type BezierCurve, fitStroke } from "../lib/fitStroke";
import { computeGuides, type Guides } from "../lib/fontMetrics";
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
  /** Fitted when the stroke ends; refitted when tolerance changes. */
  curves: BezierCurve[] | null;
};

const RAW_COLOR = "#c9ccd1";
const POINT_COLOR = "#e5484d";
const FIT_COLOR = "#0b6bcb";
const INK_COLOR = "#18181b";
const GUIDE_COLOR = "#d4d4d8";
const BASELINE_COLOR = "#a1a1aa";

export type DrawingCanvasProps = {
  strokes: Stroke[];
  onStrokesChange: (strokes: Stroke[]) => void;
  onGuidesChange: (guides: Guides) => void;
  maxError: number;
  penWidth: number;
  showRaw: boolean;
  showFit: boolean;
  showInk: boolean;
};

export default function DrawingCanvas({
  strokes,
  onStrokesChange,
  onGuidesChange,
  maxError,
  penWidth,
  showRaw,
  showFit,
  showInk,
}: DrawingCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // A working mirror of the committed strokes: pointermove mutates this and
  // repaints directly, so a fast stroke never waits on a React render.
  const strokesRef = useRef<Stroke[]>(strokes);
  const activeStrokeRef = useRef<Stroke | null>(null);
  const strokeIdRef = useRef(0);
  const guidesRef = useRef<Guides | null>(null);

  // Re-sync when the parent swaps the stroke list — switching character,
  // undoing a stroke, or clearing the letter.
  useEffect(() => {
    strokesRef.current = strokes;
  }, [strokes]);

  const drawGuides = (ctx: CanvasRenderingContext2D, g: Guides) => {
    ctx.lineWidth = 1;
    ctx.setLineDash([6, 6]);
    ctx.strokeStyle = GUIDE_COLOR;
    for (const y of [g.capY, g.xHeightY, g.descenderY]) {
      ctx.beginPath();
      ctx.moveTo(g.left, y);
      ctx.lineTo(g.right, y);
      ctx.stroke();
    }
    // The baseline is solid: it is the one line the letter must sit on.
    ctx.setLineDash([]);
    ctx.strokeStyle = BASELINE_COLOR;
    ctx.beginPath();
    ctx.moveTo(g.left, g.baselineY);
    ctx.lineTo(g.right, g.baselineY);
    ctx.stroke();

    ctx.font = "11px ui-monospace, monospace";
    ctx.fillStyle = BASELINE_COLOR;
    ctx.fillText("cap height", g.left, g.capY - 6);
    ctx.fillText("x-height", g.left, g.xHeightY - 6);
    ctx.fillText("baseline", g.left, g.baselineY - 6);
    ctx.fillText("descender", g.left, g.descenderY - 6);
  };

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const width = canvas.width / dpr;
    const height = canvas.height / dpr;
    ctx.clearRect(0, 0, width, height);

    if (guidesRef.current) drawGuides(ctx, guidesRef.current);

    const active = activeStrokeRef.current;
    const all = active ? [...strokesRef.current, active] : strokesRef.current;

    for (const stroke of all) {
      const pts = stroke.points;
      if (pts.length === 0) continue;

      // The filled outline is what actually becomes the glyph, so this is the
      // view that matches the exported font.
      if (showInk && stroke.curves && stroke.curves.length > 0) {
        const outline = expandStroke(flattenCurves(stroke.curves), penWidth);
        if (outline.length >= 3) {
          ctx.fillStyle = INK_COLOR;
          ctx.beginPath();
          ctx.moveTo(outline[0][0], outline[0][1]);
          for (const [x, y] of outline.slice(1)) ctx.lineTo(x, y);
          ctx.closePath();
          ctx.fill();
        }
      }

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
          ctx.arc(p.x, p.y, 1.5, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      if (showFit && stroke.curves && stroke.curves.length > 0) {
        const curves = stroke.curves;
        ctx.strokeStyle = FIT_COLOR;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(curves[0][0][0], curves[0][0][1]);
        for (const [, c1, c2, end] of curves) {
          ctx.bezierCurveTo(c1[0], c1[1], c2[0], c2[1], end[0], end[1]);
        }
        ctx.stroke();
      }
    }
  }, [showRaw, showFit, showInk, penWidth]);

  // Size the backing store to the device pixel ratio so lines stay crisp.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      canvas.width = Math.round(rect.width * dpr);
      canvas.height = Math.round(rect.height * dpr);
      const guides = computeGuides(rect.width, rect.height);
      guidesRef.current = guides;
      onGuidesChange(guides);
      draw();
    };

    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [draw, onGuidesChange]);

  useEffect(() => {
    draw();
  }, [draw, strokes]);

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
    activeStrokeRef.current = {
      id: strokeIdRef.current++,
      pointerType: e.pointerType,
      points: [toPoint(e)],
      curves: null,
    };
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

    draw();
  };

  const endStroke = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const stroke = activeStrokeRef.current;
    if (!stroke) return;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    activeStrokeRef.current = null;
    if (stroke.points.length === 0) return;

    // Fit once on release: mid-stroke the point set is still growing, and
    // refitting per sample would burn time on a curve about to be replaced.
    const fitted: Stroke = {
      ...stroke,
      curves: fitStroke(
        stroke.points.map((p) => [p.x, p.y]),
        maxError
      ),
    };
    // Commit to the working mirror before notifying: the props sync only lands
    // after a render, so two strokes finished in quick succession would
    // otherwise both build on the same stale array and the first would be lost.
    const next = [...strokesRef.current, fitted];
    strokesRef.current = next;
    onStrokesChange(next);
  };

  return (
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
  );
}
