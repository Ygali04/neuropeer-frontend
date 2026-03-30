"use client";

import { forwardRef } from "react";
import { cn } from "@/lib/utils";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost" | "outline" | "danger";
  size?: "sm" | "md" | "lg";
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", size = "md", children, ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(
          "relative inline-flex items-center justify-center gap-2 font-medium transition-all duration-200 rounded-xl",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50",
          "disabled:opacity-40 disabled:cursor-not-allowed disabled:pointer-events-none",
          // Variants
          variant === "primary" &&
            "bg-gradient-to-r from-brand-500 to-brand-600 text-white shadow-lg shadow-brand-500/20 hover:shadow-brand-500/30 hover:from-brand-400 hover:to-brand-500 active:scale-[0.98]",
          variant === "secondary" &&
            "bg-white/[0.06] border border-white/[0.08] text-white/90 hover:bg-white/[0.1] hover:border-white/[0.15] active:scale-[0.98]",
          variant === "ghost" &&
            "text-white/60 hover:text-white/90 hover:bg-white/[0.06]",
          variant === "outline" &&
            "border border-white/[0.1] text-white/80 hover:bg-white/[0.04] hover:border-brand-500/30",
          variant === "danger" &&
            "bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20",
          // Sizes
          size === "sm" && "h-8 px-3 text-xs",
          size === "md" && "h-10 px-5 text-sm",
          size === "lg" && "h-12 px-7 text-base",
          className
        )}
        {...props}
      >
        {children}
      </button>
    );
  }
);

Button.displayName = "Button";
export { Button };
