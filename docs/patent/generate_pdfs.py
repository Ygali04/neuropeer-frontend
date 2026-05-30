"""
Generate USPTO-compliant provisional patent application PDFs with embedded figures.

Format per 37 CFR 1.52 and 37 CFR 1.77(b):
- US Letter (8.5" x 11")
- Margins: top 0.75", left 1", right 0.75", bottom 0.75"
- Font: Times Roman 12pt
- Line spacing: 1.5x
- Paragraph numbers: [0001] bold at start of each paragraph
- Page numbers centered at bottom
- Claims on new page, numbered consecutively
- Abstract on separate page, single paragraph
- Figures on separate pages with "FIG. X" header and "Sheet X of Y" numbering
"""

import re
from pathlib import Path

from fpdf import FPDF

# ── Constants ─────────────────────────────────────────────────────────────
MARGIN_LEFT = 25.4  # 1 inch in mm
MARGIN_RIGHT = 19.05  # 0.75 inch
MARGIN_TOP = 19.05  # 0.75 inch
MARGIN_BOTTOM = 19.05
PAGE_W = 215.9  # US Letter width mm
PAGE_H = 279.4  # US Letter height mm
CONTENT_W = PAGE_W - MARGIN_LEFT - MARGIN_RIGHT
FONT_SIZE = 12
LINE_H = FONT_SIZE * 0.3528 * 1.5  # 12pt * mm/pt * 1.5 spacing

FIGURES_DIR = Path(__file__).parent / "figures"

# ── Figure-to-patent mapping ─────────────────────────────────────────────
# Which figures belong to which provisional application
FIGURE_MAP = {
    "provisional-1": [
        ("FIG_1_system_architecture.png", "FIG. 1",
         "System architecture of the ORCLE six-stream neural encoder, "
         "showing Video Encoder (100), Audio Encoder (110), Text Encoder (120), "
         "OCR Pipeline (130), Long-Context Encoder (140), Multimodal Reasoning (150), "
         "Per-Stream FFN with Learnable HRF (160), Modality Dropout Gate (170), "
         "Fusion Transformer (180), Attentive Temporal Pooling (190), "
         "Demographic Conditioning (200), Prediction Transformer (210), "
         "Group Head (220), Subject Head (230), and Predicted Cortical Activations (240)."),
        ("FIG_2_hybrid_deployment.png", "FIG. 2",
         "Hybrid deployment architecture showing Client Device (300) with "
         "Video Upload (310), Local Adapter via WebGPU (320), and Prediction Output (330), "
         "alongside Cloud APIs (340) providing frozen feature extraction. "
         "Proprietary prediction weights remain on-device while leveraging cloud compute for feature extraction."),
        ("FIG_3_metric_engine.png", "FIG. 3",
         "Neural metric derivation engine showing Predicted Cortical Activations (240) "
         "flowing through Atlas ROI Aggregation (400) and Metric Computation Engine (410) "
         "to produce content effectiveness metrics. Side path shows Modality Ablation (420) "
         "with four zero-out passes for contribution quantification."),
        ("FIG_4_report_pipeline.png", "FIG. 4",
         "Report generation pipeline showing convergence of Neural Predictions (240), "
         "Visual Scene Analysis (500), and Screenplay Context (510) through "
         "Neural-Visual Fusion (520) and VLM Prescription Generator (530) to produce "
         "Timestamp-Specific Editing Prescriptions (540)."),
    ],
    "provisional-2a": [
        ("FIG_5_closed_loop.png", "FIG. 5",
         "Closed-loop marketing optimization system showing Brand KB (600), "
         "ICP Profile (610), and Creative Brief (620) inputs flowing through "
         "Content Generation (630), Neural Scoring via ORCLE (640), "
         "Editing Engine (650), decision threshold (660), and Delivery (670). "
         "Feedback loop re-scores after each edit cycle."),
        ("FIG_6_dag_mutation.png", "FIG. 6",
         "Dynamic graph mutation showing an Orchestrator (700) inserting a new "
         "Color Grade node (710) into the processing pipeline mid-execution based on "
         "neural scoring results. Before and after states of the directed acyclic graph are shown."),
    ],
    "provisional-2b": [
        ("FIG_7_strategic_sampling.png", "FIG. 7",
         "Strategic sampling pipeline for long-form content showing film timeline, "
         "Scout Pass (800), Interest Scoring (810) with peak visualization, "
         "Moment Selection of top 50 moments (820), and Selective Neural Inference (830). "
         "Cost comparison: $9-11 per film versus $27-42 for full analysis."),
        ("FIG_8_cinema_metrics.png", "FIG. 8",
         "Cinema 18-metric layout organized into six clusters: Immersion "
         "(Narrative Absorption, Pacing Coherence, Tonal Consistency), "
         "Emotion (Emotional Depth, Character Empathy, Cinematic Frisson), "
         "Cognition (Cognitive Clarity, Surprise, Dialogue Engagement), "
         "Attention (Attention Grip, Visual Spectacle, Scene Transition Flow), "
         "Memory (Memory Imprint, Opening Hook, Resolution Satisfaction), "
         "and Arc (Suspense Arc, Climax Impact, Soundtrack Integration). "
         "Each metric is mapped to specific brain regions."),
    ],
    "provisional-3": [
        ("FIG_9_single_table.png", "FIG. 9",
         "Multimodal knowledge base single-table architecture showing a unified "
         "database table with columns for content, text embedding (1536D), "
         "image embedding (1152D), and video embedding (512D), each with independent "
         "HNSW vector indexes. Six ingestion pipelines feed the table."),
        ("FIG_10_hybrid_search.png", "FIG. 10",
         "Hybrid RRF search architecture showing query input splitting into "
         "Dense Vector Search via HNSW cosine (900) and BM25 Full-Text Search (910), "
         "converging at Reciprocal Rank Fusion (920) with weights 0.7/0.3, "
         "producing Ranked Results (930). Precision improves from 62%% to 84%%."),
    ],
}


