/**
 * Directory scanning and file discovery
 */

import fs from 'fs/promises';
import path from 'path';
import mime from 'mime-types';
import type { FileInfo, ScanResult } from '../types/file.js';
import { ScanError } from '../utils/errors.js';
import {
  validateFileExtension,
  validateFileSize,
  validateBatchSize,
  validateLogicalPath,
  normalizePath,
} from './validation.js';
import { getLogger } from '../utils/logger.js';
import { computeFileCID } from '../utils/hash.js';

export interface ScanOptions {
  /** Logical root path for the batch (e.g., /series_1/box_7) */
  rootPath: string;

  /** Filter files by these extensions */
  allowedExtensions?: string[];

  /** Follow symbolic links */
  followSymlinks?: boolean;
}

/**
 * Recursively scan a directory and collect file metadata
 */
export async function scanDirectory(
  dirPath: string,
  options: ScanOptions
): Promise<ScanResult> {
  const logger = getLogger();
  const files: FileInfo[] = [];
  let totalSize = 0;
  let largestFile = 0;
  let smallestFile = Infinity;

  // Validate directory exists
  try {
    const stats = await fs.stat(dirPath);
    if (!stats.isDirectory()) {
      throw new ScanError(`Path is not a directory: ${dirPath}`, dirPath);
    }
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      throw new ScanError(`Directory not found: ${dirPath}`, dirPath);
    }
    throw new ScanError(`Cannot access directory: ${error.message}`, dirPath);
  }

  // Validate logical path
  validateLogicalPath(options.rootPath);

  logger.info(`Scanning directory: ${dirPath}`);

  /**
   * Recursive walker function
   */
  async function walk(currentPath: string, relativePath: string = ''): Promise<void> {
    let entries;
    try {
      entries = await fs.readdir(currentPath, { withFileTypes: true });
    } catch (error: any) {
      logger.warn(`Cannot read directory: ${currentPath}`, { error: error.message });
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(currentPath, entry.name);
      const relPath = path.join(relativePath, entry.name);

      try {
        // Handle symlinks
        if (entry.isSymbolicLink()) {
          if (!options.followSymlinks) {
            logger.debug(`Skipping symlink: ${fullPath}`);
            continue;
          }

          // Follow symlink and check if it's a file or directory
          const stats = await fs.stat(fullPath);
          if (stats.isDirectory()) {
            await walk(fullPath, relPath);
          } else if (stats.isFile()) {
            await processFile(fullPath, relPath, stats.size);
          }
          continue;
        }

        // Handle directories
        if (entry.isDirectory()) {
          await walk(fullPath, relPath);
          continue;
        }

        // Handle regular files
        if (entry.isFile()) {
          const stats = await fs.stat(fullPath);
          await processFile(fullPath, relPath, stats.size);
        }
      } catch (error: any) {
        logger.warn(`Error processing ${fullPath}: ${error.message}`);
        continue;
      }
    }
  }

  /**
   * Process a single file
   */
  async function processFile(
    fullPath: string,
    relativePath: string,
    size: number
  ): Promise<void> {
    const fileName = path.basename(fullPath);

    // Check extension filter
    if (!validateFileExtension(fileName, options.allowedExtensions)) {
      logger.debug(`Skipping file with invalid extension: ${fileName}`);
      return;
    }

    // Validate file size
    try {
      validateFileSize(size);
    } catch (error: any) {
      logger.warn(`Skipping file that exceeds size limit: ${fileName}`, {
        size,
        error: error.message,
      });
      return;
    }

    // Construct logical path
    const normalizedRelPath = normalizePath(relativePath);
    const logicalPath = path.posix.join(options.rootPath, normalizedRelPath);

    // Validate logical path
    try {
      validateLogicalPath(logicalPath);
    } catch (error: any) {
      logger.warn(`Skipping file with invalid logical path: ${logicalPath}`, {
        error: error.message,
      });
      return;
    }

    // Determine content type
    const contentType = mime.lookup(fileName) || 'application/octet-stream';

    // Check if file is readable
    try {
      await fs.access(fullPath, fs.constants.R_OK);
    } catch (error) {
      logger.warn(`Skipping unreadable file: ${fullPath}`);
      return;
    }

    // Compute CID for the file
    let cid: string;
    try {
      cid = await computeFileCID(fullPath);
    } catch (error: any) {
      logger.warn(`Skipping file with CID computation error: ${fullPath}`, {
        error: error.message,
      });
      return;
    }

    // Add to results
    files.push({
      localPath: fullPath,
      logicalPath,
      fileName,
      size,
      contentType,
      cid,
    });

    totalSize += size;
    largestFile = Math.max(largestFile, size);
    smallestFile = Math.min(smallestFile, size);

    logger.debug(`Found file: ${fileName}`, { size, logicalPath });
  }

  // Start recursive scan
  await walk(dirPath);

  // Validate total batch size
  validateBatchSize(totalSize);

  // Sort files by size (smallest first for early validation)
  files.sort((a, b) => a.size - b.size);

  logger.info(`Scan complete: ${files.length} files found`, {
    totalSize,
    largestFile,
    smallestFile,
  });

  return {
    files,
    totalSize,
    totalFiles: files.length,
    largestFile: files.length > 0 ? largestFile : 0,
    smallestFile: files.length > 0 ? smallestFile : 0,
  };
}
