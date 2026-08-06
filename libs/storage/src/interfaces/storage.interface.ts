export interface PresignUploadParams {
  contentType: string;
}

export interface PresignedUpload {
  // the POST target the client submits the multipart form to
  url: string;
  // form fields the client must include (in order) before the file itself
  fields: Record<string, string>;
  // the key this upload will land at once the client's POST succeeds
  objectKey: string;
  // base URL objectKey resolves under once uploaded, snapshotted now rather
  // than derived from config later — see feed_media's `domain` column
  domain: string;
}

// The tool's public interface (ARCHITECTURE.md §11). Deliberately
// domain-agnostic: it knows nothing about "kudos" or "images" vs "video" —
// callers decide what they're uploading and record that themselves.
export interface Storage {
  presignUpload(params: PresignUploadParams): Promise<PresignedUpload>;
}