class PatentPDF(FPDF):
    def __init__(self, title: str, applicant: str, inventors: str):
        super().__init__(orientation="P", unit="mm", format="letter")
        self.patent_title = title
        self.applicant = applicant
        self.inventors = inventors
        self.para_num = 0
        self.fig_sheet = 0
        self.fig_total = 0
        self.in_figures = False
        self.set_auto_page_break(auto=True, margin=MARGIN_BOTTOM + 5)

    def header(self):
        pass

    def footer(self):
        self.set_y(-MARGIN_BOTTOM)
        self.set_font("Times", "", 10)
        self.set_text_color(0, 0, 0)
        if self.in_figures and self.fig_sheet > 0:
            self.cell(0, 5, f"Sheet {self.fig_sheet} of {self.fig_total}", align="C")
        else:
            self.cell(0, 5, f"- {self.page_no()} -", align="C")

    def add_cover_sheet(self):
        self.add_page()
        self.set_margins(MARGIN_LEFT, MARGIN_TOP, MARGIN_RIGHT)
        y = MARGIN_TOP + 10

        self.set_font("Times", "B", 14)
        self.set_xy(MARGIN_LEFT, y)
        self.cell(CONTENT_W, 8, "PROVISIONAL APPLICATION FOR PATENT", align="C")
        y += 12

        self.set_font("Times", "B", 12)
        self.set_xy(MARGIN_LEFT, y)
        self.cell(CONTENT_W, 8, "COVER SHEET", align="C")
        y += 15

        fields = [
            ("Application Type:", "Provisional Application under 35 U.S.C. Section 111(b)"),
            ("Title of Invention:", self.patent_title),
            ("Applicant:", self.applicant),
            ("Inventor(s):", self.inventors),
            ("Correspondence Address:", "[TO BE PROVIDED BY ATTORNEY]"),
            ("Attorney Docket No.:", "[TO BE ASSIGNED]"),
            ("Filing Date:", "[TO BE FILED]"),
        ]

        self.set_font("Times", "", 12)
        for label, value in fields:
            self.set_xy(MARGIN_LEFT, y)
            self.set_font("Times", "B", 12)
            self.cell(55, LINE_H, label)
            self.set_font("Times", "", 12)
            lines = self.multi_cell(CONTENT_W - 55, LINE_H, value, dry_run=True, output="LINES")
            self.set_xy(MARGIN_LEFT + 55, y)
            self.multi_cell(CONTENT_W - 55, LINE_H, value)
            y += max(len(lines), 1) * LINE_H + 3

        y += 10
        self.set_xy(MARGIN_LEFT, y)
        self.set_font("Times", "B", 12)
        self.cell(CONTENT_W, LINE_H, "Entity Status: [ ] Large  [ ] Small  [X] Micro")
        y += LINE_H * 2

        self.set_xy(MARGIN_LEFT, y)
        self.set_font("Times", "", 11)
        self.multi_cell(
            CONTENT_W, LINE_H,
            "This application is accompanied by a specification as required by "
            "35 U.S.C. Section 112(a). Claims, abstract, and drawings are included "
            "as recommended best practice but are not required for provisional applications."
        )

    def section_heading(self, title: str):
        self.ln(LINE_H)
        self.set_font("Times", "B", 12)
        self.cell(CONTENT_W, LINE_H, title.upper(), align="C")
        self.ln(LINE_H)

    def sub_heading(self, title: str):
        self.ln(LINE_H * 0.5)
        self.set_font("Times", "B", 12)
        self.cell(CONTENT_W, LINE_H, title)
        self.ln(LINE_H)

    def numbered_paragraph(self, text: str):
        self.para_num += 1
        num_str = f"[{self.para_num:04d}]"

        self.set_font("Times", "B", 12)
        self.cell(15, LINE_H, num_str)

        self.set_font("Times", "", 12)
        w = CONTENT_W - 15
        x_start = MARGIN_LEFT + 15

        self.set_x(x_start)
        self.multi_cell(w, LINE_H, text)
        self.ln(LINE_H * 0.3)

    def write_claim(self, number: int, text: str):
        self.set_font("Times", "B", 12)
        prefix = f"{number}. "
        self.cell(10, LINE_H, prefix)
        self.set_font("Times", "", 12)
        self.set_x(MARGIN_LEFT + 10)
        self.multi_cell(CONTENT_W - 10, LINE_H, text)
        self.ln(LINE_H * 0.5)

    def write_abstract(self, text: str):
        self.add_page()
        self.set_margins(MARGIN_LEFT, MARGIN_TOP, MARGIN_RIGHT)
        self.section_heading("ABSTRACT OF THE DISCLOSURE")
        self.set_font("Times", "", 12)
        self.multi_cell(CONTENT_W, LINE_H, text)

    def write_brief_description_of_drawings(self, figures: list):
        """Write the BRIEF DESCRIPTION OF THE DRAWINGS section."""
        self.section_heading("BRIEF DESCRIPTION OF THE DRAWINGS")
        for _filename, fig_label, description in figures:
            self.numbered_paragraph(
                f"{fig_label} is a block diagram illustrating {description}"
            )

    def write_figure_pages(self, figures: list):
        """Add figure pages with proper headers and Sheet numbering."""
        self.fig_total = len(figures)
        self.in_figures = True
        for i, (filename, fig_label, _desc) in enumerate(figures):
            self.fig_sheet = i + 1
            self.add_page()
            self.set_margins(MARGIN_LEFT, MARGIN_TOP, MARGIN_RIGHT)

            # Figure header centered
            self.set_font("Times", "B", 14)
            self.cell(CONTENT_W, 8, fig_label, align="C")
            self.ln(10)

            # Embed the figure image
            fig_path = FIGURES_DIR / filename
            if fig_path.exists():
                img_max_w = CONTENT_W
                self.image(
                    str(fig_path),
                    x=MARGIN_LEFT,
                    y=self.get_y(),
                    w=img_max_w,
                    h=0,  # auto height, constrained by width
                    keep_aspect_ratio=True,
                )
            else:
                self.set_font("Times", "I", 12)
                self.cell(CONTENT_W, LINE_H, f"[{fig_label} -- Drawing to be provided]", align="C")

        self.in_figures = False
        self.fig_sheet = 0


