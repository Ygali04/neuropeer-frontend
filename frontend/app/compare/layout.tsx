import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "A/B Neural Comparison — NeuroPeer",
  description: "Compare neural engagement scores across multiple video analyses side by side.",
  openGraph: {
    title: "A/B Neural Comparison — NeuroPeer",
    description: "Side-by-side neural engagement analysis powered by Meta TRIBE v2.",
    type: "website",
    siteName: "NeuroPeer",
  },
  twitter: {
    card: "summary_large_image",
    title: "A/B Neural Comparison — NeuroPeer",
    description: "Compare neural scores across video analyses.",
  },
};

export default function CompareLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
