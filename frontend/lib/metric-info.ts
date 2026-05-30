// Neuroscience-grounded explanations and study citations for each metric,
// score dimension, and key moment type.

export interface MetricInfo {
  title: string;
  description: string;
  study: string;
  studyDetail: string;
}

// ── Neural Score Dimensions ──────────────────────────────────────────────────

export const DIMENSION_INFO: Record<string, MetricInfo> = {
  Hook: {
    title: "Hook Score",
    description:
      "Measures the visual and auditory salience of the first 3 seconds. Maps to the orienting response — a rapid involuntary shift of attention triggered by novel stimuli. Higher scores predict stronger thumb-stop rates and initial engagement.",
    study: "Sokolov, E.N. (1963), Perception and the Conditioned Reflex",
    studyDetail:
      "Foundational work on the orienting response and habituation in human attention systems.",
  },
  Attention: {
    title: "Sustained Attention",
    description:
      "Tracks the dorsal attention network's engagement across the content duration. Based on inter-subject correlation (ISC) of neural time courses — when viewers' brains synchronize, they're truly engaged.",
    study: "Hasson, U. et al. (2004), Science 303(5664)",
    studyDetail:
      "Intersubject synchronization of cortical activity during natural vision. Demonstrated that engaging narratives produce tightly correlated brain responses across viewers.",
  },
  Emotion: {
    title: "Emotional Resonance",
    description:
      "Quantifies amygdala and limbic system activation intensity. Emotional arousal enhances memory encoding and sharing behavior. This metric predicts comment sentiment and emotional virality.",
    study: "Nummenmaa, L. et al. (2012), PNAS 109(23)",
    studyDetail:
      "Emotions promote social interaction by synchronizing brain activity across individuals.",
  },
  Memory: {
    title: "Memory Encoding",
    description:
      "Predicts long-term recall by modeling hippocampal activation patterns. High memory encoding correlates with successful brand recall 24–72 hours post-exposure. Based on the subsequent memory effect in fMRI.",
    study: "Wagner, A.D. et al. (1998), Science 281(5380)",
    studyDetail:
      "Building memories: remembering and forgetting of verbal experiences as predicted by brain activity.",
  },
  Aesthetic: {
    title: "Aesthetic Quality",
    description:
      "Evaluates visual composition, color harmony, and production quality through fusiform and visual cortex activation patterns. Aesthetic quality correlates with perceived brand value.",
    study: "Vartanian, O. & Skov, M. (2014), Neuropsychologia 63",
    studyDetail:
      "Neural correlates of viewing paintings: evidence from fMRI studies of aesthetic experience.",
  },
  Clarity: {
    title: "Cognitive Accessibility",
    description:
      "Measures prefrontal cognitive load — how much effort is required to process the message. Lower load = higher accessibility. Inversely correlates with viewer confusion and early exit rates.",
    study: "Sweller, J. (1988), Cognitive Science 12(2)",
    studyDetail:
      "Cognitive Load Theory: the relationship between information processing demands and learning performance.",
  },
};

// ── Key Moment Types ─────────────────────────────────────────────────────────

export const MOMENT_INFO: Record<string, MetricInfo> = {
  best_hook: {
    title: "Best Hook Point",
    description:
      "The moment with the highest orienting response — a combination of visual salience, audio onset, and novelty detection. This is where the brain's alerting network fires most strongly, predicting whether a viewer will continue watching.",
    study: "Itti, L. & Koch, C. (2001), Nature Reviews Neuroscience 2(3)",
    studyDetail:
      "Computational modelling of visual attention. Established the salience map model for predicting attentional capture.",
  },
  peak_engagement: {
    title: "Peak Engagement",
    description:
      "Maximum inter-subject correlation across all cortical vertices. This is the point where the largest number of brain regions are synchronized across the simulated viewer population — indicating deep, multi-modal engagement.",
    study: "Dmochowski, J.P. et al. (2014), Nature Communications 5",
    studyDetail:
      "Correlated components of ongoing EEG point to emotionally laden attention. Showed that neural synchrony predicts audience-level engagement metrics like tweet rates.",
  },
  emotional_peak: {
    title: "Emotional Peak",
    description:
      "Highest amygdala and insula activation, indicating maximum emotional arousal. Emotional peaks are critical for memory consolidation — content near this point is significantly more likely to be recalled.",
    study: "McGaugh, J.L. (2004), Annual Review of Neuroscience 27",
    studyDetail:
      "The amygdala modulates the consolidation of memories of emotionally arousing experiences.",
  },
  dropoff_risk: {
    title: "Drop-off Risk",
    description:
      "A sharp decline in the dorsal attention network coupled with increased default mode network (DMN) activation. DMN activation during content viewing indicates mind-wandering — the viewer is disengaging and likely to exit.",
    study: "Christoff, K. et al. (2009), PNAS 106(21)",
    studyDetail:
      "Experience sampling during fMRI reveals default network and executive system contributions to mind wandering.",
  },
  recovery: {
    title: "Recovery Point",
    description:
      "A re-engagement spike following a drop-off. Typically triggered by a pattern interrupt — a visual change, new speaker, or shift in audio energy. Effective recoveries re-activate the salience network and prevent viewer loss.",
    study: "Corbetta, M. & Shulman, G.L. (2002), Nature Reviews Neuroscience 3(3)",
    studyDetail:
      "Control of goal-directed and stimulus-driven attention in the brain. Described the ventral attention network's role in reorienting.",
  },
};

