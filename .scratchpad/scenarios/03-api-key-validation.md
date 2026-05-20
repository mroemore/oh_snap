# Test Scenario 03: API Key Validation Per Provider

**Feature**: Provider-specific API key validation
**Priority**: High
**Status**: Pending
**Category**: Security/Configuration

---

## Overview

oh_snap validates API keys for each provider (Alibaba, OpenAI, Anthropic) with specific format requirements. This test validates key detection, format validation, and error messaging for each provider.

---

## User Stories

### Perspective A: OpenCode User Prompting an Agent

> **Story 3.1**: "As a new user, I want clear feedback when my API key is missing or invalid, so I can fix configuration issues quickly without debugging."

> **Story 3.2**: "As a user migrating from another tool, I want oh_snap to recognize my existing OPENAI_API_KEY environment variable, so setup is minimal."

> **Story 3.3**: "As a security-conscious user, I want my API keys masked in logs and error messages, so they aren't exposed in screenshots or logs."

### Perspective B: Agent Parsing NL Query and Using Tools

> **Story 3.4**: "As an agent, I need to check if a provider is configured before attempting API calls, so I can gracefully handle missing credentials."

> **Story 3.5**: "As an agent, I need to validate key format before making API requests, so I can provide helpful errors instead of API failures."

> **Story 3.6**: "As an agent, I need to know which providers are available, so I can suggest working alternatives when a preferred provider is unavailable."

---

## Test Cases

### TC-03.1: Provider Key Format Validation

| Provider | Environment Variable | Valid Prefix | Min Length | Valid Example |
|----------|---------------------|--------------|------------|---------------|
| Alibaba | `OH_SNAP_ALIBABA_API_KEY` | `sk-` | 20 | `sk-sp-xxxxxxxxxxxxx` |
| Alibaba | `ALIBABA_VISION_API_KEY` (fallback) | `sk-` | 20 | `sk-sp-xxxxxxxxxxxxx` |
| OpenAI | `OH_SNAP_OPENAI_API_KEY` | `sk-` | 20 | `sk-xxxxxxxxxxxxxxxxx` |
| OpenAI | `OPENAI_API_KEY` (fallback) | `sk-` | 20 | `sk-xxxxxxxxxxxxxxxxx` |
| Anthropic | `OH_SNAP_ANTHROPIC_API_KEY` | `sk-ant-` | 20 | `sk-ant-xxxxxxxxxxxxx` |
| Anthropic | `ANTHROPIC_API_KEY` (fallback) | `sk-ant-` | 20 | `sk-ant-xxxxxxxxxxxxx` |

---

### TC-03.2: Missing Key Detection

**Preconditions**: No API keys set

**Steps**:
1. Call `health_check()`

**Expected Result**:
```json
{
  "status": "unhealthy",
  "api_keys": {
    "alibaba": { "configured": false, "format": "missing" },
    "openai": { "configured": false, "format": "missing" },
    "anthropic": { "configured": false, "format": "missing" }
  },
  "error": "No API keys configured. Set at least one of: OH_SNAP_ALIBABA_API_KEY, OH_SNAP_OPENAI_API_KEY, OH_SNAP_ANTHROPIC_API_KEY"
}
```

---

### TC-03.3: Invalid Key Format Detection

**Preconditions**: 
- `OH_SNAP_OPENAI_API_KEY="invalid-key-123"`
- `OH_SNAP_ANTHROPIC_API_KEY="also-invalid"`

**Steps**:
1. Call `health_check()`

**Expected Result**:
```json
{
  "status": "unhealthy",
  "api_keys": {
    "openai": { "configured": true, "format": "invalid" },
    "anthropic": { "configured": true, "format": "invalid" }
  }
}
```

---

### TC-03.4: Fallback Environment Variable

**Preconditions**:
- `OPENAI_API_KEY="sk-valid-key-here"` (standard env var, not OH_SNAP_ prefixed)
- `OH_SNAP_OPENAI_API_KEY` NOT set

**Steps**:
1. Call `health_check()`
2. Call `analyze_screenshot()` with `model="gpt-4o"`

**Expected Result**:
- OpenAI shows as configured
- API calls succeed using fallback key

---

### TC-03.5: API Key Obfuscation in Logs

**Preconditions**: Valid API key set

**Steps**:
1. Make an API call that produces an error
2. Check stderr logs

**Expected Result**:
- Key is obfuscated: `sk-sp-***...***xxx` (first 6 and last 3 chars visible)
- Full key never appears in logs

---

### TC-03.6: Graceful Degradation with Multiple Providers

**Preconditions**:
- OpenAI key valid
- Anthropic key invalid format
- Alibaba key missing

**Steps**:
1. Call `health_check()`
2. Attempt analysis with `model="claude-sonnet-4-6"`

**Expected Result**:
- Health check shows mixed status
- Claude call fails with helpful error
- User can still use OpenAI models

---

## E2E Test Commands

```bash
# Test 1: Health check with no keys
unset OH_SNAP_ALIBABA_API_KEY OH_SNAP_OPENAI_API_KEY OH_SNAP_ANTHROPIC_API_KEY
opencode --mcp-tool oh_snap health_check '{}'

# Test 2: Set valid OpenAI key
export OH_SNAP_OPENAI_API_KEY="sk-test-key-12345678901234567890"
opencode --mcp-tool oh_snap health_check '{}'

# Test 3: Test invalid key format
export OH_SNAP_ANTHROPIC_API_KEY="invalid-format"
opencode --mcp-tool oh_snap health_check '{}'

# Test 4: Test fallback environment variable
unset OH_SNAP_OPENAI_API_KEY
export OPENAI_API_KEY="sk-test-key-12345678901234567890"
opencode --mcp-tool oh_snap health_check '{}'

# Test 5: Attempt API call with missing provider
export OH_SNAP_OPENAI_API_KEY="sk-valid-key"
opencode --mcp-tool oh_snap analyze_screenshot '{
  "image_source": ".scratchpad/fixtures/sample-test.png",
  "prompt": "Describe",
  "model": "kimi-k2.5"
}'
# Should error about missing Alibaba key
```

---

## Test Evidence

### Screenshot 1: health_check with No Keys
![no keys](../results/screenshots/03-no-keys.png)

### Screenshot 2: health_check with Invalid Format
![invalid format](../results/screenshots/03-invalid-format.png)

### Screenshot 3: Obfuscated Key in Logs
![obfuscated key](../results/screenshots/03-obfuscated-key.png)

---

## Success Criteria

- [ ] Missing keys detected and reported
- [ ] Invalid key formats detected (wrong prefix, too short)
- [ ] Fallback environment variables work
- [ ] API keys are obfuscated in all logs
- [ ] Health check provides actionable error messages
- [ ] System works with partial configuration (some providers configured)

---

## Configuration Reference

### Environment Variable Priority (highest to lowest)

| Provider | Primary | Fallback |
|----------|---------|----------|
| Alibaba | `OH_SNAP_ALIBABA_API_KEY` | `ALIBABA_VISION_API_KEY` |
| OpenAI | `OH_SNAP_OPENAI_API_KEY` | `OPENAI_API_KEY` |
| Anthropic | `OH_SNAP_ANTHROPIC_API_KEY` | `ANTHROPIC_API_KEY` |

### Key Format Rules

1. **Alibaba**: Must start with `sk-` and be ≥20 characters
2. **OpenAI**: Must start with `sk-` and be ≥20 characters  
3. **Anthropic**: Must start with `sk-ant-` and be ≥20 characters