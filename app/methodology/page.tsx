"use client";

import Link from "next/link";
import { Brain, Zap, Activity, Sparkles, BookOpen, ArrowLeft, ExternalLink } from "lucide-react";
import { Card, CardTitle } from "@/components/ui/card";
import { UserMenu } from "@/components/UserMenu";

const STUDIES = [
  {
    authors: "Tong et al. (2020)",
    journal: "PNAS",
    finding: "NAcc + anterior insula activation at video onset predicts YouTube view frequency at population scale.",
    application: "Hook Score metric — first 3 seconds predict scroll-stop behavior.",
  },
  {
    authors: "Chan et al. (2024)",
    journal: "Journal of Marketing Research",
    finding: "Emotion and memory encoding are the earliest neural predictors of ad liking, preceding behavioral responses.",
    application: "Emotional Resonance and Memory Encoding weighted heavily in first 10 seconds.",
  },
  {
    authors: "d'Ascoli et al. (2026)",
    journal: "Meta FAIR",
    finding: "TRIBE v2 predicts fMRI across video/audio/text with zero-shot generalization to unseen stimuli.",
    application: "Core inference engine — 20,484 cortical vertex predictions at 1 Hz.",
  },
  {
    authors: "Falk et al. (2012)",
    journal: "Psychological Science",
    finding: "Small-sample brain activity (n=30) predicts population-level media sharing and campaign success.",
    application: "Validates in-silico prediction of population-level engagement from neural data.",
  },
  {
    authors: "Genevsky et al. (2025)",
    journal: "PNAS Nexus",
    finding: "NAcc-based affect signals generalize across demographics; behavioral self-reports do not.",
    application: "Neural signals outperform surveys because affect is universal — NeuroPeer leverages this.",
  },
  {
    authors: "Hasson et al. (2004)",
    journal: "Science 303(5664)",
    finding: "Intersubject synchronization of cortical activity during natural vision correlates with narrative engagement.",
    application: "Sustained Attention metric — measures cortical synchrony patterns over time.",
  },
  {
    authors: "Itti & Koch (2001)",
    journal: "Nature Reviews Neuroscience",
    finding: "Computational saliency maps predict visual attention allocation and fixation patterns.",
    application: "Visual Hook Strength — saliency-driven attention capture in first frames.",
  },
];

const BRAIN_REGIONS = [
  { region: "Ventral Striatum (NAcc)", metric: "Hook Score, Reward Prediction", role: "Approach motivation, reward anticipation" },
  { region: "Anterior Insula (AIns)", metric: "Hook Score (inverse), Valence", role: "Avoidance, negative affect detection" },
  { region: "Dorsolateral PFC", metric: "Cognitive Load", role: "Working memory, executive control" },
  { region: "Hippocampal Formation", metric: "Memory Encoding", role: "Long-term memory consolidation" },
  { region: "Default Mode Network", metric: "Mind Wandering (inverse)", role: "Self-referential thought, disengagement" },
  { region: "Amygdala + Limbic", metric: "Emotional Arousal", role: "Affective intensity, threat/reward detection" },
  { region: "Broca's + Wernicke's", metric: "Message Clarity", role: "Language processing, comprehension" },
  { region: "mPFC + OFC", metric: "Aesthetic Quality", role: "Beauty judgment, value computation" },
  { region: "TPJ", metric: "Re-engagement, Social Cognition", role: "Theory of mind, attentional reorienting" },
];

