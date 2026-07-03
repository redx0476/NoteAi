// S3-compatible object storage for meeting audio (AWS S3, MinIO, etc.).
//
// Enabled when S3_BUCKET is set; otherwise the app keeps its original
// local-disk behavior (data/audio/). The SDK client is created lazily so the
// app never touches @aws-sdk unless S3 is actually configured.

const S3_BUCKET = process.env.S3_BUCKET || '';
const S3_ENDPOINT = process.env.S3_ENDPOINT || '';
const S3_REGION = process.env.S3_REGION || 'us-east-1';
const S3_FORCE_PATH_STYLE = process.env.S3_FORCE_PATH_STYLE !== '0';

function s3Enabled() {
  return !!S3_BUCKET;
}

let client = null;

function s3() {
  if (!s3Enabled()) throw new Error('S3 storage is not configured (S3_BUCKET is empty)');
  if (!client) {
    const { S3Client } = require('@aws-sdk/client-s3');
    client = new S3Client({
      region: S3_REGION,
      ...(S3_ENDPOINT ? { endpoint: S3_ENDPOINT, forcePathStyle: S3_FORCE_PATH_STYLE } : {}),
      ...(process.env.S3_ACCESS_KEY_ID
        ? {
            credentials: {
              accessKeyId: process.env.S3_ACCESS_KEY_ID,
              secretAccessKey: process.env.S3_SECRET_ACCESS_KEY || '',
            },
          }
        : {}),
    });
  }
  return client;
}

/** Upload a buffer/stream. Returns the object key. */
async function putObject(key, body, contentType) {
  const { PutObjectCommand } = require('@aws-sdk/client-s3');
  await s3().send(
    new PutObjectCommand({ Bucket: S3_BUCKET, Key: key, Body: body, ContentType: contentType })
  );
  return key;
}

async function deleteObject(key) {
  const { DeleteObjectCommand } = require('@aws-sdk/client-s3');
  await s3().send(new DeleteObjectCommand({ Bucket: S3_BUCKET, Key: key }));
}

/** Presigned GET URL (default 1 h) — lets the browser stream + Range directly. */
async function presignGet(key, { expiresIn = 3600 } = {}) {
  const { GetObjectCommand } = require('@aws-sdk/client-s3');
  const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
  return getSignedUrl(s3(), new GetObjectCommand({ Bucket: S3_BUCKET, Key: key }), { expiresIn });
}

/**
 * Stream an object (optionally a byte range like "bytes=0-1023") for the proxy
 * fallback when the S3 endpoint isn't reachable from the browser (private MinIO).
 * Returns { body, contentLength, contentRange, contentType }.
 */
async function getObjectStream(key, range) {
  const { GetObjectCommand } = require('@aws-sdk/client-s3');
  const res = await s3().send(
    new GetObjectCommand({ Bucket: S3_BUCKET, Key: key, ...(range ? { Range: range } : {}) })
  );
  return {
    body: res.Body,
    contentLength: res.ContentLength,
    contentRange: res.ContentRange,
    contentType: res.ContentType,
  };
}

module.exports = { s3Enabled, putObject, deleteObject, presignGet, getObjectStream };
