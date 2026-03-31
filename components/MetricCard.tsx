"use client";

import { useRef } from "react";
import { ChevronDown, Brain, Gauge, Lightbulb } from "lucide-react";
import { cn } from "@/lib/utils";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { METRIC_INFO, METRIC_STRATEGIES } from "@/lib/metric-info";
import type { MetricScore } from "@/lib/types";

function scoreColor(score: number): string {
  if (score >= 70) return "var(--color-score-green)";
  if (score >= 45) return "var(--color-score-amber)";
  return "var(--color-score-red)";
}

interface Props {
  metric: MetricScore;
  expanded: boolean;
  onToggle?: () => void;
}

export function MetricCard({ metric, expanded, onToggle }: Props) {
  const color = scoreColor(metric.score);
  const info = METRIC_INFO[metric.name];
  const strategy = METRIC_STRATEGIES[metric.name];
  const contentRef = useRef<HTMLDivElement>(null);

  return (
    <div
      className={cn(
        "glass-card glass-card-hover !p-3 sm:!p-4 cursor-pointer",
        expanded && "!border-white/[0.1]"
      )}
      onClick={onToggle}
    >
      <div className="flex items-center gap-3">
        {/* Score ring */}
        <div className="flex-shrink-0 relative w-12 h-12">
          <svg width="48" height="48" style={{ transform: "rotate(-90deg)" }}>
            <circle
              cx="24" cy="24" r="18"
              fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth="3.5"
            />
            <circle
              cx="24" cy="24" r="18"
              fill="none"
              stroke={color}
              strokeWidth="3.5"
              strokeDasharray={2 * Math.PI * 18}
              strokeDashoffset={2 * Math.PI * 18 * (1 - metric.score / 100)}
              strokeLinecap="round"
              style={{ filter: `drop-shadow(0 0 4px ${color}30)` }}
            />
          </svg>
          <span
            className="absolute inset-0 flex items-center justify-center text-xs font-bold tabular-nums"
            style={{ color }}
          >
            {Math.round(metric.score)}
          </span>
        </div>

        {/* Name + proxy + info tooltip */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-medium text-white/80 truncate">{metric.name}</span>
            {info && (
              <span onClick={(e) => e.stopPropagation()}>
                <InfoTooltip
                  title={info.title}
                  description={info.description}
                  study={info.study}
                  studyDetail={info.studyDetail}
                  iconSize={13}
                />
              </span>
            )}
          </div>
          <div className="text-xs text-white/25 truncate">{metric.gtm_proxy}</div>
        </div>

        <ChevronDown
          className={cn(
            "w-4 h-4 text-white/20 transition-transform duration-300 ease-out flex-shrink-0",
            expanded && "rotate-180"
          )}
        />
      </div>

      {/* Animated slide-open content */}
      <div
        ref={contentRef}
        className={`transition-all duration-400 ease-[cubic-bezier(0.16,1,0.3,1)] ${expanded ? "overflow-visible" : "overflow-hidden"}`}
        style={{
          maxHeight: expanded ? contentRef.current?.scrollHeight ?? 500 : 0,
          opacity: expanded ? 1 : 0,
        }}
      >
        <div className="pt-3 mt-3 border-t border-white/[0.06] space-y-2.5">
          <p className="text-xs text-white/50 leading-relaxed">{metric.description}</p>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5 text-xs text-white/30">
              <Brain className="w-3 h-3" />
              <span className="text-white/45">{metric.brain_region}</span>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-white/30">
              <Gauge className="w-3 h-3" />
              <span className="font-mono text-white/45">{metric.raw_value.toFixed(4)}</span>
            </div>
          </div>

          {strategy && metric.score < 80 && (
            <div className="mt-2 pt-2.5 border-t border-white/[0.04]">
              <div className="flex items-center gap-1.5 mb-1.5">
                <Lightbulb className="w-3 h-3 text-brand-400" />
                <span className="text-[11px] font-medium text-brand-400">{strategy.title}</span>
              </div>
              <ul className="space-y-1">
                {strategy.actions.slice(0, 2).map((action, i) => (
                  <li key={i} className="text-[11px] text-white/35 leading-relaxed flex gap-1.5">
                    <span className="text-white/15 flex-shrink-0">→</span>
                    {action}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
