export interface RunHistoryEntry {
  jobId: string;
  url: string;
  contentType: string;
  neuralScore: number;
  timestamp: number; // epoch ms
  durationSeconds: number;
}

const BASE_KEY = "neuropeer_run_history";
const MAX_ENTRIES = 20;

function storageKey(userEmail?: string): string {
  return userEmail ? `${BASE_KEY}_${userEmail}` : BASE_KEY;
}

export function getRunHistory(userEmail?: string): RunHistoryEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(storageKey(userEmail));
    if (!raw) return [];
    return JSON.parse(raw) as RunHistoryEntry[];
  } catch {
    return [];
  }
}

export function addRunToHistory(entry: RunHistoryEntry, userEmail?: string): void {
  if (typeof window === "undefined") return;
  try {
    const history = getRunHistory(userEmail);
    const filtered = history.filter((e) => e.jobId !== entry.jobId);
    const updated = [entry, ...filtered].slice(0, MAX_ENTRIES);
    localStorage.setItem(storageKey(userEmail), JSON.stringify(updated));
  } catch {
    // localStorage might be full or unavailable
  }
}

export function clearRunHistory(userEmail?: string): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(storageKey(userEmail));
}
