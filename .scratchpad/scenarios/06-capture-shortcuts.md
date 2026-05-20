# Test Scenario 06: Capture Shortcuts

**Feature**: Image source shortcuts for recent captures ("last", "screen", "window")
**Priority**: Medium
**Status**: Pending
**Category**: UX

---

## Overview

oh_snap provides convenient shortcuts for referring to recently captured screenshots. Instead of re-specifying the image source, agents can use "last", "screen", or "window" to reference previous captures.

---

## User Stories

### Perspective A: OpenCode User Prompting an Agent

> **Story 6.1**: "As a user, I want to quickly analyze what I just captured without re-uploading the image, so my workflow is faster and more natural."

> **Story 6.2**: "As a user debugging an issue, I want to capture a window, then a screen, then analyze both separately, so I can compare focused vs full context."

> **Story 6.3**: "As a user working iteratively, I want to apply multiple analysis operations to the same image, so I don't have to repeat the capture."

### Perspective B: Agent Parsing NL Query and Using Tools

> **Story 6.4**: "As an agent, I need to efficiently reference recent captures without storing paths, so I can chain operations smoothly."

> **Story 6.5**: "As an agent, I need to distinguish between 'the most recent capture' vs 'the most recent screen capture' vs 'the most recent window capture', so I can use the correct image."

> **Story 6.6**: "As an agent, I need clear errors when no capture exists for a shortcut, so I can inform the user what to do."

---

## Test Cases

### TC-06.1: "last" Shortcut After Screen Capture

**Steps**:
```bash
# 1. Capture screen
opencode --mcp-tool oh_snap capture_screen '{}'

# 2. Analyze using "last"
opencode --mcp-tool oh_snap analyze_screenshot '{
  "image_source": "last",
  "prompt": "What applications are visible?"
}'
```

**Expected Result**:
- "last" resolves to the screen capture
- Analysis uses the screen image

---

### TC-06.2: "last" Shortcut After Window Capture

**Steps**:
```bash
# 1. Capture window
opencode --mcp-tool oh_snap capture_window '{"window_class": "firefox"}'

# 2. Analyze using "last"
opencode --mcp-tool oh_snap analyze_screenshot '{
  "image_source": "last",
  "prompt": "What is displayed in this window?"
}'
```

**Expected Result**:
- "last" resolves to the window capture
- Analysis uses the window image

---

### TC-06.3: "last" Updates on New Capture

**Steps**:
```bash
# 1. Capture screen
opencode --mcp-tool oh_snap capture_screen '{}'

# 2. Capture window (last now points to window)
opencode --mcp-tool oh_snap capture_window '{"window_class": "firefox"}'

# 3. Analyze using "last"
opencode --mcp-tool oh_snap analyze_screenshot '{
  "image_source": "last",
  "prompt": "Describe this image"
}'
```

**Expected Result**:
- "last" points to the most recent capture (window)
- Not the screen from step 1

---

### TC-06.4: "screen" Shortcut - Specific to Screen Capture

**Steps**:
```bash
# 1. Capture screen
opencode --mcp-tool oh_snap capture_screen '{}'

# 2. Capture window
opencode --mcp-tool oh_snap capture_window '{"window_class": "code"}'

# 3. Analyze using "screen" (not "last")
opencode --mcp-tool oh_snap analyze_screenshot '{
  "image_source": "screen",
  "prompt": "What's on the full desktop?"
}'
```

**Expected Result**:
- "screen" returns the screen capture from step 1
- Not affected by the window capture in step 2

---

### TC-06.5: "window" Shortcut - Specific to Window Capture

**Steps**:
```bash
# 1. Capture window
opencode --mcp-tool oh_snap capture_window '{"window_class": "firefox"}'

# 2. Capture screen
opencode --mcp-tool oh_snap capture_screen '{}'

# 3. Analyze using "window" (not "last")
opencode --mcp-tool oh_snap analyze_screenshot '{
  "image_source": "window",
  "prompt": "What browser tab is open?"
}'
```

**Expected Result**:
- "window" returns the window capture from step 1
- Not affected by the screen capture in step 2

---

### TC-06.6: No Capture Available Error

**Steps**:
```bash
# Fresh session, no captures yet
opencode --mcp-tool oh_snap analyze_screenshot '{
  "image_source": "last",
  "prompt": "What is this?"
}'
```

**Expected Result**:
```json
{
  "error": "No capture available. Run capture_screen or capture_window first."
}
```

---

### TC-06.7: No Screen Capture Available

**Steps**:
```bash
# Only captured a window, not screen
opencode --mcp-tool oh_snap capture_window '{"window_class": "firefox"}'

# Try to use "screen" shortcut
opencode --mcp-tool oh_snap analyze_screenshot '{
  "image_source": "screen",
  "prompt": "What is this?"
}'
```

**Expected Result**:
```json
{
  "error": "No screen capture available. Run capture_screen first."
}
```

---

### TC-06.8: No Window Capture Available

