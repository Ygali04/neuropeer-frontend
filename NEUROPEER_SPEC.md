# NeuroPeer — Technical Specification Condensed
> Neural Simulation Engine for GTM Content Optimization | Powered by Meta TRIBE v2 | v1.0 March 2026

## Executive Summary

NeuroPeer predicts fMRI-level brain responses to any video/audio/text stimulus — across 20,484 cortical vertices — without recruiting a single fMRI participant. Marketing teams use it to quantify attention, emotional resonance, aesthetic appeal, cognitive load, and memory encoding of GTM content (product demos, Instagram Reels, pre-roll ads) via a single API call.

Global neuromarketing market: $1.74B in 2024 → 9.2% CAGR through 2032. NeuroPeer replaces EEG headsets, eye-trackers, and GSR sensors with one model inference.

---

## GTM Metric Taxonomy

### 2.1 Attention Capture (first 2–3s = scroll-stop moment)

| Metric | GTM Proxy | Neural Substrate | TRIBE v2 Mapping |
|---|---|---|---|
| Hook Score | Thumb-stop rate (2–3s view/impressions) | NAcc activation + AIns suppression | Ventral striatum + insula vertices at t=0–3s |
| Novelty Spike | Pattern interrupt effectiveness | Hippocampal novelty detection, ventral attention network reorienting | Medial temporal + temporoparietal junction vertices |
| Curiosity Gap Index | Info gap that compels continued viewing | ACC conflict monitoring, prefrontal engagement | Medial frontal + dorsal ACC vertex clusters |

### 2.2 Sustained Attention & Retention

| Metric | GTM Proxy | Neural Substrate | TRIBE v2 Mapping |
|---|---|---|---|
| Attention Curve | Quartile retention (25/50/75/100%) | Dorsal attention network (IPS + FEF) sustained activation | Visual cortex + parietal vertex timeseries |
| Hold Rate | ThruPlay / 3s views ratio | Prefrontal sustained engagement, low default-mode network (DMN) activity | PFC vertices high + medial DMN vertices low |
| Attention Decay Rate | Slope of viewer drop-off curve | Progressive DMN re-engagement (mind wandering), decreasing visual cortex activation | DMN vertex activation slope over time |
| Re-engagement Spikes | Retention recovery after drop-off | Ventral attention network reorienting response to salient scene changes | TPJ + ventral frontal vertex transient spikes |

### 2.3 Emotional Resonance

| Metric | GTM Proxy | Neural Substrate | TRIBE v2 Mapping |
|---|---|---|---|
| Emotional Arousal | Engagement rate, share propensity | Amygdala bilateral activation intensity | Limbic / inner temporal vertex clusters |
| Valence (Pos/Neg) | Sentiment-driven virality | NAcc (positive) vs. AIns (negative) differential | Striatal vs. insular vertex ratio |
| Reward Prediction | Purchase intent, CTA click rate | Ventral striatum / NAcc reward circuit activation | Subcortical reward vertex predictions |
| Social Cognition | Relatability, social sharing tendency | TPJ, mPFC (theory of mind network) | Medial PFC + bilateral TPJ vertices |

### 2.4 Aesthetic Quality

| Metric | GTM Proxy | Neural Substrate | TRIBE v2 Mapping |
|---|---|---|---|
| Visual Aesthetic Score | Creative quality perception, brand premium | mOFC + mPFC aesthetic valuation circuit | Medial orbitofrontal + prefrontal vertex activation |
| Sensory Richness | Production value perception | Visual cortex (V1–V4) activation breadth, auditory cortex engagement | Occipital + temporal auditory vertex spread |
| Scene Composition | Thumbnail effectiveness, visual hierarchy | Parahippocampal place area (PPA) for spatial layout processing | Parahippocampal gyrus vertex activation |

### 2.5 Cognitive Processing & Memory

| Metric | GTM Proxy | Neural Substrate | TRIBE v2 Mapping |
|---|---|---|---|
| Cognitive Load | Message complexity, comprehension barrier | dlPFC activation intensity | Dorsolateral prefrontal vertex activation |
| Memory Encoding | Brand recall, message retention | Hippocampal + parahippocampal formation activity | Medial temporal lobe vertex clusters |
| Mind Wandering | Content disengagement risk | Default-mode network (DMN) activation increase | Medial DMN vertices (mPFC + PCC) activation |
| Message Clarity | CTA comprehension, conversion rate | Broca's + Wernicke's area language processing | Left inferior frontal + superior temporal vertices |

