"use client";

import { useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  Brain,
  Upload,
  BarChart3,
  RefreshCw,
  ArrowRight,
  CheckCircle2,
  Sparkles,
  Zap,
  Mail,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { UserMenu } from "@/components/UserMenu";
import { ThemeToggle } from "@/components/ThemeToggle";

const METRICS = [
  { name: "Conceptual Hook Strength", description: "Curiosity-driven attention capture during opening", region: "ACC, VTA, Hippocampus" },
  { name: "Speaker Authority Signal", description: "Neural markers of credibility and expertise recognition", region: "Caudate, mPFC, L-PFC" },
  { name: "Discourse Coherence Tracking", description: "Active construction of coherent narrative models", region: "dmPFC, PCC, ATL" },
  { name: "Schema Integration Index", description: "New information integrated into existing knowledge schemas", region: "vmPFC, Hippocampus, Angular Gyrus" },
  { name: "Argument Processing Depth", description: "Depth of logical/analytical processing during arguments", region: "dmPFC, L-IFG, IPS" },
  { name: "Quantitative/Data Processing", description: "Neural engagement with numerical information and data", region: "Bilateral IPS" },
  { name: "Managed Cognitive Load", description: "Optimal zone between boredom and overload", region: "dlPFC, ACC, Hippocampus" },
  { name: "Knowledge Encoding Depth", description: "Depth of episodic and semantic memory encoding", region: "Hippocampus, Angular Gyrus, vmPFC" },
  { name: "Audience Synchrony Proxy", description: "Reliability of cortical responses across viewers", region: "Whole-brain pattern stability" },
  { name: "Conceptual Change / Inhibition", description: "Neural signature of belief updating and paradigm shifts", region: "dlPFC, ACC, Hippocampus" },
  { name: "Section Transition Effectiveness", description: "Neural event segmentation at section boundaries", region: "Hippocampus, Precuneus" },
  { name: "Language-Argument Network Coupling", description: "Connectivity between language parsing and logical reasoning", region: "L-IFG, IPS, dmPFC" },
  { name: "Sustained Engagement Trajectory", description: "Temporal dynamics of engagement over full presentation", region: "DAN vs DMN ratio" },
  { name: "Visual-Verbal Integration", description: "Integration of slides/diagrams with verbal narration", region: "Parietal, STS, dlPFC" },
  { name: "Insight / Understanding Moments", description: "Sudden comprehension breakthroughs — aha moments", region: "ACC, Hippocampus, VTA" },
];

const STEPS = [
  {
    icon: Upload,
    title: "Upload",
    description: "Drop your PPTX + headshot photo. Record your voice or clone from YouTube.",
    color: "text-brand-400",
    bg: "bg-brand-500/10 border-brand-500/20",
  },
  {
    icon: BarChart3,
    title: "Score",
    description: "ORCLE neural analysis + VLM judge score your presentation on 15 neuroscience-grounded metrics.",
    color: "text-teal-400",
    bg: "bg-teal-500/10 border-teal-500/20",
  },
  {
    icon: RefreshCw,
    title: "Iterate",
    description: "AI agent edits slides based on neural feedback. Re-generates narration, avatar, and video. Re-scores until threshold met.",
    color: "text-purple-400",
    bg: "bg-purple-500/10 border-purple-500/20",
  },
];

const PRICING = [
  {
    name: "Starter",
    price: "$4.99",
    unit: "per presentation",
    features: ["1 iteration", "VLM scoring only", "15 metric breakdown", "PDF report export"],
    badge: null,
    highlight: false,
  },
  {
    name: "Pro",
    price: "$9.99",
    unit: "per presentation",
    features: ["3 iterations", "VLM + ORCLE Neural scoring", "AI-powered slide editing", "Voice re-generation"],
    badge: "Coming Soon",
    highlight: true,
  },
  {
    name: "Enterprise",
    price: "Custom",
    unit: "contact us",
    features: ["Unlimited iterations", "API access", "Custom voice cloning", "Dedicated support"],
    badge: "Coming Soon",
    highlight: false,
  },
];

const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.1, duration: 0.5, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] },
  }),
};

