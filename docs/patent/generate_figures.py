"""
Generate USPTO-compliant patent figures as black-and-white block diagrams.

Patent figure requirements (37 CFR 1.84):
- Black and white only (no color, no grayscale fills)
- Clean block diagram style with boxes, arrows, and reference numerals
- Reference numerals start at 100, increment by 10
- Minimal text inside boxes (short labels only)
- Clear lead lines connecting reference numerals to components
- 300 DPI, saved as PNG
"""

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
from matplotlib.patches import FancyBboxPatch, FancyArrowPatch
from pathlib import Path
import numpy as np

OUTPUT_DIR = Path(__file__).parent / "figures"
OUTPUT_DIR.mkdir(exist_ok=True)

# ── Style constants ───────────────────────────────────────────────────────
DPI = 300
BG_COLOR = "white"
BOX_EDGE = "black"
BOX_FACE = "white"
TEXT_COLOR = "black"
ARROW_COLOR = "black"
FONT_SIZE = 7
SMALL_FONT = 6
TITLE_FONT = 9
REF_FONT = 6.5
LW = 1.0  # line width


def new_fig(width=10, height=8):
    """Create a new figure with patent-standard styling."""
    fig, ax = plt.subplots(1, 1, figsize=(width, height), dpi=DPI)
    fig.patch.set_facecolor(BG_COLOR)
    ax.set_facecolor(BG_COLOR)
    ax.set_xlim(0, 10)
    ax.set_ylim(0, 10)
    ax.axis("off")
    return fig, ax


def draw_box(ax, x, y, w, h, label, ref=None, fontsize=FONT_SIZE, style="round"):
    """Draw a labeled box with optional reference numeral."""
    if style == "diamond":
        cx, cy = x + w / 2, y + h / 2
        hw, hh = w / 2, h / 2
        diamond = plt.Polygon(
            [(cx, cy + hh), (cx + hw, cy), (cx, cy - hh), (cx - hw, cy)],
            closed=True, edgecolor=BOX_EDGE, facecolor=BOX_FACE, linewidth=LW,
        )
        ax.add_patch(diamond)
        ax.text(cx, cy, label, ha="center", va="center",
                fontsize=fontsize, color=TEXT_COLOR, fontweight="normal",
                fontfamily="serif")
        if ref:
            ax.text(cx + hw + 0.15, cy, f"({ref})", ha="left", va="center",
                    fontsize=REF_FONT, color=TEXT_COLOR, fontfamily="serif")
        return cx, cy
    elif style == "round":
        box = FancyBboxPatch(
            (x, y), w, h,
            boxstyle="round,pad=0.1",
            edgecolor=BOX_EDGE, facecolor=BOX_FACE, linewidth=LW,
        )
    else:
        box = FancyBboxPatch(
            (x, y), w, h,
            boxstyle="square,pad=0.05",
            edgecolor=BOX_EDGE, facecolor=BOX_FACE, linewidth=LW,
        )
    ax.add_patch(box)
    cx, cy = x + w / 2, y + h / 2
    ax.text(cx, cy, label, ha="center", va="center",
            fontsize=fontsize, color=TEXT_COLOR, fontweight="normal",
            fontfamily="serif", wrap=True)
    if ref:
        ax.text(x + w + 0.1, cy, f"({ref})", ha="left", va="center",
                fontsize=REF_FONT, color=TEXT_COLOR, fontfamily="serif")
    return cx, cy


def draw_arrow(ax, x1, y1, x2, y2, style="-|>", lw=0.8):
    """Draw an arrow between two points."""
    ax.annotate("", xy=(x2, y2), xytext=(x1, y1),
                arrowprops=dict(arrowstyle=style, color=ARROW_COLOR, lw=lw))


def save_fig(fig, name):
    """Save figure to output directory."""
    path = OUTPUT_DIR / name
    fig.savefig(str(path), dpi=DPI, bbox_inches="tight",
                facecolor=BG_COLOR, edgecolor="none", pad_inches=0.3)
    plt.close(fig)
    print(f"  Generated: {path.name}")
    return path


