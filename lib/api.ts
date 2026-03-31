import type {
  AnalysisResult,
  ComparisonResult,
  ContentType,
  ProgressEvent,
} from "./types";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "https://neuropeer-api-production.up.railway.app";

// ── REST API ────────────────────────────────────────────────────────────────

export async function submitAnalysis(
  url: string,
  contentType: ContentType,
  parentJobId?: string
): Promise<{ job_id: string; websocket_url: string }> {
  const body: Record<string, unknown> = { url, content_type: contentType };
  if (parentJobId) body.parent_job_id = parentJobId;

  const res = await fetch(`${API_BASE}/api/v1/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Unknown error" }));
    throw new Error(err.detail ?? `HTTP ${res.status}`);
  }
  return res.json();
}

export async function getResult(jobId: string): Promise<AnalysisResult> {
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
  const res = await fetch(`${API_BASE}/api/v1/results/${jobId}/timeseries`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function getBrainMap(
  jobId: string,
  timestamp: number
): Promise<{ timestamp: number; vertex_activations: number[] }> {
  const res = await fetch(
    `${API_BASE}/api/v1/results/${jobId}/brain-map?timestamp=${timestamp}`
  );
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function compareVideos(
  jobIds: string[]
): Promise<ComparisonResult> {
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
  const res = await fetch(
    `${API_BASE}/api/v1/results/${jobId}/export?format=${format}`,
    { method: "POST" }
  );
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function getRunHistory(
  jobId: string
): Promise<{ content_group_id: string; runs: import("./types").RunHistoryEntry[] }> {
  const res = await fetch(`${API_BASE}/api/v1/results/${jobId}/history`);
  if (!res.ok) return { content_group_id: "", runs: [] };
  return res.json();
}

// ── WebSocket ────────────────────────────────────────────────────────────────

export function connectJobWebSocket(
  jobId: string,
  onEvent: (event: ProgressEvent) => void,
  onDone: () => void,
  onError: (msg: string) => void
): () => void {
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
