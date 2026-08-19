import { describe, expect, it } from "vitest";
import { ReelScriptSchema } from "./types.js";

function baseScriptJson() {
  return {
    topic: "test",
    slug: "test-slug",
    totalDurationSec: 10,
    beats: [
      { id: "b1", type: "hook", narration: "Hi.", durationSec: 1, visual: { type: "caption-only", diagramState: "x" } },
    ],
  };
}

describe("ReelScriptSchema language field", () => {
  it("defaults to \"en\" when omitted", () => {
    const parsed = ReelScriptSchema.parse(baseScriptJson());
    expect(parsed.language).toBe("en");
  });

  it("accepts \"hi\"", () => {
    const parsed = ReelScriptSchema.parse({ ...baseScriptJson(), language: "hi" });
    expect(parsed.language).toBe("hi");
  });

  it("rejects an unsupported language code", () => {
    expect(() => ReelScriptSchema.parse({ ...baseScriptJson(), language: "haryanvi" })).toThrow();
  });
});
