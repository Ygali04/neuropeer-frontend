"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Brain, Zap, BarChart3, GitCompare, Activity, Sparkles, Clock, ExternalLink, Trash2, ArrowRight } from "lucide-react";
import { UrlInputCard } from "@/components/UrlInputCard";
import { UserMenu } from "@/components/UserMenu";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Badge } from "@/components/ui/badge";
import { submitAnalysis } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { getRunHistory, clearRunHistory, type RunHistoryEntry } from "@/lib/run-history";
import type { ContentType } from "@/lib/types";

const FEATURES = [
  { icon: Zap, label: "Hook Score", color: "text-brand-400", desc: "Measures NAcc approach vs. AIns avoidance in first 3s — predicts thumb-stop rate.", cite: "Tong et al. (2020) PNAS" },
  { icon: Activity, label: "Attention Curve", color: "text-teal-400", desc: "Tracks dorsal attention network activation over time — maps to viewer retention.", cite: "Hasson et al. (2004) Science" },
  { icon: Sparkles, label: "Emotional Resonance", color: "text-amber-400", desc: "Limbic and amygdala activation intensity — drives sharing and engagement.", cite: "Chan et al. (2024) JMR" },
  { icon: Brain, label: "Memory Encoding", color: "text-purple-400", desc: "Hippocampal formation activity — predicts brand recall and message retention.", cite: "Falk et al. (2012) Psych. Science" },
  { icon: BarChart3, label: "Modality Breakdown", color: "text-blue-400", desc: "Ablation analysis: visual vs. audio vs. text contribution to neural engagement.", cite: "d'Ascoli et al. (2026) Meta FAIR" },
  { icon: GitCompare, label: "A/B Comparison", color: "text-emerald-400", desc: "Side-by-side neural comparison of content variants with winner recommendation.", cite: "Genevsky et al. (2025) PNAS Nexus" },
];

const STATS = [
  { value: "20,484", label: "Cortical vertices", sublabel: "fMRI-grade resolution" },
  { value: "18", label: "GTM metrics", sublabel: "Neural-mapped KPIs" },
  { value: "1Hz", label: "Temporal resolution", sublabel: "Second-by-second" },
];

function scoreColor(score: number): string {
  if (score >= 75) return "var(--color-score-green)";
  if (score >= 50) return "var(--color-score-amber)";
  return "var(--color-score-red)";
}

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(ts).toLocaleDateString();
}

