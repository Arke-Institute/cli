/**
 * Hash and CID computation utilities
 */

import fs from 'fs/promises';
import { CID } from 'multiformats/cid';
import * as raw from 'multiformats/codecs/raw';
import { sha256 } from 'multiformats/hashes/sha2';
import { getLogger } from './logger.js';

/**
 * Compute IPFS CID v1 for a file
 * Uses raw codec and SHA-256 hash
 * Returns base32-encoded CID string
 */
export async function computeFileCID(filePath: string): Promise<string> {
  const logger = getLogger();

  try {
    // Read file contents
    const fileBuffer = await fs.readFile(filePath);

    // Compute SHA-256 hash
    const hash = await sha256.digest(fileBuffer);

    // Create CID v1 with raw codec
    const cid = CID.create(1, raw.code, hash);

    // Return base32-encoded string (default for v1)
    const cidString = cid.toString();

    logger.debug(`Computed CID for ${filePath}`, {
      cid: cidString,
      size: fileBuffer.length,
    });

    return cidString;
  } catch (error: any) {
    logger.error(`Failed to compute CID for ${filePath}`, {
      error: error.message,
    });
    throw new Error(`CID computation failed: ${error.message}`);
  }
}

/**
 * Compute CID for a buffer (useful for testing or in-memory data)
 */
export async function computeBufferCID(buffer: Buffer): Promise<string> {
  const hash = await sha256.digest(buffer);
  const cid = CID.create(1, raw.code, hash);
  return cid.toString();
}
