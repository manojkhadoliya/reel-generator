import type { FC } from "react";
import type { ArrowState, NodeRole, NodeState } from "./theme";

export interface DiagramNodeSpec {
  role: NodeRole;
  label: string;
  subLabel?: string;
  x: number;
  y: number;
}

export interface DiagramArrowSpec {
  from: string;
  to: string;
  label?: string;
  /** Vertical pixel offset for the label, so two arrows between the same pair of nodes don't collide. */
  labelOffsetY?: number;
}

export interface DiagramStateConfig {
  /** Node ids visible at this state (cumulative snapshot, not a diff from the previous state). */
  nodes: string[];
  /** Arrow ids visible at this state. */
  arrows: string[];
  nodeState?: Record<string, NodeState>;
  arrowState?: Record<string, ArrowState>;
}

export interface DiagramProps {
  /** State key within this diagram's own STATES map (the part after "<diagramId>:" in Beat.visual.diagramState). */
  state: string;
  /** 0..1 entrance progress for this beat, computed once by DiagramStage and forwarded to arrows for their draw-on animation. */
  progress: number;
  highlightNodes?: string[];
}

export type DiagramComponent = FC<DiagramProps>;
