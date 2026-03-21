# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [2.0.0] - 2024-03-21

### Breaking Changes
- **Removed** `auth.json` file-based authentication
- **Changed** API key must now be set via `ALIBABA_VISION_API_KEY` environment variable

### Added
- **Capture shortcuts** for analysis tools: `"last"`, `"screen"`, `"window"`
- **Structured logging** to stderr with JSON format and API key obfuscation
- **UUID-based temp files** to prevent race conditions
- **Startup banner** with platform detection (X11/Wayland/macOS)
- **External tool validation** in `health_check` (xdotool, ffmpeg, xwd)
- **Display server detection** in `health_check`
- **Graceful shutdown** handlers (SIGINT, SIGTERM)
- **Zod schema validation** for configuration files
- **Screenshot config schema** for customizable capture commands
- **Template substitution** with command injection prevention
- **GitHub Actions CI/CD** workflow for Node.js 18/20
- **SECURITY.md** with security best practices

### Fixed
- `list_windows` now correctly enumerates all visible windows
- `capture_window` now properly targets specified windows
- `health_check` now properly registered in tool switch statement

### Changed
- Improved error messages with setup instructions
- Better error handling throughout

### Migration Guide

If you were using `auth.json`:

```bash
# OLD (no longer supported)
# ~/.config/opencode/auth.json
{
  "alibaba_api_key": "sk-sp-xxx"
}

# NEW (required)
export ALIBABA_VISION_API_KEY="sk-sp-xxx"
```

Add to your `~/.bashrc` or `~/.zshrc` for persistence.

## [1.0.0] - Initial Release

### Added
- MCP server for Alibaba Coding Plan vision models
- Support for Kimi K2.5 and Qwen3.5-Plus models
- `capture_screen` - Full screen capture
- `capture_window` - Window-specific capture
- `list_windows` - List visible windows
- `analyze_screenshot` - General image analysis
- `extract_text_from_screenshot` - OCR
- `diagnose_error_screenshot` - Error analysis
- `ui_to_artifact` - UI to code/spec conversion
- `understand_technical_diagram` - Diagram analysis
- `analyze_data_visualization` - Chart/graph analysis
- `ui_diff_check` - UI comparison
- `health_check` - System status
- `list_models` - Available models with descriptions
