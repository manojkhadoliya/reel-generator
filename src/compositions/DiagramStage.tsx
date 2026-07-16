import { Sequence, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { FaceIDDiagram } from "../diagrams/FaceIDDiagram";
import { JWTDiagram } from "../diagrams/JWTDiagram";
import { SessionDiagram } from "../diagrams/SessionDiagram";
import { theme } from "../diagrams/shared/theme";
import type { DiagramComponent } from "../diagrams/shared/types";
import type { Beat } from "../pipeline/types";
import { computeBeatFrameRanges } from "./frameRanges";

const DIAGRAM_REGISTRY: Record<string, DiagramComponent> = {
  session: SessionDiagram,
  jwt: JWTDiagram,
  faceid: FaceIDDiagram,
};

function BeatDiagram({ beat }: { beat: Beat }) {
  const frame = useCurrentFrame(); // beat-relative, thanks to the enclosing <Sequence>
  const { fps } = useVideoConfig();
  const progress = spring({ frame, fps, config: theme.spring.arrow });

  if (beat.visual.type !== "diagram") return null;

  const [diagramId, stateKey] = beat.visual.diagramState.split(":");
  const Diagram = DIAGRAM_REGISTRY[diagramId];
  if (!Diagram || !stateKey) return null;

  return (
    <Diagram
      state={stateKey}
      progress={progress}
      highlightNodes={beat.visual.highlightNodes}
    />
  );
}

export function DiagramStage({ beats }: { beats: Beat[] }) {
  const { fps } = useVideoConfig();
  const ranges = computeBeatFrameRanges(beats, fps);

  return (
    <>
      {ranges.map(({ beat, startFrame, endFrame }) => (
        <Sequence
          key={beat.id}
          from={startFrame}
          durationInFrames={endFrame - startFrame}
          name={beat.id}
        >
          <BeatDiagram beat={beat} />
        </Sequence>
      ))}
    </>
  );
}
