export interface RunHistoryEntry {
  jobId: string;
  url: string;
  contentType: string;
  neuralScore: number;
  timestamp: number; // epoch ms
  durationSeconds: number;
}

const STORAGE_KEY = "neuropeer_run_history";
const MAX_ENTRIES = 20;

export function getRunHistory(): RunHistoryEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as RunHistoryEntry[];
  } catch {
    return [];
  }
}

export function addRunToHistory(entry: RunHistoryEntry): void {
  if (typeof window === "undefined") return;
  try {
    const history = getRunHistory();
    // Remove duplicate job IDs
    const filtered = history.filter((e) => e.jobId !== entry.jobId);
    // Prepend new entry, cap at MAX_ENTRIES
    const updated = [entry, ...filtered].slice(0, MAX_ENTRIES);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  } catch {
    // localStorage might be full or unavailable
  }
}

export function clearRunHistory(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(STORAGE_KEY);
}
