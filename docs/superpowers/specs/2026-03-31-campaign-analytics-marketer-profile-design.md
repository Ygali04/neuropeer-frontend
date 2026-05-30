# Campaign Analytics, Marketer Profile & Dashboard

**Date:** 2026-03-31
**Status:** Approved

## Problem

1. Users have no way to track improvement across video iterations within a marketing campaign.
2. No aggregate view of a user's growth as a content creator over time.
3. The dashboard is a flat list of runs with no grouping, naming, or trend analysis.
4. Campaigns (content groups) have no names — they're just UUIDs.

## Terminology

- **Media** — an individual video analysis (a job with a result)
- **Campaign** — a named series of related media iterations, mapped to `content_group_id`. Can contain re-runs of the same URL or entirely new videos linked via `parent_job_id`.
- **Marketer Profile** — user-level aggregate of all campaigns, with an AI-generated summary of strengths, weaknesses, and trends.
- **Overall Score** — the mean of each campaign's latest neural score. Goes up when campaigns improve.

## Design Decisions

- **Campaign = content_group** — no new Campaign table. `content_group_id` on Job IS the campaign. A `campaign_name` column is added for display.
- **Auto-naming** — cheap model (llama-3.2-1b-instruct or similar free tier) generates a 3-5 word name when the first video in a campaign completes. User can rename.
- **Profile generation** — minimax-m2.7 via OpenRouter, triggered every 5 completed analyses. Stored in a `marketer_profile` table.
- **Dashboard is series-first** — campaigns are the primary unit. Overall score is a summary stat derived from campaign data.

---

## 1. Data Model

### 1.1 New Table: `marketer_profile`

```sql
CREATE TABLE marketer_profile (
    user_email TEXT PRIMARY KEY,
    overall_score FLOAT NOT NULL DEFAULT 0,
    total_analyses INT NOT NULL DEFAULT 0,
    ai_summary TEXT,
    ai_strengths JSONB DEFAULT '[]',
    ai_weaknesses JSONB DEFAULT '[]',
    ai_trends JSONB DEFAULT '[]',
    last_refreshed_at TIMESTAMP,
    refresh_threshold INT NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);
```

Fields:
- `overall_score` — mean of each campaign's latest neural score
- `ai_summary` — "You're a visual-first marketer who excels at hooks but struggles with memory encoding..."
- `ai_strengths` — top 3 strengths: `[{"metric": "Visual Hook Strength", "avg_score": 87, "trend": "stable"}]`
- `ai_weaknesses` — top 3 weaknesses: `[{"metric": "CTA Effectiveness", "avg_score": 54, "trend": "improving"}]`
- `ai_trends` — `[{"metric": "Memory Encoding", "direction": "improving", "delta": +8}]`
- `refresh_threshold` — analysis count at last refresh. Regenerate when `total_analyses >= refresh_threshold + 5`.

### 1.2 Extend `Job` Table

```sql
ALTER TABLE jobs ADD COLUMN campaign_name TEXT;
ALTER TABLE jobs ADD COLUMN user_email TEXT;
```

- `campaign_name` — auto-generated on first video, user-renameable. All jobs in the same `content_group_id` share this name (set on the first job, read from it for display).
- `user_email` — ties job to a user for profile aggregation.

---

## 2. Backend: Campaign Auto-Naming

### 2.1 Module: `backend/pipeline/campaign_naming.py`

Called in the Celery worker after AI feedback generation, only for the first job in a content group (no `parent_job_id`).

Uses a cheap/free model via OpenRouter (e.g. `meta-llama/llama-3.2-1b-instruct:free`).

Prompt input: URL, content type, AI summary snippet (first sentence).

Expected output: a 3-5 word campaign name.

Stored as `campaign_name` on the Job row. Subsequent jobs in the same group read the name from the first job.

### 2.2 API: Rename Campaign

`PUT /api/v1/campaigns/{content_group_id}/name`

Body: `{"name": "Q2 Instagram Launch"}`

Updates `campaign_name` on all jobs in the content group.

---

## 3. Backend: Marketer Profile Generation

### 3.1 Module: `backend/pipeline/marketer_profile.py`

Called in the Celery worker after every completed analysis.

**Trigger logic:**
1. Increment `total_analyses` on the user's profile (upsert)
2. Check: `total_analyses >= refresh_threshold + 5`?
3. If yes, regenerate the profile.

