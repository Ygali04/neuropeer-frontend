"use client";

import { Check, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ProgressEvent, JobStatus } from "@/lib/types";

const STEPS: { status: JobStatus; label: string }[] = [
  { status: "queued", label: "Queued" },
  { status: "downloading", label: "Downloading" },
  { status: "transcribing", label: "Transcribing" },
  { status: "inferring", label: "Running TRIBE v2" },
  { status: "aggregating", label: "Aggregating ROIs" },
  { status: "scoring", label: "Computing Scores" },
  { status: "complete", label: "Complete" },
];

const STATUS_ORDER: Record<JobStatus, number> = {
  queued: 0,
  downloading: 1,
  transcribing: 2,
  inferring: 3,
  aggregating: 4,
  scoring: 5,
  complete: 6,
  error: 7,
};

interface Props {
  event: ProgressEvent | null;
}

export function ProgressTracker({ event }: Props) {
  const currentOrder = event ? STATUS_ORDER[event.status] : -1;

  return (
    <div className="w-full max-w-md mx-auto">
      {/* Step indicators */}
      <div className="flex items-center justify-between mb-6">
        {STEPS.map((step, i) => {
          const stepOrder = STATUS_ORDER[step.status];
          const done = stepOrder < currentOrder;
          const active = stepOrder === currentOrder;
          return (
            <div key={step.status} className="flex items-center flex-1 last:flex-none">
              <div
                className={cn(
                  "w-7 h-7 rounded-full flex items-center justify-center text-xs flex-shrink-0 transition-all duration-500",
                  done && "bg-emerald-500/20 text-emerald-400 ring-1 ring-emerald-500/30",
                  active && "bg-brand-500/20 text-brand-400 ring-2 ring-brand-500/40 shadow-lg shadow-brand-500/20",
                  !done && !active && "bg-white/[0.04] text-white/20 ring-1 ring-white/[0.06]"
                )}
              >
                {done ? (
                  <Check className="w-3.5 h-3.5" />
                ) : active ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <span className="text-[10px] font-medium">{i + 1}</span>
                )}
              </div>
              {i < STEPS.length - 1 && (
                <div className="h-px flex-1 mx-2">
                  <div
                    className={cn(
                      "h-full rounded-full transition-all duration-700",
                      done ? "bg-emerald-500/40" : "bg-white/[0.04]"
                    )}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Progress bar */}
      <div className="h-1 bg-white/[0.04] rounded-full overflow-hidden mb-4">
        <div
          className="h-full rounded-full bg-gradient-to-r from-brand-500 to-brand-400 transition-all duration-700"
          style={{
            width: `${(event?.progress ?? 0) * 100}%`,
            boxShadow: "0 0 12px rgba(249, 115, 22, 0.3)",
          }}
        />
      </div>

      {/* Status message */}
      <p className="text-sm text-white/40 text-center font-medium">
        {event?.message ?? "Preparing analysis…"}
      </p>
    </div>
  );
}
