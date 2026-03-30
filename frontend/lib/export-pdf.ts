import type { AnalysisResult } from "./types";

export async function generateReportPDF(result: AnalysisResult): Promise<void> {
  // Dynamic imports to keep bundle size down
  const { jsPDF } = await import("jspdf");

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 16;
  const contentWidth = pageWidth - margin * 2;
  let y = margin;

  const addLine = (height: number = 0.3) => {
    doc.setDrawColor(200, 200, 200);
    doc.setLineWidth(height);
    doc.line(margin, y, pageWidth - margin, y);
    y += 4;
  };

  const checkNewPage = (needed: number) => {
    if (y + needed > doc.internal.pageSize.getHeight() - margin) {
      doc.addPage();
      y = margin;
    }
  };

  // ── Header ────────────────────────────────────────────────────────────
  doc.setFillColor(7, 6, 11);
  doc.rect(0, 0, pageWidth, 35, "F");

  doc.setTextColor(249, 115, 22);
  doc.setFontSize(20);
  doc.setFont("helvetica", "bold");
  doc.text("NeuroPeer", margin, 15);

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.text("Neural GTM Content Analysis Report", margin, 22);

  doc.setTextColor(150, 150, 150);
  doc.setFontSize(7);
  doc.text(`Generated ${new Date().toLocaleDateString()} | Powered by Meta TRIBE v2`, margin, 28);

  y = 42;

  // ── Content Info ──────────────────────────────────────────────────────
  doc.setTextColor(80, 80, 80);
  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.text("ANALYZED CONTENT", margin, y);
  y += 5;

  doc.setFont("helvetica", "normal");
  doc.setTextColor(40, 40, 40);
  doc.setFontSize(9);
  doc.text(result.url, margin, y, { maxWidth: contentWidth });
  y += 5;

  doc.setFontSize(8);
  doc.setTextColor(120, 120, 120);
  doc.text(
    `${result.content_type.replace("_", " ")} | ${result.duration_seconds.toFixed(0)}s duration | ${result.metrics.length} metrics`,
    margin, y
  );
  y += 8;

  addLine();

  // ── Neural Score ──────────────────────────────────────────────────────
  doc.setTextColor(80, 80, 80);
  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.text("NEURAL SCORE", margin, y);
  y += 6;

  const score = result.neural_score;
  const scoreColor = score.total >= 75 ? [34, 197, 94] : score.total >= 50 ? [251, 191, 36] : [248, 113, 113];

  doc.setFontSize(28);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(scoreColor[0], scoreColor[1], scoreColor[2]);
  doc.text(`${Math.round(score.total)}`, margin, y + 2);
  doc.setFontSize(12);
  doc.setTextColor(180, 180, 180);
  doc.text("/100", margin + 18, y + 2);
  y += 10;

  // Score dimensions
  const dims = [
    { label: "Hook", value: score.hook_score },
    { label: "Attention", value: score.sustained_attention },
    { label: "Emotion", value: score.emotional_resonance },
    { label: "Memory", value: score.memory_encoding },
    { label: "Aesthetic", value: score.aesthetic_quality },
    { label: "Clarity", value: score.cognitive_accessibility },
  ];

  doc.setFontSize(7);
  dims.forEach((d, i) => {
    const col = i < 3 ? 0 : 1;
    const row = i % 3;
    const x = margin + col * (contentWidth / 2);
    const yy = y + row * 6;

    doc.setTextColor(120, 120, 120);
    doc.setFont("helvetica", "normal");
    doc.text(d.label, x, yy);

    const dimColor = d.value >= 75 ? [34, 197, 94] : d.value >= 50 ? [251, 191, 36] : [248, 113, 113];
    doc.setTextColor(dimColor[0], dimColor[1], dimColor[2]);
    doc.setFont("helvetica", "bold");
    doc.text(`${Math.round(d.value)}`, x + 35, yy);

    // Score bar
    doc.setFillColor(230, 230, 230);
    doc.rect(x + 42, yy - 2.5, 40, 2.5, "F");
    doc.setFillColor(dimColor[0], dimColor[1], dimColor[2]);
    doc.rect(x + 42, yy - 2.5, (d.value / 100) * 40, 2.5, "F");
  });
  y += 22;

  addLine();

  // ── Key Moments ───────────────────────────────────────────────────────
  checkNewPage(30);
  doc.setTextColor(80, 80, 80);
  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.text("KEY MOMENTS", margin, y);
  y += 6;

  result.key_moments.forEach((m) => {
    checkNewPage(8);
    doc.setFontSize(7);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(60, 60, 60);
    doc.text(`${m.timestamp.toFixed(0)}s`, margin, y);

    doc.setFont("helvetica", "normal");
    doc.setTextColor(100, 100, 100);
    doc.text(`${m.type.replace("_", " ")} — ${m.label}`, margin + 12, y);

    doc.setTextColor(150, 150, 150);
    doc.text(`Score: ${m.score}`, pageWidth - margin - 15, y);
    y += 5;
  });
  y += 4;

  addLine();

  // ── All Metrics ───────────────────────────────────────────────────────
  checkNewPage(20);
  doc.setTextColor(80, 80, 80);
  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.text("ALL METRICS", margin, y);
  y += 6;

  result.metrics.forEach((m) => {
    checkNewPage(10);

    const mColor = m.score >= 70 ? [34, 197, 94] : m.score >= 45 ? [251, 191, 36] : [248, 113, 113];

    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(mColor[0], mColor[1], mColor[2]);
    doc.text(`${Math.round(m.score)}`, margin, y);

    doc.setTextColor(50, 50, 50);
    doc.setFont("helvetica", "normal");
    doc.text(m.name, margin + 10, y);

    doc.setTextColor(150, 150, 150);
    doc.setFontSize(6);
    doc.text(m.gtm_proxy, margin + 10, y + 3.5);

    y += 8;
  });

  y += 4;
  addLine();

  // ── Overarching Summary ───────────────────────────────────────────────
  if (result.overarching_summary) {
    checkNewPage(25);
    doc.setTextColor(80, 80, 80);
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.text("IMPROVEMENT SUMMARY", margin, y);
    y += 5;

    doc.setFont("helvetica", "normal");
    doc.setTextColor(60, 60, 60);
    doc.setFontSize(7);
    const lines = doc.splitTextToSize(result.overarching_summary, contentWidth);
    doc.text(lines, margin, y);
    y += lines.length * 3.5;
  }

  // ── Footer ────────────────────────────────────────────────────────────
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(6);
    doc.setTextColor(180, 180, 180);
    doc.text(
      `NeuroPeer | Page ${i} of ${pageCount} | TRIBE v2 CC BY-NC 4.0`,
      pageWidth / 2,
      doc.internal.pageSize.getHeight() - 8,
      { align: "center" }
    );
  }

  // Save
  const filename = `neuropeer-report-${result.job_id.slice(0, 8)}-${new Date().toISOString().slice(0, 10)}.pdf`;
  doc.save(filename);
}
