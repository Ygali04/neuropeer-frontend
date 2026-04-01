"use client";

import { useState, useRef, useEffect } from "react";
import { Pencil, Check, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  title?: string;
  url: string;
  contentType: string;
  isOwner: boolean;
  jobId: string;
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "https://neuropeer-api-production.up.railway.app";

export function ReportTitle({ title, url, contentType, isOwner, jobId }: Props) {
  const fallback = formatUrl(url, contentType);
  const resolvedTitle = title || fallback;
  const [displayTitle, setDisplayTitle] = useState(resolvedTitle);
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(resolvedTitle);
  const [saving, setSaving] = useState(false);
  const [userEdited, setUserEdited] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Sync when the title prop changes (e.g., result loads with saved title from API)
  // Only override if user hasn't manually edited in this session
  useEffect(() => {
    if (!userEdited && title) {
      setDisplayTitle(title);
      setEditValue(title);
    }
  }, [title, userEdited]);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  // Update browser tab title
  useEffect(() => {
    document.title = `${displayTitle} — NeuroPeer`;
  }, [displayTitle]);

  const handleSave = async () => {
    if (!editValue.trim() || editValue === displayTitle) {
      setEditing(false);
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`${API_BASE}/api/v1/results/${jobId}/title`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: editValue.trim() }),
      });
      if (res.ok) {
        setDisplayTitle(editValue.trim());
        setUserEdited(true);
      } else {
        console.error("Failed to save title:", res.status);
        setEditValue(displayTitle);
      }
    } catch (err) {
      console.error("Title save error:", err);
      setEditValue(displayTitle);
    } finally {
      setSaving(false);
      setEditing(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleSave();
    if (e.key === "Escape") { setEditValue(displayTitle); setEditing(false); }
  };

  return (
    <div className="flex items-center gap-2 animate-fade-up">
      {editing ? (
        <div className="flex items-center gap-2 flex-1">
          <input
            ref={inputRef}
            type="text"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={handleSave}
            disabled={saving}
            className="flex-1 px-2 py-1 rounded-lg bg-white/[0.04] border border-brand-500/30 text-xl sm:text-2xl font-bold font-[family-name:var(--font-display)] text-white/90 focus:outline-none focus:border-brand-500/60"
            maxLength={80}
          />
          <button onClick={handleSave} className="p-1.5 rounded-lg bg-brand-500/10 text-brand-400 hover:bg-brand-500/20 transition-colors">
            <Check className="w-4 h-4" />
          </button>
          <button onClick={() => { setEditValue(displayTitle); setEditing(false); }} className="p-1.5 rounded-lg text-white/20 hover:text-white/50 hover:bg-white/[0.04] transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-2 group">
          <h1 className="font-[family-name:var(--font-display)] text-xl sm:text-2xl font-bold text-white/85 leading-tight">
            {displayTitle}
          </h1>
          {isOwner && (
            <button
              onClick={() => { setEditValue(displayTitle); setEditing(true); }}
              className="p-1 rounded-lg text-white/10 group-hover:text-white/30 hover:!text-brand-400 hover:bg-brand-500/10 transition-all"
              title="Edit title"
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function formatUrl(url: string, contentType: string): string {
  const type = contentType.replace("_", " ");
  const domain = url.replace(/https?:\/\/(www\.)?/, "").split("/")[0];
  return `${type.charAt(0).toUpperCase() + type.slice(1)} — ${domain}`;
}
