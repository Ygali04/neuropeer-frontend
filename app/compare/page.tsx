"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  Brain,
  GitCompare,
  Trophy,
  ExternalLink,
  Loader2,
  Plus,
  X,
  Share2,
} from "lucide-react";

import { submitAnalysis, compareVideos } from "@/lib/api";
import type { ComparisonResult, ContentType } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { UrlInputCard } from "@/components/UrlInputCard";
import { ReportPicker } from "@/components/ReportPicker";
import { UserMenu } from "@/components/UserMenu";
import { ThemeToggle } from "@/components/ThemeToggle";
import { cn } from "@/lib/utils";

function ComparePageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialJobs = (searchParams.get("jobs") ?? "").split(",").filter(Boolean);

  const [jobIds, setJobIds] = useState<string[]>(initialJobs);
  const [pendingJobs, setPendingJobs] = useState<string[]>([]);
  const [result, setResult] = useState<ComparisonResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [autoRan, setAutoRan] = useState(false);

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

  const runComparison = async (ids: string[]) => {
    if (ids.length < 2) {
      setError("Add at least 2 videos to compare.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const data = await compareVideos(ids);
      setResult(data);

      // Update URL to make comparison shareable (without triggering navigation)
      const newUrl = `/compare?jobs=${ids.join(",")}`;
      window.history.replaceState({}, "", newUrl);

      // Update browser tab title (will refine with report names once they load)
      const scores = data.neural_scores.map((ns) => Math.round(ns.total));
      document.title = `Compare: ${scores.join(" vs ")} — NeuroPeer`;
      // Refine with report names after they resolve
      setTimeout(() => {
        const names = ids.map((id) => {
          const info = reportLabels[id];
          return info?.title || `${Math.round(info?.score ?? 0)}/100`;
        });
        document.title = `${names.join(" vs ")} — NeuroPeer`;
      }, 2000);

      // Fetch report details for titles (runs in background)
      data.job_ids.forEach(async (id: string) => {
        if (reportLabels[id]) return;
        try {
          const r = await fetch(`${process.env.NEXT_PUBLIC_API_URL ?? "https://neuropeer-api-production.up.railway.app"}/api/v1/results/${id}`);
          if (r.ok) {
            const d = await r.json();
            setReportLabels((prev) => ({ ...prev, [id]: { url: d.url, score: d.neural_score?.total ?? 0, title: d.ai_report_title || null } }));
          }
        } catch {}
      });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Comparison failed.");
    } finally {
      setLoading(false);
    }
  };

  const handleCompare = () => runComparison([...jobIds, ...pendingJobs]);

  // Auto-run comparison when URL has 2+ job IDs (shareable link)
  useEffect(() => {
    if (autoRan || initialJobs.length < 2) return;
    setAutoRan(true);
    runComparison(initialJobs);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const allIds = [...jobIds, ...pendingJobs];

  // Resolve full report info for queued items
  const [reportLabels, setReportLabels] = useState<Record<string, { url: string; score: number; title: string | null }>>({});

  useEffect(() => {
    const idsToFetch = [...new Set([...allIds, ...(result?.job_ids ?? [])])];
    idsToFetch.forEach(async (id) => {
      if (reportLabels[id]) return;
      try {
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL ?? "https://neuropeer-api-production.up.railway.app"}/api/v1/results/${id}`);
        if (res.ok) {
          const data = await res.json();
          setReportLabels((prev) => ({
            ...prev,
            [id]: {
              url: data.url,
              score: data.neural_score?.total ?? 0,
              title: data.ai_report_title || null,
            },
          }));
        }
      } catch {}
    });
  }, [allIds, result]); // eslint-disable-line react-hooks/exhaustive-deps

  const getReportName = (id: string): string => {
    const info = reportLabels[id];
    if (info?.title) return info.title;
    if (info?.url) return info.url.replace(/https?:\/\/(www\.)?/, "").slice(0, 35);
    return id.slice(0, 12) + "…";
  };

  const getLabel = (id: string): string => getReportName(id);

  const getScore = (id: string): number | null => {
    return reportLabels[id]?.score ?? null;
  };

  return (
    <div className="min-h-screen">
      <header className="nav-backdrop border-b border-white/[0.06] px-4 sm:px-6 py-3 sm:py-4 sticky top-0 z-10 backdrop-blur-xl bg-[#07060b]/80">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2 sm:gap-4">
            <Link href="/" className="flex items-center gap-2 sm:gap-3 group">
              <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center shadow-lg shadow-brand-500/20">
                <Brain className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-white" />
              </div>
              <span className="font-[family-name:var(--font-display)] text-white font-semibold tracking-tight text-sm sm:text-base">NeuroPeer</span>
            </Link>
            <span className="text-white/10">/</span>
            <Link href="/compare" className="flex items-center gap-1.5 hover:opacity-80 transition-opacity">
              <GitCompare className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-teal-400" />
              <span className="text-white/50 text-xs sm:text-sm font-medium">A/B Comparison</span>
            </Link>
          </div>
          <div className="flex items-center gap-2 sm:gap-4">
            <Link href="/methodology" className="hidden sm:block text-sm text-white/40 hover:text-white/70 transition-colors">Methodology</Link>
            <ThemeToggle />
            <UserMenu />
          </div>
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
              const score = getScore(id);
              const scoreColor = score !== null ? (score >= 75 ? "var(--color-score-green)" : score >= 50 ? "var(--color-score-amber)" : "var(--color-score-red)") : undefined;
              return (
                <div key={id} className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/[0.03] border border-white/[0.06]">
                  <span className="w-5 h-5 rounded-full bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center text-white text-[10px] font-bold">
                    {i + 1}
                  </span>
                  <span className="text-xs text-white/50 max-w-[250px] truncate">{getLabel(id)}</span>
                  {score !== null && (
                    <span className="text-[10px] font-bold tabular-nums" style={{ color: scoreColor }}>
                      {score.toFixed(1)}
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
            {/* Comparison header with share */}
            <div className="flex items-center justify-between animate-fade-up">
              <div>
                <h2 className="font-[family-name:var(--font-display)] text-lg sm:text-xl font-bold text-white/80">
                  {result.neural_scores.length}-Way Comparison
                </h2>
                <p className="text-xs text-white/30 mt-0.5">
                  {result.job_ids.map((id) => getReportName(id)).join(" vs ")}
                </p>
              </div>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(window.location.href);
                  alert("Comparison link copied!");
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-white/40 hover:text-brand-400 hover:bg-brand-500/10 transition-colors border border-white/[0.06]"
              >
                <Share2 className="w-3.5 h-3.5" />
                Share
              </button>
            </div>

            {/* Summary card — built from scores, no external AI call */}
            <Card className="!border-brand-500/20 animate-fade-up">
              <div className="flex items-center gap-2 mb-3">
                <Trophy className="w-4 h-4 text-brand-400" />
                <CardTitle className="!mb-0 !text-brand-400">Summary</CardTitle>
              </div>
              {(() => {
                const scores = result.neural_scores;
                const ids = result.job_ids;
                const winnerIdx = ids.indexOf(result.winner_job_id);
                const winnerName = getReportName(ids[winnerIdx]);
                const winnerScore = scores[winnerIdx].total;

                // Find biggest advantage dimension
                const dims = ["hook_score", "sustained_attention", "emotional_resonance", "memory_encoding", "aesthetic_quality", "cognitive_accessibility"] as const;
                const dimLabels: Record<string, string> = { hook_score: "Hook", sustained_attention: "Attention", emotional_resonance: "Emotion", memory_encoding: "Memory", aesthetic_quality: "Aesthetic", cognitive_accessibility: "Clarity" };
                let bestDim: string = dims[0], bestDimDelta = 0;
                if (scores.length === 2) {
                  for (const d of dims) {
                    const delta = Math.abs(scores[0][d] - scores[1][d]);
                    if (delta > bestDimDelta) { bestDimDelta = delta; bestDim = d; }
                  }
                }

                // Per-report AI summaries from fetched data
                const reportSummaries = ids.map((id) => reportLabels[id]).filter(Boolean);

                return (
                  <div className="space-y-3">
                    <p className="text-sm text-white/60 leading-relaxed">
                      <span className="text-white/80 font-medium">{winnerName}</span> leads with a neural score of{" "}
                      <span className="font-bold" style={{ color: winnerScore >= 75 ? "var(--color-score-green)" : winnerScore >= 50 ? "var(--color-score-amber)" : "var(--color-score-red)" }}>
                        {winnerScore.toFixed(1)}
                      </span>/100.
                      {scores.length === 2 && (
                        <> The biggest difference is in <span className="text-white/70 font-medium">{dimLabels[bestDim]}</span> ({bestDimDelta.toFixed(1)} point gap).</>
                      )}
                    </p>
                    {scores.length === 2 && (() => {
                      const loserIdx = winnerIdx === 0 ? 1 : 0;
                      const loserName = getReportName(ids[loserIdx]);
                      const improvements = dims.filter((d) => scores[loserIdx][d] > scores[winnerIdx][d]);
                      if (improvements.length > 0) {
                        return (
                          <p className="text-xs text-white/40 leading-relaxed">
                            However, <span className="text-white/55">{loserName}</span> outperforms on{" "}
                            {improvements.map((d) => dimLabels[d]).join(", ")} — consider combining the strengths of both.
                          </p>
                        );
                      }
                      return null;
                    })()}
                  </div>
                );
              })()}
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
                      <span className="text-sm font-medium text-white/60 truncate max-w-[220px]" title={result.labels[i]}>
                        {getReportName(result.job_ids[i])}
                      </span>
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
                          <span className="text-xl font-bold font-[family-name:var(--font-display)]" style={{ color: scoreColor }}>{ns.total.toFixed(1)}</span>
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
                              <span className="text-white/55 font-medium tabular-nums">{d.value.toFixed(1)}</span>
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

            {/* Dimension-level delta comparison */}
            {result.neural_scores.length === 2 && (
              <Card className="animate-fade-up delay-150">
                <CardTitle>Score Delta</CardTitle>
                <div className="mt-4 space-y-3">
                  {[
                    { label: "Overall", v1: result.neural_scores[0].total, v2: result.neural_scores[1].total },
                    { label: "Hook", v1: result.neural_scores[0].hook_score, v2: result.neural_scores[1].hook_score },
                    { label: "Attention", v1: result.neural_scores[0].sustained_attention, v2: result.neural_scores[1].sustained_attention },
                    { label: "Emotion", v1: result.neural_scores[0].emotional_resonance, v2: result.neural_scores[1].emotional_resonance },
                    { label: "Memory", v1: result.neural_scores[0].memory_encoding, v2: result.neural_scores[1].memory_encoding },
                    { label: "Aesthetic", v1: result.neural_scores[0].aesthetic_quality, v2: result.neural_scores[1].aesthetic_quality },
                    { label: "Clarity", v1: result.neural_scores[0].cognitive_accessibility, v2: result.neural_scores[1].cognitive_accessibility },
                  ].map(({ label, v1, v2 }) => {
                    const delta = v2 - v1;
                    const winner = delta > 0.5 ? 2 : delta < -0.5 ? 1 : 0;
                    return (
                      <div key={label} className="flex items-center gap-3">
                        <span className="text-xs text-white/40 w-20 flex-shrink-0">{label}</span>
                        <span className={cn("text-xs font-bold tabular-nums w-10 text-right", winner === 1 ? "text-emerald-400" : "text-white/50")}>{v1.toFixed(1)}</span>
                        <div className="flex-1 h-1.5 rounded-full bg-white/[0.04] relative overflow-hidden">
                          <div className="absolute inset-y-0 left-1/2 w-px bg-white/[0.08]" />
                          {delta !== 0 && (
                            <div
                              className="absolute inset-y-0 rounded-full"
                              style={{
                                left: delta > 0 ? "50%" : `${50 + (delta / 100) * 50}%`,
                                width: `${Math.abs(delta / 100) * 50}%`,
                                backgroundColor: delta > 0 ? "var(--color-score-green)" : "var(--color-score-red)",
                                opacity: 0.6,
                              }}
                            />
                          )}
                        </div>
                        <span className={cn("text-xs font-bold tabular-nums w-10", winner === 2 ? "text-emerald-400" : "text-white/50")}>{v2.toFixed(1)}</span>
                        <span className={cn("text-[10px] font-bold tabular-nums w-12 text-right", delta > 0.5 ? "text-emerald-400" : delta < -0.5 ? "text-red-400" : "text-white/20")}>
                          {delta > 0 ? "+" : ""}{delta.toFixed(1)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </Card>
            )}

            {/* Full metric table */}
            <Card className="animate-fade-up delay-200">
              <CardTitle>All Metrics</CardTitle>
              <div className="overflow-x-auto mt-3">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-white/30 text-xs border-b border-white/[0.06]">
                      <th className="text-left pb-3 pr-4 font-medium uppercase tracking-wider">Metric</th>
                      {result.labels.map((_label, i) => (
                        <th key={i} className="text-right pb-3 px-2 sm:px-3 min-w-[60px] font-medium tracking-wider text-[10px]" title={result.labels[i]}>
                          {getReportName(result.job_ids[i]).slice(0, 18)}
                        </th>
                      ))}
                      {result.neural_scores.length === 2 && (
                        <th className="text-right pb-3 pl-2 min-w-[50px] font-medium uppercase tracking-wider">Delta</th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(result.delta_metrics).map(([metric, scores]) => {
                      const maxScore = Math.max(...scores);
                      const delta = scores.length === 2 ? scores[1] - scores[0] : null;
                      return (
                        <tr key={metric} className="border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors">
                          <td className="py-2.5 pr-4 text-xs text-white/45">{metric}</td>
                          {scores.map((score, i) => (
                            <td key={i} className={cn("py-2.5 px-2 sm:px-3 text-right text-xs font-medium tabular-nums", score === maxScore ? "" : "text-white/50")} style={score === maxScore ? { color: "var(--color-score-green)" } : undefined}>
                              {score.toFixed(1)}
                            </td>
                          ))}
                          {delta !== null && (
                            <td className={cn("py-2.5 pl-2 text-right text-[11px] font-bold tabular-nums", delta > 0.5 ? "text-emerald-400" : delta < -0.5 ? "text-red-400" : "text-white/20")}>
                              {delta > 0 ? "+" : ""}{delta.toFixed(1)}
                            </td>
                          )}
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
