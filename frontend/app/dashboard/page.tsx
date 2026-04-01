"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { Brain, Trash2, CheckSquare, Square, X, Merge, Loader2 } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { getProfile, getCampaigns, bulkDeleteCampaigns, mergeCampaigns } from "@/lib/api";
import { MarketerProfileCard } from "@/components/MarketerProfileCard";
import { ScoreTimeline } from "@/components/ScoreTimeline";
import { CampaignCard } from "@/components/CampaignCard";
import { UserMenu } from "@/components/UserMenu";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Button } from "@/components/ui/button";
import type { MarketerProfile, CampaignSummary } from "@/lib/types";

type SortKey = "date" | "score" | "delta";

const DEFAULT_PROFILE: MarketerProfile = {
  user_email: "",
  overall_score: 0,
  total_analyses: 0,
  ai_summary: null,
  ai_strengths: [],
  ai_weaknesses: [],
  ai_trends: [],
  last_refreshed_at: null,
};

export default function DashboardPage() {
  const { session, status } = useAuth();
  const [profile, setProfile] = useState<MarketerProfile>(DEFAULT_PROFILE);
  const [campaigns, setCampaigns] = useState<CampaignSummary[]>([]);
  const [sortBy, setSortBy] = useState<SortKey>("date");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);
  const [merging, setMerging] = useState(false);
  const [showMergeModal, setShowMergeModal] = useState(false);
  const [mergeName, setMergeName] = useState("");

  // Set browser tab title with user name
  useEffect(() => {
    const name = session?.user?.name?.split(" ")[0] ?? "Dashboard";
    document.title = `${name}'s Dashboard — NeuroPeer`;
  }, [session]);

  useEffect(() => {
    const email = session?.user?.email;
    if (!email) return;
    getProfile(email).then(setProfile);
    getCampaigns(email).then(setCampaigns);
  }, [session]);

  const sortedCampaigns = useMemo(() => {
    const items = [...campaigns];
    if (sortBy === "date") items.sort((a, b) => new Date(b.latest_at).getTime() - new Date(a.latest_at).getTime());
    if (sortBy === "score") items.sort((a, b) => b.latest_score - a.latest_score);
    if (sortBy === "delta") items.sort((a, b) => b.delta - a.delta);
    return items;
  }, [campaigns, sortBy]);

  const handleRename = (id: string, name: string) => {
    setCampaigns((prev) =>
      prev.map((c) => c.content_group_id === id ? { ...c, campaign_name: name } : c)
    );
  };

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    if (selected.size === sortedCampaigns.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(sortedCampaigns.map((c) => c.content_group_id)));
    }
  };

  const handleBulkDelete = async () => {
    if (selected.size === 0) return;
    if (!confirm(`Delete ${selected.size} campaign${selected.size > 1 ? "s" : ""}? This removes all associated reports and cannot be undone.`)) return;
    setDeleting(true);
    try {
      await bulkDeleteCampaigns([...selected]);
      setCampaigns((prev) => prev.filter((c) => !selected.has(c.content_group_id)));
      setSelected(new Set());
    } catch {
      // silent
    } finally {
      setDeleting(false);
    }
  };

  const handleMerge = async () => {
    if (selected.size < 2) return;
    setMerging(true);
    try {
      await mergeCampaigns([...selected], mergeName || undefined);
      // Refresh campaigns
      const email = session?.user?.email;
      if (email) {
        const updated = await getCampaigns(email);
        setCampaigns(updated);
      }
      setSelected(new Set());
      setShowMergeModal(false);
      setMergeName("");
    } catch {
      // silent
    } finally {
      setMerging(false);
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
        <MarketerProfileCard profile={profile} campaigns={campaigns} />
        <ScoreTimeline campaigns={sortedCampaigns} overallScore={profile.overall_score} />

        <section>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <h2 className="font-[family-name:var(--font-display)] text-base sm:text-lg font-semibold text-white">Campaigns</h2>
              {sortedCampaigns.length > 0 && (
                <button
                  onClick={selectAll}
                  className="p-1 rounded hover:bg-white/[0.06] text-white/20 hover:text-white/40 transition-colors"
                  title={selected.size === sortedCampaigns.length ? "Deselect all" : "Select all"}
                >
                  {selected.size === sortedCampaigns.length && sortedCampaigns.length > 0 ? (
                    <CheckSquare className="w-4 h-4" />
                  ) : (
                    <Square className="w-4 h-4" />
                  )}
                </button>
              )}
            </div>
            <div className="flex items-center gap-2">
              {isSelecting && (
                <>
                  <span className="text-[10px] text-white/30">{selected.size} selected</span>
                  {selected.size >= 2 && (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => { setMergeName(""); setShowMergeModal(true); }}
                    >
                      <Merge className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">Combine</span>
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleBulkDelete}
                    disabled={deleting}
                    className="!border-red-500/30 !text-red-400 hover:!bg-red-500/10"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Delete</span>
                  </Button>
                  <button onClick={() => setSelected(new Set())} className="p-1 text-white/30 hover:text-white/50">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </>
              )}
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as SortKey)}
                className="bg-white/[0.04] border border-white/[0.08] rounded-lg px-2 py-1 text-[10px] sm:text-xs text-white/60 focus:outline-none focus:ring-1 focus:ring-brand-500/30"
              >
                <option value="date">Newest first</option>
                <option value="score">Highest score</option>
                <option value="delta">Most improved</option>
              </select>
            </div>
          </div>

          {sortedCampaigns.length === 0 ? (
            <div className="glass-card p-8 sm:p-12 text-center">
              <Brain className="w-10 h-10 text-white/10 mx-auto mb-4" />
              <p className="text-white/30 text-sm mb-4">
                Run your first analysis to start building your marketer profile
              </p>
              <Link href="/">
                <Button variant="primary" size="sm">Start your first analysis</Button>
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
              {sortedCampaigns.map((campaign) => (
                <div key={campaign.content_group_id} className="relative">
                  {/* Selection checkbox */}
                  <button
                    onClick={() => toggleSelect(campaign.content_group_id)}
                    className={`absolute top-3 left-3 z-10 p-0.5 rounded transition-all ${
                      selected.has(campaign.content_group_id)
                        ? "text-brand-400"
                        : "text-white/10 hover:text-white/30"
                    }`}
                  >
                    {selected.has(campaign.content_group_id) ? (
                      <CheckSquare className="w-4 h-4" />
                    ) : (
                      <Square className="w-4 h-4" />
                    )}
                  </button>
                  <CampaignCard
                    campaign={campaign}
                    onRename={handleRename}
                  />
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
            <p className="text-xs text-white/40 mb-4">
              Merge {selected.size} campaigns into one. Reports will be linked chronologically by creation date.
            </p>

            {/* Preview: selected campaigns sorted by date */}
            <div className="space-y-1.5 mb-4 max-h-40 overflow-y-auto">
              {sortedCampaigns
                .filter((c) => selected.has(c.content_group_id))
                .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
                .map((c, i) => (
                  <div key={c.content_group_id} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/[0.03] border border-white/[0.05]">
                    <span className="w-5 h-5 rounded-full bg-brand-500/15 flex items-center justify-center text-[10px] font-bold text-brand-400 flex-shrink-0">
                      {i + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-white/60 font-medium truncate">{c.campaign_name || `Campaign`}</p>
                      <p className="text-[10px] text-white/25">{c.media_count} report{c.media_count !== 1 ? "s" : ""} · score {c.latest_score}</p>
                    </div>
                  </div>
                ))}
            </div>

            {/* Optional name */}
            <div className="mb-4">
              <label className="text-[10px] text-white/30 uppercase tracking-wider font-medium mb-1.5 block">
                Combined campaign name (optional)
              </label>
              <input
                type="text"
                value={mergeName}
                onChange={(e) => setMergeName(e.target.value)}
                placeholder="e.g., Q1 Instagram Series"
                className="w-full px-3 py-2 rounded-lg bg-white/[0.04] border border-white/[0.08] text-sm text-white/80 placeholder:text-white/20 focus:outline-none focus:border-brand-500/40"
              />
            </div>

            <div className="flex gap-2">
              <Button className="flex-1" onClick={handleMerge} disabled={merging}>
                {merging ? <Loader2 className="w-4 h-4 animate-spin" /> : <Merge className="w-4 h-4" />}
                {merging ? "Combining..." : "Combine Campaigns"}
              </Button>
              <Button variant="ghost" onClick={() => setShowMergeModal(false)} disabled={merging}>
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
