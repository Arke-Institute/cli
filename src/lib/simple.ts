/**
 * Simple upload logic for files < 5 MB
 */

import fs from 'fs/promises';
import axios from 'axios';
import type { FileInfo } from '../types/file.js';
import { UploadError } from '../utils/errors.js';
import { getLogger } from '../utils/logger.js';
import { retryWithBackoff } from '../utils/retry.js';

export interface SimpleUploadOptions {
  /** Presigned URL for upload */
  presignedUrl: string;

  /** Progress callback (bytes uploaded) */
  onProgress?: (bytes: number) => void;

  /** Max retries for upload */
  maxRetries?: number;
}

/**
 * Upload a file using simple PUT to presigned URL
 */
export async function uploadSimple(
  fileInfo: FileInfo,
  options: SimpleUploadOptions
): Promise<void> {
  const logger = getLogger();
  const maxRetries = options.maxRetries ?? 3;

  logger.debug(`Simple upload: ${fileInfo.fileName}`, {
    size: fileInfo.size,
  });

  await retryWithBackoff(
    async () => {
      try {
        // Read entire file into buffer
        const fileBuffer = await fs.readFile(fileInfo.localPath);

        // Upload to presigned URL
        const response = await axios.put(options.presignedUrl, fileBuffer, {
          headers: {
            'Content-Type': fileInfo.contentType,
            'Content-Length': fileBuffer.length.toString(),
          },
          maxBodyLength: Infinity,
          maxContentLength: Infinity,
          // Don't follow redirects for presigned URLs
          maxRedirects: 0,
          validateStatus: (status) => status === 200,
        });

        // Report progress
        if (options.onProgress) {
          options.onProgress(fileBuffer.length);
        }

        logger.debug(`Simple upload complete: ${fileInfo.fileName}`, {
          status: response.status,
        });
      } catch (error: any) {
        if (axios.isAxiosError(error)) {
          throw new UploadError(
            `Upload failed: ${error.message}`,
            fileInfo.fileName,
            error
          );
        }
        throw new UploadError(
          `Failed to read file: ${error.message}`,
          fileInfo.fileName,
          error
        );
      }
    },
    { maxRetries }
  );
}
