export interface PresignUploadParams {
  contentType: string;
}

export interface PresignedUpload {
  // the POST target the client submits the multipart form to
  url: string;
  // form fields the client must include, in order, before the file itself
  fields: Record<string, string>;
  objectKey: string;
  // base URL objectKey resolves under, snapshotted now rather than derived
  // from config later
  domain: string;
}

// Deliberately domain-agnostic — knows nothing about "kudos" or "images"
// vs "video"; callers decide what they're uploading and record that
// themselves.
export interface Storage {
  presignUpload(params: PresignUploadParams): Promise<PresignedUpload>;
}