# ======================================================================
# FIG 1: ORCLE 6-Stream Encoder System Architecture
# ======================================================================
def fig1_system_architecture():
    fig, ax = new_fig(11, 12)
    ax.set_xlim(0, 11)
    ax.set_ylim(0, 12)

    ax.text(5.5, 11.6, "FIG. 1", ha="center", va="center",
            fontsize=TITLE_FONT, fontweight="bold", fontfamily="serif")

    # Row 1: Six input encoders
    encoders = [
        ("Video\nEncoder", "100", 0.3),
        ("Audio\nEncoder", "110", 2.1),
        ("Text\nEncoder", "120", 3.9),
        ("OCR\nPipeline", "130", 5.7),
        ("Long-Context\nEncoder", "140", 7.5),
        ("Multimodal\nReasoning", "150", 9.3),
    ]
    bw, bh = 1.5, 0.8
    y_enc = 10.2
    enc_centers = []
    for label, ref, x in encoders:
        cx, cy = draw_box(ax, x, y_enc, bw, bh, label, ref, fontsize=5.5)
        enc_centers.append((cx, y_enc))

    # Row 2: Per-Stream FFN + Learnable HRF
    y_ffn = 8.8
    ffn_w = 8.5
    ffn_x = 1.25
    draw_box(ax, ffn_x, y_ffn, ffn_w, 0.7, "Per-Stream FFN + Learnable HRF", "160", fontsize=FONT_SIZE)
    ffn_cx = ffn_x + ffn_w / 2

    for cx, _ in enc_centers:
        draw_arrow(ax, cx, y_enc, cx, y_ffn + 0.7)

    # Row 3: Modality Dropout Gate
    y_drop = 7.5
    drop_w = 5.0
    drop_x = 3.0
    draw_box(ax, drop_x, y_drop, drop_w, 0.7, "Modality Dropout Gate (p=0.15)", "170", fontsize=FONT_SIZE)
    drop_cx = drop_x + drop_w / 2
    draw_arrow(ax, ffn_cx, y_ffn, drop_cx, y_drop + 0.7)

    # Row 4: Fusion Transformer
    y_fuse = 6.1
    fuse_w = 5.0
    fuse_x = 3.0
    draw_box(ax, fuse_x, y_fuse, fuse_w, 0.7, "Fusion Transformer (Bidirectional, 2 Hz)", "180", fontsize=FONT_SIZE)
    fuse_cx = fuse_x + fuse_w / 2
    draw_arrow(ax, drop_cx, y_drop, fuse_cx, y_fuse + 0.7)

    # Row 5: Attentive Temporal Pooling
    y_pool = 4.7
    pool_w = 5.0
    pool_x = 3.0
    draw_box(ax, pool_x, y_pool, pool_w, 0.7, "Attentive Temporal Pooling (2 Hz -> 0.671 Hz)", "190", fontsize=FONT_SIZE)
    pool_cx = pool_x + pool_w / 2
    draw_arrow(ax, fuse_cx, y_fuse, pool_cx, y_pool + 0.7)

    # Side input: Demographic Conditioning
    y_demo = 5.0
    demo_x = 0.2
    demo_w = 2.4
    draw_box(ax, demo_x, y_demo, demo_w, 0.6, "Demographic\nConditioning", "200", fontsize=5.5)
    draw_arrow(ax, demo_x + demo_w, y_demo + 0.3, pool_x, y_pool + 0.35)

    # Row 6: Prediction Transformer
    y_pred = 3.3
    pred_w = 5.0
    pred_x = 3.0
    draw_box(ax, pred_x, y_pred, pred_w, 0.7, "Prediction Transformer", "210", fontsize=FONT_SIZE)
    pred_cx = pred_x + pred_w / 2
    draw_arrow(ax, pool_cx, y_pool, pred_cx, y_pred + 0.7)

    # Row 7: Two heads
    y_heads = 1.9
    head_w = 2.2
    gx = 3.2
    draw_box(ax, gx, y_heads, head_w, 0.7, "Group Head", "220", fontsize=FONT_SIZE)
    gcx = gx + head_w / 2
    sx = 5.8
    draw_box(ax, sx, y_heads, head_w, 0.7, "Subject Head", "230", fontsize=FONT_SIZE)
    scx = sx + head_w / 2

    draw_arrow(ax, pred_cx - 0.5, y_pred, gcx, y_heads + 0.7)
    draw_arrow(ax, pred_cx + 0.5, y_pred, scx, y_heads + 0.7)

    # Row 8: Output
    y_out = 0.6
    out_w = 6.0
    out_x = 2.5
    draw_box(ax, out_x, y_out, out_w, 0.7, "Predicted Cortical Activations", "240", fontsize=FONT_SIZE, style="square")
    out_cx = out_x + out_w / 2
    draw_arrow(ax, gcx, y_heads, out_cx - 0.5, y_out + 0.7)
    draw_arrow(ax, scx, y_heads, out_cx + 0.5, y_out + 0.7)

    return save_fig(fig, "FIG_1_system_architecture.png")


