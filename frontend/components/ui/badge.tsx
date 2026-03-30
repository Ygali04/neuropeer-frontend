"use client";

import { cn } from "@/lib/utils";

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: "default" | "brand" | "teal" | "success" | "warning" | "danger";
}

export function Badge({ className, variant = "default", children, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-colors",
        variant === "default" && "bg-white/[0.06] border border-white/[0.08] text-white/60",
        variant === "brand" && "bg-brand-500/10 border border-brand-500/20 text-brand-400",
        variant === "teal" && "bg-teal-500/10 border border-teal-500/20 text-teal-400",
        variant === "success" && "bg-emerald-500/10 border border-emerald-500/20 text-emerald-400",
        variant === "warning" && "bg-amber-500/10 border border-amber-500/20 text-amber-400",
        variant === "danger" && "bg-red-500/10 border border-red-500/20 text-red-400",
        className
      )}
      {...props}
    >
      {children}
    </span>
  );
}
