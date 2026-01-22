#!/usr/bin/env node
/**
 * Post-build script to create aliased package symlinks in the Nitro output.
 *
 * Mastra packages import non-existent packages with version suffixes (e.g., -v5, -v3).
 * These are npm aliases in our package.json. Since Mastra is externalized,
 * Vite's alias configuration doesn't apply at runtime.
 *
 * This script creates the necessary symlinks in .output/server/node_modules/
 * after Nitro builds the output.
 */

import { existsSync, symlinkSync, readdirSync } from "fs";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const nodeModulesDir = resolve(__dirname, "../.output/server/node_modules");

// Symlinks to create: { dir, alias, target }
// dir: subdirectory within node_modules (empty string for root)
const symlinks = [
  // @mastra/core imports
  { dir: "@ai-sdk", alias: "provider-v5", target: "provider" },
  { dir: "@ai-sdk", alias: "provider-utils-v5", target: "provider-utils" },
  // @mastra/schema-compat imports
  { dir: "", alias: "zod-from-json-schema-v3", target: "zod-from-json-schema" },
];

console.log("[postbuild] Creating Mastra runtime symlinks...");

// Ensure the base directory exists
if (!existsSync(nodeModulesDir)) {
  console.log(`[postbuild] Directory not found: ${nodeModulesDir}`);
  console.log("[postbuild] Skipping - build output may not exist yet");
  process.exit(0);
}

for (const { dir, alias, target } of symlinks) {
  const baseDir = dir ? join(nodeModulesDir, dir) : nodeModulesDir;
  const aliasPath = join(baseDir, alias);
  const targetPath = join(baseDir, target);

  // Check if base directory exists
  if (!existsSync(baseDir)) {
    console.log(`[postbuild] Warning: Directory ${dir || "root"} not found, skipping ${alias}`);
    continue;
  }

  // Check if target exists
  if (!existsSync(targetPath)) {
    console.log(`[postbuild] Warning: Target ${target} not found in ${dir || "root"}, skipping ${alias}`);
    continue;
  }

  // Check if alias already exists
  if (existsSync(aliasPath)) {
    console.log(`[postbuild] Symlink ${alias} already exists, skipping`);
    continue;
  }

  try {
    // Create relative symlink
    symlinkSync(target, aliasPath);
    console.log(`[postbuild] Created symlink: ${dir ? dir + "/" : ""}${alias} -> ${target}`);
  } catch (err) {
    console.error(`[postbuild] Failed to create symlink ${alias}:`, err.message);
  }
}

console.log("[postbuild] Done");
