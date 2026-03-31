export type ContentType =
  | "instagram_reel"
  | "product_demo"
  | "youtube_preroll"
  | "conference_talk"
  | "podcast_audio"
  | "custom";

export type JobStatus =
  | "queued"
  | "downloading"
  | "transcribing"
  | "inferring"
  | "aggregating"
  | "scoring"
  | "complete"
  | "error";

export interface ProgressEvent {
  job_id: string;
  status: JobStatus;
  progress: number; // 0–1
  message: string;
}

export interface MetricScore {
  name: string;
  score: number; // 0–100
  raw_value: number;
  description: string;
  brain_region: string;
  gtm_proxy: string;
}

export interface KeyMoment {
  timestamp: number; // seconds
  type: "best_hook" | "peak_engagement" | "emotional_peak" | "dropoff_risk" | "recovery";
  label: string;
  score: number;
}

export interface ModalityContribution {
  timestamp: number;
  visual: number;
  audio: number;
  text: number;
}

export interface NeuralScoreBreakdown {
  total: number;
  hook_score: number;
  sustained_attention: number;
  emotional_resonance: number;
  memory_encoding: number;
  aesthetic_quality: number;
  cognitive_accessibility: number;
}

export interface AnalysisResult {
  job_id: string;
  url: string;
  content_type: ContentType;
  duration_seconds: number;
  neural_score: NeuralScoreBreakdown;
  metrics: MetricScore[];
  attention_curve: number[];
  emotional_arousal_curve: number[];
  cognitive_load_curve: number[];
  key_moments: KeyMoment[];
  modality_breakdown: ModalityContribution[];
  overarching_summary?: string;

  // AI feedback (persisted in DB)
  ai_summary?: string;
  ai_report_title?: string;
  ai_action_items?: string[];
  ai_priorities?: string[];
  ai_category_strategies?: Record<string, { score_context: string; strategies: string[] }>;
  ai_metric_tips?: Record<string, string>;

  // Linked runs
  parent_job_id?: string;
  content_group_id?: string;
}

export interface RunHistoryEntry {
  job_id: string;
  url: string;
  neural_score: number;
  created_at: string;
  parent_job_id: string | null;
  is_current: boolean;
}

export interface ComparisonResult {
  job_ids: string[];
  labels: string[];
  neural_scores: NeuralScoreBreakdown[];
  winner_job_id: string;
  recommendation: string;
  delta_metrics: Record<string, number[]>;
}
