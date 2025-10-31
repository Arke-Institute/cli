/**
 * Upload command handler
 */

import { Command } from 'commander';
import path from 'path';
import fs from 'fs/promises';
import type { UploadConfig } from '../types/batch.js';
import { Uploader } from '../lib/uploader.js';
import { initLogger } from '../utils/logger.js';
import { loadConfig } from '../lib/config.js';
import {
  validateWorkerUrl,
  validateUploader,
  validateMetadata,
  validateLogicalPath,
  validateParentPi,
} from '../lib/validation.js';
import { ValidationError } from '../utils/errors.js';
import chalk from 'chalk';

export function createUploadCommand(): Command {
  const cmd = new Command('upload');

  cmd
    .description('Upload a directory of files to Arke Institute')
    .argument('<directory>', 'Directory to upload')
    .option('--worker-url <url>', 'Worker API URL (default: https://ingest.arke.institute)')
    .option('--uploader <name>', 'Name of person uploading (required if not in config/env)')
    .option('--root-path <path>', 'Logical root path', '/')
    .option('--parent-pi <pi>', 'Parent PI to attach collection to (default: origin block)', '00000000000000000000000000')
    .option('--metadata <json>', 'Batch metadata as JSON string')
    .option('--parallel <n>', 'Concurrent file uploads', '5')
    .option('--parallel-parts <n>', 'Concurrent parts per multipart upload', '3')
    .option('--dry-run', 'Scan files but do not upload', false)
    .option('--resume', 'Resume interrupted upload', false)
    .option('--debug', 'Enable debug logging', false)
    .option('--log-file <path>', 'Write logs to file')
    .action(async (directory: string, options: any) => {
      try {
        await handleUpload(directory, options);
      } catch (error: any) {
        if (error instanceof ValidationError) {
          console.error(chalk.red(`Validation error: ${error.message}`));
          process.exit(1);
        }
        console.error(chalk.red(`Error: ${error.message}`));
        if (options.debug && error.stack) {
          console.error(chalk.gray(error.stack));
        }
        process.exit(1);
      }
    });

  return cmd;
}

async function handleUpload(directory: string, options: any): Promise<void> {
  // Initialize logger
  initLogger(options.debug, options.logFile);

  // Load configuration from file, env vars, and CLI options
  const config = await loadConfig(options);

  // Validate inputs
  validateWorkerUrl(config.workerUrl!);
  if (!config.uploader) {
    throw new ValidationError('Uploader name is required. Set via --uploader, ARKE_UPLOADER env var, or config file.', 'uploader');
  }
  validateUploader(config.uploader);
  validateLogicalPath(config.rootPath!);
  validateParentPi(config.parentPi!);

  // Parse metadata if provided
  let metadata: Record<string, any> | undefined = config.metadata;
  if (options.metadata) {
    metadata = validateMetadata(options.metadata);
  }

  // Use config values (already parsed)
  const parallelUploads = config.parallel!;
  const parallelParts = config.parallelParts!;

  if (isNaN(parallelUploads) || parallelUploads < 1) {
    throw new ValidationError('parallel must be a positive number');
  }

  if (isNaN(parallelParts) || parallelParts < 1) {
    throw new ValidationError('parallel-parts must be a positive number');
  }

  // Resolve directory path
  const dirPath = path.resolve(directory);

  // Check directory exists
  try {
    const stats = await fs.stat(dirPath);
    if (!stats.isDirectory()) {
      throw new ValidationError(`Not a directory: ${dirPath}`);
    }
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      throw new ValidationError(`Directory not found: ${dirPath}`);
    }
    throw error;
  }

  // Build final upload config
  const uploadConfig: UploadConfig = {
    workerUrl: config.workerUrl!,
    uploader: config.uploader!,
    rootPath: config.rootPath!,
    parentPi: config.parentPi!,
    directory: dirPath,
    metadata,
    parallelUploads,
    parallelParts,
    processing: config.processing,
    debug: options.debug,
    dryRun: options.dryRun,
    resume: options.resume,
    logFile: options.logFile,
  };

  // Print configuration
  console.log(chalk.bold('\nArke Upload Configuration:'));
  console.log(chalk.gray(`Directory: ${dirPath}`));
  console.log(chalk.gray(`Worker URL: ${uploadConfig.workerUrl}`));
  console.log(chalk.gray(`Root Path: ${uploadConfig.rootPath}`));
  console.log(chalk.gray(`Parent PI: ${uploadConfig.parentPi}`));
  console.log(chalk.gray(`Uploader: ${uploadConfig.uploader}`));
  console.log(chalk.gray(`Parallel Uploads: ${uploadConfig.parallelUploads}`));
  if (uploadConfig.metadata) {
    console.log(chalk.gray(`Metadata: ${JSON.stringify(uploadConfig.metadata)}`));
  }
  console.log('');

  // Create uploader and run
  const uploader = new Uploader(uploadConfig);
  await uploader.upload();
}
