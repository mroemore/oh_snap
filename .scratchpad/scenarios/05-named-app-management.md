# Test Scenario 05: Named App Management in Sessions

**Feature**: Named application tracking and management in nested sessions
**Priority**: Medium
**Status**: Pending
**Category**: UX/Infrastructure

---

## Overview

oh_snap provides named app management within nested Xephyr sessions. This allows agents to track, monitor, and control applications by a user-defined name rather than process ID, making workflow management more intuitive.

---

## User Stories

### Perspective A: OpenCode User Prompting an Agent

> **Story 5.1**: "As a developer testing a web app, I want to run Firefox with a memorable name like 'test-browser', so I can easily check its status or kill it later without tracking PIDs."

> **Story 5.2**: "As a QA engineer running multiple test instances, I want to name each instance uniquely, so I can manage them independently in the same session."

> **Story 5.3**: "As a user automating browser tests, I want to check if my browser is still running before capturing, so I can handle crashes gracefully."

### Perspective B: Agent Parsing NL Query and Using Tools

> **Story 5.4**: "As an agent, I need to run applications with names for easier reference, so I don't have to track numeric PIDs across commands."

> **Story 5.5**: "As an agent, I need to verify an app is still running before attempting to interact with it, so I can provide accurate status to the user."

> **Story 5.6**: "As an agent, I need to clean up specific apps by name without affecting others, so I can manage resources precisely."

---

## Test Cases

### TC-05.1: Run App with Custom Name

**Steps**:
```bash
# Start session
opencode --mcp-tool oh_snap start_nested_session '{"name": "test-sess"}'

# Run app with name
opencode --mcp-tool oh_snap run_named_app '{
  "session_id": "ses_xxx",
  "name": "my-browser",
  "command": "firefox --kiosk https://example.com"
}'
```

**Expected Result**:
```json
{
  "status": "success",
  "pid": 12345,
  "name": "my-browser",
  "command": "firefox --kiosk https://example.com"
}
```

---

### TC-05.2: Get App Status - Running

**Preconditions**: App "my-browser" was started and is still running

**Steps**:
```bash
opencode --mcp-tool oh_snap get_app_status '{
  "session_id": "ses_xxx",
  "name": "my-browser"
}'
```

**Expected Result**:
```json
{
  "running": true,
  "pid": 12345,
  "name": "my-browser"
}
```

---

### TC-05.3: Get App Status - Not Running

**Preconditions**: App "my-browser" was killed or exited

**Steps**:
```bash
opencode --mcp-tool oh_snap get_app_status '{
  "session_id": "ses_xxx",
  "name": "my-browser"
}'
```

**Expected Result**:
```json
{
  "running": false,
  "name": "my-browser",
  "message": "App 'my-browser' is not running"
}
```

---

### TC-05.4: Kill App by Name

**Preconditions**: App "my-browser" is running

**Steps**:
```bash
opencode --mcp-tool oh_snap kill_app_by_name '{
  "session_id": "ses_xxx",
  "name": "my-browser"
}'
```

**Expected Result**:
```json
{
  "status": "success",
  "message": "App 'my-browser' (PID 12345) terminated"
}
```

---

### TC-05.5: Kill Non-Existent App

**Steps**:
```bash
opencode --mcp-tool oh_snap kill_app_by_name '{
  "session_id": "ses_xxx",
  "name": "nonexistent-app"
}'
```

**Expected Result**:
```json
{
  "status": "error",
  "message": "No app named 'nonexistent-app' found in session"
}
```

---

### TC-05.6: Multiple Named Apps in Same Session

**Steps**:
```bash
# Run multiple named apps
opencode --mcp-tool oh_snap run_named_app '{"session_id": "ses_xxx", "name": "browser", "command": "firefox"}'
opencode --mcp-tool oh_snap run_named_app '{"session_id": "ses_xxx", "name": "editor", "command": "gedit"}'
opencode --mcp-tool oh_snap run_named_app '{"session_id": "ses_xxx", "name": "terminal", "command": "xterm"}'

# Check each status
opencode --mcp-tool oh_snap get_app_status '{"session_id": "ses_xxx", "name": "browser"}'
opencode --mcp-tool oh_snap get_app_status '{"session_id": "ses_xxx", "name": "editor"}'
opencode --mcp-tool oh_snap get_app_status '{"session_id": "ses_xxx", "name": "terminal"}'

# Kill one
opencode --mcp-tool oh_snap kill_app_by_name '{"session_id": "ses_xxx", "name": "editor"}'

# Verify others still running
opencode --mcp-tool oh_snap get_app_status '{"session_id": "ses_xxx", "name": "browser"}'
# Should still be running
```