def parse_provisional_md(filepath: Path) -> dict:
    content = filepath.read_text()
    sections = {}

    title_match = re.search(r"## TITLE\n\n(.+?)(?=\n\n---|\n\n##)", content, re.DOTALL)
    sections["title"] = title_match.group(1).strip() if title_match else "Untitled"

    for section_name in ["FIELD", "BACKGROUND", "SUMMARY", "DETAILED DESCRIPTION", "CLAIMS", "ABSTRACT"]:
        pattern = rf"## {section_name}\n\n(.+?)(?=\n---\n|\n## [A-Z])"
        match = re.search(pattern, content, re.DOTALL)
        if match:
            sections[section_name.lower()] = match.group(1).strip()

    if "abstract" not in sections:
        abstract_match = re.search(r"## ABSTRACT\n\n(.+?)$", content, re.DOTALL)
        if abstract_match:
            sections["abstract"] = abstract_match.group(1).strip()

    if "claims" in sections:
        claims_text = sections["claims"]
        claims = []
        claim_matches = re.findall(r"(\d+)\.\s+(.+?)(?=\n\d+\.\s|\Z)", claims_text, re.DOTALL)
        for num, text in claim_matches:
            clean = re.sub(r"\s+", " ", text.strip())
            claims.append(clean)
        sections["claims_list"] = claims

    return sections


