import "dotenv/config";
import { runPipeline } from "./pipeline.js";

const scriptPath = process.argv[2];
if (!scriptPath) {
  console.error("Usage: tsx src/pipeline/cli.ts <scriptPath>");
  process.exit(1);
}

runPipeline(scriptPath)
  .then(({ s3Url }) => {
    console.log(s3Url);
  })
  .catch((error) => {
    console.error("[pipeline] Failed:", error instanceof Error ? error.message : error);
    process.exit(1);
  });
