"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Brain, Loader2, RotateCcw, Flame, Palette } from "lucide-react";
import { cn } from "@/lib/utils";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { getBrainMap } from "@/lib/api";
import * as THREE from "three";

interface Props {
  jobId: string;
  currentSecond: number;
  isPlaying?: boolean;
  playbackTime?: number;
}

interface BrainRegionData { v: number[]; i: number[]; c: number; }

type ViewMode = "heatmap" | "regions";

// ── "Hot" colormap matching TRIBE v2: gray base, intense localized hotspots ──

function hotColor(t: number): [number, number, number, number] {
  // Hard threshold: below 0.45 = fully gray (most of the brain)
  if (t < 0.45) return [0, 0, 0, 0]; // alpha 0 = gray base shows through

  // Remap 0.45–1.0 → 0–1 for color ramp
  const s = (t - 0.45) / 0.55;

  let r: number, g: number, b: number;
  if (s < 0.3) {
    // Deep red
    const f = s / 0.3;
    r = 0.6 + f * 0.3; g = 0.02 + f * 0.05; b = 0;
  } else if (s < 0.55) {
    // Bright red-orange
    const f = (s - 0.3) / 0.25;
    r = 0.9 + f * 0.1; g = 0.07 + f * 0.25; b = 0;
  } else if (s < 0.8) {
    // Orange to yellow
    const f = (s - 0.55) / 0.25;
    r = 1.0; g = 0.32 + f * 0.45; b = f * 0.05;
  } else {
    // Yellow to bright yellow-white
    const f = (s - 0.8) / 0.2;
    r = 1.0; g = 0.77 + f * 0.23; b = 0.05 + f * 0.55;
  }

  // Alpha ramps sharply — visible hotspots are fully opaque
  const alpha = Math.min(1.0, s * 2.0);
  return [r, g, b, alpha];
}

// Region-tinted: region color glow with hot overlay at peak
function regionTintedHot(t: number, regionHue: THREE.Color): [number, number, number] {
  if (t < 0.35) return [0, 0, 0]; // alpha 0 → gray base

  const s = (t - 0.35) / 0.65;
  const alpha = Math.min(1.0, s * 2.0);

  // Blend: region color at low, hot yellow at peak
  const hotBlend = Math.max(0, (s - 0.5) * 2); // 0–1, kicks in upper half
  const cr = regionHue.r * (1 - hotBlend) + 1.0 * hotBlend;
  const cg = regionHue.g * (1 - hotBlend) + 0.8 * hotBlend;
  const cb = regionHue.b * (1 - hotBlend) + 0.3 * hotBlend;

  return [alpha * cr, alpha * cg, alpha * cb];
}

// ── Region config ────────────────────────────────────────────────────────

