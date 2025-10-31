# Image Preprocessing System - Implementation Plan

## Executive Summary

This document outlines a modular preprocessing system for the Arke Upload CLI to handle file format conversions before upload. The primary use case is converting TIFF images to JPEG format to enable OCR processing, but the architecture is designed to be extensible for other file type transformations.

## Problem Statement

According to FILE_PROCESSING_GUIDE.md, only JPEG, PNG, and WebP images are processed by OCR during Phase 1. TIFF files, commonly used in archival contexts, are stored as binary refs without OCR extraction. This means valuable text content in TIFF images is not searchable or analyzable.

## Goals

1. Enable TIFF images to be OCR-processed by converting them to JPEG
2. Provide flexible options for preserving original TIFFs or replacing them
3. Create a modular, extensible architecture for future file type conversions
4. Maintain backward compatibility with existing upload workflow
5. Preserve processing configuration and metadata through conversions

## Architecture Overview

### Insertion Point in Upload Flow

The preprocessing system will be inserted between **scanning** and **uploading** phases:

```
Current Flow:
  1. Scan directory → 2. Initialize batch → 3. Upload files → 4. Finalize

New Flow:
  1. Scan directory → 2. Preprocess files → 3. Initialize batch → 4. Upload files → 5. Finalize
```

**Rationale:**
- Preprocessing after scanning ensures we have complete file metadata (paths, sizes, CIDs)
- Preprocessing before initialization allows worker to receive accurate file counts and sizes
- Physical file transformations happen before any network operations

### Core Components

#### 1. Preprocessor Interface (`src/lib/preprocessors/base.ts`)

```typescript
export interface PreprocessorResult {
  /** Files to upload (may include originals + conversions or just conversions) */
  files: FileInfo[];

  /** Files that were processed */
  processedCount: number;

  /** Files that were skipped */
  skippedCount: number;

  /** Any errors (non-fatal) */
  warnings: string[];
}

export interface Preprocessor {
  name: string;

  /** Check if this preprocessor should run on the given files */
  shouldRun(files: FileInfo[], config: PreprocessorConfig): boolean;

  /** Execute preprocessing, return modified file list */
  process(files: FileInfo[], config: PreprocessorConfig): Promise<PreprocessorResult>;

  /** Clean up any temporary files created during preprocessing */
  cleanup(): Promise<void>;
}
```

#### 2. TIFF Converter (`src/lib/preprocessors/tiff-converter.ts`)

First concrete implementation of the Preprocessor interface.

**Functionality:**
- Identifies TIFF files (`.tif`, `.tiff` extensions)
- Converts to JPEG using sharp library
- Handles three modes: `convert`, `preserve`, or `both`
- Updates FileInfo metadata (filename, size, contentType, CID)
- Manages temporary files and cleanup

#### 3. Preprocessor Orchestrator (`src/lib/preprocessor.ts`)

```typescript
export class PreprocessorOrchestrator {
  private preprocessors: Preprocessor[] = [];

  register(preprocessor: Preprocessor): void

  async run(files: FileInfo[], config: UploadConfig): Promise<FileInfo[]>
}
```

**Responsibilities:**
- Register available preprocessors
- Determine which preprocessors should run
- Execute preprocessing in sequence
- Aggregate results and warnings
- Handle errors and cleanup

#### 4. Configuration Extensions

**CLI Options (`src/commands/upload.ts`):**
```typescript
.option('--convert-tiff <mode>', 'TIFF conversion mode: convert, preserve, both, or none', 'convert')
.option('--tiff-quality <n>', 'JPEG quality for TIFF conversion (1-100)', '95')
.option('--preprocess-dir <path>', 'Directory for preprocessed files (temp by default)')
```

**Config Type (`src/types/batch.ts`):**
```typescript
export interface PreprocessorConfig {
  /** TIFF conversion mode */
  tiffMode: 'convert' | 'preserve' | 'both' | 'none';

  /** JPEG quality for TIFF conversions */
  tiffQuality: number;

  /** Directory for preprocessed files */
  preprocessDir?: string;
}

export interface UploadConfig {
  // ... existing fields ...

  /** Preprocessing configuration */
  preprocessor?: PreprocessorConfig;
}
```

## TIFF to JPEG Conversion Specification

### Technology Choice: Sharp

**Selected:** `sharp` library
**Rationale:**
- High performance (uses native libvips)
- Supports TIFF input and JPEG output
- Widely used and maintained
- Already optimized for production use
- Better performance than jimp for batch processing