export default function MethodologyPage() {
  return (
    <div className="min-h-screen">
      <header className="border-b border-white/[0.06] px-6 py-4 sticky top-0 z-10 backdrop-blur-xl bg-[#07060b]/80">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3 group">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center shadow-lg shadow-brand-500/20">
              <Brain className="w-4 h-4 text-white" />
            </div>
            <span className="font-[family-name:var(--font-display)] text-white font-semibold text-lg">NeuroPeer</span>
          </Link>
          <div className="flex items-center gap-4">
            <Link href="/" className="text-sm text-white/40 hover:text-white/70 transition-colors">Analyze</Link>
            <span className="text-sm text-brand-400 font-medium">Methodology</span>
            <UserMenu />
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-12">
        {/* Hero */}
        <div className="text-center mb-16">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-brand-500/10 border border-brand-500/20 text-brand-400 text-xs font-medium mb-6">
            <BookOpen className="w-3.5 h-3.5" />
            Scientific Foundation
          </div>
          <h1 className="font-[family-name:var(--font-display)] text-4xl font-bold text-white mb-4">
            How NeuroPeer Works
          </h1>
          <p className="text-white/40 text-lg max-w-2xl mx-auto leading-relaxed">
            NeuroPeer uses Meta&apos;s TRIBE v2 brain encoding model to predict fMRI-level cortical responses to any video stimulus — no participants, no lab, no waiting.
          </p>
        </div>

        {/* TRIBE v2 Architecture */}
        <Card className="mb-8">
          <CardTitle>TRIBE v2 Architecture</CardTitle>
          <div className="mt-4 space-y-4">
            <p className="text-sm text-white/50 leading-relaxed">
              TRIBE v2 is a multimodal brain encoding model trained on 451.6 hours of fMRI data from 25 subjects across 4 naturalistic studies. It combines three state-of-the-art feature extractors into a unified Transformer architecture:
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {[
                { name: "V-JEPA2 (ViT-Giant)", desc: "Video encoder — spatiotemporal visual features", icon: "🎥" },
                { name: "Wav2Vec-BERT 2.0", desc: "Audio encoder — acoustic + speech features", icon: "🎧" },
                { name: "LLaMA 3.2-3B", desc: "Text encoder — contextualized language embeddings", icon: "📝" },
              ].map((enc) => (
                <div key={enc.name} className="glass-card p-3">
                  <span className="text-lg">{enc.icon}</span>
                  <p className="text-xs text-white/70 font-medium mt-1">{enc.name}</p>
                  <p className="text-[10px] text-white/30 mt-0.5">{enc.desc}</p>
                </div>
              ))}
            </div>
            <p className="text-sm text-white/50 leading-relaxed">
              Output: <span className="text-brand-400 font-medium">20,484 cortical vertices</span> on the fsaverage5 mesh at <span className="text-brand-400 font-medium">1 Hz</span> temporal resolution. Each vertex represents predicted fMRI BOLD signal (z-scored) at a specific point on the cortical surface.
            </p>
          </div>
        </Card>

        {/* Neural-to-GTM Mapping */}
        <Card className="mb-8">
          <CardTitle>Brain Region → Metric Mapping</CardTitle>
          <p className="text-xs text-white/30 mt-1 mb-4">Schaefer-1000 atlas parcellation on fsaverage5</p>
          <div className="space-y-2">
            {BRAIN_REGIONS.map((br) => (
              <div key={br.region} className="flex items-start gap-3 py-2 border-b border-white/[0.04] last:border-0">
                <div className="w-2 h-2 rounded-full bg-brand-400 mt-1.5 flex-shrink-0" />
                <div className="flex-1">
                  <p className="text-sm text-white/70 font-medium">{br.region}</p>
                  <p className="text-[11px] text-white/30">
                    <span className="text-brand-400">{br.metric}</span> — {br.role}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* Mission */}
        <Card className="mb-8 !border-brand-500/20">
          <CardTitle>The Goal: Elevate GTM Strategy</CardTitle>
          <div className="mt-4 space-y-3 text-sm text-white/50 leading-relaxed">
            <p>
              The global neuromarketing market reached $1.74B in 2024 with 9.2% CAGR through 2032. Traditional methods — EEG headsets, eye-trackers, GSR sensors — require physical participants, specialized labs, and weeks of lead time.
            </p>
            <p>
              NeuroPeer replaces all of this with a single API call. Paste a video URL, and within minutes you have fMRI-grade neural predictions across 20 GTM metrics: <span className="text-white/70">Hook Score, Emotional Resonance, Memory Encoding, Cognitive Load, Aesthetic Quality</span>, and more.
            </p>
            <p>
              For every every dollar spent on ads — you can <span className="text-brand-400 font-medium">simulate what happens in someone&apos;s brain</span> and optimize for the neural response you want.
            </p>
          </div>
        </Card>

        {/* Research Foundation */}
        <div className="mb-8">
          <h2 className="font-[family-name:var(--font-display)] text-xl font-semibold text-white mb-4 flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-brand-400" />
            Research Foundation
          </h2>
          <div className="space-y-3">
            {STUDIES.map((study) => (
              <Card key={study.authors} className="!py-4">
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-brand-500/10 border border-brand-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <ExternalLink className="w-3 h-3 text-brand-400" />
                  </div>
                  <div>
                    <p className="text-sm text-white/70 font-medium">{study.authors} — <span className="text-white/40 font-normal">{study.journal}</span></p>
                    <p className="text-xs text-white/40 mt-1 leading-relaxed">&ldquo;{study.finding}&rdquo;</p>
                    <p className="text-[11px] text-brand-400/70 mt-1">→ {study.application}</p>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>

        <div className="text-center pt-8 pb-4">
          <Link href="/" className="inline-flex items-center gap-2 text-sm text-brand-400 hover:text-brand-300 transition-colors">
            <ArrowLeft className="w-4 h-4" /> Back to NeuroPeer
          </Link>
        </div>
      </main>
    </div>
  );
}
