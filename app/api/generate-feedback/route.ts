import { NextResponse } from "next/server";
import { callGLM } from "@/lib/glm";
import { buildAnalysisFeedbackPrompt, buildComparisonFeedbackPrompt } from "@/lib/feedback-prompts";
import type { AnalysisResult, NeuralScoreBreakdown } from "@/lib/types";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { type } = body;

    if (type === "analysis") {
      const result: AnalysisResult = body.data;
      const messages = buildAnalysisFeedbackPrompt(result);
      const raw = await callGLM(messages, 0.7, 1000);

      // Parse JSON from GLM response (may have markdown wrapping)
      const jsonStr = raw.replace(/^```json?\s*/, "").replace(/\s*```$/, "").trim();
      const parsed = JSON.parse(jsonStr);

      return NextResponse.json({
        summary: parsed.summary ?? "",
        priorities: parsed.priorities ?? [],
        metric_tips: parsed.metric_tips ?? {},
      });
    }

    if (type === "comparison") {
      const { jobIds, scores, labels, deltaMetrics } = body.data as {
        jobIds: string[];
        scores: NeuralScoreBreakdown[];
        labels: string[];
        deltaMetrics: Record<string, number[]>;
      };
      const messages = buildComparisonFeedbackPrompt(jobIds, scores, labels, deltaMetrics);
      const raw = await callGLM(messages, 0.7, 600);

      const jsonStr = raw.replace(/^```json?\s*/, "").replace(/\s*```$/, "").trim();
      const parsed = JSON.parse(jsonStr);

      return NextResponse.json({
        recommendation: parsed.recommendation ?? "",
        winner_reason: parsed.winner_reason ?? "",
      });
    }

    return NextResponse.json({ error: "Invalid type" }, { status: 400 });
  } catch (err) {
    console.error("GLM feedback error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to generate feedback" },
      { status: 500 }
    );
  }
}
