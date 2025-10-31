/**
 * Preprocessor configuration and types
 */

import type { FileInfo } from './file.js';

/**
 * TIFF conversion mode
 */
export type TiffMode = 'convert' | 'preserve' | 'both' | 'none';

/**
 * Preprocessor configuration
 */
export interface PreprocessorConfig {
  /** TIFF conversion mode */
  tiffMode: TiffMode;

  /** JPEG quality for TIFF conversions (1-100) */
  tiffQuality: number;

  /** Directory for preprocessed files (temp by default) */
  preprocessDir?: string;
}

/**
 * Default preprocessor configuration
 */
export const DEFAULT_PREPROCESSOR_CONFIG: PreprocessorConfig = {
  tiffMode: 'convert',
  tiffQuality: 95,
};

/**
 * Result from preprocessing operation
 */
export interface PreprocessorResult {
  /** Files to upload (may include originals + conversions or just conversions) */
  files: FileInfo[];

  /** Number of files that were processed */
  processedCount: number;

  /** Number of files that were skipped */
  skippedCount: number;

  /** Any warnings (non-fatal errors) */
  warnings: string[];
}

/**
 * Preprocessor interface - implement this to create new preprocessors
 */
export interface Preprocessor {
  /** Preprocessor name for logging */
  name: string;

  /**
   * Check if this preprocessor should run on the given files
   */
  shouldRun(files: FileInfo[], config: PreprocessorConfig): boolean;

  /**
   * Execute preprocessing, return modified file list
   */
  process(files: FileInfo[], config: PreprocessorConfig): Promise<PreprocessorResult>;

  /**
   * Clean up any temporary files created during preprocessing
   */
  cleanup(): Promise<void>;
}
