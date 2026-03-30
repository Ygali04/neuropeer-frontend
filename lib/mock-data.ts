import type {
  AnalysisResult,
  ComparisonResult,
  KeyMoment,
  MetricScore,
  ModalityContribution,
  NeuralScoreBreakdown,
  ProgressEvent,
  JobStatus,
} from "./types";

// ── Helpers ────��─────────────────────────────────────────────────────────────

function rand(min: number, max: number) {
  return min + Math.random() * (max - min);
}

function curve(length: number, base: number, variance: number): number[] {
  const data: number[] = [];
  let v = base;
  for (let i = 0; i < length; i++) {
    v += (Math.random() - 0.5) * variance;
    v = Math.max(5, Math.min(95, v));
    data.push(v);
  }
  return data;
}

// ── Static Mock Data ─────────────────────────────────────────────────────────

const MOCK_NEURAL_SCORE: NeuralScoreBreakdown = {
  total: 72,
  hook_score: 84,
  sustained_attention: 68,
  emotional_resonance: 75,
  memory_encoding: 61,
  aesthetic_quality: 78,
  cognitive_accessibility: 66,
};

const MOCK_NEURAL_SCORE_B: NeuralScoreBreakdown = {
  total: 58,
  hook_score: 52,
  sustained_attention: 61,
  emotional_resonance: 55,
  memory_encoding: 70,
  aesthetic_quality: 49,
  cognitive_accessibility: 63,
};

const MOCK_KEY_MOMENTS: KeyMoment[] = [
  { timestamp: 2, type: "best_hook", label: "Strong visual hook with motion", score: 88 },
  { timestamp: 14, type: "peak_engagement", label: "Peak audience attention", score: 92 },
  { timestamp: 23, type: "emotional_peak", label: "Emotional resonance spike", score: 78 },
  { timestamp: 35, type: "dropoff_risk", label: "Pacing drop — risk of exit", score: 34 },
  { timestamp: 42, type: "recovery", label: "CTA recovery point", score: 65 },
];

const MOCK_METRICS: MetricScore[] = [
  { name: "Visual Hook Strength", score: 84, raw_value: 0.8412, description: "Measures the initial visual impact in the first 3 seconds. High scores indicate strong opening visuals that capture attention.", brain_region: "V1 / Primary Visual Cortex", gtm_proxy: "Thumb-stop rate" },
  { name: "Sustained Attention", score: 68, raw_value: 0.6823, description: "Tracks average attention levels across the full duration. Indicates how well the content maintains viewer focus.", brain_region: "Dorsal Attention Network", gtm_proxy: "Average watch time" },
  { name: "Emotional Resonance", score: 75, raw_value: 0.7501, description: "Measures emotional activation intensity. Higher scores suggest stronger emotional connection.", brain_region: "Amygdala / Limbic System", gtm_proxy: "Comment sentiment" },
  { name: "Memory Encoding", score: 61, raw_value: 0.6133, description: "Predicts how well the content will be recalled. Based on hippocampal activation patterns.", brain_region: "Hippocampus", gtm_proxy: "Brand recall" },
  { name: "Aesthetic Quality", score: 78, raw_value: 0.7789, description: "Visual composition, color harmony, and production quality assessment.", brain_region: "Fusiform / Visual Cortex", gtm_proxy: "Production value perception" },
  { name: "Cognitive Accessibility", score: 66, raw_value: 0.6602, description: "How easily the message is processed. Lower cognitive load means higher accessibility.", brain_region: "Prefrontal Cortex", gtm_proxy: "Message clarity" },
  { name: "Narrative Coherence", score: 71, raw_value: 0.7124, description: "Story structure and logical flow assessment. Measures temporal narrative binding.", brain_region: "Temporal Pole", gtm_proxy: "Content comprehension" },
  { name: "Audio-Visual Sync", score: 82, raw_value: 0.8198, description: "Synchronization quality between audio and visual modalities.", brain_region: "Superior Temporal Sulcus", gtm_proxy: "Perceived quality" },
  { name: "Novelty Response", score: 55, raw_value: 0.5534, description: "How novel or surprising the content appears. Measures deviation from expected patterns.", brain_region: "Hippocampus / ACC", gtm_proxy: "Shareability" },
  { name: "Social Relevance", score: 73, raw_value: 0.7312, description: "Content relevance to social identity and group dynamics.", brain_region: "Medial Prefrontal Cortex", gtm_proxy: "Share intent" },
  { name: "Reward Prediction", score: 64, raw_value: 0.6401, description: "Anticipatory reward signals — does the viewer expect a payoff?", brain_region: "Ventral Striatum", gtm_proxy: "Click-through rate" },
  { name: "Facial Processing", score: 80, raw_value: 0.7998, description: "Face detection and emotional expression processing engagement.", brain_region: "Fusiform Face Area", gtm_proxy: "Talent effectiveness" },
  { name: "Language Processing", score: 59, raw_value: 0.5923, description: "Spoken/text language complexity and comprehension difficulty.", brain_region: "Wernicke's / Broca's Area", gtm_proxy: "Message retention" },
  { name: "Motion Sensitivity", score: 77, raw_value: 0.7689, description: "Response to visual motion — cuts, camera movement, on-screen action.", brain_region: "MT / V5 Complex", gtm_proxy: "Visual dynamism" },
  { name: "Arousal Regulation", score: 70, raw_value: 0.6978, description: "Autonomic arousal patterns — heart rate, skin conductance proxies.", brain_region: "Insula / ANS", gtm_proxy: "Engagement intensity" },
  { name: "Temporal Pacing", score: 63, raw_value: 0.6312, description: "Information delivery rate optimization. Too fast or too slow impacts retention.", brain_region: "Cerebellum / Basal Ganglia", gtm_proxy: "Completion rate" },
  { name: "Brand Safety", score: 88, raw_value: 0.8801, description: "Content safety assessment for adjacent ad placement.", brain_region: "Prefrontal / Moral Network", gtm_proxy: "Brand safety score" },
  { name: "CTA Effectiveness", score: 57, raw_value: 0.5712, description: "Call-to-action timing, clarity, and motivational impact.", brain_region: "Motor Planning / SMA", gtm_proxy: "Conversion rate" },
];

