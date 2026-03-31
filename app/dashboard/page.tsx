"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { Brain, BarChart3, TrendingUp, Clock, Zap, ArrowRight, Trash2, Filter } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { getRunHistory, clearRunHistory, type RunHistoryEntry } from "@/lib/run-history";
import { UserMenu } from "@/components/UserMenu";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

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
  const { session, status } = useAuth();
  const [history, setHistory] = useState<RunHistoryEntry[]>([]);
  const [sortBy, setSortBy] = useState<SortKey>("date");
  const [filterType, setFilterType] = useState<string>("all");

  useEffect(() => {
    if (status === "authenticated" && session?.user?.email) {
      setHistory(getRunHistory(session.user.email));
    }
  }, [status, session]);

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

  const handleClear = () => {
    if (!session?.user?.email) return;
    if (confirm("Clear all run history? This cannot be undone.")) {
      clearRunHistory(session.user.email);
      setHistory([]);
    }
  };

  if (status === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-white/10 border-t-brand-400 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <header className="border-b border-white/[0.06] px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3 group">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center shadow-lg shadow-brand-500/20">
              <Brain className="w-4 h-4 text-white" />
            </div>
            <span className="font-[family-name:var(--font-display)] text-white font-semibold text-lg">NeuroPeer</span>
          </Link>
          <div className="flex items-center gap-4">
            <Link href="/" className="text-sm text-white/40 hover:text-white/70 transition-colors">New Analysis</Link>
            <Link href="/compare" className="text-sm text-white/40 hover:text-white/70 transition-colors">Compare</Link>
            <UserMenu />
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-10">
        {/* Profile header */}
        <div className="flex items-center gap-4 mb-10">
          {session?.user?.image ? (
            <img src={session.user.image} alt="" className="w-14 h-14 rounded-full border-2 border-white/10" />
          ) : (
            <div className="w-14 h-14 rounded-full bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center text-white text-xl font-bold">
              {(session?.user?.name ?? "U")[0]}
            </div>
          )}
          <div>
            <h1 className="font-[family-name:var(--font-display)] text-2xl font-bold text-white">
              {session?.user?.name ?? "Dashboard"}
            </h1>
            <p className="text-sm text-white/40">{session?.user?.email}</p>
          </div>
        </div>

        {/* Stats row */}
        {stats && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-10">
            {[
              { icon: BarChart3, label: "Total Analyses", value: stats.total, color: "text-brand-400" },
              { icon: TrendingUp, label: "Avg Score", value: stats.avgScore, color: "text-amber-400" },
              { icon: Zap, label: "Best Score", value: stats.bestScore, color: "text-green-400" },
              { icon: Clock, label: "Total Duration", value: `${Math.round(stats.totalDuration / 60)}m`, color: "text-teal-400" },
            ].map(({ icon: Icon, label, value, color }) => (
              <Card key={label} className="glass-card p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Icon className={`w-4 h-4 ${color}`} />
                  <span className="text-xs text-white/40 font-medium">{label}</span>
                </div>
                <div className="font-[family-name:var(--font-display)] text-2xl font-bold text-white">{value}</div>
              </Card>
            ))}
          </div>
        )}

        {/* Toolbar */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold text-white">Past Reports</h2>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1">
              <Filter className="w-3 h-3 text-white/30" />
              <select
                value={filterType}
                onChange={(e) => setFilterType(e.target.value)}
                className="bg-white/[0.04] border border-white/[0.08] rounded-lg px-2 py-1 text-xs text-white/60 focus:outline-none focus:ring-1 focus:ring-brand-500/30"
              >
                {contentTypes.map((t) => (
                  <option key={t} value={t}>{t === "all" ? "All types" : t.replace("_", " ")}</option>
                ))}
              </select>
            </div>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortKey)}
              className="bg-white/[0.04] border border-white/[0.08] rounded-lg px-2 py-1 text-xs text-white/60 focus:outline-none focus:ring-1 focus:ring-brand-500/30"
            >
              <option value="date">Newest first</option>
              <option value="score">Highest score</option>
              <option value="duration">Longest</option>
            </select>
            {history.length > 0 && (
              <button onClick={handleClear} className="p-1.5 rounded-lg hover:bg-red-500/10 text-white/20 hover:text-red-400 transition-colors" title="Clear history">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Report list */}
        {sorted.length === 0 ? (
          <div className="glass-card p-12 text-center">
            <Brain className="w-10 h-10 text-white/10 mx-auto mb-4" />
            <p className="text-white/30 text-sm mb-4">No analyses yet</p>
            <Link href="/">
              <Button variant="primary" size="sm">Run your first analysis</Button>
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {sorted.map((run, i) => (
              <Link
                key={`${run.jobId}-${i}`}
                href={`/analyze/${run.jobId}`}
                className="glass-card glass-card-hover p-4 flex items-center gap-4 group animate-fade-up"
                style={{ animationDelay: `${i * 50}ms` }}
              >
                {/* Score */}
                <div className={`w-12 h-12 rounded-full flex items-center justify-center bg-gradient-to-br border flex-shrink-0 ${scoreBg(run.neuralScore)}`}>
                  <span className={`font-[family-name:var(--font-display)] text-lg font-bold ${scoreColor(run.neuralScore)}`}>
                    {Math.round(run.neuralScore)}
                  </span>
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white/70 font-medium truncate">{run.url}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <Badge variant="default" className="text-[10px]">{run.contentType.replace("_", " ")}</Badge>
                    <span className="text-[10px] text-white/25">{Math.round(run.durationSeconds)}s</span>
                    <span className="text-[10px] text-white/25">·</span>
                    <span className="text-[10px] text-white/25">{timeAgo(run.timestamp)}</span>
                  </div>
                </div>

                {/* Arrow */}
                <ArrowRight className="w-4 h-4 text-white/10 group-hover:text-brand-400 transition-colors flex-shrink-0" />
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