export default function HomePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState<RunHistoryEntry[]>([]);
  const { session } = useAuth();

  useEffect(() => {
    setHistory(getRunHistory(session?.user?.email ?? undefined));
  }, [session]);

  const handleSubmit = async (url: string, contentType: ContentType) => {
    setLoading(true);
    try {
      const { job_id } = await submitAnalysis(url, contentType);
      router.push(`/analyze/${job_id}`);
    } finally {
      setLoading(false);
    }
  };

  const handleCompare = () => router.push("/compare");

  const handleClearHistory = () => {
    clearRunHistory(session?.user?.email ?? undefined);
    setHistory([]);
  };

  return (
    <div className="min-h-screen flex flex-col">
      {/* ── Nav ─────────────────────────────────────────────────────────────── */}
      <header className="border-b border-white/[0.06] px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center shadow-lg shadow-brand-500/20">
              <Brain className="w-4 h-4 text-white" />
            </div>
            <div className="flex items-center gap-2">
              <span className="font-[family-name:var(--font-display)] text-white font-semibold text-lg tracking-tight">NeuroPeer</span>
            </div>
          </div>
          <div className="flex items-center gap-2 sm:gap-4">
            <Link href="/methodology" className="hidden sm:block text-sm text-white/40 hover:text-white/70 transition-colors">Methodology</Link>
            <Link href="/compare" className="hidden sm:block text-sm text-white/40 hover:text-white/70 transition-colors">A/B Compare</Link>
            <Badge variant="default" className="hidden sm:inline-flex">
              <span className="w-1.5 h-1.5 rounded-full bg-teal-400 animate-pulse" />
              TRIBE v2
            </Badge>
            <ThemeToggle />
            <UserMenu />
          </div>
        </div>
      </header>

      {/* ── Hero ────────────────────────────────────────────────────────────── */}
      <main className="flex-1 flex flex-col items-center justify-center px-4 sm:px-6 py-12 sm:py-20">
        <div className="absolute top-32 left-1/2 -translate-x-1/2 w-[90vw] sm:w-[600px] h-[300px] sm:h-[400px] rounded-full bg-gradient-to-b from-brand-500/[0.07] to-transparent blur-3xl pointer-events-none" />

        <div className="max-w-2xl w-full mx-auto text-center mb-14 relative">
          <div className="animate-fade-up">
            <Badge variant="brand" className="mb-8 px-4 py-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-brand-400 animate-[pulse-glow_2s_ease-in-out_infinite]" />
              Neural Simulation Engine · 20,484 Cortical Vertices
            </Badge>
          </div>

          <h1 className="font-[family-name:var(--font-display)] text-3xl sm:text-5xl lg:text-6xl font-bold text-white mb-6 leading-[1.1] tracking-tight animate-fade-up delay-100">
            Predict how brains
            <br />
            <span className="text-gradient-brand">respond to your content</span>
          </h1>

          <p className="text-white/40 text-lg leading-relaxed max-w-xl mx-auto animate-fade-up delay-200">
            Paste any video URL. Get fMRI-grade neural attention scores,
            emotional resonance, memory encoding potential, and brain activity
            maps — in minutes, not months.
          </p>
        </div>

        {/* ── Input Card ──────────────────────────────────────────────────── */}
        <div className="w-full max-w-2xl animate-fade-up delay-300 relative">
          <UrlInputCard onSubmit={handleSubmit} loading={loading} showCompareOption onCompare={handleCompare} />
        </div>

        {/* ── Disclaimer ────────────────────────────────────────────────── */}
        <div className="w-full max-w-2xl mt-6 animate-fade-up delay-350">
          <div className="flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-amber-500/[0.06] border border-amber-500/10">
            <Clock className="w-3.5 h-3.5 text-amber-400/60 flex-shrink-0" />
            <p className="text-[11px] text-amber-400/60">
              Full neural analysis takes ~7 minutes — includes GPU instance provisioning, TRIBE v2 inference (4 modality passes), and 20-metric computation.
            </p>
          </div>
        </div>

        {/* ── See an Example ──────────────────────────────────────────────── */}
        <div className="w-full max-w-2xl mt-14 animate-fade-up delay-400">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-1 h-4 rounded-full bg-gradient-to-b from-brand-400 to-brand-600" />
            <h2 className="font-[family-name:var(--font-display)] text-sm font-semibold text-white/60 uppercase tracking-wider">See an Example</h2>
          </div>
          <Link
            href="/analyze/b5c2b795-3db7-4454-af30-48e7c237d375"
            className="glass-card glass-card-hover p-5 flex items-center gap-5 group relative overflow-hidden"
          >
            <div className="absolute -top-10 -right-10 w-32 h-32 rounded-full bg-brand-500/10 blur-2xl group-hover:bg-brand-500/20 transition-all" />

            <div className="relative flex-shrink-0">
              <div className="w-16 h-16 rounded-full flex items-center justify-center bg-gradient-to-br from-amber-500/20 to-brand-500/20 border border-amber-500/30">
                <span className="font-[family-name:var(--font-display)] text-2xl font-bold text-amber-400">34.5</span>
              </div>
              <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-green-500/20 border border-green-500/40 flex items-center justify-center">
                <span className="text-[8px] text-green-400 font-bold">REAL</span>
              </div>
            </div>

            <div className="flex-1 min-w-0 relative">
              <div className="flex items-center gap-2 mb-1">
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-brand-500/10 border border-brand-500/20 text-brand-400">
                  TRIBE v2 Neural Analysis
                </span>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-500/10 border border-amber-500/20 text-amber-400">
                  A100 GPU
                </span>
              </div>
              <p className="text-sm text-white/70 font-medium truncate">BlackMirror - Instagram Reel</p>
              <p className="text-[11px] text-white/30 mt-0.5">
                64.9s · 20,484 vertices · 65 timesteps · Hook: 42.3 · Novelty: 22.8 · Re-engagement: 76.9
              </p>
            </div>

            <div className="flex-shrink-0 text-white/20 group-hover:text-brand-400 transition-colors">
              <ArrowRight className="w-4 h-4" />
            </div>
          </Link>
          <p className="text-center text-[10px] text-white/20 mt-2">
            Real fMRI-predicted cortical activations from Meta TRIBE v2 on DataCrunch A100
          </p>
        </div>

        {/* ── Feature Pills with hover modals ─────────────────────────────── */}
        <div className="flex flex-wrap justify-center gap-3 mt-12 animate-fade-up delay-400">
          {FEATURES.map(({ icon: Icon, label, color, desc, cite }) => (
            <div key={label} className="relative group">
              <div className="glass-card glass-card-hover !rounded-full flex items-center gap-2 px-4 py-2 cursor-default">
                <Icon className={`w-3.5 h-3.5 ${color}`} />
                <span className="text-xs text-white/50 font-medium">{label}</span>
              </div>
              {/* Hover modal */}
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 opacity-0 scale-95 pointer-events-none group-hover:opacity-100 group-hover:scale-100 group-hover:pointer-events-auto transition-all duration-200 z-50">
                <div className="glass-card !bg-[#15131a]/95 backdrop-blur-xl p-4 rounded-xl shadow-2xl shadow-black/40 border border-white/[0.08]">
                  <p className="text-xs text-white/60 leading-relaxed">{desc}</p>
                  <p className="text-[10px] text-white/25 mt-2 italic">{cite}</p>
                  <Link href="/methodology" className="inline-flex items-center gap-1 text-[10px] text-brand-400 hover:text-brand-300 mt-2 transition-colors">
                    Learn more <ArrowRight className="w-2.5 h-2.5" />
                  </Link>
                </div>
                <div className="w-2 h-2 bg-[#15131a] border-r border-b border-white/[0.08] rotate-45 mx-auto -mt-1" />
              </div>
            </div>
          ))}
        </div>

        {/* ── Stats ───────────────────────────────────────────────────────── */}
        <div className="mt-12 sm:mt-16 grid grid-cols-3 gap-4 sm:gap-10 max-w-lg w-full text-center animate-fade-up delay-500">
          {STATS.map(({ value, label, sublabel }) => (
            <div key={label} className="group">
              <div className="font-[family-name:var(--font-display)] text-xl sm:text-3xl font-bold text-white group-hover:text-gradient-brand transition-all">{value}</div>
              <div className="text-xs text-white/40 mt-1 font-medium">{label}</div>
              <div className="text-[10px] text-white/20 mt-0.5">{sublabel}</div>
            </div>
          ))}
        </div>

        {/* ── Past Runs (only for logged-in users) ─────────────────────── */}
        {session && history.length > 0 && (
          <div className="w-full max-w-2xl mt-20 animate-fade-up delay-600">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-brand-400" />
                <h2 className="text-sm font-medium text-white/50 uppercase tracking-wider">Recent Analyses</h2>
              </div>
              <button
                onClick={handleClearHistory}
                className="flex items-center gap-1.5 px-2 py-1 rounded-lg text-[10px] text-white/20 hover:text-red-400/60 hover:bg-red-500/[0.04] transition-all"
              >
                <Trash2 className="w-3 h-3" />
                Clear
              </button>
            </div>

            <div className="flex flex-col gap-2">
              {history.map((run) => (
                <Link
                  key={run.jobId}
                  href={`/analyze/${run.jobId}`}
                  className="glass-card glass-card-hover !p-4 !rounded-xl flex items-center gap-4 group"
                >
                  {/* Score circle */}
                  <div className="relative w-10 h-10 flex-shrink-0">
                    <svg width="40" height="40" style={{ transform: "rotate(-90deg)" }}>
                      <circle cx="20" cy="20" r="16" fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth="3" />
                      <circle
                        cx="20" cy="20" r="16"
                        fill="none"
                        stroke={scoreColor(run.neuralScore)}
                        strokeWidth="3"
                        strokeDasharray={2 * Math.PI * 16}
                        strokeDashoffset={2 * Math.PI * 16 * (1 - run.neuralScore / 100)}
                        strokeLinecap="round"
                      />
                    </svg>
                    <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold tabular-nums" style={{ color: scoreColor(run.neuralScore) }}>
                      {Math.round(run.neuralScore)}
                    </span>
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white/70 truncate group-hover:text-white/90 transition-colors">{run.url}</p>
                    <div className="flex items-center gap-3 mt-1">
                      <span className="text-[10px] text-white/25">{run.contentType.replace("_", " ")}</span>
                      <span className="text-[10px] text-white/25">{run.durationSeconds}s</span>
                      <span className="text-[10px] text-white/20">{timeAgo(run.timestamp)}</span>
                    </div>
                  </div>

                  {/* Arrow */}
                  <ExternalLink className="w-3.5 h-3.5 text-white/15 group-hover:text-brand-400 transition-colors flex-shrink-0" />
                </Link>
              ))}
            </div>
          </div>
        )}
      </main>

      {/* ── Footer ──────────────────────────────────────────────────────────── */}
      <footer className="border-t border-white/[0.04] px-6 py-5 text-center">
        <p className="text-xs text-white/20">
          TRIBE v2 is licensed CC BY-NC 4.0 · NeuroPeer
        </p>
      </footer>
    </div>
  );
}
