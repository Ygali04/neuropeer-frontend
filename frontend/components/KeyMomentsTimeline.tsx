"use client";

import { Clock, Zap, TrendingUp, Heart, AlertTriangle, ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { MOMENT_INFO } from "@/lib/metric-info";
import { VideoPlayer } from "@/components/VideoPlayer";
import type { KeyMoment } from "@/lib/types";

const MOMENT_CONFIG: Record<
  KeyMoment["type"],
  { color: string; icon: typeof Zap; bg: string }
> = {
  best_hook:       { color: "#c084fc", icon: Zap, bg: "rgba(192, 132, 252, 0.06)" },
  peak_engagement: { color: "#34d399", icon: TrendingUp, bg: "rgba(52, 211, 153, 0.06)" },
  emotional_peak:  { color: "#fbbf24", icon: Heart, bg: "rgba(251, 191, 36, 0.06)" },
  dropoff_risk:    { color: "#f87171", icon: AlertTriangle, bg: "rgba(248, 113, 113, 0.06)" },
  recovery:        { color: "#60a5fa", icon: ArrowUpRight, bg: "rgba(96, 165, 250, 0.06)" },
};

interface Props {
  moments: KeyMoment[];
  duration: number;
  currentSecond?: number;
  playbackTime?: number;
  isPlaying?: boolean;
  videoUrl?: string;
  playbackSpeed?: number;
  onSelect?: (second: number) => void;
  onPlay?: () => void;
  onPause?: () => void;
  onCycleSpeed?: () => void;
}

export function KeyMomentsTimeline({
  moments,
  duration,
  currentSecond,
  playbackTime,
  isPlaying = false,
  videoUrl,
  playbackSpeed = 1,
  onSelect,
  onPlay,
  onPause,
  onCycleSpeed,
}: Props) {
  const displayTime = playbackTime !== undefined ? playbackTime : (currentSecond ?? 0);

  return (
    <div className="w-full flex flex-col gap-4">
      {/* Video player */}
      {videoUrl && (
        <VideoPlayer
          url={videoUrl}
          currentTime={displayTime}
          isPlaying={isPlaying}
          duration={duration}
          playbackSpeed={playbackSpeed}
          onSeek={onSelect}
          onPlay={onPlay}
          onPause={onPause}
          onCycleSpeed={onCycleSpeed}
        />
      )}

      <div className="flex items-center gap-2 mb-1">
        <Clock className="w-4 h-4 text-teal-400" />
        <h3 className="text-sm font-medium text-white/60">Key Moments</h3>
      </div>

      {/* Timeline bar */}
      <div className="relative h-1.5 bg-white/[0.04] rounded-full mb-3">
        {moments.map((m, i) => {
          const pct = (m.timestamp / duration) * 100;
          const cfg = MOMENT_CONFIG[m.type];
          return (
            <button
              key={i}
              className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3 h-3 rounded-full transition-all duration-200 hover:scale-[1.8] cursor-pointer"
              style={{
                left: `${pct}%`,
                backgroundColor: cfg.color,
                boxShadow: `0 0 8px ${cfg.color}40`,
              }}
              onClick={() => onSelect?.(m.timestamp)}
              title={`${m.label} @ ${m.timestamp.toFixed(0)}s`}
            />
          );
        })}
        {/* Playhead */}
        <div
          className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-0.5 h-4 bg-brand-400 rounded-full"
          style={{
            left: `${(displayTime / duration) * 100}%`,
            boxShadow: "0 0 6px rgba(249, 115, 22, 0.5)",
            transition: isPlaying ? "none" : "left 200ms ease-out",
          }}
        />
      </div>

      {/* Moment cards */}
      <div className="flex flex-col gap-1.5 max-h-[50vh] sm:max-h-none overflow-y-auto">
        {moments.map((m, i) => {
          const cfg = MOMENT_CONFIG[m.type];
          const Icon = cfg.icon;
          const info = MOMENT_INFO[m.type];
          const isNear = Math.abs(m.timestamp - displayTime) < 1.5;
          return (
            <div
              key={i}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all duration-300",
                "border border-transparent",
                isNear
                  ? "bg-white/[0.04] border-white/[0.06]"
                  : "hover:bg-white/[0.03]"
              )}
              style={{ backgroundColor: isNear ? undefined : cfg.bg }}
            >
              <button
                onClick={() => onSelect?.(m.timestamp)}
                className="flex items-center gap-3 flex-1 min-w-0"
              >
                <div
                  className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 transition-transform duration-300"
                  style={{
                    backgroundColor: cfg.color + "15",
                    transform: isNear ? "scale(1.15)" : "scale(1)",
                  }}
                >
                  <Icon className="w-3.5 h-3.5" style={{ color: cfg.color }} />
                </div>
                <div className="flex-1 min-w-0 text-left">
                  <span className="text-sm font-medium" style={{ color: cfg.color }}>
                    {m.label}
                  </span>
                  <span className="text-xs text-white/25 ml-2">
                    @ {m.timestamp.toFixed(0)}s
                  </span>
                </div>
              </button>
              <div className="flex items-center gap-2 flex-shrink-0">
                <div className="h-1 w-12 bg-white/[0.04] rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${m.score}%`, backgroundColor: cfg.color, opacity: 0.7 }}
                  />
                </div>
                {info && (
                  <InfoTooltip
                    title={info.title}
                    description={info.description}
                    study={info.study}
                    studyDetail={info.studyDetail}
                    iconSize={13}
                  />
                )}
              </div>
            </div>
          );
        })}
        {moments.length === 0 && (
          <p className="text-xs text-white/20 text-center py-4">No key moments detected.</p>
        )}
      </div>
    </div>
  );
}
