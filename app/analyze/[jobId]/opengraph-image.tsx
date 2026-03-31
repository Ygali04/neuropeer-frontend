import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "NeuroPeer Analysis Report";
export const size = { width: 1200, height: 630 };

export default async function Image({ params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;

  // Try to fetch real data from the API for OG image
  const apiBase = process.env.NEXT_PUBLIC_API_URL ?? "https://neuropeer-api-production.up.railway.app";
  let score = 0;
  let url = "Video Analysis";
  let cType = "Content";
  let duration = 0;

  try {
    const res = await fetch(`${apiBase}/api/v1/results/${jobId}`, { next: { revalidate: 300 } });
    if (res.ok) {
      const data = await res.json();
      score = data.neural_score?.total ?? 0;
      url = data.url ?? "Video Analysis";
      cType = (data.content_type ?? "content").replace("_", " ");
      duration = data.duration_seconds ?? 0;
    }
  } catch {
    // Fallback to generic OG image
  }

  const scoreColor = score >= 75 ? "#34d399" : score >= 50 ? "#fbbf24" : "#f87171";

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%", height: "100%", display: "flex", flexDirection: "column",
          justifyContent: "center", alignItems: "center", background: "#07060b",
          position: "relative", overflow: "hidden",
        }}
      >
        <div style={{ position: "absolute", top: -80, left: 150, width: 500, height: 350, borderRadius: "50%", background: "radial-gradient(circle, rgba(249,115,22,0.1) 0%, transparent 70%)" }} />
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 40, height: 40, borderRadius: 10, background: "linear-gradient(135deg, #fb923c, #ea580c)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, color: "white", fontWeight: 800 }}>N</div>
            <span style={{ fontSize: 28, fontWeight: 700, color: "white" }}>NeuroPeer</span>
          </div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
            <span style={{ fontSize: 96, fontWeight: 800, color: scoreColor, lineHeight: 1 }}>{Math.round(score)}</span>
            <span style={{ fontSize: 32, color: "rgba(255,255,255,0.2)" }}>/100</span>
          </div>
          <span style={{ fontSize: 18, color: scoreColor, fontWeight: 600, textTransform: "uppercase", letterSpacing: 3 }}>
            {score >= 80 ? "EXCEPTIONAL" : score >= 65 ? "STRONG" : score >= 50 ? "MODERATE" : score > 0 ? "NEEDS WORK" : "ANALYSIS"}
          </span>
          <div style={{ display: "flex", gap: 16, marginTop: 8 }}>
            <span style={{ fontSize: 14, color: "rgba(255,255,255,0.35)", background: "rgba(255,255,255,0.05)", padding: "4px 12px", borderRadius: 8 }}>{cType}</span>
            {duration > 0 && <span style={{ fontSize: 14, color: "rgba(255,255,255,0.35)", background: "rgba(255,255,255,0.05)", padding: "4px 12px", borderRadius: 8 }}>{duration}s</span>}
          </div>
          <p style={{ fontSize: 13, color: "rgba(255,255,255,0.15)", marginTop: 4, maxWidth: 600 }}>{url}</p>
        </div>
        <div style={{ position: "absolute", bottom: 20, fontSize: 11, color: "rgba(255,255,255,0.12)" }}>
          Neural GTM Content Analysis · Powered by Meta TRIBE v2
        </div>
      </div>
    ),
    { ...size }
  );
}
