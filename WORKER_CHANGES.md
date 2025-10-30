# Worker API Changes Required

This document outlines the changes needed in the `arke-ingest-worker` to support per-file processing configuration.

## Summary

The CLI now sends a `processing_config` object with each file in the `POST /api/batches/:batchId/files/start` endpoint. The worker needs to:

1. Accept and validate the new `processing_config` field
2. Store it with the file metadata in KV
3. Include it in the queue message when the batch is finalized

## API Changes

### Endpoint: `POST /api/batches/:batchId/files/start`

**OLD Request Body:**
```json
{
  "file_name": "page_004.tiff",
  "file_size": 25000000,
  "logical_path": "/series_1/box_7/folder_3/page_004.tiff",
  "content_type": "image/tiff",
  "cid": "bafkreihfdbdnabuqdtsf3tcqnpmf4omsht2gaiugyjaioryhefcs3yruk4"
}
```

**NEW Request Body:**
```json
{
  "file_name": "page_004.tiff",
  "file_size": 25000000,
  "logical_path": "/series_1/box_7/folder_3/page_004.tiff",
  "content_type": "image/tiff",
  "cid": "bafkreihfdbdnabuqdtsf3tcqnpmf4omsht2gaiugyjaioryhefcs3yruk4",
  "processing_config": {
    "ocr": true,
    "describe": true
  }
}
```

**Field: `processing_config`**
- **Type:** Object (required)
- **Fields:**
  - `ocr` (boolean, required) - Whether to run OCR on this file
  - `describe` (boolean, required) - Whether to generate descriptions/summaries for this file

**Response:** (unchanged)
```json
{
  "r2_key": "staging/01K8.../series_1/box_7/page_004.tiff",
  "upload_type": "simple",
  "presigned_url": "https://..."
}
```

## Worker Implementation Changes

### 1. TypeScript Types (if using TypeScript)

Add to your request validation types:

```typescript
interface ProcessingConfig {
  ocr: boolean;
  describe: boolean;
}

interface StartFileUploadRequest {
  file_name: string;
  file_size: number;
  logical_path: string;
  content_type: string;
  cid: string;
  processing_config: ProcessingConfig;  // NEW
}
```

### 2. Request Validation

In the `/api/batches/:batchId/files/start` handler, add validation for `processing_config`:

```typescript
// Validate processing_config is present
if (!body.processing_config) {
  return new Response(
    JSON.stringify({ error: 'processing_config is required' }),
    { status: 400 }
  );
}

// Validate processing_config fields
if (
  typeof body.processing_config.ocr !== 'boolean' ||
  typeof body.processing_config.describe !== 'boolean'
) {
  return new Response(
    JSON.stringify({
      error: 'processing_config must contain ocr and describe boolean fields'
    }),
    { status: 400 }
  );
}
```

### 3. KV Storage Schema Update

When storing file metadata in KV, include the `processing_config`:

**OLD file record:**
```typescript
const fileRecord = {
  r2_key: r2Key,
  logical_path: body.logical_path,
  file_name: body.file_name,
  file_size: body.file_size,
  content_type: body.content_type,
  cid: body.cid,
  upload_type: uploadType,
  status: 'pending'
};
```

**NEW file record:**
```typescript
const fileRecord = {
  r2_key: r2Key,
  logical_path: body.logical_path,
  file_name: body.file_name,
  file_size: body.file_size,
  content_type: body.content_type,
  cid: body.cid,
  upload_type: uploadType,
  status: 'pending',
  processing_config: body.processing_config  // NEW
};
```

### 4. Queue Message Update

When finalizing the batch and sending to `BATCH_QUEUE`, include `processing_config` for each file:

**OLD queue message:**
```json
{
  "batch_id": "01K8ABCDEFGHIJKLMNOPQRSTUV",
  "r2_prefix": "staging/01K8ABCDEFGHIJKLMNOPQRSTUV/",
  "uploader": "Jane Doe",
  "root_path": "/series_1/box_7",
  "file_count": 47,
  "total_bytes": 1234567890,
  "uploaded_at": "2025-01-29T12:30:00Z",
  "finalized_at": "2025-01-29T12:45:00Z",
  "metadata": {},
  "files": [
    {
      "r2_key": "staging/01K8.../page_001.tiff",
      "logical_path": "/series_1/box_7/page_001.tiff",
      "file_name": "page_001.tiff",
      "file_size": 25000000,
      "cid": "bafkreihfdbdnabuqdtsf3tcqnpmf4omsht2gaiugyjaioryhefcs3yruk4"
    }
  ]
}
```

