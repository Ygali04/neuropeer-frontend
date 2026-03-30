import type { AnalysisResult } from "./types";

// Fixed demo job IDs — always accessible without auth
export const DEMO_JOB_IDS = ["demo-instagram-reel", "demo-youtube-preroll"];

export function isDemoJob(jobId: string): boolean {
  return DEMO_JOB_IDS.includes(jobId);
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function curve(length: number, base: number, variance: number): number[] {
  const data: number[] = [];
  let v = base;
  for (let i = 0; i < length; i++) {
    v += (Math.sin(i * 0.7 + base) * 0.5 - 0.25) * variance;
    v = Math.max(5, Math.min(95, v));
    data.push(v);
  }
  return data;
}

function attentionCurve(duration: number, seed: number): number[] {
  const data: number[] = [];
  for (let i = 0; i < duration; i++) {
    const t = i / duration;
    const base = 80 - 30 * Math.sin(t * Math.PI * 1.5 + seed) + 15 * Math.cos(t * Math.PI * 3 + seed);
    data.push(Math.max(10, Math.min(95, base + Math.sin(i * 0.9 + seed) * 5)));
  }
  return data;
}

function modalityBreakdown(duration: number, seed: number) {
  const data = [];
  for (let i = 0; i < duration; i++) {
    const visual = 40 + Math.sin(i * 0.3 + seed) * 15;
    const audio = 30 + Math.cos(i * 0.2 + seed) * 10;
    const text = Math.max(5, 100 - visual - audio);
    data.push({ timestamp: i, visual, audio, text });
  }
  return data;
}

// ── Instagram Reel Demo ──────────────────────────────────────────────────────

const INSTAGRAM_REEL: AnalysisResult = {
  job_id: "demo-instagram-reel",
  url: "https://www.instagram.com/reel/DGfK3qMPUHk/",
  content_type: "instagram_reel",
  duration_seconds: 48,
  neural_score: {
    total: 72,
    hook_score: 84,
    sustained_attention: 68,
    emotional_resonance: 75,
    memory_encoding: 61,
    aesthetic_quality: 78,
    cognitive_accessibility: 66,
  },
  metrics: [
    { name: "Visual Hook Strength", score: 84, raw_value: 0.8412, description: "Measures the initial visual impact in the first 3 seconds. High scores indicate strong opening visuals that capture attention.", brain_region: "V1 / Primary Visual Cortex", gtm_proxy: "Thumb-stop rate" },
    { name: "Sustained Attention", score: 68, raw_value: 0.6823, description: "Tracks average attention levels across the full duration.", brain_region: "Dorsal Attention Network", gtm_proxy: "Average watch time" },
    { name: "Emotional Resonance", score: 75, raw_value: 0.7501, description: "Measures emotional activation intensity.", brain_region: "Amygdala / Limbic System", gtm_proxy: "Comment sentiment" },
    { name: "Memory Encoding", score: 61, raw_value: 0.6133, description: "Predicts how well the content will be recalled.", brain_region: "Hippocampus", gtm_proxy: "Brand recall" },
    { name: "Aesthetic Quality", score: 78, raw_value: 0.7789, description: "Visual composition, color harmony, and production quality.", brain_region: "Fusiform / Visual Cortex", gtm_proxy: "Production value" },
    { name: "Cognitive Accessibility", score: 66, raw_value: 0.6602, description: "How easily the message is processed.", brain_region: "Prefrontal Cortex", gtm_proxy: "Message clarity" },
    { name: "Narrative Coherence", score: 71, raw_value: 0.7124, description: "Story structure and logical flow.", brain_region: "Temporal Pole", gtm_proxy: "Comprehension" },
    { name: "Audio-Visual Sync", score: 82, raw_value: 0.8198, description: "Synchronization quality between audio and visual.", brain_region: "Superior Temporal Sulcus", gtm_proxy: "Perceived quality" },
    { name: "Novelty Response", score: 55, raw_value: 0.5534, description: "How novel or surprising the content appears.", brain_region: "Hippocampus / ACC", gtm_proxy: "Shareability" },
    { name: "Social Relevance", score: 73, raw_value: 0.7312, description: "Content relevance to social identity.", brain_region: "Medial Prefrontal Cortex", gtm_proxy: "Share intent" },
    { name: "Reward Prediction", score: 64, raw_value: 0.6401, description: "Anticipatory reward signals.", brain_region: "Ventral Striatum", gtm_proxy: "Click-through rate" },
    { name: "Facial Processing", score: 80, raw_value: 0.7998, description: "Face detection and emotional expression processing.", brain_region: "Fusiform Face Area", gtm_proxy: "Talent effectiveness" },
    { name: "Language Processing", score: 59, raw_value: 0.5923, description: "Spoken/text language complexity.", brain_region: "Wernicke's / Broca's Area", gtm_proxy: "Message retention" },
    { name: "Motion Sensitivity", score: 77, raw_value: 0.7689, description: "Response to visual motion.", brain_region: "MT / V5 Complex", gtm_proxy: "Visual dynamism" },
    { name: "Arousal Regulation", score: 70, raw_value: 0.6978, description: "Autonomic arousal patterns.", brain_region: "Insula / ANS", gtm_proxy: "Engagement intensity" },
    { name: "Temporal Pacing", score: 63, raw_value: 0.6312, description: "Information delivery rate optimization.", brain_region: "Cerebellum / Basal Ganglia", gtm_proxy: "Completion rate" },
    { name: "Brand Safety", score: 88, raw_value: 0.8801, description: "Content safety assessment.", brain_region: "Prefrontal / Moral Network", gtm_proxy: "Brand safety score" },
    { name: "CTA Effectiveness", score: 57, raw_value: 0.5712, description: "Call-to-action timing and clarity.", brain_region: "Motor Planning / SMA", gtm_proxy: "Conversion rate" },
  ],
  attention_curve: attentionCurve(48, 1),
  emotional_arousal_curve: curve(48, 55, 8),
  cognitive_load_curve: curve(48, 45, 6),
  key_moments: [
    { timestamp: 2, type: "best_hook", label: "Strong visual hook with motion", score: 88 },
    { timestamp: 14, type: "peak_engagement", label: "Peak audience attention", score: 92 },
    { timestamp: 23, type: "emotional_peak", label: "Emotional resonance spike", score: 78 },
    { timestamp: 35, type: "dropoff_risk", label: "Pacing drop — risk of exit", score: 34 },
    { timestamp: 42, type: "recovery", label: "CTA recovery point", score: 65 },
  ],
  modality_breakdown: modalityBreakdown(48, 1),
  overarching_summary:
    "This Instagram Reel has a strong visual hook (84) and solid aesthetic quality (78), but loses viewers mid-content due to declining sustained attention (68) and moderate memory encoding (61). " +
    "The emotional arc peaks at 23s but is followed by a pacing drop at 35s — the most critical fix. " +
    "Priority: (1) Add a pattern interrupt between 28–35s to prevent the drop-off, (2) reinforce the key message near the emotional peak at 23s for better recall, and (3) strengthen the CTA timing — currently it lands during a low-attention window.",
};

// ── YouTube Pre-roll Demo ────────────────────────────────────────────────────

const YOUTUBE_PREROLL: AnalysisResult = {
  job_id: "demo-youtube-preroll",
  url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  content_type: "youtube_preroll",
  duration_seconds: 30,
  neural_score: {
    total: 81,
    hook_score: 91,
    sustained_attention: 79,
    emotional_resonance: 82,
    memory_encoding: 76,
    aesthetic_quality: 85,
    cognitive_accessibility: 73,
  },
  metrics: [
    { name: "Visual Hook Strength", score: 91, raw_value: 0.9102, description: "Exceptional opening — strong motion and contrast.", brain_region: "V1 / Primary Visual Cortex", gtm_proxy: "Thumb-stop rate" },
    { name: "Sustained Attention", score: 79, raw_value: 0.7912, description: "Strong sustained engagement throughout.", brain_region: "Dorsal Attention Network", gtm_proxy: "Average watch time" },
    { name: "Emotional Resonance", score: 82, raw_value: 0.8201, description: "High emotional activation — music-driven.", brain_region: "Amygdala / Limbic System", gtm_proxy: "Comment sentiment" },
    { name: "Memory Encoding", score: 76, raw_value: 0.7612, description: "Good recall potential — catchy melody aids encoding.", brain_region: "Hippocampus", gtm_proxy: "Brand recall" },
    { name: "Aesthetic Quality", score: 85, raw_value: 0.8501, description: "Clean production with good color grading.", brain_region: "Fusiform / Visual Cortex", gtm_proxy: "Production value" },
    { name: "Cognitive Accessibility", score: 73, raw_value: 0.7302, description: "Simple message, easy to process.", brain_region: "Prefrontal Cortex", gtm_proxy: "Message clarity" },
    { name: "Narrative Coherence", score: 78, raw_value: 0.7812, description: "Clear narrative arc with setup and payoff.", brain_region: "Temporal Pole", gtm_proxy: "Comprehension" },
    { name: "Audio-Visual Sync", score: 89, raw_value: 0.8912, description: "Excellent sync — music perfectly matches visuals.", brain_region: "Superior Temporal Sulcus", gtm_proxy: "Perceived quality" },
    { name: "Novelty Response", score: 68, raw_value: 0.6801, description: "Familiar format but well executed.", brain_region: "Hippocampus / ACC", gtm_proxy: "Shareability" },
    { name: "Social Relevance", score: 85, raw_value: 0.8501, description: "Highly shareable, cultural resonance.", brain_region: "Medial Prefrontal Cortex", gtm_proxy: "Share intent" },
    { name: "Reward Prediction", score: 77, raw_value: 0.7701, description: "Strong anticipation built through music.", brain_region: "Ventral Striatum", gtm_proxy: "Click-through rate" },
    { name: "Facial Processing", score: 88, raw_value: 0.8801, description: "Strong face presence with clear expressions.", brain_region: "Fusiform Face Area", gtm_proxy: "Talent effectiveness" },
    { name: "Language Processing", score: 72, raw_value: 0.7201, description: "Simple lyrics, easy comprehension.", brain_region: "Wernicke's / Broca's Area", gtm_proxy: "Message retention" },
    { name: "Motion Sensitivity", score: 81, raw_value: 0.8101, description: "Good camera movement and choreography.", brain_region: "MT / V5 Complex", gtm_proxy: "Visual dynamism" },
    { name: "Arousal Regulation", score: 80, raw_value: 0.8001, description: "Well-paced arousal build.", brain_region: "Insula / ANS", gtm_proxy: "Engagement intensity" },
    { name: "Temporal Pacing", score: 75, raw_value: 0.7501, description: "Good pacing for the format.", brain_region: "Cerebellum / Basal Ganglia", gtm_proxy: "Completion rate" },
    { name: "Brand Safety", score: 92, raw_value: 0.9201, description: "Completely brand-safe content.", brain_region: "Prefrontal / Moral Network", gtm_proxy: "Brand safety score" },
    { name: "CTA Effectiveness", score: 71, raw_value: 0.7101, description: "Implicit CTA — could be stronger.", brain_region: "Motor Planning / SMA", gtm_proxy: "Conversion rate" },
  ],
  attention_curve: attentionCurve(30, 2),
  emotional_arousal_curve: curve(30, 65, 7),
  cognitive_load_curve: curve(30, 40, 5),
  key_moments: [
    { timestamp: 1, type: "best_hook", label: "Iconic opening — instant recognition", score: 95 },
    { timestamp: 8, type: "peak_engagement", label: "Chorus drop — maximum engagement", score: 94 },
    { timestamp: 15, type: "emotional_peak", label: "Emotional crescendo", score: 85 },
    { timestamp: 22, type: "recovery", label: "Second verse re-engagement", score: 72 },
    { timestamp: 28, type: "peak_engagement", label: "Final chorus peak", score: 88 },
  ],
  modality_breakdown: modalityBreakdown(30, 2),
  overarching_summary:
    "This YouTube pre-roll scores exceptionally well across all dimensions (81 overall). The visual hook (91) is in the top tier — the opening frame immediately captures attention. " +
    "Audio-visual sync (89) and facial processing (88) are standout strengths, driven by the music and performer's presence. " +
    "Priority: (1) The CTA (71) could be stronger — add a clear action prompt in the final 3 seconds, and (2) novelty (68) is the weakest dimension — consider adding an unexpected visual element to boost shareability.",
};

// ── Lookup ───────────────────────────────────────────────────────────────────

const DEMO_RESULTS: Record<string, AnalysisResult> = {
  "demo-instagram-reel": INSTAGRAM_REEL,
  "demo-youtube-preroll": YOUTUBE_PREROLL,
};

export function getDemoResult(jobId: string): AnalysisResult | null {
  return DEMO_RESULTS[jobId] ?? null;
}
