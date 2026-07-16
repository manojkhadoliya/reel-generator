import { Arrow } from "./shared/Arrow";
import { Node } from "./shared/Node";
import type {
  DiagramArrowSpec,
  DiagramNodeSpec,
  DiagramProps,
  DiagramStateConfig,
} from "./shared/types";

/**
 * "How does Face ID actually recognize you" — TrueDepth camera pipeline.
 * Story: User glances at phone -> TrueDepth floods IR light -> Dot projector
 * maps 30,000 points -> IR camera captures depth map -> Neural Engine converts
 * to math model -> Secure Enclave compares with stored enrollment -> match → unlock.
 */

const NODES: Record<string, DiagramNodeSpec> = {
  phone: {
    role: "client",
    label: "iPhone",
    subLabel: "User glance",
    x: 540,
    y: 280,
  },
  truedepth: {
    role: "server",
    label: "TrueDepth",
    subLabel: "IR flood + dots",
    x: 540,
    y: 680,
  },
  neuralEngine: {
    role: "token",
    label: "Neural Engine",
    subLabel: "A-series chip",
    x: 300,
    y: 1100,
  },
  secureEnclave: {
    role: "db",
    label: "Secure Enclave",
    subLabel: "Stored face model",
    x: 780,
    y: 1100,
  },
  result: {
    role: "client",
    label: "Unlock",
    subLabel: "Authenticated",
    x: 540,
    y: 1520,
  },
};

const ARROWS: Record<string, DiagramArrowSpec> = {
  phoneToTruedepth: {
    from: "phone",
    to: "truedepth",
    label: "Wake → IR flood",
  },
  truedepthToNeural: {
    from: "truedepth",
    to: "neuralEngine",
    label: "Depth map (30K dots)",
  },
  neuralToEnclave: {
    from: "neuralEngine",
    to: "secureEnclave",
    label: "Math model",
  },
  enclaveToResult: {
    from: "secureEnclave",
    to: "result",
    label: "Match confirmed",
  },
  enclaveReject: {
    from: "secureEnclave",
    to: "result",
    label: "No match",
    labelOffsetY: 28,
  },
};

export const STATES: Record<string, DiagramStateConfig> = {
  idle: { nodes: [], arrows: [] },
  "user-glance": {
    nodes: ["phone"],
    arrows: [],
    nodeState: { phone: "active" },
  },
  "ir-flood-dots": {
    nodes: ["phone", "truedepth"],
    arrows: ["phoneToTruedepth"],
    nodeState: { phone: "active", truedepth: "active" },
  },
  "depth-map-captured": {
    nodes: ["phone", "truedepth", "neuralEngine"],
    arrows: ["phoneToTruedepth", "truedepthToNeural"],
    nodeState: { truedepth: "success", neuralEngine: "active" },
  },
  "neural-to-enclave": {
    nodes: ["phone", "truedepth", "neuralEngine", "secureEnclave"],
    arrows: ["phoneToTruedepth", "truedepthToNeural", "neuralToEnclave"],
    nodeState: {
      truedepth: "success",
      neuralEngine: "success",
      secureEnclave: "active",
    },
  },
  "match-success": {
    nodes: ["phone", "truedepth", "neuralEngine", "secureEnclave", "result"],
    arrows: ["truedepthToNeural", "neuralToEnclave", "enclaveToResult"],
    nodeState: {
      truedepth: "success",
      neuralEngine: "success",
      secureEnclave: "success",
      result: "success",
    },
    arrowState: { enclaveToResult: "success" },
  },
  "match-failure": {
    nodes: ["phone", "truedepth", "neuralEngine", "secureEnclave", "result"],
    arrows: ["truedepthToNeural", "neuralToEnclave", "enclaveReject"],
    nodeState: {
      truedepth: "success",
      neuralEngine: "success",
      secureEnclave: "error",
      result: "error",
    },
    arrowState: { enclaveReject: "error" },
  },
};

export function FaceIDDiagram({
  state,
  progress,
  highlightNodes,
}: DiagramProps) {
  const config = STATES[state] ?? STATES.idle;

  return (
    <>
      {config.arrows.map((arrowId) => {
        const spec = ARROWS[arrowId];
        const from = NODES[spec.from];
        const to = NODES[spec.to];
        return (
          <Arrow
            key={arrowId}
            from={{ x: from.x, y: from.y }}
            to={{ x: to.x, y: to.y }}
            progress={progress}
            state={config.arrowState?.[arrowId] ?? "active"}
            label={spec.label}
            labelOffsetY={spec.labelOffsetY}
          />
        );
      })}
      {config.nodes.map((nodeId) => {
        const spec = NODES[nodeId];
        const isHighlighted = highlightNodes?.includes(nodeId);
        return (
          <Node
            key={nodeId}
            label={spec.label}
            subLabel={spec.subLabel}
            role={spec.role}
            state={
              config.nodeState?.[nodeId] ?? (isHighlighted ? "active" : "idle")
            }
            x={spec.x}
            y={spec.y}
          />
        );
      })}
    </>
  );
}
