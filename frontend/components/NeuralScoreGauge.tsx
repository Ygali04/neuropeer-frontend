"use client";

import type { NeuralScoreBreakdown } from "@/lib/types";
import { cn } from "@/lib/utils";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { DIMENSION_INFO } from "@/lib/metric-info";

function scoreColor(score: number): string {
  if (score >= 75) return "var(--color-score-green)";
  if (score >= 50) return "var(--color-score-amber)";
  return "var(--color-score-red)";
}

function scoreLabel(score: number): string {
  if (score >= 80) return "Exceptional";
  if (score >= 65) return "Strong";
  if (score >= 50) return "Moderate";
  if (score >= 35) return "Weak";
  return "Poor";
}

function scoreBgClass(score: number): string {
  if (score >= 75) return "bg-emerald-500";
  if (score >= 50) return "bg-amber-400";
  return "bg-red-400";
}

interface Props {
  breakdown: NeuralScoreBreakdown;
  size?: "sm" | "lg";
}

export function NeuralScoreGauge({ breakdown, size = "lg" }: Props) {
  const { total } = breakdown;
  const radius = size === "lg" ? 80 : 50;
  const stroke = size === "lg" ? 8 : 6;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - total / 100);
  const color = scoreColor(total);
  const svgSize = (radius + stroke) * 2 + 4;

  const dimensions = [
    { label: "Hook", value: breakdown.hook_score },
    { label: "Attention", value: breakdown.sustained_attention },
    { label: "Emotion", value: breakdown.emotional_resonance },
    { label: "Memory", value: breakdown.memory_encoding },
    { label: "Aesthetic", value: breakdown.aesthetic_quality },
    { label: "Clarity", value: breakdown.cognitive_accessibility },
  ];

  return (
    <div className="flex flex-col items-center gap-6">
      {/* Circular gauge */}
      <div className="relative flex items-center justify-center">
        <div
          className="absolute rounded-full"
          style={{
            width: svgSize + 20,
            height: svgSize + 20,
            background: `radial-gradient(circle, ${color}10 0%, transparent 70%)`,
          }}
        />
        <svg
          width={svgSize}
          height={svgSize}
          style={{ transform: "rotate(-90deg)" }}
        >
          <circle
            cx={svgSize / 2}
            cy={svgSize / 2}
            r={radius}
            fill="none"
            stroke="rgba(255,255,255,0.04)"
            strokeWidth={stroke}
          />
          <circle
            cx={svgSize / 2}
            cy={svgSize / 2}
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth={stroke}
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
            strokeLinecap="round"
            style={{
              transition: "stroke-dashoffset 1.2s cubic-bezier(0.16, 1, 0.3, 1)",
              filter: `drop-shadow(0 0 8px ${color}40)`,
            }}
          />
        </svg>
        <div className="absolute flex flex-col items-center">
          <span
            className={cn(
              "font-[family-name:var(--font-display)] font-bold",
              size === "lg" ? "text-5xl" : "text-3xl"
            )}
            style={{ color }}
          >
            {Math.round(total)}
          </span>
          <span className="text-white/20 text-xs mt-0.5">/ 100</span>
          <span
            className="text-xs font-medium mt-1.5 uppercase tracking-wider"
            style={{ color }}
          >
            {scoreLabel(total)}
          </span>
        </div>
      </div>

      {/* Dimension breakdown bars */}
      <div className="w-full grid grid-cols-2 gap-x-6 gap-y-3">
        {dimensions.map((d) => {
          const info = DIMENSION_INFO[d.label];
          return (
            <div key={d.label}>
              <div className="flex items-center justify-between text-xs mb-1.5">
                <span className="flex items-center gap-1 text-white/35">
                  {d.label}
                  {info && (
                    <InfoTooltip
                      title={info.title}
                      description={info.description}
                      study={info.study}
                      studyDetail={info.studyDetail}
                      iconSize={12}
                    />
                  )}
                </span>
                <span className="text-white/60 font-medium tabular-nums">
                  {Math.round(d.value)}
                </span>
              </div>
              <div className="h-1 bg-white/[0.04] rounded-full overflow-hidden">
                <div
                  className={cn("h-full rounded-full transition-all duration-1000", scoreBgClass(d.value))}
                  style={{ width: `${d.value}%`, opacity: 0.8 }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
