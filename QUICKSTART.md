# Quick Start Guide

Get up and running with the Arke Upload CLI in 5 minutes.

## Installation

```bash
cd cli
npm install
npm run build
```

## Test with Example Data

The repo includes two example directories for immediate testing.

### 1. Dry Run (No Upload)

Preview what would be uploaded:

```bash
npx tsx src/index.ts upload ./example_dirs/sample_archive_deep \
  --worker-url http://localhost:8787 \
  --uploader "Test User" \
  --root-path "/test" \
  --dry-run
```

**Output:**
```
[DRY RUN MODE]
No files will be uploaded

Would upload 5 files (233.00 B)
To worker: http://localhost:8787
Root path: /test
Uploader: Test User
```

### 2. Upload Small Archive

Upload the sample archive (5 files, 233 bytes):

```bash
npx tsx src/index.ts upload ./example_dirs/sample_archive_deep \
  --worker-url http://localhost:8787 \
  --uploader "Test User" \
  --root-path "/archive/box_1"
```

### 3. Upload IIIF Archive

Upload the IIIF test archive (18 files, 3.6 MB):

```bash
npx tsx src/index.ts upload ./example_dirs/iiif_test_small \
  --worker-url http://localhost:8787 \
  --uploader "Test User" \
  --root-path "/iiif/test_collection"
```

### 4. Filter by File Type

Upload only JPG and JSON files:

```bash
npx tsx src/index.ts upload ./example_dirs/iiif_test_small \
  --worker-url http://localhost:8787 \
  --uploader "Test User" \
  --root-path "/iiif/images_only" \
  --allowed-extensions .jpg .json
```

### 5. Debug Mode

See detailed logs:

```bash
npx tsx src/index.ts upload ./example_dirs/sample_archive_deep \
  --worker-url http://localhost:8787 \
  --uploader "Test User" \
  --root-path "/test" \
  --debug \
  --dry-run
```

## Upload Your Own Files

```bash
npx tsx src/index.ts upload /path/to/your/directory \
  --worker-url https://ingest.arke.institute \
  --uploader "Your Name" \
  --root-path "/collection/series/box"
```

### Optional: Add Metadata

```bash
npx tsx src/index.ts upload /path/to/your/directory \
  --worker-url https://ingest.arke.institute \
  --uploader "Your Name" \
  --root-path "/collection/series_1" \
  --metadata '{"collection":"historical_records","year":"1923","notes":"Fragile"}'
```

## Command Options Reference

### Required
- `<directory>` - Directory to upload
- `--worker-url <url>` - Worker API URL
- `--uploader <name>` - Your name

### Optional
- `--root-path <path>` - Logical root path (default: `/`)
- `--metadata <json>` - Batch metadata as JSON
- `--parallel <n>` - Concurrent uploads (default: 5)
- `--parallel-parts <n>` - Concurrent parts (default: 3)
- `--allowed-extensions <ext...>` - Filter file types
- `--dry-run` - Preview without uploading
- `--debug` - Verbose logging
- `--log-file <path>` - Write logs to file

## Expected Output

### Successful Upload
```
Arke Upload Configuration:
Directory: /Users/you/data
Worker URL: http://localhost:8787
Root Path: /archive/box_1
Uploader: Test User
Parallel Uploads: 5

✔ Found 5 files (233.00 B)
✔ Batch initialized: 01K8ABCDEFG...

████████████████████ | 100% | 5/5 files | 233 B/233 B | Speed: 45.2 KB/s | ETA: 0s

→ photo.jpg
✓ document_01.tiff
✓ document_02.tiff
✓ photo.jpg
✓ ledger_page.tiff
✓ info.xml

Upload Summary:
✓ Completed: 5 files
Total uploaded: 233.00 B
Average speed: 42.1 KB/s
Total time: 2s

✔ Batch finalized: 5 files enqueued for processing

✓ Upload complete!
```

## Troubleshooting

### "Directory not found"
Check the path is correct. Use absolute or relative paths.

### "Invalid worker URL"
Ensure URL is valid: `http://localhost:8787` or `https://ingest.arke.institute`

### "Connection refused"
Worker is not running. Start it with `wrangler dev` or check production URL.

### "File extension not allowed"
Use `--allowed-extensions` to specify which types to upload.

## Next Steps

- Read [README.md](README.md) for full documentation
- See [IMPLEMENTATION.md](IMPLEMENTATION.md) for architecture details
- Check [API.md](API.md) for worker API specification

## Need Help?

Open an issue on GitHub or contact the Arke Institute team.
