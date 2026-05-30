"use client";

import Link from "next/link";
import { Brain, BookOpen, ArrowLeft, ExternalLink, Layers, Target, Sparkles, Cpu, GitCompare, FlaskConical } from "lucide-react";
import { Card, CardTitle } from "@/components/ui/card";
import { UserMenu } from "@/components/UserMenu";
import { ThemeToggle } from "@/components/ThemeToggle";

export default function MethodologyPage() {
  return (
    <div className="min-h-screen">
      <header className="nav-backdrop border-b border-white/[0.06] px-4 sm:px-6 py-3 sm:py-4 sticky top-0 z-10 backdrop-blur-xl bg-[#07060b]/80">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3 group">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center shadow-lg shadow-brand-500/20">
              <Brain className="w-4 h-4 text-white" />
            </div>
            <span className="font-[family-name:var(--font-display)] text-white font-semibold text-lg">NeuroPeer</span>
          </Link>
          <div className="flex items-center gap-2 sm:gap-4">
            <Link href="/" className="hidden sm:block text-sm text-white/40 hover:text-white/70 transition-colors">Analyze</Link>
            <Link href="/presentations" className="hidden sm:block text-sm text-white/40 hover:text-white/70 transition-colors">Presentations</Link>
            <span className="text-sm text-brand-400 font-medium">Methodology</span>
            <ThemeToggle />
            <UserMenu />
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
        {/* ── Hero ──────────────────────────────────────────────────────────── */}
        <div className="text-center mb-12 sm:mb-16">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-brand-500/10 border border-brand-500/20 text-brand-400 text-xs font-medium mb-6">
            <BookOpen className="w-3.5 h-3.5" />
            Technical Manifesto
          </div>
          <h1 className="font-[family-name:var(--font-display)] text-3xl sm:text-4xl lg:text-5xl font-bold text-white mb-4 leading-tight">
            The Science Behind NeuroPeer
          </h1>
          <p className="text-white/40 text-base sm:text-lg max-w-2xl mx-auto leading-relaxed">
            How we bridge ORCLE — our six-stream multimodal brain encoding model — to neuromarketing, predicting how brains respond to your content without a single participant.
          </p>
        </div>

        {/* ═══════════════════════════════════════════════════════════════════ */}
        {/* PART I: ORCLE                                                       */}
        {/* ═══════════════════════════════════════════════════════════════════ */}

        <div className="mb-6 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-brand-500/10 border border-brand-500/20 flex items-center justify-center">
            <Cpu className="w-4 h-4 text-brand-400" />
          </div>
          <div>
            <h2 className="font-[family-name:var(--font-display)] text-xl sm:text-2xl font-bold text-white">Part I: ORCLE</h2>
            <p className="text-xs text-white/30">Omnimodal Response Cortical Latent Encoder · NeuroPeer Proprietary</p>
          </div>
        </div>

        <Card className="mb-6">
          <div className="space-y-4 text-sm text-white/50 leading-relaxed">
            <p>
              <span className="text-white/80 font-semibold">ORCLE</span> (Omnimodal Response Cortical Latent Encoder) is a six-stream multimodal transformer that predicts human brain activity — specifically, fMRI BOLD signals across the entire cortical surface — from video, audio, language, OCR/on-screen text, and optional visual-language (V-L) and visual-language-audio (V-L-A) reasoning streams.
            </p>
            <p>
              ORCLE inherits the three-stage frozen-backbone pipeline architecture pioneered by d&apos;Ascoli et al. but extends it with two capabilities critical for marketing and presentation content scoring: <span className="text-white/70">OCR/on-screen text modality</span> (marketing UGC is dominated by text overlays, CTAs, and captions) and <span className="text-white/70">demographic conditioning</span> (synthesized persona embeddings enable per-audience neural predictions without per-subject fMRI data).
            </p>
          </div>
        </Card>

        {/* Architecture */}
        <Card className="mb-6">
          <CardTitle>Architecture — Six Modality Streams</CardTitle>
          <div className="mt-4 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {[
                { name: "V-JEPA 2.1 ViT-G", desc: "Video encoder. Processes 64-frame segments (4s). Spatiotemporal visual features from a ViT-Giant backbone.", icon: "🎥", dim: "D=384" },
                { name: "Whisper-large-v3-turbo", desc: "Audio encoder. Resampled to 2 Hz. Captures acoustic features, speech prosody, and music.", icon: "🎧", dim: "D=384" },
                { name: "Qwen3.5-9B", desc: "Text encoder. 4,096-token context mapped to 2 Hz. Contextualized language embeddings with superior multilingual coverage.", icon: "📝", dim: "D=384" },
                { name: "PP-OCRv5 + Qwen3-VL-2B", desc: "OCR stream. Detects and encodes on-screen text, captions, CTAs — the dominant visual-text layer in marketing UGC.", icon: "🔤", dim: "D=384" },
                { name: "V-L Reasoning", desc: "Optional visual-language reasoning stream via ModernBERT-large cross-attention with video features.", icon: "🔗", dim: "D=384" },
                { name: "V-L-A Reasoning", desc: "Optional full multimodal reasoning combining visual, language, and audio for complex content analysis.", icon: "🧠", dim: "D=384" },
              ].map((enc) => (
                <div key={enc.name} className="glass-card p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-lg">{enc.icon}</span>
                    <span className="text-[10px] text-brand-400 font-mono">{enc.dim}</span>
                  </div>
                  <p className="text-xs text-white/70 font-semibold">{enc.name}</p>
                  <p className="text-[11px] text-white/35 mt-1 leading-relaxed">{enc.desc}</p>
                </div>
              ))}
            </div>
            <div className="glass-card p-4 text-sm text-white/50 leading-relaxed">
              <p>
                The six embedding streams are each compressed to <span className="text-brand-400 font-mono">D=384</span>, concatenated into <span className="text-brand-400 font-mono">D_model=2304</span>, and fed into a <span className="text-white/70">2 Hz fusion transformer</span> that captures cross-modal temporal alignment over a 100-second window.
              </p>
              <p className="mt-3">
                Outputs pass through a <span className="text-white/70">1/TR prediction transformer</span> that decimates to <span className="text-brand-400 font-semibold">1 Hz</span> (matching fMRI acquisition rate), then through a MedARC-style group-head + subject-residual decoder to <span className="text-brand-400 font-semibold">20,484 cortical vertices</span> on the fsaverage5 mesh plus 8,802 subcortical voxels. Demographic conditioning (age x gender x region persona embeddings) enables per-audience predictions without individual fMRI data.
              </p>
            </div>
          </div>
        </Card>

        {/* Training & Performance */}
        <Card className="mb-6">
          <CardTitle>Training & Performance</CardTitle>
          <div className="mt-4 space-y-3 text-sm text-white/50 leading-relaxed">
            <p>
              ORCLE builds upon a foundation of <span className="text-white/70 font-semibold">451.6+ hours of fMRI</span> data from naturalistic viewing studies — subjects watching movies, listening to podcasts, and viewing silent videos — augmented with proprietary training on marketing and presentation content annotations.
            </p>
            <p>
              The model achieves group-level cortical prediction at <span className="text-white/70">r &ge; 0.4</span> on held-out subjects with zero-shot generalization. The six-stream architecture enables marketing-specific capabilities that no prior brain encoding model provides: reading on-screen text, scoring per-demographic audience segments, and reasoning across modalities simultaneously.
            </p>
            <p>
              Historically, the TRIBE v1 architecture (d&apos;Ascoli et al.) won the <span className="text-brand-400">Algonauts 2025 competition</span>, placing first among 263 teams. ORCLE builds upon and extends this lineage with six modalities, demographic conditioning, and custom training for commercial content scoring.
            </p>
          </div>
        </Card>

        {/* In-Silico Validation */}
        <Card className="mb-10">
          <CardTitle>In-Silico Validation</CardTitle>
          <div className="mt-4 space-y-3 text-sm text-white/50 leading-relaxed">
            <p>
              ORCLE recovers classic neuroscience landmarks with no explicit supervision:
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 my-4">
              {[
                { area: "Fusiform Face Area (FFA)", what: "Face-selective region — lights up for faces vs. objects" },
                { area: "Parahippocampal Place Area (PPA)", what: "Scene-selective region — responds to places and environments" },
                { area: "Temporo-Parietal Junction (TPJ)", what: "Theory of mind — social cognition and emotional processing" },
                { area: "Broca's Area", what: "Syntax processing — activated by linguistic structure" },
              ].map((v) => (
                <div key={v.area} className="glass-card p-3">
                  <p className="text-xs text-white/70 font-semibold">{v.area}</p>
                  <p className="text-[11px] text-white/30 mt-0.5">{v.what}</p>
                </div>
              ))}
            </div>
            <p>
              ICA on the final Transformer layer reveals six emergent functional networks: <span className="text-white/70">primary auditory, language, motion, default mode, visual, and text-processing</span> — mirroring the brain&apos;s own functional architecture plus the novel OCR-driven text comprehension pathway.
            </p>
          </div>
        </Card>

        {/* ═══════════════════════════════════════════════════════════════════ */}
        {/* PART II: THE BRIDGE                                                */}
        {/* ═══════════════════════════════════════════════════════════════════ */}

        <div className="mb-6 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-teal-500/10 border border-teal-500/20 flex items-center justify-center">
            <Layers className="w-4 h-4 text-teal-400" />
          </div>
          <div>
            <h2 className="font-[family-name:var(--font-display)] text-xl sm:text-2xl font-bold text-white">Part II: The Bridge to Neuromarketing</h2>
            <p className="text-xs text-white/30">NeuroPeer&apos;s Application Layer</p>
          </div>
        </div>

        <Card className="mb-6 !border-teal-500/15">
          <div className="space-y-4 text-sm text-white/50 leading-relaxed">
            <p className="text-white/70 font-medium">
              ORCLE provides the cortical prediction substrate. Everything below is NeuroPeer&apos;s downstream interpretation — mapping raw neural activations to marketing-relevant metrics.
            </p>
            <p>
              The global neuromarketing market reached <span className="text-white/70">$1.74B in 2024</span> with 9.2% CAGR through 2032. Traditional methods — EEG headsets, eye-trackers, GSR sensors — require physical participants, specialized labs, and weeks of lead time. NeuroPeer replaces all of this with a single API call.
            </p>
            <p>
              The scientific basis: <span className="text-white/70">small-sample brain activity reliably predicts population-level outcomes</span>. Falk et al. (2012) showed that neural responses from just 30 people predict campaign success at scale. Genevsky et al. (2025) demonstrated that NAcc-based affect signals generalize across demographics while behavioral self-reports do not. ORCLE&apos;s in-silico brain serves as an idealized &ldquo;neural focus group&rdquo; — free from the noise of real scanners, wandering thoughts, and individual variability.
            </p>
          </div>
        </Card>

        {/* The Metric Pipeline */}
        <Card className="mb-6">
          <CardTitle>The Metric Pipeline</CardTitle>
          <div className="mt-4 space-y-4 text-sm text-white/50 leading-relaxed">
            <p>
              ORCLE outputs 20,484 vertex activations per second. NeuroPeer aggregates these into interpretable neuromarketing metrics through three stages:
            </p>

            <div className="space-y-3">
              <div className="glass-card p-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs font-bold text-brand-400 bg-brand-500/10 px-2 py-0.5 rounded">1</span>
                  <span className="text-xs text-white/70 font-semibold">Atlas Parcellation</span>
                </div>
                <p className="text-[11px] text-white/40 leading-relaxed">
                  Raw vertices are grouped into anatomical regions using the Schaefer-1000 atlas on the fsaverage5 surface. This maps 20,484 vertices onto ~1,000 cortical parcels with known functional labels (visual, auditory, default mode, frontoparietal, etc.).
                </p>
              </div>

              <div className="glass-card p-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs font-bold text-brand-400 bg-brand-500/10 px-2 py-0.5 rounded">2</span>
                  <span className="text-xs text-white/70 font-semibold">ROI Aggregation</span>
                </div>
                <p className="text-[11px] text-white/40 leading-relaxed">
                  Parcels are grouped into functional regions of interest (ROIs) based on published neuroscience: Ventral Striatum for reward, Amygdala for emotion, Hippocampus for memory, Dorsal Attention Network for sustained focus, Default Mode Network for disengagement, etc. Mean activation per ROI is computed per second.
                </p>
              </div>

              <div className="glass-card p-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs font-bold text-brand-400 bg-brand-500/10 px-2 py-0.5 rounded">3</span>
                  <span className="text-xs text-white/70 font-semibold">GTM Metric Computation</span>
                </div>
                <p className="text-[11px] text-white/40 leading-relaxed">
                  ROI time-series are transformed into 18+ marketing-aligned metrics using temporal windowing, peak detection, and cross-regional correlation. For example: Hook Score = NAcc activation in the first 3 seconds; Memory Encoding = hippocampal peak near brand moments; Mind Wandering = default mode network activation during content.
                </p>
              </div>
            </div>
          </div>
        </Card>

        {/* Brain Region → Metric Mapping */}
        <Card className="mb-6">
          <CardTitle>Brain Region → Metric Mapping</CardTitle>
          <p className="text-[10px] text-white/25 mt-1 mb-4">NeuroPeer&apos;s application-layer interpretation · downstream from ORCLE predictions</p>
          <div className="space-y-0">
            {[
              { region: "Ventral Striatum (NAcc)", metric: "Hook Score, Reward Prediction", role: "Approach motivation and reward anticipation. Activation in the first 3 seconds predicts scroll-stop behavior.", cite: "Tong et al. 2020, PNAS" },
              { region: "Anterior Insula (AIns)", metric: "Valence Detection, Avoidance Signal", role: "Negative affect and avoidance drive. Inverse signal — high AIns = the viewer wants to leave.", cite: "Genevsky et al. 2025, PNAS Nexus" },
              { region: "Dorsal Attention Network", metric: "Sustained Attention", role: "Top-down attentional control. Tracks whether the viewer is actively engaged or passively watching.", cite: "Hasson et al. 2004, Science" },
              { region: "Hippocampal Formation", metric: "Memory Encoding", role: "Long-term memory consolidation. Predicts brand recall 24–72 hours post-exposure.", cite: "Wagner et al. 1998, Science" },
              { region: "Default Mode Network", metric: "Mind Wandering (inverse)", role: "Self-referential thought and disengagement. High DMN during content = the viewer has checked out.", cite: "Christoff et al. 2009, PNAS" },
              { region: "Amygdala + Limbic System", metric: "Emotional Arousal", role: "Affective intensity regardless of valence. Emotional peaks enhance memory consolidation and sharing.", cite: "Nummenmaa et al. 2012, PNAS" },
              { region: "Broca's + Wernicke's Areas", metric: "Message Clarity", role: "Language comprehension load. High activation with low cognitive load = clear message delivery.", cite: "Hickok & Poeppel 2007, Nat Rev Neuro" },
              { region: "mPFC + Orbitofrontal Cortex", metric: "Aesthetic Quality", role: "Beauty judgment and subjective value computation. Correlates with perceived production quality.", cite: "Vartanian & Skov 2014, Neuropsychologia" },
              { region: "Temporo-Parietal Junction", metric: "Re-engagement, Social Cognition", role: "Theory of mind and attentional reorienting. Fires at narrative twists, pattern interrupts, and social cues.", cite: "Corbetta & Shulman 2002, Nat Rev Neuro" },
            ].map((br) => (
              <div key={br.region} className="flex items-start gap-3 py-3 border-b border-white/[0.04] last:border-0">
                <div className="w-2 h-2 rounded-full bg-brand-400 mt-1.5 flex-shrink-0" />
                <div className="flex-1">
                  <p className="text-sm text-white/70 font-semibold">{br.region}</p>
                  <p className="text-[11px] text-white/40 mt-0.5">
                    <span className="text-brand-400 font-medium">{br.metric}</span> — {br.role}
                  </p>
                  <p className="text-[10px] text-white/20 mt-0.5 italic">{br.cite}</p>
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* ═══════════════════════════════════════════════════════════════════ */}
        {/* PART III: THE MISSION                                              */}
        {/* ═══════════════════════════════════════════════════════════════════ */}

        <div className="mb-6 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
            <Target className="w-4 h-4 text-amber-400" />
          </div>
          <div>
            <h2 className="font-[family-name:var(--font-display)] text-xl sm:text-2xl font-bold text-white">Part III: The Mission</h2>
            <p className="text-xs text-white/30">Why This Matters</p>
          </div>
        </div>

        <Card className="mb-6 !border-amber-500/15">
          <div className="space-y-4 text-sm text-white/50 leading-relaxed">
            <p className="text-white/70 font-medium text-base">
              Every piece of content is a neural experiment. Most marketers run it blind.
            </p>
            <p>
              A 30-second pre-roll ad triggers millions of neural computations — visual salience in V1, face recognition in the fusiform gyrus, reward anticipation in the nucleus accumbens, narrative comprehension in the temporal pole, memory encoding in the hippocampus. Each of these happens in the first few seconds, before any click, like, or comment.
            </p>
            <p>
              Traditional A/B testing measures the <span className="text-white/70">output</span> (did they click?) but not the <span className="text-white/70">process</span> (why did their brain decide to click?). NeuroPeer provides the process. When your Hook Score is 42 but your Emotional Resonance is 88, you know the problem isn&apos;t the content — it&apos;s the first 3 seconds. That&apos;s a fundamentally different insight than &ldquo;CTR was low.&rdquo;
            </p>
            <p>
              The goal is not to replace human creativity. It&apos;s to give creators a <span className="text-brand-400 font-medium">neural mirror</span> — a way to see how brains will respond before a single viewer watches. Iterate on the neural response, not the engagement metrics. The engagement follows.
            </p>
          </div>
        </Card>

        {/* What NeuroPeer Does NOT Do */}
        <Card className="mb-6">
          <CardTitle>What NeuroPeer Does NOT Do</CardTitle>
          <div className="mt-4 space-y-2">
            {[
              "We do not claim to read individual minds. ORCLE predicts population-average neural responses — an idealized brain, not your brain.",
              "We do not replace real neuroscience research. The metric mappings are grounded in published literature but are interpretive, not diagnostic.",
              "We do not guarantee marketing outcomes. Neural predictions correlate with engagement but are one signal among many — creative strategy, distribution, timing, and audience all matter.",
            ].map((item, i) => (
              <div key={i} className="flex items-start gap-2.5 py-1.5">
                <span className="text-white/15 text-xs mt-0.5">—</span>
                <p className="text-xs text-white/40 leading-relaxed">{item}</p>
              </div>
            ))}
          </div>
        </Card>

        {/* ═══════════════════════════════════════════════════════════════════ */}
        {/* PART IV: RESEARCH FOUNDATION                                       */}
        {/* ═══════════════════════════════════════════════════════════════════ */}

        <div className="mb-6 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-purple-500/10 border border-purple-500/20 flex items-center justify-center">
            <FlaskConical className="w-4 h-4 text-purple-400" />
          </div>
          <div>
            <h2 className="font-[family-name:var(--font-display)] text-xl sm:text-2xl font-bold text-white">Part IV: Research Foundation</h2>
            <p className="text-xs text-white/30">The Papers Behind the Metrics</p>
          </div>
        </div>

        <div className="space-y-3 mb-10">
          {[
            { authors: "d'Ascoli, Rapin et al. (2026)", journal: "Meta FAIR", finding: "TRIBE v2 predicts fMRI across video/audio/text with zero-shot generalization. 451.6h training data, 20,484 cortical vertices, 1 Hz resolution.", application: "Foundational architecture that ORCLE extends with six modalities and demographic conditioning." },
            { authors: "Tong, Mondloch, Bhatt et al. (2020)", journal: "PNAS", finding: "NAcc + anterior insula activation at video onset predicts YouTube view frequency at population scale.", application: "Hook Score — first 3 seconds predict scroll-stop behavior." },
            { authors: "Genevsky, Yoon & Knutson (2025)", journal: "PNAS Nexus", finding: "NAcc-based affect signals generalize across demographics; behavioral self-reports do not.", application: "Neural signals outperform surveys — affect is universal." },
            { authors: "Chan, Hiaeshutter-Rice et al. (2024)", journal: "Journal of Marketing Research", finding: "Emotion and memory encoding are the earliest neural predictors of ad liking, preceding behavioral responses.", application: "Emotional Resonance and Memory Encoding weighted heavily in the first 10 seconds." },
            { authors: "Falk, Berkman & Lieberman (2012)", journal: "Psychological Science", finding: "Small-sample brain activity (n=30) predicts population-level media sharing and campaign success.", application: "Validates in-silico prediction of population-level engagement from neural data." },
            { authors: "Hasson, Nir, Levy et al. (2004)", journal: "Science 303(5664)", finding: "Intersubject synchronization of cortical activity during natural vision correlates with narrative engagement.", application: "Sustained Attention metric — cortical synchrony over time." },
            { authors: "Itti & Koch (2001)", journal: "Nature Reviews Neuroscience", finding: "Computational saliency maps predict visual attention allocation and fixation patterns.", application: "Visual Hook Strength — saliency-driven attention in first frames." },
            { authors: "Wagner, Schacter et al. (1998)", journal: "Science 281(5380)", finding: "Hippocampal activity during encoding predicts subsequent memory — the 'subsequent memory effect'.", application: "Memory Encoding metric predicts brand recall." },
            { authors: "Nummenmaa, Glerean et al. (2012)", journal: "PNAS 109(23)", finding: "Emotions promote social interaction by synchronizing brain activity across individuals.", application: "Emotional Resonance — synchronized limbic activation predicts sharing." },
            { authors: "Christoff, Gordon et al. (2009)", journal: "PNAS 106(21)", finding: "Default mode network activation during task indicates mind wandering.", application: "Drop-off Risk — DMN activation signals disengagement." },
          ].map((study) => (
            <Card key={study.authors} className="!py-4">
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-brand-500/10 border border-brand-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <ExternalLink className="w-3 h-3 text-brand-400" />
                </div>
                <div>
                  <p className="text-sm text-white/70 font-medium">{study.authors} — <span className="text-white/35 font-normal">{study.journal}</span></p>
                  <p className="text-xs text-white/40 mt-1 leading-relaxed">&ldquo;{study.finding}&rdquo;</p>
                  <p className="text-[11px] text-brand-400/70 mt-1.5">→ {study.application}</p>
                </div>
              </div>
            </Card>
          ))}
        </div>

        {/* ── Footer CTA ────────────────────────────────────────────────── */}
        <Card className="!border-brand-500/20 text-center !py-8 mb-8">
          <p className="text-white/40 text-sm mb-4">
            Ready to see what your content does to a brain?
          </p>
          <Link href="/" className="inline-flex items-center gap-2 px-6 py-2.5 bg-gradient-to-r from-brand-500 to-brand-600 text-white text-sm font-medium rounded-xl shadow-lg shadow-brand-500/20 hover:shadow-brand-500/30 transition-shadow">
            <Brain className="w-4 h-4" />
            Run a Neural Analysis
          </Link>
        </Card>

        <div className="text-center py-4">
          <Link href="/" className="inline-flex items-center gap-2 text-sm text-brand-400 hover:text-brand-300 transition-colors">
            <ArrowLeft className="w-4 h-4" /> Back to NeuroPeer
          </Link>
        </div>
      </main>
    </div>
  );
}
