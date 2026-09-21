// Object storage backed directly by AWS S3.
// Uploads use PutObjectCommand; downloads are served via the /storage proxy
// (server/_core/storageProxy.ts), either redirected to a public CDN base URL
// or to a short-lived presigned GET URL when no public base is configured.

import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { ENV } from "./_core/env";

let cachedClient: S3Client | null = null;

function getS3Config() {
  if (!ENV.awsRegion || !ENV.s3Bucket) {
    throw new Error("Storage config missing: set AWS_REGION and AWS_S3_BUCKET");
  }
  return { region: ENV.awsRegion, bucket: ENV.s3Bucket };
}

function getS3Client(): S3Client {
  if (!cachedClient) {
    const { region } = getS3Config();
    cachedClient = new S3Client({ region });
  }
  return cachedClient;
}

function normalizeKey(relKey: string): string {
  return relKey.replace(/^\/+/, "");
}

function appendHashSuffix(relKey: string): string {
  const hash = crypto.randomUUID().replace(/-/g, "").slice(0, 8);
  const lastDot = relKey.lastIndexOf(".");
  if (lastDot === -1) return `${relKey}_${hash}`;
  return `${relKey.slice(0, lastDot)}_${hash}${relKey.slice(lastDot)}`;
}

export async function storagePut(
  relKey: string,
  data: Buffer | Uint8Array | string,
  contentType = "application/octet-stream",
): Promise<{ key: string; url: string }> {
  const { bucket } = getS3Config();
  const client = getS3Client();
  const key = appendHashSuffix(normalizeKey(relKey));
  const body = typeof data === "string" ? Buffer.from(data, "utf-8") : data;

  await client.send(
    new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: contentType }),
  );

  return { key, url: `/storage/${key}` };
}

export async function storageGet(relKey: string): Promise<{ key: string; url: string }> {
  const key = normalizeKey(relKey);
  return { key, url: `/storage/${key}` };
}

/**
 * Resolves a downloadable URL for `relKey`: the public CDN base URL when
 * AWS_S3_PUBLIC_BASE_URL is configured, otherwise a short-lived (5 min)
 * presigned S3 GET URL. Used by the /storage proxy route.
 */
export async function storageGetSignedUrl(relKey: string): Promise<string> {
  const key = normalizeKey(relKey);

  if (ENV.s3PublicBaseUrl) {
    return `${ENV.s3PublicBaseUrl.replace(/\/+$/, "")}/${key}`;
  }

  const { bucket } = getS3Config();
  const client = getS3Client();
  return getSignedUrl(client, new GetObjectCommand({ Bucket: bucket, Key: key }), {
    expiresIn: 300,
  });
}
