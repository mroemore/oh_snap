#!/usr/bin/env node
/**
 * oh_snap MCP launcher.
 *
 * Builds dist/ if it's missing or stale (any src/ file newer than
 * dist/index.js), then spawns the MCP server with stdio inherited so
 * OpenCode's stdio transport works correctly.
 *
 * Pointed at by the `mcp` script in package.json and by
 * ~/.config/opencode/opencode.json -> mcp.oh_snap.command.
 */

import { spawn } from 'node:child_process';
import { existsSync, statSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const distEntry = join(root, 'dist', 'index.js');
const srcDir = join(root, 'src');

/**
 * Returns null if dist is fresh, or a {reason} object explaining why a
 * build is needed.
 */
function needsBuild() {
  if (!existsSync(distEntry)) {
    return { reason: 'dist/index.js missing' };
  }

  let distMtime;
  try {
    distMtime = statSync(distEntry).mtimeMs;
  } catch (err) {
    return { reason: `cannot stat dist/index.js: ${err.message}` };
  }

  try {
    const stale = newerThan(srcDir, distMtime);
    if (stale) return { reason: `src/${stale} newer than dist/index.js` };
  } catch (err) {
    // Walk failed (permissions, etc.) — rebuild to be safe.
    return { reason: `src walk error: ${err.message}` };
  }

  return null;
}

/**
 * Recursively walk `dir` and return the relative path (from dir) of the
 * first file whose mtime is strictly greater than `threshold`, or null.
 */
function newerThan(dir, threshold) {
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = join(dir, e.name);
    if (e.isDirectory()) {
      const hit = newerThan(full, threshold);
      if (hit) return `${e.name}/${hit}`;
    } else if (e.isFile()) {
      try {
        if (statSync(full).mtimeMs > threshold) return e.name;
      } catch {
        // unreadable file — skip
      }
    }
  }
  return null;
}

function build() {
  return new Promise((resolve, reject) => {
    const tsc = spawn('npx', ['tsc'], { stdio: 'inherit', cwd: root });
    tsc.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`tsc exited with code ${code}`));
    });
    tsc.on('error', reject);
  });
}

function runServer() {
  const child = spawn('node', [distEntry], { stdio: 'inherit', cwd: root });

  const forward = (sig) => {
    try { child.kill(sig); } catch { /* already gone */ }
  };
  process.on('SIGINT', () => forward('SIGINT'));
  process.on('SIGTERM', () => forward('SIGTERM'));

  child.on('exit', (code, signal) => {
    if (signal) {
      // Re-raise so the parent (OpenCode) sees the same signal
      try { process.kill(process.pid, signal); } catch { process.exit(1); }
    } else {
      process.exit(code ?? 0);
    }
  });
  child.on('error', (err) => {
    console.error('[oh-snap] server failed to start:', err);
    process.exit(1);
  });
}

async function main() {
  const stale = needsBuild();
  if (stale) {
    console.error(`[oh-snap] Building dist/ (${stale.reason})...`);
    try {
      await build();
    } catch (err) {
      console.error(`[oh-snap] Build failed: ${err.message}`);
      process.exit(1);
    }
  }
  runServer();
}

main();
