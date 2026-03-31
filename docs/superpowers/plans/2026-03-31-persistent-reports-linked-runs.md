# Persistent Reports & Linked Runs — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move AI feedback generation into the backend pipeline so reports are fully self-contained, and add linked runs so users can track improvement across video iterations.

**Architecture:** AI feedback generated in Celery worker after neural scoring, stored in PostgreSQL `Result` table. Jobs gain `parent_job_id` (causal chain) and `content_group_id` (URL-agnostic grouping). Frontend reads persisted AI feedback from the result payload and shows version history.

**Tech Stack:** Python/FastAPI/SQLAlchemy (backend), Next.js/TypeScript (frontend), OpenRouter API (AI), PostgreSQL, Redis, S3.

---

## File Map

### Backend — Create
- `backend/pipeline/ai_feedback.py` — AI feedback generator (calls OpenRouter, builds prompts, parses response)

### Backend — Modify
- `backend/models/db.py` — Add AI feedback columns to `Result`, add `parent_job_id`/`content_group_id` to `Job`
- `backend/models/schemas.py` — Add AI feedback fields to `AnalysisResult`, add `parent_job_id` to `AnalyzeRequest`/`JobCreatedResponse`, add `RunHistoryEntry`/`RunHistoryResponse`
- `backend/config.py` — Add `openrouter_api_key` setting
- `backend/worker/tasks.py` — Call `generate_ai_feedback()` after neural scoring, pass parent result for delta context, persist AI fields
- `backend/api/routes/analyze.py` — Accept `parent_job_id`, inherit `content_group_id` from parent
- `backend/api/routes/results.py` — Add `/results/{job_id}/history` endpoint, include AI fields in result response

### Frontend — Modify
- `frontend/lib/types.ts` — Add AI feedback fields, `parent_job_id`, `content_group_id` to `AnalysisResult`; add `RunHistoryEntry`
- `frontend/lib/api.ts` — Add `getRunHistory()`, update `submitAnalysis()` to accept `parentJobId`
- `frontend/app/analyze/[jobId]/page.tsx` — Remove GLM fetch, read AI feedback from result, add re-analyze button, add version history panel
- `frontend/components/ImprovementStrategies.tsx` — Remove loading state, read directly from persisted fields

### Frontend — Delete
- `frontend/app/api/generate-feedback/route.ts` — No longer needed
- `frontend/lib/glm.ts` — No longer needed (moved to backend)
- `frontend/lib/feedback-prompts.ts` — No longer needed (moved to backend)

---

## Task 1: Add OpenRouter config to backend

**Files:**
- Modify: `backend/config.py`

- [ ] **Step 1: Add openrouter_api_key to Settings**

In `backend/config.py`, add after the `elevenlabs_api_key` line:

```python
    # AI Feedback (OpenRouter)
    openrouter_api_key: str = ""
```

- [ ] **Step 2: Add to backend/.env**

Add to `backend/.env`:
```
OPENROUTER_API_KEY=your_key_here
```

Copy the actual key from the frontend's env (it was using `OPENROUTER_API_KEY` or `GLM_KEY`).

- [ ] **Step 3: Commit**

```bash
git add backend/config.py backend/.env.example
git commit -m "feat: add OpenRouter API key to backend config"
```

---

## Task 2: Extend DB models — AI feedback + linked runs

**Files:**
- Modify: `backend/models/db.py`

- [ ] **Step 1: Add AI feedback columns to Result**

In `backend/models/db.py`, add to the `Result` class after `modality_json`:

```python
    # AI-generated feedback (persisted once during pipeline)
    ai_summary: Mapped[str | None] = mapped_column(Text)
    ai_report_title: Mapped[str | None] = mapped_column(Text)
    ai_action_items: Mapped[dict | None] = mapped_column(JSON)
    ai_priorities: Mapped[dict | None] = mapped_column(JSON)
    ai_category_strategies: Mapped[dict | None] = mapped_column(JSON)
    ai_metric_tips: Mapped[dict | None] = mapped_column(JSON)
```

- [ ] **Step 2: Add linked run columns to Job**

In `backend/models/db.py`, add to the `Job` class after `completed_at`:

```python
    # Linked runs
    parent_job_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("jobs.id", ondelete="SET NULL"), nullable=True
    )
    content_group_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), default=uuid.uuid4, nullable=False
    )
```

- [ ] **Step 3: Add overarching_summary to Result**

In `backend/models/db.py`, add to `Result` if not present (for backward compat with the frontend field):

