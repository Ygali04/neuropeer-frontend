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
  const [metricsExpanded, setMetricsExpanded] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);
  const { session } = useAuth();
  const [loadingExisting, setLoadingExisting] = useState(true); // for already-computed reports

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

        {/* Loading existing report (simple spinner, no pipeline steps) */}
        {isLoadingReport && (
          <div className="flex flex-col items-center justify-center py-32 gap-4">
            <Loader2 className="w-8 h-8 text-brand-400 animate-spin" />
            <p className="text-sm text-white/40">Loading report...</p>
          </div>
        )}

        {/* Active computation in progress (full pipeline tracker) */}
        {isActiveComputation && !result && (
          <div className="flex flex-col items-center justify-center py-24 gap-8">
            <div className="w-16 h-16 rounded-2xl bg-brand-500/10 border border-brand-500/20 flex items-center justify-center mb-4 animate-float">
              <Brain className="w-8 h-8 text-brand-400" />
            </div>
            <ProgressTracker event={progress} />
          </div>
        )}

        {/* ── Results Dashboard ───────────────────────────────────────────── */}
        {result && (
          <div className="flex flex-col gap-6">
            {/* Row 1: Neural Score + Video info */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-fade-up">
              <Card className="lg:col-span-1">
                <CardTitle>Neural Score</CardTitle>
                <NeuralScoreGauge breakdown={result.neural_score} />
              </Card>

              <Card className="lg:col-span-2 flex flex-col justify-between">
                <div>
                  <CardTitle>Analyzed Content</CardTitle>
                  <div className="flex items-center gap-2 mt-2 mb-1">
                    <p className="text-white/80 text-sm font-medium truncate">{result.url}</p>
                    <ExternalLink className="w-3 h-3 text-white/20 flex-shrink-0" />
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="default">{result.content_type.replace("_", " ")}</Badge>
                    <Badge variant="default">{result.duration_seconds.toFixed(0)}s</Badge>
                    <Badge variant="brand">{result.metrics.length} metrics</Badge>
                  </div>
                </div>
                <div className="mt-5 space-y-2.5">
                  {result.metrics
                    .sort((a, b) => Math.abs(b.score - 50) - Math.abs(a.score - 50))
                    .slice(0, 3)
                    .map((m) => (
                      <div key={m.name} className="flex items-center justify-between text-sm">
                        <span className="text-white/40">{m.name}</span>
                        <span className="font-semibold tabular-nums" style={{
                          color: m.score >= 70 ? "var(--color-score-green)" : m.score >= 45 ? "var(--color-score-amber)" : "var(--color-score-red)",
                        }}>{m.score.toFixed(0)}/100</span>
                      </div>
                    ))}
                </div>
              </Card>
            </div>

            {/* Row 2: Attention Curve */}
            <Card className="animate-fade-up delay-100">
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
            </Card>

            {/* Row 3: Brain Map + Key Moments + Video */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 animate-fade-up delay-200">
              <Card>
                <BrainMap3D jobId={jobId} currentSecond={currentSecond} isPlaying={isPlaying} playbackTime={playbackTime} />
              </Card>
              <Card>
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
              </Card>
            </div>

            {/* Row 4: Emotional + Modality */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 animate-fade-up delay-300">
              <Card>
                <EmotionalPanel arousaleCurve={result.emotional_arousal_curve} cognitiveCurve={result.cognitive_load_curve} currentSecond={currentSecond} height={120} />
              </Card>
              <Card>
                <ModalityBreakdown breakdown={result.modality_breakdown} height={120} />
              </Card>
            </div>

            {/* Row 5: All metric cards */}
            <div className="animate-fade-up delay-400">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-brand-400" />
                  <h2 className="text-sm font-medium text-white/50 uppercase tracking-wider">All Metrics</h2>
                </div>
                <button onClick={() => setMetricsExpanded((p) => !p)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-white/40 hover:text-white/60 hover:bg-white/[0.04] transition-all">
                  {metricsExpanded ? "Collapse all" : "Expand all"}
                  <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-300 ${metricsExpanded ? "rotate-180" : ""}`} />
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {result.metrics.map((m) => <MetricCard key={m.name} metric={m} expanded={metricsExpanded} />)}
              </div>
            </div>

            {/* Row 6: Improvement Strategies */}
            <div className="animate-fade-up delay-500">
              <div className="flex items-center gap-2 mb-4">
                <Lightbulb className="w-4 h-4 text-brand-400" />
                <h2 className="text-sm font-medium text-white/50 uppercase tracking-wider">Improvement Strategies</h2>
              </div>
              <ImprovementStrategies metrics={result.metrics} overarchingSummary={result.overarching_summary} />
            </div>

            {/* A/B link */}
            <Card className="text-center !py-8 animate-fade-up delay-600">
              <p className="text-white/35 text-sm mb-4">Compare this content against another variant</p>
              <Link href={`/compare?jobs=${jobId}`}>
                <Button variant="primary" size="md"><GitCompare className="w-4 h-4" /> Start A/B Comparison</Button>
              </Link>
            </Card>
          </div>
        )}
      </main>
    </div>
  );
}
