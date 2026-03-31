"use client";

import { Check, Loader2, Download, Mic, Brain, BarChart3, Sparkles, Cpu } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ProgressEvent, JobStatus } from "@/lib/types";

const STAGES: {
  status: JobStatus;
  label: string;
  description: string;
  icon: typeof Download;
  estimate: string;
}[] = [
  {
    status: "queued",
    label: "Queued",
    description: "Waiting for compute resources",
    icon: Cpu,
    estimate: "~5s",
  },
  {
    status: "downloading",
    label: "Downloading Media",
    description: "Fetching video and extracting audio stream",
    icon: Download,
    estimate: "~15-30s",
  },
  {
    status: "transcribing",
    label: "Transcribing Audio",
    description: "Converting speech to text with ElevenLabs Scribe",
    icon: Mic,
    estimate: "~20-60s",
  },
  {
    status: "inferring",
    label: "Simulating Brain Response",
    description: "Running TRIBE v2 across 20,484 cortical vertices",
    icon: Brain,
    estimate: "~2-5min",
  },
  {
    status: "aggregating",
    label: "Mapping Brain Regions",
    description: "Aggregating ROIs via Schaefer-1000 atlas",
    icon: BarChart3,
    estimate: "~15s",
  },
  {
    status: "scoring",
    label: "Computing & AI Analysis",
    description: "18 neural metrics + AI improvement strategies",
    icon: Sparkles,
    estimate: "~30s",
  },
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
  const progress = event?.progress ?? 0;

  return (
    <div className="w-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-brand-400 animate-pulse" />
          <span className="text-xs font-medium text-white/50 uppercase tracking-wider">Analysis in progress</span>
        </div>
        <span className="text-[10px] text-white/25 tabular-nums">{Math.round(progress * 100)}%</span>
      </div>

      {/* Main progress bar */}
      <div className="h-1.5 bg-white/[0.06] rounded-full overflow-hidden mb-6">
        <div
          className="h-full rounded-full transition-all duration-700 ease-out"
          style={{
            width: `${progress * 100}%`,
            background: "linear-gradient(90deg, var(--color-brand-500), var(--color-brand-400))",
            boxShadow: "0 0 12px rgba(249, 115, 22, 0.3)",
          }}
        />
      </div>

      {/* Stage list */}
      <div className="space-y-1">
        {STAGES.map((stage, i) => {
          const stageOrder = STATUS_ORDER[stage.status];
          const done = stageOrder < currentOrder;
          const active = stageOrder === currentOrder;
          const future = stageOrder > currentOrder;
          const Icon = stage.icon;

          return (
            <div
              key={stage.status}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-500",
                active && "bg-brand-500/[0.08] border border-brand-500/20",
                done && "opacity-60",
                future && "opacity-30",
                !active && "border border-transparent"
              )}
            >
              {/* Status icon */}
              <div
                className={cn(
                  "w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 transition-all duration-500",
                  done && "bg-emerald-500/15 text-emerald-400",
                  active && "bg-brand-500/15 text-brand-400",
                  future && "bg-white/[0.03] text-white/15"
                )}
              >
                {done ? (
                  <Check className="w-4 h-4" />
                ) : active ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Icon className="w-4 h-4" />
                )}
              </div>

              {/* Label + description */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <span
                    className={cn(
                      "text-sm font-medium transition-colors",
                      done && "text-emerald-400/70",
                      active && "text-white/80",
                      future && "text-white/20"
                    )}
                  >
                    {stage.label}
                  </span>
                  {active && (
                    <span className="text-[10px] text-brand-400/60 tabular-nums">{stage.estimate}</span>
                  )}
                  {done && (
                    <Check className="w-3 h-3 text-emerald-400/50" />
                  )}
                </div>
                {active && (
                  <p className="text-[11px] text-white/35 mt-0.5 leading-relaxed">
                    {event?.message || stage.description}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Bottom estimate */}
      <div className="mt-4 pt-3 border-t border-white/[0.04] text-center">
        <p className="text-[10px] text-white/20">
          Full analysis typically takes 4–7 minutes depending on video length
        </p>
      </div>
    </div>
  );
}
