"use client";

import { useEffect, useRef } from "react";
import { Layers } from "lucide-react";
import type { ModalityContribution } from "@/lib/types";
import { chartBg, chartLabel, modalityColors } from "@/lib/theme-colors";

interface Props {
  breakdown: ModalityContribution[];
  height?: number;
}

export function ModalityBreakdown({ breakdown, height = 120 }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || breakdown.length === 0) return;
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
    const n = breakdown.length;
    const barW = Math.max(1, plotW / n);

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = chartBg();
    ctx.fillRect(0, 0, w, h);

    const COLORS = modalityColors();

    breakdown.forEach((d, i) => {
      const x = pad.left + i * barW;
      let yOffset = pad.top + plotH;

      const segments: [keyof typeof COLORS, number][] = [
        ["visual", d.visual],
        ["audio", d.audio],
        ["text", d.text],
      ];
      for (const [key, pct] of segments) {
        const barH = (pct / 100) * plotH;
        ctx.fillStyle = COLORS[key];
        ctx.globalAlpha = 0.7;
        ctx.fillRect(x, yOffset - barH, barW - 1, barH);
        ctx.globalAlpha = 1;
        yOffset -= barH;
      }
    });

    // X labels
    ctx.fillStyle = chartLabel();
    ctx.font = "9px system-ui";
    ctx.textAlign = "center";
    const labelEvery = Math.max(1, Math.floor(n / 8));
    for (let i = 0; i < n; i += labelEvery) {
      ctx.fillText(`${i}s`, pad.left + i * barW + barW / 2, h - 4);
    }
  }, [breakdown, height]);

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Layers className="w-4 h-4 text-teal-400" />
          <h3 className="text-sm font-medium text-white/60">Modality Breakdown</h3>
        </div>
        <div className="flex gap-4 text-xs text-white/30">
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-2 h-2 rounded-sm bg-brand-500" /> Visual
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-2 h-2 rounded-sm bg-amber-400" /> Audio
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-2 h-2 rounded-sm bg-teal-400" /> Text
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
