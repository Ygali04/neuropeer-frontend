"use client";

import { forwardRef } from "react";
import { cn } from "@/lib/utils";

const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        "w-full px-4 py-3 rounded-xl",
        "bg-white/[0.04] border border-white/[0.08]",
        "text-white placeholder-white/25",
        "focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500/40",
        "transition-all duration-200",
        "text-base",
        className
      )}
      {...props}
    />
  )
);
Input.displayName = "Input";
export { Input };
