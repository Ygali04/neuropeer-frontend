import type { Metadata } from "next";

export async function generateMetadata({ params }: { params: Promise<{ jobId: string }> }): Promise<Metadata> {
  const { jobId } = await params;

  return {
    title: "Analysis Report — NeuroPeer",
    description: `Neural GTM content analysis report for job ${jobId}.`,
    openGraph: {
      title: "NeuroPeer Analysis Report",
      description: "Real fMRI-predicted neural analysis of video content.",
      type: "article",
      siteName: "NeuroPeer",
    },
  };
}

export default function AnalyzeLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
