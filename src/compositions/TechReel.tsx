import { AbsoluteFill } from "remotion";
import { z } from "zod";
import { theme } from "../diagrams/shared/theme";
import { ReelScriptSchema } from "../pipeline/types";
import { AudioTrack } from "./AudioTrack";
import { BrandWatermark } from "./BrandWatermark";
import { CaptionLayer } from "./CaptionLayer";
import { DiagramStage } from "./DiagramStage";

export const techReelPropsSchema = z.object({
  script: ReelScriptSchema,
  audioFileName: z.string().nullable().optional(),
});

export type TechReelProps = z.infer<typeof techReelPropsSchema>;

export function TechReel({ script, audioFileName }: TechReelProps) {
  return (
    <AbsoluteFill style={{ backgroundColor: theme.colors.background }}>
      <DiagramStage beats={script.beats} />
      <CaptionLayer beats={script.beats} />
      <BrandWatermark />
      <AudioTrack audioFileName={audioFileName} />
    </AbsoluteFill>
  );
}
