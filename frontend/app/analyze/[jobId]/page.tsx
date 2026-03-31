"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  Brain,
  Download,
  Loader2,
  GitCompare,
  ExternalLink,
  BarChart3,
  Lightbulb,
  ChevronDown,
  Share2,
  Check,
} from "lucide-react";

import { connectJobWebSocket, getResult, exportReport } from "@/lib/api";
import { generateReportPDF } from "@/lib/export-pdf";
import { addRunToHistory } from "@/lib/run-history";
import { useAuth } from "@/lib/auth-context";
import { UserMenu } from "@/components/UserMenu";
import type { AnalysisResult, ProgressEvent } from "@/lib/types";

import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ProgressTracker } from "@/components/ProgressTracker";
import { NeuralScoreGauge } from "@/components/NeuralScoreGauge";
import { AttentionCurve } from "@/components/AttentionCurve";
import dynamic from "next/dynamic";
const BrainMap3D = dynamic(
  () => import("@/components/BrainMap3D").then((m) => ({ default: m.BrainMap3D })),
  { ssr: false, loading: () => <div className="h-[380px] flex items-center justify-center"><div className="w-6 h-6 border-2 border-white/10 border-t-brand-400 rounded-full animate-spin" /></div> }
);
import { KeyMomentsTimeline } from "@/components/KeyMomentsTimeline";
import { EmotionalPanel } from "@/components/EmotionalPanel";
import { ModalityBreakdown } from "@/components/ModalityBreakdown";
import { MetricCard } from "@/components/MetricCard";
import { ImprovementStrategies } from "@/components/ImprovementStrategies";

