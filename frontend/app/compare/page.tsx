"use client";

import { useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  Brain,
  GitCompare,
  Trophy,
  ExternalLink,
  Loader2,
  Plus,
  X,
} from "lucide-react";

import { submitAnalysis, compareVideos } from "@/lib/api";
import type { ComparisonResult, ContentType } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { UrlInputCard } from "@/components/UrlInputCard";
import { ReportPicker } from "@/components/ReportPicker";
import { UserMenu } from "@/components/UserMenu";
import { cn } from "@/lib/utils";

function ComparePageInner() {
  const searchParams = useSearchParams();
  const initialJobId = searchParams.get("jobs") ?? "";

  const [jobIds, setJobIds] = useState<string[]>(
    initialJobId ? [initialJobId] : []
  );
  const [pendingJobs, setPendingJobs] = useState<string[]>([]);
  const [result, setResult] = useState<ComparisonResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [aiRecommendation, setAiRecommendation] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);

  const handleAddVideo = async (url: string, contentType: ContentType) => {
    setLoading(true);
    setError("");
    try {
      const { job_id } = await submitAnalysis(url, contentType);
      setPendingJobs((prev) => [...prev, job_id]);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to submit");
    } finally {
      setLoading(false);
    }
  };

  const handlePickExisting = (jobId: string) => {
    setJobIds((prev) => [...prev, jobId]);
  };

  const handleRemove = (id: string) => {
    setJobIds((prev) => prev.filter((j) => j !== id));
    setPendingJobs((prev) => prev.filter((j) => j !== id));
  };

  const handleCompare = async () => {
    const allIds = [...jobIds, ...pendingJobs];
    if (allIds.length < 2) {
      setError("Add at least 2 videos to compare.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const data = await compareVideos(allIds);
      setResult(data);
      // Fetch AI recommendation in background
      setAiLoading(true);
      fetch("/api/generate-feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "comparison",
          data: { jobIds: data.job_ids, scores: data.neural_scores, labels: data.labels, deltaMetrics: data.delta_metrics },
        }),
      })
        .then((r) => (r.ok ? r.json() : Promise.reject()))
        .then((ai) => setAiRecommendation(ai.recommendation))
        .catch(() => {})
        .finally(() => setAiLoading(false));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Comparison failed.");
    } finally {
      setLoading(false);
    }
  };

  const allIds = [...jobIds, ...pendingJobs];

  // Resolve labels for queued items
  const getLabel = (id: string): string => {
    return id.slice(0, 12) + "…";
  };

  return (
    <div className="min-h-screen">
      <header className="border-b border-white/[0.06] px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/" className="flex items-center gap-3 group">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center shadow-lg shadow-brand-500/20">
                <Brain className="w-4 h-4 text-white" />
              </div>
              <span className="font-[family-name:var(--font-display)] text-white font-semibold tracking-tight">NeuroPeer</span>
            </Link>
            <span className="text-white/10">/</span>
            <div className="flex items-center gap-2">
              <GitCompare className="w-4 h-4 text-teal-400" />
              <span className="text-white/50 text-sm font-medium">A/B Comparison</span>
            </div>
          </div>
          <UserMenu />
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
        <div className="mb-8 animate-fade-up">
          <h1 className="font-[family-name:var(--font-display)] text-2xl sm:text-3xl font-bold text-white mb-2">
            A/B Neural Comparison
          </h1>
          <p className="text-white/35 text-sm">
            Compare 2–5 videos by picking existing reports or submitting new URLs.
          </p>
        </div>

        {/* Queue */}
        {allIds.length > 0 && !result && (
          <div className="mb-6 flex flex-wrap gap-2 animate-fade-up delay-100">
            {allIds.map((id, i) => {
              const score: number | undefined = undefined;
              return (
                <div key={id} className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/[0.03] border border-white/[0.06]">
                  <span className="w-5 h-5 rounded-full bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center text-white text-[10px] font-bold">
                    {i + 1}
                  </span>
                  <span className="text-xs text-white/50 max-w-[200px] truncate">{getLabel(id)}</span>
                  {score && (
                    <span className="text-[10px] font-bold tabular-nums" style={{ color: score >= 75 ? "var(--color-score-green)" : score >= 50 ? "var(--color-score-amber)" : "var(--color-score-red)" }}>
                      {score}
                    </span>
                  )}
                  <button onClick={() => handleRemove(id)} className="p-0.5 rounded hover:bg-white/[0.08] text-white/20 hover:text-white/50 transition-colors">
                    <X className="w-3 h-3" />
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {/* Add videos */}
        {allIds.length < 5 && !result && (
          <div className="space-y-4 mb-6 animate-fade-up delay-200">
            {/* Pick existing */}
            <Card>
              <div className="flex items-center gap-2 mb-4">
                <Plus className="w-4 h-4 text-teal-400" />
                <CardTitle className="!mb-0">Add Video {allIds.length + 1}</CardTitle>
              </div>

              <ReportPicker selectedIds={allIds} onSelect={handlePickExisting} />

              {/* Or submit new URL */}
              <div className="relative my-5">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-white/[0.06]" />
                </div>
                <div className="relative flex justify-center">
                  <span className="px-3 text-[10px] text-white/20 uppercase tracking-wider" style={{ background: "var(--background)" }}>
                    or analyze a new video
                  </span>
                </div>
              </div>

              <UrlInputCard onSubmit={handleAddVideo} loading={loading} />
            </Card>
          </div>
        )}

        {error && (
          <div className="glass-card !border-red-500/20 px-4 py-3 text-red-400 text-sm mb-6 flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-red-400 flex-shrink-0" />
            {error}
          </div>
        )}

        {/* Compare button */}
        {allIds.length >= 2 && !result && (
          <div className="animate-fade-up delay-300">
            <Button onClick={handleCompare} disabled={loading} size="lg">
              {loading ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Comparing…</>
              ) : (
                <><GitCompare className="w-4 h-4" /> Compare {allIds.length} Videos</>
              )}
            </Button>
          </div>
        )}

        {/* Results */}
        {result && (
          <div className="flex flex-col gap-6">
            <Card className="!border-brand-500/20 animate-fade-up">
              <div className="flex items-center gap-2 mb-3">
                <Trophy className="w-4 h-4 text-brand-400" />
                <CardTitle className="!mb-0 !text-brand-400">Recommendation</CardTitle>
              </div>
              <p className="text-white/60 text-sm leading-relaxed">
                {aiRecommendation ?? result.recommendation}
              </p>
              {aiLoading && (
                <p className="text-[10px] text-brand-400 animate-pulse mt-2">Generating AI recommendation...</p>
              )}
            </Card>

            <div className={cn(
              "grid gap-5 animate-fade-up delay-100",
              result.neural_scores.length === 2 ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3"
            )}>
              {result.neural_scores.map((ns, i) => {
                const isWinner = result.job_ids[i] === result.winner_job_id;
                const scoreColor = ns.total >= 75 ? "var(--color-score-green)" : ns.total >= 50 ? "var(--color-score-amber)" : "var(--color-score-red)";
                const dims = [
                  { label: "Hook", value: ns.hook_score },
                  { label: "Attention", value: ns.sustained_attention },
                  { label: "Emotion", value: ns.emotional_resonance },
                  { label: "Memory", value: ns.memory_encoding },
                  { label: "Aesthetic", value: ns.aesthetic_quality },
                  { label: "Clarity", value: ns.cognitive_accessibility },
                ];

                return (
                  <Card key={result.job_ids[i]} className={cn("!p-5", isWinner && "!border-brand-500/30 glow-brand")}>
                    {/* Header */}
                    <div className="flex items-center justify-between mb-5">
                      <span className="text-sm font-medium text-white/50">Video {i + 1}</span>
                      {isWinner && <Badge variant="brand"><Trophy className="w-3 h-3" /> Winner</Badge>}
                    </div>

                    {/* Score — compact horizontal layout */}
                    <div className="flex items-center gap-4 mb-5">
                      <div className="relative flex-shrink-0" style={{ width: 72, height: 72 }}>
                        <svg width="72" height="72" style={{ transform: "rotate(-90deg)" }}>
                          <circle cx="36" cy="36" r="30" fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth="5" />
                          <circle cx="36" cy="36" r="30" fill="none" stroke={scoreColor} strokeWidth="5"
                            strokeDasharray={2 * Math.PI * 30}
                            strokeDashoffset={2 * Math.PI * 30 * (1 - ns.total / 100)}
                            strokeLinecap="round"
                            style={{ filter: `drop-shadow(0 0 6px ${scoreColor}40)` }}
                          />
                        </svg>
                        <div className="absolute inset-0 flex flex-col items-center justify-center">
                          <span className="text-xl font-bold font-[family-name:var(--font-display)]" style={{ color: scoreColor }}>{Math.round(ns.total)}</span>
                        </div>
                      </div>
                      <div>
                        <div className="text-white/20 text-xs">/ 100</div>
                        <div className="text-xs font-semibold uppercase tracking-wider mt-0.5" style={{ color: scoreColor }}>
                          {ns.total >= 80 ? "Exceptional" : ns.total >= 65 ? "Strong" : ns.total >= 50 ? "Moderate" : "Needs Work"}
                        </div>
                      </div>
                    </div>

                    {/* Dimension bars */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-2 sm:gap-y-2.5 mb-4 sm:mb-5">
                      {dims.map((d) => {
                        const c = d.value >= 75 ? "var(--color-score-green)" : d.value >= 50 ? "var(--color-score-amber)" : "var(--color-score-red)";
                        return (
                          <div key={d.label}>
                            <div className="flex justify-between text-xs mb-1">
                              <span className="text-white/35">{d.label}</span>
                              <span className="text-white/55 font-medium tabular-nums">{Math.round(d.value)}</span>
                            </div>
                            <div className="h-1 bg-white/[0.04] rounded-full overflow-hidden">
                              <div className="h-full rounded-full" style={{ width: `${d.value}%`, backgroundColor: c, opacity: 0.7 }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Footer: URL + link */}
                    <div className="pt-3 border-t border-white/[0.04]">
                      <p className="text-[10px] text-white/20 truncate mb-2 font-mono">{result.labels[i]}</p>
                      <Link href={`/analyze/${result.job_ids[i]}`} className="inline-flex items-center gap-1.5 text-xs text-brand-400 hover:text-brand-300 transition-colors">
                        View full report <ExternalLink className="w-3 h-3" />
                      </Link>
                    </div>
                  </Card>
                );
              })}
            </div>

            <Card className="animate-fade-up delay-200">
              <CardTitle>Metric Comparison</CardTitle>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-white/30 text-xs border-b border-white/[0.06]">
                      <th className="text-left pb-3 pr-4 font-medium uppercase tracking-wider">Metric</th>
                      {result.labels.map((label, i) => (
                        <th key={i} className="text-right pb-3 px-3 min-w-[80px] font-medium uppercase tracking-wider">V{i + 1}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(result.delta_metrics).map(([metric, scores]) => {
                      const maxScore = Math.max(...scores);
                      return (
                        <tr key={metric} className="border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors">
                          <td className="py-3 pr-4 text-white/45">{metric}</td>
                          {scores.map((score, i) => (
                            <td key={i} className="py-3 px-3 text-right font-medium tabular-nums" style={{ color: score === maxScore ? "var(--color-score-green)" : "rgba(255,255,255,0.35)" }}>
                              {score.toFixed(0)}
                            </td>
                          ))}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>
        )}
      </main>
    </div>
  );
}

export default function ComparePage() {
  return (
    <Suspense>
      <ComparePageInner />
    </Suspense>
  );
}
