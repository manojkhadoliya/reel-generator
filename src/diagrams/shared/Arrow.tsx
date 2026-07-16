import { theme, type ArrowState } from "./theme";

export interface ArrowProps {
  from: { x: number; y: number };
  to: { x: number; y: number };
  /** 0..1, drives the draw-on animation. Computed by the caller (e.g. from a beat-relative spring). */
  progress: number;
  state?: ArrowState;
  label?: string;
  /** Vertical pixel offset for the label, so two arrows between the same pair of nodes don't collide. */
  labelOffsetY?: number;
}

export function Arrow({ from, to, progress, state = "active", label, labelOffsetY = -14 }: ArrowProps) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.sqrt(dx * dx + dy * dy);
  const color = theme.colors.arrow[state];
  const midX = (from.x + to.x) / 2;
  const midY = (from.y + to.y) / 2;
  const dashOffset = length * (1 - progress);
  const markerId = `arrowhead-${state}`;

  return (
    <svg
      style={{ position: "absolute", left: 0, top: 0, overflow: "visible", pointerEvents: "none" }}
      width={1}
      height={1}
    >
      <defs>
        <marker id={markerId} markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto">
          <path d="M0,0 L0,6 L9,3 z" fill={color} />
        </marker>
      </defs>
      <line
        x1={from.x}
        y1={from.y}
        x2={to.x}
        y2={to.y}
        stroke={color}
        strokeWidth={4}
        strokeDasharray={length}
        strokeDashoffset={dashOffset}
        markerEnd={`url(#${markerId})`}
      />
      {label && progress > 0.4 && (
        <text
          x={midX}
          y={midY + labelOffsetY}
          fill={color}
          fontFamily={theme.font.family}
          fontSize={theme.font.nodeSubLabel.size}
          fontWeight={600}
          textAnchor="middle"
          opacity={Math.min(1, (progress - 0.4) / 0.3)}
        >
          {label}
        </text>
      )}
    </svg>
  );
}
