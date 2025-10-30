# CLI Changes for Directory-Grouped Processing

## Summary: **NO CLI CHANGES REQUIRED**

The CLI implementation is complete and correct as-is. The directory-to-file structure restructuring will happen on the **worker side** when building the queue message.

## Why No CLI Changes?

The CLI's current architecture is sound:

1. **Scanner knows directory structure** - It loads `.arke-process.json` per directory
2. **Files are sent one-by-one** - Each file upload includes its `processing_config`
3. **Worker builds final message** - The worker has all the information to restructure

The restructuring happens at the **finalization step**, which is entirely worker-controlled.

## What CLI Currently Does (Perfect!)

```typescript
// 1. Scanner groups config by directory internally
/archive/photos/.arke-process.json → { ocr: false, describe: true }

// 2. Scanner attaches to each file
photo1.jpg → processing_config: { ocr: false, describe: true }
photo2.jpg → processing_config: { ocr: false, describe: true }

// 3. Uploader sends each file individually
POST /api/batches/:id/files/start
{
  "file_name": "photo1.jpg",
  "logical_path": "/archive/photos/photo1.jpg",
  "processing_config": { "ocr": false, "describe": true }
}

POST /api/batches/:id/files/start
{
  "file_name": "photo2.jpg",
  "logical_path": "/archive/photos/photo2.jpg",
  "processing_config": { "ocr": false, "describe": true }
}

// 4. Worker receives, stores, and later restructures
POST /api/batches/:id/finalize
(empty body)

// Worker groups files by directory_path and builds:
{
  "directories": [
    {
      "directory_path": "/archive/photos",
      "processing_config": { "ocr": false, "describe": true },
      "files": [ /* photo1.jpg, photo2.jpg */ ]
    }
  ]
}
```

## Benefits of This Approach

### For CLI
- ✅ Simple, straightforward implementation
- ✅ Each file is self-contained during upload
- ✅ No need to track directory boundaries
- ✅ Resilient to partial uploads/retries

### For Worker
- ✅ Worker controls final message format
- ✅ Can restructure data as needed
- ✅ Easy to change queue format without CLI changes
- ✅ Single source of truth for message schema

### For Orchestrator
- ✅ Receives clean directory-grouped structure
- ✅ Can process entire directories at once
- ✅ Clear semantic meaning

## CLI Implementation Status: ✅ COMPLETE

All CLI code is implemented and tested:

- ✅ Global processing config in `.arke-upload.json`
- ✅ Directory overrides in `.arke-process.json`
- ✅ Scanner loads and merges configs correctly
- ✅ Processing config attached to each `FileInfo`
- ✅ Worker client sends `processing_config` with each file
- ✅ Documentation complete (CONFIG.md, API.md)
- ✅ Tests passing

## Next Steps

All remaining work is on the **worker** side:

1. **Worker:** Accept `processing_config` in file upload requests ✅ (already specified in WORKER_CHANGES.md)
2. **Worker:** Store `processing_config` with file metadata in KV ✅ (already specified)
3. **Worker:** Group files by directory when finalizing ⭐ **NEW** (specified in WORKER_RESTRUCTURE_SPEC.md)
4. **Worker:** Build directory-grouped queue message ⭐ **NEW** (specified in WORKER_RESTRUCTURE_SPEC.md)
5. **Orchestrator:** Process queue messages by directory ⭐ **NEW**

## Documentation

All necessary documentation has been created:

- **CONFIG.md** - User-facing documentation for processing configuration
- **API.md** - Updated with `processing_config` field in file upload request
- **WORKER_CHANGES.md** - Original worker implementation guide (per-file approach)
- **WORKER_RESTRUCTURE_SPEC.md** - Complete specification for directory grouping (recommended approach)

## Testing the Current Implementation

The CLI has been tested and works correctly:

```bash
# Test with directory-level configs
$ npm run build
$ npm run dev -- upload example_dirs/sample_archive_deep --dry-run --debug

# Results show correct behavior:
# - Global defaults applied
# - Directory configs loaded
# - Per-file configs correctly merged
# - .arke-process.json files excluded from upload
```

## Recommendation

**Proceed with worker implementation using WORKER_RESTRUCTURE_SPEC.md**

The CLI is complete. Focus all remaining effort on:
1. Implementing worker finalization logic to group by directory
2. Updating orchestrator to consume directory-grouped messages
