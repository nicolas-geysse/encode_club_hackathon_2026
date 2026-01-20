# Bug Fix: Sharp/Embeddings Crash

## Date: 2026-01-19

## Problem

The application crashed when trying to use embeddings because `@xenova/transformers` depends on `sharp`, a native Node.js module for image processing. The native binary (`sharp-linux-x64.node`) was missing.

### Error Message
```
Error:
Something went wrong installing the "sharp" module

Cannot find module '../build/Release/sharp-linux-x64.node'
```

### Chain of Failure
```
Frontend profileService.ts → fetch('/api/embed')
  → embed.ts → import '@stride/mcp-server/services'
    → services/index.ts → tools/rag.ts → embeddings.ts
      → import '@xenova/transformers'
        → Sharp native module → CRASH
```

## Root Cause

When installing dependencies with `pnpm install`, the Sharp native binaries were not compiled/downloaded. This happens because:

1. Sharp is a **transitive dependency** (via `@xenova/transformers`), not a direct dependency
2. pnpm's `--ignore-scripts` default or hoisting behavior prevented the install script from running
3. The install script needs to download prebuilt `libvips` binaries from GitHub

## Solution Applied

### Step 1: Diagnosis
```bash
# Check Node version and architecture
node -v    # v20.19.5
uname -m   # x86_64

# Check if sharp binaries exist
ls -la node_modules/.pnpm/sharp@0.32.6/node_modules/sharp/build/Release/
# Result: No build directory
```

### Step 2: Failed Attempts
```bash
# pnpm rebuild doesn't work for transitive dependencies
pnpm rebuild sharp  # No effect

# Installing at workspace root also didn't build
pnpm add -w sharp@0.32.6 --ignore-scripts=false  # Installed but no binaries
```

### Step 3: Successful Fix
Navigate directly into the Sharp package directory and run npm install:

```bash
cd node_modules/.pnpm/sharp@0.32.6/node_modules/sharp
npm install --ignore-scripts=false
```

This executes Sharp's install script which:
1. Downloads `libvips-8.14.5-linux-x64.tar.br` from GitHub
2. Extracts the prebuilt native binaries
3. Creates the `build/Release/sharp-linux-x64.node` file

### Step 4: Verification
```bash
node -e "const sharp = require('sharp'); console.log('Sharp version:', sharp.versions);"
# Output: { vips: '8.14.5', sharp: '0.32.6', ... }
```

## Key Files

| File | Role |
|------|------|
| `node_modules/.pnpm/sharp@0.32.6/node_modules/sharp/` | Sharp package location |
| `packages/mcp-server/src/services/embeddings.ts` | Imports `@xenova/transformers` |
| `packages/mcp-server/package.json` | Declares `@xenova/transformers` dependency |

## Prevention

For future installs on new machines:

```bash
# After pnpm install, run sharp's install script manually
cd node_modules/.pnpm/sharp@0.32.6/node_modules/sharp
npm install --ignore-scripts=false
cd -
```

Or add to project setup:
```bash
# In project root
pnpm install --ignore-scripts=false
```

## Alternative Solutions (Not Used)

### Option A: Disable Embeddings
Quick fix by commenting out `fetch('/api/embed')` calls in:
- `packages/frontend/src/lib/profileService.ts`
- `packages/frontend/src/routes/api/goals.ts`

### Option B: API Embeddings
Replace `@xenova/transformers` with Groq/OpenAI embeddings API (no native modules).

### Option C: Environment Toggle
Add `DISABLE_EMBEDDINGS=true` environment variable to skip loading the module entirely.

## Environment

- **Node.js**: v20.19.5
- **Platform**: linux x86_64 (WSL2)
- **Sharp**: 0.32.6
- **libvips**: 8.14.5
- **pnpm**: v10.11.0