# ======================================================================
# FIG 2: Hybrid Deployment Architecture
# ======================================================================
def fig2_hybrid_deployment():
    fig, ax = new_fig(11, 9)
    ax.set_xlim(0, 11)
    ax.set_ylim(0, 9)

    ax.text(5.5, 8.6, "FIG. 2", ha="center", va="center",
            fontsize=TITLE_FONT, fontweight="bold", fontfamily="serif")

    # Left column border: Client Device
    client_border = FancyBboxPatch(
        (0.3, 0.3), 4.5, 7.8,
        boxstyle="round,pad=0.2",
        edgecolor=BOX_EDGE, facecolor=BOX_FACE, linewidth=1.5, linestyle="--",
    )
    ax.add_patch(client_border)
    ax.text(2.55, 7.8, "Client Device", ha="center", fontsize=8,
            fontweight="bold", fontfamily="serif")
    ax.text(2.55, 7.4, "(300)", ha="center", fontsize=REF_FONT, fontfamily="serif")

    draw_box(ax, 0.8, 6.2, 3.5, 0.7, "Video Upload", "310", fontsize=FONT_SIZE)
    draw_box(ax, 0.8, 4.5, 3.5, 0.7, "Local Adapter (WebGPU)", "320", fontsize=FONT_SIZE)
    draw_box(ax, 0.8, 2.8, 3.5, 0.7, "Prediction Output", "330", fontsize=FONT_SIZE)

    draw_arrow(ax, 2.55, 6.2, 2.55, 4.5 + 0.7)
    draw_arrow(ax, 2.55, 4.5, 2.55, 2.8 + 0.7)

    ax.text(2.55, 1.5, "Proprietary IP\nOn-Device", ha="center", fontsize=SMALL_FONT,
            fontfamily="serif", fontstyle="italic")

    # Right column border: Cloud APIs
    cloud_border = FancyBboxPatch(
        (5.8, 0.3), 4.8, 7.8,
        boxstyle="round,pad=0.2",
        edgecolor=BOX_EDGE, facecolor=BOX_FACE, linewidth=1.5, linestyle="--",
    )
    ax.add_patch(cloud_border)
    ax.text(8.2, 7.8, "Cloud APIs (Frozen Extractors)", ha="center", fontsize=8,
            fontweight="bold", fontfamily="serif")
    ax.text(8.2, 7.4, "(340)", ha="center", fontsize=REF_FONT, fontfamily="serif")

    extractors = [
        "Video Encoder (V-JEPA)",
        "Audio Encoder (Wav2Vec)",
        "Text Encoder (LLM 9B)",
        "OCR Pipeline (PaddleOCR)",
        "Long-Context (ModernBERT)",
        "Multimodal Reasoning",
    ]
    y_start = 6.5
    for i, name in enumerate(extractors):
        y = y_start - i * 0.9
        draw_box(ax, 6.2, y, 3.8, 0.6, name, fontsize=5.5, style="square")

    # Arrows from cloud to client
    draw_arrow(ax, 5.8, 5.5, 4.3, 5.0, style="-|>", lw=1.2)
    ax.text(5.05, 5.5, "Feature\nVectors", ha="center", fontsize=SMALL_FONT,
            fontfamily="serif")
    draw_arrow(ax, 5.8, 3.5, 4.3, 4.7, style="-|>", lw=1.2)

    return save_fig(fig, "FIG_2_hybrid_deployment.png")


# ======================================================================
# FIG 3: Neural Metric Engine
# ======================================================================
def fig3_metric_engine():
    fig, ax = new_fig(11, 10)
    ax.set_xlim(0, 11)
    ax.set_ylim(0, 10)

    ax.text(5.5, 9.6, "FIG. 3", ha="center", va="center",
            fontsize=TITLE_FONT, fontweight="bold", fontfamily="serif")

    # Input
    draw_box(ax, 2.5, 8.5, 6.0, 0.7, "Predicted Cortical Activations", "240", fontsize=FONT_SIZE, style="square")
    in_cx = 5.5

    # Atlas ROI Aggregation
    draw_box(ax, 2.0, 6.8, 7.0, 0.8, "Atlas ROI Aggregation (Schaefer 1000-parcel)", "400", fontsize=FONT_SIZE)
    draw_arrow(ax, in_cx, 8.5, in_cx, 6.8 + 0.8)

    # Brain region labels (side annotations)
    regions = ["NAcc", "AIns", "dlPFC", "DMN", "TPJ", "Hippocampus", "Amygdala", "V1-V4"]
    for i, r in enumerate(regions):
        ax.text(10.0, 7.5 - i * 0.18, r, fontsize=4.5, fontfamily="serif", va="center")
    ax.plot([9.0, 9.7], [7.2, 7.2], color=ARROW_COLOR, lw=0.5)

    # Metric Computation
    draw_box(ax, 2.0, 5.0, 7.0, 0.8, "Metric Computation Engine", "410", fontsize=FONT_SIZE)
    draw_arrow(ax, in_cx, 6.8, in_cx, 5.0 + 0.8)

    # Output: 6 key metrics
    metrics = [
        "Hook Score (NAcc - AIns)",
        "Sustained Attention (PFC vs DMN)",
        "Emotional Arousal (Amygdala)",
        "Memory Encoding (Hippocampus)",
        "Social Cognition (mPFC + TPJ)",
        "Cognitive Load (dlPFC)",
    ]
    y_m = 3.8
    for i, m in enumerate(metrics):
        y = y_m - i * 0.5
        draw_box(ax, 2.5, y, 5.5, 0.4, m, fontsize=5.5, style="square")
    draw_arrow(ax, in_cx, 5.0, in_cx, 3.8 + 0.4)

    # Side path: Modality Ablation
    ab_x = 0.2
    draw_box(ax, ab_x, 5.8, 1.6, 0.6, "Modality\nAblation", "420", fontsize=5.5)
    draw_arrow(ax, ab_x + 1.6, 6.1, 2.0, 6.1)

    passes = ["Pass 1: Zero Video", "Pass 2: Zero Audio", "Pass 3: Zero Text", "Pass 4: Zero OCR"]
    for i, p in enumerate(passes):
        ax.text(ab_x + 0.1, 5.4 - i * 0.35, p, fontsize=4.5, fontfamily="serif")

    return save_fig(fig, "FIG_3_metric_engine.png")


