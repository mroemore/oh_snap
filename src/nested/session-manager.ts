/**
 * Nested session manager for Xephyr-based isolated X sessions.
 */

import { spawn, ChildProcess } from 'child_process';
import { randomUUID } from 'crypto';
import type {
  NestedSessionOptions,
  SessionInfo,
  StartSessionResult,
  RunInSessionResult,
  CaptureNestedResult,
  NestedWindowInfo,
  WaitForWindowOptions,
  NamedAppInfo,
} from './types.js';
import {
  killProcessTree,
  findAvailableDisplay,
  waitForDisplay,
  execInDisplay,
  isProcessRunning,
} from './process-utils.js';

const DEFAULT_WIDTH = 1024;
const DEFAULT_HEIGHT = 768;
const DEFAULT_DISPLAY_START = 99;

class NestedSessionManager {
  private sessions: Map<string, SessionInfo> = new Map();
  private displayToSession: Map<number, string> = new Map();

  async startSession(options: NestedSessionOptions = {}): Promise<StartSessionResult> {
    const sessionId = randomUUID();
    const displayNumber = options.display ?? await findAvailableDisplay(DEFAULT_DISPLAY_START);
    const display = `:${displayNumber}`;
    // Load configuration defaults (if available) and fall back gracefully
    const config = await this._loadVisionConfig().catch(() => ({} as any));
    const nestedCfg = (config && config.nested_sessions) || {};
    const width = options.width ?? (nestedCfg.default_width ?? DEFAULT_WIDTH);
    const height = options.height ?? (nestedCfg.default_height ?? DEFAULT_HEIGHT);

    if (this.displayToSession.has(displayNumber)) {
      throw new Error(`Display ${display} is already in use by another session`);
    }

    const sessionInfo: Partial<SessionInfo> = {
      sessionId,
      display,
      displayNumber,
      appPids: [],
      createdAt: new Date(),
      name: options.name,
      state: 'starting',
    };

    try {
      const xephyrProcess = await this.spawnXephyr(displayNumber, width, height);
      sessionInfo.xephyrProcess = xephyrProcess;
      sessionInfo.xephyrPid = xephyrProcess.pid!;

      await waitForDisplay(displayNumber);

      let wmProcess: ChildProcess | null = null;
      let wmPid: number | null = null;
      
      const windowManager = options.windowManager ?? (nestedCfg.default_window_manager ?? 'evilwm');
      // Use WM fallback chain from config if provided
      const wmFallback = nestedCfg.wm_fallback_chain;
      if (windowManager !== 'none') {
        const result = await this.spawnWindowManager(display, windowManager, wmFallback);
        wmProcess = result.process;
        wmPid = result.pid;
        sessionInfo.wmProcess = wmProcess;
        sessionInfo.wmPid = wmPid;
      }

      const fullSessionInfo: SessionInfo = {
        ...sessionInfo,
        xephyrProcess: xephyrProcess,
        xephyrPid: xephyrProcess.pid!,
        wmProcess,
        wmPid,
        appPids: [],
        state: 'running',
      } as SessionInfo;

      this.sessions.set(sessionId, fullSessionInfo);
      this.displayToSession.set(displayNumber, sessionId);

      return {
        sessionId,
        display,
        displayNumber,
        width,
        height,
      };
    } catch (error) {
      // Cleanup on failure
      if (sessionInfo.xephyrPid) {
        await killProcessTree(sessionInfo.xephyrPid);
      }
      throw error;
    }
  }

