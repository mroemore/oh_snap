/**
 * X server backend interface and supporting types.
 *
 * Defines the abstraction layer for pluggable X server backends (Xvfb, Xdummy, Xephyr),
 * replacing the hardcoded Xephyr-only approach.
 */

import { spawn, execSync, type ChildProcess } from 'child_process';
import * as fs from 'fs/promises';
import { waitForDisplay, killProcessTree } from './process-utils.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Supported X server backend identifiers.
 */
export type XServerBackendName = 'xvfb' | 'xdummy' | 'xephyr';

/**
 * Metadata describing an X server backend.
 */
export interface XServerBackendInfo {
  /** Backend identifier */
  name: XServerBackendName;
  /** Binary name (e.g. 'Xvfb', 'Xdummy', 'Xephyr') */
  binary: string;
  /** Whether the binary is currently available on PATH */
  available: boolean;
  /** Human-readable description */
  description: string;
}

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

/**
 * Contract that every X server backend implementation must satisfy.
 *
 * Implementations are responsible for:
 * - Checking binary availability
 * - Building the correct argument list for their X server
 * - Spawning the process with detached / stdio-ignored semantics
 * - Waiting for the display to become ready before returning
 * - Cleaning up the process tree and any temporary files on shutdown
 */
export interface XServerBackend {
  /** Backend identifier (e.g. 'xvfb', 'xdummy', 'xephyr') */
  readonly name: XServerBackendName;

  /** Binary name to execute (e.g. 'Xvfb', 'Xdummy', 'Xephyr') */
  readonly binary: string;

  /**
   * Check whether this backend's binary is available on the current PATH.
   */
  isAvailable(): Promise<boolean>;

  /**
   * Return the argument list needed to launch this X server for the given
   * display dimensions.
   *
   * The returned array does NOT include the binary itself or the display
   * number (`:N`); those are prepended by the spawn logic.
   *
   * @param displayNumber - The display number (e.g. 99 → `:99`)
   * @param width - Desired screen width in pixels
   * @param height - Desired screen height in pixels
   * @returns Array of CLI arguments (without binary or display number)
   */
  getDefaultArgs(displayNumber: number, width: number, height: number): string[];

  /**
   * Launch the X server process and wait for the display to become ready.
   *
   * Follows the same spawn pattern used by the existing Xephyr code:
   *   1. `spawn(binary, args, { detached: true, stdio: 'ignore' })`
   *   2. `process.unref()`
   *   3. Brief wait for the process to start
   *   4. `waitForDisplay()` to verify readiness
   *
   * @param displayNumber - The display number (e.g. 99 → `:99`)
   * @param width - Desired screen width in pixels
   * @param height - Desired screen height in pixels
   * @returns The spawned ChildProcess (already unref'd)
   */
  spawn(
    displayNumber: number,
    width: number,
    height: number
  ): Promise<ChildProcess>;

  /**
   * Stop the X server process and clean up any temporary files.
   *
   * @param process - The ChildProcess returned by `spawn()`
   * @param displayNumber - The display number that was used
   */
  cleanup(process: ChildProcess, displayNumber: number): Promise<void>;
}

// ---------------------------------------------------------------------------
// Xvfb Backend Implementation
// ---------------------------------------------------------------------------

/**
 * Xvfb (X Virtual Framebuffer) backend implementation.
 *
 * Xvfb is a headless X server that performs all graphical operations in memory
 * without showing any screen output. It is the recommended primary backend for
 * automated screenshot capture because it requires no physical display and is
 * bundled with `xorg-server` on most Linux distributions.
 *
 * Package names:
 * - Debian/Ubuntu: `xvfb`
 * - Fedora/Arch: `xorg-x11-server-Xvfb`
 *
 * Example spawn command for a 1024x768 session:
 *   Xvfb :99 -screen 0 1024x768x24
 */
export class XvfbBackend implements XServerBackend {
  readonly name: XServerBackendName = 'xvfb';
  readonly binary: string = 'Xvfb';

