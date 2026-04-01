"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { Brain, Trash2, CheckSquare, Square, X, Merge, Loader2, FolderPlus } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { getProfile, getCampaigns, getAllReports, bulkDeleteCampaigns, mergeCampaigns } from "@/lib/api";
import { MarketerProfileCard } from "@/components/MarketerProfileCard";
import { ScoreTimeline } from "@/components/ScoreTimeline";
import { CampaignCard } from "@/components/CampaignCard";
import { UserMenu } from "@/components/UserMenu";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Button } from "@/components/ui/button";
import type { MarketerProfile, CampaignSummary } from "@/lib/types";

type SortKey = "date" | "score" | "delta";

interface ReportPoint {
  job_id: string; url: string; content_type: string; score: number;
  campaign_name: string | null; content_group_id: string; created_at: string;
}

const DEFAULT_PROFILE: MarketerProfile = {
  user_email: "", overall_score: 0, total_analyses: 0,
  ai_summary: null, ai_strengths: [], ai_weaknesses: [], ai_trends: [],
  last_refreshed_at: null,
};

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "https://neuropeer-api-production.up.railway.app";

export default function DashboardPage() {
  const { session, status } = useAuth();
  const [profile, setProfile] = useState<MarketerProfile>(DEFAULT_PROFILE);
  const [campaigns, setCampaigns] = useState<CampaignSummary[]>([]);
  const [allReports, setAllReports] = useState<ReportPoint[]>([]);
  const [sortBy, setSortBy] = useState<SortKey>("date");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);
  const [merging, setMerging] = useState(false);
  const [showMergeModal, setShowMergeModal] = useState(false);
  const [mergeName, setMergeName] = useState("");
  const [draggedReport, setDraggedReport] = useState<string | null>(null);

  const email = session?.user?.email;

  useEffect(() => {
    const name = session?.user?.name?.split(" ")[0] ?? "Dashboard";
    document.title = `${name}'s Dashboard — NeuroPeer`;
  }, [session]);

  useEffect(() => {
    if (!email) return;
    getProfile(email).then(setProfile);
    getCampaigns(email).then(setCampaigns);
    getAllReports(email).then(setAllReports);
  }, [email]);

  // ── Computed stats (client-side, instant) ────────────────────────────────
  const computedOverallScore = useMemo(() => {
    if (allReports.length === 0) return 0;
    return allReports.reduce((s, r) => s + r.score, 0) / allReports.length;
  }, [allReports]);

  const profileWithComputed = useMemo(() => ({
    ...profile,
    overall_score: computedOverallScore,
    total_analyses: allReports.length,
  }), [profile, computedOverallScore, allReports.length]);

  // ── Uncategorized reports (not in any campaign) ──────────────────────────
  const campaignGroupIds = useMemo(() => new Set(campaigns.map((c) => c.content_group_id)), [campaigns]);
  const uncategorized = useMemo(() => {
    // Reports whose content_group_id has only 1 report (solo, not in a named campaign)
    const groupCounts = new Map<string, number>();
    allReports.forEach((r) => {
      groupCounts.set(r.content_group_id, (groupCounts.get(r.content_group_id) ?? 0) + 1);
    });
    return allReports.filter((r) => !r.campaign_name && groupCounts.get(r.content_group_id) === 1);
  }, [allReports]);

  const sortedCampaigns = useMemo(() => {
    const items = [...campaigns];
    if (sortBy === "date") items.sort((a, b) => new Date(b.latest_at).getTime() - new Date(a.latest_at).getTime());
    if (sortBy === "score") items.sort((a, b) => b.latest_score - a.latest_score);
    if (sortBy === "delta") items.sort((a, b) => b.delta - a.delta);
    return items;
  }, [campaigns, sortBy]);

  const handleRename = (id: string, name: string) => {
    setCampaigns((prev) => prev.map((c) => c.content_group_id === id ? { ...c, campaign_name: name } : c));
  };

  const toggleSelect = (id: string) => {
    setSelected((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  };

  const selectAll = () => {
    if (selected.size === sortedCampaigns.length) setSelected(new Set());
    else setSelected(new Set(sortedCampaigns.map((c) => c.content_group_id)));
  };

  // ── Delete: optimistic UI first, then server ─────────────────────────────
  const handleBulkDelete = async () => {
    if (selected.size === 0) return;
    if (!confirm(`Delete ${selected.size} campaign${selected.size > 1 ? "s" : ""}? This removes all associated reports and cannot be undone.`)) return;

    const deletedIds = new Set(selected);

    // Optimistic: remove from UI immediately
    setCampaigns((prev) => prev.filter((c) => !deletedIds.has(c.content_group_id)));
    setAllReports((prev) => prev.filter((r) => !deletedIds.has(r.content_group_id)));
    setSelected(new Set());

    // Then persist to server
    setDeleting(true);
    try {
      await bulkDeleteCampaigns([...deletedIds]);
    } catch {
      // On failure, refetch to restore correct state
      if (email) {
        getCampaigns(email).then(setCampaigns);
        getAllReports(email).then(setAllReports);
      }
    } finally {
      setDeleting(false);
    }
  };

  // ── Merge ────────────────────────────────────────────────────────────────
  const handleMerge = async () => {
    if (selected.size < 2) return;
    setMerging(true);
    try {
      await mergeCampaigns([...selected], mergeName || undefined);
      if (email) {
        const [updatedCampaigns, updatedReports] = await Promise.all([getCampaigns(email), getAllReports(email)]);
        setCampaigns(updatedCampaigns);
        setAllReports(updatedReports);
      }
      setSelected(new Set());
      setShowMergeModal(false);
      setMergeName("");
    } catch {} finally { setMerging(false); }
  };

  // ── Drag & drop: move report into a campaign ─────────────────────────────
  const handleDropOnCampaign = async (reportJobId: string, targetGroupId: string) => {
    // Optimistic: update locally
    setAllReports((prev) => prev.map((r) => r.job_id === reportJobId ? { ...r, content_group_id: targetGroupId, campaign_name: campaigns.find((c) => c.content_group_id === targetGroupId)?.campaign_name ?? null } : r));

    // Update campaign media counts
    setCampaigns((prev) => prev.map((c) => {
      if (c.content_group_id === targetGroupId) return { ...c, media_count: c.media_count + 1 };
      return c;
    }));

    // Persist to server
    try {
      await fetch(`${API_BASE}/api/v1/campaigns/move-report`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ job_id: reportJobId, target_group_id: targetGroupId }),
      });
    } catch {
      // Refetch on failure
      if (email) {
        getCampaigns(email).then(setCampaigns);
        getAllReports(email).then(setAllReports);
      }
    }
  };

  const isSelecting = selected.size > 0;

  if (status === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-white/10 border-t-brand-400 rounded-full animate-spin" />
      </div>
    );
  }

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

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-10 space-y-6 sm:space-y-8">
        {/* Profile — uses computed average score */}
        <MarketerProfileCard profile={profileWithComputed} campaigns={sortedCampaigns} />

        {/* Score Timeline — pass reports directly */}
        <ScoreTimeline campaigns={sortedCampaigns} overallScore={computedOverallScore} reports={allReports} />

        {/* ── Uncategorized Videos ───────────────────────────────────────── */}
        {uncategorized.length > 0 && (
          <section>
            <div className="flex items-center gap-2 mb-3">
              <FolderPlus className="w-4 h-4 text-white/30" />
              <h2 className="text-sm font-medium text-white/40 uppercase tracking-wider">Uncategorized Videos</h2>
              <span className="text-[10px] text-white/20">{uncategorized.length}</span>
            </div>
            <p className="text-xs text-white/25 mb-3">Drag a video onto a campaign below to add it.</p>
            <div className="flex flex-wrap gap-2">
              {uncategorized.map((r) => {
                const scoreColor = r.score >= 75 ? "var(--color-score-green)" : r.score >= 50 ? "var(--color-score-amber)" : "var(--color-score-red)";
                return (
                  <div
                    key={r.job_id}
                    draggable
                    onDragStart={() => setDraggedReport(r.job_id)}
                    onDragEnd={() => setDraggedReport(null)}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/[0.03] border border-white/[0.06] cursor-grab active:cursor-grabbing hover:border-white/[0.12] transition-all"
                  >
                    <span className="text-[11px] font-bold tabular-nums" style={{ color: scoreColor }}>{r.score.toFixed(1)}</span>
                    <Link href={`/analyze/${r.job_id}`} className="text-xs text-white/50 hover:text-white/70 truncate max-w-[200px]">
                      {r.url.replace(/https?:\/\/(www\.)?/, "").slice(0, 35)}
                    </Link>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* ── Campaigns ──────────────────────────────────────────────────── */}
        <section>
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <h2 className="font-[family-name:var(--font-display)] text-base sm:text-lg font-semibold text-white">Campaigns</h2>
            <div className="flex flex-wrap items-center gap-2">
              {sortedCampaigns.length > 0 && (
                <button onClick={selectAll} className="flex items-center gap-1.5 px-2 py-1 rounded-lg text-[10px] sm:text-xs text-white/30 hover:text-white/60 hover:bg-white/[0.04] transition-all">
                  {selected.size === sortedCampaigns.length ? <CheckSquare className="w-3.5 h-3.5" /> : <Square className="w-3.5 h-3.5" />}
                  <span className="hidden sm:inline">{selected.size === sortedCampaigns.length ? "Deselect" : "Select all"}</span>
                </button>
              )}
              {isSelecting && (
                <>
                  <span className="text-[10px] text-white/30">{selected.size} selected</span>
                  {selected.size >= 2 && (
                    <Button variant="secondary" size="sm" onClick={() => { setMergeName(""); setShowMergeModal(true); }}>
                      <Merge className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">Combine</span>
                    </Button>
                  )}
                  <Button variant="outline" size="sm" onClick={handleBulkDelete} disabled={deleting}
                    className="!border-red-500/30 !text-red-400 hover:!bg-red-500/10">
                    <Trash2 className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Delete</span>
                  </Button>
                  <button onClick={() => setSelected(new Set())} className="p-1 text-white/30 hover:text-white/50">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </>
              )}
              <select value={sortBy} onChange={(e) => setSortBy(e.target.value as SortKey)}
                className="bg-white/[0.04] border border-white/[0.08] rounded-lg px-2 py-1 text-[10px] sm:text-xs text-white/60 focus:outline-none focus:ring-1 focus:ring-brand-500/30">
                <option value="date">Newest first</option>
                <option value="score">Highest score</option>
                <option value="delta">Most improved</option>
              </select>
            </div>
          </div>

          {sortedCampaigns.length === 0 && uncategorized.length === 0 ? (
            <div className="glass-card p-8 sm:p-12 text-center">
              <Brain className="w-10 h-10 text-white/10 mx-auto mb-4" />
              <p className="text-white/30 text-sm mb-4">Run your first analysis to start building your marketer profile</p>
              <Link href="/"><Button variant="primary" size="sm">Start your first analysis</Button></Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
              {sortedCampaigns.map((campaign) => (
                <div
                  key={campaign.content_group_id}
                  className="relative"
                  onDragOver={(e) => { if (draggedReport) { e.preventDefault(); e.currentTarget.classList.add("ring-2", "ring-brand-400/40"); } }}
                  onDragLeave={(e) => { e.currentTarget.classList.remove("ring-2", "ring-brand-400/40"); }}
                  onDrop={(e) => {
                    e.currentTarget.classList.remove("ring-2", "ring-brand-400/40");
                    if (draggedReport) handleDropOnCampaign(draggedReport, campaign.content_group_id);
                    setDraggedReport(null);
                  }}
                >
                  <button
                    onClick={() => toggleSelect(campaign.content_group_id)}
                    className={`absolute top-3 left-3 z-10 p-0.5 rounded transition-all ${
                      selected.has(campaign.content_group_id) ? "text-brand-400" : "text-white/10 hover:text-white/30"
                    }`}
                  >
                    {selected.has(campaign.content_group_id) ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
                  </button>
                  <CampaignCard campaign={campaign} onRename={handleRename} />
                </div>
              ))}
            </div>
          )}
        </section>
      </main>

      {/* ── Merge Modal ──────────────────────────────────────────────────── */}
      {showMergeModal && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setShowMergeModal(false)}>
          <div className="tooltip-card p-5 sm:p-6 max-w-md w-full mx-4 rounded-2xl shadow-2xl border border-white/[0.1] animate-fade-up" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2 mb-1">
              <Merge className="w-4 h-4 text-brand-400" />
              <h3 className="text-base font-semibold text-white/90">Combine Campaigns</h3>
            </div>
            <p className="text-xs text-white/40 mb-4">Merge {selected.size} campaigns into one. Reports linked chronologically.</p>
            <div className="space-y-1.5 mb-4 max-h-40 overflow-y-auto">
              {sortedCampaigns
                .filter((c) => selected.has(c.content_group_id))
                .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
                .map((c, i) => (
                  <div key={c.content_group_id} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/[0.03] border border-white/[0.05]">
                    <span className="w-5 h-5 rounded-full bg-brand-500/15 flex items-center justify-center text-[10px] font-bold text-brand-400 flex-shrink-0">{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-white/60 font-medium truncate">{c.campaign_name || "Campaign"}</p>
                      <p className="text-[10px] text-white/25">{c.media_count} reports · score {c.latest_score}</p>
                    </div>
                  </div>
                ))}
            </div>
            <div className="mb-4">
              <label className="text-[10px] text-white/30 uppercase tracking-wider font-medium mb-1.5 block">Combined name (optional)</label>
              <input type="text" value={mergeName} onChange={(e) => setMergeName(e.target.value)} placeholder="e.g., Q1 Instagram Series"
                className="w-full px-3 py-2 rounded-lg bg-white/[0.04] border border-white/[0.08] text-sm text-white/80 placeholder:text-white/20 focus:outline-none focus:border-brand-500/40" />
            </div>
            <div className="flex gap-2">
              <Button className="flex-1" onClick={handleMerge} disabled={merging}>
                {merging ? <Loader2 className="w-4 h-4 animate-spin" /> : <Merge className="w-4 h-4" />}
                {merging ? "Combining..." : "Combine"}
              </Button>
              <Button variant="ghost" onClick={() => setShowMergeModal(false)} disabled={merging}>Cancel</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
