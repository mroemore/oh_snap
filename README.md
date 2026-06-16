# oh_snap: A privacy-conscious Vision MCP.

[![npm version](https://badge.fury.io/js/oh_snap_vision.svg)](https://www.npmjs.com/package/oh_snap_vision)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-18%2B-green.svg)](https://nodejs.org/)

  - *oh_snap* allows your agent to autonomously capture and analyze single-application and full-screen screenshots.
  - *oh_snap* helps to avoid the disclosure of sensitive information by blurring or refusing to capture certain applications. This is done client-side, and automatically.
  - *oh_snap* supports Alibaba (Kimi, Qwen), OpenAI (GPT-4o, GPT-4.1), and Anthropic (Claude) vision models.
  - *oh_snap* is a work in progress and currently only supports X11 and Linux.
> **NB**: This project is in the early stages of its development, and has only been tested on a limited number of systems. We welcome testers, bug reports, and code contributions.

## Prerequisites

- **Node.js 18+** (required for modern JavaScript features and MCP protocol support)
- **API Key** (at least one of the following):
  - Alibaba Vision API Key ([get one here](https://dashscope.console.aliyun.com/))
  - OpenAI API Key ([get one here](https://platform.openai.com/api-keys))
  - Anthropic API Key ([get one here](https://console.anthropic.com/))

### For Screenshot Capture (Linux/X11)

- `xdotool` - Window management and listing
- `xwd` - X window dump utility
- `ffmpeg` - Image conversion
- `xdpyinfo` - X display info utility (used internally to verify nested displays are ready)

#### Optional: Nested X Server Backends

For headless or nested session support, at least one of the following backends is recommended:

- `xvfb` — **X Virtual Framebuffer**: headless, lightweight, recommended default. No display hardware required.
- `xdummy` — **X dummy driver**: headless, opt-in alternative. Requires `xf86-video-dummy`; bundles its own `xorg-dummy.conf` (no system-level config needed).
- `xephyr` — **Xephyr nested server**: visible nested window, useful for debugging. Falls back to this if other backends are unavailable.

Install on Ubuntu/Debian:
```bash
sudo apt-get install xdotool x11-apps ffmpeg x11-utils
# xvfb (recommended headless backend)
sudo apt-get install xvfb
# xdummy (alternative headless backend)
sudo apt-get install xserver-xorg-video-dummy
# xephyr (visible nested backend, for debugging)
sudo apt-get install xserver-xephyr
```

Install on Fedora/RHEL:
```bash
sudo dnf install xdotool xwd ffmpeg xorg-x11-utils
# xvfb (recommended headless backend)
sudo dnf install xorg-x11-server-Xvfb
# xdummy (alternative headless backend)
sudo dnf install xorg-x11-drv-dummy
# xephyr (visible nested backend, for debugging)
sudo dnf install xorg-x11-server-Xephyr
```

## Installation

### Option 1: Using npx (when published)

```bash
npx oh_snap
```

### Option 2: Clone and Build

```bash
git clone https://github.com/opencode-ai/oh_snap.git
cd oh_snap
npm install
npm run build
```

### What Happens When You Run It

When you start the MCP server, it will:

1. **Validate your API key** - Checks for `OH_SNAP_API_KEY` environment variable (with fallback to `ALIBABA_VISION_API_KEY`)
2. **Load configuration** - Reads `oh_snap_config.json` for model settings (with fallback to `vision-config.json`)
3. **Detect your platform** - Identifies X11, Wayland, or macOS
4. **Start the MCP server** - Begins listening for tool calls

If the API key is missing, you'll see a helpful error message with setup instructions.

## Configuration

### Environment Variable Setup

**Privacy-First Design**: This version only supports environment variable authentication.

Set your API keys as environment variables:

```bash
# Alibaba (for Kimi and Qwen models)
export OH_SNAP_ALIBABA_API_KEY="your-alibaba-key"
# Fallback: ALIBABA_VISION_API_KEY (backward compatibility)

# OpenAI (for GPT models)
export OH_SNAP_OPENAI_API_KEY="your-openai-key"
# Fallback: OPENAI_API_KEY

# Anthropic (for Claude models)
export OH_SNAP_ANTHROPIC_API_KEY="your-anthropic-key"
# Fallback: ANTHROPIC_API_KEY
```

**Note**: You only need to set keys for the providers you intend to use.

**Backward Compatibility**: The old `ALIBABA_VISION_API_KEY` and `OH_SNAP_API_KEY` environment variables are still supported.

### oh_snap_config.json

Create a `oh_snap_config.json` file in `~/.config/opencode/` (vision-config.json is also supported for backward compatibility):

```json
{
  "default_model": "kimi-k2.5",
  "allow_model_selection": true,
  "models": {
    "kimi-k2.5": {
      "display_name": "Kimi K2.5",
      "description": "Excellent image understanding with detailed visual analysis",
      "best_for": ["Complex screenshots", "UI analysis", "Detailed descriptions"]
    },
    "qwen3.5-plus": {
      "display_name": "Qwen3.5 Plus",
      "description": "Fast vision model with 1M token context window",
      "best_for": ["Large screenshots", "Quick analysis", "OCR tasks"]
    },
    "gpt-4o": {
      "display_name": "GPT-4o",
      "description": "OpenAI's multimodal model with excellent vision",
      "best_for": ["General vision tasks", "UI analysis"]
    },
    "claude-sonnet-4-6": {
      "display_name": "Claude Sonnet 4.6",
      "description": "Anthropic's balanced Claude model with vision",
      "best_for": ["Complex analysis", "Detailed descriptions"]
    }
  }
}
```

See the `list_models` tool for all 11 supported models.

### Backend Selection Configuration

The `x_server_priority` field in `oh_snap_config.json` controls which X server backends are tried when starting a nested session, and in what order. The server iterates through the array and uses the first available backend.

```json
{
  "default_model": "kimi-k2.5",
  "x_server_priority": ["xvfb", "xephyr"]
}
```

- **Default**: `["xvfb", "xephyr"]` — tries xvfb first (headless, recommended), falls back to xephyr (visible, for debugging).
- **Adding xdummy**: Include `"xdummy"` in the array to enable the dummy driver backend, e.g. `["xvfb", "xdummy", "xephyr"]`. The xdummy backend bundles its own `xorg-dummy.conf`, so no system-level X configuration is required.
- **Headless-only**: Use `["xvfb", "xdummy"]` to exclude the visible xephyr backend entirely.
- **Single backend**: Use `["xvfb"]` to force a specific backend with no fallback.

The tool surface is unchanged — no new tool parameters are required. The selected backend and its details are returned as informational fields in the `start_nested_session` response.

### OpenCode Configuration

Add to your `opencode.json`:

```json
{
  "mcp": {
    "oh_snap": {
      "type": "local",
      "command": ["node", "/path/to/oh_snap/scripts/start-mcp.mjs"],
      "enabled": true
    }
  }
}
```

The `scripts/start-mcp.mjs` launcher auto-builds `dist/` if it's missing or stale (any `src/` file newer than `dist/index.js`), then spawns the MCP server. Equivalently you can point OpenCode at the npm script directly:

```json
"command": ["npm", "run", "--prefix", "/path/to/oh_snap", "mcp"]
```

## Window Capture Policy

The server includes a comprehensive security policy system to prevent accidental capture of sensitive windows (password managers, banking apps, etc.).

### Policy Configuration

Policy file location: `~/.config/opencode/window-capture-policy.json`

The policy file is automatically created with secure defaults if it doesn't exist. File permissions are enforced (chmod 600).

### Policy Options

#### Off-Screen Capture
```json
{
  "offscreen_capture": {
    "allow": false
  }
}
```
- `allow: false` (default) - Reject capture of windows with negative coordinates
- `allow: true` - Allow off-screen window capture

#### Blacklist
```json
{
  "blacklist": {
    "enabled": true,
    "patterns": ["KeePassXC", "*password*", "*secret*", "*vault*"],
    "priority": true
  }
}
```
- Windows matching blacklist patterns are blocked from capture
- Default blacklist includes common password managers
- Blacklist takes priority over whitelist
- Patterns use glob syntax (* and ? wildcards)

#### Whitelist
```json
{
  "whitelist": {
    "enabled": false,
    "patterns": ["Firefox", "Code", "*terminal*"]
  }
}
```
- When enabled, only windows matching whitelist patterns can be captured
- Empty whitelist allows all windows (when enabled)
- Use with caution - can block legitimate captures

#### Fullscreen Policy
```json
{
  "fullscreen_policy": {
    "mode": "blur",
    "blur_strength": "heavy"
  }
}
```
- `mode: "blur"` - Blur sensitive windows in fullscreen captures
- `mode: "reject"` - Reject fullscreen capture if sensitive windows visible
- `mode: "allow"` - Skip policy checks for fullscreen captures
- `blur_strength`: "light", "medium", or "heavy"

#### Audit Logging
```json
{
  "audit": {
    "log_captures": true
  }
}
```
- Logs all capture attempts to `~/.local/share/oh_snap/capture-audit.log`
- JSON format with timestamps, actions, and results

### Pattern Syntax

Patterns use glob syntax (not regex):
- `*` - Matches any sequence of characters
- `?` - Matches any single character
- Case-insensitive matching

Examples:
- `*password*` - Matches "MyPasswordManager", "password-safe"
- `KeePass*` - Matches "KeePassXC", "KeePass"
- `Firefox` - Matches exactly "Firefox"

### Security Best Practices

1. **Keep blacklist enabled** - The default blacklist protects against common password managers
2. **Use whitelist sparingly** - Whitelist mode is restrictive; only enable if necessary
3. **Review audit logs** - Check `~/.local/share/oh_snap/capture-audit.log` regularly
4. **Protect policy file** - Ensure policy file has chmod 600 permissions
5. **Use fullscreen blur** - Recommended for shared environments

## Nested Session Backends

oh_snap supports three X server backends for running nested or headless sessions. This is useful when you need an isolated display for screenshot capture without interfering with your primary desktop session.

| Backend | Type | Visibility | Weight | Best For |
|---------|------|------------|--------|----------|
| **xvfb** | X Virtual Framebuffer | Headless | ~5 MB | Default headless capture, CI/CD, servers |
| **xdummy** | X dummy driver | Headless | ~10 MB | Alternative headless, custom resolutions |
| **xephyr** | Nested X server | Visible window | ~20 MB | Debugging, visual verification |

### xvfb (Recommended)

X Virtual Framebuffer creates a virtual display in memory with no visible window. It is the lightest and fastest option, making it the recommended default for production use.

```bash
# Start a nested session using xvfb (default)
# No additional configuration needed — xvfb is tried first
```

### xdummy (Opt-in)

The X dummy driver provides a headless display with support for custom resolutions. It requires the `xf86-video-dummy` driver package. oh_snap bundles its own `xorg-dummy.conf`, so no system-level X configuration is required.

```bash
# Enable xdummy by adding it to x_server_priority in oh_snap_config.json
# "x_server_priority": ["xvfb", "xdummy", "xephyr"]
```

### xephyr (Fallback / Debugging)

Xephyr opens a visible nested X window on your current desktop. This is useful for debugging capture issues since you can see exactly what the nested session displays. It is heavier than xvfb and is recommended as a fallback or debugging tool rather than a primary backend.

```bash
# Force xephyr as the only backend
# "x_server_priority": ["xephyr"]
```

### Backend Selection

The server iterates through `x_server_priority` in order and uses the first available backend. If none of the configured backends are installed, the nested session will fail with an error listing which binaries were not found.

## Available Tools

| Tool | Description | Parameters |
|------|-------------|------------|
| `analyze_screenshot` | Analyze a screenshot with vision model | `prompt`, `model` (optional) |
| `capture_screen` | Capture full screen screenshot | `prompt` (optional) |
| `capture_window` | Capture specific window by class or title | `window_class` or `window_title`, `prompt` |
| `list_windows` | List all visible windows | none |
| `extract_text_from_screenshot` | OCR text extraction | `image_path` or use captured screenshot |
| `analyze_data_visualization` | Extract insights from charts/graphs | `image_source`, `prompt` |
| `understand_technical_diagram` | Analyze architecture diagrams, flowcharts | `image_source`, `prompt` |
| `ui_diff_check` | Compare two UI screenshots | `expected_image_source`, `actual_image_source`, `prompt` |
| `ui_to_artifact` | Convert UI screenshot to code | `image_source`, `output_type`, `prompt` |
| `diagnose_error_screenshot` | Analyze error screenshots | `image_source`, `prompt`, `context` (optional) |
| `health_check` | Validate server and dependencies | none |
| `start_nested_session` | Start a nested X server session for isolated capture | `backend` (optional) |

#

### Capture Shortcuts

The analysis tools support shortcuts for recently captured screenshots:

| Shortcut | Description |
|----------|-------------|
| `"last"` or `"latest"` | Use the most recent capture (screen or window) |
| `"screen"` | Use the last fullscreen capture |
| `"window"` | Use the last window capture |

**Example workflow:**
```
1. capture_screen() → captures fullscreen
2. analyze_screenshot(image_source="last", prompt="What do you see?")
3. capture_window(window_class="Firefox") → captures Firefox window
4. extract_text_from_screenshot(image_source="window") → extracts text from Firefox
```

## health_check Tool

The `health_check` tool validates:

- API key format and presence
- Configuration file validity
- External tool availability (xdotool, ffmpeg, xwd)
- Display server access (X11/Wayland)
- Platform detection

Example response:
```json
{
  "status": "healthy",
  "api_key_configured": true,
  "config_valid": true,
  "external_tools": {
    "xdotool": { "installed": true, "path": "/usr/bin/xdotool" },
    "ffmpeg": { "installed": true, "path": "/usr/bin/ffmpeg" },
    "xwd": { "installed": true, "path": "/usr/bin/xwd" }
  },
  "x_server_backends": [
    { "name": "xvfb", "available": true, "path": "/usr/bin/Xvfb" },
    { "name": "xdummy", "available": false, "path": null },
    { "name": "xephyr", "available": true, "path": "/usr/bin/Xephyr" }
  ],
  "display_available": true,
  "platform": "x11"
}
```

## start_nested_session Tool

The `start_nested_session` tool launches an isolated X server session for screenshot capture. It selects a backend based on the `x_server_priority` configuration (or the optional `backend` parameter) and returns details about the chosen server.

Example response:
```json
{
  "status": "started",
  "display": ":99",
  "pid": 12345,
  "x_server_type": "xvfb",
  "x_server_binary": "/usr/bin/Xvfb",
  "x_server_priority": ["xvfb", "xephyr"]
}
```

### Response Fields

| Field | Type | Description |
|-------|------|-------------|
| `status` | string | `"started"` on success, `"failed"` on error |
| `display` | string | The `$DISPLAY` value for the nested session (e.g., `:99`) |
| `pid` | number | Process ID of the X server |
| `x_server_type` | string | The backend that was selected (`"xvfb"`, `"xdummy"`, or `"xephyr"`) |
| `x_server_binary` | string | Full path to the X server binary that was launched |
| `x_server_priority` | array | The priority list that was used for backend selection |

The `x_server_type`, `x_server_binary`, and `x_server_priority` fields are informational — they let you verify which backend was chosen and how. The tool parameters are unchanged; no new parameters are required to use these backends.

## Platform Support

| Platform | Support Level | Notes |
|----------|--------------|-------|
| **Linux/X11** | Full support | Tested and working |
| **macOS** | Untested defaults | Bundled commands may work, needs volunteer testers |
| **Wayland** | Limited support | Window capture may not work, XWayland recommended |
| **Windows** | Not supported | Out of scope for this project |

### Platform Detection

The server automatically detects your platform at startup:
- **X11**: Detected via `$DISPLAY` environment variable
- **Wayland**: Detected via `$XDG_SESSION_TYPE` or `$WAYLAND_DISPLAY`
- **macOS**: Detected via `process.platform === 'darwin'`

If running on Wayland, a warning is logged about potential window capture limitations.

## Troubleshooting

### "OH_SNAP_API_KEY not set"

**Cause**: Environment variable not configured

**Fix**:
```bash
export OH_SNAP_API_KEY="your-api-key"
```

Add to your shell profile for persistence.

### "xdotool not found"

**Cause**: External tool not installed

**Fix**:
```bash
# Ubuntu/Debian
sudo apt-get install xdotool

# Fedora/RHEL
sudo dnf install xdotool
```

### "Cannot connect to X server"

**Cause**: `$DISPLAY` not set or no X server running

**Fix**:
```bash
# Check display
echo $DISPLAY

# Should output something like :0 or :1
# If empty, set it:
export DISPLAY=:0
```

### "Wayland not fully supported"

**Cause**: Running on Wayland display server

**Fix**: Use XWayland or switch to X11 session for full screenshot support.

### "Window capture fails"

**Cause**: Window not found or permissions issue

**Fix**:
1. Run `list_windows` to see available windows
2. Use exact `window_class` or `window_title` from the list
3. Ensure the window is visible (not minimized)

### "API key invalid format"

**Cause**: API key doesn't match expected format for the provider

**Fix**:
- **Alibaba**: Key should start with `sk-sp-` from DashScope
- **OpenAI**: Key should start with `sk-` from OpenAI Platform
- **Anthropic**: Key should start with `sk-ant-` from Anthropic Console

## Privacy-First Design

oh_snap is designed with privacy as a core principle:

- **No persistent storage of screenshots** - All captures are processed in memory and cleaned up immediately
- **Audit logging** - All capture attempts are logged for transparency
- **Window capture policies** - Built-in protection against capturing sensitive windows (password managers, banking apps)
- **Configurable blur** - Automatically blur sensitive content in fullscreen captures

## License

MIT License - see LICENSE file for details.

## Attribution

Built with the Model Context Protocol (MCP) and vision models from Alibaba (Kimi, Qwen), OpenAI (GPT), and Anthropic (Claude).
