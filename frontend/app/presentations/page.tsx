"use client";

import { useState, useRef } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  Brain,
  Upload,
  BarChart3,
  RefreshCw,
  ArrowUpRight,
  CheckCircle2,
  Sparkles,
  Mail,
  Monitor,
  Palette,
  User,
  Video,
  Volume2,
  VolumeX,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { UserMenu } from "@/components/UserMenu";
import { ThemeToggle } from "@/components/ThemeToggle";

/* ═══════════════════════════════════════════════════════════════════════════
   DATA
   ═══════════════════════════════════════════════════════════════════════════ */

const METRICS = [
  { name: "Conceptual Hook Strength", description: "Curiosity-driven attention capture during opening", region: "ACC · VTA · Hippocampus" },
  { name: "Speaker Authority Signal", description: "Neural markers of credibility and expertise", region: "Caudate · mPFC · L-PFC" },
  { name: "Discourse Coherence Tracking", description: "Active construction of coherent narrative models", region: "dmPFC · PCC · ATL" },
  { name: "Schema Integration Index", description: "New info integrated into existing knowledge schemas", region: "vmPFC · Hippocampus · AG" },
  { name: "Argument Processing Depth", description: "Depth of logical/analytical processing", region: "dmPFC · L-IFG · IPS" },
  { name: "Quantitative/Data Processing", description: "Neural engagement with numerical data", region: "Bilateral IPS" },
  { name: "Managed Cognitive Load", description: "Optimal zone between boredom and overload", region: "dlPFC · ACC · Hippocampus" },
  { name: "Knowledge Encoding Depth", description: "Depth of episodic and semantic memory encoding", region: "Hippocampus · AG · vmPFC" },
  { name: "Audience Synchrony Proxy", description: "Reliability of cortical responses across viewers", region: "Whole-brain stability" },
  { name: "Conceptual Change / Inhibition", description: "Neural signature of belief updating", region: "dlPFC · ACC · Hippocampus" },
  { name: "Section Transition Effectiveness", description: "Neural event segmentation at boundaries", region: "Hippocampus · Precuneus" },
  { name: "Language-Argument Coupling", description: "Language parsing ↔ logical reasoning connectivity", region: "L-IFG · IPS · dmPFC" },
  { name: "Sustained Engagement Trajectory", description: "Temporal dynamics over full presentation", region: "DAN vs DMN ratio" },
  { name: "Visual-Verbal Integration", description: "Integration of slides with verbal narration", region: "Parietal · STS · dlPFC" },
  { name: "Insight / Understanding Moments", description: "Sudden comprehension breakthroughs", region: "ACC · Hippocampus · VTA" },
];

const VIDEO_STYLES = [
  { icon: Monitor, name: "Presenter", tag: "PiP", desc: "Classic picture-in-picture. Your slides with a talking head avatar overlay. The fastest, most affordable option.", price: "$4.99" },
  { icon: Palette, name: "Designer", tag: "Redesigned", desc: "AI-redesigned slides with a new avatar lip-synced to an improved script. Full VLM + ORCLE scoring.", price: "$12.99", popular: true },
  { icon: User, name: "Speaker", tag: "Full Body", desc: "Full-body avatar standing beside your slides on a virtual stage. Conference-ready output.", price: "$24.99" },
  { icon: Video, name: "Keynote", tag: "Multi-Cam", desc: "TED talk production — 10 cinematic shot types, multiple camera angles, stage presence optimization.", price: "$49.99", premium: true },
];

const ease = [0.22, 1, 0.36, 1] as [number, number, number, number];
const rise = {
  hidden: { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.65, ease } },
};
const stagger = { hidden: {}, visible: { transition: { staggerChildren: 0.06 } } };

/* ═══════════════════════════════════════════════════════════════════════════
   PAGE
   ═══════════════════════════════════════════════════════════════════════════ */