# ======================================================================
# FIG 4: Report Generation Pipeline
# ======================================================================
def fig4_report_pipeline():
    fig, ax = new_fig(11, 9)
    ax.set_xlim(0, 11)
    ax.set_ylim(0, 9)

    ax.text(5.5, 8.6, "FIG. 4", ha="center", va="center",
            fontsize=TITLE_FONT, fontweight="bold", fontfamily="serif")

    # Three inputs at top
    draw_box(ax, 0.5, 7.0, 2.8, 0.7, "Neural\nPredictions", "240", fontsize=FONT_SIZE)
    draw_box(ax, 4.1, 7.0, 2.8, 0.7, "Visual Scene\nAnalysis", "500", fontsize=FONT_SIZE)
    draw_box(ax, 7.7, 7.0, 2.8, 0.7, "Screenplay\nContext", "510", fontsize=FONT_SIZE)

    # Neural-Visual Fusion
    draw_box(ax, 2.5, 5.0, 6.0, 0.7, "Neural-Visual Fusion", "520", fontsize=FONT_SIZE)
    fuse_cx = 5.5

    draw_arrow(ax, 1.9, 7.0, 3.5, 5.0 + 0.7)
    draw_arrow(ax, 5.5, 7.0, 5.5, 5.0 + 0.7)
    draw_arrow(ax, 9.1, 7.0, 7.5, 5.0 + 0.7)

    # VLM Prescription Generator
    draw_box(ax, 2.5, 3.2, 6.0, 0.7, "VLM Prescription Generator", "530", fontsize=FONT_SIZE)
    draw_arrow(ax, fuse_cx, 5.0, fuse_cx, 3.2 + 0.7)

    # Output
    draw_box(ax, 1.5, 1.2, 8.0, 0.8, "Timestamp-Specific Editing Prescriptions", "540",
             fontsize=FONT_SIZE, style="square")
    draw_arrow(ax, fuse_cx, 3.2, fuse_cx, 1.2 + 0.8)

    return save_fig(fig, "FIG_4_report_pipeline.png")


