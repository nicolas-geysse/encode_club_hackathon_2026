#!/usr/bin/env node
/**
 * Post-build script to create @ai-sdk/*-v5 symlinks in the Nitro output.
 *
 * @mastra/core imports @ai-sdk/provider-v5 and @ai-sdk/provider-utils-v5 at runtime.
 * These don't exist as real packages - they're npm aliases. Since @mastra/core is
 * externalized, Vite's alias configuration doesn't apply at runtime.
 *
 * This script creates the necessary symlinks in .output/server/node_modules/@ai-sdk/
 * after Nitro builds the output.
 */

import { existsSync, symlinkSync, mkdirSync, readdirSync } from "fs";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outputDir = resolve(__dirname, "../.output/server/node_modules/@ai-sdk");

// Symlinks to create: alias -> real package
const symlinks = [
  { alias: "provider-v5", target: "provider" },
  { alias: "provider-utils-v5", target: "provider-utils" },
];

console.log("[postbuild] Creating @ai-sdk/*-v5 symlinks for Mastra runtime...");

// Ensure the directory exists
if (!existsSync(outputDir)) {
  console.log(`[postbuild] Directory not found: ${outputDir}`);
  console.log("[postbuild] Skipping - build output may not exist yet");
  process.exit(0);
}

// List existing packages to find the target
const existingPackages = readdirSync(outputDir);
console.log(`[postbuild] Found packages in output: ${existingPackages.join(", ")}`);

for (const { alias, target } of symlinks) {
  const aliasPath = join(outputDir, alias);
  const targetPath = join(outputDir, target);

  // Check if target exists
  if (!existsSync(targetPath)) {
    console.log(`[postbuild] Warning: Target ${target} not found, skipping ${alias}`);
    continue;
  }

  // Check if alias already exists
  if (existsSync(aliasPath)) {
    console.log(`[postbuild] Symlink ${alias} already exists, skipping`);
    continue;
  }

  try {
    // Create relative symlink: provider-v5 -> provider
    symlinkSync(target, aliasPath);
    console.log(`[postbuild] Created symlink: ${alias} -> ${target}`);
  } catch (err) {
    console.error(`[postbuild] Failed to create symlink ${alias}:`, err.message);
  }
}

console.log("[postbuild] Done");