### 2.6 Multimodal Integration

| Metric | GTM Proxy | TRIBE v2 Mapping |
|---|---|---|
| Audio-Visual Coherence | Production quality, professional feel | Visual-only vs. full-model predictions at STS vertices |
| Narration Impact | Voiceover effectiveness | Delta between text-encoder and video-encoder vertex predictions |
| Modality Dominance | Which channel drives engagement | Ablation: video-only, audio-only, text-only → compare per-region R² |

---

## TRIBE v2 Model Architecture

Trained on 451.6 hours of fMRI data from 25 subjects across 4 naturalistic studies.
Output: **20,484 cortical vertices** (fsaverage5 mesh) + 8,802 subcortical voxels at **1 Hz**.

| Component | Model | Input | Output |
|---|---|---|---|
| Video Encoder | V-JEPA2 (ViT-Giant) | Video frames at native resolution | Spatiotemporal visual features |
| Audio Encoder | Wav2Vec-BERT 2.0 | Raw audio waveform | Acoustic + speech features |
| Text Encoder | LLaMA 3.2–3B | Transcribed text with timestamps | Contextualized language embeddings |
| Integration | Temporal Transformer | Concatenated multimodal features | Fused brain-state predictions at 1 Hz |
| Prediction Head | Subject Block | Transformer output decimated to fMRI frequency | 20,484 cortical vertices + 8,802 subcortical voxels |

### Cortical Region → Metric Mapping (Schaefer-1000 Atlas)

| Brain Region | Function | TRIBE v2 Vertices | NeuroPeer Metric |
|---|---|---|---|
| Visual Cortex (V1–V4) | Primary visual processing, motion, scene analysis | Occipital lobe vertex clusters | Attention intensity, sensory richness |
| Fusiform Face Area (FFA) | Face recognition, social content processing | Fusiform gyrus vertices | Social presence score |
| Auditory Cortex (A1/STS) | Sound processing, speech perception, AV integration | Superior temporal vertex clusters | Audio engagement, narration impact |
| Prefrontal Cortex (dlPFC) | Working memory, executive function, cognitive control | Dorsolateral prefrontal vertices | Cognitive load |
| mPFC / OFC | Value integration, aesthetic judgment, reward valuation | Medial prefrontal + orbitofrontal vertices | Aesthetic score, reward prediction |
| Amygdala + Limbic | Emotional salience, arousal, affective intensity | Inner temporal / subcortical predictions | Emotional arousal, valence |
| Hippocampal Formation | Memory encoding, novelty detection | Medial temporal lobe vertices | Memory encoding potential, novelty spike |
| Default Mode Network | Mind wandering, self-referential processing | mPFC + PCC + angular gyrus vertices | Mind wandering (inverse engagement) |
| Broca's + Wernicke's | Language production and comprehension | Left IFG + left STG vertices | Message clarity, narration processing |

---

## Inference Pipeline (4 Stages)

1. **Stage 1 — Stimulus Ingestion:** Accept video URL or MP4/MOV file. Download via `yt-dlp`. Extract audio track via `ffmpeg`. Generate word-level transcript via `faster-whisper`. Produce events DataFrame with frame-level and word-level timestamps (TRIBE v2 `get_events_dataframe()` format).

2. **Stage 2 — TRIBE v2 Inference:** Load `facebook/tribev2` from HuggingFace. Call `model.predict(events_df)`. Output shape: `(n_timesteps, 20484)` at 1 Hz resolution. Store as compressed `.npz` in S3.

3. **Stage 3 — Region Aggregation:** Map 20,484 vertices to functional ROIs via Schaefer-1000 atlas (Nilearn). Compute per-region activation timeseries. Run 3 additional modality ablation passes (video-only, audio-only, text-only).

4. **Stage 4 — Metric Computation:** Apply all 18 metric formulas. Compute NeuroPeer Neural Score (0–100) as weighted composite. Generate attention curve, emotional intensity timeline, per-second heatmaps, and key moments.

---

## Neural Score Composite (0–100)

