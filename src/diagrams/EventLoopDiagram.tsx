import { Arrow } from "./shared/Arrow";
import { Node } from "./shared/Node";
import type { DiagramArrowSpec, DiagramNodeSpec, DiagramProps, DiagramStateConfig } from "./shared/types";

/**
 * "How event loops work in Node.js" — single-threaded call stack + libuv variant.
 * Story: synchronous code runs on the call stack -> async work (I/O, timers) is handed off to
 * libuv/OS, off the main thread -> resolved promises queue directly as microtasks, finished
 * libuv work queues as a macrotask -> once the call stack is empty, the event loop drains the
 * microtask queue completely, then pulls exactly one macrotask back onto the stack, forever.
 */

const NODES: Record<string, DiagramNodeSpec> = {
  callStack: { role: "server", label: "Call Stack", subLabel: "Your JS code", x: 540, y: 260 },
  asyncApis: { role: "token", label: "Libuv / OS", subLabel: "I/O, timers, thread pool", x: 540, y: 560 },
  microtaskQueue: { role: "client", label: "Microtask Queue", subLabel: "Promises, nextTick", x: 300, y: 900 },
  macrotaskQueue: { role: "db", label: "Callback Queue", subLabel: "Timers, I/O callbacks", x: 780, y: 900 },
  eventLoop: { role: "server", label: "Event Loop", subLabel: "Stack empty? Drain queues", x: 540, y: 1240 },
};

const ARROWS: Record<string, DiagramArrowSpec> = {
  stackToAsync: { from: "callStack", to: "asyncApis", label: "hands off async call" },
  codeToMicrotask: { from: "callStack", to: "microtaskQueue", label: "promise resolves" },
  asyncToMacrotask: { from: "asyncApis", to: "macrotaskQueue", label: "callback ready" },
  microtaskToLoop: { from: "microtaskQueue", to: "eventLoop", label: "drained first" },
  macrotaskToLoop: { from: "macrotaskQueue", to: "eventLoop", label: "one per cycle" },
  loopToStack: { from: "eventLoop", to: "callStack", label: "push callback" },
};

const HANDOFF_ARROWS = ["stackToAsync"];
const QUEUES_ARROWS = [...HANDOFF_ARROWS, "codeToMicrotask", "asyncToMacrotask"];
const LOOP_ARROWS = [...QUEUES_ARROWS, "microtaskToLoop", "macrotaskToLoop"];
const CONTINUE_ARROWS = [...LOOP_ARROWS, "loopToStack"];

export const STATES: Record<string, DiagramStateConfig> = {
  idle: { nodes: [], arrows: [] },
  intro: {
    nodes: ["callStack"],
    arrows: [],
    nodeState: { callStack: "active" },
  },
  handoff: {
    nodes: ["callStack", "asyncApis"],
    arrows: HANDOFF_ARROWS,
    nodeState: { callStack: "active", asyncApis: "active" },
  },
  queues: {
    nodes: ["callStack", "asyncApis", "microtaskQueue", "macrotaskQueue"],
    arrows: QUEUES_ARROWS,
    nodeState: { callStack: "success", asyncApis: "success", microtaskQueue: "active", macrotaskQueue: "active" },
    arrowState: { stackToAsync: "success" },
  },
  "event-loop-cycle": {
    nodes: ["callStack", "asyncApis", "microtaskQueue", "macrotaskQueue", "eventLoop"],
    arrows: LOOP_ARROWS,
    nodeState: {
      callStack: "success",
      asyncApis: "success",
      microtaskQueue: "success",
      macrotaskQueue: "active",
      eventLoop: "active",
    },
    arrowState: {
      stackToAsync: "success",
      codeToMicrotask: "success",
      asyncToMacrotask: "success",
      microtaskToLoop: "active",
    },
  },
  "loop-continues": {
    nodes: ["callStack", "asyncApis", "microtaskQueue", "macrotaskQueue", "eventLoop"],
    arrows: CONTINUE_ARROWS,
    nodeState: {
      callStack: "success",
      asyncApis: "success",
      microtaskQueue: "success",
      macrotaskQueue: "success",
      eventLoop: "success",
    },
    arrowState: {
      stackToAsync: "success",
      codeToMicrotask: "success",
      asyncToMacrotask: "success",
      microtaskToLoop: "success",
      macrotaskToLoop: "success",
      loopToStack: "success",
    },
  },
};

export function EventLoopDiagram({ state, progress, highlightNodes }: DiagramProps) {
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
