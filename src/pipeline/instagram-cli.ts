import "dotenv/config";
import { readFile } from "node:fs/promises";
import { GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { requiredEnv } from "./env.js";
import { createInstagramApi } from "./instagram-api.js";
import {
  prepareInstagramPost,
  publishInstagramPost,
  type InstagramDeps,
  type VideoStore,
} from "./instagram-publish.js";
import { loadManifest, saveManifest } from "./manifest.js";
import { renderCover } from "./render-cover.js";
import { ReelScriptSchema, type ReelScript } from "./types.js";

const USAGE = `Usage:
  pnpm instagram check
  pnpm instagram prepare <slug> [--caption-file <path>]
  pnpm instagram publish <slug> --confirm <code>`;

const PRESIGNED_URL_TTL_SEC = 60 * 60;

function parseS3Url(s3Url: string): { bucket: string; key: string } {
  const match = /^s3:\/\/([^/]+)\/(.+)$/.exec(s3Url);
  if (!match) throw new Error(`Not an s3:// URL: ${s3Url}`);
  return { bucket: match[1]!, key: match[2]! };
}

function createVideoStore(): VideoStore & { uploadJpeg(s3Url: string, localPath: string): Promise<void> } {
  const client = new S3Client({ region: requiredEnv("AWS_REGION") });
  return {
    async uploadJpeg(s3Url, localPath) {
      const { bucket, key } = parseS3Url(s3Url);
      const body = await readFile(localPath);
      await client.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: "image/jpeg" }));
    },
    async getEtag(s3Url) {
      const { bucket, key } = parseS3Url(s3Url);
      const { ETag } = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
      if (!ETag) throw new Error(`S3 returned no ETag for ${s3Url}`);
      return ETag;
    },
    getPresignedUrl(s3Url) {
      const { bucket, key } = parseS3Url(s3Url);
      return getSignedUrl(client, new GetObjectCommand({ Bucket: bucket, Key: key }), {
        expiresIn: PRESIGNED_URL_TTL_SEC,
      });
    },
  };
}

function createDeps(): InstagramDeps {
  return {
    api: createInstagramApi({
      accessToken: requiredEnv("INSTAGRAM_ACCESS_TOKEN"),
      apiVersion: process.env.INSTAGRAM_API_VERSION || undefined,
      accountId: process.env.INSTAGRAM_ACCOUNT_ID || undefined,
    }),
    store: createVideoStore(),
    loadManifest: () => loadManifest(),
    saveManifest: (entries) => saveManifest(entries),
    log: (message) => console.log(message),
  };
}

function flagValue(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  return index === -1 ? undefined : args[index + 1];
}

async function loadScript(slug: string): Promise<ReelScript> {
  return ReelScriptSchema.parse(JSON.parse(await readFile(`src/data/${slug}.json`, "utf-8")));
}

function defaultCaption(script: ReelScript): string {
  const hook = script.beats.find((beat) => beat.type === "hook")?.narration;
  return [script.topic, hook, "#softwareengineering #programming #tech #coding"].filter(Boolean).join("\n\n");
}

async function check(): Promise<void> {
  const { api } = createDeps();
  const account = await api.getAccount();
  const quota = await api.getPublishingQuota(account.userId);
  console.log(`Connected to @${account.username}${account.accountType ? ` (${account.accountType})` : ""}`);
  console.log(`Posts used in the last 24h: ${quota.used}${quota.limit ? ` of ${quota.limit}` : ""}`);
}

async function prepare(slug: string, args: string[]): Promise<void> {
  const hasCaptionFlag = args.includes("--caption-file");
  const captionFile = flagValue(args, "--caption-file");
  if (hasCaptionFlag && !captionFile) throw new Error(USAGE);

  const script = await loadScript(slug);
  const caption = captionFile ? (await readFile(captionFile, "utf-8")).trim() : defaultCaption(script);

  const entry = (await loadManifest()).filter((candidate) => candidate.slug === slug).at(-1);
  if (!entry) throw new Error(`No reel with slug "${slug}" in manifest.json`);
  const deps = createDeps();

  // The cover sits next to the video in S3: reels/{slug}/{date}.mp4 -> reels/{slug}/{date}-cover.jpg.
  // A published reel gets no new cover; prepareInstagramPost reports that instead.
  let coverS3Url: string | undefined;
  let coverPath: string | undefined;
  if (entry.instagram?.status !== "published") {
    console.log("[instagram] Rendering the cover image...");
    // Refuse rather than derive a cover key equal to the video's key and overwrite the video.
    if (!entry.s3Url.endsWith(".mp4")) throw new Error(`Expected an .mp4 video URL, got ${entry.s3Url}`);
    coverPath = await renderCover(script);
    coverS3Url = entry.s3Url.replace(/\.mp4$/, "-cover.jpg");
    await createVideoStore().uploadJpeg(coverS3Url, coverPath);
  }

  const draft = await prepareInstagramPost(deps, slug, caption, coverS3Url);

  console.log(`Nothing has been posted. Review this draft:

Account: @${draft.account}
Video preview (link expires in ${PRESIGNED_URL_TTL_SEC / 60} minutes): ${draft.previewUrl}
Cover image: ${coverPath ?? "none"}${draft.coverPreviewUrl ? `
Cover preview (link expires in ${PRESIGNED_URL_TTL_SEC / 60} minutes): ${draft.coverPreviewUrl}` : ""}

Caption:
${draft.caption}

To post it after approval:
  pnpm instagram publish ${slug} --confirm ${draft.code}`);
}

async function publish(slug: string, args: string[]): Promise<void> {
  const code = flagValue(args, "--confirm");
  if (!code) throw new Error(USAGE);
  const { mediaId, permalink } = await publishInstagramPost(createDeps(), slug, code);
  console.log(permalink ?? (mediaId ? `Published (media ${mediaId})` : "Published"));
}

async function main(): Promise<void> {
  const [command, slug, ...args] = process.argv.slice(2);
  if (command === "check") return check();
  if (command === "prepare" && slug) return prepare(slug, args);
  if (command === "publish" && slug) return publish(slug, args);
  throw new Error(USAGE);
}

main().catch((error) => {
  console.error(`[instagram] Failed: ${error instanceof Error ? error.message : error}`);
  process.exit(1);
});
