import type { Alignment, Beat, ReelScript, VoiceoverResult, WordTiming } from "./types.js";

const DEFAULT_TAIL_PAD_SEC = 0.3;

export interface ReconcileTimingOptions {
  /** Extra seconds appended after the last beat's raw end time, so the closing caption doesn't cut off abruptly. */
  tailPadSec?: number;
}

export interface ReconcileTimingResult {
  script: ReelScript;
  wordTimings: WordTiming[];
}

function charTime(alignment: Alignment, index: number, edge: "start" | "end"): number {
  const times = edge === "start" ? alignment.characterStartTimesSeconds : alignment.characterEndTimesSeconds;
  const time = times[index];
  if (time === undefined) {
    throw new Error(
      `Alignment has no ${edge} timestamp for character index ${index} (alignment covers ${times.length} characters).`,
    );
  }
  return time;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Pure function: recomputes each beat's real durationSec from ElevenLabs' character-level
 * alignment, overwriting the estimates that Claude Code wrote when authoring the script.
 * Segments are tiled with no gaps/overlaps by splitting each inter-beat silence at its midpoint,
 * so the diagram animation timeline exactly covers the full reel with no dead air.
 */
export function reconcileTiming(
  script: ReelScript,
  voiceover: Pick<VoiceoverResult, "alignment" | "beatCharRanges">,
  options: ReconcileTimingOptions = {},
): ReconcileTimingResult {
  const { alignment, beatCharRanges } = voiceover;
  const tailPadSec = options.tailPadSec ?? DEFAULT_TAIL_PAD_SEC;
  const n = script.beats.length;

  if (beatCharRanges.length !== n) {
    throw new Error(`beatCharRanges length (${beatCharRanges.length}) does not match script.beats length (${n}).`);
  }

  const rawStart = beatCharRanges.map((r) => charTime(alignment, r.start, "start"));
  const rawEnd = beatCharRanges.map((r) => charTime(alignment, r.end - 1, "end"));
  const lastCharEnd = alignment.characterEndTimesSeconds[alignment.characterEndTimesSeconds.length - 1];
  const totalAudioDurationSec = Math.max(lastCharEnd ?? 0, rawEnd[n - 1]);

  const segmentStart: number[] = new Array(n);
  const segmentEnd: number[] = new Array(n);

  for (let i = 0; i < n; i++) {
    segmentStart[i] = i === 0 ? 0 : (rawEnd[i - 1] + rawStart[i]) / 2;
  }
  for (let i = 0; i < n - 1; i++) {
    segmentEnd[i] = segmentStart[i + 1];
  }
  segmentEnd[n - 1] = totalAudioDurationSec + tailPadSec;

  const beats: Beat[] = script.beats.map((beat, i) => ({
    ...beat,
    durationSec: round2(segmentEnd[i] - segmentStart[i]),
  }));

  const totalDurationSec = round2(segmentEnd[n - 1]);

  const wordTimings: WordTiming[] = [];
  for (let i = 0; i < n; i++) {
    const beat = script.beats[i];
    const range = beatCharRanges[i];
    for (const match of beat.narration.matchAll(/\S+/g)) {
      const word = match[0];
      const relStart = match.index ?? 0;
      const absStart = range.start + relStart;
      const absEnd = absStart + word.length;
      wordTimings.push({
        beatId: beat.id,
        word,
        startSec: charTime(alignment, absStart, "start"),
        endSec: charTime(alignment, absEnd - 1, "end"),
      });
    }
  }

  return {
    script: { ...script, beats, totalDurationSec },
    wordTimings,
  };
}
