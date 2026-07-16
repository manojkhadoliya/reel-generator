import { Arrow } from "./shared/Arrow";
import { Node } from "./shared/Node";
import type { DiagramArrowSpec, DiagramNodeSpec, DiagramProps, DiagramStateConfig } from "./shared/types";

/**
 * "How logout from all devices works" — stateless JWT variant.
 * Story: JWTs can't be deleted server-side, so the server bumps the user's
 * tokenVersion and adds it to a revocation blocklist -> Device A gets confirmed ->
 * Device B's still-valid-looking JWT fails the blocklist/tokenVersion check on its
 * next request.
 */

const NODES: Record<string, DiagramNodeSpec> = {
  client: { role: "client", label: "Client", subLabel: "Device A", x: 300, y: 480 },
  deviceB: { role: "client", label: "Client", subLabel: "Device B (old JWT)", x: 780, y: 480 },
  server: { role: "server", label: "Auth Server", x: 540, y: 940 },
  blocklist: { role: "token", label: "Token Blocklist", x: 540, y: 1400 },
};

const ARROWS: Record<string, DiagramArrowSpec> = {
  clientToServer: { from: "client", to: "server", label: "POST /logout-all" },
  serverToBlocklist: { from: "server", to: "blocklist", label: "REVOKE tokenVersion(X)" },
  serverToClient: { from: "server", to: "client", label: "200 OK" },
  deviceBToServer: { from: "deviceB", to: "server", label: "GET /profile (old JWT)", labelOffsetY: -28 },
  serverToDeviceB: { from: "server", to: "deviceB", label: "401 token_revoked", labelOffsetY: 22 },
};

export const STATES: Record<string, DiagramStateConfig> = {
  idle: { nodes: [], arrows: [] },
  "client-sends-logout-request": {
    nodes: ["client", "server"],
    arrows: ["clientToServer"],
    nodeState: { client: "active" },
  },
  "server-revokes-token-version": {
    nodes: ["client", "server", "blocklist"],
    arrows: ["clientToServer", "serverToBlocklist"],
    nodeState: { blocklist: "active" },
  },
  "blocklist-updated": {
    nodes: ["client", "server", "blocklist"],
    arrows: ["clientToServer", "serverToBlocklist"],
    nodeState: { blocklist: "success" },
    arrowState: { serverToBlocklist: "success" },
  },
  "server-confirms-client": {
    nodes: ["client", "server", "blocklist"],
    arrows: ["serverToBlocklist", "serverToClient"],
    nodeState: { blocklist: "success", client: "success" },
    arrowState: { serverToBlocklist: "success", serverToClient: "success" },
  },
  "device-b-jwt-rejected": {
    nodes: ["client", "server", "blocklist", "deviceB"],
    arrows: ["serverToBlocklist", "deviceBToServer", "serverToDeviceB"],
    nodeState: { blocklist: "success", client: "success", deviceB: "error" },
    arrowState: { serverToBlocklist: "success", deviceBToServer: "idle", serverToDeviceB: "error" },
  },
};

export function JWTDiagram({ state, progress, highlightNodes }: DiagramProps) {
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