```python
    overarching_summary: Mapped[str | None] = mapped_column(Text)
```

- [ ] **Step 4: Commit**

```bash
git add backend/models/db.py
git commit -m "feat: add AI feedback columns and linked run fields to DB models"
```

---

## Task 3: Extend Pydantic schemas

**Files:**
- Modify: `backend/models/schemas.py`

- [ ] **Step 1: Add AI feedback fields to AnalysisResult**

In `backend/models/schemas.py`, add to the `AnalysisResult` class after `modality_breakdown`:

```python
    overarching_summary: str | None = None
    ai_summary: str | None = None
    ai_report_title: str | None = None
    ai_action_items: list[str] | None = None
    ai_priorities: list[str] | None = None
    ai_category_strategies: dict | None = None
    ai_metric_tips: dict | None = None
    parent_job_id: UUID | None = None
    content_group_id: UUID | None = None
```

- [ ] **Step 2: Add parent_job_id to AnalyzeRequest**

In `backend/models/schemas.py`, add to `AnalyzeRequest` after `label`:

```python
    parent_job_id: UUID | None = None  # link to previous run for delta-aware feedback
```

- [ ] **Step 3: Add parent_job_id and content_group_id to JobCreatedResponse**

```python
class JobCreatedResponse(BaseModel):
    job_id: UUID
    websocket_url: str
    status: JobStatus = JobStatus.queued
    parent_job_id: UUID | None = None
    content_group_id: UUID | None = None
```

- [ ] **Step 4: Add RunHistoryEntry and RunHistoryResponse**

Add at the end of the file:

```python
class RunHistoryEntry(BaseModel):
    job_id: UUID
    url: str
    neural_score: float
    created_at: str
    parent_job_id: UUID | None = None
    is_current: bool = False


class RunHistoryResponse(BaseModel):
    content_group_id: UUID
    runs: list[RunHistoryEntry]
```

- [ ] **Step 5: Commit**

```bash
git add backend/models/schemas.py
git commit -m "feat: extend Pydantic schemas for AI feedback and linked runs"
```

---

## Task 4: Create AI feedback pipeline module

**Files:**
- Create: `backend/pipeline/ai_feedback.py`

- [ ] **Step 1: Create the AI feedback generator**

Create `backend/pipeline/ai_feedback.py`:

