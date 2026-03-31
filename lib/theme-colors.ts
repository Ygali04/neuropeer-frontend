// Canvas/chart color helper — reads theme from DOM

export function isLightMode(): boolean {
  if (typeof document === "undefined") return false;
  return document.documentElement.classList.contains("light");
}

export function chartBg(): string {
  return isLightMode() ? "rgba(245, 243, 239, 0.6)" : "rgba(7, 6, 11, 0.6)";
}

export function chartGrid(): string {
  return isLightMode() ? "rgba(0,0,0,0.1)" : "rgba(255,255,255,0.04)";
}

export function chartLabel(): string {
  return isLightMode() ? "rgba(0,0,0,0.5)" : "rgba(255,255,255,0.2)";
}

export function chartZones() {
  const light = isLightMode();
  return {
    low: light ? "rgba(220, 38, 38, 0.06)" : "rgba(248, 113, 113, 0.04)",
    mid: light ? "rgba(180, 83, 9, 0.05)" : "rgba(251, 191, 36, 0.03)",
    high: light ? "rgba(5, 150, 105, 0.05)" : "rgba(52, 211, 153, 0.03)",
  };
}

export function chartLine(): string {
  return isLightMode() ? "#9a3412" : "#f97316";
}

export function chartLineFill(): [string, string, string] {
  return isLightMode()
    ? ["rgba(154, 52, 18, 0.18)", "rgba(154, 52, 18, 0.05)", "rgba(154, 52, 18, 0)"]
    : ["rgba(249, 115, 22, 0.15)", "rgba(249, 115, 22, 0.03)", "rgba(249, 115, 22, 0)"];
}

export function chartEmotionLine(): string {
  return isLightMode() ? "rgba(146, 64, 14, 0.6)" : "rgba(251, 191, 36, 0.3)";
}

export function chartCognitiveLine(): string {
  return isLightMode() ? "rgba(185, 28, 28, 0.7)" : "#f87171";
}

export function chartArousalLine(): string {
  return isLightMode() ? "rgba(146, 64, 14, 0.85)" : "#fbbf24";
}

export function dotStroke(): string {
  return isLightMode() ? "rgba(255, 255, 255, 0.9)" : "rgba(7, 6, 11, 0.9)";
}

export function modalityColors() {
  const light = isLightMode();
  return {
    visual: light ? "#7c2d12" : "#f97316",
    audio: light ? "#78350f" : "#fbbf24",
    text: light ? "#044f44" : "#2dd4bf",
  };
}
