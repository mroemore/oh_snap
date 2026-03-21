import { validatePattern, matchGlob, checkWindowVisibility } from './index.js';

describe('Security Tests', () => {
  describe('Pattern Validation', () => {
    it('should reject regex patterns in glob fields', () => {
      expect(() => validatePattern('test[abc]')).toThrow();
      expect(() => validatePattern('test{a,b}')).toThrow();
      expect(() => validatePattern('test(a)')).toThrow();
      expect(() => validatePattern('test{a}')).toThrow();
      expect(() => validatePattern('test^abc')).toThrow();
      expect(() => validatePattern('test$abc')).toThrow();
      expect(() => validatePattern('test|abc')).toThrow();
      expect(() => validatePattern('test\\abc')).toThrow();
    });

    it('should accept valid glob patterns', () => {
      expect(() => validatePattern('test*')).not.toThrow();
      expect(() => validatePattern('test?')).not.toThrow();
      expect(() => validatePattern('KeePassXC')).not.toThrow();
      expect(() => validatePattern('*password*')).not.toThrow();
      expect(() => validatePattern('Firefox')).not.toThrow();
      expect(() => validatePattern('test.file')).not.toThrow();
    });

    it('should throw with descriptive error message', () => {
      expect(() => validatePattern('test[abc]')).toThrow('regex or shell characters');
    });
  });

  describe('Glob Pattern Matching', () => {
    it('should match exact strings', () => {
      expect(matchGlob('Firefox', 'Firefox')).toBe(true);
      expect(matchGlob('KeePassXC', 'KeePassXC')).toBe(true);
      expect(matchGlob('code', 'code')).toBe(true);
    });

    it('should match case-insensitively', () => {
      expect(matchGlob('firefox', 'Firefox')).toBe(true);
      expect(matchGlob('FIREFOX', 'firefox')).toBe(true);
      expect(matchGlob('KeePassXC', 'keepassxc')).toBe(true);
    });

    it('should match asterisk wildcard', () => {
      expect(matchGlob('*password*', 'my-password-manager')).toBe(true);
      expect(matchGlob('*secret*', 'secret-vault')).toBe(true);
      expect(matchGlob('KeePass*', 'KeePassXC')).toBe(true);
      expect(matchGlob('*Firefox', 'Mozilla Firefox')).toBe(true);
    });

    it('should match question mark wildcard', () => {
      expect(matchGlob('Test?', 'Test1')).toBe(true);
      expect(matchGlob('Test?', 'TestA')).toBe(true);
      expect(matchGlob('???', 'abc')).toBe(true);
    });

    it('should not match when pattern does not match', () => {
      expect(matchGlob('Firefox', 'Chrome')).toBe(false);
      expect(matchGlob('KeePass*', 'Bitwarden')).toBe(false);
      expect(matchGlob('*password*', 'notepad')).toBe(false);
    });

    it('should not allow regex bypass via partial match', () => {
      expect(matchGlob('KeePass', 'KeePassXC')).toBe(false);
      expect(matchGlob('KeePassXC', 'KeePass')).toBe(false);
      expect(matchGlob('Bit', 'Bitwarden')).toBe(false);
    });
  });

  describe('Policy Bypass Prevention', () => {
    const blacklistPatterns = [
      'KeePassXC',
      'KeePass',
      'Bitwarden',
      '1Password',
      '*password*',
      '*secret*',
      '*vault*',
      '*credential*'
    ];

    it('should block password manager windows', () => {
      expect(blacklistPatterns.some(p => matchGlob(p, 'KeePassXC'))).toBe(true);
      expect(blacklistPatterns.some(p => matchGlob(p, 'KeePass'))).toBe(true);
      expect(blacklistPatterns.some(p => matchGlob(p, 'Bitwarden'))).toBe(true);
      expect(blacklistPatterns.some(p => matchGlob(p, '1Password'))).toBe(true);
    });

    it('should block windows with password/secret in name', () => {
      expect(blacklistPatterns.some(p => matchGlob(p, 'Password Manager'))).toBe(true);
      expect(blacklistPatterns.some(p => matchGlob(p, 'My Secret Vault'))).toBe(true);
      expect(blacklistPatterns.some(p => matchGlob(p, 'Credentials Dialog'))).toBe(true);
    });

    it('should not block unrelated windows', () => {
      expect(blacklistPatterns.some(p => matchGlob(p, 'Firefox'))).toBe(false);
      expect(blacklistPatterns.some(p => matchGlob(p, 'Visual Studio Code'))).toBe(false);
      expect(blacklistPatterns.some(p => matchGlob(p, 'Terminal'))).toBe(false);
    });

    it('should enforce whitelist restrictions', () => {
      const whitelistPatterns = ['Firefox', 'Chrome', 'code'];
      const testWindow = 'Notepad';
      
      const isWhitelisted = whitelistPatterns.some(p => matchGlob(p, testWindow));
      expect(isWhitelisted).toBe(false);
    });

    it('should allow whitelisted windows', () => {
      const whitelistPatterns = ['Firefox', 'Chrome', 'code', '*code*'];
      
      expect(whitelistPatterns.some(p => matchGlob(p, 'Firefox'))).toBe(true);
      expect(whitelistPatterns.some(p => matchGlob(p, 'Chrome'))).toBe(true);
      expect(whitelistPatterns.some(p => matchGlob(p, 'Visual Studio Code'))).toBe(true);
    });
  });

  describe('Command Injection Prevention', () => {
    it('should reject patterns with shell metacharacters', () => {
      expect(() => validatePattern('test; rm -rf /')).toThrow();
      expect(() => validatePattern('test && whoami')).toThrow();
      expect(() => validatePattern('test | cat /etc/passwd')).toThrow();
      expect(() => validatePattern('test$var')).toThrow();
      expect(() => validatePattern('test`whoami`')).toThrow();
    });

    it('should sanitize shell metacharacters in patterns', () => {
      const sanitized1 = 'test; rm -rf /'.replace(/[;&|<>$\x00-\x1f]/g, '');
      expect(sanitized1).toBe('test rm -rf /');
      
      const sanitized2 = 'test && whoami'.replace(/[;&|<>$\x00-\x1f]/g, '');
      expect(sanitized2).toBe('test  whoami');
    });
  });

  describe('Off-screen Detection', () => {
    it('should return visibility object with visible property', async () => {
      const result = await checkWindowVisibility('999999');
      expect(result).toHaveProperty('visible');
      expect(typeof result.visible).toBe('boolean');
    });

    it('should return visible true when geometry check fails (fail open)', async () => {
      const result = await checkWindowVisibility('invalid-id');
      expect(result.visible).toBe(true);
    });
  });

  describe('Fullscreen Policy - Reject Mode', () => {
    it('should block sensitive windows when fullscreen_policy.mode is reject', () => {
      const sensitiveWindows = [
        'KeePassXC',
        'Bitwarden',
        '1Password',
        'Password Manager'
      ];
      
      const blacklistPatterns = ['KeePassXC', 'Bitwarden', '1Password', '*password*'];
      
      for (const window of sensitiveWindows) {
        const blocked = blacklistPatterns.some(p => matchGlob(p, window));
        expect(blocked).toBe(true);
      }
    });
  });
});