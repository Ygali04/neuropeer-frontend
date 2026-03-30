"use client";

import { useRef, useEffect, useState } from "react";
import { Play, Pause, Volume2, VolumeX } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  url: string;
  currentTime: number;
  isPlaying: boolean;
  duration: number;
  playbackSpeed?: number;
  onSeek?: (time: number) => void;
  onPlay?: () => void;
  onPause?: () => void;
  onCycleSpeed?: () => void;
}

type MediaType = "youtube" | "youtube-short" | "instagram" | "direct-video" | "unknown";

function detectMediaType(url: string): MediaType {
  if (/instagram\.com\/reel\//i.test(url)) return "instagram";
  if (/youtube\.com\/shorts\//i.test(url)) return "youtube-short";
  if (/youtube\.com\/watch|youtu\.be\//i.test(url)) return "youtube";
  if (/\.(mp4|webm|ogg|mov)(\?|$)/i.test(url)) return "direct-video";
  return "unknown";
}

function extractYouTubeId(url: string): string | null {
  const match = url.match(/(?:youtube\.com\/(?:watch\?v=|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
  return match?.[1] ?? null;
}

function extractInstagramId(url: string): string | null {
  const match = url.match(/instagram\.com\/reel\/([a-zA-Z0-9_-]+)/);
  return match?.[1] ?? null;
}

// Aspect ratio CSS for different media types
function getAspectClass(type: MediaType): string {
  switch (type) {
    case "instagram":
    case "youtube-short":
      return "aspect-[9/16] max-h-[400px]";
    case "youtube":
      return "aspect-video";
    case "direct-video":
      return "aspect-video";
    default:
      return "aspect-video";
  }
}

export function VideoPlayer({
  url,
  currentTime,
  isPlaying,
  duration,
  playbackSpeed = 1,
  onSeek,
  onPlay,
  onPause,
  onCycleSpeed,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [muted, setMuted] = useState(true);
  const [canPlay, setCanPlay] = useState(false);

  const mediaType = detectMediaType(url);
  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  const handleTogglePlay = () => {
    if (isPlaying) onPause?.();
    else onPlay?.();
  };

  const formatTime = (t: number) => {
    const m = Math.floor(t / 60);
    const s = Math.floor(t % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  // Sync direct video element
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !canPlay) return;
    const diff = Math.abs(video.currentTime - currentTime);
    if (diff > 0.8) video.currentTime = currentTime;
  }, [currentTime, canPlay]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !canPlay) return;
    if (isPlaying && video.paused) video.play().catch(() => {});
    else if (!isPlaying && !video.paused) video.pause();
  }, [isPlaying, canPlay]);

  useEffect(() => {
    const video = videoRef.current;
    if (video) video.playbackRate = playbackSpeed;
  }, [playbackSpeed]);

  // ── YouTube Embed ──────────────────────────────────────────────────────
  if (mediaType === "youtube" || mediaType === "youtube-short") {
    const videoId = extractYouTubeId(url);
    const isVertical = mediaType === "youtube-short";

    return (
      <div className="rounded-xl overflow-hidden border border-white/[0.06] bg-black">
        <div className={cn("relative w-full mx-auto", isVertical ? "max-w-[225px] aspect-[9/16]" : "aspect-video")}>
          {videoId ? (
            <iframe
              src={`https://www.youtube.com/embed/${videoId}?autoplay=0&mute=1&controls=1&modestbranding=1&rel=0&start=${Math.floor(currentTime)}`}
              className="absolute inset-0 w-full h-full"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              title="Video preview"
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center text-white/20 text-xs">
              Unable to embed video
            </div>
          )}
        </div>
        <Controls
          currentTime={currentTime}
          duration={duration}
          progress={progress}
          muted={muted}
          isPlaying={isPlaying}
          playbackSpeed={playbackSpeed}
          onToggleMute={() => setMuted(!muted)}
          onTogglePlay={handleTogglePlay}
          onSeek={onSeek}
          onCycleSpeed={onCycleSpeed}
          formatTime={formatTime}
        />
      </div>
    );
  }

  // ── Instagram Reel Embed ───────────────────────────────────────────────
  if (mediaType === "instagram") {
    const reelId = extractInstagramId(url);

    return (
      <div className="rounded-xl overflow-hidden border border-white/[0.06] bg-black">
        <div className="relative w-full max-w-[225px] mx-auto aspect-[9/16]">
          {reelId ? (
            <iframe
              src={`https://www.instagram.com/reel/${reelId}/embed`}
              className="absolute inset-0 w-full h-full"
              allowFullScreen
              title="Instagram Reel preview"
              style={{ border: "none" }}
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center text-white/20 text-xs">
              Unable to embed reel
            </div>
          )}
        </div>
        <Controls
          currentTime={currentTime}
          duration={duration}
          progress={progress}
          muted={muted}
          isPlaying={isPlaying}
          playbackSpeed={playbackSpeed}
          onToggleMute={() => setMuted(!muted)}
          onTogglePlay={handleTogglePlay}
          onSeek={onSeek}
          onCycleSpeed={onCycleSpeed}
          formatTime={formatTime}
        />
      </div>
    );
  }

  // ── Direct Video ───────────────────────────────────────────────────────
  if (mediaType === "direct-video") {
    return (
      <div className="rounded-xl overflow-hidden bg-black/40 border border-white/[0.06]">
        <div className="relative aspect-video cursor-pointer" onClick={handleTogglePlay}>
          <video
            ref={videoRef}
            src={url}
            muted={muted}
            playsInline
            preload="metadata"
            onCanPlay={() => setCanPlay(true)}
            className="w-full h-full object-contain"
          />
        </div>
        <Controls
          currentTime={currentTime}
          duration={duration}
          progress={progress}
          muted={muted}
          isPlaying={isPlaying}
          playbackSpeed={playbackSpeed}
          onToggleMute={() => setMuted(!muted)}
          onTogglePlay={handleTogglePlay}
          onSeek={onSeek}
          onCycleSpeed={onCycleSpeed}
          formatTime={formatTime}
        />
      </div>
    );
  }

  // ── Unknown / Fallback: waveform visualization ─────────────────────────
  return (
    <div className="rounded-xl overflow-hidden border border-white/[0.06]" style={{ background: "rgba(7, 6, 11, 0.8)" }}>
      <div
        className="relative aspect-video flex items-center justify-center cursor-pointer"
        onClick={handleTogglePlay}
      >
        <div className="absolute inset-0 bg-gradient-to-br from-brand-500/[0.04] to-teal-500/[0.02]" />

        <div className="relative flex items-end gap-[2px] h-16 opacity-40">
          {Array.from({ length: 40 }).map((_, i) => {
            const h = 20 + Math.sin(i * 0.7) * 15 + Math.cos(i * 1.3) * 10;
            return <div key={i} className="w-1 rounded-full bg-white/[0.08]" style={{ height: `${h}%` }} />;
          })}
          <div
            className="absolute inset-0 flex items-end gap-[2px] overflow-hidden"
            style={{ width: `${progress}%`, transition: isPlaying ? "none" : "width 200ms ease-out" }}
          >
            {Array.from({ length: 40 }).map((_, i) => {
              const h = 20 + Math.sin(i * 0.7) * 15 + Math.cos(i * 1.3) * 10;
              return <div key={i} className="w-1 rounded-full bg-brand-500 flex-shrink-0" style={{ height: `${h}%` }} />;
            })}
          </div>
        </div>

        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className={cn(
            "w-12 h-12 rounded-full flex items-center justify-center transition-all duration-300",
            isPlaying ? "bg-brand-500/20 scale-90" : "bg-white/[0.06] scale-100"
          )}>
            {isPlaying ? <Pause className="w-5 h-5 text-brand-400" /> : <Play className="w-5 h-5 text-white/40 ml-0.5" />}
          </div>
        </div>

        <div className="absolute bottom-3 left-3 right-3">
          <p className="text-[10px] text-white/20 truncate font-mono">{url}</p>
        </div>
      </div>

      <Controls
        currentTime={currentTime}
        duration={duration}
        progress={progress}
        muted={muted}
        isPlaying={isPlaying}
        playbackSpeed={playbackSpeed}
        onToggleMute={() => setMuted(!muted)}
        onTogglePlay={handleTogglePlay}
        onSeek={onSeek}
        onCycleSpeed={onCycleSpeed}
        formatTime={formatTime}
      />
    </div>
  );
}

function Controls({
  currentTime,
  duration,
  progress,
  muted,
  isPlaying,
  playbackSpeed,
  onToggleMute,
  onTogglePlay,
  onSeek,
  onCycleSpeed,
  formatTime,
}: {
  currentTime: number;
  duration: number;
  progress: number;
  muted: boolean;
  isPlaying: boolean;
  playbackSpeed: number;
  onToggleMute: () => void;
  onTogglePlay: () => void;
  onSeek?: (time: number) => void;
  onCycleSpeed?: () => void;
  formatTime: (t: number) => string;
}) {
  return (
    <div className="px-3 py-2 flex items-center gap-2">
      <button onClick={onTogglePlay} className="p-1 rounded hover:bg-white/[0.06] text-white/40 hover:text-white/60 transition-colors">
        {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
      </button>
      <div
        className="flex-1 h-1 bg-white/[0.06] rounded-full overflow-hidden cursor-pointer group"
        onClick={(e) => {
          if (!onSeek) return;
          const rect = e.currentTarget.getBoundingClientRect();
          onSeek(((e.clientX - rect.left) / rect.width) * duration);
        }}
      >
        <div className="h-full rounded-full bg-brand-500" style={{ width: `${progress}%`, transition: isPlaying ? "none" : "width 200ms ease-out" }} />
      </div>
      <span className="text-[10px] text-white/30 tabular-nums whitespace-nowrap">
        {formatTime(currentTime)} / {formatTime(duration)}
      </span>
      <button onClick={onCycleSpeed} className="px-1.5 py-0.5 rounded bg-white/[0.04] hover:bg-white/[0.08] text-white/50 hover:text-white/70 transition-colors text-[10px] font-semibold tabular-nums min-w-[26px]" title="Playback speed">
        {playbackSpeed}x
      </button>
      <button onClick={onToggleMute} className="p-1 rounded hover:bg-white/[0.06] text-white/20 hover:text-white/40 transition-colors">
        {muted ? <VolumeX className="w-3 h-3" /> : <Volume2 className="w-3 h-3" />}
      </button>
    </div>
  );
}