// ── Individual Metric Explanations ───────────────────────────────────────────
// Keyed by metric name from the API response

export const METRIC_INFO: Record<string, MetricInfo> = {
  "Visual Hook Strength": {
    title: "Visual Hook Strength",
    description:
      "Quantifies the first 3 seconds' visual salience using a computational attention model. Maps to V1/V2 primary visual cortex response magnitude. Predicts thumb-stop rate on social platforms.",
    study: "Itti, L. & Koch, C. (2001), Nature Reviews Neuroscience 2(3)",
    studyDetail: "Computational modelling of visual attention and saliency maps.",
  },
  "Sustained Attention": {
    title: "Sustained Attention",
    description:
      "Average dorsal attention network engagement across the full content duration. Based on inter-subject correlation of neural time courses.",
    study: "Hasson, U. et al. (2004), Science 303(5664)",
    studyDetail: "Intersubject synchronization of cortical activity during natural vision.",
  },
  "Emotional Resonance": {
    title: "Emotional Resonance",
    description:
      "Amygdala and limbic activation intensity. Emotional arousal enhances memory encoding and social sharing behavior.",
    study: "Nummenmaa, L. et al. (2012), PNAS 109(23)",
    studyDetail: "Emotions promote social interaction by synchronizing brain activity.",
  },
  "Memory Encoding": {
    title: "Memory Encoding Potential",
    description:
      "Hippocampal activation predicting long-term recall. Based on the subsequent memory effect paradigm.",
    study: "Wagner, A.D. et al. (1998), Science 281(5380)",
    studyDetail: "Building memories: remembering and forgetting as predicted by brain activity.",
  },
  "Aesthetic Quality": {
    title: "Aesthetic Quality",
    description:
      "Visual composition and production quality through fusiform and extrastriate cortex response.",
    study: "Vartanian, O. & Skov, M. (2014), Neuropsychologia 63",
    studyDetail: "Neural correlates of viewing paintings: evidence from fMRI.",
  },
  "Cognitive Accessibility": {
    title: "Cognitive Accessibility",
    description:
      "Inverse of prefrontal cognitive load. Lower load means the message is easier to process and more likely to be understood.",
    study: "Sweller, J. (1988), Cognitive Science 12(2)",
    studyDetail: "Cognitive Load Theory and information processing demands.",
  },
  "Narrative Coherence": {
    title: "Narrative Coherence",
    description:
      "Temporal pole activation measuring story structure and logical flow. Coherent narratives produce stronger temporal binding.",
    study: "Lerner, Y. et al. (2011), Journal of Neuroscience 31(8)",
    studyDetail: "Topographic mapping of a hierarchy of temporal receptive windows using a narrated story.",
  },
  "Audio-Visual Sync": {
    title: "Audio-Visual Synchronization",
    description:
      "Superior temporal sulcus response to cross-modal binding. Measures how well sound and image are integrated.",
    study: "Beauchamp, M.S. et al. (2004), Journal of Neurophysiology 91(4)",
    studyDetail: "Unraveling multisensory integration: patchy organization within human STS.",
  },
  "Novelty Response": {
    title: "Novelty Response",
    description:
      "Hippocampal novelty detection signal. Novel content triggers dopaminergic prediction error, increasing engagement and shareability.",
    study: "Ranganath, C. & Rainer, G. (2003), Nature Reviews Neuroscience 4(3)",
    studyDetail: "Neural mechanisms for detecting and remembering novel events.",
  },
  "Social Relevance": {
    title: "Social Relevance",
    description:
      "Medial prefrontal cortex activation related to self-referential and social processing. Predicts share intent.",
    study: "Mitchell, J.P. et al. (2006), Neuron 50(4)",
    studyDetail: "Dissociable medial prefrontal contributions to judgments of similar and dissimilar others.",
  },
  "Reward Prediction": {
    title: "Reward Prediction",
    description:
      "Ventral striatum reward anticipation signal. Does the viewer expect a payoff? Predicts click-through behavior.",
    study: "Knutson, B. et al. (2001), NeuroImage 14(2)",
    studyDetail: "Anticipation of increasing monetary reward selectively recruits nucleus accumbens.",
  },
  "Facial Processing": {
    title: "Facial Processing",
    description:
      "Fusiform face area engagement. Face processing is automatic and powerful — faces with emotional expressions drive stronger engagement.",
    study: "Kanwisher, N. et al. (1997), Journal of Neuroscience 17(11)",
    studyDetail: "The fusiform face area: a module in human extrastriate cortex specialized for face perception.",
  },
  "Language Processing": {
    title: "Language Processing Load",
    description:
      "Wernicke's and Broca's area activation reflecting speech comprehension difficulty. Optimal content matches audience language complexity.",
    study: "Hickok, G. & Poeppel, D. (2007), Nature Reviews Neuroscience 8(5)",
    studyDetail: "The cortical organization of speech processing: a dual stream model.",
  },
  "Motion Sensitivity": {
    title: "Motion Sensitivity",
    description:
      "MT/V5 complex response to visual motion — cuts, camera movement, on-screen action. Motion captures attention reflexively.",
    study: "Tootell, R.B. et al. (1995), Journal of Neuroscience 15(4)",
    studyDetail: "Visual motion aftereffect in human cortical area MT revealed by fMRI.",
  },
  "Arousal Regulation": {
    title: "Arousal Regulation",
    description:
      "Insula and autonomic nervous system proxy. Measures physiological arousal patterns that predict engagement intensity.",
    study: "Craig, A.D. (2009), Nature Reviews Neuroscience 10(1)",
    studyDetail: "How do you feel — now? The anterior insula and human awareness.",
  },
  "Temporal Pacing": {
    title: "Temporal Pacing",
    description:
      "Information delivery rate. Cerebellum and basal ganglia track temporal predictions. Too fast = cognitive overload, too slow = disengagement.",
    study: "Grahn, J.A. & Rowe, J.B. (2009), Cerebral Cortex 19(4)",
    studyDetail: "Feeling the beat: premotor and striatal interactions in musicians and nonmusicians during beat perception.",
  },
  "Brand Safety": {
    title: "Brand Safety",
    description:
      "Content safety assessment based on prefrontal moral reasoning network activation. Ensures adjacency safety for ad placement.",
    study: "Greene, J.D. et al. (2004), Neuron 44(2)",
    studyDetail: "The neural bases of cognitive conflict and control in moral judgment.",
  },
  "CTA Effectiveness": {
    title: "CTA Effectiveness",
    description:
      "Supplementary motor area and motor planning activation at call-to-action moments. Measures behavioral intent to act.",
    study: "Cunnington, R. et al. (2002), Human Brain Mapping 15(3)",
    studyDetail: "The preparation and execution of self-initiated and externally-triggered movement.",
  },
};

