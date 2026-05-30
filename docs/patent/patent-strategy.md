# Qualian Patent Strategy — Complete Analysis

**Prepared:** May 2026
**Author:** Patent strategy analysis for Qualian, Inc.
**Status:** For attorney review

---

## 1. TECHNICAL MOAT ANALYSIS

### The Core Moat: Hardware-Free Neural Content Optimization

Every existing neuromarketing patent requires hardware in the loop:
- InteraXon (US 10,009,644): EEG headset
- Amazon (US 10,846,517): Camera for facial coding
- Affectiva (US 10,289,898): Camera for emotion AI
- Neuro-Insight: EEG (Steady-State Topography)
- Immersion Neuroscience: Smartwatch cardiac sensors
- NeuroFocus/Nielsen: fMRI scanner

**Qualian's system is the first to operate entirely computationally — no subject, no sensor, no scanner at inference time.** This is the fundamental differentiator and the anchor of all three provisional applications.

### Three Layers of Defensible IP

| Layer | Product | Innovation | Status |
|-------|---------|-----------|--------|
| Model | ORCLE | 6-stream brain encoder with OCR + demographic conditioning, trained on marketing content | Novel vs. TRIBE v2 (3 streams, narrative film) |
| Scoring | NeuroPeer | Atlas ROI aggregation → 20+ metrics → VLM editing prescriptions from PREDICTED brain data | No prior art: all competitors measure, not predict |
| Platform | Nucleus | Closed-loop generate → score → edit → re-score with agentic graph mutation | Caponi patent (abandoned); Amazon requires camera |

### What Is NOT Defensible

- The brain encoder architecture itself (transformer + frozen backbones = published by Meta, VIBE, SDA, MedARC teams)
- Individual open-source components (pgvector, RRF, jsPDF, etc.)
- Using fMRI for marketing (Zaltman patent expired 2020)
- Basic RAG patterns (parent-child chunking exists in literature, though our specific combination is novel)

---

## 2. PROVISIONAL FILING STRATEGY

### Immediate (File Now): 3 Provisionals

| # | Title | Core Claim | Key Novel Elements |
|---|-------|-----------|-------------------|
| 1 | Computational Neural Prediction + Metrics | Predict brain response from video without hardware; derive content metrics via atlas ROI aggregation | OCR stream, demographic conditioning, modality ablation, strategic sampling |
| 2 | Closed-Loop Content Optimization | Generate → score → edit → re-score without biometric sensors | Agentic graph mutation, archetype templates, ceiling fallback |
| 3 | Multimodal Knowledge-Augmented Intelligence | Single-table multimodal KB with cross-modal RRF retrieval + knowledge graph | Per-modality HNSW, contextual enrichment, feedback-driven KG |

### Within 6 Months: Convert + Expand

- Convert all 3 provisionals to non-provisional utility applications (12-month deadline)
- Add CIP for EEG encoder (PRD-1) after Phase 3 training validation
- Add CIP for demographic conditioning after ablation data

### Within 12 Months: New Filings

- Physical grounding for video generation (PRD-6) — pose validation, object tracking, depth estimation as quality gates
- Cinema-specific temporal analysis methods — act boundary detection, frisson measurement

### Portfolio Target

3 provisionals now → 5-6 utility applications within 18 months

---

## 3. PRIOR ART RISK ASSESSMENT

### HIGH RISK — Requires Attorney Review

| Patent | Holder | Risk | Mitigation |
|--------|--------|------|-----------|
| US 10,009,644 / US 10,856,032 family | InteraXon | EEG-based content modulation; 134 patents, active continuations | Our system uses NO EEG at inference. Distinguish on "computational prediction without hardware." If we ever add real-time EEG input, this becomes blocking. |
| US 10,846,517 | Amazon | Content modification via emotion detection (camera) | Our system uses NO camera/facial coding. Distinguish on "predicted neural responses from computational model, not peripheral physiological signals." |
| US 12,254,894 (March 2025) | Unknown | Emotion detection + prediction + annotation for audience. Very recent. | Review claims carefully — "media feature extractor predicting emotional response" could read broadly. Distinguish on "cortical activation prediction at parcel/vertex resolution" vs. "emotion classification." |
| US 10,289,898 | Affectiva/Smart Eye | Video recommendation based on affect | Distinguish: our scoring is from PREDICTED brain data, not measured affect signals. |

### MODERATE RISK

| Patent | Holder | Risk | Mitigation |
|--------|--------|------|-----------|
| Realeyes attention measurement patents | Realeyes | Attention scoring system (Capture/Retain/Encode) | Their system uses camera-based facial coding; ours uses computational brain prediction. Different input modality. |
| InteraXon continuations | InteraXon | Active continuation strategy could draft claims reading on computational approaches | Monitor continuation publications. File our provisionals ASAP to establish priority date. |

### LOW RISK (Expired/Abandoned)

