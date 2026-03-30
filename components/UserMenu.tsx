"use client";

import { useState, useRef, useEffect } from "react";
import { LogOut, User, ChevronDown } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { cn } from "@/lib/utils";

export function UserMenu() {
  const { session, status, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  if (status === "loading") {
    return <div className="w-8 h-8 rounded-full bg-white/[0.06] animate-pulse" />;
  }

  if (status === "unauthenticated" || !session?.user) {
    return (
      <Link
        href="/login"
        className="px-3 py-1.5 rounded-lg text-xs font-medium text-brand-400 border border-brand-500/20 hover:bg-brand-500/10 transition-colors"
      >
        Sign in
      </Link>
    );
  }

  const user = session.user;
  const initials = (user.name || user.email || "U")
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div ref={menuRef} className="relative">
      <button
        onClick={() => setOpen((p) => !p)}
        className="flex items-center gap-2 rounded-full p-0.5 pr-2 hover:bg-white/[0.06] transition-colors"
      >
        {user.image ? (
          <Image
            src={user.image}
            alt={user.name || "User"}
            width={28}
            height={28}
            className="rounded-full"
          />
        ) : (
          <div className="w-7 h-7 rounded-full bg-brand-500/20 flex items-center justify-center text-[10px] font-bold text-brand-400">
            {initials}
          </div>
        )}
        <ChevronDown className={cn("w-3 h-3 text-white/30 transition-transform", open && "rotate-180")} />
      </button>

      {/* Dropdown */}
      {open && (
        <div
          className="absolute right-0 top-full mt-2 w-56 rounded-xl border border-white/[0.08] shadow-2xl shadow-black/50 z-50"
          style={{ background: "#15131a" }}
        >
          <div className="px-4 py-3 border-b border-white/[0.06]">
            <p className="text-sm font-medium text-white/80 truncate">{user.name}</p>
            <p className="text-xs text-white/30 truncate">{user.email}</p>
          </div>

          <div className="p-1.5">
            <button
              onClick={() => {
                setOpen(false);
                signOut({ callbackUrl: "/" });
              }}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-white/50 hover:text-red-400 hover:bg-red-500/[0.06] transition-colors"
            >
              <LogOut className="w-3.5 h-3.5" />
              Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
