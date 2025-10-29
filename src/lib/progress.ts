/**
 * Progress tracking and display
 */

import cliProgress from 'cli-progress';
import chalk from 'chalk';
import { formatBytes } from './validation.js';

export class ProgressTracker {
  private progressBar: cliProgress.SingleBar | null = null;
  private totalFiles: number = 0;
  private totalBytes: number = 0;
  private filesCompleted: number = 0;
  private filesFailed: number = 0;
  private bytesUploaded: number = 0;
  private startTime: number = 0;
  private currentFile: string = '';

  constructor(totalFiles: number, totalBytes: number) {
    this.totalFiles = totalFiles;
    this.totalBytes = totalBytes;
    this.startTime = Date.now();
  }

  /**
   * Start the progress display
   */
  start(): void {
    this.progressBar = new cliProgress.SingleBar(
      {
        format:
          chalk.cyan('{bar}') +
          ' | {percentage}% | {filesCompleted}/{totalFiles} files | ' +
          '{bytesUploadedFormatted}/{totalBytesFormatted} | ' +
          'Speed: {speed} | ETA: {eta}',
        barCompleteChar: '\u2588',
        barIncompleteChar: '\u2591',
        hideCursor: true,
      },
      cliProgress.Presets.shades_classic
    );

    this.progressBar.start(this.totalBytes, 0, {
      totalFiles: this.totalFiles,
      filesCompleted: 0,
      bytesUploadedFormatted: formatBytes(0),
      totalBytesFormatted: formatBytes(this.totalBytes),
      speed: '0 B/s',
      eta: '??',
    });
  }

  /**
   * Update progress with bytes uploaded
   */
  updateBytes(bytes: number): void {
    this.bytesUploaded += bytes;
    this.update();
  }

  /**
   * Mark current file being uploaded
   */
  setCurrentFile(fileName: string): void {
    this.currentFile = fileName;
    console.log(chalk.blue(`\n→ ${fileName}`));
  }

  /**
   * Mark file as completed
   */
  fileCompleted(fileName: string): void {
    this.filesCompleted++;
    console.log(chalk.green(`✓ ${fileName}`));
    this.update();
  }

  /**
   * Mark file as failed
   */
  fileFailed(fileName: string, error: string): void {
    this.filesFailed++;
    console.log(chalk.red(`✗ ${fileName}: ${error}`));
    this.update();
  }

  /**
   * Update the progress bar
   */
  private update(): void {
    if (!this.progressBar) return;

    const elapsed = (Date.now() - this.startTime) / 1000; // seconds
    const speed = elapsed > 0 ? this.bytesUploaded / elapsed : 0;
    const remaining = this.totalBytes - this.bytesUploaded;
    const eta = speed > 0 ? remaining / speed : 0;

    this.progressBar.update(this.bytesUploaded, {
      totalFiles: this.totalFiles,
      filesCompleted: this.filesCompleted,
      bytesUploadedFormatted: formatBytes(this.bytesUploaded),
      totalBytesFormatted: formatBytes(this.totalBytes),
      speed: `${formatBytes(speed)}/s`,
      eta: this.formatEta(eta),
    });
  }

  /**
   * Stop the progress display
   */
  stop(): void {
    if (this.progressBar) {
      this.progressBar.stop();
    }

    this.printSummary();
  }

  /**
   * Print final summary
   */
  private printSummary(): void {
    console.log('\n' + chalk.bold('Upload Summary:'));
    console.log(chalk.green(`✓ Completed: ${this.filesCompleted} files`));

    if (this.filesFailed > 0) {
      console.log(chalk.red(`✗ Failed: ${this.filesFailed} files`));
    }

    const elapsed = (Date.now() - this.startTime) / 1000;
    const avgSpeed = elapsed > 0 ? this.bytesUploaded / elapsed : 0;

    console.log(`Total uploaded: ${formatBytes(this.bytesUploaded)}`);
    console.log(`Average speed: ${formatBytes(avgSpeed)}/s`);
    console.log(`Total time: ${this.formatDuration(elapsed)}`);
  }

  /**
   * Format ETA in human-readable form
   */
  private formatEta(seconds: number): string {
    if (!isFinite(seconds)) return '??';
    if (seconds < 60) return `${Math.round(seconds)}s`;
    if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
    return `${Math.round(seconds / 3600)}h`;
  }

  /**
   * Format duration in human-readable form
   */
  private formatDuration(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);

    if (hours > 0) {
      return `${hours}h ${minutes}m ${secs}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${secs}s`;
    } else {
      return `${secs}s`;
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
