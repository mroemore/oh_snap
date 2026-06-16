/**
 * Tests for DisplayManager, NativeBackend, and XvfbBackend.
 *
 * Architecture:
 * - Unit tests cover pure logic (no shell commands needed)
 * - Integration tests exercise real Xvfb (skipped if not installed)
 * - XvfbBackend.initialize() is tested only via integration tests
 *   (avoids fragile child_process mocking with ESM + promisify)
 */

import { describe, it, expect } from '@jest/globals';

// Use static imports — no module mocking needed
import { execSync } from 'child_process';
import {
  NativeBackend,
  XvfbBackend,
  DisplayManager,
  setDisplayManager,
  getDisplayManager,
  isVirtualDisplayActive,
} from '../src/display-manager.js';

// ─── NativeBackend ───────────────────────────────────────────────────

describe('NativeBackend', () => {
  const DEFAULT_DISPLAY = ':0';

  it('stores the current DISPLAY', () => {
    const orig = process.env.DISPLAY;
    process.env.DISPLAY = DEFAULT_DISPLAY;
    const b = new NativeBackend();
    expect(b.getOriginalDisplay()).toBe(DEFAULT_DISPLAY);
    process.env.DISPLAY = orig;
  });

  it('isVirtual() returns false', () => {
    expect(new NativeBackend().isVirtual()).toBe(false);
  });

  it('initialize() does nothing', async () => {
    await expect(new NativeBackend().initialize()).resolves.toBeUndefined();
  });

  it('shutdown() does nothing', async () => {
    await expect(new NativeBackend().shutdown()).resolves.toBeUndefined();
  });

  it('getDisplay() returns current env DISPLAY', () => {
    const orig = process.env.DISPLAY;
    process.env.DISPLAY = ':7';
    expect(new NativeBackend().getDisplay()).toBe(':7');
    process.env.DISPLAY = orig;
  });
});

// ─── XvfbBackend — constructor / properties (no init) ──────────────

describe('XvfbBackend (pre-init state)', () => {
  it('stores original DISPLAY from constructor time', () => {
    const orig = process.env.DISPLAY;
    process.env.DISPLAY = ':9';
    const b = new XvfbBackend();
    expect(b.getOriginalDisplay()).toBe(':9');
    process.env.DISPLAY = orig;
  });

  it('isVirtual() returns false before initialize()', () => {
    expect(new XvfbBackend().isVirtual()).toBe(false);
  });

  it('getDisplay() returns undefined before initialize()', () => {
    expect(new XvfbBackend().getDisplay()).toBeUndefined();
  });

  it('isRunning() returns false before initialize()', () => {
    expect(new XvfbBackend().isRunning()).toBe(false);
  });

  it('stores config values from constructor', () => {
    const b = new XvfbBackend({
      displayNumber: 42,
      width: 1280,
      height: 720,
      depth: 16,
    });
    expect(b.getDisplayNumber()).toBe(42);
    // These aren't exposed via getters, so just verify getOriginalDisplay works
    expect(b.getOriginalDisplay()).toBe(process.env.DISPLAY);
  });
});

// ─── DisplayManager ─────────────────────────────────────────────────

describe('DisplayManager', () => {
  it('does not set DISPLAY when using native backend', async () => {
    const orig = process.env.DISPLAY;
    process.env.DISPLAY = ':0';

    const manager = new DisplayManager(new NativeBackend());
    await manager.initialize();

    expect(process.env.DISPLAY).toBe(':0');
    expect(manager.isVirtual()).toBe(false);
    expect(manager.getDisplay()).toBe(':0');

    process.env.DISPLAY = orig;
  });

  it('getOriginalDisplay works', () => {
    const orig = process.env.DISPLAY;
    process.env.DISPLAY = ':11';
    const manager = new DisplayManager(new NativeBackend());
    expect(manager.getOriginalDisplay()).toBe(':11');
    process.env.DISPLAY = orig;
  });

  it('singleton set/get functions work', () => {
    const m1 = new DisplayManager(new NativeBackend());
    setDisplayManager(m1);
    expect(getDisplayManager()).toBe(m1);
    expect(isVirtualDisplayActive()).toBe(false);
  });
});

// ─── Integration tests (require real Xvfb) ─────────────────────────

describe('XvfbBackend integration (real Xvfb)', () => {
  const isInstalled = (() => {
    try {
      execSync('which Xvfb', { stdio: 'ignore' });
      return true;
    } catch {
      return false;
    }
  })();

  const itIf = isInstalled ? it : it.skip;

  itIf('starts Xvfb on specified display', async () => {
    const b = new XvfbBackend({
      displayNumber: 199,
      width: 640,
      height: 480,
    });
    try {
      await b.initialize();
      expect(b.isVirtual()).toBe(true);
      expect(b.isRunning()).toBe(true);

      const out = execSync(`xdpyinfo -display :199 2>/dev/null | grep dimensions`, {
        encoding: 'utf-8',
        timeout: 3000,
      });
      expect(out).toMatch(/640x480/);
    } finally {
      await b.shutdown();
    }
  }, 30000);

  itIf('manages lifecycle (start → running → shutdown)', async () => {
    const b = new XvfbBackend({
      displayNumber: 209,
      width: 800,
      height: 600,
    });

    // Start
    await b.initialize();
    expect(b.isRunning()).toBe(true);
    expect(b.getDisplay()).toBe(':209');

    // Shutdown
    await b.shutdown();
    expect(b.isRunning()).toBe(false);
    expect(b.isVirtual()).toBe(false);
  }, 30000);
});
