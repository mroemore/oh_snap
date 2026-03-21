# Security Policy

## Privacy-First Vision MCP

oh_snap is a privacy-conscious Vision MCP designed to protect sensitive information during screen capture operations.

## Window Capture Security

### Threat Model

**Primary Threat**: LLM agents with vision capabilities can capture screenshots containing sensitive information:
- Password managers (KeePassXC, Bitwarden, 1Password)
- Banking and financial applications
- Secret management tools (vaults, credential managers)
- Personal identifiable information (PII) in visible windows

**Attack Vector**: An LLM agent may attempt to capture windows or fullscreen screenshots to extract sensitive data, either intentionally (malicious prompt) or accidentally (overly broad capture requests).

### Defense in Depth

The server implements multiple security layers:

1. **Default Blacklist** - Blocks common password managers by default
2. **Configurable Whitelist** - Optional restrict mode for allowed windows only
3. **Glob Patterns Only** - No regex support (prevents ReDoS attacks)
4. **Off-Screen Detection** - Rejects captures of windows with negative coordinates
5. **Fullscreen Blur** - Automatically blurs sensitive windows in fullscreen captures
6. **Policy File Permissions** - Enforces chmod 600 on policy file
7. **Audit Logging** - All capture attempts logged for forensics

### Policy Configuration

Policy file: `~/.config/opencode/window-capture-policy.json`

**Important**: Policy changes require server restart to take effect.

See [README.md](README.md#window-capture-policy) for full configuration options.

### Pattern Security

**Why glob only?** Regex patterns can cause denial-of-service attacks (ReDoS). This server only supports glob patterns (`*` and `?`) which are safe and predictable.

**Rejected characters**: `(`, `)`, `[`, `]`, `{`, `}`, `^`, `$`, `+`, `|`, `\`

### Audit Logging

All capture attempts are logged to: `~/.local/share/oh_snap/capture-audit.log`

Log format (JSON lines):
```json
{"timestamp":"2025-03-21T10:30:00.000Z","action":"capture_window","windowId":"12345678","windowName":"Firefox","windowClass":"firefox","result":"success"}
{"timestamp":"2025-03-21T10:30:05.000Z","action":"policy_blocked","windowId":"12345679","windowName":"KeePassXC","windowClass":"KeePassXC","pattern":"KeePassXC","result":"blocked","reason":"blacklist"}
```

**Enable audit logging**:
```json
{
  "audit": {
    "log_captures": true
  }
}
```

### Known Limitations

1. **Policy Caching**: Policy is loaded on startup and cached. Restart the server to apply policy changes.
2. **Wayland Not Supported**: Window capture requires X11. Wayland users should use XWayland.
3. **Partial Name Matching**: Blacklist patterns match substrings. Use exact patterns for precision.
4. **Off-Screen False Positives**: Windows at negative coordinates are blocked by default.

### Security Best Practices

1. **Keep blacklist enabled** with default password manager patterns
2. **Review audit logs** regularly for suspicious capture attempts
3. **Use fullscreen blur mode** in shared or sensitive environments
4. **Protect policy file** - ensure chmod 600 permissions
5. **Test policy changes** by attempting captures before relying on them

### Reporting Security Issues

If you discover a security vulnerability, please report it responsibly:
- Do not open a public issue
- Email security concerns to the maintainers
- Include steps to reproduce and potential impact

### Version History

- **v2.0.0**: Added window capture security policies, audit logging, blur support
