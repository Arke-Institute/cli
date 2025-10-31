# Arke Orchestrator: File Processing Guide

## Overview

The Arke Orchestrator processes uploaded files through a multi-phase pipeline that classifies, enriches, and publishes content to IPFS with hierarchical metadata. This document explains how different file types are handled and what data flows through each processing phase.

---

## Table of Contents

1. [File Classification](#file-classification)
2. [Phase 0: Discovery & Initial Snapshots](#phase-0-discovery--initial-snapshots)
3. [Phase 1: OCR Processing](#phase-1-ocr-processing)
4. [Phase 2: PINAX Metadata Extraction](#phase-2-pinax-metadata-extraction)
5. [Phase 3: Description Generation](#phase-3-description-generation)
6. [Processing Flow Diagram](#processing-flow-diagram)
7. [Configuration](#configuration)

---

## File Classification

Upon upload, every file is classified into one of two categories:

### **Text Files** (Stored Directly in IPFS)

Files with these extensions are stored as plain text content:

**Markup & Documentation:**
- `.txt` - Plain text
- `.md` - Markdown
- `.html`, `.htm` - HTML documents
- `.xml` - XML documents
- `.svg` - SVG vector graphics (XML-based)
- `.rst` - ReStructuredText (Python docs)

**Structured Data:**
- `.json` - JSON data
- `.csv`, `.tsv` - Tabular data
- `.yaml`, `.yml` - YAML configuration
- `.toml` - TOML configuration

**Programming:**
- `.js`, `.ts` - JavaScript/TypeScript
- `.py` - Python

**Other:**
- `.log` - Log files
- `.sql` - SQL queries
- `.sh` - Shell scripts

**Processing:**
- Uploaded to IPFS as-is (no transformation)
- Full content preserved
- Included in PINAX and Description phases
- Searchable and analyzable by LLMs

---

### **Binary Files** (Stored as Refs)

All other files become **ref files** - JSON metadata pointing to the binary asset:

**Common Binary Types:**
- Images: `.jpg`, `.jpeg`, `.png`, `.gif`, `.webp`, `.bmp`, `.tiff`
- Documents: `.pdf`, `.docx`, `.doc`, `.pptx`, `.xlsx`
- Media: `.mp4`, `.mov`, `.avi`, `.mp3`, `.wav`
- Archives: `.zip`, `.tar`, `.gz`, `.7z`
- Executables: `.exe`, `.dll`, `.so`
- Other: Any extension not in the text list

**Processing:**
1. Binary file copied to **Archive Bucket** (R2 permanent storage)
2. Asset registered with **CDN** service (gets unique asset ID)
3. **Ref file** created in staging bucket: `filename.ext.ref.json`
4. Original binary deleted from staging (now in archive)

**Ref File Structure:**
```json
{
  "url": "https://cdn.arke.institute/asset/ASSETID",
  "type": "image/jpeg",
  "size": 12345,
  "filename": "photo.jpg",
  "ocr": "Optional OCR text (added in Phase 1)"
}
```

**Note:** Only the JSON ref file goes to IPFS, not the binary itself.

---

### **Pre-existing Refs** (Manually Uploaded)

Users can upload `.ref.json` files directly to reference external resources:

**Minimal Valid Ref:**
```json
{
  "url": "https://example.com/resource.jpg"
}
```

**Full Ref (Optional Fields):**
```json
{
  "url": "https://example.com/resource.jpg",
  "type": "image/jpeg",
  "size": 12345,
  "filename": "resource.jpg",
  "ocr": "Pre-extracted text (skips OCR phase)"
}
```

**Use Cases:**
- Reference external URLs without downloading
- Preserve OCR from external tools
- Link to resources outside the archive

---

## Phase 0: Discovery & Initial Snapshots

**Goal:** Build directory tree, classify files, and create initial IPFS entities.

### Input
- All files uploaded to staging bucket
- Directory structure from upload metadata
- Per-directory processing configuration (OCR/Describe/PINAX flags)

### Processing Steps

1. **Build Directory Tree**
   - Create hierarchical node structure
   - Calculate depth for each directory
   - Establish parent-child relationships

2. **Classify Files**
   ```
   For each file:
     If ends with .ref.json:
       → Parse as ref
       → Check if has pre-existing OCR
       → Add to refs[]

     Else if text extension:
       → Add to text_files[]

     Else (binary):
       → Copy to archive bucket
       → Register with CDN
       → Create .ref.json in staging
       → Add to refs[]
       → Delete original from staging
   ```

3. **Create Initial Snapshots (v1)**
   - Process directories bottom-up (deepest first)
   - For each directory:
     - Upload all text files to IPFS
     - Upload all ref files to IPFS
     - Create entity with components (no relationships yet)
     - Store entity PI (permanent identifier)

4. **Establish Relationships**
   - Use `/relations` endpoint to add children to parents
   - Updates are bidirectional (parent + all children updated)
   - Creates v2 for parent, v2 for each child

5. **Attach to Archive Root**
   - If `parent_pi` specified, attach batch root to existing entity
   - Integrates new content into existing archive hierarchy

### Output
- All directories have initial IPFS entities (v1)
- All relationships established (v2)
- Each node has:
  - `text_files[]` - Text content files
  - `refs[]` - Binary asset refs
  - `pi` - Entity permanent identifier
  - `current_tip` - Latest version CID

---

## Phase 1: OCR Processing

**Goal:** Extract text from eligible images and add to ref metadata.

### What Gets OCR'd

**Eligible Files:**
- Refs with filenames matching: `*.jpg.ref.json`, `*.jpeg.ref.json`, `*.png.ref.json`, `*.webp.ref.json`
- Directory has `processing_config.ocr = true`
- Ref does NOT have pre-existing `ocr` field

**Skipped:**
- Refs with pre-populated `ocr` field (external OCR preserved)
- Refs without image extensions in filename (e.g., `generic.ref.json`)
- Non-image refs (PDFs, videos, etc.)
- Directories with `processing_config.ocr = false`

### Processing Steps

1. **Select Refs for OCR**
   ```
   For each directory with ocr=true:
     For each ref in directory:
       If filename matches *.{jpg,jpeg,png,webp}.ref.json:
         If NOT already ocr_complete:
           If NO pre-existing ocr field:
             → Queue for OCR
   ```

2. **Call OCR Service**
   - Send image URL to OCR service (via service binding)
   - OCR service fetches image and extracts text
   - Returns extracted text + token count

3. **Update Ref**
   ```json
   {
     "url": "https://cdn.arke.institute/asset/ABC",
     "type": "image/jpeg",
     "size": 12345,
     "filename": "photo.jpg",
     "ocr": "Extracted text from image..."  ← Added
   }
   ```

4. **Publish New Version**
   - Upload updated ref to IPFS
   - Create v3 (or next version) with updated component
   - Note: `Added OCR to filename.jpg.ref.json`

### Error Handling

**Permanent Errors (skipped, marked complete):**
- Unsupported image format
- Inaccessible URL (404, 403, timeout)
- Malformed image data
- External URLs that OCR service cannot access

**Retryable Errors (retry with backoff):**
- Temporary network failures
- Service timeouts
- Rate limiting

### Output
- Image refs have `ocr` field with extracted text
- Each OCR addition creates a new entity version
- `ref.ocr_complete = true` for all processed/skipped refs
- Directory marked `ocr_complete = true` when all refs done

---

## Phase 2: PINAX Metadata Extraction

**Goal:** Generate structured metadata about directory contents using LLM analysis.

### What Gets PINAX

**Eligible Directories:**
- `processing_config.pinax = true`
- All child directories have completed PINAX (bottom-up order)
- OCR phase complete

**Skipped:**
- Directories with `processing_config.pinax = false`
- Directories without content (no files, no children)

### Input Data Gathered

The PINAX service receives:

1. **Text Files** (full content)
   ```
   For each text file:
     name: "README.md"
     content: "# Project Title\n\nDescription..."
   ```

2. **Refs** (JSON metadata)
   - **Decision:** Include OCR text or not?
   - **Logic:**
     ```
     textTokens = estimateTokens(text_content + child_pinax_content)

     If textTokens >= threshold (default: 10,000):
       → Exclude OCR from refs (save tokens)
     Else:
       → Include OCR in refs (more context)
     ```

   **Without OCR:**
   ```
   name: "photo.jpg.ref.json"
   content: {
     "url": "...",
     "type": "image/jpeg",
     "size": 12345,
     "filename": "photo.jpg"
   }
   ```

   **With OCR:**
   ```
   name: "photo.jpg.ref.json"
   content: {
     "url": "...",
     "type": "image/jpeg",
     "size": 12345,
     "filename": "photo.jpg",
     "ocr": "Text from image..."
   }
   ```

3. **Child PINAX** (from subdirectories)
   ```
   For each child directory:
     name: "child_pinax.json"
     content: {
       "id": "...",
       "title": "...",
       "subjects": [...],
       ...
     }
   ```

### Processing

1. **Gather Inputs**
   - Collect all text files
   - Collect all refs (with/without OCR based on token count)
   - Collect child PINAX metadata

2. **Call PINAX Service**
   ```json
   Request: {
     "directory_name": "project-folder",
     "files": [
       {"name": "README.md", "content": "..."},
       {"name": "data.csv", "content": "..."},
       {"name": "image.jpg.ref.json", "content": "{...}"},
       {"name": "child_pinax.json", "content": "{...}"}
     ],
     "access_url": "PLACEHOLDER",
     "manual_metadata": {}
   }
   ```

3. **Extract Structured Metadata**
   - LLM analyzes all inputs
   - Generates PINAX-compliant metadata:
     - Title, creator, institution
     - Dates, language, subjects
     - Description, type, rights
     - Geographic places

4. **Store Result**
   ```json
   pinax.json: {
     "id": "01K8...",
     "title": "Research Project Archive",
     "type": "Collection",
     "creator": "Dr. Jane Smith",
     "created": "2023-05-15",
     "subjects": ["Machine Learning", "Computer Vision"],
     "description": "A collection of...",
     ...
   }
   ```

5. **Publish New Version**
   - Upload `pinax.json` to IPFS
   - Create v4 with new component
   - Note: `Added PINAX metadata`

### Output
- Directory has `pinax.json` component
- Structured metadata available for search/discovery
- `node.pinax_complete = true`
- `node.pinax_content` stores JSON for parent aggregation

---

## Phase 3: Description Generation

**Goal:** Generate human-readable descriptions of directory contents.

### What Gets Described

**Eligible Directories:**
- `processing_config.describe = true`
- All child directories have completed Description (bottom-up order)
- PINAX phase complete

**Skipped:**
- Directories with `processing_config.describe = false`
- Directories without content (no files, no children)

### Input Data Gathered

The Description service receives:

1. **PINAX Metadata** (if exists)
   ```
   name: "pinax.json"
   content: {
     "title": "...",
     "subjects": [...],
     "description": "..."
   }
   ```

2. **All Refs** (with OCR if present)
   ```
   name: "document.pdf.ref.json"
   content: {
     "url": "...",
     "type": "application/pdf",
     "filename": "research-paper.pdf"
   }

   name: "photo.jpg.ref.json"
   content: {
     "url": "...",
     "type": "image/jpeg",
     "ocr": "Text extracted from image..."
   }
   ```

3. **Child Descriptions** (from subdirectories)
   ```
   name: "child_description.md"
   content: "# Subfolder Name\n\nThis folder contains..."
   ```

**Note:** Text files are NOT included (unlike PINAX phase).

### Processing

1. **Gather Inputs**
   - PINAX metadata (if exists)
   - All refs with OCR
   - Child descriptions (all subdirectories)

2. **Call Description Service**
   ```json
   Request: {
     "directory_name": "project-folder",
     "files": [
       {"filename": "pinax.json", "content": "{...}"},
       {"filename": "photo.jpg.ref.json", "content": "{...}"},
       {"filename": "child_description.md", "content": "..."}
     ]
   }
   ```

3. **Generate Description**
   - LLM analyzes all inputs
   - Considers:
     - Directory name and structure
     - PINAX metadata (high-level context)
     - File types and ref metadata
     - OCR text from images
     - Descriptions from subdirectories
   - Generates human-readable markdown

4. **Store Result**
   ```markdown
   # Project Folder

   This directory contains a research project focused on machine learning
   applications. It includes 15 images documenting experimental results,
   3 PDF research papers, and a dataset in CSV format. The subfolder
   "experiments" contains detailed logs and visualizations.

   ## Key Contents
   - Research papers on neural network architectures
   - Experimental data and results
   - Visual documentation of methodology

   ## Related Resources
   - Child folder: experiments/ - Detailed experimental logs
   ```

5. **Publish Final Version**
   - Upload `description.md` to IPFS
   - Create v5 (final version) with new component
   - Note: `Added description`
   - Mark `processing_complete = true`

### Output
- Directory has `description.md` component
- Human-readable summary of directory contents
- `node.description_complete = true`
- `node.description_content` stores text for parent aggregation
- **Entity processing complete!**

---

## Processing Flow Diagram

```
Upload Files → Staging Bucket
              ↓
┌─────────────────────────────────────────────────┐
│ PHASE 0: DISCOVERY                              │
├─────────────────────────────────────────────────┤
│ Classify files:                                 │
│   .txt, .md, .json, .html, .py → text_files[]  │
│   .jpg, .pdf, .mp4, etc. → refs[]              │
│                                                 │
│ Create v1 snapshots:                            │
│   - Upload text files to IPFS                   │
│   - Upload refs to IPFS                         │
│   - Create entity with components               │
│                                                 │
│ Establish relationships (v2):                   │
│   - Link children to parents                    │
│   - Bidirectional updates                       │
└─────────────────────────────────────────────────┘
              ↓
┌─────────────────────────────────────────────────┐
│ PHASE 1: OCR                                    │
├─────────────────────────────────────────────────┤
│ For *.{jpg,jpeg,png,webp}.ref.json:            │
│   If directory.ocr == true:                     │
│     If no pre-existing ocr field:               │
│       - Call OCR service with URL               │
│       - Add "ocr" field to ref                  │
│       - Upload updated ref (v3)                 │
│                                                 │
│ Skip:                                           │
│   - Refs with pre-existing OCR                  │
│   - Non-image refs                              │
│   - Directories with ocr=false                  │
└─────────────────────────────────────────────────┘
              ↓
┌─────────────────────────────────────────────────┐
│ PHASE 2: PINAX                                  │
├─────────────────────────────────────────────────┤
│ Gather inputs (bottom-up):                      │
│   - All text_files[] (full content)             │
│   - All refs[] (with/without OCR)               │
│   - Child PINAX metadata                        │
│                                                 │
│ Decision: Include OCR in refs?                  │
│   tokens = estimate(text + child_pinax)         │
│   if tokens >= 10k: exclude OCR                 │
│   if tokens < 10k: include OCR                  │
│                                                 │
│ LLM generates structured metadata:              │
│   - title, creator, subjects                    │
│   - dates, language, description                │
│   - Save as pinax.json (v4)                     │
│                                                 │
│ Skip: Directories with pinax=false              │
└─────────────────────────────────────────────────┘
              ↓
┌─────────────────────────────────────────────────┐
│ PHASE 3: DESCRIPTION                            │
├─────────────────────────────────────────────────┤
│ Gather inputs (bottom-up):                      │
│   - pinax.json (if exists)                      │
│   - All refs[] (with OCR if present)            │
│   - Child descriptions                          │
│                                                 │
│ Note: Text files NOT included                   │
│                                                 │
│ LLM generates human-readable description:       │
│   - Directory overview                          │
│   - Key contents summary                        │
│   - Relationships to children                   │
│   - Save as description.md (v5 - FINAL)         │
│                                                 │
│ Skip: Directories with describe=false           │
└─────────────────────────────────────────────────┘
              ↓
         COMPLETE
   All entities published to IPFS
   with incremental version history
```

---

## Configuration

### Per-Directory Processing Flags

Control which phases run for each directory:

```json
{
  "directory_path": "/research-project",
  "processing_config": {
    "ocr": true,       // Run OCR on images
    "describe": true,  // Generate description
    "pinax": true      // Extract metadata
  }
}
```

**Use Cases:**
- `ocr=false` for directories with text-only documents
- `pinax=false` for temporary/working directories
- `describe=false` for data-only folders

### Global Configuration

**Text Extensions** (`wrangler.jsonc` or defaults):
```
TEXT_EXTENSIONS="txt,md,json,xml,html,csv,yaml,py,js,log,sql,sh"
```

**OCR Token Threshold**:
```
OCR_TEXT_TOKEN_THRESHOLD=10000
```
- Controls when OCR is included in PINAX inputs
- Higher = more likely to exclude OCR (save tokens)
- Lower = more likely to include OCR (more context)

**Batch Sizes**:
- `BATCH_SIZE_OCR=10` - Process 10 images in parallel
- `BATCH_SIZE_PINAX=5` - Process 5 directories in parallel
- `BATCH_SIZE_DESCRIPTION=5` - Process 5 directories in parallel

---

## Summary Table

| File Type | Storage | OCR | PINAX Input | Description Input |
|-----------|---------|-----|-------------|-------------------|
| Text (.txt, .md, .html) | IPFS directly | ❌ | ✅ Full content | ❌ |
| Image (.jpg, .png) | Ref → CDN | ✅ (if eligible) | ✅ Ref + maybe OCR | ✅ Ref + OCR |
| PDF | Ref → CDN | ❌ | ✅ Ref only | ✅ Ref only |
| Video (.mp4) | Ref → CDN | ❌ | ✅ Ref only | ✅ Ref only |
| Archive (.zip) | Ref → CDN | ❌ | ✅ Ref only | ✅ Ref only |
| Pre-OCR'd Image | Ref → Staging | ✅ Skip (preserved) | ✅ Ref + OCR | ✅ Ref + OCR |
| External URL Ref | Not downloaded | ❌ (usually fails) | ✅ Ref only | ✅ Ref only |

---

## Key Takeaways

1. **Text files** go directly to IPFS and are fully analyzed in PINAX
2. **Binary files** become refs (metadata only) and are stored in CDN
3. **OCR** only runs on image refs with proper filename extensions
4. **PINAX** receives everything (text + refs + child metadata)
5. **Description** receives only refs and child descriptions (not text files)
6. Processing is **bottom-up** (deepest directories first)
7. Each phase creates a **new entity version** (incremental history)
8. Configuration allows **per-directory customization**

---

For more details, see:
- `src/phases/discovery.ts` - File classification and entity creation
- `src/phases/ocr.ts` - OCR processing logic
- `src/phases/pinax.ts` - Metadata extraction
- `src/phases/description.ts` - Description generation
- `src/constants.ts` - Text extension definitions
