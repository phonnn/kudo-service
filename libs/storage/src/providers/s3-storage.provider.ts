import { createHmac, randomUUID } from 'node:crypto';
import type {
  PresignedUpload,
  PresignUploadParams,
  Storage,
} from '../interfaces/storage.interface';
import type { StorageConfig } from '../storage.config';

const UPLOAD_TTL_MS = 15 * 60 * 1000;

// Hand-rolled AWS Signature Version 4 for S3 POST policies — no AWS SDK
// dependency. MinIO implements the same signing scheme S3 does, so this
// works unchanged against either (see storage.config.ts). Reference:
// https://docs.aws.amazon.com/AmazonS3/latest/API/sigv4-post-example.html
export class S3Storage implements Storage {
  constructor(private readonly config: StorageConfig) {}

  // no I/O here — the signing is pure computation — but the interface
  // returns a Promise so a future provider needing a real network call
  // (e.g. fetching a signing key from a secrets manager) doesn't change it.
  presignUpload(params: PresignUploadParams): Promise<PresignedUpload> {
    const objectKey = `media/${randomUUID()}`;
    const now = new Date();
    const amzDate = toAmzDate(now);
    const dateStamp = amzDate.slice(0, 8);
    const credential = `${this.config.accessKeyId}/${dateStamp}/${this.config.region}/s3/aws4_request`;

    const policy = {
      expiration: new Date(now.getTime() + UPLOAD_TTL_MS).toISOString(),
      conditions: [
        { bucket: this.config.bucket },
        { key: objectKey },
        { 'Content-Type': params.contentType },
        { 'x-amz-algorithm': 'AWS4-HMAC-SHA256' },
        { 'x-amz-credential': credential },
        { 'x-amz-date': amzDate },
      ],
    };
    const policyBase64 = Buffer.from(JSON.stringify(policy)).toString('base64');
    const signature = this.sign(policyBase64, dateStamp);

    return Promise.resolve({
      url: `${this.config.endpoint}/${this.config.bucket}`,
      fields: {
        key: objectKey,
        'Content-Type': params.contentType,
        'x-amz-algorithm': 'AWS4-HMAC-SHA256',
        'x-amz-credential': credential,
        'x-amz-date': amzDate,
        policy: policyBase64,
        'x-amz-signature': signature,
      },
      objectKey,
      domain: `${this.config.endpoint}/${this.config.bucket}`,
    });
  }

  private sign(policyBase64: string, dateStamp: string): string {
    const kDate = hmac(`AWS4${this.config.secretAccessKey}`, dateStamp);
    const kRegion = hmac(kDate, this.config.region);
    const kService = hmac(kRegion, 's3');
    const kSigning = hmac(kService, 'aws4_request');
    return hmac(kSigning, policyBase64).toString('hex');
  }
}

function hmac(key: string | Buffer, data: string): Buffer {
  return createHmac('sha256', key).update(data, 'utf8').digest();
}

function toAmzDate(date: Date): string {
  // YYYYMMDDTHHMMSSZ
  return date.toISOString().replace(/[:-]|\.\d{3}/g, '');
}