def clean_markdown(text: str) -> str:
    text = re.sub(r"\*\*(.+?)\*\*", r"\1", text)
    text = re.sub(r"\*(.+?)\*", r"\1", text)
    text = re.sub(r"\[(.+?)\]\(.+?\)", r"\1", text)
    text = re.sub(r"^#{1,4}\s+", "", text, flags=re.MULTILINE)
    text = re.sub(r"^\s*[-*]\s+", "", text, flags=re.MULTILINE)
    text = re.sub(r"\|", " ", text)
    text = re.sub(r"-{3,}", "", text)
    text = re.sub(r"`(.+?)`", r"\1", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    # Replace Unicode characters not supported by built-in Times font
    text = text.replace("\u2014", "--")   # em dash
    text = text.replace("\u2013", "-")    # en dash
    text = text.replace("\u2018", "'")    # left single quote
    text = text.replace("\u2019", "'")    # right single quote
    text = text.replace("\u201c", '"')    # left double quote
    text = text.replace("\u201d", '"')    # right double quote
    text = text.replace("\u2026", "...")  # ellipsis
    text = text.replace("\u2192", "->")   # arrow
    text = text.replace("\u00a7", "Section ")  # section sign
    text = text.replace("\u00d7", "x")    # multiplication sign
    text = text.replace("\u2265", ">=")   # >=
    text = text.replace("\u2264", "<=")   # <=
    text = text.replace("\u2248", "~")    # approximately
    # Catch any remaining non-latin-1 characters
    text = text.encode("latin-1", errors="replace").decode("latin-1")
    return text.strip()


def inject_reference_numerals(text: str, patent_key: str) -> str:
    """Inject reference numerals into detailed description text to match figures."""
    ref_maps = {
        "provisional-1": {
            "video encoder": "(100)",
            "audio encoder": "(110)",
            "text encoder": "(120)",
            "OCR pipeline": "(130)",
            "long-context encoder": "(140)",
            "multimodal reasoning": "(150)",
            "per-stream FFN": "(160)",
            "learnable HRF": "(160)",
            "hemodynamic response function": "(160)",
            "modality dropout": "(170)",
            "fusion transformer": "(180)",
            "attentive temporal pooling": "(190)",
            "temporal pooling": "(190)",
            "demographic conditioning": "(200)",
            "demographic embedding": "(200)",
            "prediction transformer": "(210)",
            "prediction head": "(210)",
            "group head": "(220)",
            "subject head": "(230)",
            "predicted cortical activation": "(240)",
            "cortical activation pattern": "(240)",
            "cortical activation": "(240)",
            "client device": "(300)",
            "video upload": "(310)",
            "local adapter": "(320)",
            "WebGPU": "(320)",
            "prediction output": "(330)",
            "cloud API": "(340)",
            "frozen extractor": "(340)",
            "atlas ROI aggregation": "(400)",
            "ROI aggregation": "(400)",
            "metric computation": "(410)",
            "modality ablation": "(420)",
            "visual scene analysis": "(500)",
            "screenplay context": "(510)",
            "neural-visual fusion": "(520)",
            "VLM prescription": "(530)",
            "prescription generator": "(530)",
            "editing prescription": "(540)",
        },
        "provisional-2a": {
            "brand knowledge base": "(600)",
            "brand KB": "(600)",
            "ICP profile": "(610)",
            "ideal customer profile": "(610)",
            "creative brief": "(620)",
            "content generation": "(630)",
            "neural scoring": "(640)",
            "editing engine": "(650)",
            "quality threshold": "(660)",
            "score threshold": "(660)",
            "delivery": "(670)",
            "orchestrator": "(700)",
            "agentic orchestrator": "(700)",
            "color grading": "(710)",
            "color-grading": "(710)",
        },
        "provisional-2b": {
            "scout pass": "(800)",
            "visual scout pass": "(800)",
            "interest scoring": "(810)",
            "interest score": "(810)",
            "moment selection": "(820)",
            "key moment": "(820)",
            "selective neural inference": "(830)",
            "neural inference": "(830)",
        },
        "provisional-3": {
            "dense vector search": "(900)",
            "HNSW cosine": "(900)",
            "BM25 full-text search": "(910)",
            "BM25": "(910)",
            "reciprocal rank fusion": "(920)",
            "RRF": "(920)",
            "ranked result": "(930)",
        },
    }

    ref_map = ref_maps.get(patent_key, {})
    # Only inject each numeral once (first occurrence)
    injected = set()
    for term, numeral in sorted(ref_map.items(), key=lambda x: -len(x[0])):
        if numeral in injected:
            continue
        pattern = re.compile(re.escape(term), re.IGNORECASE)
        match = pattern.search(text)
        if match:
            text = text[:match.end()] + " " + numeral + text[match.end():]
            injected.add(numeral)

    return text


def inject_figure_refs_in_claims(text: str, patent_key: str) -> str:
    """Add figure references to claims where appropriate."""
    fig_refs = {
        "provisional-1": {
            "multi-stream": "(see FIG. 1)",
            "cortical activation": "(see FIG. 1)",
            "hybrid deployment": "(see FIG. 2)",
            "metric": "(see FIG. 3)",
            "ROI aggregation": "(see FIG. 3)",
            "editing prescription": "(see FIG. 4)",
            "prescription": "(see FIG. 4)",
        },
        "provisional-2a": {
            "closed-loop": "(see FIG. 5)",
            "content generation subsystem": "(see FIG. 5)",
            "graph mutation": "(see FIG. 6)",
            "dynamically constructs": "(see FIG. 6)",
        },
        "provisional-2b": {
            "strategic sampling": "(see FIG. 7)",
            "scout pass": "(see FIG. 7)",
            "cinema metric": "(see FIG. 8)",
            "18 cinema": "(see FIG. 8)",
        },
        "provisional-3": {
            "vector embedding column": "(see FIG. 9)",
            "multimodal knowledge base": "(see FIG. 9)",
            "hybrid search": "(see FIG. 10)",
            "reciprocal rank fusion": "(see FIG. 10)",
        },
    }

    refs = fig_refs.get(patent_key, {})
    injected = set()
    for term, ref in sorted(refs.items(), key=lambda x: -len(x[0])):
        if ref in injected:
            continue
        pattern = re.compile(re.escape(term), re.IGNORECASE)
        match = pattern.search(text)
        if match:
            text = text[:match.end()] + " " + ref + text[match.end():]
            injected.add(ref)

    return text


def split_into_paragraphs(text: str) -> list[str]:
    text = clean_markdown(text)
    paragraphs = re.split(r"\n\n+", text)
    return [p.strip() for p in paragraphs if p.strip() and len(p.strip()) > 10]


def get_patent_key(md_name: str) -> str:
    """Extract patent key from markdown filename."""
    if "provisional-1" in md_name:
        return "provisional-1"
    elif "provisional-2a" in md_name:
        return "provisional-2a"
    elif "provisional-2b" in md_name:
        return "provisional-2b"
    elif "provisional-3" in md_name:
        return "provisional-3"
    return ""


def generate_patent_pdf(md_path: Path, output_path: Path, applicant: str, inventors: str):
    sections = parse_provisional_md(md_path)
    title = sections.get("title", "Untitled Invention")
    patent_key = get_patent_key(md_path.name)
    figures = FIGURE_MAP.get(patent_key, [])

    pdf = PatentPDF(title=title, applicant=applicant, inventors=inventors)
    pdf.set_margins(MARGIN_LEFT, MARGIN_TOP, MARGIN_RIGHT)

    pdf.add_cover_sheet()

    pdf.add_page()
    pdf.set_margins(MARGIN_LEFT, MARGIN_TOP, MARGIN_RIGHT)

    pdf.section_heading("TITLE OF THE INVENTION")
    pdf.set_font("Times", "", 12)
    pdf.multi_cell(CONTENT_W, LINE_H, title)
    pdf.ln(LINE_H)

    if "field" in sections:
        pdf.section_heading("FIELD OF THE INVENTION")
        for para in split_into_paragraphs(sections["field"]):
            pdf.numbered_paragraph(para)

    if "background" in sections:
        pdf.section_heading("BACKGROUND OF THE INVENTION")
        for para in split_into_paragraphs(sections["background"]):
            pdf.numbered_paragraph(para)

    if "summary" in sections:
        pdf.section_heading("BRIEF SUMMARY OF THE INVENTION")
        for para in split_into_paragraphs(sections["summary"]):
            pdf.numbered_paragraph(para)

    # BRIEF DESCRIPTION OF THE DRAWINGS (new section, before Detailed Description)
    if figures:
        pdf.write_brief_description_of_drawings(figures)

    if "detailed description" in sections:
        pdf.section_heading("DETAILED DESCRIPTION OF THE INVENTION")
        dd_text = sections["detailed description"]
        # Inject reference numerals into detailed description
        dd_text = inject_reference_numerals(dd_text, patent_key)
        for para in split_into_paragraphs(dd_text):
            pdf.numbered_paragraph(para)

    if "claims_list" in sections and sections["claims_list"]:
        pdf.add_page()
        pdf.set_margins(MARGIN_LEFT, MARGIN_TOP, MARGIN_RIGHT)
        pdf.section_heading("CLAIMS")
        pdf.numbered_paragraph("What is claimed is:")
        pdf.ln(LINE_H * 0.5)
        for i, claim_text in enumerate(sections["claims_list"], 1):
            # Inject figure references in claims
            claim_text = inject_figure_refs_in_claims(claim_text, patent_key)
            pdf.write_claim(i, claim_text)

    if "abstract" in sections:
        abstract_text = clean_markdown(sections["abstract"])
        abstract_text = re.sub(r"\n+", " ", abstract_text).strip()
        pdf.write_abstract(abstract_text)

    # DRAWINGS -- embedded figure pages at the end
    if figures:
        pdf.write_figure_pages(figures)

    pdf.output(str(output_path))
    print(f"  Generated: {output_path.name} ({pdf.page_no()} pages, {len(figures)} figures)")


def main():
    patent_dir = Path(__file__).parent
    output_dir = patent_dir / "pdf"
    output_dir.mkdir(exist_ok=True)

    applicant = "Qualian, Inc."
    inventors = "Yahvin Gali"

    files = [
        ("provisional-1-neural-prediction.md", "Qualian-P1-ORCLE-Neural-Prediction.pdf"),
        ("provisional-2a-short-form.md", "Qualian-P2A-Short-Form-Marketing.pdf"),
        ("provisional-2b-cinema.md", "Qualian-P2B-Long-Form-Cinema.pdf"),
        ("provisional-3-multimodal-kb.md", "Qualian-P3-Multimodal-Knowledge-Base.pdf"),
        ("patent-strategy.md", "Qualian-Patent-Strategy-Internal.pdf"),
    ]

    print("Generating USPTO-formatted provisional patent PDFs with figures...\n")

    for md_name, pdf_name in files:
        md_path = patent_dir / md_name
        if not md_path.exists():
            alt = Path.home() / "ugc-peer" / "docs" / "patent" / md_name
            if alt.exists():
                md_path = alt
        if not md_path.exists():
            print(f"  SKIP: {md_name} not found")
            continue

        if md_name == "patent-strategy.md":
            pdf = PatentPDF(
                title="Qualian Patent Strategy",
                applicant=applicant,
                inventors=inventors,
            )
            pdf.set_margins(MARGIN_LEFT, MARGIN_TOP, MARGIN_RIGHT)
            pdf.add_page()
            pdf.set_font("Times", "B", 16)
            pdf.cell(CONTENT_W, 10, "QUALIAN PATENT STRATEGY", align="C")
            pdf.ln(8)
            pdf.set_font("Times", "I", 12)
            pdf.cell(CONTENT_W, LINE_H, "Internal Analysis -- Confidential", align="C")
            pdf.ln(LINE_H * 2)

            text = clean_markdown(md_path.read_text())
            for para in split_into_paragraphs(text):
                if len(para) < 60 and (para.isupper() or para.startswith("1.") or para.startswith("2.") or para.startswith("3.")):
                    pdf.sub_heading(para)
                else:
                    pdf.set_font("Times", "", 11)
                    pdf.multi_cell(CONTENT_W, LINE_H * 0.9, para)
                    pdf.ln(LINE_H * 0.3)

            pdf.output(str(output_dir / pdf_name))
            print(f"  Generated: {pdf_name} ({pdf.page_no()} pages)")
        else:
            generate_patent_pdf(md_path, output_dir / pdf_name, applicant, inventors)

    print(f"\nAll PDFs saved to: {output_dir}/")


if __name__ == "__main__":
    main()
