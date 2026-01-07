import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import fs from 'fs/promises';
import path from 'path';
import { config } from '../config/index.js';

interface UploadResult {
  key: string;
  url?: string;
}

interface StorageProvider {
  upload(buffer: Buffer, filename: string, mimeType: string): Promise<UploadResult>;
  download(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
  getUrl(key: string): Promise<string>;
}

class LocalStorageProvider implements StorageProvider {
  private basePath: string;

  constructor() {
    this.basePath = config.storage.path;
  }

  async upload(buffer: Buffer, filename: string, _mimeType: string): Promise<UploadResult> {
    await fs.mkdir(this.basePath, { recursive: true });
    const filePath = path.join(this.basePath, filename);
    await fs.writeFile(filePath, buffer);
    return { key: filePath };
  }

  async download(key: string): Promise<Buffer> {
    return fs.readFile(key);
  }

  async delete(key: string): Promise<void> {
    try {
      await fs.unlink(key);
    } catch (error) {
      // File may not exist
      console.warn('Failed to delete file:', key, error);
    }
  }

  async getUrl(key: string): Promise<string> {
    // For local storage, return the file path
    // In a real scenario, you'd serve this through an API endpoint
    return key;
  }
}

class S3StorageProvider implements StorageProvider {
  private client: S3Client;
  private bucket: string;

  constructor() {
    const s3Config: {
      region: string;
      credentials: { accessKeyId: string; secretAccessKey: string };
      endpoint?: string;
      forcePathStyle?: boolean;
    } = {
      region: config.aws.region,
      credentials: {
        accessKeyId: config.aws.accessKeyId,
        secretAccessKey: config.aws.secretAccessKey,
      },
    };

    // Support Cloudflare R2 and other S3-compatible storage
    if (config.aws.endpoint) {
      s3Config.endpoint = config.aws.endpoint;
      s3Config.forcePathStyle = true;
    }

    this.client = new S3Client(s3Config);
    this.bucket = config.aws.s3Bucket;
  }

  async upload(buffer: Buffer, filename: string, mimeType: string): Promise<UploadResult> {
    const key = `documents/${Date.now()}-${filename}`;

    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      Body: buffer,
      ContentType: mimeType,
    });

    await this.client.send(command);

    return {
      key,
      url: `https://${this.bucket}.s3.${config.aws.region}.amazonaws.com/${key}`,
    };
  }

  async download(key: string): Promise<Buffer> {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });

    const response = await this.client.send(command);

    if (!response.Body) {
      throw new Error('Empty response body');
    }

    // Convert stream to buffer
    const chunks: Uint8Array[] = [];
    for await (const chunk of response.Body as AsyncIterable<Uint8Array>) {
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  }

  async delete(key: string): Promise<void> {
    const command = new DeleteObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });

    await this.client.send(command);
  }

  async getUrl(key: string): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });

    // Generate a pre-signed URL valid for 1 hour
    return getSignedUrl(this.client, command, { expiresIn: 3600 });
  }
}

class StorageService {
  private provider: StorageProvider;

  constructor() {
    const storageType = config.storage.type;

    if (storageType === 's3' && config.aws.accessKeyId && config.aws.s3Bucket) {
      console.log('Using S3 storage provider');
      this.provider = new S3StorageProvider();
    } else {
      console.log('Using local storage provider');
      this.provider = new LocalStorageProvider();
    }
  }

  async upload(buffer: Buffer, filename: string, mimeType: string): Promise<UploadResult> {
    return this.provider.upload(buffer, filename, mimeType);
  }

  async download(key: string): Promise<Buffer> {
    return this.provider.download(key);
  }

  async delete(key: string): Promise<void> {
    return this.provider.delete(key);
  }

  async getUrl(key: string): Promise<string> {
    return this.provider.getUrl(key);
  }

  isS3(): boolean {
    return this.provider instanceof S3StorageProvider;
  }
}

export const storageService = new StorageService();
