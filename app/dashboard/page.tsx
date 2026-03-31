"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { Brain } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { getProfile, getCampaigns } from "@/lib/api";
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

  if (status === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-white/10 border-t-brand-400 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
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
        {/* ── Top: Marketer Profile ──────────────────────────────────────────── */}
        <MarketerProfileCard profile={profile} campaigns={campaigns} />

        {/* ── Middle: Score Timeline ────────────────────────────────────────── */}
        <ScoreTimeline campaigns={sortedCampaigns} overallScore={profile.overall_score} />

        {/* ── Bottom: Campaign List ─────────────────────────────────────────── */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-[family-name:var(--font-display)] text-base sm:text-lg font-semibold text-white">Campaigns</h2>
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
                <CampaignCard
                  key={campaign.content_group_id}
                  campaign={campaign}
                  onRename={handleRename}
                />
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
