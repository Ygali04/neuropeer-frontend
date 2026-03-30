"use client";

import { useEffect, useRef } from "react";
import { Heart } from "lucide-react";

interface Props {
  arousaleCurve: number[];
  cognitiveCurve: number[];
  currentSecond?: number;
  height?: number;
}

export function EmotionalPanel({
  arousaleCurve,
  cognitiveCurve,
  currentSecond,
  height = 120,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || arousaleCurve.length === 0) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const displayWidth = canvas.clientWidth;
    const displayHeight = height;
    canvas.width = displayWidth * dpr;
    canvas.height = displayHeight * dpr;
    ctx.scale(dpr, dpr);

    const w = displayWidth;
    const h = displayHeight;
    const pad = { top: 8, right: 12, bottom: 20, left: 36 };
    const plotW = w - pad.left - pad.right;
    const plotH = h - pad.top - pad.bottom;
    const n = arousaleCurve.length;

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "rgba(7, 6, 11, 0.6)";
    ctx.fillRect(0, 0, w, h);

    const xScale = (i: number) => pad.left + (i / Math.max(n - 1, 1)) * plotW;
    const yScale = (v: number) => pad.top + plotH - (v / 100) * plotH;

    // Grid
    ctx.strokeStyle = "rgba(255,255,255,0.04)";
    ctx.lineWidth = 1;
    [50].forEach((v) => {
      ctx.beginPath();
      ctx.moveTo(pad.left, yScale(v));
      ctx.lineTo(pad.left + plotW, yScale(v));
      ctx.stroke();
    });

    // Y labels
    ctx.fillStyle = "rgba(255,255,255,0.2)";
    ctx.font = "9px system-ui";
    ctx.textAlign = "right";
    [0, 50, 100].forEach((v) => ctx.fillText(String(v), pad.left - 4, yScale(v) + 3));

    // Arousal (amber)
    drawLine(ctx, arousaleCurve, xScale, yScale, "#fbbf24", 2);

    // Cognitive load (red)
    drawLine(ctx, cognitiveCurve, xScale, yScale, "#f87171", 2);

    // Playhead
    if (currentSecond !== undefined && currentSecond < n) {
      const x = xScale(currentSecond);
      ctx.beginPath();
      ctx.moveTo(x, pad.top);
      ctx.lineTo(x, pad.top + plotH);
      ctx.strokeStyle = "rgba(249, 115, 22, 0.4)";
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // X axis
    ctx.fillStyle = "rgba(255,255,255,0.2)";
    ctx.textAlign = "center";
    ctx.font = "9px system-ui";
    const labelEvery = Math.max(1, Math.floor(n / 6));
    for (let i = 0; i < n; i += labelEvery) {
      ctx.fillText(`${i}s`, xScale(i), h - 4);
    }
  }, [arousaleCurve, cognitiveCurve, currentSecond, height]);

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Heart className="w-4 h-4 text-amber-400" />
          <h3 className="text-sm font-medium text-white/60">Emotional & Cognitive</h3>
        </div>
        <div className="flex gap-4 text-xs text-white/30">
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-3 h-0.5 rounded-full bg-amber-400" /> Arousal
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-3 h-0.5 rounded-full bg-red-400" /> Cognitive
          </span>
        </div>
      </div>
      <canvas
        ref={canvasRef}
        className="w-full rounded-xl"
        style={{ height }}
      />
    </div>
  );
}

function drawLine(
  ctx: CanvasRenderingContext2D,
  data: number[],
  xScale: (i: number) => number,
  yScale: (v: number) => number,
  color: string,
  lineWidth: number
) {
  ctx.beginPath();
  data.forEach((v, i) => {
    if (i === 0) ctx.moveTo(xScale(i), yScale(v));
    else ctx.lineTo(xScale(i), yScale(v));
  });
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.stroke();
}
