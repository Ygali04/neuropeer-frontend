import type { AnalysisResult, NeuralScoreBreakdown, MetricScore, KeyMoment } from "./types";

interface Message {
  role: "system" | "user";
  content: string;
}

const SYSTEM_PROMPT = `You are NeuroPeer's neural content strategist. You analyze video content using fMRI-grade brain response predictions from Meta's TRIBE v2 model (20,484 cortical vertices at 1Hz).

Rules:
- Respond ONLY with valid JSON. No markdown wrapping.
- Keep text SHORT — every string must fit on a UI card (max 2 sentences per item).
- Be specific to the video's actual scores. No generic advice.
- Reference brain regions and neural mechanisms by name.`;

function topMetrics(metrics: MetricScore[], n: number, ascending: boolean): string {
  const sorted = [...metrics].sort((a, b) => ascending ? a.score - b.score : b.score - a.score);
  return sorted.slice(0, n).map(m => `${m.name}: ${Math.round(m.score)}/100`).join(", ");
}

function formatMoments(moments: KeyMoment[]): string {
  return moments.slice(0, 6).map(m => `${m.timestamp}s: ${m.type} (${Math.round(m.score)})`).join("; ");
}

// ── Analysis Feedback ────────────────────────────────────────────────────────

export function buildAnalysisFeedbackPrompt(result: AnalysisResult): Message[] {
  const ns = result.neural_score;
  return [
    { role: "system", content: SYSTEM_PROMPT },
    {
      role: "user",
      content: `Video: ${result.content_type.replace("_", " ")} (${result.duration_seconds}s)
Score: ${Math.round(ns.total)}/100 | Hook: ${Math.round(ns.hook_score)} | Attention: ${Math.round(ns.sustained_attention)} | Emotion: ${Math.round(ns.emotional_resonance)} | Memory: ${Math.round(ns.memory_encoding)} | Aesthetic: ${Math.round(ns.aesthetic_quality)} | Clarity: ${Math.round(ns.cognitive_accessibility)}
Weakest: ${topMetrics(result.metrics, 5, true)}
Strongest: ${topMetrics(result.metrics, 3, false)}
Moments: ${formatMoments(result.key_moments)}

Return this JSON:
{
  "summary": "2-3 sentence assessment. State score, top strength, critical weakness, one recommendation.",
  "report_title": "Creative 3-5 word title",
  "action_items": [
    "Specific quick-win action (1 sentence, max 15 words)",
    "Content edit to make (1 sentence, max 15 words)",
    "Strategic shift (1 sentence, max 15 words)"
  ],
  "priorities": [
    "TOP: What to fix first and why (1-2 sentences)",
    "SECOND: Next improvement (1-2 sentences)",
    "THIRD: Third improvement (1-2 sentences)"
  ],
  "category_strategies": {
    "Attention & Hook": {
      "score_context": "1 sentence assessment (max 20 words)",
      "strategies": ["Strategy with neural rationale (2 sentences max)", "Second strategy (2 sentences max)"]
    },
    "Emotional Engagement": {
      "score_context": "1 sentence (max 20 words)",
      "strategies": ["Strategy (2 sentences max)", "Strategy (2 sentences max)"]
    },
    "Memory & Recall": {
      "score_context": "1 sentence (max 20 words)",
      "strategies": ["Strategy (2 sentences max)", "Strategy (2 sentences max)"]
    },
    "Production Quality": {
      "score_context": "1 sentence (max 20 words)",
      "strategies": ["Strategy (2 sentences max)", "Strategy (2 sentences max)"]
    }
  },
  "metric_tips": {
    "WeakestMetric1": "1-sentence tip grounded in neural substrate",
    "WeakestMetric2": "1-sentence tip",
    "WeakestMetric3": "1-sentence tip"
  }
}`
    },
  ];
}

// ── Comparison Feedback ──────────────────────────────────────────────────────

export function buildComparisonFeedbackPrompt(
  jobIds: string[],
  scores: NeuralScoreBreakdown[],
  labels: string[],
  deltaMetrics: Record<string, number[]>
): Message[] {
  const videoSummaries = scores
    .map((ns, i) => `V${i + 1} (${labels[i]}): ${Math.round(ns.total)}/100 — Hook ${Math.round(ns.hook_score)}, Emotion ${Math.round(ns.emotional_resonance)}, Memory ${Math.round(ns.memory_encoding)}`)
    .join("\n");

  return [
    { role: "system", content: SYSTEM_PROMPT },
    {
      role: "user",
      content: `Compare ${scores.length} videos:\n${videoSummaries}\n\nReturn JSON:\n{"recommendation":"2 sentences comparing videos and stating winner","winner_reason":"1 sentence key differentiator"}`
    },
  ];
}
