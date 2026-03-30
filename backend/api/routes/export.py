"""POST /api/v1/results/{job_id}/export — export PDF report."""

from __future__ import annotations

import json
from uuid import UUID

import redis.asyncio as aioredis
from fastapi import APIRouter, HTTPException

from backend.config import settings

router = APIRouter(tags=["Export"])


async def _get_redis() -> aioredis.Redis:
    return aioredis.from_url(settings.redis_url, decode_responses=True)


@router.post("/results/{job_id}/export")
async def export_report(job_id: UUID, format: str = "pdf") -> dict:
    """
    Generate a downloadable PDF or JSON report for a completed analysis.
    Returns a download URL (S3 pre-signed URL or data URL).
    """
    r = await _get_redis()
    raw = await r.get(f"neuropeer:result:{str(job_id)}")
    if not raw:
        raise HTTPException(status_code=404, detail="Results not found")

    result = json.loads(raw)

    if format == "json":
        # Return the raw JSON result directly
        return {"download_url": None, "data": result, "format": "json"}

    if format == "pdf":
        # Build minimal PDF report using reportlab (or weasyprint if available)
        pdf_bytes = _generate_pdf(result)
        s3_key = f"reports/{job_id}/report.pdf"

        import boto3

        s3 = boto3.client(
            "s3",
            endpoint_url=settings.s3_endpoint_url or None,
            aws_access_key_id=settings.aws_access_key_id or None,
            aws_secret_access_key=settings.aws_secret_access_key or None,
            region_name=settings.aws_region,
        )
        s3.put_object(Bucket=settings.s3_bucket, Key=s3_key, Body=pdf_bytes, ContentType="application/pdf")
        download_url = s3.generate_presigned_url(
            "get_object",
            Params={"Bucket": settings.s3_bucket, "Key": s3_key},
            ExpiresIn=3600,
        )
        return {"download_url": download_url, "format": "pdf"}

    raise HTTPException(status_code=400, detail=f"Unsupported format: {format}. Use 'pdf' or 'json'.")


def _generate_pdf(result: dict) -> bytes:
    """Generate a minimal PDF report from analysis results."""
    try:
        import io

        from reportlab.lib import colors
        from reportlab.lib.pagesizes import letter
        from reportlab.lib.styles import getSampleStyleSheet
        from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

        buf = io.BytesIO()
        doc = SimpleDocTemplate(buf, pagesize=letter)
        styles = getSampleStyleSheet()
        story = []

        # Title
        story.append(Paragraph("NeuroPeer Neural Analysis Report", styles["Title"]))
        story.append(Paragraph(f"URL: {result.get('url', 'N/A')}", styles["Normal"]))
        story.append(Spacer(1, 12))

        # Neural Score
        ns = result.get("neural_score", {})
        story.append(Paragraph(f"Neural Score: {ns.get('total', 0):.0f} / 100", styles["Heading1"]))
        story.append(Spacer(1, 8))

        # Score breakdown table
        breakdown_data = [["Dimension", "Score"]]
        breakdown_data += [
            ["Hook Score", f"{ns.get('hook_score', 0):.0f}"],
            ["Sustained Attention", f"{ns.get('sustained_attention', 0):.0f}"],
            ["Emotional Resonance", f"{ns.get('emotional_resonance', 0):.0f}"],
            ["Memory Encoding", f"{ns.get('memory_encoding', 0):.0f}"],
            ["Aesthetic Quality", f"{ns.get('aesthetic_quality', 0):.0f}"],
            ["Cognitive Accessibility", f"{ns.get('cognitive_accessibility', 0):.0f}"],
        ]
        t = Table(breakdown_data, colWidths=[300, 100])
        t.setStyle(
            TableStyle(
                [
                    ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#6366f1")),
                    ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                    ("GRID", (0, 0), (-1, -1), 0.5, colors.grey),
                    ("FONTSIZE", (0, 0), (-1, -1), 10),
                    ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f1f5f9")]),
                ]
            )
        )
        story.append(t)
        story.append(Spacer(1, 12))

        # All metrics
        story.append(Paragraph("All Metrics", styles["Heading2"]))
        metrics_data = [["Metric", "Score", "GTM Proxy"]]
        for m in result.get("metrics", []):
            metrics_data.append([m["name"], f"{m['score']:.0f}", m["gtm_proxy"]])

        mt = Table(metrics_data, colWidths=[150, 60, 240])
        mt.setStyle(
            TableStyle(
                [
                    ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#0f172a")),
                    ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                    ("GRID", (0, 0), (-1, -1), 0.5, colors.grey),
                    ("FONTSIZE", (0, 0), (-1, -1), 8),
                    ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f8fafc")]),
                ]
            )
        )
        story.append(mt)

        doc.build(story)
        return buf.getvalue()

    except ImportError:
        # Fallback: return a JSON report as bytes if reportlab not installed
        import json

        return json.dumps(result, indent=2).encode("utf-8")