| Component | Weight | Brain Basis | Rationale |
|---|---|---|---|
| Hook Score (0–3s) | **25%** | NAcc/AIns onset differential | First impression determines 80%+ of engagement decisions |
| Sustained Attention | **20%** | Visual + parietal sustained activation | Content must hold attention for message delivery |
| Emotional Resonance | **20%** | Limbic + reward circuit activation | Emotional response drives 2.5x ROI on ad spend |
| Memory Encoding | **15%** | Hippocampal formation activity | Brand recall is the ultimate GTM outcome |
| Aesthetic Quality | **10%** | mOFC/mPFC aesthetic circuit | Visual appeal drives initial trust and premium perception |
| Cognitive Accessibility | **10%** | dlPFC load (inverse) | Low cognitive load enables faster decision-making |

---

## Content Type Presets

| Content Type | Key Metrics Emphasized | Typical Duration | Hook Weight |
|---|---|---|---|
| Instagram Reel | Hook score, emotional arousal, aesthetic quality, scroll-stop prediction | 15–60s | **35%** |
| Product Demo Video | Sustained attention, cognitive load, message clarity, memory encoding | 2–5 min | **20%** |
| YouTube Pre-roll Ad | Hook score (skip prevention), brand recall, emotional valence | 6–30s | **40%** |
| Conference Talk Clip | Cognitive accessibility, narration impact, memory encoding | 3–10 min | **15%** |
| Podcast Audio Clip | Narration impact, emotional resonance, language processing depth | 1–5 min | **20%** |

---

## API Endpoints

| Method | Endpoint | Description | Response |
|---|---|---|---|
| POST | `/api/v1/analyze` | Submit video URL for neural analysis | Job ID + WebSocket URL for progress |
| GET | `/api/v1/results/{job_id}` | Retrieve full neural analysis report | JSON: all metrics + timeseries + scores |
| POST | `/api/v1/compare` | A/B neural comparison of 2+ videos | Comparative metrics + recommendation |
| GET | `/api/v1/results/{job_id}/timeseries` | Second-by-second attention curve data | Array of per-second metric values |
| GET | `/api/v1/results/{job_id}/brain-map` | 3D cortical activation map at timestamp | Vertex-level activation for 3D rendering |
| POST | `/api/v1/results/{job_id}/export` | Export PDF/PPT report | Download URL |

---

## Dashboard Features

- **Predicted Attention Curve:** Second-by-second attention intensity across the full video timeline. Color-coded zones: green = high engagement, yellow = declining, red = critical drop-off. Derived from dorsal attention network vertex timeseries.
- **Live 3D Brain Activity Map:** Interactive fsaverage5 cortical surface with real-time activation heatmap. Users scrub through video timeline to see which brain regions are active at each moment. Region labels (Prefrontal, Visual Cortex, Auditory, Limbic, Default Mode) with numeric activation scores.
- **Key Moments Timeline:** Automatically identified inflection points — Best Hook (peak NAcc at onset), Peak Engagement (maximum sustained attention), Emotional Peaks (amygdala spikes), Drop-off Risk (DMN activation increase), Recovery Points (re-engagement spikes).
- **Emotional Intensity Panel:** Arousal vs. calm timeseries from limbic vertex predictions. Dual-line chart showing emotional engagement dynamics across the content.
- **Cognitive Load Monitor:** dlPFC activation timeseries. Threshold indicator for "comprehension ceiling" beyond which viewers disengage.
- **Modality Breakdown:** Stacked bar chart showing relative contribution of visual, audio, and text channels to neural engagement at each timestamp. Identifies modality synergy vs. conflict zones.
- **A/B Neural Comparison View:** Side-by-side brain maps and attention curves for content variants. Highlights statistically significant differences in neural engagement across all metrics.

---

## System Architecture

| Layer | Components | Technology |
|---|---|---|
| Frontend | Dashboard UI, video URL input, interactive attention curves, brain heatmaps, report export | Next.js 14, React 18, TypeScript, D3.js v7, Three.js, Tailwind CSS |
| API Gateway | REST API, WebSocket for streaming progress, authentication, rate limiting | FastAPI (Python 3.11), Redis, JWT auth |
| Inference Engine | TRIBE v2 model loading, events extraction, batch prediction, modality ablation | PyTorch 2.x, TRIBE v2 (HuggingFace `facebook/tribev2`), NVIDIA A100/H100, faster-whisper |
| Analytics Engine | Region aggregation (Schaefer atlas), metric computation, composite scoring, temporal analysis | NumPy, SciPy, Nilearn (surface parcellation), custom metric pipeline |
| Storage | Video files, prediction tensors, analysis results, user accounts, historical comparisons | S3 (media), PostgreSQL 16 (metadata + results), Redis 7 (cache/queue) |

