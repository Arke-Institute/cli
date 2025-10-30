# Worker Queue Message Restructuring Specification

## Overview

The worker should restructure file data into a directory-grouped format when building the queue message during batch finalization. This matches the semantic reality that processing configuration is conceptually per-directory, not per-file.

## Current Behavior

### What CLI Sends (Per-File)

```http
POST /api/batches/:batchId/files/start
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

Every file in the same directory will have the **same** `processing_config`.

### Current Queue Message Format (Flat)

```json
{
  "batch_id": "01K8ABC",
  "files": [
    {
      "r2_key": "staging/01K8.../archive/photos/photo1.jpg",
      "logical_path": "/archive/photos/photo1.jpg",
      "processing_config": { "ocr": false, "describe": true }
    },
    {
      "r2_key": "staging/01K8.../archive/photos/photo2.jpg",
      "logical_path": "/archive/photos/photo2.jpg",
      "processing_config": { "ocr": false, "describe": true }
    },
    {
      "r2_key": "staging/01K8.../archive/docs/doc.pdf",
      "logical_path": "/archive/docs/doc.pdf",
      "processing_config": { "ocr": true, "describe": true }
    }
  ]
}
```

**Problem:** Redundant `processing_config` for files in the same directory.

---

## New Behavior

### New Queue Message Format (Directory-Grouped)

```json
{
  "batch_id": "01K8ABC",
  "r2_prefix": "staging/01K8ABC/",
  "uploader": "Jane Doe",
  "root_path": "/archive",
  "total_files": 3,
  "total_bytes": 2500000,
  "uploaded_at": "2025-10-30T12:00:00Z",
  "finalized_at": "2025-10-30T12:15:00Z",
  "metadata": {},
  "directories": [
    {
      "directory_path": "/archive/photos",
      "processing_config": {
        "ocr": false,
        "describe": true
      },
      "file_count": 2,
      "total_bytes": 2000000,
      "files": [
        {
          "r2_key": "staging/01K8.../archive/photos/photo1.jpg",
          "logical_path": "/archive/photos/photo1.jpg",
          "file_name": "photo1.jpg",
          "file_size": 1000000,
          "content_type": "image/jpeg",
          "cid": "bafkreiabc123..."
        },
        {
          "r2_key": "staging/01K8.../archive/photos/photo2.jpg",
          "logical_path": "/archive/photos/photo2.jpg",
          "file_name": "photo2.jpg",
          "file_size": 1000000,
          "content_type": "image/jpeg",
          "cid": "bafkreidef456..."
        }
      ]
    },
    {
      "directory_path": "/archive/docs",
      "processing_config": {
        "ocr": true,
        "describe": true
      },
      "file_count": 1,
      "total_bytes": 500000,
      "files": [
        {
          "r2_key": "staging/01K8.../archive/docs/doc.pdf",
          "logical_path": "/archive/docs/doc.pdf",
          "file_name": "doc.pdf",
          "file_size": 500000,
          "content_type": "application/pdf",
          "cid": "bafkreighi789..."
        }
      ]
    }
  ]
}
```

---

## Worker Implementation

### Step 1: Accept and Store `processing_config` (Already Planned)

In `POST /api/batches/:batchId/files/start` handler:

```typescript
// Validate processing_config
if (!body.processing_config ||
    typeof body.processing_config.ocr !== 'boolean' ||
    typeof body.processing_config.describe !== 'boolean') {
  return errorResponse(400, 'Invalid processing_config');
}

// Store in KV
const fileRecord = {
  r2_key: r2Key,
  logical_path: body.logical_path,
  file_name: body.file_name,
  file_size: body.file_size,
  content_type: body.content_type,
  cid: body.cid,
  processing_config: body.processing_config,  // Store it
  status: 'pending'
};
```

### Step 2: Group Files by Directory on Finalize

In `POST /api/batches/:batchId/finalize` handler:

```typescript
// Load all files from KV
const files = batchState.files; // Array of file records

// Group by directory
const directoriesMap = new Map();

for (const file of files) {
  // Extract directory from logical_path
  const lastSlash = file.logical_path.lastIndexOf('/');
  const directoryPath = file.logical_path.substring(0, lastSlash);

  if (!directoriesMap.has(directoryPath)) {
    directoriesMap.set(directoryPath, {
      directory_path: directoryPath,
      processing_config: file.processing_config,
      file_count: 0,
      total_bytes: 0,
      files: []
    });
  }

  const dir = directoriesMap.get(directoryPath);
  dir.file_count++;
  dir.total_bytes += file.file_size;
  dir.files.push({
    r2_key: file.r2_key,
    logical_path: file.logical_path,
    file_name: file.file_name,
    file_size: file.file_size,
    content_type: file.content_type,
    cid: file.cid
    // Note: NO processing_config here - it's at directory level
  });
}

// Convert map to array
const directories = Array.from(directoriesMap.values());

// Build queue message
const queueMessage = {
  batch_id: batchId,
  r2_prefix: `staging/${batchId}/`,
  uploader: batchState.uploader,
  root_path: batchState.root_path,
  total_files: files.length,
  total_bytes: files.reduce((sum, f) => sum + f.file_size, 0),
  uploaded_at: batchState.created_at,
  finalized_at: new Date().toISOString(),
  metadata: batchState.metadata || {},
  directories: directories
};