**Profile generation:**
1. Fetch all campaigns for the user (group by `content_group_id`, latest job per group)
2. For each campaign: latest neural score, all 18 metric scores
3. Compute `overall_score` = mean of latest campaign neural scores
4. Aggregate metric scores across campaigns to find strengths/weaknesses
5. Compare current metric averages vs the user's first 5 analyses to compute trends
6. Call OpenRouter (minimax-m2.7) with profile prompt
7. Parse response: summary, strengths, weaknesses, trends
8. Store in `marketer_profile`

### 3.2 Profile AI Prompt

```
You are NeuroPeer's marketing coach. Analyze this marketer's performance across all their campaigns.

Campaigns: {count}
Overall Score: {score}/100
Top metrics: {top_3_with_scores}
Weakest metrics: {bottom_3_with_scores}
Improving: {improving_metrics}
Declining: {declining_metrics}

Return JSON:
{
  "summary": "2-3 sentence profile. State their marketer archetype, top strength, critical growth area.",
  "strengths": [{"metric": "name", "insight": "1 sentence why this is strong"}],
  "weaknesses": [{"metric": "name", "insight": "1 sentence what to work on"}],
  "trends": [{"metric": "name", "direction": "improving|declining|stable", "insight": "1 sentence"}]
}
```

### 3.3 API Endpoints

- `GET /api/v1/profile` — returns marketer profile for the authenticated user
- `GET /api/v1/campaigns` — returns all campaigns for the user:
  ```json
  [
    {
      "content_group_id": "uuid",
      "campaign_name": "Q2 Instagram Launch",
      "media_count": 3,
      "latest_score": 84,
      "first_score": 68,
      "delta": 16,
      "content_type": "instagram_reel",
      "created_at": "2026-03-15T...",
      "latest_at": "2026-03-31T..."
    }
  ]
  ```

---

## 4. Frontend: Dashboard Redesign

### 4.1 Top Section: Marketer Profile Card

- Overall score (large number, color-coded, trend arrow)
- AI summary paragraph
- Strengths vs Weaknesses: 3 each, shown as labeled bars or pills
- "Updated after every 5 analyses" subtle label

### 4.2 Middle Section: Score Timeline Graph

- Interactive line/scatter chart
- X-axis: time (dates of analyses)
- Y-axis: overall score (0-100)
- Data points: each analysis, colored by campaign
- Clicking a data point → navigates to that campaign's detail or the specific report
- Hover tooltip: campaign name, media URL (truncated), score, delta from previous

### 4.3 Bottom Section: Campaign List

Each campaign as a card:
- Campaign name (click to edit inline)
- Media count + iteration count
- Score trajectory mini-chart (sparkline: v1 → v2 → v3 scores)
- Latest score with delta from first version (e.g. "84 (+16)")
- Content type badge
- Click → navigates to `/analyze/{latest_job_id}` which already has the version history panel

### 4.4 Empty State

For new users with no analyses:
- "Run your first analysis to start building your marketer profile"
- CTA button to home page

---

## 5. Frontend Components

### New Components

- `MarketerProfileCard` — overall score, AI summary, strengths/weaknesses
- `ScoreTimeline` — interactive chart with clickable campaign data points
- `CampaignCard` — compact campaign summary with sparkline trajectory
- `CampaignList` — list of CampaignCards with sorting/filtering

### Modified Components

- `frontend/app/dashboard/page.tsx` — complete redesign using new components
- `frontend/lib/api.ts` — add `getProfile()`, `getCampaigns()`, `renameCampaign()`
- `frontend/lib/types.ts` — add `MarketerProfile`, `CampaignSummary` types

---

## 6. Overall Score Calculation

```
overall_score = mean(campaign.latest_neural_score for each campaign)
```

When a campaign's latest media gets a higher score → overall score increases.
When a new campaign starts with a low first score → overall score may dip temporarily.

This is recalculated during profile generation (every 5 analyses) and stored in `marketer_profile`.

---

## 7. Naming Models

| Task | Model | Via |
|------|-------|-----|
| Campaign auto-naming | meta-llama/llama-3.2-1b-instruct:free | OpenRouter |
| Report title (already exists) | minimax/minimax-m2.7 | OpenRouter |
| Marketer profile summary | minimax/minimax-m2.7 | OpenRouter |

---

## 8. Out of Scope

- Team/org-level analytics (multi-user dashboards)
- Campaign sharing/collaboration
- Custom scoring weights per campaign
- Historical profile snapshots (only latest profile stored)
- Campaign templates or benchmarks
- Billing or usage limits
