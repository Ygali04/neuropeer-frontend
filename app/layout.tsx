import type { Metadata } from "next";
import Script from "next/script";
import { Sora, DM_Sans } from "next/font/google";
import { AuthProvider } from "@/lib/auth-context";
import { ThemeProvider } from "@/lib/theme-context";
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
  title: "NeuroPeer — Neural GTM Content Analyzer",
  description:
    "Predict fMRI-level brain responses to your GTM content using Meta TRIBE v2. No participants required.",
  metadataBase: new URL("https://neuropeer-frontend.vercel.app"),
  openGraph: {
    title: "NeuroPeer — Predict How Brains Respond to Your Content",
    description:
      "fMRI-grade neural attention, emotional resonance, and memory encoding scores — in minutes, not months.",
    type: "website",
    siteName: "NeuroPeer",
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
      suppressHydrationWarning
      className={`${sora.variable} ${dmSans.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col noise-overlay">
        <div className="bg-mesh" />
        <ThemeProvider>
          <AuthProvider>{children}</AuthProvider>
        </ThemeProvider>
        {process.env.NEXT_PUBLIC_IFRAMELY_API_KEY && (
          <Script
            src={`https://cdn.iframe.ly/embed.js?key=${process.env.NEXT_PUBLIC_IFRAMELY_API_KEY}`}
            strategy="lazyOnload"
          />
        )}
      </body>
    </html>
  );
}
