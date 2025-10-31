/**
 * Preprocessor orchestrator - coordinates preprocessing operations
 */

import type { FileInfo } from '../types/file.js';
import type { PreprocessorConfig, Preprocessor } from '../types/preprocessor.js';
import { getLogger } from '../utils/logger.js';
import chalk from 'chalk';
import ora from 'ora';

export class PreprocessorOrchestrator {
  private preprocessors: Preprocessor[] = [];
  private logger = getLogger();

  /**
   * Register a preprocessor
   */
  register(preprocessor: Preprocessor): void {
    this.preprocessors.push(preprocessor);
    this.logger.debug(`Registered preprocessor: ${preprocessor.name}`);
  }

  /**
   * Run all applicable preprocessors on the file list
   */
  async run(
    files: FileInfo[],
    config: PreprocessorConfig,
    dryRun: boolean = false
  ): Promise<FileInfo[]> {
    let currentFiles = files;
    let totalProcessed = 0;
    let totalSkipped = 0;
    const allWarnings: string[] = [];

    // Find preprocessors that should run
    const applicablePreprocessors = this.preprocessors.filter((p) =>
      p.shouldRun(currentFiles, config)
    );

    if (applicablePreprocessors.length === 0) {
      this.logger.debug('No preprocessors applicable, skipping preprocessing');
      return files;
    }

    this.logger.info(`Running ${applicablePreprocessors.length} preprocessor(s)`);

    // Run each preprocessor in sequence
    for (const preprocessor of applicablePreprocessors) {
      const spinner = ora(`Running ${preprocessor.name}...`).start();

      try {
        if (dryRun) {
          // Dry run mode - just report what would happen
          const wouldProcess = currentFiles.filter((f) =>
            this.shouldProcessFile(f, preprocessor, config)
          ).length;

          spinner.succeed(
            chalk.yellow(
              `[DRY RUN] Would process ${wouldProcess} files with ${preprocessor.name}`
            )
          );

          continue;
        }

        // Actually run the preprocessor
        const result = await preprocessor.process(currentFiles, config);

        // Update file list
        currentFiles = result.files;
        totalProcessed += result.processedCount;
        totalSkipped += result.skippedCount;
        allWarnings.push(...result.warnings);

        if (result.processedCount > 0) {
          spinner.succeed(
            `${preprocessor.name}: processed ${result.processedCount} files` +
              (result.skippedCount > 0 ? `, skipped ${result.skippedCount}` : '')
          );
        } else {
          spinner.succeed(`${preprocessor.name}: no files processed`);
        }

        // Log warnings
        for (const warning of result.warnings) {
          this.logger.warn(`${preprocessor.name}: ${warning}`);
        }
      } catch (error: any) {
        spinner.fail(`${preprocessor.name} failed: ${error.message}`);
        this.logger.error(`Preprocessor ${preprocessor.name} failed`, {
          error: error.message,
        });

        // Clean up on error
        await this.cleanup();
        throw error;
      }
    }

    // Summary
    if (!dryRun && totalProcessed > 0) {
      this.logger.info('Preprocessing complete', {
        totalProcessed,
        totalSkipped,
        warningCount: allWarnings.length,
      });

      console.log(
        chalk.gray(
          `Preprocessing: ${totalProcessed} files processed, ${currentFiles.length} files ready for upload`
        )
      );
    }

    return currentFiles;
  }

  /**
   * Clean up temporary files from all preprocessors
   */
  async cleanup(): Promise<void> {
    this.logger.debug('Cleaning up preprocessors');

    for (const preprocessor of this.preprocessors) {
      try {
        await preprocessor.cleanup();
      } catch (error: any) {
        this.logger.warn(`Cleanup failed for ${preprocessor.name}`, {
          error: error.message,
        });
      }
    }
  }

  /**
   * Helper to check if a file should be processed (for dry run simulation)
   */
  private shouldProcessFile(
    file: FileInfo,
    preprocessor: Preprocessor,
    config: PreprocessorConfig
  ): boolean {
    // This is a simple heuristic for dry run
    // Actual preprocessors implement their own logic
    return preprocessor.shouldRun([file], config);
  }
}
