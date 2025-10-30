# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Arke Upload CLI is a command-line tool for uploading files to the Arke Institute's ingest service. Files are uploaded directly to Cloudflare R2 using presigned URLs, with the worker coordinating state but never handling file bytes. This architecture enables efficient, scalable uploads of archival material.

## Development Commands

### Build and Run
```bash
# Build TypeScript to JavaScript
npm run build

# Run in development mode (with tsx)
npm run dev upload ./example_dirs/iiif_test_small --uploader "Dev User" --debug

# Run production build
npm start

# Type checking only (no compilation)
npm run type-check
```

### Testing
```bash
# Run tests with Vitest
npm test

# Test with local worker
npm run dev upload ./example_dirs/iiif_test_small \
  --worker-url http://localhost:8787 \
  --uploader "Test User" \
  --debug

# Dry run (scan only, no upload)
npm run dev upload ./example_dirs/sample_archive_deep \
  --uploader "Test User" \
  --dry-run
```

### Installation
```bash
# Link for global development use
npm link

# After linking, use globally
arke-upload upload ./my-files --uploader "Jane Doe"
```

## Architecture

### Core Upload Flow

The upload process follows these phases, orchestrated by `Uploader` class (src/lib/uploader.ts):

1. **Scan** (scanner.ts): Recursively scan directory, validate files, compute CIDs
2. **Initialize** (worker-client.ts): Create batch session with worker API
3. **Upload** (simple.ts / multipart.ts): Upload files directly to R2 using presigned URLs
4. **Finalize** (worker-client.ts): Mark batch complete, enqueue for processing

### Key Components

**Uploader** (src/lib/uploader.ts:16-293)
- Main orchestrator coordinating all upload phases
- Manages worker pool for parallel file uploads
- Uses ProgressTracker for real-time feedback
- Handles both simple and multipart uploads based on file size

**WorkerClient** (src/lib/worker-client.ts:27-209)
- HTTP API client for communicating with ingest worker
- Endpoints: `/api/batches/init`, `/api/batches/{id}/files/start`, `/api/batches/{id}/files/complete`, `/api/batches/{id}/finalize`
- Automatic retry with exponential backoff for all requests
- See API.md for complete endpoint documentation

**Scanner** (src/lib/scanner.ts:34-216)
- Recursively walks directory tree
- Validates extensions, paths, and file sizes
- Computes CID (Content Identifier) for each file using multiformats library
- Returns FileInfo[] sorted by size (smallest first)

**Simple Upload** (src/lib/simple.ts:26-81)
- For files < 5 MB
- Single PUT request to presigned URL
- Entire file loaded into memory

**Multipart Upload** (src/lib/multipart.ts:39-228)
- For files ≥ 5 MB
- Splits file into 10 MB parts
- Uploads parts concurrently (default: 3 parallel)
- Returns PartInfo[] with ETags for R2 multipart completion
- Uses file handles to avoid loading entire file into memory

### Direct R2 Upload Pattern

The CLI never sends file data through the worker. Instead:
1. Client requests presigned URL(s) from worker
2. Worker generates URL(s) using R2 bucket API
3. Client uploads directly to R2 using presigned URL(s)
4. Client notifies worker of completion

This pattern keeps the worker stateless and enables efficient uploads even with Cloudflare Workers' memory limits.

### Configuration System

Configuration loading priority (src/lib/config.ts):
1. Config file (`.arke-upload.json` in current/home directory)
2. Environment variables (`ARKE_*` prefix)
3. CLI arguments (highest priority)

All options have sensible defaults except `uploader`, which is required.

### Error Handling

Custom error types (src/utils/errors.ts):
- `ValidationError` - Invalid input (paths, extensions, sizes)
- `ScanError` - Directory scanning issues
- `WorkerAPIError` - API errors from worker (includes status code)
- `NetworkError` - Network/connection failures
- `UploadError` - R2 upload failures

All network operations use retry logic (src/utils/retry.ts) with exponential backoff (default: 3 retries).

## Important Implementation Details

### CID Computation
Files are hashed using SHA-256 and encoded as CIDv1 with multiformats library (src/utils/hash.ts). The CID is computed during scanning and sent to the worker for content-addressable storage tracking.

### Progress Tracking
ProgressTracker (src/lib/progress.ts) uses `cli-progress` library to show:
- Overall progress bar with percentage
- Currently uploading file
- Recent completions/failures
- Real-time speed and ETA

Progress updates happen as bytes are uploaded, not just on file completion.

### Concurrency Control
Two levels of concurrency:
1. **File-level**: `--parallel` (default: 5) - How many files upload simultaneously
2. **Part-level**: `--parallel-parts` (default: 3) - How many parts per multipart upload

Both use worker pool pattern with shared queue.

