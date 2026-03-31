"use client";

import { useRef, useEffect, useState, useCallback } from "react";
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
  if (/instagram\.com\/(reel|p)\//i.test(url)) return "instagram";
  if (/youtube\.com\/shorts\//i.test(url)) return "youtube-short";
  if (/youtube\.com\/watch|youtu\.be\//i.test(url)) return "youtube";
  if (/\.(mp4|webm|ogg|mov)(\?|$)/i.test(url)) return "direct-video";
  return "unknown";
}

function extractYouTubeId(url: string): string | null {
  const match = url.match(/(?:youtube\.com\/(?:watch\?v=|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
  return match?.[1] ?? null;
}

function extractInstagramEmbedUrl(url: string): string | null {
  const match = url.match(/instagram\.com\/(reel|p)\/([a-zA-Z0-9_-]+)/);
  if (!match) return null;
  return `https://www.instagram.com/${match[1]}/${match[2]}/embed`;
}

// ── YouTube IFrame API loader ──────────────────────────────────────────────
let ytApiReady = false;
let ytApiLoading = false;
const ytApiCallbacks: (() => void)[] = [];

function loadYouTubeApi(): Promise<void> {
  if (ytApiReady) return Promise.resolve();
  return new Promise((resolve) => {
    ytApiCallbacks.push(resolve);
    if (ytApiLoading) return;
    ytApiLoading = true;
    const tag = document.createElement("script");
    tag.src = "https://www.youtube.com/iframe_api";
    document.head.appendChild(tag);
    (window as unknown as Record<string, unknown>).onYouTubeIframeAPIReady = () => {
      ytApiReady = true;
      ytApiCallbacks.forEach((cb) => cb());
      ytApiCallbacks.length = 0;
    };
  });
}

// ── YouTube Player Component ────────────────────────────────────────────────
function YouTubePlayer({
  videoId,
  isVertical,
  currentTime,
  isPlaying,
  duration,
  playbackSpeed,
  onSeek,
  onPlay,
  onPause,
  onCycleSpeed,
}: {
  videoId: string;
  isVertical: boolean;
  currentTime: number;
  isPlaying: boolean;
  duration: number;
  playbackSpeed: number;
  onSeek?: (time: number) => void;
  onPlay?: () => void;
  onPause?: () => void;
  onCycleSpeed?: () => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YT.Player | null>(null);
  const [muted, setMuted] = useState(true);
  const [ready, setReady] = useState(false);
  const suppressEventRef = useRef(false);
  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  const formatTime = (t: number) => {
    const m = Math.floor(t / 60);
    const s = Math.floor(t % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  // Initialize YouTube player
  useEffect(() => {
    let player: YT.Player | null = null;
    let cancelled = false;

    loadYouTubeApi().then(() => {
      if (cancelled || !containerRef.current) return;
      // Create a div for the player inside the container
      const el = document.createElement("div");
      el.id = `yt-player-${videoId}-${Date.now()}`;
      containerRef.current.appendChild(el);

      player = new YT.Player(el.id, {
        videoId,
        playerVars: {
          autoplay: 0,
          mute: 1,
          controls: 0,
          modestbranding: 1,
          rel: 0,
          playsinline: 1,
          fs: 0,
        },
        events: {
          onReady: () => {
            if (cancelled) return;
            playerRef.current = player;
            setReady(true);
          },
          onStateChange: (event: YT.OnStateChangeEvent) => {
            if (cancelled || suppressEventRef.current) return;
            if (event.data === YT.PlayerState.PLAYING) {
              onPlay?.();
            } else if (event.data === YT.PlayerState.PAUSED) {
              onPause?.();
            }
          },
        },
      });
    });

    return () => {
      cancelled = true;
      if (player) {
        try { player.destroy(); } catch {}
      }
      playerRef.current = null;
    };
  }, [videoId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Sync play/pause state from NeuroPeer → YouTube
  useEffect(() => {
    const p = playerRef.current;
    if (!p || !ready) return;
    suppressEventRef.current = true;
    try {
      if (isPlaying) {
        const state = p.getPlayerState();
        if (state !== YT.PlayerState.PLAYING) p.playVideo();
      } else {
        const state = p.getPlayerState();
        if (state === YT.PlayerState.PLAYING) p.pauseVideo();
      }
    } catch {}
    setTimeout(() => { suppressEventRef.current = false; }, 200);
  }, [isPlaying, ready]);

  // Sync seek from NeuroPeer → YouTube
  useEffect(() => {
    const p = playerRef.current;
    if (!p || !ready) return;
    try {
      const ytTime = p.getCurrentTime?.() ?? 0;
      if (Math.abs(ytTime - currentTime) > 1.5) {
        suppressEventRef.current = true;
        p.seekTo(currentTime, true);
        setTimeout(() => { suppressEventRef.current = false; }, 300);
      }
    } catch {}
  }, [currentTime, ready]);

  // Sync playback speed
  useEffect(() => {
    const p = playerRef.current;
    if (!p || !ready) return;
    try { p.setPlaybackRate(playbackSpeed); } catch {}
  }, [playbackSpeed, ready]);

  // Sync mute
  useEffect(() => {
    const p = playerRef.current;
    if (!p || !ready) return;
    try {
      if (muted) p.mute(); else p.unMute();
    } catch {}
  }, [muted, ready]);

  const handleTogglePlay = () => {
    if (isPlaying) onPause?.();
    else onPlay?.();
  };

  return (
    <div className="rounded-xl overflow-hidden border border-white/[0.06] bg-black">
      <div
        ref={containerRef}
        className={cn(
          "relative w-full mx-auto [&_iframe]:absolute [&_iframe]:inset-0 [&_iframe]:w-full [&_iframe]:h-full",
          isVertical ? "max-w-[80vw] sm:max-w-[225px] aspect-[9/16]" : "aspect-video"
        )}
      />
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

// ── Instagram Embed (via iframely) ──────────────────────────────────────
function InstagramEmbed({
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
  const containerRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [muted, setMuted] = useState(true);
  const isPlayingRef = useRef(isPlaying);
  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  useEffect(() => { isPlayingRef.current = isPlaying; }, [isPlaying]);

  const handleTogglePlay = useCallback(() => {
    if (isPlaying) onPause?.();
    else onPlay?.();
  }, [isPlaying, onPause, onPlay]);

  const formatTime = (t: number) => {
    const m = Math.floor(t / 60);
    const s = Math.floor(t % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  // Trigger iframely to process the embed link + grab iframe ref
  useEffect(() => {
    const w = window as unknown as Record<string, unknown>;
    if (w.iframely && typeof (w.iframely as Record<string, unknown>).load === "function") {
      (w.iframely as { load: () => void }).load();
    }

    const interval = setInterval(() => {
      const iframe = containerRef.current?.querySelector("iframe");
      if (iframe) {
        iframeRef.current = iframe;
        clearInterval(interval);
      }
    }, 300);
    return () => clearInterval(interval);
  }, [url]);

  // Detect iframe clicks via focus/blur — when user clicks the Instagram
  // embed to play, we pick it up and start NeuroPeer visualizations
  useEffect(() => {
    const onWindowBlur = () => {
      // When window loses focus to an iframe, activeElement becomes the iframe
      setTimeout(() => {
        if (document.activeElement?.tagName === "IFRAME" && containerRef.current?.contains(document.activeElement)) {
          // User clicked inside the Instagram embed — toggle NeuroPeer play
          if (!isPlayingRef.current) onPlay?.();
        }
      }, 50);
    };

    window.addEventListener("blur", onWindowBlur);
    return () => window.removeEventListener("blur", onWindowBlur);
  }, [onPlay]);

  const embedUrl = extractInstagramEmbedUrl(url);

  return (
    <div className="rounded-xl overflow-hidden border border-white/[0.06] bg-black">
      <div className="relative w-full max-w-[320px] mx-auto aspect-[9/16]">
        <div ref={containerRef} className="w-full h-full relative">
          {embedUrl ? (
            <iframe
              ref={iframeRef as React.RefObject<HTMLIFrameElement>}
              src={embedUrl}
              className="w-full h-full border-0"
              allowFullScreen
              allow="autoplay; encrypted-media"
              loading="lazy"
              title="Instagram video"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-white/30 text-xs">
              Unable to embed Instagram video
            </div>
          )}
          {/* Sync indicator overlay */}
          {isPlaying && (
            <div className="absolute top-2 right-2 flex items-center gap-1 px-2 py-1 rounded-full bg-black/60 backdrop-blur-sm">
              <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
              <span className="text-[9px] text-white/60 font-medium">Synced</span>
            </div>
          )}
        </div>
        {/* Click overlay — ALWAYS intercepts clicks for play/pause sync */}
        <div
          className="absolute inset-0 cursor-pointer z-10"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            // Toggle NeuroPeer playback
            handleTogglePlay();
            // Simulate click on the Instagram iframe by briefly removing overlay
            // This lets the Instagram player also start/stop
            const overlay = e.currentTarget;
            overlay.style.pointerEvents = "none";
            setTimeout(() => {
              // Click through to iframe
              const iframe = iframeRef.current;
              if (iframe) {
                const rect = iframe.getBoundingClientRect();
                const clickEvent = new MouseEvent("click", {
                  clientX: rect.left + rect.width / 2,
                  clientY: rect.top + rect.height / 2,
                  bubbles: true,
                });
                iframe.dispatchEvent(clickEvent);
              }
              // Re-enable overlay
              setTimeout(() => { overlay.style.pointerEvents = "auto"; }, 100);
            }, 50);
          }}
        >
          <div className={`absolute inset-0 flex items-center justify-center transition-all duration-200 ${isPlaying ? "bg-transparent" : "bg-black/30"}`}>
            <div className={`w-14 h-14 rounded-full flex items-center justify-center transition-all duration-200 ${isPlaying ? "bg-black/30 scale-75 opacity-0 hover:opacity-100 hover:scale-100" : "bg-white/10 backdrop-blur-sm hover:bg-white/20"}`}>
              {isPlaying ? (
                <Pause className="w-6 h-6 text-white" />
              ) : (
                <Play className="w-6 h-6 text-white ml-1" />
              )}
            </div>
          </div>
        </div>
      </div>
      <div className="px-3 py-1 text-center">
        <span className="text-[9px] text-white/20">Use controls below to sync brain visualization playback</span>
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

  // ── YouTube Embed (via IFrame API) ────────────────────────────────────
  if (mediaType === "youtube" || mediaType === "youtube-short") {
    const videoId = extractYouTubeId(url);
    if (!videoId) {
      return (
        <div className="rounded-xl overflow-hidden border border-white/[0.06] bg-black aspect-video flex items-center justify-center text-white/20 text-xs">
          Unable to embed video
        </div>
      );
    }
    return (
      <YouTubePlayer
        videoId={videoId}
        isVertical={mediaType === "youtube-short"}
        currentTime={currentTime}
        isPlaying={isPlaying}
        duration={duration}
        playbackSpeed={playbackSpeed}
        onSeek={onSeek}
        onPlay={onPlay}
        onPause={onPause}
        onCycleSpeed={onCycleSpeed}
      />
    );
  }

  // ── Instagram Embed (via iframely) ──────────────────────────────────
  if (mediaType === "instagram") {
    return (
      <InstagramEmbed
        url={url}
        currentTime={currentTime}
        isPlaying={isPlaying}
        duration={duration}
        playbackSpeed={playbackSpeed}
        onSeek={onSeek}
        onPlay={onPlay}
        onPause={onPause}
        onCycleSpeed={onCycleSpeed}
      />
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
