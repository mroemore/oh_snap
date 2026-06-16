import { spawn, ChildProcess, execSync } from 'child_process';
import { findAvailableDisplay, waitForDisplay } from './nested/process-utils.js';
import { promisify } from 'util';
import { exec } from 'child_process';

const execAsync = promisify(exec);
const which = async (cmd: string): Promise<boolean> => {
  try { await execAsync(`which ${cmd}`); return true; }
  catch { return false; }
};

// --- Backend interface ---
interface DisplayBackend {
  initialize(): Promise<void>;
  shutdown(): Promise<void>;
  getDisplay(): string | undefined;
  isVirtual(): boolean;
}

// --- Native backend ---
class NativeBackend implements DisplayBackend {
  private originalDisplay: string | undefined;

  constructor() {
    this.originalDisplay = process.env.DISPLAY;
  }

  async initialize(): Promise<void> {
    // Native mode: nothing to start
  }

  async shutdown(): Promise<void> {
    // Nothing to stop
  }

  getDisplay(): string | undefined {
    return process.env.DISPLAY;
  }

  isVirtual(): boolean {
    return false;
  }

  getOriginalDisplay(): string | undefined {
    return this.originalDisplay;
  }
}

// --- Xvfb backend ---
interface XvfbConfig {
  displayNumber?: number;
  width?: number;
  height?: number;
  depth?: number;
  extraArgs?: string[];
}

class XvfbBackend implements DisplayBackend {
  private xvfbProcess: ChildProcess | null = null;
  private displayNumber: number;
  private display: string;
  private width: number;
  private height: number;
  private depth: number;
  private extraArgs: string[];
  private originalDisplay: string | undefined;
  private started: boolean = false;

  constructor(config: XvfbConfig = {}) {
    this.displayNumber = config.displayNumber ?? 99;
    this.display = `:${this.displayNumber}`;
    this.width = config.width ?? 1920;
    this.height = config.height ?? 1080;
    this.depth = config.depth ?? 24;
    this.extraArgs = config.extraArgs ?? [];
    this.originalDisplay = process.env.DISPLAY;
  }

  async initialize(): Promise<void> {
    // Check Xvfb is installed
    const installed = await which('Xvfb');
    if (!installed) {
      throw new Error('Xvfb is not installed. Install with: sudo apt-get install xvfb');
    }

    // Try to start with retries on display conflict
    let lastError: Error | null = null;
    let displayNum = this.displayNumber;

    for (let attempt = 0; attempt < 3; attempt++) {
      if (attempt > 0) {
        // Find next available display after the previous failure
        displayNum = await findAvailableDisplay(displayNum + 1);
      }

      const displayStr = `:${displayNum}`;
      const args = [
        displayStr,
        '-screen', '0', `${this.width}x${this.height}x${this.depth}`,
        '-ac',
        '-br',
        '-noreset',
        '+extension', 'RANDR',
        ...this.extraArgs,
      ];

      try {
        const proc = spawn('Xvfb', args, {
          detached: true,
          stdio: 'ignore',
        });

        proc.unref();

        this.xvfbProcess = proc;
        this.displayNumber = displayNum;
        this.display = displayStr;

        // Wait for display to be ready
        await Promise.race([
          waitForDisplay(displayNum, 10000),
          new Promise((_, reject) => {
            const timeout = setTimeout(() => {
              reject(new Error(`Xvfb failed to start on ${displayStr} within 10s`));
            }, 10000);

            proc.on('error', (err) => {
              clearTimeout(timeout);
              reject(new Error(`Xvfb spawn error on ${displayStr}: ${err.message}`));
            });

            proc.on('exit', (code, signal) => {
              clearTimeout(timeout);
              if (code !== 0 && code !== null) {
                reject(new Error(`Xvfb exited with code ${code} on ${displayStr}`));
              }
            });
          }),
        ]);

        this.started = true;
        return;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        // Kill the failed process if any
        if (this.xvfbProcess?.pid) {
          try { process.kill(this.xvfbProcess.pid); } catch {}
          this.xvfbProcess = null;
        }
        // Continue to next attempt with new display
      }
    }

    throw lastError || new Error('Failed to start Xvfb after 3 attempts');
  }

  async shutdown(): Promise<void> {
    if (this.xvfbProcess && this.xvfbProcess.pid) {
      try {
        process.kill(this.xvfbProcess.pid, 'SIGTERM');
      } catch {
        // Process may already be dead
      }
      this.xvfbProcess = null;
    }
    this.started = false;
  }

  getDisplay(): string | undefined {
    return this.started ? this.display : undefined;
  }

  isVirtual(): boolean {
    return this.started;
  }

  getOriginalDisplay(): string | undefined {
    return this.originalDisplay;
  }

  getDisplayNumber(): number {
    return this.displayNumber;
  }

  isRunning(): boolean {
    if (!this.started || !this.xvfbProcess) return false;
    try {
      if (this.xvfbProcess.pid) {
        process.kill(this.xvfbProcess.pid, 0);
        return true;
      }
    } catch {}
    return false;
  }
}

// --- DisplayManager facade ---
class DisplayManager {
  private backend: DisplayBackend;

  constructor(backend: DisplayBackend) {
    this.backend = backend;
  }

  async initialize(): Promise<void> {
    await this.backend.initialize();
    if (this.backend.isVirtual()) {
      const display = this.backend.getDisplay();
      if (display) {
        process.env.DISPLAY = display;
      }
    }
  }

  async shutdown(): Promise<void> {
    await this.backend.shutdown();
  }

  getDisplay(): string | undefined {
    return this.backend.getDisplay();
  }

  isVirtual(): boolean {
    return this.backend.isVirtual();
  }

  getOriginalDisplay(): string | undefined {
    if (this.backend instanceof NativeBackend) {
      return this.backend.getOriginalDisplay();
    }
    if (this.backend instanceof XvfbBackend) {
      return this.backend.getOriginalDisplay();
    }
    return process.env.DISPLAY;
  }
}

// Module-level singleton
let displayManagerInstance: DisplayManager | null = null;
let virtualDisplayActive = false;

function getDisplayManager(): DisplayManager {
  if (!displayManagerInstance) {
    throw new Error('DisplayManager not initialized. Call initialize() first.');
  }
  return displayManagerInstance;
}

function setDisplayManager(manager: DisplayManager): void {
  displayManagerInstance = manager;
  virtualDisplayActive = manager.isVirtual();
}

function isVirtualDisplayActive(): boolean {
  return virtualDisplayActive;
}

export {
  NativeBackend,
  XvfbBackend,
  DisplayManager,
  getDisplayManager,
  setDisplayManager,
  isVirtualDisplayActive,
};
export type {
  DisplayBackend,
  XvfbConfig,
};
