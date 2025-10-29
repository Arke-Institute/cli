/**
 * API client for communicating with the Arke Ingest Worker
 */

import axios, { AxiosInstance, AxiosError } from 'axios';
import type {
  InitBatchRequest,
  InitBatchResponse,
  StartFileUploadRequest,
  StartFileUploadResponse,
  CompleteFileUploadRequest,
  CompleteFileUploadResponse,
  FinalizeBatchResponse,
  ErrorResponse,
} from '../types/api.js';
import { WorkerAPIError, NetworkError } from '../utils/errors.js';
import { getLogger } from '../utils/logger.js';
import { retryWithBackoff } from '../utils/retry.js';

export interface WorkerClientConfig {
  baseUrl: string;
  timeout?: number;
  maxRetries?: number;
  debug?: boolean;
}

export class WorkerClient {
  private client: AxiosInstance;
  private maxRetries: number;
  private logger = getLogger();

  constructor(config: WorkerClientConfig) {
    this.maxRetries = config.maxRetries ?? 3;

    this.client = axios.create({
      baseURL: config.baseUrl,
      timeout: config.timeout ?? 30000, // 30 seconds
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Request interceptor for logging
    if (config.debug) {
      this.client.interceptors.request.use((request) => {
        this.logger.debug(`HTTP Request: ${request.method?.toUpperCase()} ${request.url}`, {
          data: request.data,
        });
        return request;
      });

      this.client.interceptors.response.use(
        (response) => {
          this.logger.debug(`HTTP Response: ${response.status}`, {
            data: response.data,
          });
          return response;
        },
        (error) => {
          if (error.response) {
            this.logger.debug(`HTTP Error Response: ${error.response.status}`, {
              data: error.response.data,
            });
          }
          return Promise.reject(error);
        }
      );
    }
  }

  /**
   * Initialize a new batch upload
   */
  async initBatch(params: InitBatchRequest): Promise<InitBatchResponse> {
    this.logger.info('Initializing batch', {
      uploader: params.uploader,
      rootPath: params.root_path,
      fileCount: params.file_count,
    });

    return retryWithBackoff(
      async () => {
        try {
          const response = await this.client.post<InitBatchResponse>(
            '/api/batches/init',
            params
          );
          return response.data;
        } catch (error) {
          throw this.handleError(error, 'Failed to initialize batch');
        }
      },
      { maxRetries: this.maxRetries }
    );
  }

  /**
   * Request presigned URLs for a file upload
   */
  async startFileUpload(
    batchId: string,
    params: StartFileUploadRequest
  ): Promise<StartFileUploadResponse> {
    this.logger.debug(`Starting file upload: ${params.file_name}`, {
      batchId,
      size: params.file_size,
    });

    return retryWithBackoff(
      async () => {
        try {
          const response = await this.client.post<StartFileUploadResponse>(
            `/api/batches/${batchId}/files/start`,
            params
          );
          return response.data;
        } catch (error) {
          throw this.handleError(error, `Failed to start upload for ${params.file_name}`);
        }
      },
      { maxRetries: this.maxRetries }
    );
  }

  /**
   * Notify worker that a file upload is complete
   */
  async completeFileUpload(
    batchId: string,
    params: CompleteFileUploadRequest
  ): Promise<CompleteFileUploadResponse> {
    this.logger.debug(`Completing file upload: ${params.r2_key}`, { batchId });

    return retryWithBackoff(
      async () => {
        try {
          const response = await this.client.post<CompleteFileUploadResponse>(
            `/api/batches/${batchId}/files/complete`,
            params
          );
          return response.data;
        } catch (error) {
          throw this.handleError(error, `Failed to complete upload for ${params.r2_key}`);
        }
      },
      { maxRetries: this.maxRetries }
    );
  }

  /**
   * Finalize the batch and enqueue for processing
   */
  async finalizeBatch(batchId: string): Promise<FinalizeBatchResponse> {
    this.logger.info('Finalizing batch', { batchId });

    return retryWithBackoff(
      async () => {
        try {
          const response = await this.client.post<FinalizeBatchResponse>(
            `/api/batches/${batchId}/finalize`
          );
          return response.data;
        } catch (error) {
          throw this.handleError(error, 'Failed to finalize batch');
        }
      },
      { maxRetries: this.maxRetries }
    );
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<any> {
    try {
      const response = await this.client.get('/');
      return response.data;
    } catch (error) {
      throw this.handleError(error, 'Health check failed');
    }
  }

  /**
   * Handle and transform errors from axios
   */
  private handleError(error: any, defaultMessage: string): Error {
    if (axios.isAxiosError(error)) {
      const axiosError = error as AxiosError<ErrorResponse>;

      // Network errors
      if (!axiosError.response) {
        return new NetworkError(
          `Network error: ${axiosError.message}`,
          axiosError
        );
      }

      // API errors
      const statusCode = axiosError.response.status;
      const errorData = axiosError.response.data;

      const message = errorData?.error || defaultMessage;
      return new WorkerAPIError(message, statusCode, errorData);
    }

    // Unknown error
    return error instanceof Error ? error : new Error(String(error));
  }
}
