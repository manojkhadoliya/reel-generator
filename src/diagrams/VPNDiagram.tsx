import { Arrow } from "./shared/Arrow";
import { Node } from "./shared/Node";
import type { DiagramArrowSpec, DiagramNodeSpec, DiagramProps, DiagramStateConfig } from "./shared/types";

/**
 * "What is a VPN actually doing? (the tunnel analogy)"
 * Story: without a VPN, the device's requests are readable by anyone on the
 * local network/ISP hop -> a VPN client encrypts packets on-device -> the
 * encrypted tunnel runs to a VPN server, which is the only party that can
 * decrypt it -> the VPN server forwards the real request to the destination
 * and relays the response back through the same encrypted tunnel.
 */

const NODES: Record<string, DiagramNodeSpec> = {
  device: { role: "client", label: "Your Device", x: 540, y: 380 },
  isp: { role: "db", label: "ISP / Wi-Fi", x: 540, y: 760 },
  vpnServer: { role: "server", label: "VPN Server", x: 540, y: 1140 },
  destination: { role: "token", label: "bank.com", x: 540, y: 1520 },
};

const ARROWS: Record<string, DiagramArrowSpec> = {
  deviceToIspPlain: { from: "device", to: "isp", label: "GET bank.com/login (plaintext)" },
  ispToDestDirect: { from: "isp", to: "destination", label: "forwarded as-is, visible to anyone" },
  deviceToIspEncrypted: { from: "device", to: "isp", label: "encrypted packet" },
  ispToVpn: { from: "isp", to: "vpnServer", label: "opaque bytes -> VPN server" },
  vpnToDest: { from: "vpnServer", to: "destination", label: "decrypted request" },
  destToVpn: { from: "destination", to: "vpnServer", label: "response", labelOffsetY: -28 },
  vpnToIspEncrypted: { from: "vpnServer", to: "isp", label: "re-encrypted response", labelOffsetY: 22 },
  ispToDeviceEncrypted: { from: "isp", to: "device", label: "encrypted response", labelOffsetY: -28 },
};

export const STATES: Record<string, DiagramStateConfig> = {
  idle: { nodes: [], arrows: [] },
  "no-vpn-exposed": {
    nodes: ["device", "isp", "destination"],
    arrows: ["deviceToIspPlain", "ispToDestDirect"],
    nodeState: { isp: "error", destination: "idle" },
    arrowState: { deviceToIspPlain: "error", ispToDestDirect: "error" },
  },
  "isp-sees-everything": {
    nodes: ["device", "isp", "destination"],
    arrows: ["deviceToIspPlain", "ispToDestDirect"],
    nodeState: { isp: "error", destination: "error" },
    arrowState: { deviceToIspPlain: "error", ispToDestDirect: "error" },
  },
  "device-encrypts": {
    nodes: ["device", "isp"],
    arrows: ["deviceToIspEncrypted"],
    nodeState: { device: "success" },
    arrowState: { deviceToIspEncrypted: "active" },
  },
  "encrypted-tunnel-to-vpn": {
    nodes: ["device", "isp", "vpnServer"],
    arrows: ["deviceToIspEncrypted", "ispToVpn"],
    nodeState: { device: "success", isp: "idle", vpnServer: "active" },
    arrowState: { deviceToIspEncrypted: "success", ispToVpn: "active" },
  },
  "vpn-decrypts-forwards": {
    nodes: ["device", "isp", "vpnServer", "destination"],
    arrows: ["ispToVpn", "vpnToDest"],
    nodeState: { isp: "idle", vpnServer: "success", destination: "active" },
    arrowState: { ispToVpn: "success", vpnToDest: "active" },
  },
  "response-returns-encrypted": {
    nodes: ["device", "isp", "vpnServer", "destination"],
    arrows: ["destToVpn", "vpnToIspEncrypted", "ispToDeviceEncrypted"],
    nodeState: { destination: "success", vpnServer: "active", isp: "idle", device: "active" },
    arrowState: { destToVpn: "success", vpnToIspEncrypted: "active", ispToDeviceEncrypted: "active" },
  },
  "tunnel-summary": {
    nodes: ["device", "isp", "vpnServer", "destination"],
    arrows: ["deviceToIspEncrypted", "ispToVpn", "vpnToDest"],
    nodeState: { device: "success", isp: "idle", vpnServer: "success", destination: "success" },
    arrowState: { deviceToIspEncrypted: "success", ispToVpn: "success", vpnToDest: "success" },
  },
};

export function VPNDiagram({ state, progress, highlightNodes }: DiagramProps) {
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
