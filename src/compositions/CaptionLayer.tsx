import { interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { theme } from "../diagrams/shared/theme";
import type { Beat } from "../pipeline/types";
import { computeBeatFrameRanges } from "./frameRanges";

const FADE_FRAMES = 8;

export function CaptionLayer({ beats }: { beats: Beat[] }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const ranges = computeBeatFrameRanges(beats, fps);
  const active = ranges.find((r) => frame >= r.startFrame && frame < r.endFrame) ?? ranges[ranges.length - 1];
  if (!active) return null;

  const relative = frame - active.startFrame;
  const rangeLength = active.endFrame - active.startFrame;
  const opacity = interpolate(
    relative,
    [0, FADE_FRAMES, Math.max(FADE_FRAMES, rangeLength - FADE_FRAMES), rangeLength],
    [0, 1, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  return (
    <div
      style={{
        position: "absolute",
        left: theme.layout.stagePadding,
        right: theme.layout.stagePadding,
        bottom: theme.layout.captionBottomOffset,
        opacity,
        textAlign: "center",
      }}
    >
      <div
        style={{
          display: "inline-block",
          padding: "16px 28px",
          borderRadius: 12,
          background: theme.colors.captionBg,
          color: theme.colors.caption,
          fontFamily: theme.font.family,
          fontWeight: theme.font.caption.weight,
          fontSize: theme.font.caption.size,
          lineHeight: theme.font.caption.lineHeight,
        }}
      >
        {active.beat.narration}
      </div>
    </div>
  );
}
