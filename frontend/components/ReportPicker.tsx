"use client";

import { useState, useEffect, useMemo } from "react";
import { FileText, Check, Search, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { getAllReports } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";

interface Props {
  selectedIds: string[];
  onSelect: (jobId: string) => void;
}

interface ReportEntry {
  job_id: string;
  url: string;
  score: number;
  content_type: string;
  campaign_name: string | null;
  content_group_id: string;
  created_at: string;
}

export function ReportPicker({ selectedIds, onSelect }: Props) {
  const { session } = useAuth();
  const [reports, setReports] = useState<ReportEntry[]>([]);
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState(true);

  useEffect(() => {
    const email = session?.user?.email;
    if (!email) return;
    getAllReports(email).then(setReports);
  }, [session]);

  // Group by campaign
  const grouped = useMemo(() => {
    const groups = new Map<string, { name: string; reports: ReportEntry[] }>();
    for (const r of reports) {
      const key = r.content_group_id;
      if (!groups.has(key)) {
        groups.set(key, { name: r.campaign_name || "Uncategorized", reports: [] });
      }
      groups.get(key)!.reports.push(r);
    }
    return [...groups.values()].sort((a, b) => {
      const aDate = Math.max(...a.reports.map((r) => new Date(r.created_at).getTime()));
      const bDate = Math.max(...b.reports.map((r) => new Date(r.created_at).getTime()));
      return bDate - aDate;
    });
  }, [reports]);

  // Filter by search
  const filtered = useMemo(() => {
    if (!search.trim()) return grouped;
    const q = search.toLowerCase();
    return grouped
      .map((g) => ({
        ...g,
        reports: g.reports.filter(
          (r) =>
            r.url.toLowerCase().includes(q) ||
            (r.campaign_name ?? "").toLowerCase().includes(q) ||
            r.content_type.toLowerCase().includes(q)
        ),
      }))
      .filter((g) => g.reports.length > 0 || g.name.toLowerCase().includes(q));
  }, [grouped, search]);

  if (reports.length === 0) return null;

  const totalFiltered = filtered.reduce((s, g) => s + g.reports.length, 0);

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs text-white/30">Or pick an existing report:</p>
        <button
          onClick={() => setExpanded((p) => !p)}
          className="flex items-center gap-1 text-[10px] text-white/25 hover:text-white/40 transition-colors"
        >
          {totalFiltered} reports
          <ChevronDown className={cn("w-3 h-3 transition-transform", expanded && "rotate-180")} />
        </button>
      </div>

      <div className={cn("overflow-hidden transition-all duration-300", expanded ? "max-h-[400px]" : "max-h-0")}>
        {/* Search */}
        <div className="relative mb-2">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/20" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, URL, or campaign..."
            className="w-full pl-8 pr-3 py-2 rounded-lg bg-white/[0.03] border border-white/[0.06] text-xs text-white/70 placeholder:text-white/20 focus:outline-none focus:border-brand-500/30"
          />
        </div>

        <div className="flex flex-col gap-2 max-h-[340px] overflow-y-auto pr-1">
          {filtered.map((group) => (
            <div key={group.name}>
              {/* Campaign group header */}
              <div className="flex items-center gap-1.5 px-1 py-1">
                <div className="w-1 h-3 rounded-full bg-brand-400/30" />
                <span className="text-[10px] text-white/30 font-medium uppercase tracking-wider truncate">{group.name}</span>
                <span className="text-[9px] text-white/15">{group.reports.length}</span>
              </div>

              {/* Reports in this campaign */}
              <div className="flex flex-col gap-1">
                {group.reports.map((r) => {
                  const isSelected = selectedIds.includes(r.job_id);
                  const scoreColor = r.score >= 75 ? "var(--color-score-green)" : r.score >= 50 ? "var(--color-score-amber)" : "var(--color-score-red)";
                  const shortUrl = r.url.replace(/https?:\/\/(www\.)?/, "").slice(0, 45);

                  return (
                    <button
                      key={r.job_id}
                      onClick={() => !isSelected && onSelect(r.job_id)}
                      disabled={isSelected}
                      className={cn(
                        "flex items-center gap-2.5 px-2.5 py-2 rounded-lg border text-left transition-all duration-200",
                        isSelected
                          ? "border-brand-500/30 bg-brand-500/[0.06] opacity-50 cursor-not-allowed"
                          : "border-white/[0.04] bg-white/[0.01] hover:border-white/[0.1] hover:bg-white/[0.03] cursor-pointer"
                      )}
                    >
                      <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: `${scoreColor}12` }}>
                        <span className="text-[11px] font-bold tabular-nums" style={{ color: scoreColor }}>{r.score.toFixed(1)}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-white/60 truncate">{shortUrl}</p>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className="text-[9px] text-white/20">{r.content_type.replace("_", " ")}</span>
                          <span className="text-[9px] text-white/15">{new Date(r.created_at).toLocaleDateString()}</span>
                        </div>
                      </div>
                      {isSelected ? (
                        <Check className="w-3.5 h-3.5 text-brand-400 flex-shrink-0" />
                      ) : (
                        <FileText className="w-3 h-3 text-white/10 flex-shrink-0" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}

          {totalFiltered === 0 && (
            <p className="text-[11px] text-white/20 text-center py-4">No reports match &ldquo;{search}&rdquo;</p>
          )}
        </div>
      </div>
    </div>
  );
}