```python
"""
AI feedback generation — called once during the pipeline, persisted forever.

Uses OpenRouter (minimax-m2.7) to generate:
- summary, report_title, action_items, priorities
- category_strategies, metric_tips
- Delta-aware insights when a parent result is provided.
"""

from __future__ import annotations

import json
import logging

import httpx

from backend.config import settings

logger = logging.getLogger(__name__)

OPENROUTER_ENDPOINT = "https://openrouter.ai/api/v1/chat/completions"
MODEL = "minimax/minimax-m2.7"

SYSTEM_PROMPT = """You are NeuroPeer's neural content strategist. You analyze video content using fMRI-grade brain response predictions from Meta's TRIBE v2 model (20,484 cortical vertices at 1Hz).

Rules:
- Respond ONLY with valid JSON. No markdown wrapping.
- Keep text SHORT — every string must fit on a UI card (max 2 sentences per item).
- Be specific to the video's actual scores. No generic advice.
- Reference brain regions and neural mechanisms by name."""


def _top_metrics(metrics: list[dict], n: int, ascending: bool) -> str:
    sorted_m = sorted(metrics, key=lambda m: m["score"], reverse=not ascending)
    return ", ".join(f"{m['name']}: {round(m['score'])}/100" for m in sorted_m[:n])


def _format_moments(moments: list[dict]) -> str:
    return "; ".join(f"{m['timestamp']}s: {m['type']} ({round(m['score'])})" for m in moments[:6])


def _build_prompt(result: dict, parent_result: dict | None = None) -> list[dict]:
    ns = result["neural_score"]
    metrics = result["metrics"]
    moments = result.get("key_moments", [])
    ct = result.get("content_type", "custom").replace("_", " ")
    dur = result.get("duration_seconds", 0)

    user_content = f"""Video: {ct} ({dur}s)
Score: {round(ns['total'])}/100 | Hook: {round(ns['hook_score'])} | Attention: {round(ns['sustained_attention'])} | Emotion: {round(ns['emotional_resonance'])} | Memory: {round(ns['memory_encoding'])} | Aesthetic: {round(ns['aesthetic_quality'])} | Clarity: {round(ns['cognitive_accessibility'])}
Weakest: {_top_metrics(metrics, 5, True)}
Strongest: {_top_metrics(metrics, 3, False)}
Moments: {_format_moments(moments)}"""

    if parent_result:
        pns = parent_result["neural_score"]
        delta = round(ns["total"]) - round(pns["total"])
        sign = "+" if delta >= 0 else ""
        user_content += f"""

PREVIOUS RUN COMPARISON (delta-aware — highlight changes):
Previous Score: {round(pns['total'])}/100 → Current: {round(ns['total'])}/100 ({sign}{delta})
Hook: {round(pns['hook_score'])} → {round(ns['hook_score'])}
Attention: {round(pns['sustained_attention'])} → {round(ns['sustained_attention'])}
Emotion: {round(pns['emotional_resonance'])} → {round(ns['emotional_resonance'])}
Memory: {round(pns['memory_encoding'])} → {round(ns['memory_encoding'])}
Aesthetic: {round(pns['aesthetic_quality'])} → {round(ns['aesthetic_quality'])}
Clarity: {round(pns['cognitive_accessibility'])} → {round(ns['cognitive_accessibility'])}

Frame improvements as validation of the content strategy changes. Highlight what improved, regressed, and stayed flat."""

    user_content += """

Return this JSON:
{
  "summary": "2-3 sentence assessment. State score, top strength, critical weakness, one recommendation.",
  "report_title": "Creative 3-5 word title",
  "action_items": [
    "Specific quick-win action (1 sentence, max 15 words)",
    "Content edit to make (1 sentence, max 15 words)",
    "Strategic shift (1 sentence, max 15 words)"
  ],
  "priorities": [
    "TOP: What to fix first and why (1-2 sentences)",
    "SECOND: Next improvement (1-2 sentences)",
    "THIRD: Third improvement (1-2 sentences)"
  ],
  "category_strategies": {
    "Attention & Hook": {
      "score_context": "1 sentence assessment (max 20 words)",
      "strategies": ["Strategy with neural rationale (2 sentences max)", "Second strategy (2 sentences max)"]
    },
    "Emotional Engagement": {
      "score_context": "1 sentence (max 20 words)",
      "strategies": ["Strategy (2 sentences max)", "Strategy (2 sentences max)"]
    },
    "Memory & Recall": {
      "score_context": "1 sentence (max 20 words)",
      "strategies": ["Strategy (2 sentences max)", "Strategy (2 sentences max)"]
    },
    "Production Quality": {
      "score_context": "1 sentence (max 20 words)",
      "strategies": ["Strategy (2 sentences max)", "Strategy (2 sentences max)"]
    }
  },
  "metric_tips": {
    "WeakestMetric1": "1-sentence tip grounded in neural substrate",
    "WeakestMetric2": "1-sentence tip",
    "WeakestMetric3": "1-sentence tip"
  }
}"""

    return [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": user_content},
    ]


def generate_ai_feedback(
    result: dict,
    parent_result: dict | None = None,
) -> dict:
    """
    Call OpenRouter to generate AI feedback for an analysis result.

    Returns dict with keys: summary, report_title, action_items, priorities,
    category_strategies, metric_tips. Returns empty dict on failure.
    """
    api_key = settings.openrouter_api_key
    if not api_key:
        logger.warning("OPENROUTER_API_KEY not set — skipping AI feedback generation")
        return {}

    messages = _build_prompt(result, parent_result)

    try:
        resp = httpx.post(
            OPENROUTER_ENDPOINT,
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {api_key}",
                "HTTP-Referer": "https://neuropeer-frontend.vercel.app",
                "X-Title": "NeuroPeer",
            },
            json={
                "model": MODEL,
                "messages": messages,
                "temperature": 0.7,
                "max_tokens": 6000,
            },
            timeout=55.0,
        )
        resp.raise_for_status()

        raw = resp.json()["choices"][0]["message"]["content"]
        # Strip markdown wrapping if present
        clean = raw.strip()
        if clean.startswith("```"):
            clean = clean.split("\n", 1)[1] if "\n" in clean else clean[3:]
            if clean.endswith("```"):
                clean = clean[:-3]
            clean = clean.strip()

        parsed = json.loads(clean)

        return {
            "summary": parsed.get("summary", ""),
            "report_title": parsed.get("report_title", ""),
            "action_items": parsed.get("action_items", []),
            "priorities": parsed.get("priorities", []),
            "category_strategies": parsed.get("category_strategies", {}),
            "metric_tips": parsed.get("metric_tips", {}),
        }

    except Exception as exc:
        logger.warning("AI feedback generation failed (non-fatal): %s", exc)
        return {}