# ======================================================================
# FIG 5: Closed-Loop Marketing System
# ======================================================================
def fig5_closed_loop():
    fig, ax = new_fig(11, 10)
    ax.set_xlim(0, 11)
    ax.set_ylim(0, 10)

    ax.text(5.5, 9.6, "FIG. 5", ha="center", va="center",
            fontsize=TITLE_FONT, fontweight="bold", fontfamily="serif")

    # Three inputs at top
    draw_box(ax, 0.5, 8.3, 2.5, 0.7, "Brand KB", "600", fontsize=FONT_SIZE)
    draw_box(ax, 4.0, 8.3, 2.5, 0.7, "ICP Profile", "610", fontsize=FONT_SIZE)
    draw_box(ax, 7.5, 8.3, 2.5, 0.7, "Creative Brief", "620", fontsize=FONT_SIZE)

    # Content Generation
    gen_x, gen_w = 2.5, 6.0
    draw_box(ax, gen_x, 6.8, gen_w, 0.7, "Content Generation", "630", fontsize=FONT_SIZE)
    gen_cx = gen_x + gen_w / 2

    draw_arrow(ax, 1.75, 8.3, 4.0, 6.8 + 0.7)
    draw_arrow(ax, 5.25, 8.3, 5.5, 6.8 + 0.7)
    draw_arrow(ax, 8.75, 8.3, 7.0, 6.8 + 0.7)

    # Neural Scoring
    draw_box(ax, gen_x, 5.3, gen_w, 0.7, "Neural Scoring (ORCLE)", "640", fontsize=FONT_SIZE)
    draw_arrow(ax, gen_cx, 6.8, gen_cx, 5.3 + 0.7)

    # Editing Engine
    draw_box(ax, gen_x, 3.8, gen_w, 0.7, "Editing Engine", "650", fontsize=FONT_SIZE)
    draw_arrow(ax, gen_cx, 5.3, gen_cx, 3.8 + 0.7)

    # Loop arrow from Editing back to Neural Scoring (right side)
    ax.annotate("", xy=(gen_x + gen_w + 0.3, 5.65), xytext=(gen_x + gen_w + 0.3, 4.15),
                arrowprops=dict(arrowstyle="-|>", color=ARROW_COLOR, lw=1.0))
    ax.text(gen_x + gen_w + 0.5, 4.9, "Re-score", fontsize=SMALL_FONT,
            fontfamily="serif", rotation=90, va="center")

    # Decision diamond
    diamond_cx = gen_cx
    draw_box(ax, gen_cx - 1.2, 2.0, 2.4, 1.0, "Score >\nThreshold?", "660",
             fontsize=FONT_SIZE, style="diamond")
    draw_arrow(ax, gen_cx, 3.8, gen_cx, 2.5 + 0.5)

    # Yes arrow to Delivery
    draw_box(ax, gen_x, 0.5, gen_w, 0.7, "Delivery", "670", fontsize=FONT_SIZE, style="square")
    draw_arrow(ax, diamond_cx, 2.0, diamond_cx, 0.5 + 0.7)
    ax.text(diamond_cx + 0.15, 1.5, "Yes", fontsize=SMALL_FONT, fontfamily="serif")

    # No arrow back to loop (left side)
    ax.annotate("", xy=(gen_x - 0.3, 4.15), xytext=(gen_cx - 1.2, 2.5),
                arrowprops=dict(arrowstyle="-|>", color=ARROW_COLOR, lw=1.0,
                                connectionstyle="arc3,rad=0.3"))
    ax.text(gen_x - 0.9, 3.0, "No", fontsize=SMALL_FONT, fontfamily="serif")

    return save_fig(fig, "FIG_5_closed_loop.png")


# ======================================================================
# FIG 6: Dynamic DAG Mutation
# ======================================================================
def fig6_dag_mutation():
    fig, ax = new_fig(11, 9)
    ax.set_xlim(0, 11)
    ax.set_ylim(0, 9)

    ax.text(5.5, 8.6, "FIG. 6", ha="center", va="center",
            fontsize=TITLE_FONT, fontweight="bold", fontfamily="serif")

    # "Before" DAG (top half)
    ax.text(5.5, 7.8, "Before Mutation", ha="center", fontsize=7, fontweight="bold",
            fontfamily="serif")

    nodes_before = [
        ("Gen", 1.0, 7.0),
        ("Compose", 3.0, 7.0),
        ("Score", 5.0, 7.0),
        ("Edit", 7.0, 7.0),
        ("Deliver", 9.0, 7.0),
    ]
    nw, nh = 1.5, 0.55
    for label, x, y in nodes_before:
        draw_box(ax, x, y, nw, nh, label, fontsize=FONT_SIZE, style="square")
    for i in range(len(nodes_before) - 1):
        x1 = nodes_before[i][1] + nw
        y1 = nodes_before[i][2] + nh / 2
        x2 = nodes_before[i + 1][1]
        y2 = nodes_before[i + 1][2] + nh / 2
        draw_arrow(ax, x1, y1, x2, y2)

    # Separator
    ax.plot([0.5, 10.5], [5.8, 5.8], color=BOX_EDGE, lw=0.5, linestyle=":")

    # "After" DAG (bottom half)
    ax.text(5.5, 5.4, "After Mutation", ha="center", fontsize=7, fontweight="bold",
            fontfamily="serif")

    nodes_after = [
        ("Gen", 0.5, 4.2),
        ("Compose", 2.3, 4.2),
        ("Color\nGrade", 4.1, 4.2),
        ("Score", 5.9, 4.2),
        ("Edit", 7.7, 4.2),
        ("Deliver", 9.5, 4.2),
    ]
    for label, x, y in nodes_after:
        ref = "710" if label == "Color\nGrade" else None
        draw_box(ax, x, y, 1.4, nh, label, ref=ref, fontsize=5.5, style="square")
    for i in range(len(nodes_after) - 1):
        x1 = nodes_after[i][1] + 1.4
        y1 = nodes_after[i][2] + nh / 2
        x2 = nodes_after[i + 1][1]
        y2 = nodes_after[i + 1][2] + nh / 2
        draw_arrow(ax, x1, y1, x2, y2)

    # Highlight new node with dashed border
    highlight = FancyBboxPatch(
        (3.95, 4.05), 1.7, 0.9,
        boxstyle="round,pad=0.1",
        edgecolor=BOX_EDGE, facecolor=BOX_FACE, linewidth=1.2, linestyle="--",
    )
    ax.add_patch(highlight)

    # Orchestrator box
    draw_box(ax, 3.5, 2.2, 4.0, 0.6, "Orchestrator", "700", fontsize=FONT_SIZE)
    ax.annotate("", xy=(4.8, 4.05), xytext=(5.5, 2.8),
                arrowprops=dict(arrowstyle="-|>", color=ARROW_COLOR, lw=1.0,
                                linestyle="--"))
    ax.text(5.7, 3.3, "Inserts node", fontsize=SMALL_FONT, fontfamily="serif", fontstyle="italic")

    return save_fig(fig, "FIG_6_dag_mutation.png")


