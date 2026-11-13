import { createHash } from "node:crypto";
import type { InstagramApi } from "./instagram-api.js";
import type { InstagramState, ManifestEntry } from "./manifest.js";

const MAX_CAPTION_CHARS = 2200;
const MAX_HASHTAGS = 30;
const MAX_MENTIONS = 20;
const MAX_CONSECUTIVE_POLL_FAILURES = 3;

/** The S3 side of publishing, injected so the flow is testable without AWS. */
export interface VideoStore {
  /** Current ETag of the object behind an s3:// URL. */
  getEtag(s3Url: string): Promise<string>;
  /** Short-lived URL for a private object: the bucket never has to go public. */
  getPresignedUrl(s3Url: string): Promise<string>;
}

export interface InstagramDeps {
  api: InstagramApi;
  store: VideoStore;
  loadManifest(): Promise<ManifestEntry[]>;
  saveManifest(entries: ManifestEntry[]): Promise<void>;
  log?(message: string): void;
  sleep?(ms: number): Promise<void>;
  now?(): Date;
  pollIntervalMs?: number;
  pollTimeoutMs?: number;
}

/** Instagram rejected the video for good, so its container can't be retried. */
class ContainerFailedError extends Error {}

export function validateCaption(caption: string): void {
  if (!caption.trim()) throw new Error("Caption is empty");
  if (caption.length > MAX_CAPTION_CHARS) {
    throw new Error(`Caption is ${caption.length} characters; Instagram allows at most ${MAX_CAPTION_CHARS}`);
  }
  const hashtags = caption.match(/#[^\s#]+/g)?.length ?? 0;
  if (hashtags > MAX_HASHTAGS) {
    throw new Error(`Caption has ${hashtags} hashtags; Instagram allows at most ${MAX_HASHTAGS}`);
  }
  const mentions = caption.match(/(?<![\w.])@[\w.]+/g)?.length ?? 0;
  if (mentions > MAX_MENTIONS) {
    throw new Error(`Caption has ${mentions} @ tags; Instagram allows at most ${MAX_MENTIONS}`);
  }
}

/**
 * The code a human approves. It covers everything that defines the post, so changing the video,
 * cover, caption or account after approval makes the code stop matching.
 */
export function approvalCode(entry: ManifestEntry, state: InstagramState): string {
  const parts = [entry.s3Url, state.etag, state.caption, state.account];
  if (state.coverS3Url) parts.push(state.coverS3Url, state.coverEtag ?? "");
  return createHash("sha256")
    .update(JSON.stringify(parts))
    .digest("hex")
    .slice(0, 8);
}

function findLatest(entries: ManifestEntry[], slug: string): ManifestEntry {
  // A regenerated reel appends a new entry for the same slug; the newest one is the current video.
  const entry = entries.filter((candidate) => candidate.slug === slug).at(-1);
  if (!entry) throw new Error(`No reel with slug "${slug}" in manifest.json`);
  return entry;
}

function alreadyPublishedMessage(slug: string, state: InstagramState): string {
  return `"${slug}" is already published on Instagram${state.permalink ? `: ${state.permalink}` : ""}`;
}

export interface PrepareResult {
  code: string;
  caption: string;
  account: string;
  previewUrl: string;
  coverPreviewUrl?: string;
}

/**
 * Records a draft and returns what the human needs to review. Never posts anything.
 * `coverS3Url` must already be uploaded; without it Instagram uses the video's first frame.
 */
export async function prepareInstagramPost(
  deps: InstagramDeps,
  slug: string,
  caption: string,
  coverS3Url?: string,
): Promise<PrepareResult> {
  validateCaption(caption);
  const entries = await deps.loadManifest();
  const entry = findLatest(entries, slug);
  const previous = entry.instagram;

  if (previous?.status === "published") throw new Error(alreadyPublishedMessage(slug, previous));
  // Instagram can publish a container even if the response never reached us. Replacing the draft
  // would forget that container and allow a second post, so check it first.
  if (previous?.containerId) {
    const { statusCode } = await deps.api.getContainerStatus(previous.containerId);
    if (statusCode === "PUBLISHED") {
      previous.status = "published";
      await deps.saveManifest(entries);
      throw new Error(alreadyPublishedMessage(slug, previous));
    }
  }

  const account = await deps.api.getAccount();
  const state: InstagramState = {
    status: "pending_approval",
    caption,
    etag: await deps.store.getEtag(entry.s3Url),
    account: account.username,
    ...(coverS3Url ? { coverS3Url, coverEtag: await deps.store.getEtag(coverS3Url) } : {}),
  };
  const previewUrl = await deps.store.getPresignedUrl(entry.s3Url);
  const coverPreviewUrl = coverS3Url ? await deps.store.getPresignedUrl(coverS3Url) : undefined;
  entry.instagram = state;
  await deps.saveManifest(entries);

  return { code: approvalCode(entry, state), caption, account: account.username, previewUrl, coverPreviewUrl };
}

async function waitUntilReady(deps: InstagramDeps, containerId: string): Promise<"FINISHED" | "PUBLISHED"> {
  const { sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)), log = () => {} } = deps;
  const { pollIntervalMs = 5_000, pollTimeoutMs = 10 * 60_000 } = deps;
  let waited = 0;
  let failures = 0;

  while (true) {
    try {
      const { statusCode, detail } = await deps.api.getContainerStatus(containerId);
      failures = 0;
      if (statusCode === "FINISHED" || statusCode === "PUBLISHED") return statusCode;
      if (statusCode === "ERROR" || statusCode === "EXPIRED") {
        throw new ContainerFailedError(
          `Instagram could not process the video (${statusCode}): ${detail ?? "no detail given"}`,
        );
      }
    } catch (error) {
      if (error instanceof ContainerFailedError) throw error;
      failures += 1;
      if (failures >= MAX_CONSECUTIVE_POLL_FAILURES) throw error;
    }
    if (waited >= pollTimeoutMs) {
      throw new Error(
        `Instagram is still processing the video after ${pollTimeoutMs / 1000}s. Re-run publish to keep waiting; it will not post twice.`,
      );
    }
    log("[instagram] Waiting for Instagram to process the video...");
    await sleep(pollIntervalMs);
    waited += pollIntervalMs;
  }
}