```

- [ ] **Step 2: Commit**

```bash
git add backend/pipeline/ai_feedback.py
git commit -m "feat: create AI feedback pipeline module"
```

---

## Task 5: Integrate AI feedback + linked runs into Celery worker

**Files:**
- Modify: `backend/worker/tasks.py`

- [ ] **Step 1: Add AI feedback generation after neural scoring**

In `backend/worker/tasks.py`, after the neural score / key moments section (after `key_moments = detect_key_moments(...)`) and before the S3 upload section, add:

```python
        # ── Stage 5: AI Feedback generation ───────────────────────────────
        _publish_progress(job_id, "scoring", 0.88, "Generating AI improvement strategies…")

        from backend.pipeline.ai_feedback import generate_ai_feedback

        # Build a temporary result dict for the AI prompt
        _ai_input = {
            "content_type": content_type,
            "duration_seconds": media.duration_seconds,
            "neural_score": neural_score.model_dump(),
            "metrics": [m.model_dump() for m in metrics],
            "key_moments": [km.model_dump() for km in key_moments],
        }

        # Fetch parent result for delta-aware feedback
        parent_result_data = None
        if parent_job_id:
            raw_parent = _get_redis().get(f"neuropeer:result:{parent_job_id}")
            if raw_parent:
                parent_result_data = json.loads(raw_parent)

        ai_feedback = generate_ai_feedback(_ai_input, parent_result_data)
```

- [ ] **Step 2: Update the task signature to accept parent_job_id**

Change the task signature from:

```python
def run_analysis(self, job_id: str, url: str, content_type: str) -> dict:
```

to:

```python
def run_analysis(self, job_id: str, url: str, content_type: str, parent_job_id: str | None = None) -> dict:
```

- [ ] **Step 3: Include AI feedback in the result dict**

In the result dict construction (the `result = { ... }` block), add after `"timeseries_s3_key"`:

```python
            "overarching_summary": ai_feedback.get("summary", ""),
            "ai_summary": ai_feedback.get("summary", ""),
            "ai_report_title": ai_feedback.get("report_title", ""),
            "ai_action_items": ai_feedback.get("action_items", []),
            "ai_priorities": ai_feedback.get("priorities", []),
            "ai_category_strategies": ai_feedback.get("category_strategies", {}),
            "ai_metric_tips": ai_feedback.get("metric_tips", {}),
            "parent_job_id": parent_job_id,
```

- [ ] **Step 4: Update _persist_to_db to store AI feedback**

Update the `_persist_to_db` function signature to accept AI feedback and parent/group IDs:

```python
def _persist_to_db(job_id, url, content_type, duration, neural_score, metrics_data, key_moments, modality_breakdown, vertex_key, timeseries_key, ai_feedback=None, parent_job_id=None, content_group_id=None):
```

In the `Result` creation inside `_persist_to_db`, add:

```python
                overarching_summary=ai_feedback.get("summary") if ai_feedback else None,
                ai_summary=ai_feedback.get("summary") if ai_feedback else None,
                ai_report_title=ai_feedback.get("report_title") if ai_feedback else None,
                ai_action_items=ai_feedback.get("action_items") if ai_feedback else None,
                ai_priorities=ai_feedback.get("priorities") if ai_feedback else None,
                ai_category_strategies=ai_feedback.get("category_strategies") if ai_feedback else None,
                ai_metric_tips=ai_feedback.get("metric_tips") if ai_feedback else None,
```

In the `Job` creation/update inside `_persist_to_db`, set `parent_job_id` and `content_group_id`:

For the existing job update path:
```python
            if existing:
                existing.status = "complete"
                existing.completed_at = datetime.now(UTC).replace(tzinfo=None)
```

For the new job creation path, add:
```python
                session.add(Job(
                    id=UUID(job_id), url=url, content_type=content_type,
                    status="complete",
                    created_at=datetime.now(UTC).replace(tzinfo=None),
                    completed_at=datetime.now(UTC).replace(tzinfo=None),
                    parent_job_id=UUID(parent_job_id) if parent_job_id else None,
                    content_group_id=UUID(content_group_id) if content_group_id else uuid.uuid4(),
                ))
```

- [ ] **Step 5: Update the _persist_to_db call site**

Update the call to `_persist_to_db` in `run_analysis` to pass the new args:

```python
        _persist_to_db(job_id, url, content_type, media.duration_seconds, neural_score, metrics_data, key_moments, modality_breakdown, vertex_key, timeseries_key, ai_feedback=ai_feedback, parent_job_id=parent_job_id, content_group_id=content_group_id)
