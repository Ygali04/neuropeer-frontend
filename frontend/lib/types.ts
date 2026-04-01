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

export interface CampaignSummary {
  content_group_id: string;
  campaign_name: string | null;
  media_count: number;
  latest_score: number;
  first_score: number;
  delta: number;
  content_type: string;
  created_at: string;
  latest_at: string;
  latest_job_id: string | null;
}

export interface ProjectSummary {
  id: string;
  name: string;
  description: string | null;
  user_email: string;
  campaign_count: number;
  report_count: number;
  latest_score: number | null;
  created_at: string;
  updated_at: string;
}

export interface ProjectDetailReport {
  job_id: string;
  url: string;
  content_type: string;
  score: number | null;
  created_at: string;
}

export interface ProjectDetail {
  id: string;
  name: string;
  description: string | null;
  campaigns: {
    id: string;
    name: string;
    description: string | null;
    report_count: number;
    latest_score: number | null;
    reports: ProjectDetailReport[];
    created_at: string;
  }[];
  loose_reports: ProjectDetailReport[];
}

export interface CampaignV2 {
  id: string;
  name: string;
  description: string | null;
  project_id: string | null;
  user_email: string;
  report_count: number;
  latest_score: number | null;
  created_at: string;
}

export interface MarketerProfile {
  user_email: string;
  overall_score: number;
  total_analyses: number;
  ai_summary: string | null;
  ai_strengths: { metric: string; insight: string }[];
  ai_weaknesses: { metric: string; insight: string }[];
  ai_trends: { metric: string; direction: string; insight: string }[];
  last_refreshed_at: string | null;
}
