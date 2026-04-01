import type { Metadata } from "next";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "https://neuropeer-api-production.up.railway.app";

async function fetchResult(jobId: string): Promise<{ ai_report_title?: string; neural_score?: { total: number }; url?: string; content_type?: string; overarching_summary?: string } | null> {
  try {
    const res = await fetch(`${API_BASE}/api/v1/results/${jobId}`, { next: { revalidate: 300 } });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: { params: Promise<{ jobId: string }> }): Promise<Metadata> {
  const { jobId } = await params;
  const result = await fetchResult(jobId);

  if (!result) {
    return {
      title: "Analysis Report — NeuroPeer",
      description: "Neural GTM content analysis report.",
    };
  }

  const rawScore = result.neural_score?.total ?? 0;
  const scoreStr = rawScore.toFixed(1);
  const label = rawScore >= 80 ? "Exceptional" : rawScore >= 65 ? "Strong" : rawScore >= 50 ? "Moderate" : "Needs Work";
  const title = result.ai_report_title || `${label} (${scoreStr}/100)`;
  const type = (result.content_type ?? "video").replace("_", " ");
  const desc = result.overarching_summary?.slice(0, 160) ?? `Neural score: ${scoreStr}/100 for ${type}.`;

  return {
    title: `${title} — NeuroPeer`,
    description: desc,
    openGraph: {
      title: `${title} · ${scoreStr}/100`,
      description: desc,
      type: "article",
      siteName: "NeuroPeer",
    },
    twitter: {
      card: "summary_large_image",
      title: `${title} · ${scoreStr}/100`,
      description: desc,
    },
  };
}

export default function AnalyzeLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
