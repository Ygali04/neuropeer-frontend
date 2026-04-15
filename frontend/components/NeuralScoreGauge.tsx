"use client";

import { useState, useEffect } from "react";
import type { NeuralScoreBreakdown } from "@/lib/types";
import { cn } from "@/lib/utils";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { CountUp } from "@/components/ui/count-up";
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

type ScoringMode = "targeted" | "full";

interface Props {
  breakdown: NeuralScoreBreakdown;
  size?: "sm" | "lg";
  mode?: ScoringMode;
  onModeChange?: (mode: ScoringMode) => void;
}

export function ScoringModeToggle({ mode, onChange, hasFull }: { mode: ScoringMode; onChange: (m: ScoringMode) => void; hasFull: boolean }) {
  if (!hasFull) return null;
  return (
    <div className="flex items-center gap-1 p-0.5 rounded-lg bg-white/[0.04] border border-white/[0.06]">
      <button
        onClick={() => onChange("targeted")}
        className={cn(
          "px-3 py-1 rounded-md text-[11px] font-medium transition-all",
          mode === "targeted" ? "bg-brand-500/20 text-brand-300" : "text-white/30 hover:text-white/50"
        )}
      >
        Targeted
      </button>
      <button
        onClick={() => onChange("full")}
        className={cn(
          "px-3 py-1 rounded-md text-[11px] font-medium transition-all",
          mode === "full" ? "bg-white/10 text-white/70" : "text-white/30 hover:text-white/50"
        )}
      >
        Full
      </button>
    </div>
  );
}

export function NeuralScoreGauge({ breakdown, size = "lg", mode: modeProp, onModeChange }: Props) {
  const [mounted, setMounted] = useState(false);
  const [internalMode, setInternalMode] = useState<ScoringMode>("targeted");
  const mode = modeProp ?? internalMode;
  const setMode = onModeChange ?? setInternalMode;
  useEffect(() => { const t = setTimeout(() => setMounted(true), 100); return () => clearTimeout(t); }, []);

  const hasFull = breakdown.full_total != null;
  const isFull = mode === "full" && hasFull;

  const total = isFull ? breakdown.full_total! : breakdown.total;
  const radius = size === "lg" ? 80 : 50;
  const stroke = size === "lg" ? 8 : 6;
  const circumference = 2 * Math.PI * radius;
  // Start from fully hidden (circumference), animate to target on mount
  const dashOffset = mounted ? circumference * (1 - total / 100) : circumference;
  const color = scoreColor(total);
  const svgSize = (radius + stroke) * 2 + 4;

  // Map backend dimension names to frontend labels and values
  const allDimensions = [
    { key: "Hook Score", label: "Hook", targeted: breakdown.hook_score, full: breakdown.full_hook_score ?? breakdown.hook_score },
    { key: "Sustained Attention", label: "Attention", targeted: breakdown.sustained_attention, full: breakdown.full_sustained_attention ?? breakdown.sustained_attention },
    { key: "Emotional Resonance", label: "Emotion", targeted: breakdown.emotional_resonance, full: breakdown.full_emotional_resonance ?? breakdown.emotional_resonance },
    { key: "Memory Encoding", label: "Memory", targeted: breakdown.memory_encoding, full: breakdown.full_memory_encoding ?? breakdown.memory_encoding },
    { key: "Aesthetic Quality", label: "Aesthetic", targeted: breakdown.aesthetic_quality, full: breakdown.full_aesthetic_quality ?? breakdown.aesthetic_quality },
    { key: "Cognitive Accessibility", label: "Clarity", targeted: breakdown.cognitive_accessibility, full: breakdown.full_cognitive_accessibility ?? breakdown.cognitive_accessibility },
  ];

  const targetedDims = new Set(breakdown.targeted_dimensions ?? []);

  // In targeted mode: only show the relevant dimensions
  // In full mode: show all 6
  const dimensions = isFull
    ? allDimensions.map(d => ({ label: d.label, value: d.full }))
    : allDimensions
        .filter(d => targetedDims.size === 0 || targetedDims.has(d.key))
        .map(d => ({ label: d.label, value: d.targeted }));

  const contentTypes = breakdown.content_types?.map(t => t.replace(/_/g, " ")).join(" + ");

  return (
    <div className="flex flex-col items-center gap-6">
      {/* Inline toggle only when uncontrolled */}
      {!modeProp && hasFull && (
        <ScoringModeToggle mode={mode} onChange={setMode} hasFull={hasFull} />
      )}
      {!modeProp && contentTypes && mode === "targeted" && (
        <p className="text-[10px] text-white/20 -mt-4">{contentTypes}</p>
      )}
      {!modeProp && mode === "full" && (
        <p className="text-[10px] text-white/20 -mt-4">All metrics equally weighted</p>
      )}
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
          <CountUp
            end={total}
            decimals={1}
            duration={1400}
            className={cn(
              "font-[family-name:var(--font-display)] font-bold",
              size === "lg" ? "text-5xl" : "text-3xl"
            )}
            style={{ color }}
          />
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
        {dimensions.map((d, i) => {
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
                <CountUp
                  end={d.value}
                  decimals={1}
                  duration={1000 + i * 100}
                  className="text-white/60 font-medium tabular-nums"
                />
              </div>
              <div className="h-1 bg-white/[0.04] rounded-full overflow-hidden">
                <div
                  className={cn("h-full rounded-full transition-all duration-1000 ease-out", scoreBgClass(d.value))}
                  style={{ width: mounted ? `${d.value}%` : "0%", opacity: 0.8 }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