**NEW queue message:**
```json
{
  "batch_id": "01K8ABCDEFGHIJKLMNOPQRSTUV",
  "r2_prefix": "staging/01K8ABCDEFGHIJKLMNOPQRSTUV/",
  "uploader": "Jane Doe",
  "root_path": "/series_1/box_7",
  "file_count": 47,
  "total_bytes": 1234567890,
  "uploaded_at": "2025-01-29T12:30:00Z",
  "finalized_at": "2025-01-29T12:45:00Z",
  "metadata": {},
  "files": [
    {
      "r2_key": "staging/01K8.../page_001.tiff",
      "logical_path": "/series_1/box_7/page_001.tiff",
      "file_name": "page_001.tiff",
      "file_size": 25000000,
      "cid": "bafkreihfdbdnabuqdtsf3tcqnpmf4omsht2gaiugyjaioryhefcs3yruk4",
      "processing_config": {
        "ocr": true,
        "describe": false
      }
    }
  ]
}
```

## Orchestrator Changes

The `arke-orchestrator` consuming the queue messages should:

1. Read the `processing_config` from each file in the message
2. Skip the OCR stage if `processing_config.ocr === false`
3. Skip the description generation stage if `processing_config.describe === false`
4. Always perform publishing (no config flag for this)

## Backward Compatibility

**Important:** The `processing_config` field is now **required** in the CLI.

### Migration Strategy

If you need to support both old and new CLI versions:

1. Make `processing_config` optional in the worker initially
2. If missing, default to `{ ocr: true, describe: true }`
3. Add a warning log when the field is missing
4. After all clients are updated, make it required

**Example:**
```typescript
const processingConfig = body.processing_config || {
  ocr: true,
  describe: true
};

if (!body.processing_config) {
  console.warn('Client sent file without processing_config, using defaults');
}
```

## Testing

### Test Cases

1. **All processing enabled:**
   ```json
   {"processing_config": {"ocr": true, "describe": true}}
   ```

2. **OCR disabled:**
   ```json
   {"processing_config": {"ocr": false, "describe": true}}
   ```

3. **All processing disabled:**
   ```json
   {"processing_config": {"ocr": false, "describe": false}}
   ```

4. **Missing field (if supporting backward compatibility):**
   ```json
   {}
   ```
   Should default to `{"ocr": true, "describe": true}`

### Validation Tests

- Reject request if `processing_config` missing (after migration period)
- Reject request if `ocr` or `describe` fields missing
- Reject request if `ocr` or `describe` are not boolean
- Accept valid processing configs and store correctly

## Example Flow

**Step 1:** CLI scans files and determines processing config per directory
```
/archive/photos/.arke-process.json: {"ocr": false}
```

**Step 2:** CLI sends to worker with processing config
```http
POST /api/batches/01K8ABC/files/start
{
  "file_name": "photo.jpg",
  "file_size": 1000000,
  "logical_path": "/archive/photos/photo.jpg",
  "content_type": "image/jpeg",
  "cid": "bafkreiabc123...",
  "processing_config": {
    "ocr": false,
    "describe": true
  }
}
```

**Step 3:** Worker stores file with processing config in KV

**Step 4:** Worker sends to queue when batch finalized
```json
{
  "files": [
    {
      "file_name": "photo.jpg",
      "processing_config": {"ocr": false, "describe": true}
    }
  ]
}
```

**Step 5:** Orchestrator reads queue message, skips OCR stage for this file, runs description generation

## Summary of Changes

| Component | Change Required | Priority |
|-----------|----------------|----------|
| Worker API validation | Add `processing_config` validation | Required |
| Worker KV storage | Store `processing_config` with file metadata | Required |
| Worker queue message | Include `processing_config` in batch queue message | Required |
| Orchestrator processing | Check `processing_config` before each stage | Required |
| API documentation | Update API.md with new field | Recommended |
| Tests | Add validation and integration tests | Recommended |