```

Where `content_group_id` is resolved earlier in the task:

After the task signature, before stage 1, add:

```python
    # Resolve content_group_id from parent or generate new
    content_group_id = None
    if parent_job_id:
        raw_parent_status = _get_redis().get(f"neuropeer:result:{parent_job_id}")
        if raw_parent_status:
            parent_data = json.loads(raw_parent_status)
            content_group_id = parent_data.get("content_group_id")
    if not content_group_id:
        content_group_id = str(uuid.uuid4())
```

And add `import uuid` at the top of the file if not already present.

Also include `content_group_id` in the result dict:
```python
            "content_group_id": content_group_id,
```

- [ ] **Step 6: Commit**

```bash
git add backend/worker/tasks.py
git commit -m "feat: integrate AI feedback generation and linked runs into pipeline"
```

---

## Task 6: Update analyze route to accept parent_job_id

**Files:**
- Modify: `backend/api/routes/analyze.py`

- [ ] **Step 1: Pass parent_job_id to Celery task**

Replace the full file content:

```python
"""POST /api/v1/analyze — submit a video URL for neural analysis."""

from __future__ import annotations

import uuid

from fastapi import APIRouter

from backend.models.schemas import AnalyzeRequest, JobCreatedResponse, JobStatus
from backend.worker.tasks import run_analysis

router = APIRouter(tags=["Analysis"])


@router.post("/analyze", response_model=JobCreatedResponse)
async def submit_analysis(request: AnalyzeRequest) -> JobCreatedResponse:
    job_id = str(uuid.uuid4())

    # Dispatch to Celery worker (non-blocking)
    run_analysis.apply_async(
        args=[job_id, request.url, request.content_type.value],
        kwargs={"parent_job_id": str(request.parent_job_id) if request.parent_job_id else None},
        task_id=job_id,
    )

    return JobCreatedResponse(
        job_id=uuid.UUID(job_id),
        websocket_url=f"/ws/job/{job_id}",
        status=JobStatus.queued,
        parent_job_id=request.parent_job_id,
    )
```

- [ ] **Step 2: Commit**

```bash
git add backend/api/routes/analyze.py
git commit -m "feat: pass parent_job_id through analyze route to Celery"
```

---

## Task 7: Add run history endpoint

**Files:**
- Modify: `backend/api/routes/results.py`

- [ ] **Step 1: Add history endpoint**

Add this new route at the end of `backend/api/routes/results.py`, before the `get_status` function:

```python
@router.get("/results/{job_id}/history")
async def get_run_history(job_id: UUID) -> dict:
    """Get all runs in the same content group as this job."""
    from sqlalchemy import select
    from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

    from backend.models.db import Job, Result

    engine = create_async_engine(settings.database_url)
    Session = async_sessionmaker(engine, expire_on_commit=False)

    async with Session() as session:
        # Find the content_group_id for this job
        stmt = select(Job).where(Job.id == job_id)
        job = (await session.execute(stmt)).scalar_one_or_none()
        if not job:
            await engine.dispose()
            raise HTTPException(status_code=404, detail="Job not found")

        group_id = job.content_group_id

        # Fetch all jobs in the same group
        stmt = (
            select(Job, Result.neural_score_total)
            .outerjoin(Result, Result.job_id == Job.id)
            .where(Job.content_group_id == group_id)
            .order_by(Job.created_at.asc())
        )
        rows = (await session.execute(stmt)).all()

    await engine.dispose()

    runs = []
    for row_job, score in rows:
        runs.append({
            "job_id": str(row_job.id),
            "url": row_job.url,
            "neural_score": round(score) if score else 0,
            "created_at": row_job.created_at.isoformat() if row_job.created_at else "",
            "parent_job_id": str(row_job.parent_job_id) if row_job.parent_job_id else None,
            "is_current": str(row_job.id) == str(job_id),
        })

    return {
        "content_group_id": str(group_id),
        "runs": runs,
    }
