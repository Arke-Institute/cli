/**
 * Retry logic with exponential backoff
 */

import { isRetryableError } from './errors.js';
import { getLogger } from './logger.js';

export interface RetryOptions {
  maxRetries: number;
  initialDelay: number;
  maxDelay: number;
  shouldRetry?: (error: any) => boolean;
}

const DEFAULT_OPTIONS: RetryOptions = {
  maxRetries: 3,
  initialDelay: 1000, // 1 second
  maxDelay: 30000, // 30 seconds
  shouldRetry: isRetryableError,
};

/**
 * Retry a function with exponential backoff
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options: Partial<RetryOptions> = {}
): Promise<T> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const logger = getLogger();

  let lastError: any;

  for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;

      // Don't retry if we've exhausted attempts
      if (attempt >= opts.maxRetries) {
        logger.error(`All ${opts.maxRetries + 1} attempts failed`, { error });
        throw error;
      }

      // Check if error is retryable
      if (opts.shouldRetry && !opts.shouldRetry(error)) {
        logger.debug('Error is not retryable, failing immediately', { error });
        throw error;
      }

      // Calculate delay with exponential backoff
      const delay = Math.min(
        opts.initialDelay * Math.pow(2, attempt),
        opts.maxDelay
      );

      logger.warn(
        `Attempt ${attempt + 1}/${opts.maxRetries + 1} failed, retrying in ${delay}ms`,
        { error: error.message }
      );

      await sleep(delay);
    }
  }

  throw lastError;
}

/**
 * Sleep for a given number of milliseconds
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
