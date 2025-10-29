# Distribution & Installation

The Arke Upload CLI is ready for distribution! Here's how to install and use it.

## ✅ Ready for Production

- **Config file support** - Set defaults in `.arke-upload.json`
- **Environment variables** - Use `ARKE_*` env vars
- **CLI arguments** - Override any setting
- **NPM installable** - Works with `npm install` and `npm link`
- **Global command** - Use `arke-upload` anywhere after installation

---

## Quick Start (No Configuration)

Just specify the uploader name:

```bash
arke-upload upload ./my-files --uploader "Your Name"
```

Worker URL defaults to `https://ingest.arke.institute` ✅

---

## Recommended Setup

### 1. Create Config File

```bash
cat > .arke-upload.json << EOF
{
  "uploader": "Your Name"
}
EOF
```

###2. Upload Files

```bash
arke-upload upload ./my-files
```

That's it! Worker URL and other settings use smart defaults.

---

## Installation Methods

### Option 1: From GitHub (Recommended)

```bash
# Install globally
npm install -g github:Arke-Institute/cli

# Verify
arke-upload --version

# Use
arke-upload upload ./files --uploader "Me"
```

### Option 2: Local Clone

```bash
# Clone
git clone https://github.com/Arke-Institute/cli.git
cd cli

# Install & link
npm install
npm run build
npm link

# Use anywhere
arke-upload upload ./files --uploader "Me"
```

### Option 3: NPM Registry (Future)

Once published to NPM:

```bash
npm install -g @arke/upload-cli
arke-upload upload ./files --uploader "Me"
```

---

## Configuration Examples

### Minimal Config

```json
{
  "uploader": "Your Name"
}
```

Then:
```bash
arke-upload upload ./files
```

### Full Config

```json
{
  "workerUrl": "https://ingest.arke.institute",
  "uploader": "Your Name",
  "rootPath": "/my-collection",
  "parallel": 10,
  "metadata": {
    "project": "archive-2024"
  }
}
```

Then:
```bash
arke-upload upload ./files
# Uses all settings from config
```

### Environment Variables

```bash
export ARKE_UPLOADER="Your Name"
arke-upload upload ./files
```

---

## Default Values

| Setting | Default | Required? |
|---------|---------|-----------|
| `workerUrl` | `https://ingest.arke.institute` | No |
| `uploader` | *(none)* | **Yes** |
| `rootPath` | `/` | No |
| `parallel` | `5` | No |
| `parallelParts` | `3` | No |

**Only `uploader` is required!**

---

## Usage Examples

### Simplest Possible

```bash
arke-upload upload ./files --uploader "Me"
```

### With Config File

**`.arke-upload.json`:**
```json
{"uploader": "Me"}
```

**Command:**
```bash
arke-upload upload ./files
```

### With Root Path

```bash
arke-upload upload ./files \
  --uploader "Me" \
  --root-path "/archive/2024"
```

### With Metadata

```bash
arke-upload upload ./files \
  --uploader "Me" \
  --metadata '{"project":"test","year":"2024"}'
```

### High Performance

```bash
arke-upload upload ./files \
  --uploader "Me" \
  --parallel 10
```

---

## For Developers

### Local Development

```bash
# Link for development
npm link

# Edit code
# ...

# Rebuild
npm run build

# Test (uses linked version)
arke-upload upload ./test --uploader "Dev"
```

### Publishing to NPM

1. Create NPM account at https://npmjs.com
2. Login: `npm login`
3. Publish: `npm publish --access public`

**Note:** Package name `@arke/upload-cli` requires the `@arke` scope to be created on NPM first.

---

## Configuration Priority

1. **CLI arguments** (highest priority)
2. **Environment variables** (`ARKE_*`)
3. **Config file** (`.arke-upload.json`)
4. **Defaults** (lowest priority)

**Example:**
```bash
# Config file: uploader = "Alice"
# Env var: ARKE_UPLOADER="Bob"
# CLI: --uploader "Charlie"

# Result: uploader = "Charlie" (CLI wins)
```

---

## Files

### Config Files (searched in order)

1. `./.arke-upload.json` ← current directory
2. `./.arke-upload.config.json`
3. `./arke-upload.config.json`
4. `~/.arke-upload.json` ← home directory
5. `~/.arke-upload.config.json`
6. `~/arke-upload.config.json`

### Example Config

See `.arke-upload.example.json` for a complete example.

---

## Best Practices

✅ **Do:**
- Create `.arke-upload.json` in your project
- Set `ARKE_UPLOADER` in your shell profile
- Use CLI args for one-off overrides
- Commit `.arke-upload.example.json` to repo

❌ **Don't:**
- Commit `.arke-upload.json` (it's in .gitignore)
- Hard-code settings in scripts (use config)
- Put sensitive data in config (not needed currently)

---

## Troubleshooting

### "Command not found: arke-upload"

**Solution:** Add npm global bin to PATH

```bash
npm config get prefix
# Add /path/to/npm/bin to your PATH
```

### "Uploader name is required"

**Solution:** Set it via any method:

```bash
# CLI
arke-upload upload ./files --uploader "Me"

# Or config file
echo '{"uploader": "Me"}' > .arke-upload.json

# Or env var
export ARKE_UPLOADER="Me"
```

### Config file not loading

**Check location:**
```bash
ls .arke-upload.json  # Should be in current directory
```

**Check JSON syntax:**
```bash
cat .arke-upload.json | jq .  # Should parse without errors
```

---

## Documentation

- **[README.md](README.md)** - Full usage guide
- **[CONFIG.md](CONFIG.md)** - Detailed configuration guide
- **[INSTALL.md](INSTALL.md)** - Installation instructions
- **[QUICKSTART.md](QUICKSTART.md)** - Getting started
- **[API.md](API.md)** - Worker API reference

---

## Support

- Issues: https://github.com/Arke-Institute/cli/issues
- Docs: See files above

---

**Status:** ✅ Production Ready
**Version:** 0.1.0
**License:** MIT
