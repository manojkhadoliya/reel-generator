import { readFile } from "node:fs/promises";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

export interface UploadToS3Options {
  client: S3Client;
  bucket: string;
  slug: string;
  /** YYYY-MM-DD; defaults to today. */
  date?: string;
  localMp4Path: string;
}

export interface UploadToS3Result {
  s3Url: string;
  key: string;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function uploadToS3(options: UploadToS3Options): Promise<UploadToS3Result> {
  const { client, bucket, slug, localMp4Path, date = todayIso() } = options;
  const key = `reels/${slug}/${date}.mp4`;
  const body = await readFile(localMp4Path);

  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: "video/mp4",
    }),
  );

  return { s3Url: `s3://${bucket}/${key}`, key };
}
