import { z } from "zod";

export const BeatSchema = z.object({
  id: z.string(),
  type: z.enum(["hook", "explain", "close"]),
  narration: z.string().min(1),
  durationSec: z.number().positive(),
  visual: z.object({
    type: z.enum(["diagram", "code", "caption-only"]),
    diagramState: z.string(),
    highlightNodes: z.array(z.string()).optional(),
  }),
});

export const ReelScriptSchema = z.object({
  topic: z.string(),
  slug: z.string(),
  totalDurationSec: z.number().positive(),
  beats: z.array(BeatSchema).min(1),
});

export type Beat = z.infer<typeof BeatSchema>;
export type ReelScript = z.infer<typeof ReelScriptSchema>;

/** A single beat's resolved timestamp within the reconciled reel timeline. */
export interface BeatFrameRange {
  beat: Beat;
  startFrame: number;
  endFrame: number;
}

/** Per-word timing derived from ElevenLabs' character-level alignment; sidecar data, not part of ReelScript. */
export interface WordTiming {
  beatId: string;
  word: string;
  startSec: number;
  endSec: number;
}

/** ElevenLabs `with-timestamps` alignment block (character-level only). */
export interface Alignment {
  characters: string[];
  characterStartTimesSeconds: number[];
  characterEndTimesSeconds: number[];
}

/** Output of generate-voiceover.ts: the raw alignment plus each beat's character range within the concatenated narration. */
export interface VoiceoverResult {
  audioFilePath: string;
  alignment: Alignment;
  beatCharRanges: Array<{ beatId: string; start: number; end: number }>;
}