```

- [ ] **Step 2: Commit**

```bash
git add backend/api/routes/results.py
git commit -m "feat: add run history endpoint for linked runs"
```

---

## Task 8: Update frontend types

**Files:**
- Modify: `frontend/lib/types.ts`

- [ ] **Step 1: Add AI feedback and linked run fields to AnalysisResult**

In `frontend/lib/types.ts`, replace the `AnalysisResult` interface:

```typescript
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
```

- [ ] **Step 2: Commit**

```bash
git add frontend/lib/types.ts
git commit -m "feat: add AI feedback and linked run types"
```

---

## Task 9: Update frontend API client

**Files:**
- Modify: `frontend/lib/api.ts`

- [ ] **Step 1: Update submitAnalysis to accept parentJobId**

Replace the `submitAnalysis` function:

```typescript
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
```

- [ ] **Step 2: Add getRunHistory function**

Add after the `exportReport` function:

```typescript
export async function getRunHistory(
  jobId: string
): Promise<{ content_group_id: string; runs: import("./types").RunHistoryEntry[] }> {
  const res = await fetch(`${API_BASE}/api/v1/results/${jobId}/history`);
  if (!res.ok) return { content_group_id: "", runs: [] };
  return res.json();
}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/lib/api.ts
git commit -m "feat: add parentJobId to submitAnalysis and getRunHistory API"
```

---

## Task 10: Update analyze page — remove GLM fetch, add re-analyze + version history

**Files:**
- Modify: `frontend/app/analyze/[jobId]/page.tsx`

- [ ] **Step 1: Remove AI feedback fetching logic**

Find and remove the `aiFeedback` state, `aiLoading` state, and the `useEffect` that calls `/api/generate-feedback`. Replace with direct reads from `result`:

Remove these state declarations:
```typescript
const [aiFeedback, setAiFeedback] = useState<...>(null);
const [aiLoading, setAiLoading] = useState(false);
```

Remove the entire `useEffect` block that fetches from `/api/generate-feedback`.

- [ ] **Step 2: Update ImprovementStrategies props**

Replace the `<ImprovementStrategies>` usage. Instead of passing `aiFeedback?.summary` etc., pass directly from `result`:

```typescript
<ImprovementStrategies
  metrics={result.metrics}
  overarchingSummary={result.ai_summary ?? result.overarching_summary}
  aiPriorities={result.ai_priorities}
  aiMetricTips={result.ai_metric_tips}
  aiCategoryStrategies={result.ai_category_strategies}
  aiLoading={false}
/>
```

- [ ] **Step 3: Add re-analyze state and imports**

Add to the top of the component:

```typescript
const [showReanalyze, setShowReanalyze] = useState(false);
const [reanalyzeUrl, setReanalyzeUrl] = useState("");
const [reanalyzeLoading, setReanalyzeLoading] = useState(false);
const [runHistory, setRunHistory] = useState<import("@/lib/types").RunHistoryEntry[]>([]);
```

Add `getRunHistory` to the api import.

- [ ] **Step 4: Fetch run history on load**

Add a `useEffect` after the data fetching section:

```typescript
useEffect(() => {
  if (!result) return;
  getRunHistory(result.job_id).then((data) => {
    if (data.runs.length > 1) setRunHistory(data.runs);
  }).catch(() => {});
}, [result]);
```

- [ ] **Step 5: Add re-analyze handler**

```typescript
const handleReanalyze = async (url?: string) => {
  setReanalyzeLoading(true);
  try {
    const targetUrl = url || result!.url;
    const contentType = result!.content_type;
    const { job_id } = await submitAnalysis(targetUrl, contentType, result!.job_id);
    window.location.href = `/analyze/${job_id}`;
  } catch (e) {
    setError(e instanceof Error ? e.message : "Re-analysis failed");
  } finally {
    setReanalyzeLoading(false);
    setShowReanalyze(false);
  }
};
```

- [ ] **Step 6: Add Re-analyze button to header**

In the header action buttons area (near Export/Share), add:

```tsx
<Button
  variant="outline"
  size="sm"
  onClick={() => setShowReanalyze(true)}
>
  <RotateCcw className="w-3.5 h-3.5" />
  Re-analyze
