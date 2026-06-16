import { XvfbBackend, XdummyBackend, XephyrBackend, XServerBackendFactory } from './xserver-backends.js';

// ---------------------------------------------------------------------------
// XvfbBackend
// ---------------------------------------------------------------------------

describe('XvfbBackend', () => {
  const backend = new XvfbBackend();

  describe('metadata', () => {
    it('should have name "xvfb"', () => {
      expect(backend.name).toBe('xvfb');
    });

    it('should have binary "Xvfb"', () => {
      expect(backend.binary).toBe('Xvfb');
    });
  });

  describe('isAvailable()', () => {
    it('should return true when Xvfb is on PATH', async () => {
      const available = await backend.isAvailable();
      expect(typeof available).toBe('boolean');
      // On this system Xvfb is installed, so expect true
      expect(available).toBe(true);
    });
  });

  describe('getDefaultArgs()', () => {
    it('should return the correct screen args for 1024x768', () => {
      const args = backend.getDefaultArgs(99, 1024, 768);
      expect(args).toEqual(['-screen', '0', '1024x768x24']);
    });

    it('should interpolate width and height correctly', () => {
      const args = backend.getDefaultArgs(0, 1920, 1080);
      expect(args).toEqual(['-screen', '0', '1920x1080x24']);
    });

    it('should not include the display number in the args', () => {
      const args = backend.getDefaultArgs(42, 800, 600);
      expect(args).not.toContain(':42');
      expect(args).not.toContain('42');
    });
  });
});

// ---------------------------------------------------------------------------
// XdummyBackend
// ---------------------------------------------------------------------------

describe('XdummyBackend', () => {
  const backend = new XdummyBackend();

  describe('metadata', () => {
    it('should have name "xdummy"', () => {
      expect(backend.name).toBe('xdummy');
    });

    it('should have binary "Xorg"', () => {
      expect(backend.binary).toBe('Xorg');
    });
  });

  describe('isAvailable()', () => {
    it('should return a boolean (soft check for Xorg on PATH)', async () => {
      const available = await backend.isAvailable();
      expect(typeof available).toBe('boolean');
      // On this system Xorg is installed, so expect true
      expect(available).toBe(true);
    });
  });

  describe('getDefaultArgs()', () => {
    it('should return the correct args including config path', () => {
      const args = backend.getDefaultArgs(99, 1024, 768);
      expect(args).toEqual([
        '-config',
        '/tmp/oh-snap-xdummy-99.conf',
        '-noreset',
        '-nolisten',
        'tcp',
      ]);
    });

    it('should embed the display number in the config path', () => {
      const args = backend.getDefaultArgs(42, 800, 600);
      expect(args[1]).toBe('/tmp/oh-snap-xdummy-42.conf');
    });

    it('should include -noreset and -nolisten tcp', () => {
      const args = backend.getDefaultArgs(0, 1024, 768);
      expect(args).toContain('-noreset');
      expect(args).toContain('-nolisten');
      expect(args).toContain('tcp');
    });
  });
});

// ---------------------------------------------------------------------------
// XephyrBackend
// ---------------------------------------------------------------------------

describe('XephyrBackend', () => {
  const backend = new XephyrBackend();

  describe('metadata', () => {
    it('should have name "xephyr"', () => {
      expect(backend.name).toBe('xephyr');
    });

    it('should have binary "Xephyr"', () => {
      expect(backend.binary).toBe('Xephyr');
    });
  });

  describe('isAvailable()', () => {
    it('should return true when Xephyr is on PATH', async () => {
      const available = await backend.isAvailable();
      expect(typeof available).toBe('boolean');
      // On this system Xephyr is installed, so expect true
      expect(available).toBe(true);
    });
  });

  describe('getDefaultArgs()', () => {
    it('should return the exact legacy arg list for 1024x768', () => {
      const args = backend.getDefaultArgs(99, 1024, 768);
      expect(args).toEqual([
        '-screen', '1024x768',
        '-ac',
        '-br',
        '-noreset',
        '-no-host-grab',
        '+extension', 'RANDR',
        '+extension', 'COMPOSITE',
      ]);
    });

    it('should interpolate width and height in the -screen arg', () => {
      const args = backend.getDefaultArgs(0, 1920, 1080);
      expect(args).toContain('1920x1080');
    });

    it('should include all legacy flags', () => {
      const args = backend.getDefaultArgs(0, 1024, 768);
      expect(args).toContain('-ac');
      expect(args).toContain('-br');
      expect(args).toContain('-noreset');
      expect(args).toContain('-no-host-grab');
      expect(args).toContain('+extension');
      expect(args).toContain('RANDR');
      expect(args).toContain('COMPOSITE');
    });

    it('should not include the display number in the args', () => {
      const args = backend.getDefaultArgs(42, 800, 600);
      expect(args).not.toContain(':42');
    });
  });
});

// ---------------------------------------------------------------------------
// XServerBackendFactory
// ---------------------------------------------------------------------------

describe('XServerBackendFactory', () => {
  describe('default priority', () => {
    it('should default to ["xvfb", "xephyr"]', () => {
      const factory = new XServerBackendFactory();
      expect(factory.getPriority()).toEqual(['xvfb', 'xephyr']);
    });
  });

  describe('custom priority', () => {
    it('should return the configured priority order', () => {
      const factory = new XServerBackendFactory(['xephyr', 'xvfb']);
      expect(factory.getPriority()).toEqual(['xephyr', 'xvfb']);
    });
  });

  describe('select()', () => {
    it('should return XvfbBackend for "xvfb"', () => {
      const factory = new XServerBackendFactory();
      const backend = factory.select('xvfb');
      expect(backend.name).toBe('xvfb');
      expect(backend).toBeInstanceOf(XvfbBackend);
    });

    it('should return XdummyBackend for "xdummy"', () => {
      const factory = new XServerBackendFactory();
      const backend = factory.select('xdummy');
      expect(backend.name).toBe('xdummy');
      expect(backend).toBeInstanceOf(XdummyBackend);
    });

    it('should return XephyrBackend for "xephyr"', () => {
      const factory = new XServerBackendFactory();
      const backend = factory.select('xephyr');
      expect(backend.name).toBe('xephyr');
      expect(backend).toBeInstanceOf(XephyrBackend);
    });

    it('should throw for an unknown backend name', () => {
      const factory = new XServerBackendFactory();
      expect(() => factory.select('unknown' as any)).toThrow();
    });
  });

  describe('listAvailable()', () => {
    it('should return an array of 3 backends (xvfb, xdummy, xephyr)', async () => {
      const factory = new XServerBackendFactory();
      const available = await factory.listAvailable();
      expect(available).toHaveLength(3);
      const names = available.map((b) => b.name);
      expect(names).toContain('xvfb');
      expect(names).toContain('xdummy');
      expect(names).toContain('xephyr');
    });
  });

  describe('autoSelect()', () => {
    it('should return the first available backend in priority order', async () => {
      const factory = new XServerBackendFactory(['xvfb', 'xephyr']);
      const backend = await factory.autoSelect();
      // Should be xvfb or xephyr, NOT xdummy (not in priority)
      expect(['xvfb', 'xephyr']).toContain(backend.name);
    });

    it('should throw when no backend in the priority list is available', async () => {
      // Construct with an empty priority list — autoSelect will find nothing available
      const factory = new XServerBackendFactory([]);
      await expect(factory.autoSelect()).rejects.toThrow();
    });

    it('should throw on unknown backend name in constructor', () => {
      expect(() => new XServerBackendFactory(['nonexistent_backend' as any])).toThrow();
    });
  });
});

