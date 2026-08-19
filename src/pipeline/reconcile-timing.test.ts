import { describe, expect, it } from "vitest";
import { reconcileTiming } from "./reconcile-timing.js";
import type { Alignment, ReelScript, VoiceoverResult } from "./types.js";

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function buildAlignment(fullText: string, secPerChar = 0.05): Alignment {
  const characters = fullText.split("");
  return {
    characters,
    characterStartTimesSeconds: characters.map((_, i) => round2(i * secPerChar)),
    characterEndTimesSeconds: characters.map((_, i) => round2((i + 1) * secPerChar)),
  };
}

describe("reconcileTiming", () => {
  it("tiles beat segments gaplessly and derives per-word timings", () => {
    const script: ReelScript = {
      topic: "test",
      slug: "test-slug",
      totalDurationSec: 999, // estimate written by Claude Code; must be overwritten
      language: "en",
      beats: [
        {
          id: "b1",
          type: "hook",
          narration: "Hi there.",
          durationSec: 1,
          visual: { type: "caption-only", diagramState: "x" },
        },
        {
          id: "b2",
          type: "close",
          narration: "Bye now.",
          durationSec: 1,
          visual: { type: "caption-only", diagramState: "x" },
        },
      ],
    };

    const fullText = "Hi there. Bye now.";
    const alignment = buildAlignment(fullText);
    const beatCharRanges: VoiceoverResult["beatCharRanges"] = [
      { beatId: "b1", start: 0, end: "Hi there.".length },
      { beatId: "b2", start: "Hi there. ".length, end: fullText.length },
    ];

    const { script: reconciled, wordTimings } = reconcileTiming(script, { alignment, beatCharRanges });

    expect(reconciled.beats[0].id).toBe("b1");
    expect(reconciled.beats[0].type).toBe("hook");
    expect(reconciled.beats[0].durationSec).toBeGreaterThan(0);
    expect(reconciled.beats[1].durationSec).toBeGreaterThan(0);

    // Gapless tiling: beat durations sum to the reel's total duration (within independent
    // per-beat rounding drift of a couple of cents).
    const sum = reconciled.beats[0].durationSec + reconciled.beats[1].durationSec;
    expect(sum).toBeCloseTo(reconciled.totalDurationSec, 1);

    expect(wordTimings.map((w) => w.word)).toEqual(["Hi", "there.", "Bye", "now."]);
    expect(wordTimings[0].startSec).toBeCloseTo(0, 2);
    expect(wordTimings[0].endSec).toBeGreaterThan(wordTimings[0].startSec);
  });

  it("derives per-word timings correctly for Devanagari (Hindi) narration", () => {
    const script: ReelScript = {
      topic: "test",
      slug: "test-slug-hi",
      totalDurationSec: 999,
      language: "hi",
      beats: [
        {
          id: "b1",
          type: "hook",
          narration: "नमस्ते दोस्तों।",
          durationSec: 1,
          visual: { type: "caption-only", diagramState: "x" },
        },
        {
          id: "b2",
          type: "close",
          narration: "फिर मिलेंगे।",
          durationSec: 1,
          visual: { type: "caption-only", diagramState: "x" },
        },
      ],
    };

    const fullText = "नमस्ते दोस्तों। फिर मिलेंगे।";
    const alignment = buildAlignment(fullText);
    const beatCharRanges: VoiceoverResult["beatCharRanges"] = [
      { beatId: "b1", start: 0, end: "नमस्ते दोस्तों।".length },
      { beatId: "b2", start: "नमस्ते दोस्तों। ".length, end: fullText.length },
    ];

    const { script: reconciled, wordTimings } = reconcileTiming(script, { alignment, beatCharRanges });

    expect(reconciled.language).toBe("hi");
    expect(reconciled.beats[0].durationSec).toBeGreaterThan(0);
    expect(reconciled.beats[1].durationSec).toBeGreaterThan(0);
    expect(wordTimings.map((w) => w.word)).toEqual(["नमस्ते", "दोस्तों।", "फिर", "मिलेंगे।"]);
    expect(wordTimings[0].startSec).toBeCloseTo(0, 2);
    expect(wordTimings[0].endSec).toBeGreaterThan(wordTimings[0].startSec);
  });

  it("throws when beatCharRanges length does not match the script's beat count", () => {
    const script: ReelScript = {
      topic: "t",
      slug: "s",
      totalDurationSec: 1,
      language: "en",
      beats: [
        { id: "b1", type: "hook", narration: "Hi.", durationSec: 1, visual: { type: "caption-only", diagramState: "x" } },
      ],
    };
    const alignment = buildAlignment("Hi.");

    expect(() => reconcileTiming(script, { alignment, beatCharRanges: [] })).toThrow();
  });
});
