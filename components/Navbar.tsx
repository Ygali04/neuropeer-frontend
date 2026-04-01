"use client";

import Link from "next/link";
import { Brain } from "lucide-react";
import { UserMenu } from "@/components/UserMenu";
import { ThemeToggle } from "@/components/ThemeToggle";

interface Props {
  /** Optional breadcrumb shown after "NeuroPeer / " */
  breadcrumb?: { label: string; href?: string; icon?: React.ReactNode };
  /** Extra items to show between nav links and theme toggle (e.g., Share, Export buttons) */
  actions?: React.ReactNode;
}

export function Navbar({ breadcrumb, actions }: Props) {
  return (
    <header className="nav-backdrop border-b border-white/[0.06] px-4 sm:px-6 py-3 sm:py-4 sticky top-0 z-10 backdrop-blur-xl bg-[#07060b]/80">
      <div className="max-w-6xl mx-auto flex items-center justify-between">
        {/* Left: Logo + breadcrumb */}
        <div className="flex items-center gap-2 sm:gap-4">
          <Link href="/" className="flex items-center gap-2 sm:gap-3 group">
            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center shadow-lg shadow-brand-500/20">
              <Brain className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-white" />
            </div>
            <span className="font-[family-name:var(--font-display)] text-white font-semibold tracking-tight text-sm sm:text-base">
              NeuroPeer
            </span>
          </Link>
          {breadcrumb && (
            <>
              <span className="text-white/10">/</span>
              {breadcrumb.href ? (
                <Link href={breadcrumb.href} className="flex items-center gap-1.5 hover:opacity-80 transition-opacity">
                  {breadcrumb.icon}
                  <span className="text-white/50 text-xs sm:text-sm font-medium">{breadcrumb.label}</span>
                </Link>
              ) : (
                <div className="flex items-center gap-1.5">
                  {breadcrumb.icon}
                  <span className="text-white/50 text-xs sm:text-sm font-medium">{breadcrumb.label}</span>
                </div>
              )}
            </>
          )}
        </div>

        {/* Right: Actions + Nav links + Theme + User */}
        <div className="flex items-center gap-1 sm:gap-2">
          {actions}
          <Link href="/" className="hidden sm:block px-2 py-1 text-sm text-white/40 hover:text-white/70 transition-colors">
            New Analysis
          </Link>
          <Link href="/compare" className="hidden sm:block px-2 py-1 text-sm text-white/40 hover:text-white/70 transition-colors">
            A/B Compare
          </Link>
          <Link href="/methodology" className="hidden sm:block px-2 py-1 text-sm text-white/40 hover:text-white/70 transition-colors">
            Methodology
          </Link>
          <ThemeToggle />
          <UserMenu />
        </div>
      </div>
    </header>
  );
}
