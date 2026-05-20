# Test Scenario 04: Nested Xephyr Sessions

**Feature**: Isolated Xephyr X sessions for application capture
**Priority**: Medium
**Status**: Pending
**Category**: Infrastructure

---

## Overview

oh_snap supports running applications in isolated Xephyr nested X sessions. This is useful for SSH sessions, privacy, or capturing apps without them appearing on the main desktop. This test validates the session lifecycle, window management, and capture capabilities.

---

## User Stories

### Perspective A: OpenCode User Prompting an Agent

> **Story 4.1**: "As a developer working via SSH, I want to run a browser in an isolated session and capture screenshots, so I can debug web apps remotely without a physical display."

> **Story 4.2**: "As a privacy-conscious user, I want to run sensitive applications in an isolated session, so they never appear on my main desktop."

> **Story 4.3**: "As a QA engineer, I want to test multiple application instances in parallel sessions, so I can compare behavior side-by-side."

### Perspective B: Agent Parsing NL Query and Using Tools

> **Story 4.4**: "As an agent, I need to create isolated capture environments, so I can capture GUI applications from SSH sessions."

> **Story 4.5**: "As an agent, I need to manage the full session lifecycle (start, run apps, capture, cleanup), so resources are properly released."

> **Story 4.6**: "As an agent, I need to handle session failures gracefully, so I can retry or inform the user of issues."

---

## Test Cases

### TC-04.1: Basic Session Lifecycle

**Preconditions**:
- Xephyr installed (`xserver-xephyr` or `xorg-x11-server-Xephyr`)
- Window manager installed (evilwm recommended)

**Steps**:
```bash
# 1. Start session
opencode --mcp-tool oh_snap start_nested_session '{}'
# Returns: {"session_id": "ses_xxx", "display": 99, "dimensions": "1024x768"}

# 2. Run a simple app
opencode --mcp-tool oh_snap run_in_session '{
  "session_id": "ses_xxx",
  "command": "xeyes"
}'

# 3. List windows in session
opencode --mcp-tool oh_snap list_nested_windows '{"session_id": "ses_xxx"}'

# 4. Capture the session
opencode --mcp-tool oh_snap capture_nested_window '{"session_id": "ses_xxx"}'

# 5. Stop session
opencode --mcp-tool oh_snap stop_nested_session '{"session_id": "ses_xxx"}'
```

**Expected Result**:
- Session created with unique ID
- App runs in isolated display
- Capture succeeds
- Session cleaned up properly

---

### TC-04.2: Named App Management

**Steps**:
```bash
# 1. Start session
result=$(opencode --mcp-tool oh_snap start_nested_session '{}')
session_id=$(echo $result | jq -r '.session_id')

# 2. Run named app
opencode --mcp-tool oh_snap run_named_app '{
  "session_id": "'$session_id'",
  "name": "test_browser",
  "command": "firefox --kiosk https://example.com"
}'

# 3. Check app status
opencode --mcp-tool oh_snap get_app_status '{
  "session_id": "'$session_id'",
  "name": "test_browser"
}'

# 4. Kill app by name
opencode --mcp-tool oh_snap kill_app_by_name '{
  "session_id": "'$session_id'",
  "name": "test_browser"
}'

# 5. Verify app is stopped
opencode --mcp-tool oh_snap get_app_status '{
  "session_id": "'$session_id'",
  "name": "test_browser"
}'
```

**Expected Result**:
- Named app tracked correctly
- Status returns `{"running": true, "pid": <number>}`
- Kill by name terminates the app
- Status shows not running after kill

---

### TC-04.3: Wait for Window

**Steps**:
```bash
# 1. Start session
# 2. Run app that takes time to start (e.g., Firefox)
opencode --mcp-tool oh_snap run_in_session '{
  "session_id": "ses_xxx",
  "command": "firefox"
}'

# 3. Wait for window to appear
opencode --mcp-tool oh_snap wait_for_window '{
  "session_id": "ses_xxx",
  "window_name_pattern": "firefox",
  "timeout_ms": 30000
}'
```

**Expected Result**:
- Polling continues until window appears or timeout
- Returns window details when found
- Case-insensitive substring matching

---

### TC-04.4: Multiple Concurrent Sessions

**Steps**:
```bash
# Start 3 sessions
opencode --mcp-tool oh_snap start_nested_session '{"name": "session-a"}'
opencode --mcp-tool oh_snap start_nested_session '{"name": "session-b"}'
opencode --mcp-tool oh_snap start_nested_session '{"name": "session-c"}'

# List all sessions
opencode --mcp-tool oh_snap list_nested_sessions '{}'
```