**Installation:**
```bash
npm install sharp
npm install --save-dev @types/node
```

### JPEG Quality Settings

**Default Quality: 95**

**Rationale:**
- OCR research indicates 100% quality for best results
- 95% provides excellent quality with ~20% smaller file sizes
- Good balance between quality and storage efficiency
- Still well above thresholds for accurate OCR (OCR works well down to ~80% quality)

**Configuration:**
- User-configurable via `--tiff-quality` flag
- Range: 1-100
- Validation enforced

### DPI Preservation

- Sharp preserves embedded DPI metadata from TIFF
- If TIFF has no DPI metadata, sharp defaults to 72 DPI
- For OCR purposes, 300 DPI is ideal but not enforced (many archival TIFFs already have appropriate DPI)

### Conversion Modes

#### Mode: `convert` (Default)

**Behavior:**
- Convert TIFF → JPEG
- Upload only JPEG
- Original TIFF not uploaded

**Use Case:**
- Standard workflow where OCR is primary goal
- Storage efficiency priority
- TIFF was just an archival format choice

**File Flow:**
```
input.tif → [convert] → input.jpg → [upload]
```

#### Mode: `preserve`

**Behavior:**
- Do not convert TIFF
- Upload original TIFF only
- TIFF stored as binary ref (no OCR)

**Use Case:**
- Preserving exact original format is critical
- No need for OCR on these specific files
- TIFF has properties that shouldn't be lost

**File Flow:**
```
input.tif → [skip conversion] → input.tif → [upload as ref]
```

#### Mode: `both`

**Behavior:**
- Convert TIFF → JPEG
- Upload both JPEG and original TIFF
- JPEG gets OCR processing
- TIFF stored as binary ref

**Use Case:**
- Maximum preservation + OCR capability
- Archival projects requiring format redundancy
- Unsure if JPEG quality is sufficient

**File Flow:**
```
input.tif → [convert] → input.jpg → [upload]
         → [preserve] → input.tif → [upload as ref]
```

**Naming Convention:**
- TIFF: `document.tif` → stored as `document.tif.ref.json`
- JPEG: `document.tif` → converted to `document.jpg` → stored as `document.jpg` (text file or ref depending on size)

**Note:** Both files will be in the same logical directory and will be linked through their parent entity in the IPFS hierarchy.

#### Mode: `none`

**Behavior:**
- Disable TIFF preprocessing
- Upload files as-is

**Use Case:**
- Debugging
- Manual preprocessing already done
- Backward compatibility

### Processing Config Propagation

When converting files, the preprocessing system must preserve and propagate processing configuration:

```typescript
// Original TIFF file has processing config from .arke-process.json
const tiffFile: FileInfo = {
  fileName: "scan001.tif",
  processingConfig: { ocr: true, pinax: true, describe: true }
};

// After conversion, JPEG inherits the config
const jpegFile: FileInfo = {
  fileName: "scan001.jpg",
  processingConfig: { ocr: true, pinax: true, describe: true }  // Inherited
};

// In "both" mode, TIFF keeps config but OCR is pointless (non-OCR format)
const preservedTiff: FileInfo = {
  fileName: "scan001.tif",
  processingConfig: { ocr: true, pinax: true, describe: true }  // Preserved
};
```

This ensures directory-level processing configurations apply correctly to converted files.

## Implementation Steps

### Phase 1: Core Infrastructure (Priority: High)

**Files to Create:**
- `src/lib/preprocessors/base.ts` - Interface definitions
- `src/lib/preprocessor.ts` - Orchestrator
- `src/types/preprocessor.ts` - Configuration types

**Files to Modify:**
- `src/types/batch.ts` - Add PreprocessorConfig to UploadConfig
- `src/lib/uploader.ts` - Integrate preprocessing step
- `src/commands/upload.ts` - Add CLI options

**Tasks:**
1. Define Preprocessor interface and types
2. Implement PreprocessorOrchestrator
3. Add configuration parsing and validation
4. Update Uploader.upload() to call preprocessor
5. Add unit tests for orchestrator

**Estimated Effort:** 4-6 hours

### Phase 2: TIFF Converter Implementation (Priority: High)

**Files to Create:**
- `src/lib/preprocessors/tiff-converter.ts` - TIFF → JPEG converter
- `src/lib/preprocessors/index.ts` - Barrel export

**Dependencies:**
- Install `sharp` package

