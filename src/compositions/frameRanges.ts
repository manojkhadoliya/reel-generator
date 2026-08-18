import type { Beat, BeatFrameRange } from "../pipeline/types";

/** Duration of the topic title card that opens every reel, before the first beat. */
const INTRO_DURATION_SEC = 1.5;

export function introFrames(fps: number): number {
  return Math.round(INTRO_DURATION_SEC * fps);
}

/** Cumulative per-beat frame ranges from reconciled durations, offset by the intro card. Used by
 * DiagramStage, CaptionLayer, Root's calculateMetadata, and render.ts's total-frame computation —
 * frame math lives in this one place only. */
export function computeBeatFrameRanges(beats: Beat[], fps: number): BeatFrameRange[] {
  let frame = introFrames(fps);
  return beats.map((beat) => {
    const durationFrames = Math.round(beat.durationSec * fps);
    const startFrame = frame;
    const endFrame = frame + durationFrames;
    frame = endFrame;
    return { beat, startFrame, endFrame };
  });
}

export function totalFrames(beats: Beat[], fps: number): number {
  const ranges = computeBeatFrameRanges(beats, fps);
  const last = ranges[ranges.length - 1];
  return last ? last.endFrame : 0;
}
