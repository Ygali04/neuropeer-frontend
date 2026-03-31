"use client";

import { TrendingUp, TrendingDown, Minus, Brain, BarChart3, Clock, Zap, Target } from "lucide-react";
import type { MarketerProfile, CampaignSummary } from "@/lib/types";

interface Props {
  profile: MarketerProfile;
  campaigns?: CampaignSummary[];
}

export function MarketerProfileCard({ profile, campaigns = [] }: Props) {
  const scoreColor = profile.overall_score >= 75 ? "text-emerald-400" : profile.overall_score >= 50 ? "text-amber-400" : "text-red-400";

  // Compute stats from campaigns
  const totalVideos = campaigns.reduce((sum, c) => sum + c.media_count, 0);
  const bestScore = campaigns.length > 0 ? Math.max(...campaigns.map(c => c.latest_score)) : 0;
  const totalCampaigns = campaigns.length;
  const avgDelta = campaigns.length > 0 ? Math.round(campaigns.reduce((sum, c) => sum + c.delta, 0) / campaigns.length) : 0;

  const stats = [
    { label: "Campaigns", value: totalCampaigns, icon: Target, color: "text-brand-400" },
    { label: "Videos Analyzed", value: totalVideos, icon: BarChart3, color: "text-teal-400" },
    { label: "Best Score", value: bestScore, icon: Zap, color: "text-emerald-400" },
    { label: "Avg Improvement", value: `${avgDelta >= 0 ? "+" : ""}${avgDelta}`, icon: TrendingUp, color: avgDelta > 0 ? "text-emerald-400" : avgDelta < 0 ? "text-red-400" : "text-white/40" },
  ];

  return (
    <div className="glass-card p-6 space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Brain className="w-4 h-4 text-brand-400" />
            <h2 className="text-sm font-medium text-white/50 uppercase tracking-wider">Marketer Profile</h2>
          </div>
          {profile.ai_summary && (
            <p className="text-sm text-white/60 leading-relaxed max-w-xl mt-2">{profile.ai_summary}</p>
          )}
        </div>
        <div className="text-right">
          <div className={`text-4xl font-bold tabular-nums ${scoreColor}`}>{Math.round(profile.overall_score)}</div>
          <div className="text-[10px] text-white/30 uppercase tracking-wider">Overall Score</div>
        </div>
      </div>

      {/* Stat tiles */}
      {totalVideos > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-3 border-t border-white/[0.06]">
          {stats.map(({ label, value, icon: Icon, color }) => (
            <div key={label} className="flex items-center gap-2.5 px-3 py-2 rounded-xl bg-white/[0.02] border border-white/[0.04]">
              <Icon className={`w-4 h-4 ${color} flex-shrink-0`} />
              <div>
                <div className="text-sm font-bold text-white/80 tabular-nums">{value}</div>
                <div className="text-[9px] text-white/30 uppercase tracking-wider">{label}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {(profile.ai_strengths?.length > 0 || profile.ai_weaknesses?.length > 0) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-3 border-t border-white/[0.06]">
          {profile.ai_strengths?.length > 0 && (
            <div>
              <h3 className="text-[10px] text-emerald-400/80 uppercase tracking-wider font-medium mb-2">Strengths</h3>
              <div className="space-y-1.5">
                {profile.ai_strengths.map((s) => (
                  <div key={s.metric} className="flex items-start gap-2">
                    <TrendingUp className="w-3 h-3 text-emerald-400 mt-0.5 flex-shrink-0" />
                    <div>
                      <span className="text-xs text-white/70 font-medium">{s.metric}</span>
                      <p className="text-[10px] text-white/35">{s.insight}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {profile.ai_weaknesses?.length > 0 && (
            <div>
              <h3 className="text-[10px] text-red-400/80 uppercase tracking-wider font-medium mb-2">Growth Areas</h3>
              <div className="space-y-1.5">
                {profile.ai_weaknesses.map((w) => (
                  <div key={w.metric} className="flex items-start gap-2">
                    <TrendingDown className="w-3 h-3 text-red-400 mt-0.5 flex-shrink-0" />
                    <div>
                      <span className="text-xs text-white/70 font-medium">{w.metric}</span>
                      <p className="text-[10px] text-white/35">{w.insight}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {profile.ai_trends?.length > 0 && (
        <div className="pt-3 border-t border-white/[0.06]">
          <h3 className="text-[10px] text-white/30 uppercase tracking-wider font-medium mb-2">Trends</h3>
          <div className="flex flex-wrap gap-2">
            {profile.ai_trends.map((t) => {
              const Icon = t.direction === "improving" ? TrendingUp : t.direction === "declining" ? TrendingDown : Minus;
              const color = t.direction === "improving" ? "text-emerald-400" : t.direction === "declining" ? "text-red-400" : "text-white/40";
              return (
                <div key={t.metric} className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/[0.03] border border-white/[0.06]">
                  <Icon className={`w-3 h-3 ${color}`} />
                  <span className="text-[10px] text-white/50">{t.metric}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="text-[10px] text-white/15">
        {profile.total_analyses} analyses · Updates every 5 runs
      </div>
    </div>
  );
}