const DURATION = 48;

function makeMockAttentionCurve(): number[] {
  // Shaped curve: starts high (hook), dips mid, recovers at end
  const data: number[] = [];
  for (let i = 0; i < DURATION; i++) {
    const t = i / DURATION;
    const base = 80 - 30 * Math.sin(t * Math.PI * 1.5) + 15 * Math.cos(t * Math.PI * 3);
    data.push(Math.max(10, Math.min(95, base + (Math.random() - 0.5) * 10)));
  }
  return data;
}

function makeMockModalityBreakdown(): ModalityContribution[] {
  const data: ModalityContribution[] = [];
  for (let i = 0; i < DURATION; i++) {
    const visual = 40 + Math.sin(i * 0.3) * 15 + Math.random() * 5;
    const audio = 30 + Math.cos(i * 0.2) * 10 + Math.random() * 5;
    const text = Math.max(5, 100 - visual - audio);
    data.push({ timestamp: i, visual, audio, text });
  }
  return data;
}

// ── Exported Mock Functions ──────────────────────────────────────────────────

let _mockJobCounter = 0;

export function mockSubmitAnalysis(): { job_id: string; websocket_url: string } {
  _mockJobCounter++;
  return {
    job_id: `mock-job-${_mockJobCounter}-${Date.now().toString(36)}`,
    websocket_url: "ws://mock/ws",
  };
}

export function mockGetResult(jobId: string): AnalysisResult {
  return {
    job_id: jobId,
    url: "https://youtube.com/watch?v=dQw4w9WgXcQ",
    content_type: "instagram_reel",
    duration_seconds: DURATION,
    neural_score: MOCK_NEURAL_SCORE,
    metrics: MOCK_METRICS,
    attention_curve: makeMockAttentionCurve(),
    emotional_arousal_curve: curve(DURATION, 55, 8),
    cognitive_load_curve: curve(DURATION, 45, 6),
    key_moments: MOCK_KEY_MOMENTS,
    modality_breakdown: makeMockModalityBreakdown(),
    overarching_summary:
      "This Instagram Reel has a strong visual hook (84) and solid aesthetic quality (78), but loses viewers mid-content due to declining sustained attention (68) and moderate memory encoding (61). " +
      "The emotional arc peaks at 23s but is followed by a pacing drop at 35s — the most critical fix. " +
      "Priority: (1) Add a pattern interrupt between 28–35s to prevent the drop-off, (2) reinforce the key message near the emotional peak at 23s for better recall, and (3) strengthen the CTA timing — currently it lands during a low-attention window.",
  };
}