const REGION_CONFIG: Record<string, { label: string; color: string; activationKey: string; info: { title: string; description: string; study: string; studyDetail: string } }> = {
  prefrontal: { label: "Prefrontal", color: "#f97316", activationKey: "Prefrontal", info: { title: "Prefrontal Cortex", description: "Executive function, decision-making, working memory.", study: "Miller & Cohen (2001), Ann. Rev. Neuroscience 24", studyDetail: "An integrative theory of prefrontal cortex function." } },
  visual: { label: "Visual Cortex", color: "#34d399", activationKey: "Visual Cortex", info: { title: "Visual Cortex (V1–V5)", description: "Visual processing — motion, color, contrast, and form.", study: "Tootell et al. (1998), J. Neuroscience 18(17)", studyDetail: "The retinotopy of visual spatial attention." } },
  auditory: { label: "Auditory", color: "#fbbf24", activationKey: "Auditory", info: { title: "Auditory Cortex", description: "Sound processing, speech comprehension, music.", study: "Zatorre et al. (2007), Nat. Rev. Neuroscience 8(7)", studyDetail: "When the brain plays music." } },
  limbic: { label: "Limbic", color: "#f87171", activationKey: "Limbic", info: { title: "Limbic System", description: "Emotional processing and memory consolidation.", study: "Phelps & LeDoux (2005), Neuron 48(2)", studyDetail: "Amygdala contributions to emotion." } },
  default_mode: { label: "Default Mode", color: "#c084fc", activationKey: "Default Mode", info: { title: "Default Mode Network", description: "Self-referential processing, narrative comprehension.", study: "Raichle et al. (2001), PNAS 98(2)", studyDetail: "A default mode of brain function." } },
  temporal: { label: "Temporal", color: "#60a5fa", activationKey: "Auditory", info: { title: "Temporal Lobe", description: "Language, object recognition, semantic processing.", study: "Kanwisher et al. (1997), J. Neuroscience 17(11)", studyDetail: "The fusiform face area." } },
  parietal: { label: "Parietal", color: "#2dd4bf", activationKey: "Visual Cortex", info: { title: "Parietal Lobe", description: "Spatial attention, sensory integration.", study: "Corbetta & Shulman (2002), Nat. Rev. Neuroscience 3(3)", studyDetail: "Control of goal-directed attention." } },
  motor: { label: "Motor", color: "#94a3b8", activationKey: "Prefrontal", info: { title: "Motor / Somatosensory", description: "Action planning and body sensation.", study: "Cunnington et al. (2002), Human Brain Mapping 15(3)", studyDetail: "Self-initiated movement." } },
  subcortical: { label: "Subcortical", color: "#a78bfa", activationKey: "Limbic", info: { title: "Subcortical Structures", description: "Thalamus, basal ganglia, brainstem.", study: "Knutson et al. (2001), NeuroImage 14(2)", studyDetail: "Reward anticipation." } },
};

const DISPLAY_REGIONS = ["prefrontal", "visual", "auditory", "limbic", "default_mode", "temporal", "parietal", "motor", "subcortical"];

interface ActivationSnapshot { second: number; scores: Record<string, number>; }

