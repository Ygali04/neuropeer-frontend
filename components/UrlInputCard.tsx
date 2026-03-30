"use client";

import { useState } from "react";
import { Send, Loader2, GitCompare, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { ContentType } from "@/lib/types";

const CONTENT_TYPES: { value: ContentType; label: string; desc: string; icon: string }[] = [
  { value: "instagram_reel", label: "Instagram Reel", desc: "15–60s · Hook 35%", icon: "📱" },
  { value: "youtube_preroll", label: "YouTube Pre-roll", desc: "6–30s · Hook 40%", icon: "▶" },
  { value: "product_demo", label: "Product Demo", desc: "2–5 min · Memory", icon: "🎯" },
  { value: "conference_talk", label: "Conference Talk", desc: "3–10 min · Clarity", icon: "🎤" },
  { value: "podcast_audio", label: "Podcast Clip", desc: "1–5 min · Narration", icon: "🎧" },
  { value: "custom", label: "Custom", desc: "Configure weights", icon: "⚙" },
];

interface CustomWeights {
  hook_importance: number;       // 0-100: how critical is the opening hook
  attention_sustain: number;     // 0-100: expected sustained attention need
  emotional_depth: number;       // 0-100: emotional impact priority
  memory_retention: number;      // 0-100: brand/message recall importance
  pacing_tolerance: number;      // 0-100: tolerance for slow pacing (low = fast-paced)
  cta_strength: number;          // 0-100: call-to-action importance
}

const DEFAULT_WEIGHTS: CustomWeights = {
  hook_importance: 50,
  attention_sustain: 50,
  emotional_depth: 50,
  memory_retention: 50,
  pacing_tolerance: 50,
  cta_strength: 50,
};

const WEIGHT_CONFIG: { key: keyof CustomWeights; label: string; lowLabel: string; highLabel: string; desc: string }[] = [
  { key: "hook_importance", label: "Hook Importance", lowLabel: "Soft open", highLabel: "Instant grab", desc: "How critical are the first 3 seconds?" },
  { key: "attention_sustain", label: "Sustained Attention", lowLabel: "Brief glances", highLabel: "Deep focus", desc: "Expected viewer watch duration" },
  { key: "emotional_depth", label: "Emotional Depth", lowLabel: "Informational", highLabel: "Deeply emotional", desc: "How much emotional resonance matters" },
  { key: "memory_retention", label: "Memory & Recall", lowLabel: "Awareness", highLabel: "Must remember", desc: "Brand/message recall importance" },
  { key: "pacing_tolerance", label: "Pacing Style", lowLabel: "Fast-cut", highLabel: "Slow build", desc: "Content pacing and rhythm" },
  { key: "cta_strength", label: "CTA Priority", lowLabel: "Brand only", highLabel: "Drive action", desc: "How important is the call-to-action?" },
];

interface Props {
  onSubmit: (url: string, contentType: ContentType) => Promise<void>;
  loading?: boolean;
  showCompareOption?: boolean;
  onCompare?: () => void;
}

export function UrlInputCard({ onSubmit, loading = false, showCompareOption = false, onCompare }: Props) {
  const [url, setUrl] = useState("");
  const [contentType, setContentType] = useState<ContentType>("custom");
  const [error, setError] = useState("");
  const [customWeights, setCustomWeights] = useState<CustomWeights>(DEFAULT_WEIGHTS);
  const [showSliders, setShowSliders] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!url.trim()) {
      setError("Please enter a video URL.");
      return;
    }
    try {
      await onSubmit(url.trim(), contentType);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Submission failed.");
    }
  };

  const updateWeight = (key: keyof CustomWeights, value: number) => {
    setCustomWeights((prev) => ({ ...prev, [key]: value }));
  };

  return (
    <div className="glass-card p-6 sm:p-8">
      <form onSubmit={handleSubmit} className="flex flex-col gap-6">
        {/* URL input */}
        <div>
          <label className="block text-xs font-medium text-white/40 uppercase tracking-wider mb-2.5">
            Video URL
          </label>
          <div className="relative">
            <Input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://youtube.com/watch?v=... or direct MP4 link"
              disabled={loading}
              autoFocus
              className="pr-12"
            />
            <div className="absolute right-3 top-1/2 -translate-y-1/2">
              <div className="w-6 h-6 rounded-md bg-brand-500/10 flex items-center justify-center">
                <Send className="w-3 h-3 text-brand-400" />
              </div>
            </div>
          </div>
        </div>

        {/* Content type selector */}
        <div>
          <label className="block text-xs font-medium text-white/40 uppercase tracking-wider mb-2.5">
            Content Type
          </label>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {CONTENT_TYPES.map((ct) => (
              <button
                key={ct.value}
                type="button"
                onClick={() => {
                  setContentType(ct.value);
                  if (ct.value === "custom") setShowSliders(true);
                  else setShowSliders(false);
                }}
                className={cn(
                  "flex items-start gap-2.5 px-3 py-2.5 rounded-xl border text-left transition-all duration-200",
                  contentType === ct.value
                    ? "border-brand-500/40 bg-brand-500/[0.08] shadow-sm shadow-brand-500/10"
                    : "border-white/[0.06] bg-white/[0.02] hover:border-white/[0.12] hover:bg-white/[0.04]"
                )}
              >
                <span className="text-sm mt-0.5">{ct.icon}</span>
                <div>
                  <span className={cn("font-medium text-sm block", contentType === ct.value ? "text-brand-300" : "text-white/60")}>
                    {ct.label}
                  </span>
                  <span className="text-[10px] text-white/25 leading-tight">{ct.desc}</span>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Custom weight sliders — only when "Custom" is selected */}
        {contentType === "custom" && showSliders && (
          <div className="border-t border-white/[0.06] pt-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <SlidersHorizontal className="w-3.5 h-3.5 text-brand-400" />
                <span className="text-xs font-medium text-white/50 uppercase tracking-wider">
                  Analysis Weights
                </span>
              </div>
              <button
                type="button"
                onClick={() => setCustomWeights(DEFAULT_WEIGHTS)}
                className="text-[10px] text-white/25 hover:text-white/40 transition-colors"
              >
                Reset to defaults
              </button>
            </div>

            <div className="space-y-4">
              {WEIGHT_CONFIG.map(({ key, label, lowLabel, highLabel, desc }) => (
                <div key={key}>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs text-white/50 font-medium">{label}</span>
                    <span className="text-[10px] text-brand-400 tabular-nums font-medium">
                      {customWeights[key]}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={customWeights[key]}
                    onChange={(e) => updateWeight(key, parseInt(e.target.value))}
                    className="w-full h-1 rounded-full appearance-none cursor-pointer
                      [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:h-3.5
                      [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-brand-400
                      [&::-webkit-slider-thumb]:shadow-[0_0_6px_rgba(249,115,22,0.4)]
                      [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-[#07060b]
                      [&::-webkit-slider-runnable-track]:rounded-full [&::-webkit-slider-runnable-track]:h-1"
                    style={{
                      background: `linear-gradient(to right, rgba(249,115,22,0.5) 0%, rgba(249,115,22,0.5) ${customWeights[key]}%, rgba(255,255,255,0.06) ${customWeights[key]}%, rgba(255,255,255,0.06) 100%)`,
                    }}
                  />
                  <div className="flex justify-between mt-1">
                    <span className="text-[9px] text-white/20">{lowLabel}</span>
                    <span className="text-[9px] text-white/20">{highLabel}</span>
                  </div>
                </div>
              ))}
            </div>

            <p className="text-[10px] text-white/15 mt-3 leading-relaxed">
              These weights adjust how the neural scoring model prioritizes different engagement dimensions for your content.
            </p>
          </div>
        )}

        {error && <p className="text-red-400/80 text-sm px-1">{error}</p>}

        {/* Action buttons */}
        <div className="flex flex-col gap-2">
          <Button type="submit" disabled={loading || !url.trim()} size="lg" className="w-full">
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Analyzing…
              </>
            ) : (
              <>
                <BrainIcon className="w-4 h-4" />
                Run Neural Analysis
              </>
            )}
          </Button>

          {/* A/B Compare option */}
          {showCompareOption && onCompare && (
            <button
              type="button"
              onClick={onCompare}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.04] hover:border-teal-500/20 text-white/40 hover:text-teal-400 transition-all text-sm"
            >
              <GitCompare className="w-4 h-4" />
              A/B Compare Two Videos
            </button>
          )}
        </div>
      </form>
    </div>
  );
}

function BrainIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z" />
      <path d="M12 5a3 3 0 1 1 5.997.125 4 4 0 0 1 2.526 5.77 4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18Z" />
      <path d="M15 13a4.5 4.5 0 0 1-3-4 4.5 4.5 0 0 1-3 4" />
      <path d="M17.599 6.5a3 3 0 0 0 .399-1.375" />
      <path d="M6.003 5.125A3 3 0 0 0 6.401 6.5" />
      <path d="M3.477 10.896a4 4 0 0 1 .585-.396" />
      <path d="M19.938 10.5a4 4 0 0 1 .585.396" />
      <path d="M6 18a4 4 0 0 1-1.967-.516" />
      <path d="M19.967 17.484A4 4 0 0 1 18 18" />
    </svg>
  );
}
