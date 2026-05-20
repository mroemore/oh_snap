# Test Scenario 01: Multi-Provider Support

**Feature**: Multi-provider vision model support (Alibaba, OpenAI, Anthropic)
**Priority**: High
**Status**: Pending
**Added**: v1.0.0-alpha.1 (Most Recent Feature)

---

## Overview

oh_snap supports three vision model providers with automatic routing based on model ID. This test validates the provider selection, routing logic, and API key configuration for each provider.

---

## User Stories

### Perspective A: OpenCode User Prompting an Agent

> **Story 1.1**: "As an OpenCode user, I want to use my existing OpenAI API key to analyze screenshots without setting up Alibaba credentials, so I can leverage my current subscriptions."

> **Story 1.2**: "As a developer, I want to switch between different vision models based on the task complexity, so I can optimize cost and quality."

> **Story 1.3**: "As a new user, I want clear error messages when my API key is missing or invalid, so I can quickly fix configuration issues."

### Perspective B: Agent Parsing NL Query and Using Tools

> **Story 1.4**: "As an agent, I need to route vision requests to the correct provider based on model ID prefix, so API calls succeed without manual configuration."

> **Story 1.5**: "As an agent, I need to validate provider configuration before making API calls, so I can provide helpful error messages to the user."

> **Story 1.6**: "As an agent, I need to list available models with descriptions, so I can recommend the best model for each task."

---

## Test Cases

### TC-01.1: Provider Auto-Routing by Model ID

**Preconditions**: At least one provider API key configured

| Model ID | Expected Provider | Test Command |
|----------|-------------------|--------------|
| `kimi-k2.5` | Alibaba | `analyze_screenshot` with model="kimi-k2.5" |
| `qwen3.5-plus` | Alibaba | `analyze_screenshot` with model="qwen3.5-plus" |
| `gpt-4o` | OpenAI | `analyze_screenshot` with model="gpt-4o" |
| `gpt-4.1` | OpenAI | `analyze_screenshot` with model="gpt-4.1" |
| `gpt-4o-mini` | OpenAI | `analyze_screenshot` with model="gpt-4o-mini" |
| `gpt-5` | OpenAI | `analyze_screenshot` with model="gpt-5" |
| `o3` | OpenAI | `analyze_screenshot` with model="o3" |
| `o4-mini` | OpenAI | `analyze_screenshot` with model="o4-mini" |
| `claude-sonnet-4-6` | Anthropic | `analyze_screenshot` with model="claude-sonnet-4-6" |
| `claude-haiku-3-5` | Anthropic | `analyze_screenshot` with model="claude-haiku-3-5" |
| `claude-opus-4-6` | Anthropic | `analyze_screenshot` with model="claude-opus-4-6" |

**Expected Result**: Each model routes to the correct provider.

---

### TC-01.2: Missing Provider Key Error

**Preconditions**: Only `OH_SNAP_OPENAI_API_KEY` is set, no Alibaba key

**Steps**:
1. Call `analyze_screenshot(image_source="<path>", prompt="...", model="kimi-k2.5")`

**Expected Result**: 
- Error message indicating Alibaba API key not configured
- Helpful message: "Set OH_SNAP_ALIBABA_API_KEY environment variable"

---

### TC-01.3: List Models with Descriptions

**Steps**:
1. Call `list_models(include_descriptions=true)`

**Expected Result**:
- Returns all 11 supported models
- Each model has: `display_name`, `description`, `pros`, `cons`, `best_for`
- Shows default model

---

### TC-01.4: Health Check Validates All Providers

**Steps**:
1. Set `OH_SNAP_OPENAI_API_KEY` (valid format)
2. Set `OH_SNAP_ANTHROPIC_API_KEY` (valid format)  
3. Leave `OH_SNAP_ALIBABA_API_KEY` unset
4. Call `health_check()`

**Expected Result**:
```json
{
  "status": "healthy",
  "api_keys": {
    "alibaba": { "configured": false, "format": "missing" },
    "openai": { "configured": true, "format": "valid" },
    "anthropic": { "configured": true, "format": "valid" }
  }
}
```

---

## E2E Test Commands

```bash
# Test 1: List all available models
opencode --mcp-tool oh_snap list_models '{"include_descriptions": true}'

# Test 2: Health check to see provider status
opencode --mcp-tool oh_snap health_check '{}'

# Test 3: Analyze with specific model (requires API key)
opencode --mcp-tool oh_snap analyze_screenshot '{
  "image_source": ".scratchpad/fixtures/sample-test.png",
  "prompt": "Describe this image in one sentence.",
  "model": "kimi-k2.5"
}'
```

---

## Test Evidence

### Screenshot 1: list_models Output

![list_models output](../results/screenshots/01-list-models.png)

### Screenshot 2: health_check Output

![health_check output](../results/screenshots/01-health-check.png)

---

## Success Criteria

- [ ] All 11 models are listed with correct provider routing
- [ ] Health check correctly identifies configured providers
- [ ] Missing provider key produces helpful error message
- [ ] Provider routing is deterministic based on model ID prefix
- [ ] API key format validation works for all providers

---

## Notes

- Test requires at least one valid API key for full E2E verification
- Mock tests can verify routing logic without API calls
- Focus on recent feature: v1.0.0-alpha.1 multi-provider support