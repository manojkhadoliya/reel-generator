import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { theme, type NodeRole, type NodeState } from "./theme";

export interface NodeProps {
  label: string;
  subLabel?: string;
  role: NodeRole;
  state?: NodeState;
  x: number;
  y: number;
  /** Frame (relative to the current beat's start) at which this node pops in. 0 = already visible. */
  enterFrame?: number;
}

export function Node({ label, subLabel, role, state = "idle", x, y, enterFrame = 0 }: NodeProps) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { nodeWidth: w, nodeHeight: h, nodeRadius } = theme.layout;
  const colors = theme.colors.node[role];
  const stateStyle = theme.colors.state[state];

  const pop = spring({
    frame: Math.max(0, frame - enterFrame),
    fps,
    config: theme.spring.node,
  });
  const scale = interpolate(pop, [0, 1], [0.85, 1]);
  const opacity = interpolate(pop, [0, 1], [0, 1]);
  const strokeColor = stateStyle.accent ?? colors.stroke;

  return (
    <div
      style={{
        position: "absolute",
        left: x - w / 2,
        top: y - h / 2,
        width: w,
        height: h,
        transform: `scale(${scale})`,
        opacity,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: nodeRadius,
        background: colors.fill,
        border: `3px solid ${strokeColor}`,
        boxShadow: stateStyle.glow ? `0 0 ${stateStyle.glow}px ${strokeColor}` : "none",
      }}
    >
      <div
        style={{
          color: colors.label,
          fontFamily: theme.font.family,
          fontWeight: theme.font.nodeLabel.weight,
          fontSize: theme.font.nodeLabel.size,
        }}
      >
        {label}
      </div>
      {subLabel && (
        <div
          style={{
            color: theme.colors.textMuted,
            fontFamily: theme.font.family,
            fontWeight: theme.font.nodeSubLabel.weight,
            fontSize: theme.font.nodeSubLabel.size,
            marginTop: 4,
          }}
        >
          {subLabel}
        </div>
      )}
    </div>
  );
}
