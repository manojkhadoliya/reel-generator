import path from "node:path";
import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";
import type { TechReelProps } from "../compositions/TechReel.js";

const COMPOSITION_ID = "TechReel";
const ENTRY_POINT = path.join(process.cwd(), "src", "index.ts");

export interface RenderReelOptions {
  script: TechReelProps["script"];
  /** Path relative to public/ (forward slashes), e.g. "audio/{slug}.mp3" — passed straight to Remotion's staticFile(). */
  audioFileName: string;
  outputDir?: string;
}

export interface RenderReelResult {
  outputPath: string;
}

/**
 * Renders the TechReel composition to an mp4. Must run strictly after
 * generate-voiceover.ts has written the narration mp3 to public/audio/ — Remotion's webpack
 * bundle only serves assets that already exist under public/ at bundle() time; a file dropped
 * in afterwards will 404 inside the headless-browser renderer.
 */
export async function renderReel(options: RenderReelOptions): Promise<RenderReelResult> {
  const { script, audioFileName, outputDir = "out" } = options;
  const inputProps: TechReelProps = { script, audioFileName };

  const serveUrl = await bundle({ entryPoint: ENTRY_POINT });

  const composition = await selectComposition({
    serveUrl,
    id: COMPOSITION_ID,
    inputProps,
  });

  const outputPath = path.join(outputDir, `${script.slug}.mp4`);

  await renderMedia({
    composition,
    serveUrl,
    codec: "h264",
    outputLocation: outputPath,
    inputProps,
  });

  return { outputPath };
}
