/**
 * Process utilities for managing child processes with graceful shutdown.
 * Uses tree-kill for reliable process tree termination.
 */

import { spawn, ChildProcess, execSync } from 'child_process';
import treeKillCallback from 'tree-kill';

function treeKill(pid: number, signal?: string): Promise<void> {
  return new Promise((resolve, reject) => {
    treeKillCallback(pid, signal || 'SIGTERM', (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

export interface SpawnOptions {
  command: string;
  args: string[];
  name: string;
  env?: NodeJS.ProcessEnv;
  detached?: boolean;
}

export interface ManagedProcess {
  process: ChildProcess;
  name: string;
  pid: number;
}

/**
 * Kill a process tree with graceful shutdown (SIGTERM) and SIGKILL fallback.
 */
export async function killProcessTree(
  pid: number,
  signal: NodeJS.Signals = 'SIGTERM',
  timeoutMs = 3000
): Promise<void> {
  try {
    await treeKill(pid, signal);
    
    await new Promise(resolve => setTimeout(resolve, 500));
    
    try {
      globalThis.process.kill(pid, 0);
      await new Promise(resolve => setTimeout(resolve, timeoutMs - 500));
      try {
        globalThis.process.kill(pid, 0);
        await treeKill(pid, 'SIGKILL');
      } catch {
      }
    } catch {
    }
  } catch (error) {
  }
}

/**
 * Check if a process is still running.
 */
export function isProcessRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * Find an available X display number by checking lock files.
 * Starts at :99 and scans upward.
 */
export async function findAvailableDisplay(startFrom = 99, maxDisplay = 200): Promise<number> {
  const fs = await import('fs/promises');
  
  for (let i = startFrom; i <= maxDisplay; i++) {
    const lockPath = `/tmp/.X${i}-lock`;
    try {
      await fs.access(lockPath);
    } catch {
      return i;
    }
  }
  
  throw new Error(`No available display found in range :${startFrom} - :${maxDisplay}`);
}

/**
 * Wait for an X display to become available.
 */
export async function waitForDisplay(display: number, timeoutMs = 10000): Promise<void> {
  const startTime = Date.now();
  const displayStr = `:${display}`;
  
  while (Date.now() - startTime < timeoutMs) {
    try {
      execSync(`xdpyinfo -display ${displayStr} >/dev/null 2>&1`, {
        stdio: 'ignore',
        timeout: 1000
      });
      return;
    } catch {
      await new Promise(r => setTimeout(r, 100));
    }
  }
  
  throw new Error(`Display ${displayStr} failed to become ready within ${timeoutMs}ms`);
}

/**
 * Spawn a long-running process with proper lifecycle management.
 */
export function spawnManaged(options: SpawnOptions): ManagedProcess {
  const child = spawn(options.command, options.args, {
    detached: options.detached ?? true,
    stdio: 'ignore',
    env: { ...process.env, ...options.env },
  });
  
  if (options.detached !== false) {
    child.unref();
  }
  
  return {
    process: child,
    name: options.name,
    pid: child.pid!,
  };
}

/**
 * Execute a command in the context of a specific X display.
 */
export async function execInDisplay(
  display: string,
  command: string
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn('sh', ['-c', command], {
      env: { ...process.env, DISPLAY: display },
    });
    
    let stdout = '';
    let stderr = '';
    
    child.stdout?.on('data', (data) => { stdout += data; });
    child.stderr?.on('data', (data) => { stderr += data; });
    
    child.on('close', (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        reject(new Error(`Command failed with code ${code}: ${stderr || stdout}`));
      }
    });
    
    child.on('error', reject);
  });
}