export default function AnalyzePage() {
  const { jobId } = useParams<{ jobId: string }>();

  const [progress, setProgress] = useState<ProgressEvent | null>(null);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [metricsExpandAll, setMetricsExpandAll] = useState(false);
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());
  const [shareCopied, setShareCopied] = useState(false);
  const { session } = useAuth();
  const [loadingExisting, setLoadingExisting] = useState(true);

  // ── AI Feedback state ──────────────────────────────────────────────────
  const [aiFeedback, setAiFeedback] = useState<{
    summary: string;
    priorities: string[];
    metric_tips: Record<string, string>;
  } | null>(null);
  const [aiLoading, setAiLoading] = useState(false);

  // ── Playback state ─────────────────────────────────────────────────────
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackTime, setPlaybackTime] = useState(0);
  const [currentSecond, setCurrentSecond] = useState(0);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const rafRef = useRef<number>(0);
  const lastFrameRef = useRef<number>(0);
  const speedRef = useRef(1);
  const playbackTimeRef = useRef(0);
  const stoppedRef = useRef(false);

  useEffect(() => { speedRef.current = playbackSpeed; }, [playbackSpeed]);

  const handleCycleSpeed = useCallback(() => {
    setPlaybackSpeed((prev) => {
      const speeds = [1, 2, 3, 4];
      return speeds[(speeds.indexOf(prev) + 1) % speeds.length];
    });
  }, []);

  // Smooth rAF playback loop
  useEffect(() => {
    if (!isPlaying || !result) return;
    stoppedRef.current = false;
    lastFrameRef.current = performance.now();

    const tick = (now: number) => {
      if (stoppedRef.current) return;
      const dt = (now - lastFrameRef.current) / 1000;
      lastFrameRef.current = now;
      const prevTime = playbackTimeRef.current;
      const next = prevTime + dt * speedRef.current;

      if (next >= result.duration_seconds) {
        stoppedRef.current = true;
        playbackTimeRef.current = result.duration_seconds;
        setPlaybackTime(result.duration_seconds);
        setCurrentSecond(Math.floor(result.duration_seconds));
        setIsPlaying(false);
        return;
      }

      playbackTimeRef.current = next;
      setPlaybackTime(next);
      const nextInt = Math.floor(next);
      if (nextInt !== Math.floor(prevTime)) setCurrentSecond(nextInt);
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => { stoppedRef.current = true; cancelAnimationFrame(rafRef.current); };
  }, [isPlaying, result]);

  const handlePlay = useCallback(() => {
    if (!result) return;
    if (playbackTimeRef.current >= result.duration_seconds - 0.5) {
      playbackTimeRef.current = 0; setPlaybackTime(0); setCurrentSecond(0);
    }
    setIsPlaying(true);
  }, [result]);

  const handlePause = useCallback(() => { setIsPlaying(false); }, []);

  const handleSeek = useCallback((time: number) => {
    const t = Math.max(0, time);
    playbackTimeRef.current = t; setPlaybackTime(t); setCurrentSecond(Math.floor(t));
  }, []);

  const handleReset = useCallback(() => {
    setIsPlaying(false); playbackTimeRef.current = 0; setPlaybackTime(0); setCurrentSecond(0);
  }, []);

  // ── AI Feedback fetcher ──────────────────────────────────────────────
  useEffect(() => {
    if (!result || aiLoading || aiFeedback) return;
    setAiLoading(true);
    fetch("/api/generate-feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "analysis", data: result }),
    })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((data) => setAiFeedback(data))
      .catch((err) => console.warn("AI feedback unavailable:", err.message))
      .finally(() => setAiLoading(false));
  }, [result]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Data fetching ──────────────────────────────────────────────────────
  const saveToHistory = useCallback((data: AnalysisResult) => {
    addRunToHistory({
      jobId: data.job_id,
      url: data.url,
      contentType: data.content_type,
      neuralScore: data.neural_score.total,
      timestamp: Date.now(),
      durationSeconds: data.duration_seconds,
    }, session?.user?.email ?? undefined);
  }, [session]);

  const handleDone = useCallback(async () => {
    try {
      const data = await getResult(jobId);
      setResult(data);
      setLoadingExisting(false);
      saveToHistory(data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load results");
      setLoadingExisting(false);
    }
  }, [jobId, saveToHistory]);

  useEffect(() => {
    const disconnect = connectJobWebSocket(
      jobId,
      (event) => {
        setLoadingExisting(false); // we're in active computation mode
        setProgress(event);
        if (event.status === "complete") handleDone();
        if (event.status === "error") setError(event.message);
      },
      handleDone,
      (msg) => {
        // WebSocket error = likely an existing report, try direct fetch
        setError(null);
        handleDone();
      }
    );
    return disconnect;
  }, [jobId, handleDone]);

  // ── Export PDF (client-side generation) ─────────────────────────────────
  const handleExport = async () => {
    if (!result) return;
    setExporting(true);
    try {
      await generateReportPDF(result);
    } catch (e) {
      console.error("PDF export failed:", e);
    } finally {
      setExporting(false);
    }
  };

  const handleShare = useCallback(() => {
    const url = window.location.href;
    navigator.clipboard.writeText(url).then(() => {
      setShareCopied(true);
      setTimeout(() => setShareCopied(false), 2000);
    }).catch(() => { window.prompt("Copy this report link:", url); });
  }, []);

  // Determine loading state
  const isActiveComputation = progress !== null && progress.status !== "complete";
  const isLoadingReport = !result && !error && loadingExisting && !isActiveComputation;

  return (
    <div className="min-h-screen">
      {/* ── Nav ─────────────────────────────────────────────────────────────── */}
      <header className="border-b border-white/[0.06] px-6 py-4 sticky top-0 z-10 backdrop-blur-xl bg-[#07060b]/80">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3 group">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center shadow-lg shadow-brand-500/20 group-hover:shadow-brand-500/30 transition-shadow">
              <Brain className="w-4 h-4 text-white" />
            </div>
            <div className="flex items-center gap-2">
              <span className="font-[family-name:var(--font-display)] text-white font-semibold tracking-tight">
                NeuroPeer
              </span>
            </div>
          </Link>
          <div className="flex items-center gap-2">
            {result && (
              <>
                <Button variant="ghost" size="sm" onClick={handleShare}>
                  {shareCopied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Share2 className="w-3.5 h-3.5" />}
                  {shareCopied ? "Copied!" : "Share"}
                </Button>
                <Button variant="secondary" size="sm" onClick={handleExport} disabled={exporting}>
                  {exporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                  {exporting ? "Generating..." : "Export PDF"}
                </Button>
              </>
            )}
            <UserMenu />
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8">
        {error && (
          <div className="glass-card !border-red-500/20 px-5 py-4 text-red-400 text-sm mb-6 flex items-center gap-3">
            <div className="w-2 h-2 rounded-full bg-red-400 flex-shrink-0" />
            {error}
          </div>
        )}

        {/* ── Floating Progress Modal (over skeleton) ──────────────────── */}
        {(isActiveComputation || isLoadingReport) && (
          <div className="fixed inset-x-0 top-20 z-50 flex justify-center pointer-events-none">
            <div className="pointer-events-auto glass-card !bg-[#12101a]/95 backdrop-blur-xl p-5 rounded-2xl shadow-2xl shadow-black/40 border border-white/[0.08] max-w-md w-full mx-4 animate-fade-up">
              {isLoadingReport ? (
                <div className="flex items-center gap-3">
                  <Loader2 className="w-5 h-5 text-brand-400 animate-spin flex-shrink-0" />
                  <p className="text-sm text-white/60">Loading report...</p>
                </div>
              ) : (
                <ProgressTracker event={progress} />
              )}
            </div>
          </div>
        )}

        {/* ── Results Dashboard (shows skeleton when loading) ─────────────── */}
        {(result || isActiveComputation || isLoadingReport) && (
          <div className="flex flex-col gap-6">
            {/* Row 1: Neural Score + Video info */}
            <div className={`grid grid-cols-1 lg:grid-cols-3 gap-6 transition-all duration-700 ${result ? "animate-fade-up" : "opacity-60"}`}>
              <Card className="lg:col-span-1">
                <CardTitle>Neural Score</CardTitle>
                {result ? (
                  <NeuralScoreGauge breakdown={result.neural_score} />
                ) : (
                  <div className="flex items-center justify-center py-12">
                    <div className="w-28 h-28 rounded-full border-4 border-white/[0.06] animate-pulse flex items-center justify-center">
                      <div className="w-16 h-4 bg-white/[0.06] rounded animate-pulse" />
                    </div>
                  </div>
                )}
              </Card>

              <Card className="lg:col-span-2 flex flex-col justify-between">
                <div>
                  <CardTitle>Analyzed Content</CardTitle>
                  {result ? (
                    <>
                      <div className="flex items-center gap-2 mt-2 mb-1">
                        <p className="text-white/80 text-sm font-medium truncate">{result.url}</p>
                        <ExternalLink className="w-3 h-3 text-white/20 flex-shrink-0" />
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="default">{result.content_type.replace("_", " ")}</Badge>
                        <Badge variant="default">{result.duration_seconds.toFixed(0)}s</Badge>
                        <Badge variant="brand">{result.metrics.length} metrics</Badge>
                      </div>
                    </>
                  ) : (
                    <div className="mt-2 space-y-2">
                      <div className="w-3/4 h-4 bg-white/[0.06] rounded animate-pulse" />
                      <div className="flex gap-2">
                        <div className="w-20 h-5 bg-white/[0.04] rounded-full animate-pulse" />
                        <div className="w-12 h-5 bg-white/[0.04] rounded-full animate-pulse" />
                      </div>
                    </div>
                  )}
                </div>
                <div className="mt-5 space-y-2.5">
                  {result ? (
                    result.metrics
                      .sort((a, b) => Math.abs(b.score - 50) - Math.abs(a.score - 50))
                      .slice(0, 3)
                      .map((m) => (
                        <div key={m.name} className="flex items-center justify-between text-sm">
                          <span className="text-white/40">{m.name}</span>
                          <span className="font-semibold tabular-nums" style={{
                            color: m.score >= 70 ? "var(--color-score-green)" : m.score >= 45 ? "var(--color-score-amber)" : "var(--color-score-red)",
                          }}>{m.score.toFixed(0)}/100</span>
                        </div>
                      ))
                  ) : (
                    [1, 2, 3].map((i) => (
                      <div key={i} className="flex items-center justify-between">
                        <div className="w-24 h-3 bg-white/[0.04] rounded animate-pulse" />
                        <div className="w-12 h-3 bg-white/[0.04] rounded animate-pulse" />
                      </div>
                    ))
                  )}
                </div>
              </Card>
            </div>

            {/* Row 2: Attention Curve */}
            <Card className={`transition-all duration-700 ${result ? "animate-fade-up delay-100" : "opacity-50"}`}>
              {result ? (
                <AttentionCurve
                  attentionCurve={result.attention_curve}
                  emotionCurve={result.emotional_arousal_curve}
                  keyMoments={result.key_moments}
                  onScrub={handleSeek}
                  height={180}
                  isPlaying={isPlaying}
                  playbackTime={playbackTime}
                  playbackSpeed={playbackSpeed}
                  onPlay={handlePlay}
                  onPause={handlePause}
                  onReset={handleReset}
                  onCycleSpeed={handleCycleSpeed}
                />
              ) : (
                <div>
                  <CardTitle>Attention Curve</CardTitle>
                  <div className="h-[180px] flex items-end gap-[2px] px-4 pb-4 pt-8">
                    {Array.from({ length: 60 }).map((_, i) => (
                      <div key={i} className="flex-1 bg-white/[0.04] rounded-t animate-pulse" style={{ height: `${20 + Math.sin(i * 0.3) * 30 + 30}%`, animationDelay: `${i * 30}ms` }} />
                    ))}
                  </div>
                </div>
              )}
            </Card>

            {/* Row 3: Brain Map + Key Moments + Video */}
            <div className={`grid grid-cols-1 lg:grid-cols-2 gap-6 transition-all duration-700 ${result ? "animate-fade-up delay-200" : "opacity-50"}`}>
              <Card>
                <BrainMap3D jobId={jobId} currentSecond={currentSecond} isPlaying={isPlaying} playbackTime={playbackTime} />
              </Card>
              <Card>
                {result ? (
                  <KeyMomentsTimeline
                    moments={result.key_moments}
                    duration={result.duration_seconds}
                    currentSecond={currentSecond}
                    playbackTime={playbackTime}
                    isPlaying={isPlaying}
                    videoUrl={result.url}
                    playbackSpeed={playbackSpeed}
                    onSelect={handleSeek}
                    onPlay={handlePlay}
                    onPause={handlePause}
                    onCycleSpeed={handleCycleSpeed}
                  />
                ) : (
                  <div>
                    <CardTitle>Key Moments</CardTitle>
                    <div className="space-y-3 p-4">
                      {[1, 2, 3, 4].map((i) => (
                        <div key={i} className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-white/[0.04] animate-pulse" />
                          <div className="flex-1 space-y-1">
                            <div className="w-32 h-3 bg-white/[0.04] rounded animate-pulse" />
                            <div className="w-20 h-2 bg-white/[0.03] rounded animate-pulse" />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </Card>
            </div>

            {/* Row 4: Emotional + Modality (only when result is loaded) */}
            {result && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 animate-fade-up delay-300">
                <Card>
                  <EmotionalPanel arousaleCurve={result.emotional_arousal_curve} cognitiveCurve={result.cognitive_load_curve} currentSecond={currentSecond} height={120} />
                </Card>
                <Card>
                  <ModalityBreakdown breakdown={result.modality_breakdown} height={120} />
                </Card>
              </div>
            )}
            {!result && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 opacity-40">
                <Card><CardTitle>Emotional Panel</CardTitle><div className="h-[120px] animate-pulse bg-white/[0.02] rounded-lg m-4" /></Card>
                <Card><CardTitle>Modality Breakdown</CardTitle><div className="h-[120px] animate-pulse bg-white/[0.02] rounded-lg m-4" /></Card>
              </div>
            )}

            {/* Row 5: All metric cards */}
            {result && (
              <div className="animate-fade-up delay-400">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <BarChart3 className="w-4 h-4 text-brand-400" />
                    <h2 className="text-sm font-medium text-white/50 uppercase tracking-wider">All Metrics</h2>
                  </div>
                  <button
                    onClick={() => {
                      const next = !metricsExpandAll;
                      setMetricsExpandAll(next);
                      if (next) {
                        const allRows = new Set(result.metrics.map((_, i) => Math.floor(i / 3)));
                        setExpandedRows(allRows);
                      } else {
                        setExpandedRows(new Set());
                      }
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-white/40 hover:text-white/60 hover:bg-white/[0.04] transition-all"
                  >
                    {metricsExpandAll ? "Collapse all" : "Expand all"}
                    <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-300 ${metricsExpandAll ? "rotate-180" : ""}`} />
                  </button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {result.metrics.map((m, i) => {
                    const row = Math.floor(i / 3);
                    return (
                      <MetricCard
                        key={m.name}
                        metric={m}
                        expanded={expandedRows.has(row)}
                        onToggle={() => {
                          setExpandedRows((prev) => {
                            const next = new Set(prev);
                            if (next.has(row)) next.delete(row);
                            else next.add(row);
                            return next;
                          });
                        }}
                      />
                    );
                  })}
                </div>
              </div>
            )}
            {!result && (
              <div className="opacity-40">
                <div className="flex items-center gap-2 mb-4">
                  <BarChart3 className="w-4 h-4 text-white/20" />
                  <h2 className="text-sm font-medium text-white/30 uppercase tracking-wider">All Metrics</h2>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {Array.from({ length: 9 }).map((_, i) => (
                    <div key={i} className="glass-card p-4 animate-pulse">
                      <div className="w-20 h-3 bg-white/[0.04] rounded mb-3" />
                      <div className="w-12 h-6 bg-white/[0.04] rounded" />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Row 6: Improvement Strategies */}
            {result && (
              <div className="animate-fade-up delay-500">
                <div className="flex items-center gap-2 mb-4">
                  <Lightbulb className="w-4 h-4 text-brand-400" />
                  <h2 className="text-sm font-medium text-white/50 uppercase tracking-wider">Improvement Strategies</h2>
                </div>
                <ImprovementStrategies
                  metrics={result.metrics}
                  overarchingSummary={aiFeedback?.summary ?? result.overarching_summary}
                  aiPriorities={aiFeedback?.priorities}
                  aiMetricTips={aiFeedback?.metric_tips}
                  aiLoading={aiLoading}
                />
              </div>
            )}

            {/* A/B link */}
            {result && (
              <Card className="text-center !py-8 animate-fade-up delay-600">
                <p className="text-white/35 text-sm mb-4">Compare this content against another variant</p>
                <Link href={`/compare?jobs=${jobId}`}>
                  <Button variant="primary" size="md"><GitCompare className="w-4 h-4" /> Start A/B Comparison</Button>
                </Link>
              </Card>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
