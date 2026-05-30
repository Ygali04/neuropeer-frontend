import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "NeuroPeer — Neural GTM Content Analyzer";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image() {
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
        {/* Background gradient orbs */}
        <div
          style={{
            position: "absolute",
            top: -100,
            left: 200,
            width: 600,
            height: 400,
            borderRadius: "50%",
            background: "radial-gradient(circle, rgba(249,115,22,0.12) 0%, transparent 70%)",
          }}
        />
        <div
          style={{
            position: "absolute",
            bottom: -50,
            right: 150,
            width: 400,
            height: 300,
            borderRadius: "50%",
            background: "radial-gradient(circle, rgba(45,212,191,0.08) 0%, transparent 70%)",
          }}
        />

        {/* Content */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 16,
            position: "relative",
          }}
        >
          {/* Logo */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              marginBottom: 8,
            }}
          >
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: 12,
                background: "linear-gradient(135deg, #fb923c, #ea580c)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 24,
                color: "white",
                fontWeight: 800,
              }}
            >
              N
            </div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
              <span style={{ fontSize: 36, fontWeight: 700, color: "white" }}>
                NeuroPeer
              </span>
            </div>
          </div>

          {/* Tagline */}
          <p
            style={{
              fontSize: 28,
              color: "rgba(255,255,255,0.5)",
              textAlign: "center",
              maxWidth: 700,
              lineHeight: 1.4,
            }}
          >
            Predict fMRI-level brain responses to your GTM content
          </p>

          {/* Stats */}
          <div
            style={{
              display: "flex",
              gap: 40,
              marginTop: 24,
            }}
          >
            {[
              { value: "20,484", label: "Cortical Vertices" },
              { value: "18", label: "GTM Metrics" },
              { value: "1Hz", label: "Resolution" },
            ].map((stat) => (
              <div
                key={stat.label}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                }}
              >
                <span style={{ fontSize: 32, fontWeight: 700, color: "white" }}>
                  {stat.value}
                </span>
                <span style={{ fontSize: 14, color: "rgba(255,255,255,0.3)" }}>
                  {stat.label}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            position: "absolute",
            bottom: 24,
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <span style={{ fontSize: 12, color: "rgba(255,255,255,0.15)" }}>
            Powered by Meta TRIBE v2 · Neural Simulation Engine
          </span>
        </div>
      </div>
    ),
    { ...size }
  );
}
