# oh_snap MCP Server QA Test Plan

**Version**: 1.0.0-alpha.1
**Date**: 2026-03-25
**Status**: Ready for Execution

---

## Executive Summary

This test plan covers QA testing for oh_snap, a privacy-conscious Vision MCP server supporting multiple vision providers (Alibaba, OpenAI, Anthropic). The plan uses user-story driven design with both user and agent perspectives for each feature.

---

## Test Scope

### Features Tested (10 total)

| # | Feature | Priority | Status |
|---|---------|----------|--------|
| 1 | Multi-provider support | High | ✅ Scenarios Written |
| 2 | Window capture security policy | High | ✅ Scenarios Written |
| 3 | API key validation per provider | High | ✅ Scenarios Written |
| 4 | Nested Xephyr sessions | Medium | ✅ Scenarios Written |
| 5 | Named app management | Medium | ✅ Scenarios Written |
| 6 | Capture shortcuts | Medium | ✅ Scenarios Written |
| 7 | OCR text extraction | Medium | ✅ Scenarios Written |
| 8 | Error screenshot diagnosis | Medium | ✅ Scenarios Written |
| 9 | Technical diagram understanding | Medium | ✅ Scenarios Written |
| 10 | UI diff checking | Medium | ✅ Scenarios Written |

---

## Test Scenario Files

All test scenarios are located in `.scratchpad/scenarios/`:

```
.scratchpad/
├── TEST-PLAN.md                          # This file
├── scenarios/
│   ├── 01-multi-provider-support.md
│   ├── 02-window-capture-policy.md
│   ├── 03-api-key-validation.md
│   ├── 04-nested-sessions.md
│   ├── 05-named-app-management.md
│   ├── 06-capture-shortcuts.md
│   ├── 07-ocr-extraction.md
│   ├── 08-error-diagnosis.md
│   ├── 09-technical-diagrams.md
│   └── 10-ui-diff-check.md
├── fixtures/
│   └── (test images)
└── results/
    └── (test evidence)
```

---

## User Story Format

Each test scenario includes user stories from two perspectives:

### Perspective A: User Prompting an Agent
> "As an OpenCode user, I want [goal], so [benefit]."

### Perspective B: Agent Using Tools
> "As an agent, I need [capability], so [outcome]."

---

## Prerequisites

### Environment Setup
```bash
# Install dependencies (Ubuntu/Debian)
sudo apt-get install xdotool x11-apps ffmpeg

# For nested sessions (optional)
sudo apt-get install xserver-xephyr evilwm

# Set API keys (at least one required)
export OH_SNAP_ALIBABA_API_KEY="sk-xxx"
export OH_SNAP_OPENAI_API_KEY="sk-xxx"
export OH_SNAP_ANTHROPIC_API_KEY="sk-ant-xxx"
```

### Build the Project
```bash
cd /home/krang/proj/oh_snap
npm install
npm run build
```

---

## E2E Test Execution

### Quick Test (No API Required)
```bash
# Test: list_models
opencode --mcp-tool oh_snap list_models '{"include_descriptions": true}'

# Test: health_check
opencode --mcp-tool oh_snap health_check '{}'

# Test: list_windows
opencode --mcp-tool oh_snap list_windows '{}'

# Test: capture_screen
opencode --mcp-tool oh_snap capture_screen '{}'
```

### Full Test (API Key Required)
```bash
# Test: analyze_screenshot
opencode --mcp-tool oh_snap analyze_screenshot '{
  "image_source": "reigns-final.png",
  "prompt": "Describe this image",
  "model": "kimi-k2.5"
}'

# Test: extract_text_from_screenshot
opencode --mcp-tool oh_snap extract_text_from_screenshot '{
  "image_source": "reigns-final.png"
}'

# Test: capture_window
opencode --mcp-tool oh_snap capture_window '{"window_class": "firefox"}'
```

---

## Test Results Summary

| Test | Status | Notes |
|------|--------|-------|
| list_models | ⏳ Pending | |
| health_check | ⏳ Pending | |
| list_windows | ⏳ Pending | |
| capture_screen | ⏳ Pending | |
| capture_window | ⏳ Pending | |
| analyze_screenshot | ⏳ Pending | |
| extract_text | ⏳ Pending | |
| nested sessions | ⏳ Pending | Requires Xephyr |

---

## Viewing Reports

Use `glow` to render markdown in terminal:

```bash
# View test plan
glow .scratchpad/TEST-PLAN.md

# View specific scenario
glow .scratchpad/scenarios/01-multi-provider-support.md
```

---

## Success Criteria

### Per-Feature Criteria
- All security-related tests pass (blacklist, API key validation)
- Core functionality works with at least one provider
- Nested session lifecycle completes without resource leaks
- No regression in existing functionality

### Overall Pass Criteria
- ✅ All test scenarios documented
- ✅ E2E tests executed successfully
- ✅ Evidence captured for each test
- ✅ Issues documented with reproduction steps

---

## Issue Tracking

| Issue ID | Feature | Description | Status |
|----------|---------|-------------|--------|
| | | | |

---

## Changelog

| Date | Change |
|------|--------|
| 2026-03-25 | Initial test plan created |
| 2026-03-25 | 10 test scenario files written |