# ======================================================================
# FIG 7: Strategic Sampling Pipeline
# ======================================================================
def fig7_strategic_sampling():
    fig, ax = new_fig(11, 10)
    ax.set_xlim(0, 11)
    ax.set_ylim(0, 10)

    ax.text(5.5, 9.6, "FIG. 7", ha="center", va="center",
            fontsize=TITLE_FONT, fontweight="bold", fontfamily="serif")

    # Film timeline bar
    ax.add_patch(FancyBboxPatch(
        (1.0, 8.5), 9.0, 0.5,
        boxstyle="square,pad=0",
        edgecolor=BOX_EDGE, facecolor="white", linewidth=LW,
    ))
    ax.text(5.5, 8.75, "Film Timeline (120 minutes)", ha="center", va="center",
            fontsize=FONT_SIZE, fontfamily="serif")

    # Scout Pass
    draw_box(ax, 2.5, 7.0, 6.0, 0.7, "Scout Pass (Visual Understanding)", "800", fontsize=FONT_SIZE)
    draw_arrow(ax, 5.5, 8.5, 5.5, 7.0 + 0.7)

    # Interest Scoring
    draw_box(ax, 2.5, 5.3, 6.0, 0.7, "Interest Scoring", "810", fontsize=FONT_SIZE)
    draw_arrow(ax, 5.5, 7.0, 5.5, 5.3 + 0.7)

    # Draw interest score curve with peaks
    xs = np.linspace(1.5, 9.5, 80)
    ys = 4.7 + 0.3 * np.abs(np.sin(xs * 2) * np.sin(xs * 0.7))
    peaks = [2.5, 4.5, 6.0, 7.5, 9.0]
    for p in peaks:
        mask = np.abs(xs - p) < 0.3
        ys[mask] += 0.25
    ax.plot(xs, ys, color=BOX_EDGE, lw=0.8)
    ax.text(10.0, 4.85, "Interest\nScore", fontsize=4.5, fontfamily="serif", va="center")

    # Moment Selection
    draw_box(ax, 2.5, 3.3, 6.0, 0.7, "Moment Selection (Top 50)", "820", fontsize=FONT_SIZE)
    draw_arrow(ax, 5.5, 4.5, 5.5, 3.3 + 0.7)

    for p in peaks:
        ax.plot([p, p], [4.0, 3.3 + 0.7], color=BOX_EDGE, lw=0.5, linestyle=":")

    # Selective Neural Inference
    draw_box(ax, 2.5, 1.8, 6.0, 0.7, "Selective Neural Inference", "830", fontsize=FONT_SIZE)
    draw_arrow(ax, 5.5, 3.3, 5.5, 1.8 + 0.7)

    # Cost comparison callout
    cost_border = FancyBboxPatch(
        (0.3, 0.3), 3.5, 1.2,
        boxstyle="round,pad=0.1",
        edgecolor=BOX_EDGE, facecolor=BOX_FACE, linewidth=0.8, linestyle="--",
    )
    ax.add_patch(cost_border)
    ax.text(2.05, 1.15, "Cost: $9-11/film", fontsize=SMALL_FONT, fontfamily="serif", ha="center")
    ax.text(2.05, 0.8, "vs. $27-42 full analysis", fontsize=SMALL_FONT, fontfamily="serif", ha="center")
    ax.text(2.05, 0.5, "3-4x cost reduction", fontsize=SMALL_FONT, fontfamily="serif",
            ha="center", fontweight="bold")

    return save_fig(fig, "FIG_7_strategic_sampling.png")


