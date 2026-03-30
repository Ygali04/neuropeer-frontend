import type { AnalysisResult, NeuralScoreBreakdown, MetricScore, KeyMoment } from "./types";

interface Message {
  role: "system" | "user";
  content: string;
}

const SYSTEM_PROMPT = `You are NeuroPeer's neural content analyst. You analyze video content performance using fMRI-grade brain response predictions from Meta's TRIBE v2 model.

You receive neural engagement scores (0-100) across multiple dimensions and must provide actionable, specific feedback.

IMPORTANT: Respond ONLY with valid JSON. No markdown, no explanation outside the JSON.`;

function formatScores(ns: NeuralScoreBreakdown): string {
  return [
    `Overall: ${Math.round(ns.total)}/100`,
    `Hook: ${Math.round(ns.hook_score)}`,
    `Sustained Attention: ${Math.round(ns.sustained_attention)}`,
    `Emotional Resonance: ${Math.round(ns.emotional_resonance)}`,
    `Memory Encoding: ${Math.round(ns.memory_encoding)}`,
    `Aesthetic Quality: ${Math.round(ns.aesthetic_quality)}`,
    `Cognitive Accessibility: ${Math.round(ns.cognitive_accessibility)}`,
  ].join(", ");
}

function formatMetrics(metrics: MetricScore[]): string {
  return metrics
    .sort((a, b) => a.score - b.score)
    .map((m) => `${m.name}: ${Math.round(m.score)}/100 (${m.gtm_proxy})`)
    .join("\n");
}

function formatMoments(moments: KeyMoment[]): string {
  return moments
    .map((m) => `${m.timestamp}s: ${m.type} — ${m.label} (score: ${m.score})`)
    .join("\n");
}

// ── Analysis Feedback ────────────────────────────────────────────────────────

export function buildAnalysisFeedbackPrompt(result: AnalysisResult): Message[] {
  const weakMetrics = result.metrics.filter((m) => m.score < 70).sort((a, b) => a.score - b.score);
  const strongMetrics = result.metrics.filter((m) => m.score >= 75).sort((a, b) => b.score - a.score);

  return [
    { role: "system", content: SYSTEM_PROMPT },
    {
      role: "user",
      content: `Analyze this ${result.content_type.replace("_", " ")} video (${result.duration_seconds}s).

NEURAL SCORES:
${formatScores(result.neural_score)}

TOP METRICS:
${formatMetrics(strongMetrics.slice(0, 5))}

WEAKEST METRICS:
${formatMetrics(weakMetrics.slice(0, 5))}

KEY MOMENTS:
${formatMoments(result.key_moments)}

URL: ${result.url}

Respond with this exact JSON structure:
{
  "summary": "2-3 sentence overall assessment of the video's neural engagement performance. Mention the overall score, key strengths, and the most critical weakness.",
  "priorities": [
    "First priority action — the single most impactful fix, be specific about what and where in the video",
    "Second priority — another specific, actionable improvement",
    "Third priority — a third specific improvement"
  ],
  "metric_tips": {
    "Metric Name": "One specific, actionable tip for improving this metric based on the video's actual performance"
  }
}

For metric_tips, include only the 3-4 weakest metrics (score < 70). Be specific to this video's content type and scores — no generic advice.`,
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
    .map((ns, i) => `Video ${i + 1} (${labels[i]}): Overall ${Math.round(ns.total)}/100 — Hook ${Math.round(ns.hook_score)}, Attention ${Math.round(ns.sustained_attention)}, Emotion ${Math.round(ns.emotional_resonance)}, Memory ${Math.round(ns.memory_encoding)}, Aesthetic ${Math.round(ns.aesthetic_quality)}, Clarity ${Math.round(ns.cognitive_accessibility)}`)
    .join("\n");

  const metricComparison = Object.entries(deltaMetrics)
    .slice(0, 8)
    .map(([name, vals]) => `${name}: ${vals.map((v, i) => `V${i + 1}=${Math.round(v)}`).join(", ")}`)
    .join("\n");

  return [
    { role: "system", content: SYSTEM_PROMPT },
    {
      role: "user",
      content: `Compare these ${scores.length} videos for neural engagement:

${videoSummaries}

METRIC COMPARISON:
${metricComparison}

Respond with this exact JSON structure:
{
  "recommendation": "2-3 sentences comparing the videos. State the winner clearly, explain WHY it wins (which specific dimensions), and suggest what the losing video(s) could learn from the winner. Be specific about scores.",
  "winner_reason": "One sentence on the key differentiator"
}`,
    },
  ];
}
