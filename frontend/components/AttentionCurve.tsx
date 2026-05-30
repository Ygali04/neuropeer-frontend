"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { TrendingUp, Play, Pause, RotateCcw } from "lucide-react";
import type { KeyMoment } from "@/lib/types";
import { chartBg, chartGrid, chartLabel, chartZones, chartLine, chartLineFill, chartEmotionLine, dotStroke } from "@/lib/theme-colors";

interface Props {
  attentionCurve: number[];
  emotionCurve?: number[];
  keyMoments?: KeyMoment[];
  onScrub?: (second: number) => void;
  height?: number;
  // External playback controls (lifted to parent)
  isPlaying?: boolean;
  playbackTime?: number;
  playbackSpeed?: number;
  onPlay?: () => void;
  onPause?: () => void;
  onReset?: () => void;
  onCycleSpeed?: () => void;
}

const MOMENT_COLORS: Record<KeyMoment["type"], string> = {
  best_hook: "#c084fc",
  peak_engagement: "#34d399",
  emotional_peak: "#fbbf24",
  dropoff_risk: "#f87171",
  recovery: "#60a5fa",
  act_boundary: "#a78bfa",
  climax_peak: "#f43f5e",
  reversal_point: "#38bdf8",
  frisson_peak: "#e879f9",
};

const MOMENT_LABELS: Record<KeyMoment["type"], string> = {
  best_hook: "Hook",
  peak_engagement: "Peak",
  emotional_peak: "Emotion",
  dropoff_risk: "Drop-off",
  recovery: "Recovery",
  act_boundary: "Act Break",
  climax_peak: "Climax",
  reversal_point: "Reversal",
  frisson_peak: "Frisson",
};

interface TooltipState {
  x: number;
  second: number;
  attention: number;
  emotion?: number;
  moment?: KeyMoment;
}

// Aggregate curve data into fixed-size bins for long-form content rendering
function aggregateCurve(data: number[], binSize: number): number[] {
  const bins: number[] = [];
  for (let i = 0; i < data.length; i += binSize) {
    const slice = data.slice(i, Math.min(i + binSize, data.length));
    bins.push(slice.reduce((a, b) => a + b, 0) / slice.length);
  }
  return bins;
}