// ── Cinema Metric Definitions (Feature Film) ────────────────────────────────
// 18 cinema-specific neuroscience metrics grounded in peer-reviewed research

export const CINEMA_METRICS: Record<string, MetricInfo> = {
  "Narrative Absorption": {
    title: "Narrative Absorption",
    description:
      "Measures default mode network (mPFC, PCC, precuneus) engagement during sustained narrative processing. High absorption indicates deep story immersion where viewers' brains synchronize around the narrative arc, suppressing self-referential thought in favor of story-world simulation.",
    study: "Simony, E. et al. (2016), Nature Communications 7",
    studyDetail: "Dynamic reconfiguration of the default mode network during narrative comprehension.",
  },
  "Suspense Arc": {
    title: "Suspense Arc",
    description:
      "Tracks salience network activation (anterior insula, dorsal ACC) reflecting sustained anticipatory tension. Prolonged salience engagement indicates the audience is locked into uncertainty about narrative outcomes, driving forward-leaning attention.",
    study: "Bezdek, M.A. et al. (2015), Frontiers in Neuroscience 9",
    studyDetail: "Neural evidence that suspense narrows attentional focus and increases engagement.",
  },
  "Emotional Depth": {
    title: "Emotional Depth",
    description:
      "Quantifies limbic system activation (amygdala, insula) capturing both mean intensity and dynamic range of emotional responses. Films that produce both high peaks and meaningful valleys in limbic activation create richer emotional texture and stronger audience resonance.",
    study: "Nummenmaa, L. et al. (2018), Cerebral Cortex 28(12)",
    studyDetail: "Emotional speech and bodily expressions synchronize the listener's brain during natural dialogue.",
  },
  "Character Empathy": {
    title: "Character Empathy",
    description:
      "Measures mentalizing network activation (TPJ, medial PFC, superior temporal sulcus) reflecting theory-of-mind engagement with on-screen characters. Strong coupling indicates viewers are actively modeling characters' beliefs, desires, and emotional states.",
    study: "Nummenmaa, L. et al. (2014), PNAS 111(25)",
    studyDetail: "Mental action simulation synchronizes action-observation circuits across individuals.",
  },
  "Visual Spectacle": {
    title: "Visual Spectacle",
    description:
      "Evaluates visual cortex response magnitude (V1 through V4, MT/V5) to cinematographic composition, color, and motion. Higher activation reflects greater visual richness and the effectiveness of the visual language in commanding bottom-up attention.",
    study: "Gallese, V. & Guerra, M. (2019), Oxford University Press",
    studyDetail: "The empathic screen: cinema and neuroscience, examining embodied simulation during film viewing.",
  },
  "Cinematic Frisson": {
    title: "Cinematic Frisson",
    description:
      "Detects peak activation in reward circuitry (nucleus accumbens, caudate) associated with chills, goosebumps, and intense aesthetic pleasure. These dopaminergic peaks mark the most transcendent moments where music, image, and narrative converge into visceral impact.",
    study: "Blood, A.J. & Zatorre, R.J. (2001), PNAS 98(20)",
    studyDetail: "Intensely pleasurable responses to music correlate with activity in brain regions implicated in reward and emotion.",
  },
  "Pacing Coherence": {
    title: "Pacing Coherence",
    description:
      "Measures alignment between salience network rhythms and primary visual cortex temporal predictions, reflecting how well the editing rhythm matches audience expectation. Low prediction error indicates editorially coherent pacing that feels natural and intentional.",
    study: "Sanz-Aznar, J. et al. (2021), Scientific Reports 11",
    studyDetail: "Neural signatures of cinematic shot transitions and their alignment with viewer predictions.",
  },
  "Soundtrack Integration": {
    title: "Soundtrack Integration",
    description:
      "Evaluates auditory-limbic coupling strength, measuring how effectively the musical score modulates emotional processing. High coupling means the soundtrack is not merely accompanying but actively shaping the audience's emotional trajectory through cross-modal binding.",
    study: "Salimpoor, V.N. et al. (2013), Science 340(6129)",
    studyDetail: "Interactions between the nucleus accumbens and auditory cortices predict music reward value.",
  },
  "Memory Imprint": {
    title: "Memory Imprint",
    description:
      "Measures hippocampal activation peaks at narrative boundaries and emotionally significant moments, predicting long-term memorability. Films that trigger strong hippocampal responses at key junctures are more likely to be recalled and discussed days or weeks later.",
    study: "Ben-Yakov, A. & Henson, R.N. (2018), Journal of Neuroscience 38(47)",
    studyDetail: "The hippocampal film editor: sensitivity and specificity to event boundaries in continuous experience.",
  },
  "Cognitive Clarity": {
    title: "Cognitive Clarity",
    description:
      "Inverse of prefrontal cortex cognitive load. Lower PFC demand means the narrative and visual language are communicating efficiently. High clarity indicates the audience can follow complex plot developments without confusion or disengagement from effortful processing.",
    study: "Hasson, U. et al. (2008), Journal of Neuroscience 28(20)",
    studyDetail: "Neurocinematics: the neuroscience of film, demonstrating how film structure modulates brain responses.",
  },
  "Attention Grip": {
    title: "Attention Grip",
    description:
      "Tracks sustained activation of the dorsal attention network (frontal eye fields, intraparietal sulcus) reflecting volitional, goal-directed attention. High grip means the film commands focused attention without relying on reflexive startles or constant novelty.",
    study: "Petersen, S.E. & Posner, M.I. (2012), Annual Review of Neuroscience 35",
    studyDetail: "The attention system of the human brain: 20 years after.",
  },
  "Surprise": {
    title: "Surprise",
    description:
      "Detects peak activations in anterior insula and default mode network disruption indicating violated narrative expectations. Effective surprise produces a rapid salience-to-DMN handoff as viewers scramble to update their mental model of the story world.",
    study: "Meer, J.N. et al. (2020), NeuroImage 219",
    studyDetail: "Movie viewing elicits rich and reliable brain state dynamics.",
  },
  "Opening Hook": {
    title: "Opening Hook",
    description:
      "Measures the salience-to-DAN transition strength during the first five minutes, capturing how effectively the opening sequence converts orienting attention into sustained narrative engagement. Predicts whether audiences commit to the full runtime.",
    study: "Zak, P.J. (2015), Annals of the New York Academy of Sciences 1345",
    studyDetail: "Why inspiring stories make us react: the neuroscience of narrative.",
  },
  "Climax Impact": {
    title: "Climax Impact",
    description:
      "Measures concurrent peak activation in reward circuitry and default mode network at the narrative climax, reflecting the convergence of emotional payoff and narrative resolution. The strongest climaxes produce synchronized reward-DMN coupling across viewers.",
    study: "Zak, P.J. (2015), Annals of the New York Academy of Sciences 1345",
    studyDetail: "Why inspiring stories make us react: the neuroscience of narrative.",
  },
  "Resolution Satisfaction": {
    title: "Resolution Satisfaction",
    description:
      "Evaluates the reward-to-PFC ratio in the final act, capturing whether the narrative resolution delivers emotional closure proportional to the tension built. High satisfaction means the brain's reward system activates without excessive prefrontal cognitive effort.",
    study: "Rajimehr, R. et al. (2022), Communications Biology 5",
    studyDetail: "Characterizing the brain's responses to emotional narrative endings and their neural predictors.",
  },
  "Scene Transition Flow": {
    title: "Scene Transition Flow",
    description:
      "Measures hippocampal and V1 recovery speed at scene boundaries, capturing how quickly the brain re-establishes spatial and narrative context after a cut. Smooth transitions produce rapid recovery while jarring cuts create prolonged hippocampal prediction error.",
    study: "Magliano, J.P. & Zacks, J.M. (2011), Journal of Cognitive Neuroscience 23(12)",
    studyDetail: "The impact of continuity editing in narrative film on event segmentation.",
  },
  "Dialogue Engagement": {
    title: "Dialogue Engagement",
    description:
      "Tracks language network activation (Broca's area, Wernicke's area) during speech-heavy scenes, reflecting how deeply the audience processes dialogue content. High engagement indicates dialogue that is actively comprehended and integrated into the narrative model.",
    study: "Silbert, L.J. et al. (2014), PNAS 111(32)",
    studyDetail: "Coupled neural systems underlie the production and comprehension of naturalistic narrative speech.",
  },
  "Tonal Consistency": {
    title: "Tonal Consistency",
    description:
      "Inverse of limbic activation variance, measuring how stable the emotional register is across the film. High tonal consistency indicates a unified emotional identity where the film maintains its intended mood without unintentional whiplash between tonal registers.",
    study: "Nummenmaa, L. et al. (2012), PNAS 109(23)",
    studyDetail: "Emotions promote social interaction by synchronizing brain activity across individuals.",
  },
};