  /**
   * Check whether the `Xvfb` binary is available on the current PATH.
   */
  async isAvailable(): Promise<boolean> {
    try {
      execSync('which Xvfb', { timeout: 1000 });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Return the argument list for Xvfb.
   *
   * Xvfb uses the `-screen` flag to define a virtual screen:
   *   `-screen <screen-num> <width>x<height>x<depth>`
   *
   * @param _displayNumber - Not used by Xvfb args (display number is prepended separately)
   * @param width - Desired screen width in pixels
   * @param height - Desired screen height in pixels
   * @returns Array of CLI arguments
   */
  getDefaultArgs(
    _displayNumber: number,
    width: number,
    height: number
  ): string[] {
    return ['-screen', '0', `${width}x${height}x24`];
  }

  /**
   * Launch Xvfb and wait for the display to become ready.
   *
   * Follows the same spawn pattern as the existing Xephyr code:
   *   1. `spawn(binary, args, { detached: true, stdio: 'ignore' })`
   *   2. `process.unref()`
   *   3. 500ms wait with PID verification
   *   4. `waitForDisplay()` to confirm the X server is accepting connections
   */
  async spawn(
    displayNumber: number,
    width: number,
    height: number
  ): Promise<ChildProcess> {
    const args = [`:${displayNumber}`, ...this.getDefaultArgs(displayNumber, width, height)];

    const proc = spawn(this.binary, args, {
      detached: true,
      stdio: 'ignore',
    });

    proc.unref();

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Xvfb failed to start within timeout'));
      }, 5000);

      proc.on('error', (err) => {
        clearTimeout(timeout);
        reject(err);
      });

      setTimeout(async () => {
        clearTimeout(timeout);
        if (!proc.pid) {
          reject(new Error('Xvfb failed to start — no PID'));
          return;
        }
        try {
          await waitForDisplay(displayNumber);
          resolve(proc);
        } catch (err) {
          reject(err);
        }
      }, 500);
    });
  }

  /**
   * Stop the Xvfb process tree.
   */
  async cleanup(process: ChildProcess, _displayNumber: number): Promise<void> {
    if (process.pid) {
      await killProcessTree(process.pid);
    }
  }
}

// ---------------------------------------------------------------------------
// Xdummy Backend Implementation
// ---------------------------------------------------------------------------

/**
 * Xdummy backend implementation — Xorg with the `dummy` video driver.
 *
 * Xdummy uses the standard `Xorg` server together with the `xf86-video-dummy`
 * driver to create a virtual display. Unlike Xvfb (which renders entirely in
 * memory), Xdummy presents a real X server that can be used by applications
 * that require hardware-accelerated GLX or DRI support.
 *
 * **Opt-in backend**: requires the `xf86-video-dummy` driver package to be
 * installed on the host system.
 *
 * Package names:
 * - Debian/Ubuntu: `xserver-xorg-video-dummy`
 * - Fedora/Arch:   `xf86-video-dummy`
 *
 * This backend **bundles its own xorg.conf** generated per-session and written
 * to `/tmp/oh-snap-xdummy-${displayNumber}.conf`. The temporary config is
 * created before spawning Xorg and deleted during cleanup.
 *
 * Example spawn command for a 1024x768 session:
 *   Xorg :99 -config /tmp/oh-snap-xdummy-99.conf -noreset -nolisten tcp
 */
export class XdummyBackend implements XServerBackend {
  readonly name: XServerBackendName = 'xdummy';
  readonly binary: string = 'Xorg';

