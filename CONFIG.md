# Configuration Guide

The Arke Upload CLI supports multiple configuration methods with a clear priority order.

## Configuration Priority

Settings are loaded in this order (later sources override earlier ones):

1. **Config file** (`.arke-upload.json`)
2. **Environment variables** (`ARKE_*`)
3. **Command-line arguments** (`--option`)

---

## Method 1: Config File (Recommended)

Create a `.arke-upload.json` file in your project directory or home directory:

```json
{
  "workerUrl": "https://ingest.arke.institute",
  "uploader": "Your Name",
  "rootPath": "/my-collection",
  "parallel": 5,
  "parallelParts": 3,
  "allowedExtensions": [".tiff", ".jpg", ".json", ".txt", ".md"],
  "metadata": {
    "collection": "historical_records",
    "year": "1923"
  }
}
```

### Config File Locations

The CLI searches for config files in this order:

1. Current directory: `./.arke-upload.json`
2. Current directory: `./.arke-upload.config.json`
3. Current directory: `./arke-upload.config.json`
4. Home directory: `~/.arke-upload.json`
5. Home directory: `~/.arke-upload.config.json`
6. Home directory: `~/arke-upload.config.json`

### Example Setup

```bash
# Copy example config
cp .arke-upload.example.json .arke-upload.json

# Edit with your settings
nano .arke-upload.json

# Now upload without specifying options
arke-upload upload ./my-files
```

---

## Method 2: Environment Variables

Set environment variables with the `ARKE_` prefix:

```bash
# Set in your shell
export ARKE_WORKER_URL="https://ingest.arke.institute"
export ARKE_UPLOADER="Your Name"
export ARKE_ROOT_PATH="/my-collection"
export ARKE_PARALLEL=5
export ARKE_PARALLEL_PARTS=3
export ARKE_ALLOWED_EXTENSIONS=".tiff,.jpg,.json"
export ARKE_METADATA='{"collection":"historical","year":"1923"}'

# Now upload
arke-upload upload ./my-files
```

### Permanent Setup

Add to your `~/.bashrc` or `~/.zshrc`:

```bash
# Arke Upload CLI defaults
export ARKE_WORKER_URL="https://ingest.arke.institute"
export ARKE_UPLOADER="Your Name"
export ARKE_ROOT_PATH="/"
```

---

## Method 3: Command-Line Arguments

Override any config file or environment variable:

```bash
arke-upload upload ./my-files \
  --worker-url https://ingest.arke.institute \
  --uploader "Your Name" \
  --root-path "/collection/series_1" \
  --parallel 10
```

---

## Configuration Options

### Required Options

Only `uploader` is required (must be set via CLI, env, or config file):

| Option | CLI Flag | Env Variable | Config Key | Default |
|--------|----------|--------------|------------|---------|
| Uploader name | `--uploader` | `ARKE_UPLOADER` | `uploader` | *(required)* |

### Optional Options

| Option | CLI Flag | Env Variable | Config Key | Default |
|--------|----------|--------------|------------|---------|
| Worker URL | `--worker-url` | `ARKE_WORKER_URL` | `workerUrl` | `https://ingest.arke.institute` |
| Root path | `--root-path` | `ARKE_ROOT_PATH` | `rootPath` | `/` |
| Parallel uploads | `--parallel` | `ARKE_PARALLEL` | `parallel` | `5` |
| Parallel parts | `--parallel-parts` | `ARKE_PARALLEL_PARTS` | `parallelParts` | `3` |
| Allowed extensions | `--allowed-extensions` | `ARKE_ALLOWED_EXTENSIONS` | `allowedExtensions` | *(all supported)* |
| Metadata | `--metadata` | `ARKE_METADATA` | `metadata` | *(none)* |

---

## Usage Examples

### Example 1: Pure Config File

**`.arke-upload.json`:**
```json
{
  "workerUrl": "https://ingest.arke.institute",
  "uploader": "Jane Doe",
  "rootPath": "/archive"
}
```

**Command:**
```bash
arke-upload upload ./my-files
```

### Example 2: Config File + Override

**`.arke-upload.json`:**
```json
{
  "workerUrl": "https://ingest.arke.institute",
  "uploader": "Jane Doe"
}
```

**Command (override root path):**
```bash
arke-upload upload ./my-files --root-path "/collection/series_1"
```

### Example 3: Environment Variables Only

```bash
export ARKE_UPLOADER="Jane Doe"
arke-upload upload ./my-files
```

