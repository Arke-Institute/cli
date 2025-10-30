/**
 * Progress tracking and display
 */

import chalk from 'chalk';
import { formatBytes } from './validation.js';

export class ProgressTracker {
  private totalFiles: number = 0;
  private totalBytes: number = 0;
  private filesCompleted: number = 0;
  private filesFailed: number = 0;
  private bytesUploaded: number = 0;
  private startTime: number = 0;

  constructor(totalFiles: number, totalBytes: number) {
    this.totalFiles = totalFiles;
    this.totalBytes = totalBytes;
    this.startTime = Date.now();
  }

  /**
   * Start the progress display
   */
  start(): void {
    console.log('\nUploading files...');
  }

  /**
   * Update progress with bytes uploaded
   */
  updateBytes(bytes: number): void {
    this.bytesUploaded += bytes;
  }

  /**
   * Mark current file being uploaded (no-op for simplified display)
   */
  setCurrentFile(fileName: string): void {
    // Do nothing - we'll show file name when it completes
  }

  /**
   * Mark file as completed
   */
  fileCompleted(fileName: string): void {
    this.filesCompleted++;
    console.log(chalk.green(`  ${fileName} ✓`));
  }

  /**
   * Mark file as failed
   */
  fileFailed(fileName: string, error: string): void {
    this.filesFailed++;
    console.log(chalk.red(`  ${fileName} ✗ ${error}`));
  }

  /**
   * Stop the progress display
   */
  stop(): void {
    const elapsed = (Date.now() - this.startTime) / 1000;
    const avgSpeed = elapsed > 0 ? this.bytesUploaded / elapsed : 0;

    console.log(
      chalk.gray(`  [${this.filesCompleted}/${this.totalFiles}] ${formatBytes(this.bytesUploaded)} uploaded in ${this.formatDuration(elapsed)} (${formatBytes(avgSpeed)}/s)`)
    );

    if (this.filesFailed > 0) {
      console.log(chalk.red(`\n✗ Failed: ${this.filesFailed} files`));
    }
  }

  /**
   * Format duration in human-readable form
   */
  private formatDuration(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    if (hours > 0) {
      return `${hours}h ${minutes}m ${secs.toFixed(1)}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${secs.toFixed(1)}s`;
    } else {
      return `${secs.toFixed(1)}s`;
    }
  }

  /**
   * Get current statistics
   */
  getStats() {
    const elapsed = (Date.now() - this.startTime) / 1000;
    const speed = elapsed > 0 ? this.bytesUploaded / elapsed : 0;

    return {
      filesCompleted: this.filesCompleted,
      filesFailed: this.filesFailed,
      bytesUploaded: this.bytesUploaded,
      totalBytes: this.totalBytes,
      speed,
      elapsed,
    };
  }
}