**Steps**:
```bash
# Only captured screen, not window
opencode --mcp-tool oh_snap capture_screen '{}'

# Try to use "window" shortcut
opencode --mcp-tool oh_snap analyze_screenshot '{
  "image_source": "window",
  "prompt": "What is this?"
}'
```

**Expected Result**:
```json
{
  "error": "No window capture available. Run capture_window first."
}
```

---

### TC-06.9: Multiple Analysis on Same Capture

**Steps**:
```bash
# Capture once
opencode --mcp-tool oh_snap capture_screen '{}'

# Multiple analysis operations
opencode --mcp-tool oh_snap analyze_screenshot '{
  "image_source": "last",
  "prompt": "List all visible applications"
}'

opencode --mcp-tool oh_snap extract_text_from_screenshot '{
  "image_source": "last"
}'

opencode --mcp-tool oh_snap analyze_data_visualization '{
  "image_source": "last",
  "prompt": "Are there any charts visible?"
}'
```

**Expected Result**:
- All operations use the same screen capture
- No need to re-capture

---

### TC-06.10: Shortcut Aliases

**Test that all aliases work:**

| Shortcut | Aliases |
|----------|---------|
| Most recent | `last`, `latest` |
| Screen | `screen`, `capture_screen` |
| Window | `window`, `capture_window` |

```bash
# Test aliases
opencode --mcp-tool oh_snap analyze_screenshot '{"image_source": "latest", ...}'
opencode --mcp-tool oh_snap analyze_screenshot '{"image_source": "capture_screen", ...}'
```

---

## Shortcut Resolution Flow

```
┌─────────────────────────────────────────────────────────────┐
│                    image_source input                       │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
              ┌───────────────────────────────┐
              │ Is it "last" or "latest"?     │
              └───────────────────────────────┘
                     │              │
                    Yes            No
                     │              │
                     ▼              ▼
         ┌─────────────────┐  ┌───────────────────────────┐
         │ Return most     │  │ Is it "screen" or         │
         │ recent capture  │  │ "capture_screen"?         │
         └─────────────────┘  └───────────────────────────┘
                                     │              │
                                    Yes            No
                                     │              │
                                     ▼              ▼
                         ┌─────────────────┐  ┌───────────────────┐
                         │ Return last     │  │ Is it "window" or │
                         │ screen capture  │  │ "capture_window"? │
                         └─────────────────┘  └───────────────────┘
                                                     │          │
                                                    Yes        No
                                                     │          │
                                                     ▼          ▼
                                         ┌─────────────────┐  ┌─────────────┐
                                         │ Return last     │  │ Treat as    │
                                         │ window capture  │  │ file path   │
                                         └─────────────────┘  └─────────────┘
```

---

## E2E Test Commands

```bash
#!/bin/bash
echo "=== Capture Shortcuts E2E Test ==="

# Test 1: last shortcut
echo "1. Testing 'last' shortcut..."
opencode --mcp-tool oh_snap capture_screen '{}'
opencode --mcp-tool oh_snap analyze_screenshot '{"image_source": "last", "prompt": "What time is shown?"}'

# Test 2: screen vs window distinction
echo "2. Testing 'screen' vs 'window' distinction..."
opencode --mcp-tool oh_snap capture_screen '{}'
opencode --mcp-tool oh_snap capture_window '{"window_class": "firefox"}'

# "screen" should return screen capture
opencode --mcp-tool oh_snap analyze_screenshot '{"image_source": "screen", "prompt": "Is this a full desktop?"}'

# "window" should return window capture
opencode --mcp-tool oh_snap analyze_screenshot '{"image_source": "window", "prompt": "Is this a browser window?"}'

# Test 3: Error handling
echo "3. Testing error handling..."
# Fresh session would test this:
# opencode --mcp-tool oh_snap analyze_screenshot '{"image_source": "last", "prompt": "test"}'
# Should error: No capture available

echo "=== Test Complete ==="
```

---

## Test Evidence

### Screenshot 1: "last" Shortcut Working
![last shortcut](../results/screenshots/06-last-shortcut.png)

### Screenshot 2: "screen" vs "window" Distinction
![screen vs window](../results/screenshots/06-screen-vs-window.png)

### Screenshot 3: No Capture Error
![no capture error](../results/screenshots/06-no-capture.png)

---

## Success Criteria

- [ ] "last" / "latest" returns most recent capture
- [ ] "screen" / "capture_screen" returns last screen capture
- [ ] "window" / "capture_window" returns last window capture
- [ ] "last" updates when new capture is made
- [ ] Screen and window captures are tracked separately
- [ ] Clear error when no capture exists
- [ ] Clear error when specific capture type doesn't exist
- [ ] Multiple analysis operations work on same capture
- [ ] Aliases work correctly

---

## Notes

- Shortcuts are in-memory only, not persisted across server restarts
- Shortcuts work with all image analysis tools:
  - `analyze_screenshot`
  - `extract_text_from_screenshot`
  - `diagnose_error_screenshot`
  - `ui_to_artifact`
  - `understand_technical_diagram`
  - `analyze_data_visualization`
  - `ui_diff_check`