  private async spawnXephyr(
    displayNumber: number,
    width: number,
    height: number
  ): Promise<ChildProcess> {
    const args = [
      `:${displayNumber}`,
      '-screen', `${width}x${height}`,
      '-ac',
      '-br',
      '-noreset',
      '-no-host-grab',
      '+extension', 'RANDR',
      '+extension', 'COMPOSITE',
    ];

    const process = spawn('Xephyr', args, {
      detached: true,
      stdio: 'ignore',
    });

    process.unref();

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Xephyr failed to start within timeout'));
      }, 5000);

      process.on('error', (err) => {
        clearTimeout(timeout);
        reject(err);
      });

      // Wait a brief moment then resolve with the process
      setTimeout(() => {
        clearTimeout(timeout);
        if (process.pid) {
          resolve(process);
        } else {
          reject(new Error('Xephyr failed to start - no PID'));
        }
      }, 500);
    });
  }

  private async _loadVisionConfig(): Promise<any> {
    try {
      const mod = await import('../index.js');
      const loader = (mod as any).loadVisionConfig;
      if (typeof loader === 'function') {
        return await loader();
      }
    } catch {
      // Ignore loading errors; caller will fall back to defaults
    }
    return {};
  }

  private async spawnWindowManager(
    display: string,
    windowManager: string,
    fallbackChain?: ('evilwm' | 'matchbox' | 'openbox' | 'none')[]
  ): Promise<{ process: ChildProcess; pid: number }> {
    const wmCommands: Record<string, string> = {
      evilwm: 'evilwm',
      matchbox: 'matchbox-window-manager',
      openbox: 'openbox',
    };
    // Build candidate list: explicit windowManager first, then fallbacks
    const candidates: string[] = [];
    if (windowManager) candidates.push(windowManager);
    if (fallbackChain && Array.isArray(fallbackChain)) {
      for (const c of fallbackChain) {
        if (c && !candidates.includes(c)) candidates.push(c);
      }
    }

    for (const wm of candidates) {
      const command = wmCommands[wm];
      if (!command) continue;
      try {
        const wmProcess = spawn(command, [], {
          detached: true,
          stdio: 'ignore',
          env: { ...globalThis.process.env, DISPLAY: display },
        });

        wmProcess.unref();

        await new Promise(r => setTimeout(r, 300));

        if (!wmProcess.pid) {
          throw new Error(`Window manager ${wm} failed to start`);
        }

        return { process: wmProcess, pid: wmProcess.pid };
      } catch (err) {
        // Try next candidate in the chain
        console.log(`Window manager ${wm} failed to start: ${ (err as any).message ?? err }`);
      }
    }
    throw new Error('No window manager started');
  }

  async runInSession(sessionId: string, command: string, appName?: string): Promise<RunInSessionResult> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    if (session.state !== 'running') {
      throw new Error(`Session is not running (state: ${session.state})`);
    }

    const child = spawn('sh', ['-c', command], {
      detached: true,
      stdio: 'ignore',
      env: { ...process.env, DISPLAY: session.display },
    });

    child.unref();

    if (!child.pid) {
      throw new Error('Failed to spawn command in session');
    }

    session.appPids.push(child.pid);
    // Track named apps if provided
    if (appName) {
      if (!session.namedApps) {
        session.namedApps = new Map<string, NamedAppInfo>();
      }
      (session.namedApps as Map<string, NamedAppInfo>).set(appName, {
        name: appName,
        pid: child.pid,
        command,
        startedAt: new Date(),
      } as NamedAppInfo);
    }

    return {
      pid: child.pid,
      command,
    };
  }

  // Run a previously registered named app by alias
  async runNamedApp(sessionId: string, name: string, command: string): Promise<RunInSessionResult> {
    return this.runInSession(sessionId, command, name);
  }

  // Kill a named app by its alias
  async killAppByName(sessionId: string, name: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error(`Session not found: ${sessionId}`);
    const app = session.namedApps?.get(name);
    if (!app || app.pid == null) {
      throw new Error(`Named app '${name}' not found in session ${sessionId}`);
    }
    if (isProcessRunning(app.pid)) {
      await killProcessTree(app.pid);
    }
    session.namedApps?.delete(name);
  }

  // Get status for a named app
  async getAppStatus(sessionId: string, name: string): Promise<{ running: boolean; pid: number | null }> {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error(`Session not found: ${sessionId}`);
    const app = session.namedApps?.get(name);
    if (!app) return { running: false, pid: null };
    const pid = app.pid ?? null;
    const running = pid != null && isProcessRunning(pid);
    return { running, pid };
  }

  async killAppInSession(sessionId: string, pid: number): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    const pidIndex = session.appPids.indexOf(pid);
    if (pidIndex === -1) {
      throw new Error(`PID ${pid} not found in session ${sessionId}`);
    }

    if (isProcessRunning(pid)) {
      await killProcessTree(pid);
    }

    session.appPids.splice(pidIndex, 1);
  }

  async clearApps(sessionId: string): Promise<number> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    const killedCount = session.appPids.length;
    
    for (const pid of [...session.appPids]) {
      if (isProcessRunning(pid)) {
        await killProcessTree(pid);
      }
    }

    session.appPids = [];
    // Also clear named apps tracking
    session.namedApps?.clear();
    return killedCount;
  }

  async listWindows(sessionId: string): Promise<NestedWindowInfo[]> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    try {
      const { stdout } = await execInDisplay(
        session.display,
        'xdotool search --onlyvisible "." 2>/dev/null'
      );

      const windowIds = stdout.trim().split('\n').filter(Boolean);
      const windows: NestedWindowInfo[] = [];

      for (const id of windowIds) {
        try {
          const [nameResult, classResult] = await Promise.all([
            execInDisplay(session.display, `xdotool getwindowname ${id} 2>/dev/null || echo ""`),
            execInDisplay(session.display, `xdotool getwindowclassname ${id} 2>/dev/null || echo ""`),
          ]);

          const name = nameResult.stdout.trim();
          const className = classResult.stdout.trim();

          if (name || className) {
            windows.push({
              id: id.trim(),
              name: name || '(unnamed)',
              className: className || '(no class)',
            });
          }
        } catch {
          // Skip windows we can't query
        }
      }

      return windows;
    } catch (error) {
      return [];
    }
  }

  async waitForWindow(sessionId: string, options: WaitForWindowOptions): Promise<NestedWindowInfo> {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error(`Session not found: ${sessionId}`);

    const timeout = (options?.timeout_ms ?? 10000) as number;
    const interval = (options?.poll_interval_ms ?? 200) as number;
    const namePattern = options?.window_name_pattern?.toLowerCase?.() ?? null;
    const classPattern = options?.window_class_pattern?.toLowerCase?.() ?? null;

    const start = Date.now();
    while (Date.now() - start < timeout) {
      const windows = await this.listWindows(sessionId);
      const found = windows.find(w => {
        const n = (w.name || '').toLowerCase();
        const c = (w.className || '').toLowerCase();
        const matchName = namePattern ? n.includes(namePattern) : true;
        const matchClass = classPattern ? c.includes(classPattern) : true;
        return matchName && matchClass;
      });
      if (found) return found;
      await new Promise(r => setTimeout(r, interval));
    }
    throw new Error('waitForWindow timeout');
  }

  async captureWindow(
    sessionId: string,
    windowClass?: string,
    windowName?: string
  ): Promise<CaptureNestedResult> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    let windowId: string | undefined;

    if (windowClass || windowName) {
      // Find specific window
      const searchCmd = windowClass
        ? `xdotool search --onlyvisible --class "${windowClass}" | head -1`
        : `xdotool search --onlyvisible --name "${windowName}" | head -1`;

      try {
        const { stdout } = await execInDisplay(session.display, searchCmd);
        windowId = stdout.trim();
      } catch {
        // Fall through to root capture
      }
    }

    const fs = await import('fs/promises');
    const tmpXwd = `/tmp/nested-capture-${Date.now()}.xwd`;
    const tmpPng = `/tmp/nested-capture-${Date.now()}.png`;

    try {
      const captureCmd = windowId
        ? `xwd -display ${session.display} -id ${windowId} -out ${tmpXwd}`
        : `xwd -display ${session.display} -root -out ${tmpXwd}`;

      await execInDisplay(session.display, captureCmd);
      await execInDisplay(session.display, `ffmpeg -y -i ${tmpXwd} ${tmpPng} 2>/dev/null`);

      const imageBuffer = await fs.readFile(tmpPng);
      const base64 = `data:image/png;base64,${imageBuffer.toString('base64')}`;

      let capturedWindowName = '';
      let capturedWindowClass = '';
      if (windowId) {
        try {
          const [nameResult, classResult] = await Promise.all([
            execInDisplay(session.display, `xdotool getwindowname ${windowId} 2>/dev/null || echo ""`),
            execInDisplay(session.display, `xdotool getwindowclassname ${windowId} 2>/dev/null || echo ""`),
          ]);
          capturedWindowName = nameResult.stdout.trim();
          capturedWindowClass = classResult.stdout.trim();
        } catch {
          // Ignore
        }
      }

      await fs.unlink(tmpXwd).catch(() => {});
      await fs.unlink(tmpPng).catch(() => {});

      return {
        base64,
        windowId,
        windowName: capturedWindowName || undefined,
        windowClass: capturedWindowClass || undefined,
      };
    } catch (error) {
      await fs.unlink(tmpXwd).catch(() => {});
      await fs.unlink(tmpPng).catch(() => {});
      throw error;
    }
  }

  async stopSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    session.state = 'stopping';

    // Kill app processes first
    for (const pid of session.appPids) {
      if (isProcessRunning(pid)) {
        await killProcessTree(pid);
      }
    }

    // Kill window manager
    if (session.wmPid && isProcessRunning(session.wmPid)) {
      await killProcessTree(session.wmPid);
    }

    // Kill Xephyr last
    if (isProcessRunning(session.xephyrPid)) {
      await killProcessTree(session.xephyrPid);
    }

    session.state = 'stopped';
    this.sessions.delete(sessionId);
    this.displayToSession.delete(session.displayNumber);
  }

  getSession(sessionId: string): SessionInfo | undefined {
    return this.sessions.get(sessionId);
  }

  listSessions(): SessionInfo[] {
    return Array.from(this.sessions.values());
  }

  async stopAllSessions(): Promise<void> {
    const stopPromises = Array.from(this.sessions.keys()).map(id =>
      this.stopSession(id).catch(err => {
        console.error(`Failed to stop session ${id}:`, err);
      })
    );
    await Promise.all(stopPromises);
  }

  hasActiveSessions(): boolean {
    return this.sessions.size > 0;
  }
}

// Singleton instance
let instance: NestedSessionManager | null = null;

export function getNestedSessionManager(): NestedSessionManager {
  if (!instance) {
    instance = new NestedSessionManager();
  }
  return instance;
}

export { NestedSessionManager };
