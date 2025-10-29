/**
 * Custom error classes for better error handling
 */

export class WorkerAPIError extends Error {
  constructor(
    message: string,
    public statusCode?: number,
    public details?: any
  ) {
    super(message);
    this.name = 'WorkerAPIError';
    Error.captureStackTrace(this, this.constructor);
  }
}

export class UploadError extends Error {
  constructor(
    message: string,
    public fileName?: string,
    public cause?: Error
  ) {
    super(message);
    this.name = 'UploadError';
    Error.captureStackTrace(this, this.constructor);
  }
}

export class ValidationError extends Error {
  constructor(message: string, public field?: string) {
    super(message);
    this.name = 'ValidationError';
    Error.captureStackTrace(this, this.constructor);
  }
}

export class NetworkError extends Error {
  constructor(message: string, public cause?: Error) {
    super(message);
    this.name = 'NetworkError';
    Error.captureStackTrace(this, this.constructor);
  }
}

export class ScanError extends Error {
  constructor(message: string, public path?: string) {
    super(message);
    this.name = 'ScanError';
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Determine if an error is retryable
 */
export function isRetryableError(error: any): boolean {
  // Network errors are retryable
  if (error instanceof NetworkError) {
    return true;
  }

  // Worker API 5xx errors are retryable
  if (error instanceof WorkerAPIError) {
    return error.statusCode ? error.statusCode >= 500 : false;
  }

  // Axios network errors
  if (error.code === 'ECONNRESET' ||
      error.code === 'ETIMEDOUT' ||
      error.code === 'ENOTFOUND' ||
      error.code === 'ECONNREFUSED') {
    return true;
  }

  return false;
}
