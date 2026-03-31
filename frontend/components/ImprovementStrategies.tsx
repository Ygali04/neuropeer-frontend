"use client";

import { useState } from "react";
import {
  Lightbulb,
  Eye,
  Zap,
  FileText,
  Volume2,
  Timer,
  Heart,
  ChevronRight,
  Target,
  ArrowRight,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { METRIC_STRATEGIES, type ImprovementStrategy } from "@/lib/metric-info";
import type { MetricScore } from "@/lib/types";

const CATEGORY_CONFIG: Record<
  ImprovementStrategy["category"],
  { label: string; icon: typeof Eye; color: string; bg: string }
> = {
  visual:    { label: "Visual", icon: Eye, color: "#f97316", bg: "rgba(249, 115, 22, 0.06)" },
  attention: { label: "Attention", icon: Zap, color: "#fbbf24", bg: "rgba(251, 191, 36, 0.06)" },
  script:    { label: "Script & Messaging", icon: FileText, color: "#60a5fa", bg: "rgba(96, 165, 250, 0.06)" },
  audio:     { label: "Audio", icon: Volume2, color: "#c084fc", bg: "rgba(192, 132, 252, 0.06)" },
  pacing:    { label: "Pacing", icon: Timer, color: "#2dd4bf", bg: "rgba(45, 212, 191, 0.06)" },
  emotional: { label: "Emotional", icon: Heart, color: "#f87171", bg: "rgba(248, 113, 113, 0.06)" },
};

interface CategoryStrategy {
  score_context: string;
  strategies: string[];
}

interface Props {
  metrics: MetricScore[];
  overarchingSummary?: string;
  aiPriorities?: string[];
  aiMetricTips?: Record<string, string>;
  aiCategoryStrategies?: Record<string, CategoryStrategy>;
  aiLoading?: boolean;
}

/**
 * Parse the overarching summary into sentences.
 * Splits on sentence boundaries and extracts any that look like action items.
 */
function parseSummary(text: string): { sentences: string[] } {
  // Split into sentences (period followed by space + capital letter, or end of string)
  const sentences = text
    .split(/(?<=\.)\s+(?=[A-Z])/)
    .map((s) => s.trim())
    .filter((s) => s.length > 10);
  return { sentences };
}

export function ImprovementStrategies({ metrics, overarchingSummary, aiPriorities, aiMetricTips, aiCategoryStrategies, aiLoading }: Props) {
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);

  const improvableMetrics = metrics
    .filter((m) => m.score < 75 && METRIC_STRATEGIES[m.name])
    .sort((a, b) => a.score - b.score);

  const byCategory = new Map<string, { metric: MetricScore; strategy: ImprovementStrategy }[]>();
  for (const m of improvableMetrics) {
    const strategy = METRIC_STRATEGIES[m.name];
    if (!strategy) continue;
    const cat = strategy.category;
    if (!byCategory.has(cat)) byCategory.set(cat, []);
    byCategory.get(cat)!.push({ metric: m, strategy });
  }

  const sortedCategories = [...byCategory.entries()].sort((a, b) => {
    const avgA = a[1].reduce((s, x) => s + x.metric.score, 0) / a[1].length;
    const avgB = b[1].reduce((s, x) => s + x.metric.score, 0) / b[1].length;
    return avgA - avgB;
  });

  const topActions = improvableMetrics
    .slice(0, 3)
    .map((m) => ({
      metric: m,
      strategy: METRIC_STRATEGIES[m.name]!,
      topAction: METRIC_STRATEGIES[m.name]!.actions[0],
    }));

  if (improvableMetrics.length === 0) {
    return (
      <div className="glass-card p-6 text-center">
        <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mx-auto mb-4">
          <Target className="w-6 h-6 text-emerald-400" />
        </div>
        <h3 className="text-white/80 font-medium mb-1">All Metrics Strong</h3>
        <p className="text-xs text-white/35">
          Every metric scores above 75. This content is performing at a high level.
        </p>
      </div>
    );
  }

  const parsed = overarchingSummary ? parseSummary(overarchingSummary) : null;

  return (
    <div className="flex flex-col gap-6">
      {/* ── Overarching Summary ───────────────────────────────────────────── */}
      {(parsed || aiLoading) && (
        <div className="glass-card p-5 !border-brand-500/15">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-brand-500/10 border border-brand-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
              <Target className="w-4 h-4 text-brand-400" />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2">
                <h3 className="text-sm font-medium text-white/70">Overall Assessment</h3>
                {aiLoading && (
                  <span className="text-[10px] text-brand-400 animate-pulse">Generating AI insights...</span>
                )}
              </div>
              {parsed && (
                <div className="space-y-2">
                  {parsed.sentences.map((sentence, i) => (
                    <p key={i} className="text-sm text-white/45 leading-relaxed">{sentence}</p>
                  ))}
                </div>
              )}
              {/* AI-generated priorities */}
              {aiPriorities && aiPriorities.length > 0 && (
                <div className="mt-4 pt-3 border-t border-white/[0.06] space-y-2">
                  <p className="text-[10px] text-teal-400/60 uppercase tracking-wider font-medium mb-2">AI-Generated Priorities</p>
                  {aiPriorities.map((p, i) => (
                    <div key={i} className="flex items-start gap-2.5">
                      <div className="w-5 h-5 rounded-md bg-brand-500/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <span className="text-[10px] font-bold text-brand-400">{i + 1}</span>
                      </div>
                      <p className="text-sm text-white/50 leading-relaxed">{p}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Priority Actions (Top 3) ─────────────────────────────────────── */}
      <div>
        <h3 className="text-xs font-medium text-white/40 uppercase tracking-wider mb-3 flex items-center gap-2">
          <Lightbulb className="w-3.5 h-3.5 text-brand-400" />
          Priority Actions
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {topActions.map(({ metric, strategy, topAction }, i) => {
            const catConfig = CATEGORY_CONFIG[strategy.category];
            return (
              <div
                key={metric.name}
                className="glass-card !p-4 glass-card-hover flex flex-col"
              >
                {/* Header: number + category */}
                <div className="flex items-center gap-2 mb-3">
                  <div
                    className="w-6 h-6 rounded-lg flex items-center justify-center text-xs font-bold"
                    style={{ backgroundColor: catConfig.bg, color: catConfig.color }}
                  >
                    {i + 1}
                  </div>
                  <span className="text-xs font-medium text-white/50 uppercase tracking-wider">
                    {catConfig.label}
                  </span>
                </div>

                {/* Strategy title */}
                <p className="text-sm font-medium text-white/70 mb-2">{strategy.title}</p>

                {/* Top action */}
                <p className="text-xs text-white/35 leading-relaxed flex-1">{topAction}</p>

                {/* Bottom: metric name + score, horizontally aligned */}
                <div className="flex items-center justify-between mt-4 pt-3 border-t border-white/[0.04]">
                  <span className="text-[10px] text-white/25 truncate mr-2">{metric.name}</span>
                  <span
                    className="text-sm font-bold tabular-nums whitespace-nowrap"
                    style={{
                      color:
                        metric.score >= 70
                          ? "var(--color-score-green)"
                          : metric.score >= 45
                          ? "var(--color-score-amber)"
                          : "var(--color-score-red)",
                    }}
                  >
                    {Math.round(metric.score)}
                    <span className="text-white/20 font-normal">/100</span>
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Category Breakdown ────────────────────────────────────────────── */}
      <div>
        <h3 className="text-xs font-medium text-white/40 uppercase tracking-wider mb-3 flex items-center gap-2">
          <ArrowRight className="w-3.5 h-3.5 text-teal-400" />
          Detailed Strategies by Category
        </h3>
        <div className="flex flex-col gap-2">
          {sortedCategories.map(([category, items]) => {
            const catConfig = CATEGORY_CONFIG[category as ImprovementStrategy["category"]];
            const CatIcon = catConfig.icon;
            const isExpanded = expandedCategory === category;
            const avgScore = Math.round(
              items.reduce((s, x) => s + x.metric.score, 0) / items.length
            );

            return (
              <div key={category} className="glass-card !p-0 overflow-hidden">
                <button
                  onClick={() =>
                    setExpandedCategory(isExpanded ? null : category)
                  }
                  className="w-full flex items-center gap-3 px-5 py-4 hover:bg-white/[0.02] transition-colors"
                >
                  <div
                    className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                    style={{ backgroundColor: catConfig.bg }}
                  >
                    <CatIcon
                      className="w-4 h-4"
                      style={{ color: catConfig.color }}
                    />
                  </div>
                  <div className="flex-1 text-left">
                    <div className="text-sm font-medium text-white/70">
                      {catConfig.label}
                    </div>
                    <div className="text-xs text-white/25">
                      {items.length} metric{items.length > 1 ? "s" : ""} to
                      improve · avg score {avgScore}
                    </div>
                  </div>
                  <span
                    className="text-sm font-semibold tabular-nums"
                    style={{
                      color:
                        avgScore >= 70
                          ? "var(--color-score-green)"
                          : avgScore >= 45
                          ? "var(--color-score-amber)"
                          : "var(--color-score-red)",
                    }}
                  >
                    {avgScore}
                  </span>
                  <ChevronRight
                    className={cn(
                      "w-4 h-4 text-white/20 transition-transform duration-200",
                      isExpanded && "rotate-90"
                    )}
                  />
                </button>

                {isExpanded && (
                  <div className="border-t border-white/[0.04] px-5 py-4 space-y-4">
                    {items.map(({ metric, strategy }) => (
                      <div key={metric.name}>
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm font-medium text-white/60">
                            {strategy.title}
                          </span>
                          <span
                            className="text-xs font-semibold tabular-nums"
                            style={{
                              color:
                                metric.score >= 70
                                  ? "var(--color-score-green)"
                                  : metric.score >= 45
                                  ? "var(--color-score-amber)"
                                  : "var(--color-score-red)",
                            }}
                          >
                            {Math.round(metric.score)}/100
                          </span>
                        </div>
                        <p className="text-xs text-white/35 mb-2.5">
                          {strategy.description}
                        </p>
                        <ul className="space-y-1.5">
                          {strategy.actions.map((action, j) => (
                            <li
                              key={j}
                              className="text-xs text-white/45 leading-relaxed flex gap-2"
                            >
                              <span
                                className="flex-shrink-0 w-4 h-4 rounded flex items-center justify-center text-[10px] font-medium mt-0.5"
                                style={{
                                  backgroundColor: catConfig.bg,
                                  color: catConfig.color,
                                }}
                              >
                                {j + 1}
                              </span>
                              {action}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── AI-Generated Category Strategies ──────────────────────────────── */}
      {aiCategoryStrategies && Object.keys(aiCategoryStrategies).length > 0 && (
        <div>
          <h3 className="text-xs font-medium text-white/40 uppercase tracking-wider mb-3 flex items-center gap-2">
            <Sparkles className="w-3.5 h-3.5 text-brand-400" />
            AI Deep-Dive Strategies
          </h3>
          <div className="flex flex-col gap-3">
            {Object.entries(aiCategoryStrategies).map(([category, data]) => (
              <div key={category} className="glass-card !p-4">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-2 h-2 rounded-full bg-brand-400" />
                  <h4 className="text-sm font-medium text-white/70">{category}</h4>
                </div>
                <p className="text-xs text-white/30 mb-3 italic">{data.score_context}</p>
                <div className="space-y-2">
                  {data.strategies.map((strategy, i) => (
                    <div key={i} className="flex items-start gap-2">
                      <div className="w-4 h-4 rounded bg-brand-500/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <span className="text-[9px] font-bold text-brand-400">{i + 1}</span>
                      </div>
                      <p className="text-xs text-white/45 leading-relaxed">{strategy}</p>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── AI Metric-Specific Tips ────────────────────────────────────────── */}
      {aiMetricTips && Object.keys(aiMetricTips).length > 0 && (
        <div>
          <h3 className="text-xs font-medium text-white/40 uppercase tracking-wider mb-3 flex items-center gap-2">
            <Target className="w-3.5 h-3.5 text-amber-400" />
            Metric-Specific Recommendations
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {Object.entries(aiMetricTips).map(([metric, tip]) => (
              <div key={metric} className="glass-card !p-3">
                <p className="text-xs font-medium text-white/60 mb-1">{metric}</p>
                <p className="text-[11px] text-white/35 leading-relaxed">{tip}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
