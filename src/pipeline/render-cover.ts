import path from "node:path";
import { bundle } from "@remotion/bundler";
import { renderStill, selectComposition } from "@remotion/renderer";
import type { ReelCoverProps } from "../compositions/ReelCover.js";

const COMPOSITION_ID = "ReelCover";
const ENTRY_POINT = path.join(process.cwd(), "src", "index.ts");

/** Renders the reel's Instagram cover image to out/{slug}-cover.jpg. */
export async function renderCover(script: ReelCoverProps["script"], outputDir = "out"): Promise<string> {
  const inputProps: ReelCoverProps = { script };
  const serveUrl = await bundle({ entryPoint: ENTRY_POINT });
  const composition = await selectComposition({ serveUrl, id: COMPOSITION_ID, inputProps });
  const outputPath = path.join(outputDir, `${script.slug}-cover.jpg`);

  await renderStill({
    composition,
    serveUrl,
    inputProps,
    output: outputPath,
    imageFormat: "jpeg",
    jpegQuality: 90,
  });
  return outputPath;
}
