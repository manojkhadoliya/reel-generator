import { readFile, writeFile } from "node:fs/promises";

const MANIFEST_PATH = "manifest.json";

/** Instagram state for one reel. Never holds presigned URLs or tokens: this file is committed. */
export interface InstagramState {
  status: "pending_approval" | "published";
  caption: string;
  /** S3 ETag of the video the human previewed; approval is void if the object changes. */
  etag: string;
  /** Username of the account the draft was prepared for. */
  account: string;
  /** Cover image shown in the grid and Reels tab instead of the video's first frame. */
  coverS3Url?: string;
  /** S3 ETag of the cover the human previewed; approval is void if it changes. */
  coverEtag?: string;
  /** Saved as soon as it exists so a re-run resumes it instead of creating a duplicate post. */
  containerId?: string;
  /** Absent on a published reel if the publish response was lost but Instagram reports it went out. */
  mediaId?: string;
  permalink?: string;
  publishedAt?: string;
}

export interface ManifestEntry {
  slug: string;
  topic: string;
  /** Absent on entries written before Hindi support. */
  language?: string;
  s3Url: string;
  date: string;
  instagram?: InstagramState;
}

export async function loadManifest(path: string = MANIFEST_PATH): Promise<ManifestEntry[]> {
  try {
    return JSON.parse(await readFile(path, "utf-8"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

export async function saveManifest(entries: ManifestEntry[], path: string = MANIFEST_PATH): Promise<void> {
  await writeFile(path, `${JSON.stringify(entries, null, 2)}\n`);
}

export async function appendManifestEntry(entry: ManifestEntry, path: string = MANIFEST_PATH): Promise<void> {
  const entries = await loadManifest(path);
  entries.push(entry);
  await saveManifest(entries, path);
}