| Patent | Status | Relevance |
|--------|--------|-----------|
| US 6,099,319 (Zaltman/Kosslyn) | Expired 2020 | Foundational neuroimaging-for-marketing. No longer blocking but establishes prior art baseline. |
| US 20140303450 / US 20170112423 (Caponi) | Both abandoned | Closed-loop stimulus optimization via biometric feedback. Prior art for closed-loop claims but uses EEG/EKG sensors. |

### FREEDOM-TO-OPERATE KEY POINTS

1. **Our system never requires hardware at inference** — this distinguishes from ALL existing patents
2. **We predict cortical activation topology, not emotion categories** — different from Affectiva/Realeyes/Amazon
3. **Our closed loop is purely computational** — different from Caponi (requires subjects) and InteraXon (requires EEG)
4. **TRIBE v2 is research-licensed, not patented** — Meta has not filed patents on the application layer (content optimization)
5. **If we ever add real-time biometric input (EEG/camera), InteraXon and Amazon patents become relevant** — keep inference hardware-free

---

## 4. PRIOR ART SEARCH QUERIES

### Google Patents (patents.google.com)

```
1. ((brain OR neural OR cortical OR fMRI OR EEG) AND (predict OR prediction) AND (video OR media OR content) AND (score OR metric OR optimization))
   CPC: G06N3/00, G06Q30/02

2. ((neuromarketing OR "consumer neuroscience") AND (system OR method) AND (content OR advertising OR media))
   CPC: A61B5/16, G06Q30/02

3. ((emotion OR affect OR engagement) AND (content modification OR content optimization OR content editing) AND (automated OR system))
   CPC: G06F18/00, G06Q30/02

4. ((brain-state OR brainwave OR neural response) AND (content modulation OR content enhancement OR content personalization))

5. ((closed-loop OR feedback) AND (stimulus OR content) AND (optimization OR generation) AND (biological OR neural OR brain OR emotion))

6. ((encoding model OR brain encoding) AND (video OR media) AND (prediction OR predicting) AND (voxel OR cortical OR neural))

7. ((multimodal) AND (brain OR neural) AND (video AND audio AND text) AND (prediction OR score))

8. "content effectiveness" AND (neural OR brain OR cortical) AND (predict OR computational)

9. (fMRI OR "functional magnetic resonance") AND (content OR media OR advertising) AND (predict OR without AND scanning)

10. "knowledge graph" AND (multimodal OR "cross-modal") AND (retrieval OR search) AND (content OR media)
```

### USPTO Full-Text (patft.uspto.gov)

```
1. ACLM/"brain" AND ACLM/"content" AND ACLM/"predict" AND NOT ACLM/"headset"

2. ACLM/"neural response" AND ACLM/"video" AND ACLM/"score"

3. ACLM/"content" AND ACLM/"emotion" AND ACLM/"modification" AND ACLM/"automated"

4. ACLM/"EEG" AND ACLM/"content" AND ACLM/"optimization"

5. ACLM/"cortical" AND ACLM/"media" AND ACLM/"metric"

6. ICL/G06N3 AND "brain activity" AND "content" AND "predict"

7. ACLM/"knowledge graph" AND ACLM/"multimodal" AND ACLM/"retrieval"
```

### Espacenet (worldwide.espacenet.com)

```
1. ta="neuromarketing" AND ta="content optimization"
2. ta="brain response prediction" AND ta="video"
3. ta="neural encoding model" AND ta="content"
4. cl="predict" AND cl="brain" AND cl="content" AND cl="video"
5. CPC=G06Q30/02 AND ta="neural" AND ta="content"
6. ta="multimodal knowledge" AND ta="cross-modal retrieval"
```

### Patent Classification Codes to Monitor

| Code | Description |
|------|-------------|
| G06N 3/08 | Learning methods (neural networks) |
| G06Q 30/0201 | Market prediction |
| G06Q 30/0242 | Targeted advertising |
| A61B 5/16 | Measuring brain activity |
| A61B 5/0476 | EEG specifically |
| G06V 20/40 | Video scene analysis |
| G06F 18/2415 | Classification using neural networks |
| G06F 16/9535 | Multimedia information retrieval |

---

## 5. ATTORNEY INSTRUCTIONS

### For each provisional:
1. Review claims for breadth vs. specificity balance
2. Ensure claims distinguish from InteraXon, Amazon, and Affectiva families
3. Emphasize "without neuroimaging hardware or human subjects at inference time" in every independent claim
4. Consider adding dependent claims for: presigned URL pipeline automation, ensemble weighting strategies, content-type polymorphism
5. File all three on the same date to establish simultaneous priority

### Key terminology to preserve:
- "Computationally predicted cortical activation" (not "emotion detection" or "sentiment analysis")
- "Atlas-based ROI aggregation" (not "brain region scoring")
- "Modality ablation analysis" (not "A/B testing")
- "Demographic conditioning" (not "audience targeting")
- "Agentic graph mutation" (not "automated workflow")

### Recommended prosecution strategy:
- File provisionals immediately to establish priority date
- Convert to non-provisional within 12 months with expanded claims
- Consider PCT (international) filing for Provisional 1 (broadest commercial value)
- Monitor Meta patent filings related to TRIBE v2 — they may file on the research side, but unlikely to file on the content optimization application layer