// Format seconds as MM:SS
function formatMMSS(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function AttentionCurve({
  attentionCurve,
  emotionCurve,
  keyMoments = [],
  onScrub,
  height = 180,
  isPlaying = false,
  playbackTime = 0,
  playbackSpeed = 1,
  onPlay,
  onPause,
  onReset,
  onCycleSpeed,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const [isHovering, setIsHovering] = useState(false);
  const padRef = useRef({ top: 16, right: 12, bottom: 28, left: 32 });
  // Shared canvas dimensions so static + overlay stay aligned
  const dimsRef = useRef({ w: 0, h: 0, dpr: 1 });
  const safeAttentionCurve = attentionCurve ?? [];

  // Draw static chart
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || safeAttentionCurve.length === 0) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const displayWidth = canvas.clientWidth;
    const displayHeight = Math.max(100, canvas.clientHeight || height);
    canvas.width = displayWidth * dpr;
    canvas.height = displayHeight * dpr;
    ctx.scale(dpr, dpr);
    // Store for overlay alignment
    dimsRef.current = { w: displayWidth, h: displayHeight, dpr };
    // Also size the overlay canvas identically
    const oc = overlayRef.current;
    if (oc) { oc.width = displayWidth * dpr; oc.height = displayHeight * dpr; }

    const w = displayWidth;
    const h = displayHeight;
    const pad = padRef.current;
    const plotW = w - pad.left - pad.right;
    const plotH = h - pad.top - pad.bottom;
    const rawLen = safeAttentionCurve.length;

    // Aggregate to 10-second bins for long content (>600 data points)
    const binSize = rawLen > 600 ? 10 : 1;
    const displayAttn = binSize > 1 ? aggregateCurve(safeAttentionCurve, binSize) : safeAttentionCurve;
    const displayEmot = emotionCurve && emotionCurve.length === rawLen
      ? (binSize > 1 ? aggregateCurve(emotionCurve, binSize) : emotionCurve)
      : undefined;
    const n = displayAttn.length;
    const useMinuteLabels = rawLen > 300;

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = chartBg();
    ctx.fillRect(0, 0, w, h);

    const xScale = (i: number) => pad.left + (i / (n - 1)) * plotW;
    const yScale = (v: number) => pad.top + plotH - (v / 100) * plotH;

    // Zone bands
    const zones = chartZones();
    [
      { from: 0, to: 33, color: zones.low },
      { from: 33, to: 66, color: zones.mid },
      { from: 66, to: 100, color: zones.high },
    ].forEach(({ from, to, color }) => {
      ctx.fillStyle = color;
      ctx.fillRect(pad.left, yScale(to), plotW, yScale(from) - yScale(to));
    });

    // Grid
    ctx.strokeStyle = chartGrid();
    ctx.lineWidth = 1;
    [25, 50, 75].forEach((v) => {
      ctx.beginPath();
      ctx.moveTo(pad.left, yScale(v));
      ctx.lineTo(pad.left + plotW, yScale(v));
      ctx.stroke();
    });

    // Y/X labels
    ctx.fillStyle = chartLabel();
    ctx.font = "10px system-ui";
    ctx.textAlign = "right";
    [0, 25, 50, 75, 100].forEach((v) => ctx.fillText(String(v), pad.left - 6, yScale(v) + 3));
    ctx.textAlign = "center";
    const labelEvery = Math.max(1, Math.floor(n / 8));
    for (let i = 0; i < n; i += labelEvery) {
      const realSeconds = i * binSize;
      const label = useMinuteLabels ? formatMMSS(realSeconds) : `${realSeconds}s`;
      ctx.fillText(label, xScale(i), h - 6);
    }

    // Emotion curve
    if (displayEmot && displayEmot.length === n) {
      ctx.beginPath();
      displayEmot.forEach((v, i) => { i === 0 ? ctx.moveTo(xScale(i), yScale(v)) : ctx.lineTo(xScale(i), yScale(v)); });
      ctx.strokeStyle = chartEmotionLine();
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }

    // Attention curve
    ctx.beginPath();
    displayAttn.forEach((v, i) => { i === 0 ? ctx.moveTo(xScale(i), yScale(v)) : ctx.lineTo(xScale(i), yScale(v)); });
    ctx.strokeStyle = chartLine();
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.stroke();

    // Fill under
    ctx.lineTo(xScale(n - 1), yScale(0));
    ctx.lineTo(xScale(0), yScale(0));
    ctx.closePath();
    const fills = chartLineFill();
    const grad = ctx.createLinearGradient(0, pad.top, 0, pad.top + plotH);
    grad.addColorStop(0, fills[0]);
    grad.addColorStop(0.6, fills[1]);
    grad.addColorStop(1, fills[2]);
    ctx.fillStyle = grad;
    ctx.fill();

    // Key moment markers (map timestamp from raw seconds to binned index)
    keyMoments.forEach((m) => {
      if (m.timestamp >= rawLen) return;
      const binnedIdx = m.timestamp / binSize;
      const x = xScale(binnedIdx);
      const y = yScale(safeAttentionCurve[Math.floor(m.timestamp)] ?? 50);
      const mColor = MOMENT_COLORS[m.type] ?? "#fff";
      ctx.beginPath(); ctx.arc(x, y, 10, 0, Math.PI * 2); ctx.fillStyle = mColor + "15"; ctx.fill();
      ctx.beginPath(); ctx.arc(x, y, 4.5, 0, Math.PI * 2); ctx.fillStyle = mColor; ctx.fill();
      ctx.strokeStyle = dotStroke(); ctx.lineWidth = 1.5; ctx.stroke();
    });
  }, [safeAttentionCurve, emotionCurve, keyMoments, height]);

  // Draw overlay — called on hover OR on every playback frame
  const drawOverlay = useCallback(
    (mouseX: number | null, time: number | null) => {
      const canvas = overlayRef.current;
      if (!canvas || safeAttentionCurve.length === 0) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      // Reuse dims from static canvas to stay pixel-aligned
      const { w, h, dpr } = dimsRef.current;
      if (w === 0) return;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.scale(dpr, dpr);
      const pad = padRef.current;
      const plotW = w - pad.left - pad.right;
      const plotH = h - pad.top - pad.bottom;
      const rawLen = safeAttentionCurve.length;

      // Match binning from static chart
      const binSize = rawLen > 600 ? 10 : 1;
      const displayAttn = binSize > 1 ? aggregateCurve(safeAttentionCurve, binSize) : safeAttentionCurve;
      const displayEmot = emotionCurve && emotionCurve.length === rawLen
        ? (binSize > 1 ? aggregateCurve(emotionCurve, binSize) : emotionCurve)
        : undefined;
      const n = displayAttn.length;

      const xScale = (t: number) => pad.left + (t / (n - 1)) * plotW;
      const yScale = (v: number) => pad.top + plotH - (v / 100) * plotH;

      ctx.clearRect(0, 0, w, h);

      let t: number; // float time in binned-index space
      if (mouseX !== null) {
        if (mouseX < pad.left || mouseX > w - pad.right) return;
        t = ((mouseX - pad.left) / plotW) * (n - 1);
      } else if (time !== null) {
        // Convert raw playback time (seconds) to binned index
        t = time / binSize;
      } else {
        return;
      }

      t = Math.max(0, Math.min(n - 1, t));
      const intIdx = Math.floor(t);
      // Interpolate attention value for smooth movement
      const frac = t - intIdx;
      const attnVal = intIdx < n - 1
        ? displayAttn[intIdx] * (1 - frac) + displayAttn[intIdx + 1] * frac
        : displayAttn[intIdx];
      const emotVal = displayEmot && displayEmot.length === n
        ? (intIdx < n - 1
          ? displayEmot[intIdx] * (1 - frac) + displayEmot[intIdx + 1] * frac
          : displayEmot[intIdx])
        : undefined;

      const snapX = xScale(t);
      const snapY = yScale(attnVal);

      // Playhead: swept fill
      if (time !== null) {
        ctx.beginPath();
        for (let i = 0; i <= intIdx; i++) {
          i === 0 ? ctx.moveTo(xScale(i), yScale(displayAttn[i])) : ctx.lineTo(xScale(i), yScale(displayAttn[i]));
        }
        ctx.lineTo(snapX, snapY);
        ctx.lineTo(snapX, yScale(0));
        ctx.lineTo(xScale(0), yScale(0));
        ctx.closePath();
        const grad = ctx.createLinearGradient(0, pad.top, 0, pad.top + plotH);
        grad.addColorStop(0, "rgba(249, 115, 22, 0.18)");
        grad.addColorStop(1, "rgba(249, 115, 22, 0)");
        ctx.fillStyle = grad;
        ctx.fill();
      }

      // Vertical line
      ctx.beginPath();
      ctx.moveTo(snapX, pad.top);
      ctx.lineTo(snapX, pad.top + plotH);
      ctx.strokeStyle = time !== null ? "rgba(249, 115, 22, 0.5)" : "rgba(249, 115, 22, 0.25)";
      ctx.lineWidth = time !== null ? 2 : 1;
      if (mouseX !== null) { ctx.setLineDash([3, 3]); }
      ctx.stroke();
      ctx.setLineDash([]);

      // Horizontal crosshair (hover only)
      if (mouseX !== null) {
        ctx.beginPath();
        ctx.moveTo(pad.left, snapY);
        ctx.lineTo(pad.left + plotW, snapY);
        ctx.strokeStyle = "rgba(249, 115, 22, 0.12)";
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 3]);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // Attention dot (glow + solid)
      ctx.beginPath(); ctx.arc(snapX, snapY, 12, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(249, 115, 22, 0.12)"; ctx.fill();
      ctx.beginPath(); ctx.arc(snapX, snapY, 5, 0, Math.PI * 2);
      ctx.fillStyle = "#f97316"; ctx.fill();
      ctx.strokeStyle = "rgba(7, 6, 11, 0.9)"; ctx.lineWidth = 2; ctx.stroke();

      // Emotion dot
      if (emotVal !== undefined) {
        const ey = yScale(emotVal);
        ctx.beginPath(); ctx.arc(snapX, ey, 4, 0, Math.PI * 2);
        ctx.fillStyle = "#fbbf24"; ctx.fill();
        ctx.strokeStyle = "rgba(7, 6, 11, 0.9)"; ctx.lineWidth = 1.5; ctx.stroke();
      }

      // Tooltip (hover only)
      if (mouseX !== null) {
        const realSecond = Math.floor(t * binSize);
        const nearbyMoment = keyMoments.find((m) => Math.abs(m.timestamp - realSecond) <= binSize);
        setTooltip({ x: snapX, second: realSecond, attention: attnVal, emotion: emotVal, moment: nearbyMoment });
      }
    },
    [safeAttentionCurve, emotionCurve, keyMoments, height]
  );

  // Redraw overlay on playback time change
  useEffect(() => {
    if (isPlaying || playbackTime > 0) {
      drawOverlay(null, playbackTime);
    }
  }, [playbackTime, isPlaying, drawOverlay]);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (isPlaying) return;
    const rect = e.currentTarget.getBoundingClientRect();
    drawOverlay(e.clientX - rect.left, null);
  }, [drawOverlay, isPlaying]);

  const handleMouseLeave = useCallback(() => {
    setIsHovering(false);
    setTooltip(null);
    if (!isPlaying && playbackTime > 0) {
      drawOverlay(null, playbackTime);
    } else if (!isPlaying && playbackTime === 0) {
      const canvas = overlayRef.current;
      if (canvas) { const ctx = canvas.getContext("2d"); if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height); }
    }
  }, [isPlaying, playbackTime, drawOverlay]);

  const handleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (safeAttentionCurve.length === 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const pad = padRef.current;
    const canvas = overlayRef.current;
    if (!canvas) return;
    const plotW = canvas.clientWidth - pad.left - pad.right;
    const rawLen = safeAttentionCurve.length;
    const binSize = rawLen > 600 ? 10 : 1;
    const binnedN = binSize > 1 ? Math.ceil(rawLen / binSize) : rawLen;
    const binnedT = ((mouseX - pad.left) / plotW) * (binnedN - 1);
    // Convert binned index back to raw seconds for scrubbing
    const realT = binnedT * binSize;
    const clampedT = Math.max(0, Math.min(rawLen - 1, realT));

    if (isPlaying) {
      // Click while playing → seek to that point
      onScrub?.(clampedT);
    } else {
      // Click while paused → seek then play
      onScrub?.(clampedT);
      onPlay?.();
    }
  }, [onScrub, onPlay, safeAttentionCurve, isPlaying]);

  return (
    <div className="w-full">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-brand-400" />
          <h3 className="text-sm font-medium text-white/60">Attention Curve</h3>
        </div>
        <div className="flex items-center gap-2 sm:gap-4">
          {/* Playback controls */}
          <div className="flex items-center gap-1">
            {isPlaying ? (
              <button onClick={onPause} className="p-1.5 rounded-lg bg-brand-500/10 hover:bg-brand-500/20 text-brand-400 transition-colors" title="Pause">
                <Pause className="w-3.5 h-3.5" />
              </button>
            ) : (
              <button onClick={onPlay} className="p-1.5 rounded-lg bg-brand-500/10 hover:bg-brand-500/20 text-brand-400 transition-colors" title="Play timelapse">
                <Play className="w-3.5 h-3.5" />
              </button>
            )}
            <button
              onClick={onCycleSpeed}
              className="px-2 py-1 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] text-white/50 hover:text-white/70 transition-colors text-[11px] font-semibold tabular-nums min-w-[32px]"
              title="Change playback speed"
            >
              {playbackSpeed}x
            </button>
            <button onClick={onReset} className="p-1.5 rounded-lg hover:bg-white/[0.06] text-white/20 hover:text-white/40 transition-colors" title="Reset">
              <RotateCcw className="w-3 h-3" />
            </button>
            {(isPlaying || playbackTime > 0) && (
              <span className="text-[10px] text-brand-400 tabular-nums ml-1 font-medium">
                {safeAttentionCurve.length > 300
                  ? `${formatMMSS(playbackTime)} / ${formatMMSS(safeAttentionCurve.length - 1)}`
                  : `${playbackTime.toFixed(1)}s / ${(safeAttentionCurve.length - 1)}s`}
              </span>
            )}
          </div>

          {/* Legend */}
          <div className="hidden sm:flex items-center gap-4 text-xs text-white/30">
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-3 h-0.5 rounded-full bg-brand-500" /> Attention
            </span>
            {emotionCurve && (
              <span className="flex items-center gap-1.5">
                <span className="inline-block w-3 h-0.5 rounded-full bg-amber-400 opacity-50" /> Emotion
              </span>
            )}
          </div>
        </div>
      </div>

      <div ref={containerRef} className="relative">
        <canvas ref={canvasRef} className="w-full rounded-xl" style={{ height }} />
        <canvas
          ref={overlayRef}
          className="absolute inset-0 w-full rounded-xl cursor-crosshair"
          style={{ height }}
          onMouseMove={handleMouseMove}
          onMouseEnter={() => setIsHovering(true)}
          onMouseLeave={handleMouseLeave}
          onClick={handleClick}
        />

        {tooltip && isHovering && !isPlaying && (
          <div
            className="absolute z-20 pointer-events-none"
            style={{
              left: Math.min(tooltip.x, (containerRef.current?.clientWidth ?? 400) - 180),
              top: 8,
              transform: tooltip.x > (containerRef.current?.clientWidth ?? 400) / 2 ? "translateX(-110%)" : "translateX(8px)",
            }}
          >
            <div className="rounded-xl p-3 min-w-[150px] border border-white/[0.1]" style={{ background: "rgba(15, 13, 20, 0.92)", boxShadow: "0 12px 40px rgba(0,0,0,0.6)" }}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] text-white/40 uppercase tracking-wider font-medium">t = {safeAttentionCurve.length > 300 ? formatMMSS(tooltip.second) : `${tooltip.second}s`}</span>
                {tooltip.moment && (
                  <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full" style={{ color: MOMENT_COLORS[tooltip.moment.type], backgroundColor: MOMENT_COLORS[tooltip.moment.type] + "20" }}>
                    {MOMENT_LABELS[tooltip.moment.type]}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 mb-1">
                <span className="w-2 h-2 rounded-full bg-brand-500" />
                <span className="text-xs text-white/60">Attention</span>
                <span className="ml-auto text-sm font-semibold text-brand-400 tabular-nums">{tooltip.attention.toFixed(1)}</span>
              </div>
              {tooltip.emotion !== undefined && (
                <div className="flex items-center gap-2 mb-1">
                  <span className="w-2 h-2 rounded-full bg-amber-400" />
                  <span className="text-xs text-white/60">Emotion</span>
                  <span className="ml-auto text-sm font-semibold text-amber-400 tabular-nums">{tooltip.emotion.toFixed(1)}</span>
                </div>
              )}
              {tooltip.moment && (
                <div className="mt-2 pt-2 border-t border-white/[0.08]">
                  <p className="text-[11px] text-white/55 leading-relaxed">{tooltip.moment.label}</p>
                  <div className="flex items-center gap-1 mt-1">
                    <span className="text-[10px] text-white/35">Score:</span>
                    <span className="text-[11px] font-medium" style={{ color: MOMENT_COLORS[tooltip.moment.type] }}>{tooltip.moment.score}</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 mt-2 sm:mt-3">
        <div className="flex flex-wrap gap-3 sm:gap-5 text-[10px] sm:text-xs text-white/25">
          <span className="flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-sm bg-emerald-400/50" />High</span>
          <span className="flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-sm bg-amber-400/50" />Mid</span>
          <span className="flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-sm bg-red-400/50" />Drop-off</span>
        </div>
        <span className="hidden sm:inline text-[10px] text-white/15">
          {isPlaying ? "Playing…" : "Click to scrub · Hover for details · ▶ for timelapse"}
        </span>
      </div>
    </div>
  );
}