export default function PresentationsPage() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [muted, setMuted] = useState(true);
  const v1Ref = useRef<HTMLVideoElement>(null);
  const v2Ref = useRef<HTMLVideoElement>(null);

  const handleWaitlist = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    const existing = JSON.parse(localStorage.getItem("neuropeer_waitlist") || "[]");
    if (!existing.includes(email)) { existing.push(email); localStorage.setItem("neuropeer_waitlist", JSON.stringify(existing)); }
    setSubmitted(true);
    setEmail("");
  };

  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    if (v1Ref.current) v1Ref.current.muted = next;
    if (v2Ref.current) v2Ref.current.muted = next;
  };

  return (
    <div className="min-h-screen flex flex-col">

      {/* ── Nav (matches homepage exactly) ────────────────────────── */}
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

        {/* ═════════════════════════════════════════════════════════
           HERO
           ═════════════════════════════════════════════════════════ */}
        <section className="relative px-4 sm:px-6 pt-20 sm:pt-32 pb-12 overflow-hidden">
          <div className="absolute top-20 left-1/2 -translate-x-1/2 w-[90vw] sm:w-[700px] h-[400px] rounded-full bg-gradient-to-b from-brand-500/[0.08] to-transparent blur-3xl pointer-events-none" />

          <div className="max-w-3xl mx-auto text-center relative">
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease }}>
              <Badge variant="brand" className="mb-8 px-4 py-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-brand-400 animate-[pulse-glow_2s_ease-in-out_infinite]" />
                Now in private beta
              </Badge>
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.08, duration: 0.6, ease }}
              className="font-[family-name:var(--font-display)] text-3xl sm:text-5xl lg:text-[3.5rem] font-bold text-white mb-6 leading-[1.08] tracking-tight"
            >
              Your presentation,
              <br />
              <span className="text-gradient-brand">scored by neuroscience.</span>
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.16, duration: 0.5, ease }}
              className="text-white/40 text-lg sm:text-xl leading-relaxed max-w-xl mx-auto mb-10"
            >
              Upload a PPTX. ORCLE predicts how your audience&apos;s brain responds.
              An AI agent iterates until the neural score clears threshold.
            </motion.p>

            {/* Waitlist */}
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.24, duration: 0.5, ease }} className="max-w-sm mx-auto">
              {submitted ? (
                <div className="glass-card p-5 text-center">
                  <CheckCircle2 className="w-5 h-5 text-emerald-400 mx-auto mb-2" />
                  <p className="text-white text-sm font-medium">You&apos;re in. One free video unlocked.</p>
                  <p className="text-white/35 text-xs mt-1">Choose your format below.</p>
                </div>
              ) : (
                <form onSubmit={handleWaitlist} className="flex gap-2">
                  <div className="relative flex-1">
                    <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20" />
                    <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" required
                      className="w-full pl-10 pr-4 py-3 rounded-xl bg-white/[0.04] border border-white/[0.06] text-white placeholder-white/20 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/40 focus:border-brand-500/30 transition-all" />
                  </div>
                  <button type="submit" className="px-5 py-3 rounded-xl bg-gradient-to-r from-brand-500 to-brand-600 text-white font-semibold text-sm hover:from-brand-400 hover:to-brand-500 transition-all shadow-lg shadow-brand-500/20 whitespace-nowrap">
                    Get early access
                  </button>
                </form>
              )}
              <p className="text-[11px] text-white/15 mt-3 text-center">First video free — any format. No credit card required.</p>
            </motion.div>
          </div>
        </section>

        {/* ═════════════════════════════════════════════════════════
           BEFORE / AFTER VIDEO COMPARISON
           ═════════════════════════════════════════════════════════ */}
        <section className="px-4 sm:px-6 py-12 sm:py-20">
          <div className="max-w-5xl mx-auto">
            <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: "-80px" }} variants={stagger}>
              <motion.div variants={rise} className="text-center mb-10">
                <h2 className="font-[family-name:var(--font-display)] text-2xl sm:text-3xl font-bold text-white tracking-tight">Same presentation. Before and after ORCLE.</h2>
                <p className="text-sm text-white/30 mt-2">Watch the AI-iterated version side by side with the original.</p>
              </motion.div>

              <motion.div variants={rise}>
                <div className="glass-card overflow-hidden">
                  <div className="grid grid-cols-2">
                    {/* V1 */}
                    <div className="relative border-r border-white/[0.06]">
                      <div className="absolute top-3 left-3 z-10 flex items-center gap-2">
                        <span className="px-2 py-0.5 rounded-md bg-red-500/20 border border-red-500/30 text-[10px] font-bold text-red-300 uppercase tracking-wider">Before</span>
                      </div>
                      <video ref={v1Ref} src="/videos/v1_original.mp4" autoPlay loop muted playsInline className="w-full aspect-video object-cover" />
                      <div className="absolute bottom-3 left-3 z-10">
                        <span className="text-[11px] text-white/40 bg-black/50 px-2 py-0.5 rounded">VLM Score: <span className="text-red-400 font-semibold">5.8</span>/10</span>
                      </div>
                    </div>

                    {/* V2 */}
                    <div className="relative">
                      <div className="absolute top-3 left-3 z-10 flex items-center gap-2">
                        <span className="px-2 py-0.5 rounded-md bg-emerald-500/20 border border-emerald-500/30 text-[10px] font-bold text-emerald-300 uppercase tracking-wider">After</span>
                      </div>
                      <video ref={v2Ref} src="/videos/v2_improved.mp4" autoPlay loop muted playsInline className="w-full aspect-video object-cover" />
                      <div className="absolute bottom-3 left-3 z-10">
                        <span className="text-[11px] text-white/40 bg-black/50 px-2 py-0.5 rounded">VLM Score: <span className="text-emerald-400 font-semibold">7.9</span>/10 <span className="text-emerald-400/70">+36%</span></span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between px-5 py-3 border-t border-white/[0.04]">
                    <div className="flex items-center gap-2">
                      <Sparkles className="w-3.5 h-3.5 text-brand-400" />
                      <p className="text-[11px] text-white/25">Same content · Same speaker · ORCLE-guided iteration</p>
                    </div>
                    <button onClick={toggleMute} className="flex items-center gap-1.5 text-[11px] text-white/30 hover:text-white/60 transition-colors">
                      {muted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
                      {muted ? "Unmute" : "Mute"}
                    </button>
                  </div>
                </div>
              </motion.div>
            </motion.div>
          </div>
        </section>

        {/* ═════════════════════════════════════════════════════════
           VIDEO STYLES — 2×2 grid with pricing inline
           ═════════════════════════════════════════════════════════ */}
        <section className="px-4 sm:px-6 py-16 sm:py-24">
          <div className="max-w-5xl mx-auto">
            <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: "-80px" }} variants={stagger}>
              <motion.div variants={rise} className="mb-12">
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-1 h-4 rounded-full bg-gradient-to-b from-brand-400 to-brand-600" />
                  <h2 className="font-[family-name:var(--font-display)] text-sm font-semibold text-white/60 uppercase tracking-wider">Four formats</h2>
                </div>
                <h3 className="font-[family-name:var(--font-display)] text-2xl sm:text-3xl font-bold text-white">Choose how your presentation comes to life</h3>
                <p className="text-sm text-white/30 mt-2">First video is free after signup — any format.</p>
              </motion.div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {VIDEO_STYLES.map((s) => {
                  const Icon = s.icon;
                  const isPopular = "popular" in s;
                  const isPremium = "premium" in s;
                  return (
                    <motion.div key={s.name} variants={rise}
                      className={`glass-card glass-card-hover relative p-6 overflow-hidden ${isPopular ? "!border-brand-500/30 glow-brand" : ""} ${isPremium ? "!border-amber-500/20" : ""}`}>
                      {isPopular && <div className="absolute top-3 right-3"><Badge variant="brand" className="text-[10px]">Popular</Badge></div>}
                      {isPremium && <div className="absolute top-3 right-3"><Badge variant="warning" className="text-[10px]">Premium</Badge></div>}

                      <div className="flex items-start gap-4">
                        <div className="w-10 h-10 rounded-xl bg-brand-500/10 border border-brand-500/20 flex items-center justify-center flex-shrink-0">
                          <Icon className="w-5 h-5 text-brand-400" />
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <h4 className="font-[family-name:var(--font-display)] text-[15px] font-semibold text-white">{s.name}</h4>
                            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-white/[0.04] text-white/30">{s.tag}</span>
                          </div>
                          <p className="text-[13px] text-white/35 leading-relaxed mb-3">{s.desc}</p>
                          <span className="text-lg font-bold text-white">{s.price}<span className="text-[11px] text-white/25 font-normal ml-1">/ video</span></span>
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </motion.div>
          </div>
        </section>

        {/* ═════════════════════════════════════════════════════════
           HOW IT WORKS — 3 numbered steps
           ═════════════════════════════════════════════════════════ */}
        <section className="px-4 sm:px-6 py-16 sm:py-24">
          <div className="max-w-4xl mx-auto">
            <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: "-80px" }} variants={stagger}>
              <motion.div variants={rise} className="text-center mb-14">
                <div className="flex items-center justify-center gap-2 mb-4">
                  <div className="w-1 h-4 rounded-full bg-gradient-to-b from-teal-400 to-teal-600" />
                  <h2 className="font-[family-name:var(--font-display)] text-sm font-semibold text-white/60 uppercase tracking-wider">How it works</h2>
                </div>
                <h3 className="font-[family-name:var(--font-display)] text-2xl sm:text-3xl font-bold text-white">Three steps to a perfect presentation</h3>
              </motion.div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                {[
                  { num: "01", title: "Upload", desc: "Drop your PPTX + headshot photo. Record your voice or paste a YouTube link to clone from.", icon: Upload, color: "text-brand-400", bg: "bg-brand-500/10 border-brand-500/20" },
                  { num: "02", title: "Score", desc: "ORCLE predicts neural response across 15 dimensions. VLM judge provides per-slide feedback.", icon: BarChart3, color: "text-teal-400", bg: "bg-teal-500/10 border-teal-500/20" },
                  { num: "03", title: "Iterate", desc: "AI agent redesigns slides, re-records narration, generates new avatar. Re-scores until threshold.", icon: RefreshCw, color: "text-purple-400", bg: "bg-purple-500/10 border-purple-500/20" },
                ].map((step) => (
                  <motion.div key={step.num} variants={rise} className="glass-card glass-card-hover p-6 relative overflow-hidden">
                    <div className={`w-10 h-10 rounded-xl ${step.bg} border flex items-center justify-center mb-4`}>
                      <step.icon className={`w-5 h-5 ${step.color}`} />
                    </div>
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-[10px] font-mono text-white/15">{step.num}</span>
                      <h4 className="font-[family-name:var(--font-display)] text-lg font-semibold text-white">{step.title}</h4>
                    </div>
                    <p className="text-sm text-white/35 leading-relaxed">{step.desc}</p>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          </div>
        </section>

        {/* ═════════════════════════════════════════════════════════
           15 METRICS — compact grid
           ═════════════════════════════════════════════════════════ */}
        <section className="px-4 sm:px-6 py-16 sm:py-24">
          <div className="max-w-5xl mx-auto">
            <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: "-80px" }} variants={stagger}>
              <motion.div variants={rise} className="mb-12">
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-1 h-4 rounded-full bg-gradient-to-b from-purple-400 to-purple-600" />
                  <h2 className="font-[family-name:var(--font-display)] text-sm font-semibold text-white/60 uppercase tracking-wider">Neural metrics</h2>
                </div>
                <h3 className="font-[family-name:var(--font-display)] text-2xl sm:text-3xl font-bold text-white mb-3">15 dimensions grounded in published neuroscience</h3>
                <p className="text-sm text-white/25 max-w-lg">Each metric maps to specific cortical regions and is calibrated for educational and persuasive content — not marketing entertainment.</p>
              </motion.div>

              <motion.div variants={rise} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {METRICS.map((m, i) => (
                  <div key={m.name} className="glass-card p-4 group hover:border-brand-500/20 transition-all duration-300">
                    <div className="flex items-start gap-3">
                      <div className="w-6 h-6 rounded-full bg-brand-500/10 border border-brand-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <span className="text-[9px] font-bold text-brand-400">{i + 1}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] text-white/70 font-semibold leading-tight group-hover:text-white/90 transition-colors">{m.name}</p>
                        <p className="text-[11px] text-white/25 mt-1 leading-relaxed">{m.description}</p>
                        <p className="text-[10px] text-brand-400/40 mt-1.5 font-mono">{m.region}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </motion.div>
            </motion.div>
          </div>
        </section>

        {/* ═════════════════════════════════════════════════════════
           BOTTOM CTA
           ═════════════════════════════════════════════════════════ */}
        <section className="px-4 sm:px-6 py-20 sm:py-28">
          <div className="max-w-md mx-auto text-center">
            <motion.div initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.6, ease }}>
              <h2 className="font-[family-name:var(--font-display)] text-xl sm:text-2xl font-bold text-white tracking-tight mb-4">
                Ready to see what your audience&apos;s brain thinks?
              </h2>
              <p className="text-sm text-white/30 mb-8 leading-relaxed">Join the waitlist. Get one free video. Any format.</p>
              <button
                onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
                className="inline-flex items-center gap-2 px-6 py-3.5 bg-gradient-to-r from-brand-500 to-brand-600 text-white font-semibold text-sm rounded-xl shadow-lg shadow-brand-500/20 hover:shadow-brand-500/30 transition-all"
              >
                Join the waitlist <ArrowUpRight className="w-4 h-4" />
              </button>
            </motion.div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-white/[0.04] px-6 py-6">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-[11px] text-white/15">All videos include voice cloning, AI narration, and neural scoring.</p>
          <div className="flex items-center gap-5">
            <Link href="/methodology" className="text-[11px] text-white/20 hover:text-white/40 transition-colors">Methodology</Link>
            <Link href="/login" className="text-[11px] text-white/20 hover:text-white/40 transition-colors">Sign in</Link>
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
