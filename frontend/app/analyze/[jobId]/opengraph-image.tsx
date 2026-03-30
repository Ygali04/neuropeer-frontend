import { ImageResponse } from "next/og";
import { getDemoResult } from "@/lib/demo-results";

export const runtime = "edge";
export const alt = "NeuroPeer Analysis Report";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image({ params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;
  const demo = getDemoResult(jobId);

  const score = demo?.neural_score.total ?? 0;
  const url = demo?.url ?? "Video Analysis";
  const contentType = demo?.content_type?.replace("_", " ") ?? "Content";
  const duration = demo?.duration_seconds ?? 0;

  // Score color
  const scoreColor = score >= 75 ? "#34d399" : score >= 50 ? "#fbbf24" : "#f87171";

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
          background: "#07060b",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* Background orbs */}
        <div style={{ position: "absolute", top: -80, left: 150, width: 500, height: 350, borderRadius: "50%", background: "radial-gradient(circle, rgba(249,115,22,0.1) 0%, transparent 70%)" }} />
        <div style={{ position: "absolute", bottom: -50, right: 200, width: 350, height: 250, borderRadius: "50%", background: `radial-gradient(circle, ${scoreColor}15 0%, transparent 70%)` }} />

        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 20, position: "relative" }}>
          {/* Logo */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
            <div style={{ width: 40, height: 40, borderRadius: 10, background: "linear-gradient(135deg, #fb923c, #ea580c)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, color: "white", fontWeight: 800 }}>
              N
            </div>
            <span style={{ fontSize: 28, fontWeight: 700, color: "white" }}>NeuroPeer</span>
          </div>

          {/* Big score */}
          <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
            <span style={{ fontSize: 96, fontWeight: 800, color: scoreColor, lineHeight: 1 }}>
              {Math.round(score)}
            </span>
            <span style={{ fontSize: 32, color: "rgba(255,255,255,0.2)", fontWeight: 400 }}>/100</span>
          </div>

          {/* Label */}
          <span style={{ fontSize: 18, color: scoreColor, fontWeight: 600, textTransform: "uppercase", letterSpacing: 3 }}>
            {score >= 80 ? "EXCEPTIONAL" : score >= 65 ? "STRONG" : score >= 50 ? "MODERATE" : "NEEDS WORK"}
          </span>

          {/* Content info */}
          <div style={{ display: "flex", gap: 16, marginTop: 8 }}>
            <span style={{ fontSize: 14, color: "rgba(255,255,255,0.35)", background: "rgba(255,255,255,0.05)", padding: "4px 12px", borderRadius: 8 }}>
              {contentType}
            </span>
            {duration > 0 && (
              <span style={{ fontSize: 14, color: "rgba(255,255,255,0.35)", background: "rgba(255,255,255,0.05)", padding: "4px 12px", borderRadius: 8 }}>
                {duration}s
              </span>
            )}
          </div>

          {/* URL */}
          <p style={{ fontSize: 13, color: "rgba(255,255,255,0.15)", marginTop: 4, maxWidth: 600 }}>
            {url}
          </p>
        </div>

        {/* Footer */}
        <div style={{ position: "absolute", bottom: 20, fontSize: 11, color: "rgba(255,255,255,0.12)" }}>
          Neural GTM Content Analysis · Powered by Meta TRIBE v2
        </div>
      </div>
    ),
    { ...size }
  );
}
