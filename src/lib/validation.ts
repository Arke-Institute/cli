/**
 * Validation utilities for paths, files, and configuration
 */

import { ValidationError } from '../utils/errors.js';

// Allowed file extensions per API spec
const ALLOWED_EXTENSIONS = [
  // Images
  '.tiff', '.tif', '.jpg', '.jpeg', '.png', '.gif', '.bmp',
  // Documents
  '.json', '.xml', '.txt', '.csv', '.pdf', '.md'
];

// Size limits per API spec
const MAX_FILE_SIZE = 5 * 1024 * 1024 * 1024; // 5 GB
const MAX_BATCH_SIZE = 100 * 1024 * 1024 * 1024; // 100 GB

// Invalid path characters
const INVALID_PATH_CHARS = /[<>:"|?*\x00-\x1f]/;

// Supported image content types for .image-ref.json files
const SUPPORTED_IMAGE_REF_CONTENT_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
];

/**
 * Validate a file extension
 */
export function validateFileExtension(
  fileName: string,
  allowedExtensions?: string[]
): boolean {
  const ext = getFileExtension(fileName);
  const allowed = allowedExtensions || ALLOWED_EXTENSIONS;
  return allowed.includes(ext.toLowerCase());
}

/**
 * Get file extension (including the dot)
 */
export function getFileExtension(fileName: string): string {
  const match = fileName.match(/\.[^.]+$/);
  return match ? match[0] : '';
}

/**
 * Validate file size
 */
export function validateFileSize(size: number): void {
  if (size <= 0) {
    throw new ValidationError('File size must be greater than 0');
  }
  if (size > MAX_FILE_SIZE) {
    throw new ValidationError(
      `File size (${formatBytes(size)}) exceeds maximum allowed size (${formatBytes(MAX_FILE_SIZE)})`
    );
  }
}

/**
 * Validate batch size
 */
export function validateBatchSize(totalSize: number): void {
  if (totalSize > MAX_BATCH_SIZE) {
    throw new ValidationError(
      `Total batch size (${formatBytes(totalSize)}) exceeds maximum allowed size (${formatBytes(MAX_BATCH_SIZE)})`
    );
  }
}

/**
 * Validate logical path format
 */
export function validateLogicalPath(path: string): void {
  // Must start with /
  if (!path.startsWith('/')) {
    throw new ValidationError('Logical path must start with /', 'path');
  }

  // No invalid characters
  if (INVALID_PATH_CHARS.test(path)) {
    throw new ValidationError(
      'Logical path contains invalid characters',
      'path'
    );
  }

  // Allow "/" as root path, otherwise require at least one segment
  const segments = path.split('/').filter((s) => s.length > 0);
  if (segments.length === 0 && path !== '/') {
    throw new ValidationError('Logical path cannot be empty', 'path');
  }

  // No . or .. segments (directory traversal)
  for (const segment of segments) {
    if (segment === '.' || segment === '..') {
      throw new ValidationError(
        'Logical path cannot contain . or .. segments',
        'path'
      );
    }
  }
}

/**
 * Validate worker URL
 */
export function validateWorkerUrl(url: string): void {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new Error('Protocol must be http or https');
    }
  } catch (error: any) {
    throw new ValidationError(`Invalid worker URL: ${error.message}`, 'workerUrl');
  }
}

/**
 * Validate uploader name
 */
export function validateUploader(uploader: string): void {
  if (!uploader || uploader.trim().length === 0) {
    throw new ValidationError('Uploader name cannot be empty', 'uploader');
  }
}

/**
 * Validate parent PI format
 * Note: Existence validation happens at worker level
 */
export function validateParentPi(pi: string): void {
  // PI must be exactly 26 characters (ULID format)
  if (pi.length !== 26) {
    throw new ValidationError(
      'parent_pi must be exactly 26 characters',
      'parent_pi'
    );
  }

  // PI must be alphanumeric (case-insensitive)
  if (!/^[0-9A-Z]{26}$/i.test(pi)) {
    throw new ValidationError(
      'parent_pi must contain only alphanumeric characters (0-9, A-Z)',
      'parent_pi'
    );
  }
}

/**
 * Validate metadata JSON
 */
export function validateMetadata(metadata: string): Record<string, any> {
  try {
    const parsed = JSON.parse(metadata);
    if (typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('Metadata must be a JSON object');
    }
    return parsed;
  } catch (error: any) {
    throw new ValidationError(`Invalid metadata JSON: ${error.message}`, 'metadata');
  }
}

/**
 * Validate .image-ref.json file content
 *
 * Required fields:
 * - url: Publicly accessible HTTP(S) URL to the image
 *
 * Optional fields (validated if present):
 * - content_type: MIME type (must be one of the supported types if provided)
 * - size_bytes: File size in bytes (must be positive number if provided)
 * - original_name: Original filename for display
 *
 * Note: Additional fields (e.g., ocr, description, tags) are allowed and will be
 * passed through to the worker without validation.
 */
export function validateImageRefJson(content: string, fileName: string): void {
  let parsed: any;

  // Parse JSON
  try {
    parsed = JSON.parse(content);
  } catch (error: any) {
    throw new ValidationError(
      `Invalid JSON in ${fileName}: ${error.message}`,
      'imageRef'
    );
  }

  // Must be an object
  if (typeof parsed !== 'object' || Array.isArray(parsed) || parsed === null) {
    throw new ValidationError(
      `${fileName} must contain a JSON object`,
      'imageRef'
    );
  }

  // Required field: url
  if (!parsed.url || typeof parsed.url !== 'string') {
    throw new ValidationError(
      `${fileName} must contain a 'url' field with a string value`,
      'imageRef'
    );
  }

  // Validate URL format
  try {
    const url = new URL(parsed.url);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      throw new Error('URL must use HTTP or HTTPS protocol');
    }
  } catch (error: any) {
    throw new ValidationError(
      `Invalid URL in ${fileName}: ${error.message}`,
      'imageRef'
    );
  }

  // Optional field: content_type
  if (parsed.content_type !== undefined) {
    if (typeof parsed.content_type !== 'string') {
      throw new ValidationError(
        `${fileName}: content_type must be a string`,
        'imageRef'
      );
    }

    if (!SUPPORTED_IMAGE_REF_CONTENT_TYPES.includes(parsed.content_type)) {
      throw new ValidationError(
        `${fileName}: content_type '${parsed.content_type}' is not supported. Supported types: ${SUPPORTED_IMAGE_REF_CONTENT_TYPES.join(', ')}`,
        'imageRef'
      );
    }
  }

  // Optional field: size_bytes
  if (parsed.size_bytes !== undefined) {
    if (typeof parsed.size_bytes !== 'number' || parsed.size_bytes <= 0) {
      throw new ValidationError(
        `${fileName}: size_bytes must be a positive number`,
        'imageRef'
      );
    }
  }

  // Optional field: original_name
  if (parsed.original_name !== undefined) {
    if (typeof parsed.original_name !== 'string') {
      throw new ValidationError(
        `${fileName}: original_name must be a string`,
        'imageRef'
      );
    }
  }
}

/**
 * Format bytes to human-readable string
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';

  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
}

/**
 * Normalize path to POSIX format (forward slashes)
 */
export function normalizePath(path: string): string {
  return path.replace(/\\/g, '/');
}
