// 's3' names the wire protocol, not the vendor — this is configured for a
// self-hosted MinIO instance (path-style, explicit endpoint), matching
// ARCHITECTURE.md §11's "S3/MinIO (ship)" being one provider, not two. The
// same client would work unchanged against real AWS S3 by pointing
// `endpoint` there instead, since MinIO implements the same SigV4 POST
// policy signing this provider does by hand.
export type StorageConfig = {
  provider: 's3';
  endpoint: string;
  bucket: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
};
