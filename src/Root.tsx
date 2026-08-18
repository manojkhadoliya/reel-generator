import { Composition, Still } from "remotion";
import { TechReel, techReelPropsSchema } from "./compositions/TechReel";
import { Thumbnail, thumbnailPropsSchema } from "./compositions/Thumbnail";
import { totalFrames } from "./compositions/frameRanges";
import { theme } from "./diagrams/shared/theme";
import type { ReelScript } from "./pipeline/types";
import sampleBeatsJson from "./data/sample-beats.json";

const sampleScript = sampleBeatsJson as ReelScript;

export function RemotionRoot() {
  return (
    <>
      <Composition
        id="TechReel"
        component={TechReel}
        schema={techReelPropsSchema}
        fps={theme.layout.fps}
        width={theme.layout.width}
        height={theme.layout.height}
        durationInFrames={totalFrames(sampleScript.beats, theme.layout.fps)}
        defaultProps={{ script: sampleScript, audioFileName: null }}
        calculateMetadata={async ({ props }) => ({
          durationInFrames: totalFrames(props.script.beats, theme.layout.fps),
        })}
      />
      <Still
        id="Thumbnail"
        component={Thumbnail}
        schema={thumbnailPropsSchema}
        width={theme.layout.width}
        height={theme.layout.height}
        defaultProps={{ script: sampleScript }}
      />
    </>
  );
}
