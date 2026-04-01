import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "NeuroPeer Analysis Report";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image({ params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;

  const apiBase = process.env.NEXT_PUBLIC_API_URL ?? "https://neuropeer-api-production.up.railway.app";
  let score = 0;
  let title = "";
  let url = "";
  let cType = "content";

  try {
    const res = await fetch(`${apiBase}/api/v1/results/${jobId}`, { next: { revalidate: 300 } });
    if (res.ok) {
      const data = await res.json();
      score = data.neural_score?.total ?? 0;
      title = data.ai_report_title || "";
      url = data.url ?? "";
      cType = (data.content_type ?? "content").replace("_", " ");
    }
  } catch {}

  const scoreStr = score.toFixed(1);
  const label = score >= 80 ? "EXCEPTIONAL" : score >= 65 ? "STRONG" : score >= 50 ? "MODERATE" : score > 0 ? "NEEDS WORK" : "ANALYSIS";
  const scoreColor = score >= 75 ? "#059669" : score >= 50 ? "#b45309" : "#dc2626";
  const scoreBg = score >= 75 ? "#ecfdf5" : score >= 50 ? "#fffbeb" : "#fef2f2";
  const shortUrl = url.replace(/https?:\/\/(www\.)?/, "").slice(0, 50);

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
          background: "#f5f3ef",
          position: "relative",
        }}
      >
        {/* Subtle gradient accent */}
        <div style={{ position: "absolute", top: -100, right: -100, width: 400, height: 400, borderRadius: "50%", background: `radial-gradient(circle, ${scoreBg} 0%, transparent 70%)` }} />

        {/* Logo */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 32 }}>
          <div style={{ width: 36, height: 36, borderRadius: 8, background: "linear-gradient(135deg, #fb923c, #ea580c)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, color: "white", fontWeight: 800 }}>N</div>
          <span style={{ fontSize: 22, fontWeight: 700, color: "#1a1714" }}>NeuroPeer</span>
        </div>

        {/* Score — the hero */}
        <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
          <span style={{ fontSize: 160, fontWeight: 800, color: scoreColor, lineHeight: 1, letterSpacing: -4 }}>
            {scoreStr}
          </span>
          <span style={{ fontSize: 40, color: "rgba(26,23,20,0.2)", fontWeight: 400 }}>/100</span>
        </div>

        {/* Label */}
        <span style={{ fontSize: 16, color: scoreColor, fontWeight: 700, textTransform: "uppercase", letterSpacing: 4, marginTop: 4 }}>
          {label}
        </span>

        {/* Title + details */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginTop: 28, gap: 6 }}>
          {title && (
            <span style={{ fontSize: 20, fontWeight: 600, color: "#1a1714", maxWidth: 600, textAlign: "center" }}>
              {title}
            </span>
          )}
          <div style={{ display: "flex", gap: 12 }}>
            <span style={{ fontSize: 13, color: "rgba(26,23,20,0.35)", background: "rgba(26,23,20,0.05)", padding: "3px 10px", borderRadius: 6 }}>{cType}</span>
          </div>
          {shortUrl && (
            <span style={{ fontSize: 12, color: "rgba(26,23,20,0.2)", marginTop: 2 }}>{shortUrl}</span>
          )}
        </div>

        {/* Footer */}
        <div style={{ position: "absolute", bottom: 18, fontSize: 11, color: "rgba(26,23,20,0.15)" }}>
          Neural GTM Content Analysis · Powered by Meta TRIBE v2
        </div>
      </div>
    ),
    { ...size }
  );
}
