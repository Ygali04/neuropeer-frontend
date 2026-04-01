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
  reports?: { job_id: string; url: string; content_type: string; score: number; campaign_name: string | null; content_group_id: string; created_at: string }[];
}

export function ScoreTimeline({ campaigns, overallScore, reports: reportsProp }: Props) {
  const router = useRouter();
  const { session } = useAuth();
  const [reports, setReports] = useState<ReportPoint[]>([]);

  useEffect(() => {
    // Use prop if provided (lifted state from dashboard)
    if (reportsProp && reportsProp.length > 0) {
      setReports(
        reportsProp.map((r) => ({
          ...r,
          date: new Date(r.created_at).getTime(),
          dateLabel: new Date(r.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
        }))
      );
      return;
    }
    // Fallback: fetch independently
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
  }, [reportsProp, session]);

  const dataPoints = useMemo(() => {
    // Deduplicate by job_id
    const seen = new Set<string>();
    const sorted = [...reports]
      .filter((r) => { if (seen.has(r.job_id)) return false; seen.add(r.job_id); return true; })
      .sort((a, b) => a.date - b.date);
    // Make each dateLabel unique (recharts merges points with same X key)
    const labelCounts = new Map<string, number>();
    return sorted.map((r) => {
      const count = (labelCounts.get(r.dateLabel) ?? 0) + 1;
      labelCounts.set(r.dateLabel, count);
      return { ...r, xKey: count > 1 ? `${r.dateLabel} #${count}` : r.dateLabel };
    });
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
              dataKey="xKey"
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
                if (!d || !d.job_id) return null;
                const scoreColor = d.score >= 75 ? "var(--color-score-green)" : d.score >= 50 ? "var(--color-score-amber)" : "var(--color-score-red)";
                const shortUrl = d.url.replace(/https?:\/\/(www\.)?/, "").slice(0, 40);
                return (
                  <div className="tooltip-card p-3 rounded-xl shadow-xl border border-white/[0.1] min-w-[200px] max-w-[280px]">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-lg font-bold tabular-nums" style={{ color: scoreColor }}>{d.score.toFixed(1)}</span>
                      <span className="text-[10px] text-white/25">{d.dateLabel}</span>
                    </div>
                    <p className="text-[11px] text-white/50 mb-1 break-all">{shortUrl}</p>
                    {d.campaign_name && (
                      <p className="text-[10px] text-brand-400/70 mb-1">Campaign: {d.campaign_name}</p>
                    )}
                    <p className="text-[9px] text-white/15 font-mono mb-1.5">{d.job_id.slice(0, 8)}</p>
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
                if (cx == null || cy == null) return <></>;
                const d = payload as ReportPoint;
                const color = d.score >= 75 ? "var(--color-score-green)" : d.score >= 50 ? "var(--color-score-amber)" : "var(--color-score-red)";
                return (
                  <g key={d.job_id} onClick={() => handleDotClick(d)} style={{ cursor: "pointer" }}>
                    <circle cx={cx} cy={cy} r={5} fill={color} stroke="rgba(7,6,11,0.8)" strokeWidth={2} />
                    <text x={cx} y={cy - 10} textAnchor="middle" fontSize={9} fontWeight="bold" fill={color}>
                      {d.score.toFixed(1)}
                    </text>
                  </g>
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