---

## Technical Limitations

- **Temporal Resolution:** fMRI operates at 1 Hz — sub-500ms dynamics (e.g., very first frame) cannot be captured. Limits precision for content <5s.
- **Average Brain:** TRIBE v2 predicts the "average" subject response. Cannot segment by demographic.
- **Ecological Validity:** Model trained in constrained fMRI scanner context, not mobile scroll behavior.
- **License:** TRIBE v2 is **CC BY-NC 4.0** — non-commercial only. Commercial deployment requires a separate licensing agreement with Meta FAIR.

---

## Neuroscience Research Foundations

| Study | Key Finding | Journal | NeuroPeer Application |
|---|---|---|---|
| Tong et al. (2020) | NAcc + AIns at video onset forecasts aggregate YouTube view frequency | PNAS | Hook Score: NAcc/AIns differential in first 4 seconds |
| Chan et al. (2024) | Emotion + memory are earliest predictors of ad liking; social cognition shows peak-and-stable pattern | Journal of Marketing Research | Temporal weighting: emotion metrics early, social cognition throughout |
| Vessel et al. (2012, 2021) | Aesthetic appeal activates mPFC + OFC, modulates DMN engagement | Frontiers in Human Neuroscience | Aesthetic Score: mOFC + mPFC vertex activation |
| d'Ascoli et al. (2026) | TRIBE v2 predicts fMRI across video/audio/text with zero-shot generalization | Meta FAIR | Core engine: 20k-vertex predictions across all modalities |
| Falk et al. (2012) | Small-sample brain activity (n=30–40) predicts population-level media effects | Psychological Science | Validates in-silico prediction of population-level engagement |
| Genevsky et al. (2017) | Brain activity neuroforecasts crowdfunding outcomes better than behavioral measures | Journal of Neuroscience | Validates brain-based prediction of real-world engagement outcomes |
| Genevsky et al. (2025) | NAcc-based affect generalizes across demographics; behavioral choices do not | PNAS Nexus | Explains WHY neural signals outperform behavior: affect is universal |
| Scholz et al. (2017) | mPFC valuation activity predicts which news articles go viral | PNAS | mPFC valuation signals predict content sharing at population level |
| Berns & Moore (2012) | NAcc activity during passive listening to novel songs forecasted Internet music downloads 2 years later | Social Cognitive and Affective Neuroscience | Validates long-horizon neural prediction of media popularity |
| Kühn et al. (2016) | fMRI brain activation forecasts real-world chocolate sales; identifies multiple "buy buttons" | NeuroImage | NAcc and ventral striatum as purchase-intent predictors |

---

## Theoretical Framework: The AIM Model

NeuroPeer's composite scoring is built on the **Affect–Integration–Motivation (AIM)** framework (Knutson et al., 2014):

- **Affect:** NAcc signals positive arousal (approach), AIns signals negative arousal (avoidance)
- **Integration:** mPFC integrates affective signals with contextual information (probability, timing, value)
- **Motivation:** Combined signals drive behavioral approach (click, watch, share) or avoidance (scroll past, skip)

Maps directly onto GTM outcomes: Hook Score (affect at onset) → Engagement Depth (integration over time) → Conversion Probability (motivational output).

---

## Implementation Roadmap

| Phase | Timeline | Deliverables | Dependencies |
|---|---|---|---|
| Phase 1: Core Engine | Weeks 1–4 | TRIBE v2 inference pipeline, Schaefer atlas ROI mapping, basic metric computation, CLI tool | GPU compute (A100), HuggingFace LLaMA 3.2 access, Nilearn |
| Phase 2: Metrics & Scoring | Weeks 5–8 | Full 18-metric taxonomy, Neural Score composite, modality ablation pipeline, temporal analysis engine, attention curve generation | Phase 1 complete, validation dataset |
| Phase 3: Dashboard MVP | Weeks 9–14 | Web UI with video URL input, attention curve visualization, brain heatmap (2D/3D), key moments detection, Neural Score display, PDF report export | Phase 2 complete, Three.js/D3 brain visualization |
| Phase 4: A/B Testing & Scale | Weeks 15–20 | Multi-video comparison, content type presets, batch processing API, team collaboration features, benchmark database | Phase 3 complete, multi-GPU scaling |