export function getMetricsForContentType(type: string): Record<string, MetricInfo> {
  return type === "feature_film" ? CINEMA_METRICS : METRIC_INFO;
}

// ── Improvement Strategies ───────────────────────────────────────────────────

export interface ImprovementStrategy {
  category: "visual" | "attention" | "script" | "audio" | "pacing" | "emotional";
  title: string;
  description: string;
  actions: string[];
}

export const METRIC_STRATEGIES: Record<string, ImprovementStrategy> = {
  "Visual Hook Strength": {
    category: "visual",
    title: "Strengthen the Visual Hook",
    description: "The opening frames need higher visual salience to trigger the orienting response.",
    actions: [
      "Lead with motion in the first frame — a zoom, pan, or kinetic text.",
      "Use a high-contrast color pop (bright on dark) in the first 1.5 seconds.",
      "Show a face with an expressive emotion in the opening shot.",
      "Avoid static title cards — they produce minimal V1 activation.",
    ],
  },
  "Sustained Attention": {
    category: "attention",
    title: "Improve Sustained Attention",
    description: "Viewer attention drops mid-content. Need more pattern interrupts and novelty injections.",
    actions: [
      "Add a visual pattern interrupt every 8–12 seconds (cut, zoom, graphic overlay).",
      "Vary shot composition — alternate between close-ups and wide shots.",
      "Use audio energy shifts to re-engage the ventral attention network.",
      "Reduce any segment >10s with a single static frame.",
    ],
  },
  "Emotional Resonance": {
    category: "emotional",
    title: "Deepen Emotional Connection",
    description: "Content needs stronger emotional anchors to drive limbic activation.",
    actions: [
      "Include a personal story or testimony — narrative transport activates empathy networks.",
      "Use music that matches the emotional arc (minor key for tension, major for resolution).",
      "Show authentic facial expressions — the mirror neuron system responds to genuine emotion.",
      "Build a clear emotional arc: tension → peak → resolution.",
    ],
  },
  "Memory Encoding": {
    category: "script",
    title: "Boost Memory Encoding",
    description: "Key messages aren't landing in long-term memory. Repetition and emotional pairing are needed.",
    actions: [
      "Repeat the core message 2–3 times using different modalities (spoken, text, visual).",
      "Place key brand moments near emotional peaks — emotion enhances hippocampal consolidation.",
      "Use distinctive visual or audio signatures that become memorable anchors.",
      "End with a strong closing statement — recency effect enhances recall.",
    ],
  },
  "Aesthetic Quality": {
    category: "visual",
    title: "Elevate Production Quality",
    description: "Visual composition and color grading affect perceived brand value.",
    actions: [
      "Apply consistent color grading across all shots.",
      "Use the rule of thirds for subject placement.",
      "Ensure adequate lighting — crushed shadows and blown highlights reduce aesthetic scores.",
      "Add subtle depth of field to direct focus.",
    ],
  },
  "Cognitive Accessibility": {
    category: "script",
    title: "Reduce Cognitive Load",
    description: "The message is too complex for easy processing. Simplify for broader accessibility.",
    actions: [
      "Limit to one key idea per sentence and one CTA per segment.",
      "Replace jargon with plain language — aim for 8th grade reading level.",
      "Use visual aids to explain complex concepts instead of verbal-only.",
      "Reduce on-screen text density — prefer progressive reveal.",
    ],
  },
  "Narrative Coherence": {
    category: "script",
    title: "Tighten the Narrative Arc",
    description: "Story structure needs clearer setup → conflict → resolution to maintain temporal binding.",
    actions: [
      "Open with a question or problem statement to create narrative tension.",
      "Ensure each section clearly connects to the next — avoid non-sequitur cuts.",
      "Use transitional phrases or visual bridges between segments.",
      "End with a resolution that directly answers the opening premise.",
    ],
  },
  "Audio-Visual Sync": {
    category: "audio",
    title: "Improve Audio-Visual Integration",
    description: "Sound and image are slightly misaligned, reducing cross-modal binding.",
    actions: [
      "Sync beat drops and sound effects to visual transitions.",
      "Ensure lip sync is frame-accurate for any talking-head segments.",
      "Use sound design to reinforce visual events (whoosh on swipes, clicks on reveals).",
      "Match music energy to visual pacing — slow music with fast cuts creates dissonance.",
    ],
  },
  "Novelty Response": {
    category: "attention",
    title: "Increase Novelty Signals",
    description: "Content is predictable — the brain's novelty detection system isn't firing.",
    actions: [
      "Subvert expectations — set up a pattern then break it.",
      "Introduce unexpected visual elements or perspectives.",
      "Use counter-intuitive statements or surprising data points.",
      "Vary the visual style within the piece (animation mixed with live action).",
    ],
  },
  "Social Relevance": {
    category: "emotional",
    title: "Boost Social Relevance",
    description: "Content doesn't strongly activate self-referential processing. Make it more personally relatable.",
    actions: [
      "Use 'you' language — directly address the viewer's situation.",
      "Show scenarios the target audience personally identifies with.",
      "Include social proof (testimonials, user counts, community references).",
      "Frame benefits in terms of social identity ('people like you').",
    ],
  },
  "Reward Prediction": {
    category: "script",
    title: "Strengthen Reward Anticipation",
    description: "Viewers don't feel a strong enough payoff is coming. Build more anticipation.",
    actions: [
      "Tease the value proposition early — 'By the end, you'll know how to...'",
      "Use open loops — present a question early, answer it later.",
      "Show a before/after preview to create reward expectation.",
      "Place the most valuable insight after a brief build-up, not at the very start.",
    ],
  },
  "Facial Processing": {
    category: "visual",
    title: "Optimize Face Visibility",
    description: "Faces are powerful attention anchors. Ensure they're used effectively.",
    actions: [
      "Show the speaker's face clearly — avoid obscured or tiny face shots.",
      "Use close-ups during emotional moments to engage the fusiform face area.",
      "Ensure facial expressions match the content's emotional tone.",
      "When possible, have the speaker look directly at camera for parasocial connection.",
    ],
  },
  "Language Processing": {
    category: "script",
    title: "Optimize Language Complexity",
    description: "Spoken language complexity may not match the audience's processing capacity.",
    actions: [
      "Shorten sentence length to 12–15 words on average.",
      "Use concrete, visual language instead of abstract concepts.",
      "Pace delivery at 140–160 WPM for optimal comprehension.",
      "Pause briefly after key points to allow processing time.",
    ],
  },
  "Motion Sensitivity": {
    category: "visual",
    title: "Calibrate Visual Motion",
    description: "Motion needs tuning — either too static or too chaotic for the MT/V5 complex.",
    actions: [
      "Add purposeful camera motion (slow push-in, tracking shots).",
      "Use kinetic typography for text-heavy segments.",
      "Avoid excessive rapid cuts (>3 per second) which cause motion fatigue.",
      "Balance static moments with dynamic ones for pacing variety.",
    ],
  },
  "Arousal Regulation": {
    category: "emotional",
    title: "Regulate Arousal Dynamics",
    description: "Arousal profile is too flat. Effective content has peaks and valleys.",
    actions: [
      "Build intensity gradually — don't start at maximum energy.",
      "Create 'breathing room' between high-arousal moments.",
      "Use contrast: quiet moment → sudden energy spike = maximum impact.",
      "End on a high-arousal note to drive action (CTA at peak).",
    ],
  },
  "Temporal Pacing": {
    category: "pacing",
    title: "Fix Information Pacing",
    description: "Content delivery rate isn't optimized for the audience's processing speed.",
    actions: [
      "Aim for 1 new concept per 5–8 seconds in fast-paced formats.",
      "For demos/talks, slow to 1 concept per 15–20 seconds with examples.",
      "Match cut frequency to information density — more info = slower pace.",
      "Use visual summaries at section breaks to consolidate before moving on.",
    ],
  },
  "Brand Safety": {
    category: "script",
    title: "Maintain Brand Safety",
    description: "Content is brand-safe. No action required unless changes introduce sensitive themes.",
    actions: [
      "Continue avoiding controversial or polarizing visual imagery.",
      "Maintain professional language standards.",
      "Review any user-generated content segments for compliance.",
    ],
  },
  "CTA Effectiveness": {
    category: "script",
    title: "Strengthen the Call-to-Action",
    description: "CTA isn't driving sufficient motor planning activation. It needs to be clearer and better timed.",
    actions: [
      "Place the CTA immediately after an emotional peak (within 3 seconds).",
      "Make the action concrete and singular: 'Click the link below' not 'Visit our website, follow us, and subscribe'.",
      "Use urgency language paired with visual cues (countdown, arrow, highlight).",
      "Repeat the CTA at least twice — once mid-content, once at close.",
    ],
  },
};
