"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Brain, BarChart3, TrendingUp, Clock, Zap, ArrowRight, Trash2,
  Filter, RotateCcw, Check, Square, CheckSquare, GitCompare, X,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { getRunHistory, clearRunHistory, deleteRunsFromHistory, type RunHistoryEntry } from "@/lib/run-history";
import { submitAnalysis } from "@/lib/api";
import { UserMenu } from "@/components/UserMenu";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { ContentType } from "@/lib/types";

function timeAgo(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function scoreColor(score: number): string {
  if (score >= 75) return "text-green-400";
  if (score >= 50) return "text-amber-400";
  return "text-red-400";
}

function scoreBg(score: number): string {
  if (score >= 75) return "from-green-500/20 to-green-500/5 border-green-500/30";
  if (score >= 50) return "from-amber-500/20 to-amber-500/5 border-amber-500/30";
  return "from-red-500/20 to-red-500/5 border-red-500/30";
}

type SortKey = "date" | "score" | "duration";

export default function DashboardPage() {
  const router = useRouter();
  const { session, status } = useAuth();
  const [history, setHistory] = useState<RunHistoryEntry[]>([]);
  const [sortBy, setSortBy] = useState<SortKey>("date");
  const [filterType, setFilterType] = useState<string>("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [rerunning, setRerunning] = useState<string | null>(null);

  const email = session?.user?.email ?? undefined;

  useEffect(() => {
    if (status === "authenticated" && email) {
      setHistory(getRunHistory(email));
    }
  }, [status, email]);

  const contentTypes = useMemo(() => {
    const types = new Set(history.map((h) => h.contentType));
    return ["all", ...Array.from(types)];
  }, [history]);

  const sorted = useMemo(() => {
    let items = [...history];
    if (filterType !== "all") items = items.filter((h) => h.contentType === filterType);
    if (sortBy === "date") items.sort((a, b) => b.timestamp - a.timestamp);
    if (sortBy === "score") items.sort((a, b) => b.neuralScore - a.neuralScore);
    if (sortBy === "duration") items.sort((a, b) => b.durationSeconds - a.durationSeconds);
    return items;
  }, [history, sortBy, filterType]);

  const stats = useMemo(() => {
    if (history.length === 0) return null;
    const scores = history.map((h) => h.neuralScore);
    return {
      total: history.length,
      avgScore: Math.round(scores.reduce((a, b) => a + b, 0) / scores.length),
      bestScore: Math.round(Math.max(...scores)),
      totalDuration: Math.round(history.reduce((a, h) => a + h.durationSeconds, 0)),
    };
  }, [history]);

  // ── Selection ──────────────────────────────────────────────────────────
  const toggleSelect = (jobId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(jobId)) next.delete(jobId);
      else next.add(jobId);
      return next;
    });
  };

  const selectAll = () => {
    if (selected.size === sorted.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(sorted.map((r) => r.jobId)));
    }
  };

  const clearSelection = () => setSelected(new Set());

  // ── Delete ─────────────────────────────────────────────────────────────
  const handleDeleteSelected = () => {
    if (selected.size === 0) return;
    const count = selected.size;
    if (!confirm(`Delete ${count} report${count > 1 ? "s" : ""}? This cannot be undone.`)) return;
    deleteRunsFromHistory([...selected], email);
    setHistory(getRunHistory(email));
    setSelected(new Set());
  };

  const handleDeleteOne = (jobId: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm("Delete this report?")) return;
    deleteRunsFromHistory([jobId], email);
    setHistory(getRunHistory(email));
    setSelected((prev) => { const n = new Set(prev); n.delete(jobId); return n; });
  };

  const handleClearAll = () => {
    if (!confirm("Clear ALL run history? This cannot be undone.")) return;
    clearRunHistory(email);
    setHistory([]);
    setSelected(new Set());
  };

  // ── Rerun ──────────────────────────────────────────────────────────────
  const handleRerun = async (run: RunHistoryEntry, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setRerunning(run.jobId);
    try {
      const { job_id } = await submitAnalysis(run.url, run.contentType as ContentType);
      router.push(`/analyze/${job_id}`);
    } catch {
      setRerunning(null);
    }
  };

  // ── Compare selected ───────────────────────────────────────────────────
  const handleCompareSelected = () => {
    if (selected.size < 2) return;
    const ids = [...selected].slice(0, 5);
    router.push(`/compare?jobs=${ids.join(",")}`);
  };

  if (status === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-white/10 border-t-brand-400 rounded-full animate-spin" />
      </div>
    );
  }

  const hasSelection = selected.size > 0;

  return (
    <div className="min-h-screen">
      <header className="nav-backdrop border-b border-white/[0.06] px-4 sm:px-6 py-3 sm:py-4 sticky top-0 z-10 backdrop-blur-xl bg-[#07060b]/80">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 sm:gap-3 group">
            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center shadow-lg shadow-brand-500/20">
              <Brain className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-white" />
            </div>
            <span className="font-[family-name:var(--font-display)] text-white font-semibold text-sm sm:text-lg">NeuroPeer</span>
          </Link>
          <div className="flex items-center gap-2 sm:gap-4">
            <Link href="/" className="hidden sm:block text-sm text-white/40 hover:text-white/70 transition-colors">New Analysis</Link>
            <Link href="/compare" className="hidden sm:block text-sm text-white/40 hover:text-white/70 transition-colors">Compare</Link>
            <ThemeToggle />
            <UserMenu />
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
        {/* Profile header */}
        <div className="flex items-center gap-3 sm:gap-4 mb-8 sm:mb-10">
          {session?.user?.image ? (
            <img src={session.user.image} alt="" className="w-12 h-12 sm:w-14 sm:h-14 rounded-full border-2 border-white/10" />
          ) : (
            <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center text-white text-lg sm:text-xl font-bold">
              {(session?.user?.name ?? "U")[0]}
            </div>
          )}
          <div>
            <h1 className="font-[family-name:var(--font-display)] text-xl sm:text-2xl font-bold text-white">
              {session?.user?.name ?? "Dashboard"}
            </h1>
            <p className="text-xs sm:text-sm text-white/40">{session?.user?.email}</p>
          </div>
        </div>

        {/* Stats row */}
        {stats && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 mb-8 sm:mb-10">
            {[
              { icon: BarChart3, label: "Total Analyses", value: stats.total, color: "text-brand-400" },
              { icon: TrendingUp, label: "Avg Score", value: stats.avgScore, color: "text-amber-400" },
              { icon: Zap, label: "Best Score", value: stats.bestScore, color: "text-green-400" },
              { icon: Clock, label: "Total Duration", value: `${Math.round(stats.totalDuration / 60)}m`, color: "text-teal-400" },
            ].map(({ icon: Icon, label, value, color }) => (
              <Card key={label} className="glass-card p-3 sm:p-4">
                <div className="flex items-center gap-1.5 sm:gap-2 mb-1 sm:mb-2">
                  <Icon className={`w-3.5 h-3.5 sm:w-4 sm:h-4 ${color}`} />
                  <span className="text-[10px] sm:text-xs text-white/40 font-medium">{label}</span>
                </div>
                <div className="font-[family-name:var(--font-display)] text-xl sm:text-2xl font-bold text-white">{value}</div>
              </Card>
            ))}
          </div>
        )}

        {/* ── Bulk action bar (when items selected) ──────────────────────── */}
        {hasSelection && (
          <div className="sticky top-14 sm:top-16 z-20 mb-4 animate-fade-up">
            <div className="tooltip-card flex flex-wrap items-center gap-2 sm:gap-3 px-3 sm:px-4 py-2.5 rounded-xl shadow-xl border border-brand-500/20">
              <span className="text-xs text-white/60 font-medium">
                {selected.size} selected
              </span>
              <div className="flex items-center gap-1.5">
                <Button variant="danger" size="sm" onClick={handleDeleteSelected}>
                  <Trash2 className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Delete</span>
                </Button>
                {selected.size >= 2 && (
                  <Button variant="secondary" size="sm" onClick={handleCompareSelected}>
                    <GitCompare className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Compare</span>
                  </Button>
                )}
                <button onClick={clearSelection} className="p-1.5 rounded-lg hover:bg-white/[0.06] text-white/30 hover:text-white/60 transition-colors">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4 sm:mb-6">
          <h2 className="font-[family-name:var(--font-display)] text-base sm:text-lg font-semibold text-white">Past Reports</h2>
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            {sorted.length > 0 && (
              <button
                onClick={selectAll}
                className="flex items-center gap-1.5 px-2 py-1 rounded-lg text-[10px] sm:text-xs text-white/30 hover:text-white/60 hover:bg-white/[0.04] transition-all"
              >
                {selected.size === sorted.length ? <CheckSquare className="w-3.5 h-3.5" /> : <Square className="w-3.5 h-3.5" />}
                <span className="hidden sm:inline">{selected.size === sorted.length ? "Deselect all" : "Select all"}</span>
              </button>
            )}
            <div className="flex items-center gap-1">
              <Filter className="w-3 h-3 text-white/30" />
              <select
                value={filterType}
                onChange={(e) => setFilterType(e.target.value)}
                className="bg-white/[0.04] border border-white/[0.08] rounded-lg px-2 py-1 text-[10px] sm:text-xs text-white/60 focus:outline-none focus:ring-1 focus:ring-brand-500/30"
              >
                {contentTypes.map((t) => (
                  <option key={t} value={t}>{t === "all" ? "All types" : t.replace("_", " ")}</option>
                ))}
              </select>
            </div>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortKey)}
              className="bg-white/[0.04] border border-white/[0.08] rounded-lg px-2 py-1 text-[10px] sm:text-xs text-white/60 focus:outline-none focus:ring-1 focus:ring-brand-500/30"
            >
              <option value="date">Newest first</option>
              <option value="score">Highest score</option>
              <option value="duration">Longest</option>
            </select>
            {history.length > 0 && (
              <button onClick={handleClearAll} className="p-1.5 rounded-lg hover:bg-red-500/10 text-white/20 hover:text-red-400 transition-colors" title="Clear all history">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Report list */}
        {sorted.length === 0 ? (
          <div className="glass-card p-8 sm:p-12 text-center">
            <Brain className="w-10 h-10 text-white/10 mx-auto mb-4" />
            <p className="text-white/30 text-sm mb-4">No analyses yet</p>
            <Link href="/">
              <Button variant="primary" size="sm">Run your first analysis</Button>
            </Link>
          </div>
        ) : (
          <div className="space-y-2 sm:space-y-3">
            {sorted.map((run, i) => {
              const isSelected = selected.has(run.jobId);
              const isRerunning = rerunning === run.jobId;
              return (
                <div
                  key={`${run.jobId}-${i}`}
                  className={cn(
                    "glass-card glass-card-hover flex items-center gap-3 sm:gap-4 group animate-fade-up",
                    "p-3 sm:p-4",
                    isSelected && "!border-brand-500/30 bg-brand-500/[0.04]"
                  )}
                  style={{ animationDelay: `${i * 40}ms` }}
                >
                  {/* Checkbox */}
                  <button
                    onClick={(e) => { e.preventDefault(); toggleSelect(run.jobId); }}
                    className={cn(
                      "flex-shrink-0 w-5 h-5 rounded border flex items-center justify-center transition-colors",
                      isSelected
                        ? "bg-brand-500/20 border-brand-500/50 text-brand-400"
                        : "border-white/[0.1] text-transparent hover:border-white/[0.2] hover:text-white/20"
                    )}
                  >
                    <Check className="w-3 h-3" />
                  </button>

                  {/* Score */}
                  <Link href={`/analyze/${run.jobId}`} className="flex items-center gap-3 sm:gap-4 flex-1 min-w-0">
                    <div className={`w-10 h-10 sm:w-12 sm:h-12 rounded-full flex items-center justify-center bg-gradient-to-br border flex-shrink-0 ${scoreBg(run.neuralScore)}`}>
                      <span className={`font-[family-name:var(--font-display)] text-base sm:text-lg font-bold ${scoreColor(run.neuralScore)}`}>
                        {Math.round(run.neuralScore)}
                      </span>
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <p className="text-xs sm:text-sm text-white/70 font-medium truncate">{run.url}</p>
                      <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 mt-1">
                        <Badge variant="default" className="text-[9px] sm:text-[10px]">{run.contentType.replace("_", " ")}</Badge>
                        <span className="text-[9px] sm:text-[10px] text-white/25">{Math.round(run.durationSeconds)}s</span>
                        <span className="text-[9px] sm:text-[10px] text-white/25">{timeAgo(run.timestamp)}</span>
                      </div>
                    </div>
                  </Link>

                  {/* Actions */}
                  <div className="flex items-center gap-1 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={(e) => handleRerun(run, e)}
                      disabled={isRerunning}
                      className="p-1.5 rounded-lg hover:bg-brand-500/10 text-white/20 hover:text-brand-400 transition-colors disabled:opacity-30"
                      title="Re-run analysis"
                    >
                      <RotateCcw className={cn("w-3.5 h-3.5", isRerunning && "animate-spin")} />
                    </button>
                    <button
                      onClick={(e) => handleDeleteOne(run.jobId, e)}
                      className="p-1.5 rounded-lg hover:bg-red-500/10 text-white/20 hover:text-red-400 transition-colors"
                      title="Delete report"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* Mobile: always-visible arrow */}
                  <Link href={`/analyze/${run.jobId}`} className="sm:hidden flex-shrink-0">
                    <ArrowRight className="w-4 h-4 text-white/10" />
                  </Link>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
