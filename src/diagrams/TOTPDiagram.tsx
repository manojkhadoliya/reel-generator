import { Arrow } from "./shared/Arrow";
import { Node } from "./shared/Node";
import type { DiagramArrowSpec, DiagramNodeSpec, DiagramProps, DiagramStateConfig } from "./shared/types";

/**
 * "How does 2FA/TOTP actually verify your 6-digit code" — shared-secret variant.
 * Story: phone and server share a secret at enrollment -> both independently derive
 * a 30-second time counter -> both run HMAC-SHA1(secret, counter) -> both truncate
 * the hash to 6 digits -> server compares its own code against what you typed,
 * with no network round trip to the phone required.
 */

const NODES: Record<string, DiagramNodeSpec> = {
  phone: { role: "client", label: "Authenticator App", subLabel: "Phone", x: 300, y: 260 },
  server: { role: "server", label: "Server", x: 780, y: 260 },
  secret: { role: "token", label: "Shared Secret", subLabel: "Set at enrollment", x: 540, y: 520 },
  clock: { role: "token", label: "Time Counter", subLabel: "Unix time / 30s", x: 540, y: 780 },
  hmacPhone: { role: "token", label: "HMAC-SHA1", subLabel: "Phone", x: 300, y: 1040 },
  hmacServer: { role: "token", label: "HMAC-SHA1", subLabel: "Server", x: 780, y: 1040 },
  codePhone: { role: "token", label: "6-digit code", subLabel: "Truncated", x: 300, y: 1300 },
  codeServer: { role: "token", label: "6-digit code", subLabel: "Truncated", x: 780, y: 1300 },
  compare: { role: "db", label: "Compare", x: 540, y: 1560 },
};

const ARROWS: Record<string, DiagramArrowSpec> = {
  secretToPhone: { from: "secret", to: "phone", label: "stored" },
  secretToServer: { from: "secret", to: "server", label: "stored" },
  clockToPhone: { from: "clock", to: "phone", label: "reads time" },
  clockToServer: { from: "clock", to: "server", label: "reads time" },
  phoneToHmacPhone: { from: "phone", to: "hmacPhone", label: "HMAC-SHA1" },
  serverToHmacServer: { from: "server", to: "hmacServer", label: "HMAC-SHA1" },
  hmacPhoneToCodePhone: { from: "hmacPhone", to: "codePhone", label: "truncate" },
  hmacServerToCodeServer: { from: "hmacServer", to: "codeServer", label: "truncate" },
  codePhoneToCompare: { from: "codePhone", to: "compare", label: "you type it" },
  codeServerToCompare: { from: "codeServer", to: "compare" },
};

const ENROLLMENT_ARROWS = ["secretToPhone", "secretToServer"];
const CLOCK_ARROWS = [...ENROLLMENT_ARROWS, "clockToPhone", "clockToServer"];
const PHONE_HASH_ARROWS = [...CLOCK_ARROWS, "phoneToHmacPhone"];
const PHONE_TRUNCATE_ARROWS = [...PHONE_HASH_ARROWS, "hmacPhoneToCodePhone"];
const SERVER_ARROWS = [...PHONE_TRUNCATE_ARROWS, "serverToHmacServer", "hmacServerToCodeServer"];
const COMPARE_ARROWS = [...SERVER_ARROWS, "codePhoneToCompare", "codeServerToCompare"];

export const STATES: Record<string, DiagramStateConfig> = {
  idle: { nodes: [], arrows: [] },
  intro: {
    nodes: ["phone", "server"],
    arrows: [],
    nodeState: { phone: "active", server: "active" },
  },
  enrollment: {
    nodes: ["phone", "server", "secret"],
    arrows: ENROLLMENT_ARROWS,
    nodeState: { secret: "active" },
  },
  "time-counter": {
    nodes: ["phone", "server", "secret", "clock"],
    arrows: CLOCK_ARROWS,
    nodeState: { secret: "success", clock: "active" },
    arrowState: { secretToPhone: "success", secretToServer: "success" },
  },
  "phone-hashes": {
    nodes: ["phone", "server", "secret", "clock", "hmacPhone"],
    arrows: PHONE_HASH_ARROWS,
    nodeState: { secret: "success", clock: "success", hmacPhone: "active" },
    arrowState: {
      secretToPhone: "success",
      secretToServer: "success",
      clockToPhone: "success",
      clockToServer: "success",
    },
  },
  truncate: {
    nodes: ["phone", "server", "secret", "clock", "hmacPhone", "codePhone"],
    arrows: PHONE_TRUNCATE_ARROWS,
    nodeState: { secret: "success", clock: "success", hmacPhone: "success", codePhone: "active" },
    arrowState: {
      secretToPhone: "success",
      secretToServer: "success",
      clockToPhone: "success",
      clockToServer: "success",
      phoneToHmacPhone: "success",
    },
  },
  "server-computes": {
    nodes: ["phone", "server", "secret", "clock", "hmacPhone", "codePhone", "hmacServer", "codeServer"],
    arrows: SERVER_ARROWS,
    nodeState: {
      secret: "success",
      clock: "success",
      hmacPhone: "success",
      codePhone: "success",
      hmacServer: "success",
      codeServer: "success",
    },
    arrowState: {
      secretToPhone: "success",
      secretToServer: "success",
      clockToPhone: "success",
      clockToServer: "success",
      phoneToHmacPhone: "success",
      hmacPhoneToCodePhone: "success",
      serverToHmacServer: "success",
      hmacServerToCodeServer: "success",
    },
  },
  compare: {
    nodes: ["phone", "server", "secret", "clock", "hmacPhone", "codePhone", "hmacServer", "codeServer", "compare"],
    arrows: COMPARE_ARROWS,
    nodeState: {
      secret: "success",
      clock: "success",
      hmacPhone: "success",
      codePhone: "success",
      hmacServer: "success",
      codeServer: "success",
      compare: "active",
    },
    arrowState: {
      secretToPhone: "success",
      secretToServer: "success",
      clockToPhone: "success",
      clockToServer: "success",
      phoneToHmacPhone: "success",
      hmacPhoneToCodePhone: "success",
      serverToHmacServer: "success",
      hmacServerToCodeServer: "success",
      codePhoneToCompare: "active",
      codeServerToCompare: "active",
    },
  },
  "match-success": {
    nodes: ["phone", "server", "secret", "clock", "hmacPhone", "codePhone", "hmacServer", "codeServer", "compare"],
    arrows: COMPARE_ARROWS,
    nodeState: {
      secret: "success",
      clock: "success",
      hmacPhone: "success",
      codePhone: "success",
      hmacServer: "success",
      codeServer: "success",
      compare: "success",
    },
    arrowState: {
      secretToPhone: "success",
      secretToServer: "success",
      clockToPhone: "success",
      clockToServer: "success",
      phoneToHmacPhone: "success",
      hmacPhoneToCodePhone: "success",
      serverToHmacServer: "success",
      hmacServerToCodeServer: "success",
      codePhoneToCompare: "success",
      codeServerToCompare: "success",
    },
  },
};

export function TOTPDiagram({ state, progress, highlightNodes }: DiagramProps) {
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