**Tasks:**
1. Implement TiffConverter class
2. Handle all three conversion modes
3. Compute new CIDs for converted files
4. Manage temporary file cleanup
5. Add error handling and logging
6. Update FileInfo metadata correctly
7. Add integration tests with sample TIFF files

**Estimated Effort:** 6-8 hours

### Phase 3: Testing & Documentation (Priority: High)

**Test Cases:**
- Convert mode: Single TIFF → JPEG
- Convert mode: Directory with mixed file types
- Preserve mode: TIFFs uploaded unchanged
- Both mode: Dual uploads with correct naming
- None mode: No preprocessing occurs
- Error handling: Invalid TIFF, unreadable files
- Large file handling: Multi-MB TIFF conversions
- Processing config inheritance
- Cleanup: Temp files removed on success and failure

**Documentation:**
- Update CONFIG.md with new options
- Update CLAUDE.md with preprocessing architecture
- Add PREPROCESSING.md user guide
- Update README with TIFF conversion examples

**Estimated Effort:** 4-5 hours

### Phase 4: Future Extensibility (Priority: Low)

**Potential Additional Preprocessors:**

1. **PDF Preprocessor** (`pdf-preprocessor.ts`)
   - Extract images from PDFs for separate OCR
   - Convert single-image PDFs to JPEG
   - Generate thumbnails

2. **Image Optimization Preprocessor** (`image-optimizer.ts`)
   - Resize large images to reasonable dimensions
   - Normalize color spaces
   - Enhance contrast for better OCR

3. **Archive Extractor** (`archive-extractor.ts`)
   - Extract ZIP files to directory structure
   - Preserve internal hierarchy

4. **Video Frame Extractor** (`video-frame-extractor.ts`)
   - Extract key frames as images
   - Generate thumbnails for video refs

**Estimated Effort:** Variable, 4-8 hours per preprocessor

## File Structure

```
cli/
├── src/
│   ├── lib/
│   │   ├── preprocessors/
│   │   │   ├── base.ts           # Interface and types
│   │   │   ├── tiff-converter.ts # TIFF → JPEG implementation
│   │   │   └── index.ts          # Barrel exports
│   │   ├── preprocessor.ts       # Orchestrator
│   │   └── uploader.ts           # Modified to call preprocessor
│   ├── types/
│   │   ├── preprocessor.ts       # Preprocessor config types
│   │   └── batch.ts              # Extended with preprocessor config
│   └── commands/
│       └── upload.ts             # New CLI options
└── PREPROCESSING_PLAN.md         # This document
```

## Configuration Examples

### Command Line

```bash
# Default: Convert TIFFs to JPEG at 95% quality
arke-upload upload ./archive --uploader "Jane"

# Preserve original TIFFs (no conversion)
arke-upload upload ./archive --uploader "Jane" --convert-tiff preserve

# Upload both TIFF and JPEG
arke-upload upload ./archive --uploader "Jane" --convert-tiff both

# Custom JPEG quality
arke-upload upload ./archive --uploader "Jane" --tiff-quality 90

# Disable preprocessing
arke-upload upload ./archive --uploader "Jane" --convert-tiff none
```

### Config File (`.arke-upload.json`)

```json
{
  "uploader": "Jane Doe",
  "workerUrl": "https://ingest.arke.institute",
  "preprocessor": {
    "tiffMode": "convert",
    "tiffQuality": 95
  }
}
```

### Environment Variables

```bash
export ARKE_UPLOADER="Jane Doe"
export ARKE_TIFF_MODE="convert"
export ARKE_TIFF_QUALITY="95"
```

## User Experience

### Progress Indication

Preprocessing will show progress before the upload phase:

```
Scanning directory...
✓ Found 150 files (1.2 GB)

Preprocessing files...
⠋ Converting TIFF images (12/45)
✓ Converted 45 TIFF files to JPEG (compressed 450 MB → 90 MB)

Initializing batch...
✓ Batch initialized: 01K8ABCDEFGHIJKLMNOPQRSTUV

Uploading files...
[Progress bar]
```

### Dry Run Support

```bash
arke-upload upload ./archive --uploader "Jane" --dry-run
```

**Output includes preprocessing:**
```
Scanning directory...
✓ Found 150 files (1.2 GB)

[DRY RUN MODE]
Preprocessing simulation:
  - 45 TIFF files would be converted to JPEG
  - Output: 150 files (750 MB after conversion)

Would upload 150 files (750 MB)
To worker: https://ingest.arke.institute
Root path: /
Uploader: Jane
```

