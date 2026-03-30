import type {
  AnalysisResult,
  ComparisonResult,
  ContentType,
  ProgressEvent,
} from "./types";
import {
  mockSubmitAnalysis,
  mockGetResult,
  mockGetBrainMap,
  mockCompareVideos,
  mockExportReport,
  mockConnectJobWebSocket,
} from "./mock-data";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
const IS_MOCK = process.env.NEXT_PUBLIC_MOCK === "1";

// ── REST API ────────────���─────────────────────────────��───────────────────────

export async function submitAnalysis(
  url: string,
  contentType: ContentType
): Promise<{ job_id: string; websocket_url: string }> {
  if (IS_MOCK) {
    await fakePause(200);
    return mockSubmitAnalysis();
  }
  const res = await fetch(`${API_BASE}/api/v1/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url, content_type: contentType }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Unknown error" }));
    throw new Error(err.detail ?? `HTTP ${res.status}`);
  }
  return res.json();
}

export async function getResult(jobId: string): Promise<AnalysisResult> {
  if (IS_MOCK) {
    await fakePause(100);
    return mockGetResult(jobId);
  }
  const res = await fetch(`${API_BASE}/api/v1/results/${jobId}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Unknown error" }));
    throw new Error(err.detail ?? `HTTP ${res.status}`);
  }
  return res.json();
}

export async function getTimeseries(jobId: string): Promise<{
  attention_curve: number[];
  emotional_arousal_curve: number[];
  cognitive_load_curve: number[];
  duration_seconds: number;
}> {
  if (IS_MOCK) {
    const result = mockGetResult(jobId);
    return {
      attention_curve: result.attention_curve,
      emotional_arousal_curve: result.emotional_arousal_curve,
      cognitive_load_curve: result.cognitive_load_curve,
      duration_seconds: result.duration_seconds,
    };
  }
  const res = await fetch(`${API_BASE}/api/v1/results/${jobId}/timeseries`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function getBrainMap(
  jobId: string,
  timestamp: number
): Promise<{ timestamp: number; vertex_activations: number[] }> {
  if (IS_MOCK) {
    await fakePause(150);
    return mockGetBrainMap(jobId, timestamp);
  }
  const res = await fetch(
    `${API_BASE}/api/v1/results/${jobId}/brain-map?timestamp=${timestamp}`
  );
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function compareVideos(
  jobIds: string[]
): Promise<ComparisonResult> {
  if (IS_MOCK) {
    await fakePause(800);
    return mockCompareVideos(jobIds);
  }
  const res = await fetch(`${API_BASE}/api/v1/compare`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ job_ids: jobIds }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Unknown error" }));
    throw new Error(err.detail ?? `HTTP ${res.status}`);
  }
  return res.json();
}

export async function exportReport(
  jobId: string,
  format: "pdf" | "json" = "pdf"
): Promise<{ download_url: string | null; format: string }> {
  if (IS_MOCK) {
    await fakePause(300);
    return mockExportReport();
  }
  const res = await fetch(
    `${API_BASE}/api/v1/results/${jobId}/export?format=${format}`,
    { method: "POST" }
  );
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// ── WebSocket ──────────────────────────────────��──────────────────────────────

export function connectJobWebSocket(
  jobId: string,
  onEvent: (event: ProgressEvent) => void,
  onDone: () => void,
  onError: (msg: string) => void
): () => void {
  if (IS_MOCK) {
    return mockConnectJobWebSocket(jobId, onEvent, onDone, onError);
  }

  const wsUrl = API_BASE.replace(/^http/, "ws");
  const ws = new WebSocket(`${wsUrl}/ws/job/${jobId}`);

  ws.onmessage = (e) => {
    try {
      const event: ProgressEvent = JSON.parse(e.data);
      onEvent(event);
      if (event.status === "complete") onDone();
      if (event.status === "error") onError(event.message);
    } catch {
      // ignore malformed messages
    }
  };

  ws.onerror = () => onError("WebSocket connection failed");
  ws.onclose = () => {};

  return () => ws.close();
}

// ── Util ──────────────────────────────────────���───────────────────────────���───

function fakePause(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
