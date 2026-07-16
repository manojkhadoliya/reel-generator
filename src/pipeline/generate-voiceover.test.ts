import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { generateVoiceover } from "./generate-voiceover.js";
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

function fakeAlignmentFor(fullText: string) {
  const characters = fullText.split("");
  return {
    characters,
    characterStartTimesSeconds: characters.map((_, i) => i * 0.05),
    characterEndTimesSeconds: characters.map((_, i) => (i + 1) * 0.05),
  };
}

describe("generateVoiceover", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), "reel-voiceover-"));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("submits the concatenated narration, writes the mp3, and returns matching beat char ranges", async () => {
    const script = makeScript();
    const fullText = "Hi there. Bye now.";
    const convertWithTimestamps = vi.fn().mockResolvedValue({
      audioBase64: Buffer.from("fake-mp3-bytes").toString("base64"),
      alignment: fakeAlignmentFor(fullText),
    });
    const client = { textToSpeech: { convertWithTimestamps } } as unknown as ElevenLabsClient;

    const result = await generateVoiceover({ script, voiceId: "voice-1", client, outputDir: tmpDir });

    expect(convertWithTimestamps).toHaveBeenCalledTimes(1);
    const [voiceId, request] = convertWithTimestamps.mock.calls[0];
    expect(voiceId).toBe("voice-1");
    expect(request.text).toBe(fullText);
    expect(request.applyTextNormalization).toBe("off");

    expect(result.beatCharRanges).toEqual([
      { beatId: "b1", start: 0, end: "Hi there.".length },
      { beatId: "b2", start: "Hi there. ".length, end: fullText.length },
    ]);

    const written = await readFile(result.audioFilePath);
    expect(written.toString()).toBe("fake-mp3-bytes");
    expect(result.audioFilePath.endsWith(`${script.slug}.mp3`)).toBe(true);
  });

  it("throws if the returned alignment text does not match the submitted narration", async () => {
    const script = makeScript();
    const convertWithTimestamps = vi.fn().mockResolvedValue({
      audioBase64: Buffer.from("x").toString("base64"),
      alignment: fakeAlignmentFor("completely different text"),
    });
    const client = { textToSpeech: { convertWithTimestamps } } as unknown as ElevenLabsClient;

    await expect(
      generateVoiceover({ script, voiceId: "voice-1", client, outputDir: tmpDir }),
    ).rejects.toThrow(/does not match submitted narration/);
  });

  it("retries on 429 rate limit errors and eventually succeeds", async () => {
    vi.useFakeTimers();
    const script = makeScript();
    const fullText = "Hi there. Bye now.";
    const convertWithTimestamps = vi
      .fn()
      .mockRejectedValueOnce({ statusCode: 429 })
      .mockResolvedValueOnce({
        audioBase64: Buffer.from("ok").toString("base64"),
        alignment: fakeAlignmentFor(fullText),
      });
    const client = { textToSpeech: { convertWithTimestamps } } as unknown as ElevenLabsClient;

    const promise = generateVoiceover({ script, voiceId: "voice-1", client, outputDir: tmpDir });
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(convertWithTimestamps).toHaveBeenCalledTimes(2);
    expect(result.audioFilePath).toContain(script.slug);
    vi.useRealTimers();
  });
});
