# Persistent Reports & Linked Runs

**Date:** 2026-03-31
**Status:** Approved

## Problem

1. AI summary, action items, and improvement strategies regenerate on every report load via OpenRouter. They should generate once during the pipeline and persist forever.
2. No way to re-analyze a video and track improvement across iterations. Runs are isolated — no parent/child or grouping.
3. Users editing their video content have no way to prove improvement across marketing strategy iterations.

## Design Decisions

- **AI feedback in pipeline (Option A):** Generated as the final step of the Celery worker task, stored in PostgreSQL alongside the result. Frontend never calls OpenRouter.
- **Linked runs (Option C):** Both `parent_job_id` (causal chain) and `content_group_id` (URL-agnostic grouping). Supports same-URL re-runs and cross-URL variant tracking.
- **Re-analyze flow (B+C):** From any report, user can re-run the same URL or paste a new version. AI feedback is context-aware of the parent run's scores and generates delta insights.

---

## 1. Backend: AI Feedback in Pipeline

### 1.1 New Columns on `Result` Table

```sql
ALTER TABLE result ADD COLUMN ai_summary TEXT;
ALTER TABLE result ADD COLUMN ai_report_title TEXT;
ALTER TABLE result ADD COLUMN ai_action_items JSONB DEFAULT '[]';
ALTER TABLE result ADD COLUMN ai_priorities JSONB DEFAULT '{}';
ALTER TABLE result ADD COLUMN ai_category_strategies JSONB DEFAULT '[]';
ALTER TABLE result ADD COLUMN ai_metric_tips JSONB DEFAULT '[]';
```

### 1.2 Pipeline Step

After `neural_score` completes in the Celery worker (`backend/worker/tasks.py`), add a new step:

```
ingest → tribe_inference → metric_engine → neural_score → ai_feedback → store_result
```

New module: `backend/pipeline/ai_feedback.py`
- Accepts: `AnalysisResult` dict + optional `parent_result` dict (for delta-aware feedback)
- Calls OpenRouter (minimax-m2.7 or configured model) with the same prompt currently in `frontend/app/api/generate-feedback/route.ts`
- Returns structured JSON: `summary`, `report_title`, `action_items`, `priorities`, `category_strategies`, `metric_tips`
- On failure: logs error, stores empty fields. Report still works without AI feedback.

### 1.3 Delta-Aware Prompt

When `parent_job_id` is set, the AI prompt includes:

```
Previous analysis scores:
- Neural Score: {parent.total} → Current: {current.total} ({delta:+d})
- Hook: {parent.hook} → {current.hook}
- Sustained Attention: {parent.attention} → {current.attention}
...

Highlight what improved, what regressed, and what stayed flat. Frame improvements as validation of the content strategy changes.
```

### 1.4 Frontend Removal

- Delete `frontend/app/api/generate-feedback/route.ts` (the Next.js API route)
- `ImprovementStrategies.tsx` reads `ai_*` fields from the `AnalysisResult` prop — no fetch, no loading state
- Remove OpenRouter-related env vars from frontend

---

## 2. Backend: Linked Runs Data Model

### 2.1 New Columns on `Job` Table

```sql
ALTER TABLE job ADD COLUMN parent_job_id UUID REFERENCES job(id) ON DELETE SET NULL;
ALTER TABLE job ADD COLUMN content_group_id UUID NOT NULL DEFAULT gen_random_uuid();
```

### 2.2 Behavior

| Scenario | `parent_job_id` | `content_group_id` |
|---|---|---|
| First analysis of a URL | `NULL` | New UUID (auto) |
| Re-analyze same URL from report | Current job's ID | Inherited from parent |
| Analyze new version from report | Current job's ID | Inherited from parent |
| Fresh submission of same URL (no parent context) | `NULL` | New UUID |

### 2.3 API Changes

**`POST /api/v1/analyze`** — add optional body field:
```json
{
  "url": "https://...",
  "content_type": "instagram_reel",
  "parent_job_id": "uuid-of-previous-run"  // optional
}
```

When `parent_job_id` is provided:
1. Look up parent job
2. Copy `content_group_id` from parent to new job
3. Pass parent's result to the AI feedback generator for delta context

**`GET /api/v1/results/{job_id}/history`** — new endpoint:
```json
{
  "content_group_id": "uuid",
  "runs": [
    {
      "job_id": "...",
      "url": "https://...",
      "neural_score": 72,
      "created_at": "2026-03-31T...",
      "parent_job_id": null,
      "is_current": false
    },
    {
      "job_id": "...",
      "url": "https://...",
      "neural_score": 84,
      "created_at": "2026-03-31T...",
      "parent_job_id": "previous-job-id",
      "is_current": true
    }
  ]
}
```

Returns all runs in the same `content_group_id`, ordered by `created_at ASC`.

---

## 3. Frontend: Re-Analyze Flow

### 3.1 Re-Analyze Button

On the report page header (next to Export/Share buttons):
- "Re-analyze" button
- Opens a modal with two options:
  - **"Re-run this video"** — one-click. Submits same URL with `parent_job_id` set. Navigates to new job's analyze page.
  - **"Analyze edited version"** — shows URL input field. User pastes new URL. Submits with `parent_job_id` set. Navigates to new job.

### 3.2 Version History Panel

On the report page, a collapsible "Run History" section:
- Fetches `/api/v1/results/{job_id}/history`
- Displays as a vertical timeline: `v1 → v2 → v3`
- Each entry shows:
  - Run number (v1, v2, v3...)
  - Date
  - URL (truncated, with indicator if URL changed from previous)
  - Neural score with color badge
  - Delta from previous run (e.g. "+12" in green, "-3" in red)
- Current report highlighted
- Click any entry to navigate to that report

### 3.3 Delta Banner

When a report has a `parent_job_id`, show a banner at the top of the results:
- "Compared to previous run: Neural Score 72 → 84 (+12)"
- Color-coded: green for improvement, red for regression
- Links back to parent report

---

## 4. Type Changes

### 4.1 `AnalysisResult` (frontend)

Add fields:
```typescript
interface AnalysisResult {
  // ... existing fields ...

  // AI feedback (persisted)
  ai_summary?: string;
  ai_report_title?: string;
  ai_action_items?: ActionItem[];
  ai_priorities?: AIPriorities;
  ai_category_strategies?: CategoryStrategy[];
  ai_metric_tips?: MetricTip[];

  // Linked runs
  parent_job_id?: string;
  content_group_id?: string;
}
```

### 4.2 `AnalysisResult` Pydantic model (backend)

Add matching fields to `backend/models/schemas.py`.

---

## 5. Migration Path

1. Add new DB columns (nullable, with defaults) — no breaking change
2. Deploy backend with AI feedback in pipeline
3. Deploy frontend that reads from persisted fields
4. Delete frontend OpenRouter route
5. Existing reports without AI feedback: show the static metric-based strategies as fallback

---

## 6. Out of Scope

- Tracking which specific improvements the user implemented between runs
- Auto-detecting what changed between video versions
- Billing/rate-limiting for re-analysis
- Notification when re-analysis completes