</Button>
```

Add `RotateCcw` to the lucide-react imports.

- [ ] **Step 7: Add Re-analyze modal**

After the header, add:

```tsx
{showReanalyze && (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
    <div className="glass-card p-6 max-w-md w-full mx-4 space-y-4">
      <h3 className="text-lg font-semibold text-white">Re-analyze</h3>
      <p className="text-sm text-white/40">Run a new analysis linked to this report to track improvement.</p>

      <Button
        className="w-full"
        onClick={() => handleReanalyze()}
        disabled={reanalyzeLoading}
      >
        {reanalyzeLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
        Re-run same video
      </Button>

      <div className="relative">
        <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-white/[0.06]" /></div>
        <div className="relative flex justify-center"><span className="px-3 text-[10px] text-white/20 uppercase tracking-wider" style={{ background: "var(--background)" }}>or</span></div>
      </div>

      <div className="flex gap-2">
        <input
          type="text"
          placeholder="Paste new video URL…"
          value={reanalyzeUrl}
          onChange={(e) => setReanalyzeUrl(e.target.value)}
          className="flex-1 px-3 py-2 rounded-lg bg-white/[0.04] border border-white/[0.08] text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-brand-500/50"
        />
        <Button
          size="sm"
          disabled={!reanalyzeUrl || reanalyzeLoading}
          onClick={() => handleReanalyze(reanalyzeUrl)}
        >
          Analyze
        </Button>
      </div>

      <button onClick={() => setShowReanalyze(false)} className="w-full text-xs text-white/30 hover:text-white/50 transition-colors pt-2">
        Cancel
      </button>
    </div>
  </div>
)}
```

- [ ] **Step 8: Add delta banner when parent exists**

After the header section, before the main content grid, add:

```tsx
{result.parent_job_id && runHistory.length > 0 && (() => {
  const parentRun = runHistory.find(r => r.job_id === result.parent_job_id);
  if (!parentRun) return null;
  const delta = result.neural_score.total - parentRun.neural_score;
  const sign = delta >= 0 ? "+" : "";
  const color = delta > 0 ? "text-emerald-400" : delta < 0 ? "text-red-400" : "text-white/40";
  return (
    <div className="glass-card !rounded-xl px-4 py-3 mb-6 flex items-center justify-between animate-fade-up">
      <div className="flex items-center gap-3">
        <RotateCcw className="w-4 h-4 text-brand-400" />
        <span className="text-sm text-white/50">
          vs previous run: <span className="text-white/70 font-medium">{parentRun.neural_score}</span> →{" "}
          <span className="text-white/70 font-medium">{Math.round(result.neural_score.total)}</span>
        </span>
        <span className={`text-sm font-bold tabular-nums ${color}`}>{sign}{Math.round(delta)}</span>
      </div>
      <Link href={`/analyze/${result.parent_job_id}`} className="text-xs text-brand-400 hover:text-brand-300 transition-colors">
        View previous →
      </Link>
    </div>
  );
})()}
```

- [ ] **Step 9: Add version history panel**

After the Improvement Strategies section and before the footer, add:

```tsx
{runHistory.length > 1 && (
  <Card className="animate-fade-up delay-600">
    <div className="flex items-center gap-2 mb-4">
      <GitCompare className="w-4 h-4 text-teal-400" />
      <h2 className="text-sm font-medium text-white/50 uppercase tracking-wider">Version History</h2>
    </div>
    <div className="space-y-2">
      {runHistory.map((run, i) => {
        const prev = i > 0 ? runHistory[i - 1] : null;
        const delta = prev ? run.neural_score - prev.neural_score : 0;
        const sign = delta >= 0 ? "+" : "";
        return (
          <Link
            key={run.job_id}
            href={`/analyze/${run.job_id}`}
            className={`flex items-center justify-between px-3 py-2 rounded-lg transition-colors ${
              run.is_current ? "bg-brand-500/10 border border-brand-500/20" : "hover:bg-white/[0.04]"
            }`}
          >
            <div className="flex items-center gap-3">
              <span className="w-6 h-6 rounded-full bg-white/[0.06] flex items-center justify-center text-[10px] text-white/40 font-bold">
                v{i + 1}
              </span>
              <div>
                <span className="text-xs text-white/50 truncate max-w-[200px] block">
                  {run.url.replace(/https?:\/\/(www\.)?/, "").slice(0, 40)}
                </span>
                <span className="text-[10px] text-white/25">
                  {new Date(run.created_at).toLocaleDateString()}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold tabular-nums" style={{
                color: run.neural_score >= 75 ? "var(--color-score-green)" : run.neural_score >= 50 ? "var(--color-score-amber)" : "var(--color-score-red)"
              }}>
                {run.neural_score}
              </span>
              {prev && delta !== 0 && (
                <span className={`text-[10px] font-bold tabular-nums ${delta > 0 ? "text-emerald-400" : "text-red-400"}`}>
                  {sign}{Math.round(delta)}
                </span>
              )}
            </div>
          </Link>
        );
      })}
    </div>
  </Card>
)}
```

- [ ] **Step 10: Commit**

```bash
git add frontend/app/analyze/[jobId]/page.tsx
git commit -m "feat: persistent AI feedback, re-analyze flow, and version history"
```

---

## Task 11: Delete frontend OpenRouter code

**Files:**
- Delete: `frontend/app/api/generate-feedback/route.ts`
- Delete: `frontend/lib/glm.ts`
- Delete: `frontend/lib/feedback-prompts.ts`

- [ ] **Step 1: Delete the files**

```bash
rm frontend/app/api/generate-feedback/route.ts
rm frontend/lib/glm.ts
rm frontend/lib/feedback-prompts.ts
# Remove parent dir if empty
rmdir frontend/app/api/generate-feedback 2>/dev/null || true
```

- [ ] **Step 2: Commit**

```bash
git add -A
git commit -m "chore: remove frontend OpenRouter code — AI feedback now in backend pipeline"
```

---

## Task 12: Update demo results for offline/demo mode

**Files:**
- Modify: `frontend/lib/demo-results.ts`

- [ ] **Step 1: Add AI feedback fields to demo data**

In `frontend/lib/demo-results.ts`, add to the `INSTAGRAM_REEL` object after `overarching_summary`:

```typescript
  ai_summary: "This Instagram Reel scores 72/100 — strong visual hook (84) and aesthetic quality (78) are standout strengths, but sustained attention (68) and memory encoding (61) need work. Priority fix: add a pattern interrupt between 40–48s to prevent the critical drop-off.",
  ai_report_title: "Visual Punch, Fading Memory",
  ai_action_items: [
    "Add a visual pattern interrupt at the 40-second mark",
    "Reinforce the key message near the 32s emotional peak",
    "Move CTA earlier to a higher-attention window"
  ],
  ai_priorities: [
    "TOP: Fix the pacing drop at 48s — the dorsal attention network disengages when visual novelty stalls. Add a scene change, text overlay, or audio shift between 40–48s.",
    "SECOND: Strengthen memory encoding — the hippocampal activation is moderate (61). Repeat the core message near the emotional peak at 32s for dual-coding reinforcement.",
    "THIRD: Reposition the CTA — it currently lands during a low-attention window. Move it to 50–55s where arousal recovers."
  ],
  ai_category_strategies: {
    "Attention & Hook": {
      score_context: "Strong opening (84) but mid-content drop-off at 48s.",
      strategies: [
        "The V1 cortex response peaks in the first 3 seconds. Maintain this by introducing a second visual hook at the 20s mark.",
        "Add pattern interrupts every 15–20s to re-engage the dorsal attention network."
      ]
    },
    "Emotional Engagement": {
      score_context: "Good emotional arc (75) with peak at 32s.",
      strategies: [
        "The amygdala activation peaks at 32s — anchor your key brand message here for maximum emotional association.",
        "Add subtle facial close-ups during emotional peaks to activate the fusiform face area."
      ]
    },
    "Memory & Recall": {
      score_context: "Moderate encoding (61) — high risk of forgetting.",
      strategies: [
        "Hippocampal encoding improves with repetition. Echo the core message at least twice across different modalities (visual + text).",
        "End with a distinctive audio/visual signature to create a memory anchor."
      ]
    },
    "Production Quality": {
      score_context: "Strong aesthetics (78) and audio-visual sync (82).",
      strategies: [
        "Maintain the current color grading quality — the fusiform cortex responds well to consistent palettes.",
        "The audio-visual sync is a strength. Consider adding beat-synced text overlays to reinforce timing."
      ]
    }
  },
  ai_metric_tips: {
    "Novelty Response": "The hippocampus/ACC novelty circuit shows declining activation. Introduce an unexpected visual element mid-content.",
    "CTA Effectiveness": "Motor planning areas (SMA) show weak activation during your CTA. Make the action physically intuitive — swipe, tap, or click cues.",
    "Language Processing": "Wernicke's area shows moderate engagement. Simplify spoken language or add on-screen text reinforcement."
  },
  content_group_id: "demo-instagram-group",
```

Do the same for `YOUTUBE_PREROLL` with appropriate content.

- [ ] **Step 2: Commit**

```bash
git add frontend/lib/demo-results.ts
git commit -m "feat: add AI feedback fields to demo results"
```

---

## Task 13: Build and verify

- [ ] **Step 1: Install httpx in backend**

```bash
cd backend && pip install httpx && echo "httpx" >> requirements.txt
```

- [ ] **Step 2: Build frontend**

```bash
cd frontend && npx next build
```

Fix any TypeScript errors.

- [ ] **Step 3: Final commit**

```bash
git add -A
git commit -m "feat: persistent reports and linked runs — complete implementation"
```

- [ ] **Step 4: Deploy frontend**

```bash
cd frontend && npx vercel --prod --yes
```