  /**
   * Check whether the `Xorg` binary is available on the current PATH.
   *
   * This is a **soft check**: it only verifies that `Xorg` is on PATH.
   * It does NOT probe for the `dummy` driver itself. If Xorg is present
   * but the `xf86-video-dummy` package is not installed, `spawn()` will
   * fail with a driver error. Users should ensure the driver is installed
   * before selecting this backend.
   */
  async isAvailable(): Promise<boolean> {
    try {
      execSync('which Xorg', { timeout: 1000 });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Return the argument list for Xorg with the dummy driver.
   *
   * The `-config` flag points to the per-session xorg.conf generated by
   * `generateDummyConf()`. `-noreset` keeps the server alive after the
   * last client disconnects, and `-nolisten tcp` disables TCP listening
   * for security.
   *
   * @param displayNumber - The display number (used to build the config path)
   * @param _width - Not used here (dimensions are baked into the config file)
   * @param _height - Not used here (dimensions are baked into the config file)
   * @returns Array of CLI arguments
   */
  getDefaultArgs(
    displayNumber: number,
    _width: number,
    _height: number
  ): string[] {
    return [
      '-config',
      `/tmp/oh-snap-xdummy-${displayNumber}.conf`,
      '-noreset',
      '-nolisten',
      'tcp',
    ];
  }

  /**
   * Generate the contents of an xorg.conf file for the dummy driver.
   *
   * Produces a minimal config with a single Device (dummy driver), Monitor,
   * and Screen section. The requested width and height are used to build a
   * ModeLine and the Modes list.
   *
   * @param width - Desired screen width in pixels
   * @param height - Desired screen height in pixels
   * @returns The full xorg.conf text
   */
  private generateDummyConf(width: number, height: number): string {
    const modeName = `${width}x${height}`;

    // Compute a reasonable ModeLine using a simplified CVT approximation.
    // Pixel clock (MHz) ≈ w * h * 60 / 1_000_000, rounded.
    const pixelClock = Math.round((width * height * 60) / 1_000_000 * 1000) / 1000;
    const hBlank = Math.round(width * 0.2);
    const vBlank = Math.round(height * 0.05);
    const hTotal = width + hBlank;
    const vTotal = height + vBlank;
    const hSyncStart = width + Math.round(hBlank * 0.25);
    const hSyncEnd = width + Math.round(hBlank * 0.75);
    const vSyncStart = height + Math.round(vBlank * 0.25);
    const vSyncEnd = height + Math.round(vBlank * 0.75);

    return [
      `Section "Device"`,
      `    Identifier  "DummyDevice"`,
      `    Driver      "dummy"`,
      `    VideoRam    256000`,
      `EndSection`,
      ``,
      `Section "Monitor"`,
      `    Identifier  "DummyMonitor"`,
      `    HorizSync   28.0-80.0`,
      `    VertRefresh 50.0-75.0`,
      `    ModeLine    "${modeName}" ${pixelClock} ${width} ${hSyncStart} ${hSyncEnd} ${hTotal} ${height} ${vSyncStart} ${vSyncEnd} ${vTotal}`,
      `EndSection`,
      ``,
      `Section "Screen"`,
      `    Identifier  "DummyScreen"`,
      `    Device      "DummyDevice"`,
      `    Monitor     "DummyMonitor"`,
      `    DefaultDepth 24`,
      `    SubSection "Display"`,
      `        Depth    24`,
      `        Modes    "${modeName}"`,
      `    EndSubSection`,
      `EndSection`,
      ``,
    ].join('\n');
  }

  /**
   * Launch Xorg with the dummy driver and wait for the display to become ready.
   *
   * Steps:
   *   1. Generate the xorg.conf for the requested dimensions
   *   2. Write the conf to `/tmp/oh-snap-xdummy-${displayNumber}.conf`
   *   3. Spawn Xorg with the config file
   *   4. Wait 500 ms, verify PID
   *   5. Call `waitForDisplay()` to verify readiness
   *   6. Return the process
   *
   * If the conf write fails, the X server is NOT spawned.
   */
  async spawn(
    displayNumber: number,
    width: number,
    height: number
  ): Promise<ChildProcess> {
    // Step 1 & 2: Generate and write the config file BEFORE spawning.
    const confPath = `/tmp/oh-snap-xdummy-${displayNumber}.conf`;
    const confContent = this.generateDummyConf(width, height);
    await fs.writeFile(confPath, confContent, 'utf8');

    // Step 3: Spawn Xorg.
    const args = [`:${displayNumber}`, ...this.getDefaultArgs(displayNumber, width, height)];

    const proc = spawn(this.binary, args, {
      detached: true,
      stdio: 'ignore',
    });

    proc.unref();

    // Steps 4 & 5: Wait, verify PID, then check display readiness.
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Xorg (dummy) failed to start within timeout'));
      }, 5000);

      proc.on('error', (err) => {
        clearTimeout(timeout);
        reject(err);
      });

      setTimeout(async () => {
        clearTimeout(timeout);
        if (!proc.pid) {
          reject(new Error('Xorg (dummy) failed to start — no PID'));
          return;
        }
        try {
          await waitForDisplay(displayNumber);
          resolve(proc);
        } catch (err) {
          reject(err);
        }
      }, 500);
    });
  }

  /**
   * Stop the Xorg process tree and delete the temporary config file.
   *
   * The config file deletion uses `.catch(() => {})` so that an already-
   * deleted or missing file does not cause the cleanup to throw.
   */
  async cleanup(process: ChildProcess, displayNumber: number): Promise<void> {
    if (process.pid) {
      await killProcessTree(process.pid);
    }
    const confPath = `/tmp/oh-snap-xdummy-${displayNumber}.conf`;
    await fs.unlink(confPath).catch(() => {});
  }
}

