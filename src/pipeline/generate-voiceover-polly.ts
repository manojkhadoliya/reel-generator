import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Engine, PollyClient, VoiceId } from "@aws-sdk/client-polly";
import { SynthesizeSpeechCommand } from "@aws-sdk/client-polly";
import type { Alignment, ReelScript, VoiceoverResult } from "./types.js";

const DEFAULT_ENGINE = "neural";
const DEFAULT_OUTPUT_DIR = "public/audio";
const FALLBACK_CHARS_PER_SEC = 13;

interface PollyWordMark {
  time: number;
  type: "word";
  start: number;
  end: number;
  value: string;
}

interface ByteArrayStream {
  transformToByteArray(): Promise<Uint8Array>;
}

interface StringStream {
  transformToString(encoding: string): Promise<string>;
}

/** Joins beat narration into one string for two TTS calls (audio + word marks), recording
 * each beat's exact character range — mirrors generate-voiceover.ts's helper so the two
 * provider modules stay independently swappable. */
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

async function synthesizeAudio(client: PollyClient, text: string, voiceId: string, engine: string): Promise<Buffer> {
  const response = await client.send(
    new SynthesizeSpeechCommand({
      Text: text,
      VoiceId: voiceId as VoiceId,
      Engine: engine as Engine,
      OutputFormat: "mp3",
    }),
  );
  if (!response.AudioStream) throw new Error("Polly SynthesizeSpeech (mp3) returned no AudioStream.");
  const bytes = await (response.AudioStream as unknown as ByteArrayStream).transformToByteArray();
  return Buffer.from(bytes);
}

async function synthesizeWordMarks(
  client: PollyClient,
  text: string,
  voiceId: string,
  engine: string,
): Promise<PollyWordMark[]> {
  const response = await client.send(
    new SynthesizeSpeechCommand({
      Text: text,
      VoiceId: voiceId as VoiceId,
      Engine: engine as Engine,
      OutputFormat: "json",
      SpeechMarkTypes: ["word"],
    }),
  );
  if (!response.AudioStream) throw new Error("Polly SynthesizeSpeech (speech marks) returned no AudioStream.");
  const raw = await (response.AudioStream as unknown as StringStream).transformToString("utf-8");
  return raw
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as PollyWordMark);
}

/**
 * Polly's `start`/`end` speech-mark offsets are byte offsets into the UTF-8 encoding of the
 * submitted text, not JS string (UTF-16 code unit) indices — see
 * https://docs.aws.amazon.com/polly/latest/dg/speechmarks.html. For ASCII text the two happen
 * to coincide, but for multi-byte scripts like Devanagari (3 bytes/char in UTF-8, 1 UTF-16 code
 * unit per char) they diverge badly. This maps each byte offset that a word mark can land on
 * back to the corresponding index into `text`.
 */
function buildByteOffsetToCharIndex(text: string): Map<number, number> {
  const map = new Map<number, number>();
  let byteOffset = 0;
  for (let i = 0; i < text.length; i++) {
    map.set(byteOffset, i);
    byteOffset += Buffer.byteLength(text[i], "utf-8");
  }
  map.set(byteOffset, text.length);
  return map;
}

/**
 * Polly reports only each word's *start* time (byte offset into the submitted text + ms
 * offset into the audio) — no per-character timing and no end time, unlike ElevenLabs.
 * We treat each word mark as an anchor (charOffset, timeSec) and linearly interpolate
 * character times within each inter-anchor span. Every beat/word boundary in this pipeline
 * always falls exactly on a word start (see buildFullTextAndRanges), so boundary times land
 * exactly on a measured Polly timestamp; only positions strictly inside a span are approximated.
 */
function buildAlignmentFromWordMarks(fullText: string, marks: PollyWordMark[]): Alignment {
  const byteToChar = buildByteOffsetToCharIndex(fullText);
  const anchors: Array<{ pos: number; timeSec: number }> = marks
    .map((m) => {
      const pos = byteToChar.get(m.start);
      if (pos === undefined) {
        throw new Error(
          `Polly word mark byte offset ${m.start} (word "${m.value}") does not land on a character boundary in the submitted text.`,
        );
      }
      return { pos, timeSec: m.time / 1000 };
    })
    .sort((a, b) => a.pos - b.pos);

  if (anchors.length === 0) {
    throw new Error("Polly returned no word speech marks — cannot build a timing alignment.");
  }
  if (anchors[0].pos !== 0) {
    anchors.unshift({ pos: 0, timeSec: 0 });
  }

  const lastRealAnchor = anchors[anchors.length - 1];
  const rate =
    anchors.length >= 2 && lastRealAnchor.timeSec > anchors[0].timeSec
      ? (lastRealAnchor.pos - anchors[0].pos) / (lastRealAnchor.timeSec - anchors[0].timeSec)
      : FALLBACK_CHARS_PER_SEC;
  const lastWordCharLen = Math.max(1, fullText.length - lastRealAnchor.pos);
  const estimatedLastWordDurationSec = lastWordCharLen / Math.max(rate, 1);
  anchors.push({ pos: fullText.length, timeSec: lastRealAnchor.timeSec + estimatedLastWordDurationSec });

  const characterStartTimesSeconds = new Array<number>(fullText.length);
  const characterEndTimesSeconds = new Array<number>(fullText.length);

  for (let i = 0; i < anchors.length - 1; i++) {
    const from = anchors[i];
    const to = anchors[i + 1];
    const span = Math.max(1, to.pos - from.pos);
    for (let pos = from.pos; pos < to.pos; pos++) {
      characterStartTimesSeconds[pos] = from.timeSec + ((to.timeSec - from.timeSec) * (pos - from.pos)) / span;
      characterEndTimesSeconds[pos] = from.timeSec + ((to.timeSec - from.timeSec) * (pos - from.pos + 1)) / span;
    }
  }

  return { characters: fullText.split(""), characterStartTimesSeconds, characterEndTimesSeconds };
}

export interface GenerateVoiceoverPollyOptions {
  script: ReelScript;
  voiceId: string;
  /** Injected so this function is mockable in tests without a network call. */
  client: PollyClient;
  engine?: string;
  outputDir?: string;
}

export async function generateVoiceoverPolly(options: GenerateVoiceoverPollyOptions): Promise<VoiceoverResult> {
  const { script, voiceId, client, engine = DEFAULT_ENGINE, outputDir = DEFAULT_OUTPUT_DIR } = options;
  const { fullText, beatCharRanges } = buildFullTextAndRanges(script);

  const [audioBuffer, marks] = await Promise.all([
    synthesizeAudio(client, fullText, voiceId, engine),
    synthesizeWordMarks(client, fullText, voiceId, engine),
  ]);

  const alignment = buildAlignmentFromWordMarks(fullText, marks);

  await mkdir(outputDir, { recursive: true });
  const audioFilePath = path.join(outputDir, `${script.slug}.mp3`);
  await writeFile(audioFilePath, audioBuffer);

  return { audioFilePath, alignment, beatCharRanges };
}
