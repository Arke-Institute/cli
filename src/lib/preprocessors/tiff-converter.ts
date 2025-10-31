/**
 * TIFF to JPEG converter preprocessor
 */

import sharp from 'sharp';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import mime from 'mime-types';
import type { FileInfo } from '../../types/file.js';
import type { Preprocessor, PreprocessorConfig, PreprocessorResult } from '../../types/preprocessor.js';
import { computeFileCID } from '../../utils/hash.js';
import { getLogger } from '../../utils/logger.js';

export class TiffConverter implements Preprocessor {
  name = 'TiffConverter';
  private logger = getLogger();
  private tempFiles: string[] = [];
  private tempDir: string | null = null;

  /**
   * Check if this preprocessor should run
   */
  shouldRun(files: FileInfo[], config: PreprocessorConfig): boolean {
    // Skip if mode is 'none'
    if (config.tiffMode === 'none') {
      return false;
    }

    // Check if there are any TIFF files
    const hasTiffs = files.some((f) => this.isTiffFile(f.fileName));
    return hasTiffs;
  }

  /**
   * Process TIFF files according to config
   */
  async process(files: FileInfo[], config: PreprocessorConfig): Promise<PreprocessorResult> {
    const outputFiles: FileInfo[] = [];
    let processedCount = 0;
    let skippedCount = 0;
    const warnings: string[] = [];

    // Create temp directory if needed
    if (config.tiffMode === 'convert' || config.tiffMode === 'both') {
      this.tempDir = config.preprocessDir || (await this.createTempDir());
      this.logger.debug(`Using temp directory: ${this.tempDir}`);
    }

    for (const file of files) {
      // Non-TIFF files pass through unchanged
      if (!this.isTiffFile(file.fileName)) {
        outputFiles.push(file);
        continue;
      }

      try {
        const result = await this.processFile(file, config);
        this.logger.debug(`processFile returned ${result.files.length} files for ${file.fileName}`, {
          fileNames: result.files.map(f => f.fileName),
          mode: config.tiffMode,
        });
        outputFiles.push(...result.files);
        processedCount += result.processed ? 1 : 0;
        skippedCount += result.skipped ? 1 : 0;

        if (result.warning) {
          warnings.push(result.warning);
        }
      } catch (error: any) {
        // Non-fatal: preserve original file and warn
        this.logger.warn(`Failed to convert ${file.fileName}: ${error.message}`);
        warnings.push(`Failed to convert ${file.fileName}: ${error.message}`);
        outputFiles.push(file);
        skippedCount++;
      }
    }

    return {
      files: outputFiles,
      processedCount,
      skippedCount,
      warnings,
    };
  }

  /**
   * Process a single TIFF file
   */
  private async processFile(
    file: FileInfo,
    config: PreprocessorConfig
  ): Promise<{ files: FileInfo[]; processed: boolean; skipped: boolean; warning?: string }> {
    const mode = config.tiffMode;

    this.logger.debug(`processFile called for ${file.fileName} with mode: ${mode}`);

    // Mode: preserve - keep original TIFF only
    if (mode === 'preserve') {
      this.logger.debug(`Preserving original TIFF: ${file.fileName}`);
      return { files: [file], processed: false, skipped: true };
    }

    // Mode: convert or both - convert to JPEG
    const jpegFile = await this.convertToJpeg(file, config.tiffQuality);

    this.logger.debug(`After convertToJpeg, mode is: ${mode}`);

    if (mode === 'convert') {
      // Only upload JPEG
      this.logger.debug(`Converted ${file.fileName} to ${jpegFile.fileName}`);
      return { files: [jpegFile], processed: true, skipped: false };
    } else if (mode === 'both') {
      // Upload both TIFF and JPEG
      this.logger.debug(`Converted ${file.fileName} to ${jpegFile.fileName} (keeping both)`);
      const result = [file, jpegFile];
      this.logger.debug(`Returning ${result.length} files:`, {
        files: result.map(f => ({ name: f.fileName, path: f.localPath }))
      });
      return { files: result, processed: true, skipped: false };
    }

    // Should never reach here
    this.logger.warn(`Unexpected mode: ${mode}, returning single file`);
    return { files: [file], processed: false, skipped: true };
  }

