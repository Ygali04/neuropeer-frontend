"use client";

import { useMemo } from "react";
import { TrendingUp } from "lucide-react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import type { CampaignSummary } from "@/lib/types";

interface Props {
  campaigns: CampaignSummary[];
  overallScore: number;
}

export function ScoreTimeline({ campaigns, overallScore }: Props) {
  const dataPoints = useMemo(() => {
    return campaigns
      .filter((c) => c.latest_at)
      .map((c) => ({
        date: new Date(c.latest_at).getTime(),
        dateLabel: new Date(c.latest_at).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
        score: c.latest_score,
        name: c.campaign_name || "Unnamed",
        delta: c.delta,
        groupId: c.content_group_id,
      }))
      .sort((a, b) => a.date - b.date);
  }, [campaigns]);

  if (dataPoints.length === 0) return null;

  return (
    <div className="glass-card p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-brand-400" />
          <h2 className="text-sm font-medium text-white/50 uppercase tracking-wider">Score Timeline</h2>
        </div>
        <span className="text-xs text-white/25">{dataPoints.length} {dataPoints.length === 1 ? "analysis" : "analyses"}</span>
      </div>

      <div className="h-[200px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={dataPoints} margin={{ top: 5, right: 10, bottom: 5, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
            <XAxis
              dataKey="dateLabel"
              tick={{ fontSize: 10, fill: "rgba(255,255,255,0.25)" }}
              axisLine={{ stroke: "rgba(255,255,255,0.06)" }}
              tickLine={false}
            />
            <YAxis
              domain={[0, 100]}
              tick={{ fontSize: 10, fill: "rgba(255,255,255,0.25)" }}
              axisLine={false}
              tickLine={false}
              width={30}
            />
            <Tooltip
              contentStyle={{
                background: "rgba(15, 13, 20, 0.95)",
                border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: 12,
                fontSize: 12,
                color: "rgba(255,255,255,0.7)",
              }}
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              formatter={(value: any, _name: any, props: any) => {
                const d = props?.payload?.delta ?? 0;
                const deltaStr = d !== 0 ? ` (${d >= 0 ? "+" : ""}${d})` : "";
                return [`${value}/100${deltaStr}`, props?.payload?.name ?? ""];
              }}
              labelFormatter={() => ""}
            />
            <Line
              type="monotone"
              dataKey="score"
              stroke="#f97316"
              strokeWidth={2.5}
              dot={{ r: 5, fill: "#f97316", stroke: "rgba(7,6,11,0.8)", strokeWidth: 2 }}
              activeDot={{ r: 7, fill: "#f97316", stroke: "#fff", strokeWidth: 2 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
