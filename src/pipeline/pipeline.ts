import { readFile, writeFile } from "node:fs/promises";
import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";
import { S3Client } from "@aws-sdk/client-s3";
import { generateVoiceover } from "./generate-voiceover.js";
import { reconcileTiming } from "./reconcile-timing.js";
import { renderReel } from "./render.js";
import { ReelScriptSchema, type ReelScript } from "./types.js";
import { uploadToS3 } from "./upload-to-s3.js";

const MANIFEST_PATH = "manifest.json";

export interface RunPipelineResult {
  s3Url: string;
}

interface ManifestEntry {
  slug: string;
  topic: string;
  s3Url: string;
  date: string;
}

async function loadScript(scriptPath: string): Promise<ReelScript> {
  const raw = await readFile(scriptPath, "utf-8");
  return ReelScriptSchema.parse(JSON.parse(raw));
}

async function appendManifestEntry(entry: ManifestEntry): Promise<void> {
  let entries: ManifestEntry[] = [];
  try {
    entries = JSON.parse(await readFile(MANIFEST_PATH, "utf-8"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  entries.push(entry);
  await writeFile(MANIFEST_PATH, `${JSON.stringify(entries, null, 2)}\n`);
}

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

/**
 * Runs pipeline steps 2-7 (brief section 6): voiceover -> reconcile -> render -> upload -> manifest.
 * Step 1 (writing scriptPath's JSON) is Claude Code's own responsibility and happens before this
 * is called. Deliberately has no Claude-Code-specific I/O so it stays a mechanical lift into a
 * future packages/core workspace (brief section 8).
 */
export async function runPipeline(scriptPath: string): Promise<RunPipelineResult> {
  const script = await loadScript(scriptPath);

  console.log(`[pipeline] Generating voiceover for "${script.topic}"...`);
  const elevenLabsClient = new ElevenLabsClient({ apiKey: requiredEnv("ELEVENLABS_API_KEY") });
  const voiceover = await generateVoiceover({
    script,
    voiceId: requiredEnv("ELEVENLABS_VOICE_ID"),
    client: elevenLabsClient,
  });

  console.log("[pipeline] Reconciling beat timing against the real narration audio...");
  const { script: reconciledScript } = reconcileTiming(script, voiceover);
  await writeFile(scriptPath, `${JSON.stringify(reconciledScript, null, 2)}\n`);

  console.log("[pipeline] Rendering video...");
  const { outputPath } = await renderReel({
    script: reconciledScript,
    audioFileName: `audio/${reconciledScript.slug}.mp3`,
  });

  console.log("[pipeline] Uploading to S3...");
  const s3Client = new S3Client({ region: requiredEnv("AWS_REGION") });
  const { s3Url } = await uploadToS3({
    client: s3Client,
    bucket: requiredEnv("S3_BUCKET"),
    slug: reconciledScript.slug,
    localMp4Path: outputPath,
  });

  await appendManifestEntry({
    slug: reconciledScript.slug,
    topic: reconciledScript.topic,
    s3Url,
    date: new Date().toISOString().slice(0, 10),
  });

  console.log(`[pipeline] Done: ${s3Url}`);
  return { s3Url };
}
