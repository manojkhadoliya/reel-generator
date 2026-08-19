import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { PollyClient } from "@aws-sdk/client-polly";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { generateVoiceoverPolly } from "./generate-voiceover-polly.js";
import type { ReelScript } from "./types.js";

function makeScript(): ReelScript {
  return {
    topic: "test",
    slug: "unit-test-slug",
    totalDurationSec: 10,
    beats: [
      { id: "b1", type: "hook", narration: "Hi there.", durationSec: 1, visual: { type: "caption-only", diagramState: "x" } },
      { id: "b2", type: "close", narration: "Bye now.", durationSec: 1, visual: { type: "caption-only", diagramState: "x" } },
    ],
  };
}

/** "Hi there. Bye now." — word marks Polly would plausibly report (start = char offset, time = ms). */
function fakeWordMarksFor(fullText: string) {
  return [
    { time: 0, type: "word", start: fullText.indexOf("Hi"), end: fullText.indexOf("Hi") + 2, value: "Hi" },
    { time: 200, type: "word", start: fullText.indexOf("there"), end: fullText.indexOf("there") + 6, value: "there." },
    { time: 700, type: "word", start: fullText.indexOf("Bye"), end: fullText.indexOf("Bye") + 3, value: "Bye" },
    { time: 900, type: "word", start: fullText.indexOf("now"), end: fullText.indexOf("now") + 4, value: "now." },
  ];
}

function makeFakePollyClient(audioBuffer: Buffer, marks: unknown[]) {
  const send = vi.fn().mockImplementation((command: { input: { OutputFormat: string } }) => {
    if (command.input.OutputFormat === "mp3") {
      return Promise.resolve({
        AudioStream: { transformToByteArray: () => Promise.resolve(new Uint8Array(audioBuffer)) },
      });
    }
    const ndjson = `${marks.map((m) => JSON.stringify(m)).join("\n")}\n`;
    return Promise.resolve({
      AudioStream: { transformToString: () => Promise.resolve(ndjson) },
    });
  });
  return { send } as unknown as PollyClient;
}

describe("generateVoiceoverPolly", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), "reel-voiceover-polly-"));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("writes the mp3 and returns beat char ranges matching the concatenated narration", async () => {
    const script = makeScript();
    const fullText = "Hi there. Bye now.";
    const client = makeFakePollyClient(Buffer.from("fake-mp3-bytes"), fakeWordMarksFor(fullText));

    const result = await generateVoiceoverPolly({ script, voiceId: "Matthew", client, outputDir: tmpDir });

    expect(result.beatCharRanges).toEqual([
      { beatId: "b1", start: 0, end: "Hi there.".length },
      { beatId: "b2", start: "Hi there. ".length, end: fullText.length },
    ]);

    const written = await readFile(result.audioFilePath);
    expect(written.toString()).toBe("fake-mp3-bytes");
    expect(result.audioFilePath.endsWith(`${script.slug}.mp3`)).toBe(true);
  });

  it("aligns every beat/word boundary exactly on a measured Polly word-start timestamp", async () => {
    const script = makeScript();
    const fullText = "Hi there. Bye now.";
    const marks = fakeWordMarksFor(fullText);
    const client = makeFakePollyClient(Buffer.from("x"), marks);

    const result = await generateVoiceoverPolly({ script, voiceId: "Matthew", client, outputDir: tmpDir });

    expect(result.alignment.characters.join("")).toBe(fullText);
    // Word-start boundaries (beat 1 start, "there" start, beat 2 start, "now" start) must be exact.
    expect(result.alignment.characterStartTimesSeconds[0]).toBe(0); // "Hi"
    expect(result.alignment.characterStartTimesSeconds[fullText.indexOf("there")]).toBeCloseTo(0.2);
    expect(result.alignment.characterStartTimesSeconds[fullText.indexOf("Bye")]).toBeCloseTo(0.7);
    expect(result.alignment.characterStartTimesSeconds[fullText.indexOf("now")]).toBeCloseTo(0.9);
    // Interpolated tail (last word "now.") should still produce a monotonically increasing,
    // finite end time past the last measured anchor.
    const lastEnd = result.alignment.characterEndTimesSeconds[fullText.length - 1];
    expect(lastEnd).toBeGreaterThan(0.9);
    expect(Number.isFinite(lastEnd)).toBe(true);
  });

  it("throws if Polly returns no word speech marks", async () => {
    const script = makeScript();
    const client = makeFakePollyClient(Buffer.from("x"), []);

    await expect(
      generateVoiceoverPolly({ script, voiceId: "Matthew", client, outputDir: tmpDir }),
    ).rejects.toThrow(/no word speech marks/);
  });
});
