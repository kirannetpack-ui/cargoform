import { randomUUID } from "node:crypto";
import { S3Client, GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { config } from "./config.js";

const s3 = new S3Client({
  endpoint: config.OBJECT_STORAGE_ENDPOINT,
  region: config.OBJECT_STORAGE_REGION,
  forcePathStyle: true,
  credentials: { accessKeyId: config.OBJECT_STORAGE_ACCESS_KEY, secretAccessKey: config.OBJECT_STORAGE_SECRET_KEY },
});

function safeSegment(value: string) { return value.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120); }

export async function createUploadUrl(organisationId: string, entityType: string, entityId: string, originalName: string, contentType: string) {
  const objectKey = `${safeSegment(organisationId)}/${safeSegment(entityType)}/${safeSegment(entityId)}/${randomUUID()}-${safeSegment(originalName)}`;
  const command = new PutObjectCommand({ Bucket: config.OBJECT_STORAGE_BUCKET, Key: objectKey, ContentType: contentType, ServerSideEncryption: "AES256", Metadata: { organisationId, entityType, entityId } });
  return { objectKey, uploadUrl: await getSignedUrl(s3, command, { expiresIn: config.SIGNED_URL_TTL_SECONDS }), expiresIn: config.SIGNED_URL_TTL_SECONDS };
}

export async function createDownloadUrl(objectKey: string) {
  const command = new GetObjectCommand({ Bucket: config.OBJECT_STORAGE_BUCKET, Key: objectKey });
  return getSignedUrl(s3, command, { expiresIn: config.SIGNED_URL_TTL_SECONDS });
}