export default function PresentationsPage() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const handleWaitlist = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;

    const existing = JSON.parse(localStorage.getItem("neuropeer_waitlist") || "[]");
    if (!existing.includes(email)) {
      existing.push(email);
      localStorage.setItem("neuropeer_waitlist", JSON.stringify(existing));
    }
    setSubmitted(true);
    setEmail("");
  };

  return (
    <div className="min-h-screen flex flex-col">
      {/* Nav */}
      <header className="nav-backdrop border-b border-white/[0.06] px-4 sm:px-6 py-3 sm:py-4 sticky top-0 z-10 backdrop-blur-xl bg-[#07060b]/80">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3 group">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center shadow-lg shadow-brand-500/20">
              <Brain className="w-4 h-4 text-white" />
            </div>
            <span className="font-[family-name:var(--font-display)] text-white font-semibold text-lg tracking-tight">NeuroPeer</span>
          </Link>
          <div className="flex items-center gap-2 sm:gap-4">
            <Link href="/" className="hidden sm:block text-sm text-white/40 hover:text-white/70 transition-colors">Analyze</Link>
            <Link href="/methodology" className="hidden sm:block text-sm text-white/40 hover:text-white/70 transition-colors">Methodology</Link>
            <span className="text-sm text-brand-400 font-medium">Presentations</span>
            <ThemeToggle />
            <UserMenu />
          </div>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero Section */}
        <section className="relative px-4 sm:px-6 py-20 sm:py-32 overflow-hidden">
          <div className="absolute top-20 left-1/2 -translate-x-1/2 w-[90vw] sm:w-[700px] h-[400px] rounded-full bg-gradient-to-b from-brand-500/[0.08] to-transparent blur-3xl pointer-events-none" />

          <div className="max-w-4xl mx-auto text-center relative">
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            >
              <Badge variant="brand" className="mb-8 px-4 py-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-brand-400 animate-[pulse-glow_2s_ease-in-out_infinite]" />
                Talking Presentations
              </Badge>
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
              className="font-[family-name:var(--font-display)] text-3xl sm:text-5xl lg:text-6xl font-bold text-white mb-6 leading-[1.1] tracking-tight"
            >
              AI-Powered Presentation
              <br />
              <span className="text-gradient-brand">Scoring & Iteration</span>
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
              className="text-white/40 text-lg sm:text-xl leading-relaxed max-w-2xl mx-auto mb-12"
            >
              Upload your PPTX. Get a neuroscience-grounded analysis. Iterate until perfect.
            </motion.p>

            {/* Before/After Split */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
              className="max-w-2xl mx-auto"
            >
              <div className="glass-card p-6 sm:p-8">
                <div className="grid grid-cols-2 gap-4 sm:gap-8">
                  {/* Before */}
                  <div className="text-center">
                    <div className="w-20 h-20 sm:w-24 sm:h-24 mx-auto rounded-full flex items-center justify-center border-4 border-red-500/40 bg-red-500/[0.08]">
                      <span className="font-[family-name:var(--font-display)] text-2xl sm:text-3xl font-bold text-red-400">32.5</span>
                    </div>
                    <p className="text-xs sm:text-sm text-white/40 mt-3 font-medium">v1 — Before</p>
                    <p className="text-[10px] text-white/20 mt-1">Marketing metrics penalize lectures</p>
                  </div>

                  {/* After */}
                  <div className="text-center">
                    <div className="w-20 h-20 sm:w-24 sm:h-24 mx-auto rounded-full flex items-center justify-center border-4 border-emerald-500/40 bg-emerald-500/[0.08]">
                      <span className="font-[family-name:var(--font-display)] text-2xl sm:text-3xl font-bold text-emerald-400">78.2</span>
                    </div>
                    <p className="text-xs sm:text-sm text-white/40 mt-3 font-medium">v2 — After Iteration</p>
                    <p className="text-[10px] text-white/20 mt-1">Presentation-calibrated scoring</p>
                  </div>
                </div>

                <div className="flex items-center justify-center gap-2 mt-6 pt-4 border-t border-white/[0.06]">
                  <Sparkles className="w-3.5 h-3.5 text-brand-400" />
                  <p className="text-[11px] text-white/30">Same content. Right metrics. AI-iterated improvements.</p>
                </div>
              </div>
            </motion.div>
          </div>
        </section>

        {/* How It Works */}
        <section className="px-4 sm:px-6 py-16 sm:py-24">
          <div className="max-w-4xl mx-auto">
            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: "-100px" }}
              className="text-center mb-12"
            >
              <motion.div variants={fadeUp} custom={0}>
                <div className="flex items-center justify-center gap-2 mb-4">
                  <div className="w-1 h-4 rounded-full bg-gradient-to-b from-brand-400 to-brand-600" />
                  <h2 className="font-[family-name:var(--font-display)] text-sm font-semibold text-white/60 uppercase tracking-wider">How It Works</h2>
                </div>
                <h3 className="font-[family-name:var(--font-display)] text-2xl sm:text-3xl font-bold text-white">Three steps to a perfect presentation</h3>
              </motion.div>
            </motion.div>

            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: "-50px" }}
              className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6"
            >
              {STEPS.map((step, i) => {
                const Icon = step.icon;
                return (
                  <motion.div key={step.title} variants={fadeUp} custom={i + 1} className="glass-card glass-card-hover p-6 relative overflow-hidden">
                    <div className="absolute -top-8 -right-8 w-24 h-24 rounded-full bg-brand-500/[0.03] blur-xl" />
                    <div className={`w-10 h-10 rounded-xl ${step.bg} border flex items-center justify-center mb-4`}>
                      <Icon className={`w-5 h-5 ${step.color}`} />
                    </div>
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-[10px] font-bold text-brand-400 bg-brand-500/10 px-2 py-0.5 rounded">{i + 1}</span>
                      <h4 className="font-[family-name:var(--font-display)] text-lg font-semibold text-white">{step.title}</h4>
                    </div>
                    <p className="text-sm text-white/40 leading-relaxed">{step.description}</p>
                  </motion.div>
                );
              })}
            </motion.div>
          </div>
        </section>

        {/* The 15 Metrics */}
        <section className="px-4 sm:px-6 py-16 sm:py-24 relative">
          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-brand-500/[0.02] to-transparent pointer-events-none" />
          <div className="max-w-5xl mx-auto relative">
            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: "-100px" }}
              className="text-center mb-12"
            >
              <motion.div variants={fadeUp} custom={0}>
                <div className="flex items-center justify-center gap-2 mb-4">
                  <div className="w-1 h-4 rounded-full bg-gradient-to-b from-teal-400 to-teal-600" />
                  <h2 className="font-[family-name:var(--font-display)] text-sm font-semibold text-white/60 uppercase tracking-wider">Presentation Metrics</h2>
                </div>
                <h3 className="font-[family-name:var(--font-display)] text-2xl sm:text-3xl font-bold text-white mb-3">15 neuroscience-grounded dimensions</h3>
                <p className="text-sm text-white/30 max-w-xl mx-auto">Each metric maps to specific brain regions and is calibrated for educational and persuasive content — not marketing entertainment.</p>
              </motion.div>
            </motion.div>

            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: "-50px" }}
              className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3"
            >
              {METRICS.map((metric, i) => (
                <motion.div
                  key={metric.name}
                  variants={fadeUp}
                  custom={i * 0.3}
                  className="glass-card p-4 group hover:border-brand-500/20 transition-all duration-300"
                >
                  <div className="flex items-start gap-3">
                    <div className="w-6 h-6 rounded-full bg-brand-500/10 border border-brand-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <span className="text-[9px] font-bold text-brand-400">{i + 1}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-white/80 font-semibold leading-tight">{metric.name}</p>
                      <p className="text-[11px] text-white/35 mt-1 leading-relaxed">{metric.description}</p>
                      <p className="text-[10px] text-brand-400/60 mt-1.5 font-mono">{metric.region}</p>
                    </div>
                  </div>
                </motion.div>
              ))}
            </motion.div>
          </div>
        </section>

        {/* Pricing */}
        <section className="px-4 sm:px-6 py-16 sm:py-24">
          <div className="max-w-4xl mx-auto">
            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: "-100px" }}
              className="text-center mb-12"
            >
              <motion.div variants={fadeUp} custom={0}>
                <div className="flex items-center justify-center gap-2 mb-4">
                  <div className="w-1 h-4 rounded-full bg-gradient-to-b from-amber-400 to-amber-600" />
                  <h2 className="font-[family-name:var(--font-display)] text-sm font-semibold text-white/60 uppercase tracking-wider">Pricing</h2>
                </div>
                <h3 className="font-[family-name:var(--font-display)] text-2xl sm:text-3xl font-bold text-white">Simple, per-presentation pricing</h3>
              </motion.div>
            </motion.div>

            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: "-50px" }}
              className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6"
            >
              {PRICING.map((plan, i) => (
                <motion.div
                  key={plan.name}
                  variants={fadeUp}
                  custom={i + 1}
                  className={`glass-card p-6 relative overflow-hidden ${plan.highlight ? "!border-brand-500/30 glow-brand" : ""}`}
                >
                  {plan.badge && (
                    <div className="absolute top-4 right-4">
                      <Badge variant="warning" className="text-[10px]">{plan.badge}</Badge>
                    </div>
                  )}
                  <h4 className="font-[family-name:var(--font-display)] text-lg font-semibold text-white mb-1">{plan.name}</h4>
                  <div className="flex items-baseline gap-1 mb-1">
                    <span className="font-[family-name:var(--font-display)] text-3xl font-bold text-white">{plan.price}</span>
                  </div>
                  <p className="text-[11px] text-white/30 mb-5">{plan.unit}</p>
                  <ul className="space-y-2.5">
                    {plan.features.map((feature) => (
                      <li key={feature} className="flex items-center gap-2">
                        <CheckCircle2 className="w-3.5 h-3.5 text-brand-400 flex-shrink-0" />
                        <span className="text-sm text-white/50">{feature}</span>
                      </li>
                    ))}
                  </ul>
                </motion.div>
              ))}
            </motion.div>
          </div>
        </section>

        {/* Waitlist */}
        <section className="px-4 sm:px-6 py-16 sm:py-24">
          <div className="max-w-lg mx-auto">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
              className="glass-card p-8 text-center"
            >
              <div className="w-12 h-12 mx-auto rounded-xl bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center shadow-lg shadow-brand-500/20 mb-5">
                <Mail className="w-6 h-6 text-white" />
              </div>
              <h3 className="font-[family-name:var(--font-display)] text-xl sm:text-2xl font-bold text-white mb-2">
                Join the Waitlist
              </h3>
              <p className="text-sm text-white/40 mb-6">
                Get early access to Talking Presentations. One free analysis after signup.
              </p>

              {submitted ? (
                <div className="flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-emerald-500/[0.08] border border-emerald-500/20">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  <p className="text-sm text-emerald-400 font-medium">You&apos;re on the list. We&apos;ll be in touch.</p>
                </div>
              ) : (
                <form onSubmit={handleWaitlist} className="flex gap-2">
                  <input
                    type="email"
                    required
                    placeholder="your@email.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="flex-1 px-4 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.08] text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-brand-500/40 focus:ring-1 focus:ring-brand-500/20 transition-all"
                  />
                  <button
                    type="submit"
                    className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-brand-500 to-brand-600 text-white text-sm font-medium rounded-xl shadow-lg shadow-brand-500/20 hover:shadow-brand-500/30 transition-shadow whitespace-nowrap"
                  >
                    <Zap className="w-4 h-4" />
                    Join
                  </button>
                </form>
              )}

              <p className="text-[10px] text-white/20 mt-4">One free analysis after signup</p>
            </motion.div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-white/[0.04] px-6 py-6">
        <div className="max-w-4xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Link href="/methodology" className="text-xs text-white/30 hover:text-white/50 transition-colors">Methodology</Link>
            <Link href="/login" className="text-xs text-white/30 hover:text-white/50 transition-colors">Sign In</Link>
            <Link href="/" className="text-xs text-white/30 hover:text-white/50 transition-colors">Video Analysis</Link>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="default" className="text-[10px]">
              <span className="w-1.5 h-1.5 rounded-full bg-teal-400" />
              Powered by ORCLE
            </Badge>
          </div>
        </div>
      </footer>
    </div>
  );
}
