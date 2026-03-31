import type { AnalysisResult, NeuralScoreBreakdown, MetricScore, KeyMoment } from "./types";

interface Message {
  role: "system" | "user";
  content: string;
}

const SYSTEM_PROMPT = `You are NeuroPeer's neural content strategist. You analyze video content performance using fMRI-grade brain response predictions from Meta's TRIBE v2 model, which predicts cortical vertex activations across 20,484 brain surface points.

You provide actionable, neuroscience-grounded recommendations. Each insight should connect neural activation patterns to specific content decisions.

IMPORTANT: Respond ONLY with valid JSON. No markdown wrapping, no explanation outside the JSON.`;

function formatScores(ns: NeuralScoreBreakdown): string {
  return [
    `Overall Neural Score: ${Math.round(ns.total)}/100`,
    `Hook Score (first 3s): ${Math.round(ns.hook_score)}`,
    `Sustained Attention: ${Math.round(ns.sustained_attention)}`,
    `Emotional Resonance: ${Math.round(ns.emotional_resonance)}`,
    `Memory Encoding: ${Math.round(ns.memory_encoding)}`,
    `Aesthetic Quality: ${Math.round(ns.aesthetic_quality)}`,
    `Cognitive Accessibility: ${Math.round(ns.cognitive_accessibility)}`,
  ].join("\n");
}

function formatMetrics(metrics: MetricScore[]): string {
  return metrics
    .sort((a, b) => a.score - b.score)
    .map((m) => `${m.name}: ${Math.round(m.score)}/100 — ${m.description} (GTM proxy: ${m.gtm_proxy})`)
    .join("\n");
}

function formatMoments(moments: KeyMoment[]): string {
  return moments
    .map((m) => `[${m.timestamp}s] ${m.type}: ${m.label} (activation score: ${Math.round(m.score)})`)
    .join("\n");
}

// ── Analysis Feedback ────────────────────────────────────────────────────────

export function buildAnalysisFeedbackPrompt(result: AnalysisResult): Message[] {
  const weakMetrics = result.metrics.filter((m) => m.score < 70).sort((a, b) => a.score - b.score);
  const strongMetrics = result.metrics.filter((m) => m.score >= 50).sort((a, b) => b.score - a.score);

  return [
    { role: "system", content: SYSTEM_PROMPT },
    {
      role: "user",
      content: `Analyze this ${result.content_type.replace("_", " ")} video (${result.duration_seconds}s).

NEURAL SCORE BREAKDOWN:
${formatScores(result.neural_score)}

ALL METRICS (sorted weakest first):
${formatMetrics(result.metrics)}

KEY TEMPORAL MOMENTS:
${formatMoments(result.key_moments)}

URL: ${result.url}

Respond with this exact JSON structure:
{
  "summary": "3-4 sentence executive assessment. Reference the overall score, identify the strongest dimension, name the critical weakness, and give a one-line recommendation.",
  "report_title": "A creative 3-5 word title for this analysis report",
  "priorities": [
    "HIGHEST IMPACT: [Specific action] — explain exactly what to change and why it matters neurally",
    "SECOND PRIORITY: [Specific action] — concrete recommendation tied to a weak metric",
    "THIRD PRIORITY: [Specific action] — another improvement with expected neural impact"
  ],
  "action_items": [
    "Quick win: [1-sentence actionable takeaway]",
    "Content fix: [1-sentence specific edit to make]",
    "Strategy shift: [1-sentence strategic recommendation]"
  ],
  "category_strategies": {
    "Attention & Hook": {
      "score_context": "Brief assessment of attention metrics performance",
      "strategies": [
        "Detailed strategy 1 with neuroscience rationale (cite NAcc/AIns activation patterns)",
        "Detailed strategy 2 with specific timing recommendations"
      ]
    },
    "Emotional Engagement": {
      "score_context": "Brief assessment of emotional metrics",
      "strategies": [
        "Strategy for improving limbic activation patterns",
        "Strategy for valence optimization"
      ]
    },
    "Memory & Recall": {
      "score_context": "Brief assessment of memory encoding",
      "strategies": [
        "Strategy for hippocampal activation improvement",
        "Strategy for message clarity via Broca/Wernicke areas"
      ]
    },
    "Production Quality": {
      "score_context": "Brief assessment of aesthetic and sensory metrics",
      "strategies": [
        "Visual/audio production recommendations",
        "Modality balance optimization"
      ]
    }
  },
  "metric_tips": {
    "Metric Name": "Specific tip for this metric, grounded in its neural substrate and what content changes would improve activation"
  }
}

Include metric_tips for the 5 weakest metrics. Category strategies should be detailed (2-3 sentences each) and reference specific neural regions. The report_title should be punchy and memorable.`,
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
  "recommendation": "2-3 sentences comparing the videos. State the winner clearly, explain WHY it wins (which specific dimensions), and suggest what the losing video(s) could learn from the winner.",
  "winner_reason": "One sentence on the key differentiator"
}`,
    },
  ];
}
