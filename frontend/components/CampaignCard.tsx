"use client";

import { useState } from "react";
import Link from "next/link";
import { Pencil, Check, X } from "lucide-react";
import type { CampaignSummary } from "@/lib/types";
import { renameCampaign } from "@/lib/api";

interface Props {
  campaign: CampaignSummary;
  onRename?: (id: string, name: string) => void;
}

export function CampaignCard({ campaign, onRename }: Props) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(campaign.campaign_name || "");

  const scoreColor = campaign.latest_score >= 75 ? "var(--color-score-green)" : campaign.latest_score >= 50 ? "var(--color-score-amber)" : "var(--color-score-red)";
  const deltaColor = campaign.delta > 0 ? "text-emerald-400" : campaign.delta < 0 ? "text-red-400" : "text-white/30";
  const deltaSign = campaign.delta >= 0 ? "+" : "";

  const handleSave = async () => {
    if (name.trim()) {
      await renameCampaign(campaign.content_group_id, name.trim());
      onRename?.(campaign.content_group_id, name.trim());
    }
    setEditing(false);
  };

  return (
    <div className="glass-card glass-card-hover p-4 group">
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1 min-w-0">
          {editing ? (
            <div className="flex items-center gap-1.5">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSave()}
                className="text-sm font-medium text-white bg-white/[0.04] border border-white/[0.1] rounded px-2 py-0.5 focus:outline-none focus:border-brand-500/50 w-full"
                autoFocus
              />
              <button onClick={handleSave} className="p-0.5 text-emerald-400 hover:text-emerald-300"><Check className="w-3.5 h-3.5" /></button>
              <button onClick={() => setEditing(false)} className="p-0.5 text-white/30 hover:text-white/50"><X className="w-3.5 h-3.5" /></button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-medium text-white/80 truncate">{campaign.campaign_name || "Unnamed Campaign"}</h3>
              <button onClick={() => setEditing(true)} className="opacity-0 group-hover:opacity-100 p-0.5 text-white/20 hover:text-white/50 transition-all">
                <Pencil className="w-3 h-3" />
              </button>
            </div>
          )}
          <div className="flex items-center gap-2 mt-1">
            <span className="text-[10px] text-white/25">{campaign.media_count} {campaign.media_count === 1 ? "video" : "videos"}</span>
            <span className="text-[10px] text-white/15">·</span>
            <span className="text-[10px] text-white/25">{campaign.content_type.replace("_", " ")}</span>
          </div>
        </div>

        <div className="text-right flex-shrink-0 ml-4">
          <div className="text-2xl font-bold tabular-nums" style={{ color: scoreColor }}>{campaign.latest_score}</div>
          {campaign.delta !== 0 && (
            <div className={`text-xs font-bold tabular-nums ${deltaColor}`}>{deltaSign}{campaign.delta}</div>
          )}
        </div>
      </div>

      {campaign.media_count > 1 && (
        <div className="flex items-center gap-2 mb-3">
          <span className="text-[10px] text-white/30 tabular-nums">{campaign.first_score}</span>
          <div className="flex-1 h-1 bg-white/[0.04] rounded-full overflow-hidden relative">
            <div
              className="h-full rounded-full"
              style={{
                width: `${Math.max(5, campaign.latest_score)}%`,
                background: `linear-gradient(90deg, rgba(249,115,22,0.3), ${scoreColor})`,
              }}
            />
          </div>
          <span className="text-[10px] font-medium tabular-nums" style={{ color: scoreColor }}>{campaign.latest_score}</span>
        </div>
      )}

      <div className="flex items-center justify-between">
        <span className="text-[10px] text-white/20">
          {new Date(campaign.created_at).toLocaleDateString()} — {new Date(campaign.latest_at).toLocaleDateString()}
        </span>
        <Link
          href={`/analyze/${campaign.content_group_id}`}
          className="text-[10px] text-brand-400 hover:text-brand-300 transition-colors opacity-0 group-hover:opacity-100"
        >
          View campaign →
        </Link>
      </div>
    </div>
  );
}
