import type { AnalysisResult } from "./types";

export async function generateReportPDF(result: AnalysisResult): Promise<void> {
  const { jsPDF } = await import("jspdf");

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 16;
  const contentWidth = pageWidth - margin * 2;
  let y = margin;

  // ── Color palette ──────────────────────────────────────────────────────
  const colors = {
    brand: [179, 88, 42] as [number, number, number],
    brandLight: [218, 162, 126] as [number, number, number],
    dark: [30, 28, 26] as [number, number, number],
    heading: [60, 55, 50] as [number, number, number],
    body: [80, 75, 70] as [number, number, number],
    muted: [140, 135, 130] as [number, number, number],
    light: [210, 205, 200] as [number, number, number],
    bg: [250, 248, 245] as [number, number, number],
    white: [255, 255, 255] as [number, number, number],
    green: [34, 140, 80] as [number, number, number],
    amber: [180, 130, 30] as [number, number, number],
    red: [190, 60, 50] as [number, number, number],
  };

  const scoreColor = (v: number): [number, number, number] =>
    v >= 70 ? colors.green : v >= 45 ? colors.amber : colors.red;

  const scoreLabel = (v: number): string =>
    v >= 80 ? "EXCELLENT" : v >= 65 ? "GOOD" : v >= 45 ? "MODERATE" : v >= 25 ? "WEAK" : "POOR";

  // ── Helpers ────────────────────────────────────────────────────────────
  const addSectionDivider = () => {
    y += 2;
    doc.setDrawColor(...colors.light);
    doc.setLineWidth(0.3);
    doc.line(margin, y, pageWidth - margin, y);
    y += 6;
  };

  const checkNewPage = (needed: number) => {
    if (y + needed > pageHeight - 18) {
      doc.addPage();
      y = margin;
    }
  };

  const sectionHeader = (title: string) => {
    checkNewPage(14);
    doc.setFillColor(...colors.brand);
    doc.rect(margin, y - 1, 1.5, 6, "F");
    doc.setTextColor(...colors.heading);
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.text(title, margin + 5, y + 3.5);
    y += 10;
  };

  // ── Page 1: Cover ────────────────────────────────────────────────────
  doc.setFillColor(...colors.dark);
  doc.rect(0, 0, pageWidth, 50, "F");

  doc.setTextColor(...colors.brand);
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text("NEUROPEER", margin, 16);

  doc.setTextColor(...colors.brandLight);
  doc.setFontSize(7);
  doc.setFont("helvetica", "normal");
  doc.text("Neural Video Intelligence", margin + 32, 16);

  const reportTitle = result.ai_report_title || "Neural Analysis Report";
  doc.setTextColor(...colors.white);
  doc.setFontSize(22);
  doc.setFont("helvetica", "bold");
  const titleLines: string[] = doc.splitTextToSize(reportTitle, contentWidth);
  doc.text(titleLines, margin, 32);

  doc.setTextColor(...colors.brandLight);
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.text(
    `${result.content_type.replace("_", " ").toUpperCase()}  |  ${result.duration_seconds.toFixed(0)}s  |  ${result.metrics.length} metrics  |  Generated ${new Date().toLocaleDateString()}`,
    margin, 44
  );

  y = 60;

  // ── Neural Score Hero ────────────────────────────────────────────────
  const score = result.neural_score;
  const mainColor = scoreColor(score.total);
  const label = scoreLabel(score.total);

  doc.setFillColor(...colors.bg);
  doc.roundedRect(margin, y, contentWidth, 40, 2, 2, "F");
  doc.setDrawColor(...colors.light);
  doc.roundedRect(margin, y, contentWidth, 40, 2, 2, "S");

  doc.setFontSize(36);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...mainColor);
  doc.text(`${score.total.toFixed(1)}`, margin + 8, y + 20);
  doc.setFontSize(14);
  doc.setTextColor(...colors.muted);
  doc.text("/100", margin + 30, y + 20);
  doc.setFontSize(9);
  doc.setTextColor(...mainColor);
  doc.text(label, margin + 8, y + 28);

  const dims = [
    { label: "Hook Score", value: score.hook_score },
    { label: "Sustained Attention", value: score.sustained_attention },
    { label: "Emotional Resonance", value: score.emotional_resonance },
    { label: "Memory Encoding", value: score.memory_encoding },
    { label: "Aesthetic Quality", value: score.aesthetic_quality },
    { label: "Cognitive Accessibility", value: score.cognitive_accessibility },
  ];

  const barX = margin + 60;
  const barW = contentWidth - 68;
  dims.forEach((d, i) => {
    const dy = y + 6 + i * 5.5;
    const dc = scoreColor(d.value);

    doc.setFontSize(6.5);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...colors.body);
    doc.text(d.label, barX, dy);

    doc.setFont("helvetica", "bold");
    doc.setTextColor(...dc);
    doc.text(`${d.value.toFixed(1)}`, barX + barW - 2, dy, { align: "right" });

    const trackW = barW - 22;
    const trackX = barX + 28;
    doc.setFillColor(235, 232, 228);
    doc.rect(trackX, dy - 2.5, trackW, 2, "F");
    doc.setFillColor(...dc);
    doc.rect(trackX, dy - 2.5, (d.value / 100) * trackW, 2, "F");
  });

  y += 46;

  // ── AI Analysis Summary ──────────────────────────────────────────────
  if (result.ai_summary) {
    sectionHeader("AI ANALYSIS SUMMARY");

    doc.setFillColor(...colors.bg);
    const summaryLines: string[] = doc.splitTextToSize(result.ai_summary, contentWidth - 10);
    const summaryH = summaryLines.length * 3.8 + 8;
    checkNewPage(summaryH);
    doc.roundedRect(margin, y - 2, contentWidth, summaryH, 1.5, 1.5, "F");
    doc.setFontSize(8);
    doc.setTextColor(...colors.body);
    doc.setFont("helvetica", "normal");
    doc.text(summaryLines, margin + 5, y + 3);
    y += summaryH + 4;
  }

  // ── Priorities ───────────────────────────────────────────────────────
  if (result.ai_priorities && result.ai_priorities.length > 0) {
    sectionHeader("TOP PRIORITIES");

    result.ai_priorities.forEach((p, i) => {
      const pLines: string[] = doc.splitTextToSize(p, contentWidth - 14);
      const blockH = pLines.length * 3.5 + 6;
      checkNewPage(blockH);

      doc.setFillColor(...colors.brand);
      doc.circle(margin + 3, y + 2, 2.5, "F");
      doc.setTextColor(...colors.white);
      doc.setFontSize(7);
      doc.setFont("helvetica", "bold");
      doc.text(`${i + 1}`, margin + 3, y + 3, { align: "center" });

      doc.setTextColor(...colors.body);
      doc.setFontSize(7.5);
      doc.setFont("helvetica", "normal");
      doc.text(pLines, margin + 9, y + 1.5);
      y += blockH + 2;
    });
    y += 2;
  }

  // ── Action Items ─────────────────────────────────────────────────────
  if (result.ai_action_items && result.ai_action_items.length > 0) {
    addSectionDivider();
    sectionHeader("DETAILED ACTION ITEMS");

    result.ai_action_items.forEach((item, i) => {
      const parts = item.split(" \u2192 ");
      const problem = parts[0] || item;
      const fix = parts[1] || "";

      const probLines: string[] = doc.splitTextToSize(problem, contentWidth - 14);
      const fixLines: string[] = fix ? doc.splitTextToSize(fix, contentWidth - 14) : [];
      const blockH = (probLines.length + fixLines.length) * 3.5 + (fix ? 10 : 6);
      checkNewPage(blockH);

      doc.setFillColor(...colors.bg);
      doc.roundedRect(margin, y - 2, contentWidth, blockH, 1.5, 1.5, "F");
      doc.setDrawColor(...colors.light);
      doc.roundedRect(margin, y - 2, contentWidth, blockH, 1.5, 1.5, "S");

      doc.setTextColor(...colors.brand);
      doc.setFontSize(8);
      doc.setFont("helvetica", "bold");
      doc.text(`ACTION ${i + 1}`, margin + 4, y + 2);

      y += 5;
      doc.setTextColor(...colors.body);
      doc.setFontSize(7);
      doc.setFont("helvetica", "normal");
      doc.text(probLines, margin + 4, y);
      y += probLines.length * 3.5;

      if (fix) {
        doc.setFillColor(...colors.brand);
        doc.rect(margin + 4, y, 0.8, fixLines.length * 3.5, "F");
        doc.setTextColor(...colors.heading);
        doc.setFontSize(7);
        doc.setFont("helvetica", "bold");
        doc.text("FIX:", margin + 7, y + 0.5);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(...colors.body);
        doc.text(fixLines, margin + 7, y + 4);
        y += fixLines.length * 3.5 + 5;
      }

      y += 4;
    });
  }

  // ── Attention Curve ──────────────────────────────────────────────────
  if (result.attention_curve.length > 0) {
    addSectionDivider();
    sectionHeader("ATTENTION CURVE");

    const curve = result.attention_curve;
    const chartX = margin;
    const chartW = contentWidth;
    const chartH = 25;
    checkNewPage(chartH + 10);

    doc.setFillColor(...colors.bg);
    doc.roundedRect(chartX, y, chartW, chartH, 1.5, 1.5, "F");

    doc.setFontSize(5);
    doc.setTextColor(...colors.muted);
    doc.text("100", chartX + 1, y + 3);
    doc.text("50", chartX + 1, y + chartH / 2 + 1);
    doc.text("0", chartX + 1, y + chartH - 1);

    doc.setDrawColor(230, 228, 225);
    doc.setLineWidth(0.1);
    for (const pct of [0.25, 0.5, 0.75]) {
      const gy = y + chartH * (1 - pct);
      doc.line(chartX + 8, gy, chartX + chartW - 2, gy);
    }

    const plotX = chartX + 8;
    const plotW = chartW - 10;
    if (curve.length > 1) {
      const maxV = Math.max(...curve, 100);
      doc.setDrawColor(...colors.brand);
      doc.setLineWidth(0.5);
      for (let i = 1; i < curve.length; i++) {
        const x1 = plotX + ((i - 1) / (curve.length - 1)) * plotW;
        const x2 = plotX + (i / (curve.length - 1)) * plotW;
        const y1 = y + chartH - (curve[i - 1] / maxV) * (chartH - 4) - 2;
        const y2 = y + chartH - (curve[i] / maxV) * (chartH - 4) - 2;
        doc.line(x1, y1, x2, y2);
      }

      result.key_moments.forEach((km) => {
        const idx = Math.round(km.timestamp);
        if (idx >= 0 && idx < curve.length) {
          const kx = plotX + (idx / (curve.length - 1)) * plotW;
          const ky = y + chartH - (curve[idx] / maxV) * (chartH - 4) - 2;
          const kmColor = km.type === "dropoff_risk" ? colors.red
            : km.type === "emotional_peak" ? colors.amber
            : km.type === "best_hook" || km.type === "peak_engagement" ? colors.green
            : colors.brand;
          doc.setFillColor(...kmColor);
          doc.circle(kx, ky, 0.8, "F");
        }
      });
    }

    doc.setFontSize(5);
    doc.setTextColor(...colors.muted);
    const step = Math.max(1, Math.floor(curve.length / 8));
    for (let i = 0; i < curve.length; i += step) {
      const tx = plotX + (i / Math.max(curve.length - 1, 1)) * plotW;
      doc.text(`${i}s`, tx, y + chartH + 3, { align: "center" });
    }

    y += chartH + 8;

    checkNewPage(20);
    doc.setFontSize(6);
    doc.setTextColor(...colors.muted);
    doc.text("Per-second attention values:", margin, y);
    y += 3;
    const cols = 10;
    for (let i = 0; i < curve.length; i += cols) {
      checkNewPage(5);
      const row = curve.slice(i, i + cols);
      const rowText = row.map((v, j) => `${i + j}s:${v.toFixed(0)}`).join("  ");
      doc.setFontSize(5.5);
      doc.setTextColor(...colors.body);
      doc.text(rowText, margin, y);
      y += 3;
    }
    y += 2;
  }

  // ── Emotional & Cognitive Curves ─────────────────────────────────────
  if (result.emotional_arousal_curve.length > 0) {
    addSectionDivider();
    sectionHeader("EMOTIONAL AROUSAL & COGNITIVE LOAD");

    const chartH = 20;
    checkNewPage(chartH + 10);
    doc.setFillColor(...colors.bg);
    doc.roundedRect(margin, y, contentWidth, chartH, 1.5, 1.5, "F");

    const plotX = margin + 8;
    const plotW = contentWidth - 10;
    const maxV = 100;

    const arousal = result.emotional_arousal_curve;
    const cog = result.cognitive_load_curve;

    if (arousal.length > 1) {
      doc.setDrawColor(200, 100, 60);
      doc.setLineWidth(0.4);
      for (let i = 1; i < arousal.length; i++) {
        const x1 = plotX + ((i - 1) / (arousal.length - 1)) * plotW;
        const x2 = plotX + (i / (arousal.length - 1)) * plotW;
        const y1 = y + chartH - (arousal[i - 1] / maxV) * (chartH - 4) - 2;
        const y2 = y + chartH - (arousal[i] / maxV) * (chartH - 4) - 2;
        doc.line(x1, y1, x2, y2);
      }
    }

    if (cog.length > 1) {
      doc.setDrawColor(100, 100, 180);
      doc.setLineWidth(0.4);
      for (let i = 1; i < cog.length; i++) {
        const x1 = plotX + ((i - 1) / (cog.length - 1)) * plotW;
        const x2 = plotX + (i / (cog.length - 1)) * plotW;
        const y1 = y + chartH - (cog[i - 1] / maxV) * (chartH - 4) - 2;
        const y2 = y + chartH - (cog[i] / maxV) * (chartH - 4) - 2;
        doc.line(x1, y1, x2, y2);
      }
    }

    doc.setFontSize(5.5);
    doc.setDrawColor(200, 100, 60);
    doc.setLineWidth(0.5);
    doc.line(margin + contentWidth - 40, y + 3, margin + contentWidth - 36, y + 3);
    doc.setTextColor(200, 100, 60);
    doc.text("Arousal", margin + contentWidth - 35, y + 4);

    doc.setDrawColor(100, 100, 180);
    doc.line(margin + contentWidth - 22, y + 3, margin + contentWidth - 18, y + 3);
    doc.setTextColor(100, 100, 180);
    doc.text("Cognitive", margin + contentWidth - 17, y + 4);

    y += chartH + 6;
  }

  // ── Key Moments ──────────────────────────────────────────────────────
  if (result.key_moments.length > 0) {
    addSectionDivider();
    sectionHeader(`KEY MOMENTS (${result.key_moments.length} events)`);

    result.key_moments.forEach((m) => {
      checkNewPage(6);
      const mColor = m.type === "dropoff_risk" ? colors.red
        : m.type === "emotional_peak" ? colors.amber
        : m.type === "best_hook" || m.type === "peak_engagement" ? colors.green
        : colors.brand;

      doc.setFillColor(...mColor);
      doc.circle(margin + 2, y - 0.5, 1.2, "F");

      doc.setFontSize(7);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...colors.heading);
      doc.text(`${m.type.replace(/_/g, " ")}`, margin + 6, y);

      doc.setFont("helvetica", "normal");
      doc.setTextColor(...colors.muted);
      doc.text(`@ ${m.timestamp.toFixed(0)}s`, margin + 45, y);

      const barX2 = margin + 58;
      const barW2 = 30;
      doc.setFillColor(235, 232, 228);
      doc.rect(barX2, y - 2, barW2, 2, "F");
      doc.setFillColor(...mColor);
      doc.rect(barX2, y - 2, Math.min((m.score / 100) * barW2, barW2), 2, "F");

      y += 5;
    });
    y += 2;
  }

  // ── All Metrics (fully expanded) ─────────────────────────────────────
  addSectionDivider();
  sectionHeader(`ALL METRICS (${result.metrics.length})`);

  const sortedMetrics = [...result.metrics].sort((a, b) => b.score - a.score);

  sortedMetrics.forEach((m) => {
    const mColor = scoreColor(m.score);
    const descLines: string[] = doc.splitTextToSize(m.description, contentWidth - 20);
    const blockH = 12 + descLines.length * 2.5;
    checkNewPage(blockH);

    doc.setFillColor(...colors.bg);
    doc.roundedRect(margin, y - 1, contentWidth, blockH, 1.5, 1.5, "F");

    // Score circle
    doc.setFillColor(...colors.white);
    doc.setDrawColor(...mColor);
    doc.setLineWidth(0.6);
    doc.circle(margin + 7, y + 5, 5, "FD");
    doc.setFontSize(7);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...mColor);
    doc.text(`${m.score.toFixed(1)}`, margin + 7, y + 6, { align: "center" });

    // Name + proxy
    doc.setTextColor(...colors.heading);
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.text(m.name, margin + 15, y + 3);

    doc.setTextColor(...colors.muted);
    doc.setFontSize(6);
    doc.setFont("helvetica", "normal");
    doc.text(m.gtm_proxy, margin + 15, y + 7);

    // Description
    doc.setTextColor(...colors.body);
    doc.setFontSize(6);
    doc.text(descLines, margin + 15, y + 11);

    // Brain region + raw value
    doc.setTextColor(...colors.muted);
    doc.setFontSize(5.5);
    const brainY = y + 11 + descLines.length * 2.5;
    doc.text(m.brain_region, margin + 15, brainY);
    doc.text(`raw: ${m.raw_value.toFixed(4)}`, pageWidth - margin - 2, y + 3, { align: "right" });

    y += blockH + 2;
  });

  // ── Category Strategies ──────────────────────────────────────────────
  if (result.ai_category_strategies && Object.keys(result.ai_category_strategies).length > 0) {
    addSectionDivider();
    sectionHeader("DIMENSION ANALYSIS");

    Object.entries(result.ai_category_strategies).forEach(([dim, info]) => {
      const assessment = info.score_context || "";
      if (!assessment) return;

      const dimLines: string[] = doc.splitTextToSize(assessment, contentWidth - 10);
      const blockH = dimLines.length * 3.2 + 10;
      checkNewPage(blockH);

      doc.setTextColor(...colors.brand);
      doc.setFontSize(8);
      doc.setFont("helvetica", "bold");
      doc.text(dim.replace(/_/g, " "), margin, y);
      y += 4;

      doc.setTextColor(...colors.body);
      doc.setFontSize(7);
      doc.setFont("helvetica", "normal");
      doc.text(dimLines, margin + 2, y);
      y += dimLines.length * 3.2 + 4;
    });
  }

  // ── Metadata ─────────────────────────────────────────────────────────
  addSectionDivider();
  checkNewPage(20);
  doc.setTextColor(...colors.muted);
  doc.setFontSize(6);
  doc.setFont("helvetica", "normal");
  doc.text(`Source: ${result.url}`, margin, y); y += 3;
  doc.text(`Job ID: ${result.job_id}`, margin, y); y += 3;
  doc.text(`Content Type: ${result.content_type.replace("_", " ")} | Duration: ${result.duration_seconds.toFixed(1)}s`, margin, y); y += 3;
  doc.text(`Model: ORCLE (20,484 cortical vertices, fsaverage5) | Powered by NeuroPeer`, margin, y);

  // ── Footer on every page ─────────────────────────────────────────────
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setDrawColor(...colors.light);
    doc.setLineWidth(0.2);
    doc.line(margin, pageHeight - 12, pageWidth - margin, pageHeight - 12);

    doc.setFontSize(6);
    doc.setTextColor(...colors.muted);
    doc.text("NeuroPeer", margin, pageHeight - 8);
    doc.text(`Page ${i} of ${pageCount}`, pageWidth / 2, pageHeight - 8, { align: "center" });
    doc.text("Powered by ORCLE", pageWidth - margin, pageHeight - 8, { align: "right" });
  }

  // ── Save ─────────────────────────────────────────────────────────────
  const titleSlug = (result.ai_report_title || "report").replace(/[^a-zA-Z0-9]+/g, "-").toLowerCase();
  const filename = `${titleSlug}-neuropeer-${new Date().toISOString().slice(0, 10)}.pdf`;
  doc.save(filename);
}