# ======================================================================
# FIG 8: Cinema 18-Metric Layout
# ======================================================================
def fig8_cinema_metrics():
    fig, ax = new_fig(11, 10)
    ax.set_xlim(0, 11)
    ax.set_ylim(0, 10)

    ax.text(5.5, 9.6, "FIG. 8", ha="center", va="center",
            fontsize=TITLE_FONT, fontweight="bold", fontfamily="serif")

    clusters = {
        "IMMERSION": [
            ("Narrative Absorption", "DMN + mPFC"),
            ("Pacing Coherence", "DAN"),
            ("Tonal Consistency", "DMN + Amyg"),
        ],
        "EMOTION": [
            ("Emotional Depth", "Amyg + OFC"),
            ("Character Empathy", "mPFC + TPJ"),
            ("Cinematic Frisson", "AIns + ACC"),
        ],
        "COGNITION": [
            ("Cognitive Clarity", "dlPFC + Broca"),
            ("Surprise", "Hippocampus"),
            ("Dialogue Engage.", "Broca + mPFC"),
        ],
        "ATTENTION": [
            ("Attention Grip", "DAN + VAN"),
            ("Visual Spectacle", "V1-V4 + MT"),
            ("Scene Trans. Flow", "TPJ + V1"),
        ],
        "MEMORY": [
            ("Memory Imprint", "Hipp + PHC"),
            ("Opening Hook", "NAcc + AIns"),
            ("Resolution Satis.", "DMN + vmPFC"),
        ],
        "ARC": [
            ("Suspense Arc", "ACC + AIns"),
            ("Climax Impact", "Amyg + DAN"),
            ("Soundtrack Integ.", "A1/STS + Amyg"),
        ],
    }

    cols = 3
    cell_w = 3.2
    cell_h = 3.5
    x_start = 0.5
    y_start = 8.5

    for idx, (cluster, metrics) in enumerate(clusters.items()):
        col = idx % cols
        row = idx // cols
        x = x_start + col * (cell_w + 0.3)
        y = y_start - row * (cell_h + 0.3)

        border = FancyBboxPatch(
            (x, y - cell_h), cell_w, cell_h,
            boxstyle="round,pad=0.08",
            edgecolor=BOX_EDGE, facecolor=BOX_FACE, linewidth=1.0,
        )
        ax.add_patch(border)

        ax.text(x + cell_w / 2, y - 0.2, cluster, ha="center", va="center",
                fontsize=6.5, fontweight="bold", fontfamily="serif")

        for j, (metric, region) in enumerate(metrics):
            my = y - 0.8 - j * 0.85
            draw_box(ax, x + 0.15, my, cell_w - 0.3, 0.35, metric,
                     fontsize=4.8, style="square")
            ax.text(x + cell_w / 2, my - 0.15, region, ha="center", va="center",
                    fontsize=4.0, fontfamily="serif", fontstyle="italic")

    return save_fig(fig, "FIG_8_cinema_metrics.png")


# ======================================================================
# FIG 9: Multimodal KB Single-Table Architecture
# ======================================================================
def fig9_single_table():
    fig, ax = new_fig(11, 9)
    ax.set_xlim(0, 11)
    ax.set_ylim(0, 9)

    ax.text(5.5, 8.6, "FIG. 9", ha="center", va="center",
            fontsize=TITLE_FONT, fontweight="bold", fontfamily="serif")

    # Database table
    table_x, table_y = 1.5, 3.5
    table_w, table_h = 8.0, 3.5

    border = FancyBboxPatch(
        (table_x, table_y), table_w, table_h,
        boxstyle="square,pad=0",
        edgecolor=BOX_EDGE, facecolor=BOX_FACE, linewidth=1.5,
    )
    ax.add_patch(border)

    # Table header row
    ax.add_patch(FancyBboxPatch(
        (table_x, table_y + table_h - 0.6), table_w, 0.6,
        boxstyle="square,pad=0",
        edgecolor=BOX_EDGE, facecolor=BOX_FACE, linewidth=1.0,
    ))
    ax.text(table_x + table_w / 2, table_y + table_h - 0.3,
            "knowledge_chunks (Single Table)", ha="center", va="center",
            fontsize=7, fontweight="bold", fontfamily="serif")

    # Column headers
    col_names = ["id", "content", "text_emb\n(1536D)", "image_emb\n(1152D)", "video_emb\n(512D)", "metadata"]
    col_widths = [0.8, 2.0, 1.3, 1.3, 1.3, 1.3]
    cx = table_x
    header_y = table_y + table_h - 1.2
    for name, cw in zip(col_names, col_widths):
        ax.add_patch(FancyBboxPatch(
            (cx, header_y), cw, 0.6,
            boxstyle="square,pad=0",
            edgecolor=BOX_EDGE, facecolor=BOX_FACE, linewidth=0.5,
        ))
        ax.text(cx + cw / 2, header_y + 0.3, name, ha="center", va="center",
                fontsize=4.5, fontfamily="serif", fontweight="bold")
        cx += cw

    # Sample data rows
    for row in range(2):
        ry = header_y - 0.5 * (row + 1)
        cx = table_x
        for cw in col_widths:
            ax.add_patch(FancyBboxPatch(
                (cx, ry), cw, 0.5,
                boxstyle="square,pad=0",
                edgecolor=BOX_EDGE, facecolor=BOX_FACE, linewidth=0.3,
            ))
            cx += cw

    # HNSW index icons for vector columns
    vec_col_centers = [
        table_x + 0.8 + 2.0 + 1.3 / 2,
        table_x + 0.8 + 2.0 + 1.3 + 1.3 / 2,
        table_x + 0.8 + 2.0 + 1.3 + 1.3 + 1.3 / 2,
    ]
    for vx in vec_col_centers:
        idx_y = table_y - 0.9
        draw_box(ax, vx - 0.55, idx_y, 1.1, 0.6, "HNSW\nIndex", fontsize=4.5, style="round")
        draw_arrow(ax, vx, table_y, vx, idx_y + 0.6)

    # Input arrows from 6 ingestion pipelines
    pipelines = ["Documents", "Video", "Image", "Audio", "URLs", "Cloud\nStorage"]
    for i, name in enumerate(pipelines):
        px = 1.0 + i * 1.65
        draw_box(ax, px, 7.8, 1.3, 0.5, name, fontsize=4.5, style="square")
        draw_arrow(ax, px + 0.65, 7.8, table_x + table_w / 2 + (i - 2.5) * 0.3,
                   table_y + table_h)

    return save_fig(fig, "FIG_9_single_table.png")