export interface PublishResult {
  mediaId?: string;
  permalink?: string;
}

/**
 * Publishes a prepared reel, but only with the approval code for exactly what was previewed.
 * Safe to re-run after any failure: it resumes the saved container and never posts twice.
 */
export async function publishInstagramPost(
  deps: InstagramDeps,
  slug: string,
  confirmCode: string,
): Promise<PublishResult> {
  const { log = () => {}, now = () => new Date() } = deps;
  const entries = await deps.loadManifest();
  const entry = findLatest(entries, slug);
  const state = entry.instagram;

  if (!state) throw new Error(`"${slug}" has no Instagram draft. Run prepare first, then get it approved.`);
  if (state.status === "published") throw new Error(alreadyPublishedMessage(slug, state));

  if (confirmCode !== approvalCode(entry, state)) {
    throw new Error(
      `Approval code does not match the current draft of "${slug}". Run prepare again and get the new draft approved.`,
    );
  }

  const account = await deps.api.getAccount();
  if (account.username !== state.account) {
    throw new Error(
      `Draft was approved for @${state.account} but the token is for @${account.username}. Run prepare again and get it re-approved.`,
    );
  }
  if ((await deps.store.getEtag(entry.s3Url)) !== state.etag) {
    throw new Error(`The video in S3 changed after "${slug}" was previewed. Run prepare again and get it re-approved.`);
  }
  if (state.coverS3Url && (await deps.store.getEtag(state.coverS3Url)) !== state.coverEtag) {
    throw new Error(`The cover in S3 changed after "${slug}" was previewed. Run prepare again and get it re-approved.`);
  }

  // Resume a saved container if it's still usable. Expired or failed ones are safe to replace.
  if (state.containerId) {
    const { statusCode } = await deps.api.getContainerStatus(state.containerId);
    if (statusCode === "PUBLISHED") {
      state.status = "published";
      await deps.saveManifest(entries);
      log("[instagram] An earlier attempt already published this reel.");
      return {};
    }
    if (statusCode === "EXPIRED" || statusCode === "ERROR") {
      delete state.containerId;
      await deps.saveManifest(entries);
    }
  }

  if (!state.containerId) {
    log("[instagram] Sending the video to Instagram...");
    const videoUrl = await deps.store.getPresignedUrl(entry.s3Url);
    const coverUrl = state.coverS3Url ? await deps.store.getPresignedUrl(state.coverS3Url) : undefined;
    state.containerId = await deps.api.createReelContainer(account.userId, videoUrl, state.caption, coverUrl);
    await deps.saveManifest(entries);
  }

  let readiness: "FINISHED" | "PUBLISHED";
  try {
    readiness = await waitUntilReady(deps, state.containerId);
  } catch (error) {
    if (error instanceof ContainerFailedError) {
      delete state.containerId;
      await deps.saveManifest(entries);
    }
    throw error;
  }

  if (readiness === "PUBLISHED") {
    state.status = "published";
    await deps.saveManifest(entries);
    return {};
  }

  log("[instagram] Publishing...");
  const mediaId = await deps.api.publishContainer(account.userId, state.containerId);
  state.status = "published";
  state.mediaId = mediaId;
  state.publishedAt = now().toISOString();
  await deps.saveManifest(entries);

  // The post is live at this point, so a failed permalink lookup must not look like a failed publish.
  try {
    state.permalink = await deps.api.getPermalink(mediaId);
    await deps.saveManifest(entries);
  } catch (error) {
    log(`[instagram] Published, but could not fetch the permalink: ${(error as Error).message}`);
  }

  return { mediaId, permalink: state.permalink };
}
