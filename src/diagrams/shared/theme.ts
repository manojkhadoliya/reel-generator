import { devanagariFontFamily } from "./fonts";

export const theme = {
  colors: {
    background: "#0B0F1A",
    surface: "#131826",
    text: "#F5F7FA",
    textMuted: "#8891A7",
    caption: "#FFFFFF",
    captionBg: "rgba(11,15,26,0.82)",
    node: {
      client: { fill: "#1E293B", stroke: "#60A5FA", label: "#E2E8F0" },
      server: { fill: "#1E293B", stroke: "#34D399", label: "#E2E8F0" },
      db: { fill: "#1E293B", stroke: "#FBBF24", label: "#E2E8F0" },
      token: { fill: "#1E293B", stroke: "#C084FC", label: "#E2E8F0" },
    },
    state: {
      idle: { fillOpacity: 0.6, strokeOpacity: 0.5, glow: 0, accent: null as string | null },
      active: { fillOpacity: 1, strokeOpacity: 1, glow: 18, accent: null as string | null },
      success: { fillOpacity: 1, strokeOpacity: 1, glow: 18, accent: "#34D399" as string | null },
      error: { fillOpacity: 1, strokeOpacity: 1, glow: 18, accent: "#F87171" as string | null },
    },
    arrow: {
      idle: "#334155",
      active: "#60A5FA",
      success: "#34D399",
      error: "#F87171",
    },
  },
  font: {
    // Devanagari fallback is bundled (not relying on host-installed fonts) so Hindi captions
    // render correctly inside Remotion's headless-Chromium renderer; Latin text still resolves
    // through Segoe UI/Inter first.
    family: `'Segoe UI', 'Inter', '${devanagariFontFamily}', sans-serif`,
    caption: { size: 52, weight: 700, lineHeight: 1.25 },
    nodeLabel: { size: 26, weight: 600 },
    nodeSubLabel: { size: 18, weight: 400 },
  },
  layout: {
    width: 1080,
    height: 1920,
    fps: 30,
    nodeWidth: 220,
    nodeHeight: 120,
    nodeRadius: 16,
    stagePadding: 96,
    captionBottomOffset: 220,
  },
  spring: {
    node: { damping: 14, mass: 0.6 },
    arrow: { damping: 200 },
  },
} as const;

export type NodeRole = keyof typeof theme.colors.node;
export type NodeState = keyof typeof theme.colors.state;
export type ArrowState = keyof typeof theme.colors.arrow;
