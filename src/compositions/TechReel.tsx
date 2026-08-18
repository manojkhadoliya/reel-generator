import { AbsoluteFill, Sequence, useVideoConfig } from "remotion";
import { z } from "zod";
import { theme } from "../diagrams/shared/theme";
import { ReelScriptSchema } from "../pipeline/types";
import { AudioTrack } from "./AudioTrack";
import { BrandWatermark } from "./BrandWatermark";
import { CaptionLayer } from "./CaptionLayer";
import { DiagramStage } from "./DiagramStage";
import { introFrames } from "./frameRanges";
import { Thumbnail } from "./Thumbnail";

export const techReelPropsSchema = z.object({
  script: ReelScriptSchema,
  audioFileName: z.string().nullable().optional(),
});

export type TechReelProps = z.infer<typeof techReelPropsSchema>;

export function TechReel({ script, audioFileName }: TechReelProps) {
  const { fps } = useVideoConfig();
  const introDuration = introFrames(fps);

  return (
    <AbsoluteFill style={{ backgroundColor: theme.colors.background }}>
      <Sequence from={0} durationInFrames={introDuration} name="intro">
        <Thumbnail script={script} />
      </Sequence>
      <DiagramStage beats={script.beats} />
      <CaptionLayer beats={script.beats} />
      <Sequence from={introDuration} name="watermark">
        <BrandWatermark />
      </Sequence>
      <Sequence from={introDuration} name="audio">
        <AudioTrack audioFileName={audioFileName} />
      </Sequence>
    </AbsoluteFill>
  );
}
