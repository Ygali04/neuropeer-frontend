"use client";

import { useState, useRef, useEffect } from "react";
import { HelpCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface InfoTooltipProps {
  title: string;
  description: string;
  study?: string;
  studyDetail?: string;
  className?: string;
  iconSize?: number;
}

export function InfoTooltip({
  title,
  description,
  study,
  studyDetail,
  className,
  iconSize = 14,
}: InfoTooltipProps) {
  const [visible, setVisible] = useState(false);
  const [position, setPosition] = useState<"top" | "bottom">("top");
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (visible && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setPosition(rect.top < 250 ? "bottom" : "top");
    }
  }, [visible]);

  return (
    <span className={cn("relative inline-flex", className)}>
      <button
        ref={triggerRef}
        type="button"
        onMouseEnter={() => setVisible(true)}
        onMouseLeave={() => setVisible(false)}
        onFocus={() => setVisible(true)}
        onBlur={() => setVisible(false)}
        className="text-white/15 hover:text-white/40 transition-colors focus:outline-none"
        aria-label={`Info about ${title}`}
      >
        <HelpCircle style={{ width: iconSize, height: iconSize }} />
      </button>

      <div
        className={cn(
          "absolute w-72",
          "transition-all duration-200 ease-out",
          visible ? "opacity-100 translate-y-0 pointer-events-auto" : "opacity-0 pointer-events-none",
          position === "top"
            ? "bottom-full mb-2 translate-y-1"
            : "top-full mt-2 -translate-y-1",
          "left-1/2 -translate-x-1/2"
        )}
        style={{ visibility: visible ? "visible" : "hidden", zIndex: 9999 }}
      >
        <div
          className="rounded-xl p-4 shadow-2xl border border-white/[0.1]"
          style={{
            background: "#15131a",
            boxShadow: "0 20px 60px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.06)",
          }}
        >
          <h4 className="text-xs font-semibold text-white/90 mb-1.5">{title}</h4>
          <p className="text-[11px] text-white/55 leading-relaxed">
            {description}
          </p>
          {study && (
            <div className="mt-3 pt-2.5 border-t border-white/[0.08]">
              <p className="text-[10px] text-white/35 leading-relaxed">
                <span className="text-brand-400/80 font-medium">Study: </span>
                {study}
              </p>
              {studyDetail && (
                <p className="text-[10px] text-white/25 italic mt-0.5 leading-relaxed">
                  {studyDetail}
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </span>
  );
}
