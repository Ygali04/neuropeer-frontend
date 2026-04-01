"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
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
import { useAuth } from "@/lib/auth-context";
import { getAllReports } from "@/lib/api";
import { CountUp } from "@/components/ui/count-up";
import type { CampaignSummary } from "@/lib/types";

interface ReportPoint {
  job_id: string;
  url: string;
  content_type: string;
  score: number;
  campaign_name: string | null;
  content_group_id: string;
  created_at: string;
  date: number;
  dateLabel: string;
}

interface Props {
  campaigns: CampaignSummary[];
  overallScore: number;
}

export function ScoreTimeline({ campaigns, overallScore }: Props) {
  const router = useRouter();
  const { session } = useAuth();
  const [reports, setReports] = useState<ReportPoint[]>([]);

  useEffect(() => {
    const email = session?.user?.email;
    if (!email) return;
    getAllReports(email).then((data) => {
      setReports(
        data.map((r) => ({
          ...r,
          date: new Date(r.created_at).getTime(),
          dateLabel: new Date(r.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
        }))
      );
    });
  }, [session]);

  const dataPoints = useMemo(() => {
    return [...reports].sort((a, b) => a.date - b.date);
  }, [reports]);

  if (dataPoints.length === 0) return null;

  const avgScore = dataPoints.length > 0
    ? dataPoints.reduce((s, d) => s + d.score, 0) / dataPoints.length
    : 0;

  const handleDotClick = (data: ReportPoint) => {
    router.push(`/analyze/${data.job_id}`);
  };

  return (
    <div className="glass-card p-4 sm:p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-brand-400" />
          <h2 className="text-sm font-medium text-white/50 uppercase tracking-wider">Score Timeline</h2>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-white/25">{dataPoints.length} {dataPoints.length === 1 ? "report" : "reports"}</span>
          <div className="flex items-center gap-1">
            <span className="text-[10px] text-white/25">avg</span>
            <CountUp end={avgScore} decimals={1} duration={1000} className="text-xs font-bold text-brand-400 tabular-nums" />
          </div>
        </div>
      </div>

      <div className="h-[200px] sm:h-[220px]">
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
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const d = payload[0].payload as ReportPoint;
                const scoreColor = d.score >= 75 ? "var(--color-score-green)" : d.score >= 50 ? "var(--color-score-amber)" : "var(--color-score-red)";
                return (
                  <div className="tooltip-card p-3 rounded-xl shadow-xl border border-white/[0.1] min-w-[180px]">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-lg font-bold tabular-nums" style={{ color: scoreColor }}>{d.score.toFixed(1)}</span>
                      <span className="text-[10px] text-white/25">{d.dateLabel}</span>
                    </div>
                    <p className="text-[11px] text-white/50 truncate mb-1">{d.url.replace(/https?:\/\/(www\.)?/, "").slice(0, 40)}</p>
                    {d.campaign_name && (
                      <p className="text-[10px] text-brand-400/70 mb-1.5">Campaign: {d.campaign_name}</p>
                    )}
                    <p className="text-[10px] text-white/20 italic">Click dot to open report →</p>
                  </div>
                );
              }}
            />
            <Line
              type="monotone"
              dataKey="score"
              stroke="#f97316"
              strokeWidth={2}
              dot={({ cx, cy, payload }) => {
                const d = payload as ReportPoint;
                const color = d.score >= 75 ? "var(--color-score-green)" : d.score >= 50 ? "var(--color-score-amber)" : "var(--color-score-red)";
                return (
                  <circle
                    key={d.job_id}
                    cx={cx}
                    cy={cy}
                    r={5}
                    fill={color}
                    stroke="rgba(7,6,11,0.8)"
                    strokeWidth={2}
                    className="cursor-pointer hover:r-7 transition-all"
                    onClick={() => handleDotClick(d)}
                  />
                );
              }}
              activeDot={({ cx, cy, payload }) => {
                const d = payload as ReportPoint;
                const color = d.score >= 75 ? "var(--color-score-green)" : d.score >= 50 ? "var(--color-score-amber)" : "var(--color-score-red)";
                return (
                  <circle
                    cx={cx}
                    cy={cy}
                    r={7}
                    fill={color}
                    stroke="#fff"
                    strokeWidth={2}
                    className="cursor-pointer"
                    onClick={() => handleDotClick(d)}
                  />
                );
              }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