  /**
   * Convert a TIFF file to JPEG
   */
  private async convertToJpeg(file: FileInfo, quality: number): Promise<FileInfo> {
    if (!this.tempDir) {
      throw new Error('Temp directory not initialized');
    }

    // Generate JPEG filename
    const baseName = path.basename(file.fileName, path.extname(file.fileName));
    const jpegFileName = `${baseName}.jpg`;
    const jpegPath = path.join(this.tempDir, jpegFileName);

    this.logger.debug(`Converting ${file.localPath} to ${jpegPath}`);

    // Convert using sharp
    await sharp(file.localPath)
      .jpeg({
        quality,
        mozjpeg: true, // Use mozjpeg for better compression
      })
      .toFile(jpegPath);

    // Track temp file for cleanup
    this.tempFiles.push(jpegPath);

    // Get size of converted file
    const stats = await fs.stat(jpegPath);
    const jpegSize = stats.size;

    // Compute CID for JPEG
    const jpegCid = await computeFileCID(jpegPath);

    // Construct logical path for JPEG
    const originalLogicalPath = file.logicalPath;
    const logicalDir = path.dirname(originalLogicalPath);
    const jpegLogicalPath = path.posix.join(logicalDir, jpegFileName);

    // Create new FileInfo for JPEG
    const jpegFile: FileInfo = {
      localPath: jpegPath,
      logicalPath: jpegLogicalPath,
      fileName: jpegFileName,
      size: jpegSize,
      contentType: 'image/jpeg',
      cid: jpegCid,
      processingConfig: file.processingConfig, // Inherit processing config
    };

    this.logger.debug(`Converted TIFF: ${file.size} bytes → ${jpegSize} bytes (${this.getCompressionRatio(file.size, jpegSize)}% reduction)`);

    return jpegFile;
  }

  /**
   * Check if a file is a TIFF
   */
  private isTiffFile(fileName: string): boolean {
    const ext = path.extname(fileName).toLowerCase();
    return ext === '.tif' || ext === '.tiff';
  }

  /**
   * Calculate compression ratio percentage
   */
  private getCompressionRatio(originalSize: number, newSize: number): number {
    if (originalSize === 0) return 0;
    const reduction = ((originalSize - newSize) / originalSize) * 100;
    return Math.round(reduction);
  }

  /**
   * Create a temporary directory
   */
  private async createTempDir(): Promise<string> {
    const tempDir = path.join(os.tmpdir(), `arke-preprocess-${Date.now()}`);
    await fs.mkdir(tempDir, { recursive: true, mode: 0o700 });
    this.logger.debug(`Created temp directory: ${tempDir}`);
    return tempDir;
  }

  /**
   * Clean up temporary files
   */
  async cleanup(): Promise<void> {
    this.logger.debug(`Cleaning up ${this.tempFiles.length} temp files`);

    // Delete all temp files
    for (const file of this.tempFiles) {
      try {
        await fs.unlink(file);
        this.logger.debug(`Deleted temp file: ${file}`);
      } catch (error: any) {
        if (error.code !== 'ENOENT') {
          this.logger.warn(`Failed to delete temp file ${file}: ${error.message}`);
        }
      }
    }

    // Delete temp directory if we created it
    if (this.tempDir) {
      try {
        await fs.rmdir(this.tempDir);
        this.logger.debug(`Deleted temp directory: ${this.tempDir}`);
      } catch (error: any) {
        if (error.code !== 'ENOENT' && error.code !== 'ENOTEMPTY') {
          this.logger.warn(`Failed to delete temp directory ${this.tempDir}: ${error.message}`);
        }
      }
    }

    // Reset state
    this.tempFiles = [];
    this.tempDir = null;
  }
}