### Example 4: Mixed Configuration

**`.arke-upload.json`:**
```json
{
  "parallel": 10,
  "metadata": {
    "collection": "default"
  }
}
```

**Environment:**
```bash
export ARKE_UPLOADER="Jane Doe"
```

**Command:**
```bash
arke-upload upload ./my-files --root-path "/custom"
```

**Result:**
- `uploader`: "Jane Doe" (from env)
- `workerUrl`: "https://ingest.arke.institute" (default)
- `rootPath`: "/custom" (from CLI, overrides default)
- `parallel`: 10 (from config file)
- `metadata`: {"collection": "default"} (from config file)

---

## Per-Project Configuration

For multiple projects with different settings:

```bash
# Project 1
cd ~/projects/archive-1
cat > .arke-upload.json << EOF
{
  "uploader": "Your Name",
  "rootPath": "/archive-1",
  "metadata": {"project": "archive-1"}
}
EOF

arke-upload upload ./files  # Uses archive-1 config

# Project 2
cd ~/projects/archive-2
cat > .arke-upload.json << EOF
{
  "uploader": "Your Name",
  "rootPath": "/archive-2",
  "metadata": {"project": "archive-2"}
}
EOF

arke-upload upload ./files  # Uses archive-2 config
```

---

## Global Configuration

Set defaults for all uploads in your home directory:

```bash
cat > ~/.arke-upload.json << EOF
{
  "workerUrl": "https://ingest.arke.institute",
  "uploader": "Your Name",
  "parallel": 10
}
EOF
```

Project-specific configs (`./.arke-upload.json`) will override these global settings.

---

## Validation

The CLI validates all configuration values:

- **workerUrl**: Must be a valid HTTP/HTTPS URL
- **uploader**: Cannot be empty
- **rootPath**: Must start with `/`, no `..` or invalid characters
- **parallel**: Must be a positive number
- **parallelParts**: Must be a positive number
- **metadata**: Must be valid JSON object
- **allowedExtensions**: Must start with `.`

---

## Troubleshooting

### Error: "Uploader name is required"

**Solution:** Set uploader via any method:
```bash
# Option 1: CLI
arke-upload upload ./files --uploader "Your Name"

# Option 2: Environment
export ARKE_UPLOADER="Your Name"

# Option 3: Config file
echo '{"uploader": "Your Name"}' > .arke-upload.json
```

### Config file not being loaded

**Check file location:**
```bash
# Should be in current directory or home directory
ls -la .arke-upload.json
ls -la ~/.arke-upload.json
```

**Check JSON syntax:**
```bash
cat .arke-upload.json | jq .
# Should not show errors
```

### Environment variables not working

**Verify they're set:**
```bash
echo $ARKE_UPLOADER
echo $ARKE_WORKER_URL
```

**Check spelling:**
- Must use `ARKE_` prefix
- Must be all caps
- Use underscores: `ARKE_WORKER_URL` (not `ARKE-WORKER-URL`)

---

## Best Practices

1. **Use config files for project-specific settings**
   - Commit `.arke-upload.json` to version control (without sensitive data)
   - Different config per project

2. **Use environment variables for user-specific settings**
   - Set `ARKE_UPLOADER` in your shell profile
   - Don't commit to version control

3. **Use CLI arguments for one-time overrides**
   - Testing different settings
   - Overriding specific values

4. **Keep sensitive data out of config files**
   - Worker URL is fine to commit
   - Avoid storing credentials (none required currently)

---

## Example Workflows

### Developer Workflow

```bash
# ~/.bashrc or ~/.zshrc
export ARKE_UPLOADER="Dev Team"
export ARKE_WORKER_URL="http://localhost:8787"

# Any project
arke-upload upload ./files  # Uses dev worker
```

### Production Workflow

```bash
# .arke-upload.json (committed to repo)
{
  "rootPath": "/production/archive",
  "parallel": 10,
  "metadata": {
    "environment": "production"
  }
}

# Command (overrides for production worker)
arke-upload upload ./files \
  --uploader "Production Team" \
  --worker-url https://ingest.arke.institute
```

### Automated Workflow (CI/CD)

```bash
# GitHub Actions / GitLab CI
export ARKE_UPLOADER="CI Bot"
export ARKE_WORKER_URL="https://ingest.arke.institute"

arke-upload upload ./artifacts \
  --root-path "/ci-builds/$(date +%Y%m%d)"
```