// ---------------------------------------------------------------------------
// Xephyr Backend Implementation
// ---------------------------------------------------------------------------

/**
 * Xephyr backend implementation — the fallback for interactive debugging.
 *
 * Xephyr is a nested X server that displays a window on the host screen,
 * making it useful for interactive debugging and visual inspection of
 * screenshot sessions. It is heavier than headless alternatives (Xvfb,
 * Xdummy) because it requires a running host display.
 *
 * Package names:
 * - Debian/Ubuntu: `xephyr`
 * - Fedora/Arch: `xorg-x11-server-Xephyr`
 *
 * Example spawn command for a 1024x768 session:
 *   Xephyr :99 -screen 1024x768 -ac -br -noreset -no-host-grab +extension RANDR +extension COMPOSITE
 */
export class XephyrBackend implements XServerBackend {
  readonly name: XServerBackendName = 'xephyr';
  readonly binary: string = 'Xephyr';

  /**
   * Check whether the `Xephyr` binary is available on the current PATH.
   */
  async isAvailable(): Promise<boolean> {
    try {
      execSync('which Xephyr', { timeout: 1000 });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Return the argument list for Xephyr.
   *
   * Matches the exact argument list from the legacy `spawnXephyr()` method
   * in `session-manager.ts` to preserve backward compatibility.
   *
   * @param _displayNumber - Not used here (display number is prepended separately)
   * @param width - Desired screen width in pixels
   * @param height - Desired screen height in pixels
   * @returns Array of CLI arguments
   */
  getDefaultArgs(
    _displayNumber: number,
    width: number,
    height: number
  ): string[] {
    return [
      '-screen', `${width}x${height}`,
      '-ac',
      '-br',
      '-noreset',
      '-no-host-grab',
      '+extension', 'RANDR',
      '+extension', 'COMPOSITE',
    ];
  }

  /**
   * Launch Xephyr and wait for the display to become ready.
   *
   * Follows the same spawn pattern as the existing Xephyr code:
   *   1. `spawn(binary, args, { detached: true, stdio: 'ignore' })`
   *   2. `process.unref()`
   *   3. 500ms wait with PID verification
   *   4. `waitForDisplay()` to confirm the X server is accepting connections
   */
  async spawn(
    displayNumber: number,
    width: number,
    height: number
  ): Promise<ChildProcess> {
    const args = [`:${displayNumber}`, ...this.getDefaultArgs(displayNumber, width, height)];

    const proc = spawn(this.binary, args, {
      detached: true,
      stdio: 'ignore',
    });

    proc.unref();

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Xephyr failed to start within timeout'));
      }, 5000);

      proc.on('error', (err) => {
        clearTimeout(timeout);
        reject(err);
      });

      setTimeout(async () => {
        clearTimeout(timeout);
        if (!proc.pid) {
          reject(new Error('Xephyr failed to start — no PID'));
          return;
        }
        try {
          await waitForDisplay(displayNumber);
          resolve(proc);
        } catch (err) {
          reject(err);
        }
      }, 500);
    });
  }

  /**
   * Stop the Xephyr process tree.
   */
  async cleanup(process: ChildProcess, _displayNumber: number): Promise<void> {
    if (process.pid) {
      await killProcessTree(process.pid);
    }
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Consumer-facing entry point that selects among Xvfb, Xdummy, and Xephyr
 * backends based on a configurable priority list.
 *
 * The factory is constructed once per session-manager instance and reused for
 * all sessions. Callers provide an ordered priority array (default:
 * `['xvfb', 'xephyr']`); `autoSelect()` walks that list and returns the first
 * backend whose binary is available on the current PATH.
 *
 * Typical usage:
 *   const factory = new XServerBackendFactory();            // default priority
 *   const backend = await factory.autoSelect();             // pick best available
 *   const proc = await backend.spawn(99, 1024, 768);        // launch X server
 */
export class XServerBackendFactory {
  private readonly priority: XServerBackendName[];
  private readonly backends: Map<XServerBackendName, XServerBackend>;

  private static readonly VALID_NAMES: ReadonlySet<XServerBackendName> = new Set([
    'xvfb',
    'xdummy',
    'xephyr',
  ]);

  private static readonly DESCRIPTIONS: ReadonlyMap<XServerBackendName, string> = new Map([
    ['xvfb', 'Headless X server using Xvfb (recommended)'],
    ['xdummy', 'Headless X server using Xorg with dummy driver (opt-in)'],
    ['xephyr', 'Visible nested X server (fallback for debugging)'],
  ]);

  /**
   * Create a new factory.
   *
   * @param priority - Ordered list of backend identifiers to try in
   *   `autoSelect()`. Defaults to `['xvfb', 'xephyr']`.
   * @throws Error if the array contains unknown backend names.
   */
  constructor(priority: XServerBackendName[] = ['xvfb', 'xephyr']) {
    // Validate: deduplicate
    const deduped = [...new Set(priority)];
    if (deduped.length !== priority.length) {
      throw new Error(
        `XServerBackendFactory: priority list contains duplicates: [${priority.join(', ')}]`
      );
    }

    // Validate: all names must be known
    for (const name of deduped) {
      if (!XServerBackendFactory.VALID_NAMES.has(name)) {
        throw new Error(
          `XServerBackendFactory: unknown backend name "${name}". Valid names: ${[...XServerBackendFactory.VALID_NAMES].join(', ')}`
        );
      }
    }

    this.priority = [...deduped];

    // Instantiate and index the three concrete backends.
    this.backends = new Map<XServerBackendName, XServerBackend>();
    this.backends.set('xvfb', new XvfbBackend());
    this.backends.set('xdummy', new XdummyBackend());
    this.backends.set('xephyr', new XephyrBackend());
  }

  /**
   * Walk the priority list and return the first backend whose binary is
   * currently available on PATH.
   *
   * @returns The first available backend.
   * @throws Error with a detailed diagnostic message if no backend in the
   *   priority list is available.
   */
  async autoSelect(): Promise<XServerBackend> {
    const results: Array<{ name: XServerBackendName; available: boolean }> = [];

    for (const name of this.priority) {
      const backend = this.backends.get(name)!;
      const available = await backend.isAvailable();
      results.push({ name, available });
      if (available) {
        return backend;
      }
    }

    // None available — build a helpful error message.
    const probeDetails = results
      .map((r) => `  - ${r.name}: ${r.available ? 'available' : 'NOT available'}`)
      .join('\n');

    const installHints = [
      'Install xvfb (recommended):',
      '  Debian/Ubuntu: sudo apt install xvfb',
      '  Fedora:        sudo dnf install xorg-x11-server-Xvfb',
      '  Arch:          sudo pacman -S xorg-server-xvfb',
      '',
      'Or change the x_server_priority config to include a backend you have installed.',
    ].join('\n');

    throw new Error(
      `No X server backend available. Priority list: [${this.priority.join(', ')}]\n\n` +
        `Probed backends:\n${probeDetails}\n\n` +
        `${installHints}`
    );
  }

  /**
   * Return the named backend from the internal map.
   *
   * @param name - Backend identifier.
   * @returns The requested backend.
   * @throws Error if the name is not a known backend identifier.
   */
  select(name: XServerBackendName): XServerBackend {
    const backend = this.backends.get(name);
    if (!backend) {
      throw new Error(
        `XServerBackendFactory.select: unknown backend "${name}". Valid names: ${[...XServerBackendFactory.VALID_NAMES].join(', ')}`
      );
    }
    return backend;
  }

  /**
   * Return metadata for ALL three backends (xvfb, xdummy, xephyr) regardless
   * of the configured priority, with `available` reflecting the current
   * `isAvailable()` check.
   *
   * @returns Array of backend info objects.
   */
  async listAvailable(): Promise<XServerBackendInfo[]> {
    const allNames: XServerBackendName[] = ['xvfb', 'xdummy', 'xephyr'];
    const results: XServerBackendInfo[] = [];

    for (const name of allNames) {
      const backend = this.backends.get(name)!;
      results.push({
        name,
        binary: backend.binary,
        available: await backend.isAvailable(),
        description: XServerBackendFactory.DESCRIPTIONS.get(name)!,
      });
    }

    return results;
  }

  /**
   * Return a copy of the configured priority array.
   *
   * @returns A new array with the same elements as the internal priority list.
   */
  getPriority(): XServerBackendName[] {
    return [...this.priority];
  }
}
