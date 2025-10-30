/**
 * API request and response types matching the Arke Ingest Worker API
 * @see API.md for full specification
 */

import { ProcessingConfig } from './processing.js';

// ============================================================================
// Request Types
// ============================================================================

export interface InitBatchRequest {
  uploader: string;
  root_path: string;
  parent_pi: string;
  file_count: number;
  total_size: number;
  metadata?: Record<string, any>;
}

export interface StartFileUploadRequest {
  file_name: string;
  file_size: number;
  logical_path: string;
  content_type: string;
  cid: string;
  processing_config: ProcessingConfig;
}

export interface CompleteFileUploadRequest {
  r2_key: string;
  upload_id?: string;
  parts?: PartInfo[];
}

export interface PartInfo {
  part_number: number;
  etag: string;
}

// ============================================================================
// Response Types
// ============================================================================

export interface InitBatchResponse {
  batch_id: string;
  session_id: string;
}

export interface StartFileUploadResponse {
  r2_key: string;
  upload_type: 'simple' | 'multipart';
  presigned_url?: string;
  upload_id?: string;
  part_size?: number;
  presigned_urls?: PresignedUrlInfo[];
}

export interface PresignedUrlInfo {
  part_number: number;
  url: string;
}

export interface CompleteFileUploadResponse {
  success: boolean;
}

export interface FinalizeBatchResponse {
  batch_id: string;
  status: string;
  files_uploaded: number;
  total_bytes: number;
  r2_prefix: string;
}

// ============================================================================
// Error Response
// ============================================================================

export interface ErrorResponse {
  error: string;
  details?: any;
  incomplete?: string[];
}