export function mockGetBrainMap(
  _jobId: string,
  _timestamp: number
): { timestamp: number; vertex_activations: number[] } {
  // Generate region-specific activations that vary over time
  // 5 regions: Prefrontal (0-15%), Visual (15-35%), Auditory (35-55%), Limbic (55-75%), Default Mode (75-100%)
  const N = 2048;
  const t = _timestamp;
  const activations: number[] = [];

  // Region activation profiles — extreme contrast so hotspots are clearly visible
  const regionProfiles: Record<string, (t: number) => number> = {
    // Prefrontal: BIG spike at hook (0-5s), quiet mid, spikes at CTA (42-48s)
    prefrontal: (t) => 2.5 * Math.exp(-((t - 3) ** 2) / 5) + 2.0 * Math.exp(-((t - 44) ** 2) / 8) - 1.5,
    // Visual: very strong peaks at visual moments (2s, 14s, 23s), otherwise quiet
    visual: (t) => 3.0 * Math.exp(-((t - 2) ** 2) / 3) + 2.5 * Math.exp(-((t - 14) ** 2) / 4) + 2.0 * Math.exp(-((t - 23) ** 2) / 5) - 1.5,
    // Auditory: sharp peak at 14s, 23s — otherwise low
    auditory: (t) => 2.0 * Math.exp(-((t - 14) ** 2) / 6) + 2.8 * Math.exp(-((t - 23) ** 2) / 4) - 1.5,
    // Limbic: HUGE spike at emotional peak (23s), everything else cold
    limbic: (t) => 1.2 * Math.exp(-((t - 2) ** 2) / 4) + 3.5 * Math.exp(-((t - 23) ** 2) / 3) + 1.0 * Math.exp(-((t - 42) ** 2) / 6) - 2.0,
    // Default mode: rises sharply at drop-off (35s), suppressed during engagement
    defaultMode: (t) => -2.0 * Math.exp(-((t - 14) ** 2) / 6) + 2.5 * Math.exp(-((t - 35) ** 2) / 4) - 1.0,
  };

  const regionOrder = ["prefrontal", "visual", "auditory", "limbic", "defaultMode"];
  const regionBounds = [0, 0.15, 0.35, 0.55, 0.75, 1.0]; // fractional boundaries

  for (let i = 0; i < N; i++) {
    const frac = i / N;
    // Determine which region this vertex belongs to
    let regionIdx = 0;
    for (let r = 0; r < 5; r++) {
      if (frac >= regionBounds[r] && frac < regionBounds[r + 1]) { regionIdx = r; break; }
    }
    const regionName = regionOrder[regionIdx];
    const baseActivation = regionProfiles[regionName](t);

    // Add per-vertex spatial variation (deterministic from index)
    const spatialNoise = Math.sin(i * 0.47) * 0.4 + Math.cos(i * 0.31) * 0.3;
    // Add slight temporal jitter so it doesn't look frozen
    const temporalJitter = Math.sin(t * 0.8 + i * 0.1) * 0.15;

    activations.push(baseActivation + spatialNoise + temporalJitter);
  }

  return { timestamp: _timestamp, vertex_activations: activations };
}

export function mockCompareVideos(jobIds: string[]): ComparisonResult {
  const scores = [MOCK_NEURAL_SCORE];
  // Generate slightly different scores for additional jobs
  for (let i = 1; i < jobIds.length; i++) {
    scores.push(i === 1 ? MOCK_NEURAL_SCORE_B : {
      total: Math.round(rand(40, 85)),
      hook_score: Math.round(rand(35, 90)),
      sustained_attention: Math.round(rand(40, 80)),
      emotional_resonance: Math.round(rand(35, 85)),
      memory_encoding: Math.round(rand(40, 75)),
      aesthetic_quality: Math.round(rand(35, 85)),
      cognitive_accessibility: Math.round(rand(40, 80)),
    });
  }

  const deltaMetrics: Record<string, number[]> = {};
  for (const m of MOCK_METRICS.slice(0, 10)) {
    deltaMetrics[m.name] = jobIds.map((_, i) =>
      i === 0 ? m.score : Math.round(m.score + rand(-20, 10))
    );
  }

  return {
    job_ids: jobIds,
    labels: jobIds.map((id) => id.slice(0, 12)),
    neural_scores: scores,
    winner_job_id: jobIds[0],
    recommendation:
      "Video 1 outperforms across hook strength, emotional resonance, and aesthetic quality. " +
      "Video 2 shows stronger memory encoding — consider combining V1's hook with V2's narrative structure for an optimal variant.",
    delta_metrics: deltaMetrics,
  };
}

export function mockExportReport(): { download_url: string | null; format: string } {
  return { download_url: null, format: "pdf" };
}

// ── Mock WebSocket (progress simulation) ─────────────────────────────────────

const PROGRESS_STEPS: { status: JobStatus; progress: number; message: string }[] = [
  { status: "queued", progress: 0, message: "Job queued..." },
  { status: "downloading", progress: 0.1, message: "Downloading video..." },
  { status: "downloading", progress: 0.2, message: "Downloading video... 45%" },
  { status: "transcribing", progress: 0.3, message: "Transcribing audio with Whisper..." },
  { status: "transcribing", progress: 0.4, message: "Transcription complete" },
  { status: "inferring", progress: 0.5, message: "Running TRIBE v2 forward pass..." },
  { status: "inferring", progress: 0.6, message: "Processing 20,484 cortical vertices..." },
  { status: "aggregating", progress: 0.7, message: "Aggregating ROI activations..." },
  { status: "aggregating", progress: 0.8, message: "Computing region-level means..." },
  { status: "scoring", progress: 0.9, message: "Mapping to GTM metrics..." },
  { status: "scoring", progress: 0.95, message: "Finalizing neural score..." },
  { status: "complete", progress: 1.0, message: "Analysis complete!" },
];

export function mockConnectJobWebSocket(
  jobId: string,
  onEvent: (event: ProgressEvent) => void,
  onDone: () => void,
  _onError: (msg: string) => void
): () => void {
  let step = 0;
  let cancelled = false;

  function tick() {
    if (cancelled || step >= PROGRESS_STEPS.length) return;
    const { status, progress, message } = PROGRESS_STEPS[step];
    onEvent({ job_id: jobId, status, progress, message });
    if (status === "complete") {
      onDone();
      return;
    }
    step++;
    setTimeout(tick, 600 + Math.random() * 400);
  }

  setTimeout(tick, 300);

  return () => {
    cancelled = true;
  };
}