# ======================================================================
# FIG 10: Hybrid RRF Search
# ======================================================================
def fig10_hybrid_search():
    fig, ax = new_fig(11, 9)
    ax.set_xlim(0, 11)
    ax.set_ylim(0, 9)

    ax.text(5.5, 8.6, "FIG. 10", ha="center", va="center",
            fontsize=TITLE_FONT, fontweight="bold", fontfamily="serif")

    # Query input
    draw_box(ax, 3.5, 7.5, 4.0, 0.7, "Query Input", fontsize=FONT_SIZE, style="square")
    qcx = 5.5

    # Path A: Dense Vector Search
    draw_box(ax, 1.0, 5.5, 3.5, 0.7, "Dense Vector Search\n(HNSW Cosine)", "900", fontsize=6)
    draw_arrow(ax, qcx - 1.0, 7.5, 2.75, 5.5 + 0.7)

    # Path B: BM25
    draw_box(ax, 6.5, 5.5, 3.5, 0.7, "BM25 Full-Text Search\n(tsvector)", "910", fontsize=6)
    draw_arrow(ax, qcx + 1.0, 7.5, 8.25, 5.5 + 0.7)

    # RRF Fusion
    draw_box(ax, 2.5, 3.3, 6.0, 0.8, "Reciprocal Rank Fusion (RRF)", "920", fontsize=FONT_SIZE)
    rrf_cx = 5.5
    draw_arrow(ax, 2.75, 5.5, 4.5, 3.3 + 0.8)
    draw_arrow(ax, 8.25, 5.5, 6.5, 3.3 + 0.8)

    # Weight annotations
    ax.text(1.5, 4.7, "Weight: 0.7", fontsize=SMALL_FONT, fontfamily="serif", fontstyle="italic")
    ax.text(8.0, 4.7, "Weight: 0.3", fontsize=SMALL_FONT, fontfamily="serif", fontstyle="italic")

    # Output
    draw_box(ax, 2.5, 1.3, 6.0, 0.7, "Ranked Results", "930", fontsize=FONT_SIZE, style="square")
    draw_arrow(ax, rrf_cx, 3.3, rrf_cx, 1.3 + 0.7)

    ax.text(rrf_cx, 0.5, "62% -> 84% retrieval precision", ha="center",
            fontsize=SMALL_FONT, fontfamily="serif", fontweight="bold")

    return save_fig(fig, "FIG_10_hybrid_search.png")


# ======================================================================
# Main
# ======================================================================
def main():
    print("Generating patent figures...\n")

    fig1_system_architecture()
    fig2_hybrid_deployment()
    fig3_metric_engine()
    fig4_report_pipeline()
    fig5_closed_loop()
    fig6_dag_mutation()
    fig7_strategic_sampling()
    fig8_cinema_metrics()
    fig9_single_table()
    fig10_hybrid_search()

    print(f"\nAll figures saved to: {OUTPUT_DIR}/")


if __name__ == "__main__":
    main()
