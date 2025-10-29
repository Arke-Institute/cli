/**
 * Core upload orchestration - coordinates scanning, uploading, and finalization
 */

import type { UploadConfig, BatchContext } from '../types/batch.js';
import type { UploadTask } from '../types/file.js';
import { WorkerClient } from './worker-client.js';
import { scanDirectory } from './scanner.js';
import { uploadSimple } from './simple.js';
import { uploadMultipart } from './multipart.js';
import { ProgressTracker } from './progress.js';
import { getLogger } from '../utils/logger.js';
import chalk from 'chalk';
import ora from 'ora';

export class Uploader {
  private config: UploadConfig;
  private client: WorkerClient;
  private logger = getLogger();

  constructor(config: UploadConfig) {
    this.config = config;
    this.client = new WorkerClient({
      baseUrl: config.workerUrl,
      debug: config.debug,
    });
  }

  /**
   * Execute the full upload workflow
   */
  async upload(): Promise<void> {
    try {
      // Step 1: Scan directory
      const scanResult = await this.scanFiles();

      if (this.config.dryRun) {
        this.printDryRunSummary(scanResult.totalFiles, scanResult.totalSize);
        return;
      }

      // Step 2: Initialize batch
      const batchContext = await this.initializeBatch(
        scanResult.files,
        scanResult.totalSize
      );

      // Step 3: Upload files
      await this.uploadFiles(batchContext);

      // Step 4: Finalize batch
      await this.finalizeBatch(batchContext);

      console.log(chalk.green.bold('\n✓ Upload complete!'));
    } catch (error: any) {
      this.logger.error('Upload failed', { error: error.message });
      console.log(chalk.red.bold('\n✗ Upload failed: ' + error.message));
      throw error;
    }
  }

  /**
   * Step 1: Scan directory for files
   */
  private async scanFiles() {
    const spinner = ora('Scanning directory...').start();

    try {
      const scanResult = await scanDirectory(this.config.directory, {
        rootPath: this.config.rootPath,
        allowedExtensions: this.config.allowedExtensions,
      });

      spinner.succeed(
        `Found ${scanResult.totalFiles} files (${this.formatBytes(scanResult.totalSize)})`
      );

      return scanResult;
    } catch (error) {
      spinner.fail('Directory scan failed');
      throw error;
    }
  }

  /**
   * Step 2: Initialize batch with worker
   */
  private async initializeBatch(
    files: any[],
    totalSize: number
  ): Promise<BatchContext> {
    const spinner = ora('Initializing batch...').start();

    try {
      const response = await this.client.initBatch({
        uploader: this.config.uploader,
        root_path: this.config.rootPath,
        file_count: files.length,
        total_size: totalSize,
        metadata: this.config.metadata,
      });

      spinner.succeed(`Batch initialized: ${response.batch_id}`);

      // Small delay to allow KV state to propagate
      await new Promise((resolve) => setTimeout(resolve, 1000));

      const tasks: UploadTask[] = files.map((file) => ({
        ...file,
        status: 'pending' as const,
        bytesUploaded: 0,
      }));

      return {
        batchId: response.batch_id,
        sessionId: response.session_id,
        workerUrl: this.config.workerUrl,
        uploader: this.config.uploader,
        rootPath: this.config.rootPath,
        metadata: this.config.metadata,
        tasks,
        totalSize,
        createdAt: new Date(),
      };
    } catch (error) {
      spinner.fail('Batch initialization failed');
      throw error;
    }
  }