## Error Handling

### Non-Fatal Errors

If a TIFF conversion fails (corrupted file, unsupported format), the preprocessor will:
1. Log a warning
2. Skip conversion for that file
3. Upload original TIFF as-is (falls back to `preserve` mode for that file)
4. Continue processing remaining files

### Fatal Errors

If preprocessing fails catastrophically:
1. Stop upload before initialization
2. Clean up temporary files
3. Display clear error message
4. Exit with non-zero code

### Cleanup Guarantees

Temporary files are cleaned up in all scenarios:
- Successful preprocessing and upload
- Upload failure after preprocessing
- User cancellation (SIGINT)
- Fatal preprocessing errors

Implementation uses `try/finally` blocks and process signal handlers.

## Performance Considerations

### Conversion Speed

**Sharp performance** (estimated from benchmarks):
- ~50-100 TIFF files per second (depends on size and complexity)
- Multipage TIFFs: Only first page converted (configurable)

### Memory Usage

- Sharp streams data, minimal memory footprint
- Large TIFFs processed in chunks
- No more than 2-3 files in memory at once

### Concurrency

- Preprocessing runs sequentially (no concurrency initially)
- Future optimization: Concurrent conversion with worker pool
- Trade-off: Complexity vs. typical batch sizes

### Storage

- Temporary directory used for converted files
- Temp files deleted immediately after upload
- Option to specify custom temp location (`--preprocess-dir`)

## Testing Plan

### Unit Tests

- Preprocessor interface contracts
- Config parsing and validation
- File metadata updates
- CID recalculation

### Integration Tests

- End-to-end TIFF conversion with real files
- Multiple preprocessors in sequence
- Error recovery and cleanup
- Processing config inheritance

### Test Files

Add to `example_dirs/`:
- `tiff_test/` - Various TIFF samples (single page, multi-page, different compressions)
- `mixed_archive/` - TIFFs + JPEGs + text files
- `corrupted/` - Invalid TIFFs to test error handling

## Security Considerations

1. **Path Traversal:** Validate all file paths during preprocessing
2. **Temp File Permissions:** Use restrictive permissions on temp files (600)
3. **Resource Limits:** Prevent DoS via massive TIFFs (enforce file size limits)
4. **Input Validation:** Validate TIFF files before processing (sharp does this)

## Backward Compatibility

- Default behavior can be `none` initially, then `convert` after user adoption
- Existing upload commands work unchanged (no required parameters)
- Configuration is optional and has sensible defaults
- No breaking changes to API or file formats

## Success Metrics

After implementation, measure:
1. **Conversion accuracy:** % of TIFFs successfully converted
2. **Storage efficiency:** Size reduction from TIFF → JPEG
3. **OCR coverage:** % increase in files eligible for OCR
4. **Performance:** Time added to upload workflow
5. **User adoption:** % of batches using conversion features

## Open Questions & Future Work

### Questions

1. **Multipage TIFFs:** Convert all pages or just first?
   - **Recommendation:** First page only initially, add `--tiff-all-pages` flag later

2. **DPI enforcement:** Should we validate/enforce 300 DPI for OCR?
   - **Recommendation:** No enforcement, but warn if < 200 DPI

3. **Parallel preprocessing:** Worth the complexity for Phase 1?
   - **Recommendation:** No, sequential is sufficient for typical batches

### Future Enhancements

1. Progress streaming during conversion (for large batches)
2. Conversion caching (skip re-converting identical files)
3. GPU acceleration for image processing
4. Plugin system for external preprocessors
5. Preprocessing profiles (e.g., "archival", "web-optimized")

## Summary & Recommendation

This plan provides a robust, modular architecture for file preprocessing that solves the immediate TIFF → JPEG conversion need while remaining extensible for future enhancements.

**Recommended default:** `--convert-tiff convert` with `--tiff-quality 95`

This gives users:
- OCR capability on TIFF images
- Significant storage savings (~80% in typical cases)
- High enough quality for accurate OCR (95% is well above minimum thresholds)
- Flexibility to preserve or dual-upload if needed

**Estimated Total Implementation Time:** 14-19 hours for Phases 1-3

**Next Steps:**
1. Review and approve this plan
2. Implement Phase 1 (core infrastructure)
3. Implement Phase 2 (TIFF converter)
4. Test with real archival TIFF collections
5. Document and release