### Logical vs Physical Paths
- **Local path**: Physical filesystem path (e.g., `/Users/jane/files/doc.pdf`)
- **Logical path**: Virtual archive path (e.g., `/series_1/box_7/doc.pdf`)

The `rootPath` option sets the logical root, and relative paths are preserved. This allows maintaining archive structure independent of local filesystem layout.

### File Filtering
By default, only specific extensions are allowed (see API.md). Use `--allowed-extensions` to customize. The scanner silently skips invalid files rather than failing.

## Testing Notes

### Example Directories
- `example_dirs/iiif_test_small`: IIIF archive structure (3.6 MB, 18 files, includes TIFFs and JSON)
- `example_dirs/sample_archive_deep`: Simple nested structure (20 KB, 5 files)

Note: These directories are in `.gitignore` and not committed to the repository.

### Local Worker Testing
The worker typically runs at `http://localhost:8787` in development. Always use `--debug` flag when testing to see detailed HTTP requests/responses and progress logs.

### Dry Run Testing
Use `--dry-run` to validate scanning logic without actually uploading:
```bash
npm run dev upload ./my-files --uploader "Test" --dry-run
```

## Code Style and Patterns

### TypeScript Configuration
- Target: ES2022
- Module: ES2022 (native ESM)
- Strict mode enabled
- All imports must use `.js` extension (ESM requirement)

### Logging
Use the logger from `src/utils/logger.ts` instead of `console.log`:
```typescript
import { getLogger } from '../utils/logger.js';
const logger = getLogger();

logger.debug('Details only shown with --debug');
logger.info('Important operational info');
logger.warn('Non-fatal issues');
logger.error('Fatal errors');
```

User-facing output uses `chalk` and `ora` for colored/styled terminal output.

### Async Patterns
All I/O operations are async. Use worker pools (see uploadFiles and uploadPartsWithConcurrency) for controlled concurrency rather than Promise.all() on large arrays.

### Error Propagation
Throw custom error types from utilities and handle them at command level (src/commands/upload.ts:41-55). Show user-friendly messages to console, detailed traces only with `--debug`.

## API Integration

The worker API expects specific request/response formats. Key points:

- **Batch ID**: ULID format (e.g., `01K8ABCDEFGHIJKLMNOPQRSTUV`)
- **R2 Keys**: Format is `staging/{batch_id}/{logical_path}`
- **ETags**: Must be cleaned (quotes removed) before sending to complete endpoint
- **Part Numbers**: 1-indexed (not 0-indexed)

See API.md for complete endpoint documentation and payload formats.

## Common Workflows

### Adding a New Validation Rule
1. Add validation function to `src/lib/validation.ts`
2. Call from scanner (for files) or command handler (for options)
3. Throw `ValidationError` with clear message
4. Add user-facing error handling in command

### Adding a New Configuration Option
1. Add to `UploadConfig` type in `src/types/batch.ts`
2. Add parsing in `src/lib/config.ts` (file, env, CLI)
3. Add to command options in `src/commands/upload.ts`
4. Document in CONFIG.md
5. Update --help text

### Debugging Upload Failures
1. Run with `--debug` flag to see detailed logs
2. Check `--log-file` output if logging to file
3. Verify worker is accessible (health check: `curl http://localhost:8787/`)
4. Check presigned URLs haven't expired (they have short TTLs)
5. Verify file isn't locked or deleted during upload

## Dependencies

**Core:**
- `commander` - CLI framework
- `axios` - HTTP client for API and R2 uploads
- `multiformats` - CID computation

**UI:**
- `chalk` - Terminal colors
- `ora` - Spinners
- `cli-progress` - Progress bars

**Utilities:**
- `mime-types` - Content-Type detection
- `tsx` - Development TypeScript execution

## Repository Structure

```
cli/
├── src/
│   ├── index.ts              # Entry point, sets up Commander
│   ├── commands/
│   │   └── upload.ts         # Upload command handler
│   ├── lib/
│   │   ├── uploader.ts       # Main orchestrator
│   │   ├── worker-client.ts  # API client
│   │   ├── scanner.ts        # Directory scanning
│   │   ├── simple.ts         # Simple upload logic
│   │   ├── multipart.ts      # Multipart upload logic
│   │   ├── progress.ts       # Progress tracking
│   │   ├── config.ts         # Configuration loading
│   │   └── validation.ts     # Input validation
│   ├── types/
│   │   ├── api.ts            # API request/response types
│   │   ├── batch.ts          # Batch and config types
│   │   └── file.ts           # File metadata types
│   └── utils/
│       ├── errors.ts         # Custom error types
│       ├── logger.ts         # Logging utilities
│       ├── retry.ts          # Retry logic
│       └── hash.ts           # CID computation
├── dist/                     # Build output (generated)
├── API.md                    # Worker API documentation
└── CONFIG.md                 # Configuration guide
```
