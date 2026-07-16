import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";
import type { Alignment, ReelScript, VoiceoverResult } from "./types.js";

const MAX_RETRIES = 4;
const RETRY_BASE_DELAY_MS = 2000;
const DEFAULT_MODEL_ID = "eleven_multilingual_v2";
const DEFAULT_OUTPUT_DIR = "public/audio";

/** Joins beat narration into one string for a single TTS call, recording each beat's
 * exact character range so per-beat timing can be recovered from the returned alignment. */
function buildFullTextAndRanges(script: ReelScript) {
  let cursor = 0;
  const parts: string[] = [];
  const beatCharRanges: VoiceoverResult["beatCharRanges"] = [];

  for (const beat of script.beats) {
    if (parts.length > 0) {
      parts.push(" ");
      cursor += 1;
    }
    const start = cursor;
    parts.push(beat.narration);
    cursor += beat.narration.length;
    beatCharRanges.push({ beatId: beat.id, start, end: cursor });
  }

  return { fullText: parts.join(""), beatCharRanges };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRateLimitError(error: unknown): boolean {
  const status = (error as { statusCode?: number; status?: number })?.statusCode ?? (error as { status?: number })?.status;
  return status === 429;
}

async function convertWithRetry(client: ElevenLabsClient, voiceId: string, text: string, modelId: string) {
  let attempt = 0;
  for (;;) {
    try {
      return await client.textToSpeech.convertWithTimestamps(voiceId, {
        text,
        modelId,
        applyTextNormalization: "off",
        outputFormat: "mp3_44100_128",
      });
    } catch (error) {
      if (!isRateLimitError(error) || attempt >= MAX_RETRIES) throw error;
      attempt += 1;
      await sleep(RETRY_BASE_DELAY_MS * 2 ** (attempt - 1));
    }
  }
}

export interface GenerateVoiceoverOptions {
  script: ReelScript;
  voiceId: string;
  /** Injected so this function is mockable in tests without a network call. */
  client: ElevenLabsClient;
  modelId?: string;
  outputDir?: string;
}

export async function generateVoiceover(options: GenerateVoiceoverOptions): Promise<VoiceoverResult> {
  const { script, voiceId, client, modelId = DEFAULT_MODEL_ID, outputDir = DEFAULT_OUTPUT_DIR } = options;
  const { fullText, beatCharRanges } = buildFullTextAndRanges(script);

  const response = await convertWithRetry(client, voiceId, fullText, modelId);

  if (!response.alignment) {
    throw new Error("ElevenLabs response did not include character alignment data (with-timestamps call is required).");
  }

  const alignment: Alignment = {
    characters: response.alignment.characters,
    characterStartTimesSeconds: response.alignment.characterStartTimesSeconds,
    characterEndTimesSeconds: response.alignment.characterEndTimesSeconds,
  };

  // apply_text_normalization is "off", so this must hold exactly — if it doesn't, ElevenLabs
  // altered the text server-side and per-character offsets can no longer be trusted for
  // reconcile-timing.ts's beat-boundary math. Fail loud rather than silently misattribute timing.
  const reconstructed = alignment.characters.join("");
  if (reconstructed !== fullText) {
    throw new Error(
      `ElevenLabs alignment text does not match submitted narration text — refusing to reconcile timing.\n` +
        `expected: ${JSON.stringify(fullText)}\n` +
        `received: ${JSON.stringify(reconstructed)}`,
    );
  }

  await mkdir(outputDir, { recursive: true });
  const audioFilePath = path.join(outputDir, `${script.slug}.mp3`);
  await writeFile(audioFilePath, Buffer.from(response.audioBase64, "base64"));

  return { audioFilePath, alignment, beatCharRanges };
}