export function BrainMap3D({ jobId, currentSecond, isPlaying = false, playbackTime = 0 }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const regionMeshesRef = useRef<Map<string, THREE.Mesh>>(new Map());
  const frameRef = useRef<number>(0);
  const mouseRef = useRef({ isDown: false, prevX: 0, prevY: 0 });
  const targetRotRef = useRef({ x: 0.15, y: -0.3 });
  const rotRef = useRef({ x: 0.15, y: -0.3 });
  const prevActivationRef = useRef<ActivationSnapshot | null>(null);
  const currActivationRef = useRef<ActivationSnapshot | null>(null);
  const playbackTimeRef = useRef(0);
  const vertexSeedsRef = useRef<Map<string, Float32Array>>(new Map());
  const viewModeRef = useRef<ViewMode>("heatmap");

  const [loading, setLoading] = useState(true);
  const [regionScores, setRegionScores] = useState<Record<string, number>>({});
  const [hoveredRegion, setHoveredRegion] = useState<string | null>(null);
  const [selectedRegion, setSelectedRegion] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("heatmap");

  useEffect(() => { playbackTimeRef.current = playbackTime; }, [playbackTime]);
  useEffect(() => { viewModeRef.current = viewMode; }, [viewMode]);

  // Apply per-vertex colors based on mode
  const applyVertexColors = useCallback((mesh: THREE.Mesh, regionKey: string, activation: number) => {
    const geom = mesh.geometry;
    const positions = geom.getAttribute("position");
    const count = positions.count;
    const config = REGION_CONFIG[regionKey];
    if (!config) return;
    const regionColor = new THREE.Color(config.color);

    let seeds = vertexSeedsRef.current.get(regionKey);
    if (!seeds || seeds.length !== count) {
      seeds = new Float32Array(count);
      const pos = positions.array as Float32Array;
      for (let i = 0; i < count; i++) {
        const x = pos[i*3], y = pos[i*3+1], z = pos[i*3+2];
        // Low-frequency spatial pattern → larger, fewer hotspot patches (like TRIBE)
        const wave1 = Math.sin(x * 0.15 + y * 0.2) * Math.cos(z * 0.18);
        const wave2 = Math.sin(y * 0.12 - z * 0.15 + x * 0.1);
        const wave3 = Math.cos(x * 0.22 + z * 0.13);
        const raw = (wave1 + wave2 * 0.7 + wave3 * 0.5) / 2.2;
        // Sigmoid-like sharpening: push values toward 0 or 1
        const sharp = 1 / (1 + Math.exp(-8 * (raw)));
        seeds[i] = sharp;
      }
      vertexSeedsRef.current.set(regionKey, seeds);
    }

    let colorAttr = geom.getAttribute("color") as THREE.BufferAttribute | null;
    if (!colorAttr) {
      colorAttr = new THREE.BufferAttribute(new Float32Array(count * 3), 3);
      geom.setAttribute("color", colorAttr);
    }
    const colors = colorAttr.array as Float32Array;
    const mode = viewModeRef.current;

    // Gray base (TRIBE-style sulcal background)
    const bgR = 0.58, bgG = 0.56, bgB = 0.54;

    for (let i = 0; i < count; i++) {
      const spatial = seeds[i];
      // Create sharp hotspot clusters: only vertices where spatial seed is high AND activation is high
      // This produces localized patches, not uniform spread
      const clusterStrength = spatial * spatial; // square to make peaks sharper
      const vertAct = activation * (0.2 + clusterStrength * 1.8);
      const clamped = Math.max(0, Math.min(1, vertAct));

      if (mode === "heatmap") {
        const [hr, hg, hb, alpha] = hotColor(clamped);
        colors[i*3]   = alpha * hr + (1-alpha) * bgR;
        colors[i*3+1] = alpha * hg + (1-alpha) * bgG;
        colors[i*3+2] = alpha * hb + (1-alpha) * bgB;
      } else {
        const [cr, cg, cb] = regionTintedHot(clamped, regionColor);
        colors[i*3]   = cr > 0 ? cr : bgR;
        colors[i*3+1] = cg > 0 ? cg : bgG;
        colors[i*3+2] = cb > 0 ? cb : bgB;
      }
    }
    colorAttr.needsUpdate = true;
  }, []);

  // Init Three.js + load meshes
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const width = container.clientWidth;
    const height = 380;
    const scene = new THREE.Scene();

    const camera = new THREE.PerspectiveCamera(35, width / height, 0.1, 100);
    camera.position.set(0, 0.8, 5.5);
    camera.lookAt(0, 0, 0);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.5;
    container.appendChild(renderer.domElement);

    scene.add(new THREE.AmbientLight(0xffffff, 0.35));
    const kl = new THREE.DirectionalLight(0xfff8f0, 1.2); kl.position.set(4,5,6); scene.add(kl);
    const fl = new THREE.DirectionalLight(0xe8e4f0, 0.35); fl.position.set(-4,0,4); scene.add(fl);
    const rl = new THREE.DirectionalLight(0xffeedd, 0.25); rl.position.set(-1,3,-5); scene.add(rl);

    const group = new THREE.Group();
    scene.add(group);

    // Animate with per-vertex color interpolation
    const animate = () => {
      frameRef.current = requestAnimationFrame(animate);
      rotRef.current.x += (targetRotRef.current.x - rotRef.current.x) * 0.06;
      rotRef.current.y += (targetRotRef.current.y - rotRef.current.y) * 0.06;
      if (!mouseRef.current.isDown) targetRotRef.current.y += 0.0015;
      group.rotation.x = rotRef.current.x;
      group.rotation.y = rotRef.current.y;

      const prev = prevActivationRef.current;
      const curr = currActivationRef.current;
      if (prev && curr) {
        const t = playbackTimeRef.current;
        const frac = prev.second !== curr.second
          ? Math.max(0, Math.min(1, (t - prev.second) / (curr.second - prev.second)))
          : 0;
        regionMeshesRef.current.forEach((mesh, regionKey) => {
          const cfg = REGION_CONFIG[regionKey]; if (!cfg) return;
          const a = prev.scores[cfg.activationKey] ?? 0;
          const b = curr.scores[cfg.activationKey] ?? 0;
          const interp = a + (b - a) * frac;
          const norm = Math.max(0, Math.min(1, (interp + 3) / 6));
          applyVertexColors(mesh, regionKey, norm);
        });
      }

      renderer.render(scene, camera);
    };
    animate();

    // Load meshes
    fetch("/brain-models/brain-regions.json")
      .then(r => r.json())
      .then((data: Record<string, BrainRegionData>) => {
        Object.entries(data).forEach(([regionKey, rd]) => {
          if (!REGION_CONFIG[regionKey]) return;
          const geom = new THREE.BufferGeometry();
          geom.setAttribute("position", new THREE.BufferAttribute(new Float32Array(rd.v), 3));
          geom.setIndex(new THREE.BufferAttribute(new Uint32Array(rd.i), 1));
          geom.computeVertexNormals();
          const count = rd.v.length / 3;
          const cols = new Float32Array(count * 3);
          for (let i = 0; i < count; i++) { cols[i*3]=0.60; cols[i*3+1]=0.60; cols[i*3+2]=0.58; }
          geom.setAttribute("color", new THREE.BufferAttribute(cols, 3));

          const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.0, side: THREE.FrontSide, flatShading: true });
          const mesh = new THREE.Mesh(geom, mat);
          mesh.userData = { regionKey };
          group.add(mesh);
          regionMeshesRef.current.set(regionKey, mesh);
        });

        const box = new THREE.Box3().setFromObject(group);
        const c = box.getCenter(new THREE.Vector3());
        const s = box.getSize(new THREE.Vector3());
        const sc = 3.0 / Math.max(s.x, s.y, s.z);
        group.position.set(-c.x*sc, -c.y*sc, -c.z*sc);
        group.scale.setScalar(sc);
        setLoading(false);
      })
      .catch(e => { console.error("Brain load error:", e); setLoading(false); });

    const onResize = () => { const w=container.clientWidth; camera.aspect=w/height; camera.updateProjectionMatrix(); renderer.setSize(w,height); };
    window.addEventListener("resize", onResize);
    return () => { cancelAnimationFrame(frameRef.current); window.removeEventListener("resize", onResize); renderer.dispose(); if (container.contains(renderer.domElement)) container.removeChild(renderer.domElement); };
  }, [applyVertexColors]);

  // Fetch activations
  useEffect(() => {
    let cancelled = false;
    const fetchScores = async (sec: number): Promise<Record<string, number>> => {
      const d = await getBrainMap(jobId, sec);
      const v = d.vertex_activations; const n = v.length;
      return {
        Prefrontal: avg(v.slice(0, Math.floor(n*0.15))),
        "Visual Cortex": avg(v.slice(Math.floor(n*0.15), Math.floor(n*0.35))),
        Auditory: avg(v.slice(Math.floor(n*0.35), Math.floor(n*0.55))),
        Limbic: avg(v.slice(Math.floor(n*0.55), Math.floor(n*0.75))),
        "Default Mode": avg(v.slice(Math.floor(n*0.75))),
      };
    };
    (async () => {
      try {
        const scores = await fetchScores(currentSecond);
        if (cancelled) return;
        prevActivationRef.current = currActivationRef.current ?? { second: currentSecond, scores };
        currActivationRef.current = { second: currentSecond, scores };
        setRegionScores(scores);
        if (!isPlaying) {
          regionMeshesRef.current.forEach((mesh, rk) => {
            const cfg = REGION_CONFIG[rk]; if (!cfg) return;
            applyVertexColors(mesh, rk, Math.max(0, Math.min(1, ((scores[cfg.activationKey]??0)+3)/6)));
          });
        }
        const next = await fetchScores(currentSecond + 1);
        if (cancelled) return;
        prevActivationRef.current = { second: currentSecond, scores };
        currActivationRef.current = { second: currentSecond + 1, scores: next };
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [jobId, currentSecond, isPlaying, applyVertexColors]);

  // Mouse handlers
  const onMD = useCallback((e: React.MouseEvent) => { mouseRef.current.isDown=true; mouseRef.current.prevX=e.clientX; mouseRef.current.prevY=e.clientY; }, []);
  const onMM = useCallback((e: React.MouseEvent) => {
    const c = containerRef.current; if (!c) return;
    if (mouseRef.current.isDown) {
      targetRotRef.current.y += (e.clientX-mouseRef.current.prevX)*0.006;
      targetRotRef.current.x += (e.clientY-mouseRef.current.prevY)*0.004;
      targetRotRef.current.x = Math.max(-1, Math.min(1, targetRotRef.current.x));
      mouseRef.current.prevX=e.clientX; mouseRef.current.prevY=e.clientY; return;
    }
    const rect=c.getBoundingClientRect();
    const m = new THREE.Vector2(((e.clientX-rect.left)/rect.width)*2-1, -((e.clientY-rect.top)/rect.height)*2+1);
    const ray = new THREE.Raycaster();
    if (cameraRef.current) {
      ray.setFromCamera(m, cameraRef.current);
      const hits = ray.intersectObjects([...regionMeshesRef.current.values()]);
      if (hits.length > 0) { setHoveredRegion((hits[0].object as THREE.Mesh).userData.regionKey); c.style.cursor="pointer"; }
      else { setHoveredRegion(null); c.style.cursor="grab"; }
    }
  }, []);
  const onMU = useCallback(() => { mouseRef.current.isDown=false; }, []);
  const onClick = useCallback((e: React.MouseEvent) => {
    if (!cameraRef.current || !containerRef.current) return;
    const rect=containerRef.current.getBoundingClientRect();
    const m = new THREE.Vector2(((e.clientX-rect.left)/rect.width)*2-1, -((e.clientY-rect.top)/rect.height)*2+1);
    const ray = new THREE.Raycaster(); ray.setFromCamera(m, cameraRef.current);
    const hits = ray.intersectObjects([...regionMeshesRef.current.values()]);
    if (hits.length > 0) { const k=(hits[0].object as THREE.Mesh).userData.regionKey; setSelectedRegion(p=>p===k?null:k); }
    else setSelectedRegion(null);
  }, []);
  const onReset = useCallback(() => { targetRotRef.current={x:0.15,y:-0.3}; setSelectedRegion(null); }, []);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Brain className="w-4 h-4 text-brand-400" />
          <h3 className="text-sm font-medium text-white/60">Brain Activity Map</h3>
          {loading && <Loader2 className="w-3 h-3 text-white/30 animate-spin ml-1" />}
        </div>
        <div className="flex items-center gap-2">
          {/* View mode toggle */}
          <div className="flex items-center rounded-lg overflow-hidden border border-white/[0.06]">
            <button
              onClick={() => setViewMode("heatmap")}
              className={cn("flex items-center gap-1 px-2 py-1 text-[10px] font-medium transition-colors",
                viewMode === "heatmap" ? "bg-brand-500/15 text-brand-400" : "text-white/30 hover:text-white/50")}
              title="Heatmap view"
            >
              <Flame className="w-3 h-3" /> Heat
            </button>
            <button
              onClick={() => setViewMode("regions")}
              className={cn("flex items-center gap-1 px-2 py-1 text-[10px] font-medium transition-colors",
                viewMode === "regions" ? "bg-brand-500/15 text-brand-400" : "text-white/30 hover:text-white/50")}
              title="Region color view"
            >
              <Palette className="w-3 h-3" /> Regions
            </button>
          </div>
          <span className="text-[10px] text-white/20 tabular-nums">t = {currentSecond}s</span>
          <button onClick={onReset} className="p-1.5 rounded-lg hover:bg-white/[0.06] text-white/20 hover:text-white/40 transition-colors" title="Reset view">
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <div ref={containerRef}
        className="relative w-full rounded-xl overflow-hidden cursor-grab active:cursor-grabbing"
        style={{ height: 380, background: "radial-gradient(ellipse at 50% 40%, #100e16 0%, #050408 100%)" }}
        onMouseDown={onMD} onMouseMove={onMM} onMouseUp={onMU} onMouseLeave={onMU} onClick={onClick}
      >
        {hoveredRegion && !mouseRef.current.isDown && (
          <div className="absolute top-3 left-3 rounded-lg p-2.5 pointer-events-none z-10" style={{ background:"#15131a", border:"1px solid rgba(255,255,255,0.08)" }}>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: REGION_CONFIG[hoveredRegion]?.color }} />
              <span className="text-xs font-medium text-white/80">{REGION_CONFIG[hoveredRegion]?.label}</span>
              {regionScores[REGION_CONFIG[hoveredRegion]?.activationKey] !== undefined && (
                <span className="text-xs text-white/40 tabular-nums">{Math.max(0, Math.min(100, ((regionScores[REGION_CONFIG[hoveredRegion]?.activationKey]+3)/6)*100)).toFixed(0)}%</span>
              )}
            </div>
          </div>
        )}
        {/* Legend */}
        {/* Activity legend bar — matches TRIBE v2 */}
        <div className="absolute top-3 right-3 flex flex-col items-center gap-0.5 pointer-events-none z-10">
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-white/40">Low</span>
            <div className="w-28 h-2 rounded-sm" style={{ background: "linear-gradient(to right, #8b0000, #cc2200, #e04500, #f07000, #f5a000, #ffc840, #ffe080, #fff4cc)" }} />
            <span className="text-[10px] text-white/40">High</span>
          </div>
          <span className="text-[9px] text-white/25">Activity</span>
        </div>
        <div className="absolute bottom-2 right-2 text-[10px] text-white/10 pointer-events-none">Drag to rotate · Click region</div>
      </div>

      {/* Region bars */}
      <div className="grid grid-cols-1 gap-1.5">
        {DISPLAY_REGIONS.map(rk => {
          const cfg = REGION_CONFIG[rk]; if (!cfg) return null;
          const raw = regionScores[cfg.activationKey] ?? 0;
          const norm = Math.max(0, Math.min(100, ((raw+3)/6)*100));
          const active = selectedRegion===rk || hoveredRegion===rk;
          return (
            <button key={rk} onClick={() => setSelectedRegion(p=>p===rk?null:rk)}
              className={cn("flex items-center gap-2.5 px-2 py-1.5 rounded-lg transition-all duration-200 text-left", active?"bg-white/[0.04]":"hover:bg-white/[0.02]")}>
              <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor:cfg.color, boxShadow:active?`0 0 8px ${cfg.color}40`:`0 0 4px ${cfg.color}20` }} />
              <span className={cn("text-xs flex-shrink-0 w-24", active?"text-white/60":"text-white/35")}>{cfg.label}</span>
              <div className="flex-1 h-1 rounded-full overflow-hidden" style={{ backgroundColor: `${cfg.color}15` }}>
                <div className="h-full rounded-full transition-all duration-500" style={{
                  width: `${norm}%`,
                  background: `linear-gradient(to right, ${cfg.color}40, ${cfg.color})`,
                  opacity: active ? 0.95 : 0.7,
                }} />
              </div>
              <span className={cn("text-xs w-8 text-right tabular-nums", active?"text-white/50":"text-white/30")}>{norm.toFixed(0)}</span>
              <span onClick={e=>e.stopPropagation()}>
                <InfoTooltip title={cfg.info.title} description={cfg.info.description} study={cfg.info.study} studyDetail={cfg.info.studyDetail} iconSize={12} />
              </span>
            </button>
          );
        })}
      </div>

      {selectedRegion && (() => {
        const cfg = REGION_CONFIG[selectedRegion]; if (!cfg) return null;
        const norm = Math.max(0, Math.min(100, (((regionScores[cfg.activationKey]??0)+3)/6)*100));
        return (
          <div className="glass-card !p-4 animate-fade-up" style={{ borderColor:cfg.color+"20" }}>
            <div className="flex items-center gap-2 mb-2">
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor:cfg.color, boxShadow:`0 0 8px ${cfg.color}40` }} />
              <span className="text-sm font-medium text-white/70">{cfg.label}</span>
              <span className="ml-auto text-sm font-semibold tabular-nums" style={{ color:norm>=60?"var(--color-score-green)":norm>=40?"var(--color-score-amber)":"var(--color-score-red)" }}>{norm.toFixed(0)}%</span>
            </div>
            <p className="text-xs text-white/40 leading-relaxed">{cfg.info.description}</p>
          </div>
        );
      })()}
    </div>
  );
}

function avg(a: number[]): number { return a.length ? a.reduce((s,v)=>s+v,0)/a.length : 0; }