// Send to queue
await env.BATCH_QUEUE.send(queueMessage);
```

---

## Queue Message Schema

### Top-Level Fields

| Field | Type | Description |
|-------|------|-------------|
| `batch_id` | string | ULID batch identifier |
| `r2_prefix` | string | R2 storage prefix (e.g., `staging/01K8ABC/`) |
| `uploader` | string | Name of person who uploaded |
| `root_path` | string | Logical root path (e.g., `/archive`) |
| `total_files` | number | Total number of files in batch |
| `total_bytes` | number | Total size of all files in bytes |
| `uploaded_at` | string | ISO 8601 timestamp of batch creation |
| `finalized_at` | string | ISO 8601 timestamp of finalization |
| `metadata` | object | Optional batch metadata |
| `directories` | array | Array of directory objects (see below) |

### Directory Object

| Field | Type | Description |
|-------|------|-------------|
| `directory_path` | string | Logical directory path (e.g., `/archive/photos`) |
| `processing_config` | object | Processing configuration for this directory |
| `processing_config.ocr` | boolean | Run OCR on files in this directory |
| `processing_config.describe` | boolean | Generate description for this directory |
| `file_count` | number | Number of files in this directory |
| `total_bytes` | number | Total size of files in this directory |
| `files` | array | Array of file objects (see below) |

### File Object (within directory)

| Field | Type | Description |
|-------|------|-------------|
| `r2_key` | string | R2 object key |
| `logical_path` | string | Full logical path including filename |
| `file_name` | string | File name only |
| `file_size` | number | File size in bytes |
| `content_type` | string | MIME type |
| `cid` | string | IPFS CIDv1 content identifier |

**Note:** `processing_config` is **not** included at the file level - it's only at the directory level.

---

## Orchestrator Usage

The orchestrator consuming queue messages should process by directory:

```typescript
for (const directory of queueMessage.directories) {
  console.log(`Processing directory: ${directory.directory_path}`);

  // Check if OCR is enabled for this directory
  if (directory.processing_config.ocr) {
    for (const file of directory.files) {
      // Run OCR on eligible files
      if (isOCRable(file.content_type)) {
        await runOCR(file);
      }
    }
  }

  // Check if description is enabled for this directory
  if (directory.processing_config.describe) {
    // Generate directory-level description
    await generateDescription(directory);
  }

  // Always publish all files
  for (const file of directory.files) {
    await publish(file);
  }
}
```

---

## Edge Cases

### Single File in Root Directory

```json
{
  "directories": [
    {
      "directory_path": "/archive",
      "processing_config": { "ocr": true, "describe": true },
      "file_count": 1,
      "files": [...]
    }
  ]
}
```

### Empty Directory Path (Files at Root)

If `logical_path` is `/file.txt`, directory_path should be `/`:

```typescript
const directoryPath = file.logical_path.substring(0, lastSlash) || '/';
```

### Directory Sorting

Directories should be sorted alphabetically by `directory_path` for deterministic ordering:

```typescript
const directories = Array.from(directoriesMap.values())
  .sort((a, b) => a.directory_path.localeCompare(b.directory_path));
```

---

## Benefits of This Approach

1. **No CLI Changes:** CLI continues to work as-is
2. **Semantic Clarity:** Queue message matches conceptual model (directory-level config)
3. **Deduplication:** No redundant `processing_config` in queue
4. **Orchestrator Simplicity:** Process by directory, not by individual file config
5. **Single Source of Truth:** Worker controls final message format

---

## Migration Path

### Phase 1: Add Support for New Format
- Worker accepts `processing_config` per file
- Worker stores it in KV
- Worker builds directory-grouped queue messages

### Phase 2: Update Orchestrator
- Orchestrator handles new `directories` format
- Orchestrator processes by directory

### Phase 3: Deprecate Old Format (Optional)
- Remove support for flat file array
- Remove per-file processing config from queue

---

## Example: Complete Flow

**CLI sends 3 files:**
```
POST /files/start: /archive/photos/a.jpg {ocr: false, describe: true}
POST /files/start: /archive/photos/b.jpg {ocr: false, describe: true}
POST /files/start: /archive/docs/c.pdf {ocr: true, describe: true}
```

**Worker stores in KV:**
```json
{
  "files": [
    {"logical_path": "/archive/photos/a.jpg", "processing_config": {...}},
    {"logical_path": "/archive/photos/b.jpg", "processing_config": {...}},
    {"logical_path": "/archive/docs/c.pdf", "processing_config": {...}}
  ]
}
```

**Worker builds queue message (on finalize):**
```json
{
  "directories": [
    {
      "directory_path": "/archive/docs",
      "processing_config": {"ocr": true, "describe": true},
      "files": [{"logical_path": "/archive/docs/c.pdf", ...}]
    },
    {
      "directory_path": "/archive/photos",
      "processing_config": {"ocr": false, "describe": true},
      "files": [
        {"logical_path": "/archive/photos/a.jpg", ...},
        {"logical_path": "/archive/photos/b.jpg", ...}
      ]
    }
  ]
}
```

**Orchestrator processes:**
1. `/archive/docs`: Run OCR on c.pdf, generate directory description, publish
2. `/archive/photos`: Skip OCR, generate directory description, publish a.jpg and b.jpg
