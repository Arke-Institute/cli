# Installation Guide

## Quick Start

### Option 1: Install from GitHub (Recommended)

```bash
# Install globally from GitHub
npm install -g github:Arke-Institute/cli

# Verify installation
arke-upload --version

# Use it! (worker URL defaults to https://ingest.arke.institute)
arke-upload upload ./my-files --uploader "Your Name"
```

---

### Option 2: Install from Local Clone

```bash
# Clone the repository
git clone https://github.com/Arke-Institute/cli.git
cd cli

# Install dependencies and build
npm install
npm run build

# Link globally (makes `arke-upload` available everywhere)
npm link

# Now use anywhere (worker URL defaults to https://ingest.arke.institute)
arke-upload upload ./my-files --uploader "Your Name"
```

---

### Option 3: Run Directly (No Installation)

```bash
# Clone and install
git clone https://github.com/Arke-Institute/cli.git
cd cli
npm install

# Run with tsx (development)
npx tsx src/index.ts upload ./my-files --uploader "Your Name"

# Or build and run
npm run build
node dist/index.js upload ./my-files --uploader "Your Name"
```

---

## Future: NPM Registry (Coming Soon)

Once published to NPM, installation will be even simpler:

```bash
# Install from NPM (future)
npm install -g @arke/upload-cli

# Use immediately
arke-upload upload ./my-files --uploader "Your Name"
```

**To publish to NPM (for maintainers):**
1. Create NPM account at https://www.npmjs.com
2. Login: `npm login`
3. Publish: `npm publish --access public`

---

## Verify Installation

After installation, verify it works:

```bash
# Check version
arke-upload --version

# See help
arke-upload --help

# Test with dry run
arke-upload upload ./example_dirs/sample_archive_deep \
  --uploader "Test User" \
  --dry-run
```

---

## Update

### From GitHub
```bash
npm update -g @arke/upload-cli
```

### From Local Link
```bash
cd cli
git pull
npm install
npm run build
# npm link is still active, changes take effect immediately
```

---

## Uninstall

```bash
# If installed globally
npm uninstall -g @arke/upload-cli

# If linked locally
npm unlink -g @arke/upload-cli
```

---

## Troubleshooting

### Command not found: arke-upload

**Solution 1:** Make sure global npm bin is in your PATH
```bash
npm config get prefix
# Add this to your PATH: /path/to/npm/bin
```

**Solution 2:** Use npx instead
```bash
npx arke-upload upload ./my-files --uploader "Me"
```

### Permission denied when installing globally

**Solution:** Use sudo (macOS/Linux) or run terminal as administrator (Windows)
```bash
sudo npm install -g github:Arke-Institute/cli
```

Or configure npm to install globally without sudo:
```bash
mkdir ~/.npm-global
npm config set prefix '~/.npm-global'
echo 'export PATH=~/.npm-global/bin:$PATH' >> ~/.bashrc
source ~/.bashrc
```

### Module not found errors

Make sure dependencies are installed and built:
```bash
cd cli
npm install
npm run build
```

---

## Requirements

- **Node.js:** 18.0.0 or higher
- **npm:** 8.0.0 or higher

Check your versions:
```bash
node --version
npm --version
```

Install/update Node.js from: https://nodejs.org
