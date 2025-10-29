/**
 * Multipart upload logic for files >= 5 MB
 */

import fs from 'fs/promises';
import axios from 'axios';
import type { FileInfo } from '../types/file.js';
import type { PresignedUrlInfo, PartInfo } from '../types/api.js';
import { UploadError } from '../utils/errors.js';
import { getLogger } from '../utils/logger.js';
import { retryWithBackoff } from '../utils/retry.js';

export interface MultipartUploadOptions {
  /** Upload ID from worker */
  uploadId: string;

  /** Part size in bytes */
  partSize: number;

  /** Presigned URLs for each part */
  presignedUrls: PresignedUrlInfo[];

  /** Progress callback (bytes uploaded) */
  onProgress?: (bytes: number) => void;

  /** Number of concurrent parts to upload */
  parallelParts?: number;

  /** Max retries per part */
  maxRetries?: number;

  /** Already completed parts (for resume) */
  completedParts?: PartInfo[];
}

/**
 * Upload a file using multipart upload
 */
export async function uploadMultipart(
  fileInfo: FileInfo,
  options: MultipartUploadOptions
): Promise<PartInfo[]> {
  const logger = getLogger();
  const parallelParts = options.parallelParts ?? 3;
  const maxRetries = options.maxRetries ?? 3;
  const completedParts: PartInfo[] = options.completedParts || [];

  logger.debug(`Multipart upload: ${fileInfo.fileName}`, {
    size: fileInfo.size,
    parts: options.presignedUrls.length,
    partSize: options.partSize,
  });

  // Open file handle for reading
  let fileHandle;
  try {
    fileHandle = await fs.open(fileInfo.localPath, 'r');
  } catch (error: any) {
    throw new UploadError(
      `Failed to open file: ${error.message}`,
      fileInfo.fileName,
      error
    );
  }

  try {
    // Filter out already completed parts (for resume)
    const completedPartNumbers = new Set(
      completedParts.map((p) => p.part_number)
    );
    const partsToUpload = options.presignedUrls.filter(
      (urlInfo) => !completedPartNumbers.has(urlInfo.part_number)
    );

    logger.debug(`Uploading ${partsToUpload.length} parts (${completedParts.length} already completed)`);

    // Upload parts with controlled concurrency
    const uploadedParts = await uploadPartsWithConcurrency(
      fileHandle,
      partsToUpload,
      options.partSize,
      parallelParts,
      maxRetries,
      options.onProgress
    );

    // Combine with already completed parts and sort by part number
    const allParts = [...completedParts, ...uploadedParts].sort(
      (a, b) => a.part_number - b.part_number
    );

    logger.debug(`Multipart upload complete: ${fileInfo.fileName}`, {
      totalParts: allParts.length,
    });

    return allParts;
  } finally {
    await fileHandle.close();
  }
}

/**
 * Upload parts with controlled concurrency
 */
async function uploadPartsWithConcurrency(
  fileHandle: fs.FileHandle,
  urlInfos: PresignedUrlInfo[],
  partSize: number,
  concurrency: number,
  maxRetries: number,
  onProgress?: (bytes: number) => void
): Promise<PartInfo[]> {
  const results: PartInfo[] = [];
  const queue = [...urlInfos];
  const inProgress: Promise<void>[] = [];

  async function uploadWorker(): Promise<void> {
    while (queue.length > 0) {
      const urlInfo = queue.shift();
      if (!urlInfo) break;

      const partInfo = await uploadPart(
        fileHandle,
        urlInfo,
        partSize,
        maxRetries,
        onProgress
      );
      results.push(partInfo);
    }
  }

  // Start workers
  for (let i = 0; i < Math.min(concurrency, urlInfos.length); i++) {
    inProgress.push(uploadWorker());
  }

  // Wait for all workers to complete
  await Promise.all(inProgress);

  return results;
}

/**
 * Upload a single part
 */
async function uploadPart(
  fileHandle: fs.FileHandle,
  urlInfo: PresignedUrlInfo,
  partSize: number,
  maxRetries: number,
  onProgress?: (bytes: number) => void
): Promise<PartInfo> {
  const logger = getLogger();

  return retryWithBackoff(
    async () => {
      try {
        // Calculate offset for this part
        const offset = (urlInfo.part_number - 1) * partSize;

        // Read chunk from file
        const buffer = Buffer.alloc(partSize);
        const { bytesRead } = await fileHandle.read(
          buffer,
          0,
          partSize,
          offset
        );

        if (bytesRead === 0) {
          throw new Error(`No data read for part ${urlInfo.part_number}`);
        }

        const chunk = buffer.slice(0, bytesRead);

        logger.debug(`Uploading part ${urlInfo.part_number}`, {
          offset,
          size: bytesRead,
        });

        // Upload to presigned URL
        const response = await axios.put(urlInfo.url, chunk, {
          headers: {
            'Content-Length': chunk.length.toString(),
          },
          maxBodyLength: Infinity,
          maxContentLength: Infinity,
          maxRedirects: 0,
          validateStatus: (status) => status === 200,
        });

        // Extract ETag from response
        const etag = response.headers['etag'];
        if (!etag) {
          throw new Error(`No ETag in response for part ${urlInfo.part_number}`);
        }

        // Remove quotes from ETag if present
        const cleanEtag = etag.replace(/"/g, '');

        // Report progress
        if (onProgress) {
          onProgress(bytesRead);
        }

        logger.debug(`Part ${urlInfo.part_number} uploaded`, {
          etag: cleanEtag,
        });

        return {
          part_number: urlInfo.part_number,
          etag: cleanEtag,
        };
      } catch (error: any) {
        if (axios.isAxiosError(error)) {
          throw new UploadError(
            `Failed to upload part ${urlInfo.part_number}: ${error.message}`,
            undefined,
            error
          );
        }
        throw error;
      }
    },
    { maxRetries }
  );
}
