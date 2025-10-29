# Arke Upload CLI

Command-line tool for uploading files to the Arke Institute's ingest service.

## Features

- 📁 **Recursive directory scanning** - Upload entire directory structures
- 🚀 **Parallel uploads** - Multiple files uploaded concurrently
- 📦 **Multipart support** - Handles large files (up to 5 GB) with resumable uploads
- 📊 **Progress tracking** - Real-time progress bars and statistics
- 🔄 **Automatic retry** - Network errors handled with exponential backoff
- ✅ **File validation** - Validates file types, sizes, and paths
- 🏃 **Dry-run mode** - Preview uploads without sending data

## Installation

```bash
npm install
npm run build
```

Or link globally:

```bash
npm link
```

## Usage

### Basic Upload

```bash
arke-upload upload <directory> \
  --worker-url https://ingest.arke.institute \
  --uploader "Jane Doe" \
  --root-path "/series_1/box_7"
```

### With Metadata

```bash
arke-upload upload ./my-files \
  --worker-url https://ingest.arke.institute \
  --uploader "Jane Doe" \
  --root-path "/collection/series_1" \
  --metadata '{"collection":"historical_records","year":"1923"}'
```

### Filter File Types

```bash
arke-upload upload ./my-files \
  --worker-url https://ingest.arke.institute \
  --uploader "Jane Doe" \
  --allowed-extensions .tiff .jpg .json
```

### Dry Run (Preview)

```bash
arke-upload upload ./my-files \
  --worker-url https://ingest.arke.institute \
  --uploader "Test User" \
  --dry-run
```

### With Debug Logging

```bash
arke-upload upload ./my-files \
  --worker-url https://ingest.arke.institute \
  --uploader "Jane Doe" \
  --debug \
  --log-file upload.log
```

## Command Options

### Required Options

- `<directory>` - Directory to upload
- `--worker-url <url>` - Worker API URL (e.g., `https://ingest.arke.institute`)
- `--uploader <name>` - Name of person uploading

### Optional Options

- `--root-path <path>` - Logical root path (default: `/`)
- `--metadata <json>` - Batch metadata as JSON string
- `--parallel <n>` - Number of concurrent file uploads (default: `5`)
- `--parallel-parts <n>` - Concurrent parts per multipart upload (default: `3`)
- `--allowed-extensions <ext...>` - Filter by file extensions (e.g., `.tiff .jpg .json`)
- `--dry-run` - Scan files but don't upload
- `--resume` - Resume interrupted upload (future feature)
- `--debug` - Enable debug logging
- `--log-file <path>` - Write logs to file

## File Type Support

The CLI supports the following file types by default:

**Images:**
- `.tiff`, `.tif`
- `.jpg`, `.jpeg`
- `.png`, `.gif`, `.bmp`

**Documents:**
- `.json`, `.xml`
- `.txt`, `.csv`, `.md`
- `.pdf`

You can customize allowed extensions with the `--allowed-extensions` option.

## Size Limits

- **Maximum file size:** 5 GB
- **Maximum batch size:** 100 GB
- **Multipart threshold:** Files ≥ 5 MB use multipart upload

## Architecture

### Upload Flow

1. **Scan** - Recursively scan directory for valid files
2. **Initialize** - Create batch with worker API
3. **Upload** - For each file:
   - Request presigned URLs from worker
   - Upload directly to R2 (simple or multipart)
   - Notify worker of completion
4. **Finalize** - Mark batch complete and enqueue for processing

### Direct R2 Upload

Files are uploaded directly to Cloudflare R2 using presigned URLs. The worker never handles file bytes, making the system highly scalable.

```
Client → Worker (get URLs) → Client uploads → R2
                               ↓
                          Worker (track state)
```

## Development

### Build

```bash
npm run build
```

### Run in Development

```bash
npm run dev upload ./example_dirs/iiif_test_small \
  --worker-url http://localhost:8787 \
  --uploader "Dev User" \
  --debug
```

### Test with Example Data

The repo includes two example directories for testing:

```bash
# Small IIIF archive (3.6 MB, 18 files)
npm run dev upload ./example_dirs/iiif_test_small \
  --worker-url http://localhost:8787 \
  --uploader "Test User" \
  --root-path "/iiif_test"

# Simple archive structure (20 KB, 5 files)
npm run dev upload ./example_dirs/sample_archive_deep \
  --worker-url http://localhost:8787 \
  --uploader "Test User" \
  --root-path "/archive_test"
```

## Error Handling

The CLI includes comprehensive error handling:

- **Network errors** - Automatic retry with exponential backoff
- **Validation errors** - Clear messages for invalid input
- **Upload failures** - Per-file error tracking with summary
- **Worker errors** - API errors displayed with details

## Progress Display

The CLI shows real-time progress during uploads:

```
████████████████░░░░ | 80% | 15/20 files | 3.2 GB/4.0 GB | Speed: 12.5 MB/s | ETA: 1m

→ page_042.tiff
✓ page_001.tiff
✓ page_002.tiff
✗ page_003.tiff: Upload failed

Upload Summary:
✓ Completed: 18 files
✗ Failed: 2 files
Total uploaded: 3.6 GB
Average speed: 11.2 MB/s
Total time: 5m 32s
```

## Troubleshooting

### "Directory not found"

Ensure the directory path is correct. Use absolute paths or relative to current working directory.

### "Invalid worker URL"

The worker URL must be a valid HTTP/HTTPS URL. For local development, use `http://localhost:8787`.

### "File size exceeds maximum"

Individual files cannot exceed 5 GB. The total batch cannot exceed 100 GB.

### "Invalid extension"

By default, only specific file types are allowed. Use `--allowed-extensions` to customize.

### "Network error"

Check your internet connection and ensure the worker URL is accessible. The CLI will automatically retry network errors.

## License

MIT

## Support

For issues or questions, please open an issue on GitHub.
