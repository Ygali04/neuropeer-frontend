"use client";

import { useState, useEffect } from "react";
import { FileText, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { getRunHistory, type RunHistoryEntry } from "@/lib/run-history";
import { useAuth } from "@/lib/auth-context";

interface Props {
  selectedIds: string[];
  onSelect: (jobId: string) => void;
}

interface PickerEntry {
  jobId: string;
  url: string;
  score: number;
  type: string;
  label: "demo" | "history";
}

export function ReportPicker({ selectedIds, onSelect }: Props) {
  const { session } = useAuth();
  const [entries, setEntries] = useState<PickerEntry[]>([]);

  useEffect(() => {
    const items: PickerEntry[] = [];

    // Run history
    const history = getRunHistory(session?.user?.email ?? undefined);
    for (const h of history) {
      if (!items.find((e) => e.jobId === h.jobId)) {
        items.push({
          jobId: h.jobId,
          url: h.url,
          score: h.neuralScore,
          type: h.contentType.replace("_", " "),
          label: "history",
        });
      }
    }

    setEntries(items);
  }, [session]);

  if (entries.length === 0) return null;

  return (
    <div>
      <p className="text-xs text-white/30 mb-2">Or pick an existing report:</p>
      <div className="flex flex-col gap-1.5">
        {entries.map((entry) => {
          const isSelected = selectedIds.includes(entry.jobId);
          const scoreColor = entry.score >= 75 ? "var(--color-score-green)" : entry.score >= 50 ? "var(--color-score-amber)" : "var(--color-score-red)";

          return (
            <button
              key={entry.jobId}
              onClick={() => !isSelected && onSelect(entry.jobId)}
              disabled={isSelected}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-xl border text-left transition-all duration-200",
                isSelected
                  ? "border-brand-500/30 bg-brand-500/[0.06] opacity-60 cursor-not-allowed"
                  : "border-white/[0.06] bg-white/[0.02] hover:border-white/[0.12] hover:bg-white/[0.04] cursor-pointer"
              )}
            >
              {/* Score */}
              <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: `${scoreColor}15` }}>
                <span className="text-xs font-bold tabular-nums" style={{ color: scoreColor }}>{entry.score.toFixed(1)}</span>
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <p className="text-sm text-white/60 truncate">{entry.url}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-[10px] text-white/25">{entry.type}</span>
                  <span className={cn(
                    "text-[9px] px-1.5 py-0.5 rounded-full",
                    entry.label === "demo" ? "bg-teal-500/10 text-teal-400" : "bg-white/[0.04] text-white/25"
                  )}>
                    {entry.label === "demo" ? "Demo" : "History"}
                  </span>
                </div>
              </div>

              {/* Selected indicator */}
              {isSelected ? (
                <Check className="w-4 h-4 text-brand-400 flex-shrink-0" />
              ) : (
                <FileText className="w-3.5 h-3.5 text-white/15 flex-shrink-0" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
