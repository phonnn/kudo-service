// 's3' names the wire protocol, not the vendor — this is configured for a
// self-hosted MinIO instance today, but the same client works unchanged
// against real AWS S3 by pointing `endpoint` there instead.
export type StorageConfig = {
  provider: 's3';
  endpoint: string;
  bucket: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
};
