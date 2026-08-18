import { AbsoluteFill } from "remotion";
import { z } from "zod";
import { theme } from "../diagrams/shared/theme";
import { ReelScriptSchema } from "../pipeline/types";
import { BrandWatermark } from "./BrandWatermark";
import { DIAGRAM_REGISTRY } from "./DiagramStage";

export const thumbnailPropsSchema = z.object({
  script: ReelScriptSchema,
});

export type ThumbnailProps = z.infer<typeof thumbnailPropsSchema>;

/** Picks the first beat with a diagram to represent the topic; falls back to no backdrop. */
function findRepresentativeDiagram(script: ThumbnailProps["script"]) {
  const beat = script.beats.find((b) => b.visual.type === "diagram");
  if (!beat || beat.visual.type !== "diagram") return null;
  const [diagramId, stateKey] = beat.visual.diagramState.split(":");
  const Diagram = DIAGRAM_REGISTRY[diagramId];
  if (!Diagram || !stateKey) return null;
  return { Diagram, stateKey, highlightNodes: beat.visual.highlightNodes };
}

export function Thumbnail({ script }: ThumbnailProps) {
  const representative = findRepresentativeDiagram(script);

  return (
    <AbsoluteFill style={{ backgroundColor: theme.colors.background }}>
      {representative && (
        <AbsoluteFill style={{ opacity: 0.35 }}>
          <representative.Diagram
            state={representative.stateKey}
            progress={1}
            highlightNodes={representative.highlightNodes}
          />
        </AbsoluteFill>
      )}
      <AbsoluteFill
        style={{
          background:
            "linear-gradient(to top, rgba(11,15,26,0.95) 20%, rgba(11,15,26,0.55) 55%, rgba(11,15,26,0.25) 100%)",
        }}
      />
      <BrandWatermark />
      <div
        style={{
          position: "absolute",
          left: theme.layout.stagePadding,
          right: theme.layout.stagePadding,
          bottom: theme.layout.stagePadding,
          textAlign: "center",
        }}
      >
        <span
          style={{
            color: theme.colors.text,
            fontFamily: theme.font.family,
            fontWeight: theme.font.caption.weight,
            fontSize: 84,
            lineHeight: 1.15,
          }}
        >
          {script.topic}
        </span>
      </div>
    </AbsoluteFill>
  );
}
