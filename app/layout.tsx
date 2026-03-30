import type { Metadata } from "next";
import { Sora, DM_Sans } from "next/font/google";
import { DemoBanner } from "@/components/DemoBanner";
import "./globals.css";

const sora = Sora({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

const dmSans = DM_Sans({
  variable: "--font-body",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "NeuroPeer by Trupeer — Neural GTM Content Analyzer",
  description:
    "Predict fMRI-level brain responses to your GTM content using Meta TRIBE v2. No participants required.",
  metadataBase: new URL("https://neuropeer.vercel.app"),
  openGraph: {
    title: "NeuroPeer — Predict How Brains Respond to Your Content",
    description:
      "fMRI-grade neural attention, emotional resonance, and memory encoding scores — in minutes, not months.",
    type: "website",
    siteName: "NeuroPeer by Trupeer",
  },
  twitter: {
    card: "summary_large_image",
    title: "NeuroPeer — Neural GTM Content Analyzer",
    description:
      "Predict fMRI-level brain responses to your content using Meta TRIBE v2.",
  },
  icons: {
    icon: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${sora.variable} ${dmSans.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col noise-overlay">
        <DemoBanner />
        <div className="bg-mesh" />
        {children}
      </body>
    </html>
  );
}