  /**
   * Step 3: Upload all files with concurrency control
   */
  private async uploadFiles(context: BatchContext): Promise<void> {
    const progress = new ProgressTracker(context.tasks.length, context.totalSize);
    progress.start();

    const queue = [...context.tasks];
    const inProgress: Promise<void>[] = [];
    let hasErrors = false;

    const uploadWorker = async (): Promise<void> => {
      while (queue.length > 0) {
        const task = queue.shift();
        if (!task) break;

        try {
          await this.uploadFile(context.batchId, task, progress);
        } catch (error: any) {
          hasErrors = true;
          this.logger.error(`Failed to upload ${task.fileName}`, {
            error: error.message,
          });
        }
      }
    };

    // Start workers
    const concurrency = Math.min(this.config.parallelUploads, context.tasks.length);
    for (let i = 0; i < concurrency; i++) {
      inProgress.push(uploadWorker());
    }

    // Wait for all workers to complete
    await Promise.all(inProgress);

    progress.stop();

    if (hasErrors) {
      throw new Error('Some files failed to upload');
    }
  }

  /**
   * Upload a single file
   */
  private async uploadFile(
    batchId: string,
    task: UploadTask,
    progress: ProgressTracker
  ): Promise<void> {
    progress.setCurrentFile(task.fileName);
    task.status = 'uploading';
    task.startedAt = new Date();

    try {
      // Small delay before each file to avoid overwhelming worker state management
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Request presigned URLs from worker
      const uploadInfo = await this.client.startFileUpload(batchId, {
        file_name: task.fileName,
        file_size: task.size,
        logical_path: task.logicalPath,
        content_type: task.contentType,
      });

      task.r2Key = uploadInfo.r2_key;
      task.uploadType = uploadInfo.upload_type;

      // Progress callback
      const onProgress = (bytes: number) => {
        progress.updateBytes(bytes);
      };

      // Upload to R2
      if (uploadInfo.upload_type === 'simple') {
        if (!uploadInfo.presigned_url) {
          throw new Error('No presigned URL provided for simple upload');
        }

        await uploadSimple(task, {
          presignedUrl: uploadInfo.presigned_url,
          onProgress,
        });

        // Notify worker
        await this.client.completeFileUpload(batchId, {
          r2_key: uploadInfo.r2_key,
        });
      } else {
        // Multipart upload
        if (!uploadInfo.presigned_urls || !uploadInfo.upload_id || !uploadInfo.part_size) {
          throw new Error('Missing multipart upload information');
        }

        task.uploadId = uploadInfo.upload_id;

        const parts = await uploadMultipart(task, {
          uploadId: uploadInfo.upload_id,
          partSize: uploadInfo.part_size,
          presignedUrls: uploadInfo.presigned_urls,
          onProgress,
          parallelParts: this.config.parallelParts,
        });

        // Notify worker
        await this.client.completeFileUpload(batchId, {
          r2_key: uploadInfo.r2_key,
          upload_id: uploadInfo.upload_id,
          parts,
        });
      }

      task.status = 'completed';
      task.completedAt = new Date();
      progress.fileCompleted(task.fileName);
    } catch (error: any) {
      task.status = 'failed';
      task.error = error.message;
      progress.fileFailed(task.fileName, error.message);
      throw error;
    }
  }

  /**
   * Step 4: Finalize batch
   */
  private async finalizeBatch(context: BatchContext): Promise<void> {
    const spinner = ora('Finalizing batch...').start();

    try {
      const result = await this.client.finalizeBatch(context.batchId);

      spinner.succeed(
        `Batch finalized: ${result.files_uploaded} files enqueued for processing`
      );

      console.log(chalk.gray(`Batch ID: ${result.batch_id}`));
      console.log(chalk.gray(`R2 Prefix: ${result.r2_prefix}`));
    } catch (error) {
      spinner.fail('Batch finalization failed');
      throw error;
    }
  }

  /**
   * Print dry-run summary
   */
  private printDryRunSummary(totalFiles: number, totalSize: number): void {
    console.log(chalk.yellow.bold('\n[DRY RUN MODE]'));
    console.log(chalk.gray('No files will be uploaded\n'));
    console.log(`Would upload ${totalFiles} files (${this.formatBytes(totalSize)})`);
    console.log(`To worker: ${this.config.workerUrl}`);
    console.log(`Root path: ${this.config.rootPath}`);
    console.log(`Uploader: ${this.config.uploader}`);
  }

  /**
   * Format bytes helper
   */
  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
  }
}