**Expected Result**:
- Each app tracked independently
- Killing one doesn't affect others
- Status queries return correct results for each

---

### TC-05.7: App Name Collision Handling

**Steps**:
```bash
# Run app with name "browser"
opencode --mcp-tool oh_snap run_named_app '{"session_id": "ses_xxx", "name": "browser", "command": "firefox"}'

# Try to run another app with same name
opencode --mcp-tool oh_snap run_named_app '{"session_id": "ses_xxx", "name": "browser", "command": "chromium"}'
```

**Expected Result**:
- Option A: Error - name already in use
- Option B: Previous app killed, new one replaces it
- Document actual behavior

---

### TC-05.8: Session Stop Cleans Up Named Apps

**Steps**:
```bash
# Run named app
opencode --mcp-tool oh_snap run_named_app '{"session_id": "ses_xxx", "name": "test-app", "command": "xeyes"}'

# Stop session
opencode --mcp-tool oh_snap stop_nested_session '{"session_id": "ses_xxx"}'

# Try to get status (session doesn't exist)
opencode --mcp-tool oh_snap get_app_status '{"session_id": "ses_xxx", "name": "test-app"}'
```

**Expected Result**:
- Session stop terminates all apps
- Error when querying non-existent session

---

## Named App vs PID Comparison

| Feature | Named App | PID |
|---------|-----------|-----|
| Human-readable | ✅ Yes | ❌ No (12345) |
| Stable reference | ✅ Yes | ❌ Changes on restart |
| Easy cleanup | ✅ kill_app_by_name | ❌ Must track PID |
| Status check | ✅ get_app_status | ❌ Manual process check |
| Multiple apps | ✅ Unique names | ✅ Multiple PIDs |

---

## E2E Test Commands

```bash
#!/bin/bash
echo "=== Named App Management E2E Test ==="

# Start session
result=$(opencode --mcp-tool oh_snap start_nested_session '{}')
session_id=$(echo "$result" | jq -r '.session_id')
echo "Session: $session_id"

# Run named app
echo "Running 'test-browser'..."
opencode --mcp-tool oh_snap run_named_app "{\"session_id\": \"$session_id\", \"name\": \"test-browser\", \"command\": \"firefox --kiosk https://example.com\"}"

# Wait for startup
sleep 3

# Check status
echo "Checking status..."
opencode --mcp-tool oh_snap get_app_status "{\"session_id\": \"$session_id\", \"name\": \"test-browser\"}"

# Kill by name
echo "Killing 'test-browser'..."
opencode --mcp-tool oh_snap kill_app_by_name "{\"session_id\": \"$session_id\", \"name\": \"test-browser\"}"

# Verify stopped
echo "Verifying stopped..."
opencode --mcp-tool oh_snap get_app_status "{\"session_id\": \"$session_id\", \"name\": \"test-browser\"}"

# Cleanup
opencode --mcp-tool oh_snap stop_nested_session "{\"session_id\": \"$session_id\"}"

echo "=== Test Complete ==="
```

---

## Test Evidence

### Screenshot 1: Named App Started
![app started](../results/screenshots/05-app-started.png)

### Screenshot 2: App Status Running
![status running](../results/screenshots/05-status-running.png)

### Screenshot 3: App Killed by Name
![app killed](../results/screenshots/05-app-killed.png)

---

## Success Criteria

- [ ] Apps can be started with custom names
- [ ] App status correctly shows running/not running
- [ ] Apps can be killed by name
- [ ] Multiple named apps can coexist in same session
- [ ] Killing one named app doesn't affect others
- [ ] Name collision is handled appropriately
- [ ] Session stop cleans up all named apps
- [ ] Error handling for non-existent names

---

## API Reference

### run_named_app
```typescript
{
  session_id: string,  // From start_nested_session
  name: string,        // User-defined name for this app
  command: string      // Shell command to run
}
```

### get_app_status
```typescript
{
  session_id: string,  // Session containing the app
  name: string         // Name assigned via run_named_app
}
```

### kill_app_by_name
```typescript
{
  session_id: string,  // Session containing the app
  name: string         // Name of app to kill
}
```