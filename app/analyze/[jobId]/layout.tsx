import type { Metadata } from "next";
import { getDemoResult } from "@/lib/demo-results";

export async function generateMetadata({ params }: { params: Promise<{ jobId: string }> }): Promise<Metadata> {
  const { jobId } = await params;
  const demo = getDemoResult(jobId);

  if (!demo) {
    return {
      title: "Analysis Report — NeuroPeer",
      description: "Neural GTM content analysis report.",
    };
  }

  const score = Math.round(demo.neural_score.total);
  const label = score >= 80 ? "Exceptional" : score >= 65 ? "Strong" : score >= 50 ? "Moderate" : "Needs Work";
  const type = demo.content_type.replace("_", " ");

  return {
    title: `${score}/100 ${label} — ${type} — NeuroPeer`,
    description: demo.overarching_summary?.slice(0, 160) ?? `Neural analysis score: ${score}/100 for ${type}.`,
    openGraph: {
      title: `Neural Score: ${score}/100 — ${label}`,
      description: demo.overarching_summary?.slice(0, 200) ?? `Neural GTM analysis of ${type}.`,
      type: "article",
      siteName: "NeuroPeer",
    },
    twitter: {
      card: "summary_large_image",
      title: `Neural Score: ${score}/100 — ${label}`,
      description: demo.overarching_summary?.slice(0, 160) ?? `Neural GTM analysis.`,
    },
  };
}

export default function AnalyzeLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
