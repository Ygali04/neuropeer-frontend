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

  const score = Math.round(result.neural_score?.total ?? 0);
  const label = score >= 80 ? "Exceptional" : score >= 65 ? "Strong" : score >= 50 ? "Moderate" : "Needs Work";
  const title = result.ai_report_title || `${label} (${score}/100)`;
  const type = (result.content_type ?? "video").replace("_", " ");
  const desc = result.overarching_summary?.slice(0, 160) ?? `Neural score: ${score}/100 for ${type}.`;

  return {
    title: `${title} — NeuroPeer`,
    description: desc,
    openGraph: {
      title: `${title} · ${score}/100`,
      description: desc,
      type: "article",
      siteName: "NeuroPeer",
    },
    twitter: {
      card: "summary_large_image",
      title: `${title} · ${score}/100`,
      description: desc,
    },
  };
}

export default function AnalyzeLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
