import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "NeuroPeer A/B Comparison";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image() {
  // Comparison OG is static since we can't read search params in OG route
  // The actual scores are in the URL query which isn't available here
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
        {/* Bottom accent */}
        <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 4, background: "linear-gradient(to right, #ea580c, #14b8a6)" }} />

        {/* Logo */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 36 }}>
          <div style={{ width: 36, height: 36, borderRadius: 8, background: "linear-gradient(135deg, #fb923c, #ea580c)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, color: "white", fontWeight: 800 }}>N</div>
          <span style={{ fontSize: 22, fontWeight: 700, color: "#1a1714" }}>NeuroPeer</span>
        </div>

        {/* VS layout */}
        <div style={{ display: "flex", alignItems: "center", gap: 40 }}>
          {/* Left score placeholder */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
            <div style={{ width: 120, height: 120, borderRadius: "50%", border: "6px solid #ea580c", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <span style={{ fontSize: 44, fontWeight: 800, color: "#ea580c" }}>A</span>
            </div>
            <span style={{ fontSize: 14, color: "rgba(26,23,20,0.4)" }}>Report A</span>
          </div>

          {/* VS divider */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 48, fontWeight: 800, color: "rgba(26,23,20,0.12)" }}>vs</span>
          </div>

          {/* Right score placeholder */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
            <div style={{ width: 120, height: 120, borderRadius: "50%", border: "6px solid #0d9488", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <span style={{ fontSize: 44, fontWeight: 800, color: "#0d9488" }}>B</span>
            </div>
            <span style={{ fontSize: 14, color: "rgba(26,23,20,0.4)" }}>Report B</span>
          </div>
        </div>

        {/* Title */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginTop: 32, gap: 4 }}>
          <span style={{ fontSize: 28, fontWeight: 700, color: "#1a1714" }}>A/B Neural Comparison</span>
          <span style={{ fontSize: 14, color: "rgba(26,23,20,0.3)" }}>Side-by-side neural engagement analysis</span>
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