**Expected Result**:
- Each session gets unique display (:99, :100, :101)
- All sessions listed correctly
- Sessions run independently

---

### TC-04.5: Window Manager Fallback

**Preconditions**:
- evilwm NOT installed
- matchbox-window-manager installed

**Steps**:
```bash
opencode --mcp-tool oh_snap start_nested_session '{}'
```

**Expected Result**:
- Session starts with matchbox instead of evilwm
- Fallback chain: evilwm → matchbox → none

---

### TC-04.6: Clear Apps Without Stopping Session

**Steps**:
```bash
# 1. Start session and run multiple apps
# 2. Run xeyes, xclock, xterm
# 3. Clear all apps
opencode --mcp-tool oh_snap clear_apps '{"session_id": "ses_xxx"}'

# 4. Verify session still running
opencode --mcp-tool oh_snap list_nested_sessions '{}'
```

**Expected Result**:
- All apps terminated
- Session still active and usable
- New apps can be started

---

### TC-04.7: Kill App by PID

**Steps**:
```bash
# 1. Run app and get PID
result=$(opencode --mcp-tool oh_snap run_in_session '{
  "session_id": "ses_xxx",
  "command": "xeyes"
}')
# result contains PID

# 2. Kill by PID
opencode --mcp-tool oh_snap kill_app_in_session '{
  "session_id": "ses_xxx",
  "pid": 12345
}'
```

**Expected Result**:
- Specific process terminated
- Other apps in session unaffected

---

## Session Configuration

**Config file**: `~/.config/opencode/oh_snap_config.json`

```json
{
  "nested_sessions": {
    "default_width": 1024,
    "default_height": 768,
    "default_window_manager": "evilwm",
    "wm_fallback_chain": ["evilwm", "matchbox", "none"],
    "auto_cleanup": true,
    "idle_timeout_ms": 300000
  }
}
```

---

## E2E Test Commands

```bash
# Full workflow test
#!/bin/bash
echo "=== Nested Session E2E Test ==="

# Start session
echo "1. Starting session..."
result=$(opencode --mcp-tool oh_snap start_nested_session '{"name": "test-session"}')
echo "$result"
session_id=$(echo "$result" | jq -r '.session_id')

# Run app
echo "2. Running xeyes..."
opencode --mcp-tool oh_snap run_in_session "{\"session_id\": \"$session_id\", \"command\": \"xeyes\"}"

# Wait for window
echo "3. Waiting for window..."
sleep 2

# List windows
echo "4. Listing windows..."
opencode --mcp-tool oh_snap list_nested_windows "{\"session_id\": \"$session_id\"}"

# Capture
echo "5. Capturing..."
opencode --mcp-tool oh_snap capture_nested_window "{\"session_id\": \"$session_id\"}"

# Stop session
echo "6. Stopping session..."
opencode --mcp-tool oh_snap stop_nested_session "{\"session_id\": \"$session_id\"}"

echo "=== Test Complete ==="
```

---

## Test Evidence

### Screenshot 1: Session Started
![session started](../results/screenshots/04-session-started.png)

### Screenshot 2: Windows in Session
![windows listed](../results/screenshots/04-windows-listed.png)

### Screenshot 3: Captured from Session
![captured](../results/screenshots/04-captured.png)

---

## Success Criteria

- [ ] Session starts with valid display number
- [ ] Apps run in isolated display (not on main desktop)
- [ ] Window listing works within session
- [ ] Capture produces valid screenshot
- [ ] Session cleanup releases all resources
- [ ] Named app tracking works
- [ ] Wait for window polling works
- [ ] Multiple concurrent sessions work
- [ ] Window manager fallback functions
- [ ] Clear apps keeps session alive

---

## Prerequisites

```bash
# Ubuntu/Debian
sudo apt-get install xserver-xephyr evilwm

# Fedora/RHEL
sudo dnf install xorg-x11-server-Xephyr evilwm
```

---

## Troubleshooting

| Error | Cause | Solution |
|-------|-------|----------|
| "Xephyr not found" | Not installed | Install xserver-xephyr package |
| "No window manager" | evilwm not installed | Install evilwm or configure fallback |
| "Display :99 in use" | Previous session not cleaned up | Kill Xephyr process or use different display |
| "Cannot connect to X server" | DISPLAY not set in session | Check session startup logs |