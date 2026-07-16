import { Arrow } from "./shared/Arrow";
import { Node } from "./shared/Node";
import type { DiagramArrowSpec, DiagramNodeSpec, DiagramProps, DiagramStateConfig } from "./shared/types";

/**
 * "How logout from all devices works" — server-side session store variant.
 * Story: Device A asks the server to log out everywhere -> server deletes every
 * session row for that user from the session store -> Device A gets confirmed ->
 * Device B's next request (still holding the old session cookie) gets rejected.
 */

const NODES: Record<string, DiagramNodeSpec> = {
  client: { role: "client", label: "Client", subLabel: "Device A", x: 300, y: 480 },
  deviceB: { role: "client", label: "Client", subLabel: "Device B", x: 780, y: 480 },
  server: { role: "server", label: "Server", x: 540, y: 940 },
  db: { role: "db", label: "Session Store", x: 540, y: 1400 },
};

const ARROWS: Record<string, DiagramArrowSpec> = {
  clientToServer: { from: "client", to: "server", label: "DELETE /sessions" },
  serverToDb: { from: "server", to: "db", label: "DELETE WHERE userId = X" },
  serverToClient: { from: "server", to: "client", label: "200 OK" },
  deviceBToServer: { from: "deviceB", to: "server", label: "GET /profile (old cookie)", labelOffsetY: -28 },
  serverToDeviceB: { from: "server", to: "deviceB", label: "401 Unauthorized", labelOffsetY: 22 },
};

export const STATES: Record<string, DiagramStateConfig> = {
  idle: { nodes: [], arrows: [] },
  "client-sends-logout-request": {
    nodes: ["client", "server"],
    arrows: ["clientToServer"],
    nodeState: { client: "active" },
  },
  "server-deletes-all-sessions": {
    nodes: ["client", "server", "db"],
    arrows: ["clientToServer", "serverToDb"],
    nodeState: { db: "active" },
  },
  "session-store-cleared": {
    nodes: ["client", "server", "db"],
    arrows: ["clientToServer", "serverToDb"],
    nodeState: { db: "success" },
    arrowState: { serverToDb: "success" },
  },
  "server-confirms-client": {
    nodes: ["client", "server", "db"],
    arrows: ["serverToDb", "serverToClient"],
    nodeState: { db: "success", client: "success" },
    arrowState: { serverToDb: "success", serverToClient: "success" },
  },
  "other-device-rejected": {
    nodes: ["client", "server", "db", "deviceB"],
    arrows: ["serverToDb", "deviceBToServer", "serverToDeviceB"],
    nodeState: { db: "success", client: "success", deviceB: "error" },
    arrowState: { serverToDb: "success", deviceBToServer: "idle", serverToDeviceB: "error" },
  },
};

export function SessionDiagram({ state, progress, highlightNodes }: DiagramProps) {
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
            state={config.nodeState?.[nodeId] ?? (isHighlighted ? "active" : "idle")}
            x={spec.x}
            y={spec.y}
          />
        );
      })}
    </>
  );
}
