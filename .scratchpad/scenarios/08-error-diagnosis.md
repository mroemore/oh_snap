# Test Scenario 08: Error Screenshot Diagnosis

**Feature**: Analyze and diagnose error screenshots with actionable solutions
**Priority**: Medium
**Status**: Pending
**Category**: Vision Analysis

---

## Overview

oh_snap provides specialized error diagnosis for screenshots containing error messages, stack traces, and exception outputs. It extracts the error information and provides actionable debugging solutions.

---

## User Stories

### Perspective A: OpenCode User Prompting an Agent

> **Story 8.1**: "As a developer encountering a runtime error, I want to screenshot the error and get help fixing it, so I can resolve issues faster without searching Stack Overflow manually."

> **Story 8.2**: "As a beginner programmer, I want to understand what an error means in plain English, so I can learn from my mistakes."

> **Story 8.3**: "As a developer in a new codebase, I want context-aware error analysis, so I can understand errors specific to this project."

### Perspective B: Agent Parsing NL Query and Using Tools

> **Story 8.4**: "As an agent, I need to analyze error screenshots and provide structured diagnoses, so users can take action immediately."

> **Story 8.5**: "As an agent, I need to extract error type, message, and stack trace, so I can identify the root cause."

> **Story 8.6**: "As an agent, I need to provide step-by-step solutions, so users can fix issues without additional research."

---

## Test Cases

### TC-08.1: Python Exception Diagnosis

**Preconditions**: Screenshot of Python traceback

**Steps**:
```bash
opencode --mcp-tool oh_snap diagnose_error_screenshot '{
  "image_source": ".scratchpad/fixtures/python-error.png",
  "context": "Running Flask web application"
}'
```

**Expected Result**:
```markdown
## Error Analysis

**Error Type**: `NameError`
**Message**: name 'undefined_variable' is not defined
**Location**: app.py, line 42

## Root Cause
The variable `undefined_variable` is referenced before being assigned.

## Solutions
1. Define the variable before use
2. Check for typos in variable name
3. Ensure the variable is in scope

## Code Fix
```python
# Before (line 42)
return undefined_variable

# After
result = get_result()  # Define first
return result
```

## Prevention Tips
- Use an IDE with linting to catch undefined variables
- Run static type checkers like mypy
```

---

### TC-08.2: JavaScript Console Error

**Preconditions**: Screenshot of browser console error

**Steps**:
```bash
opencode --mcp-tool oh_snap diagnose_error_screenshot '{
  "image_source": ".scratchpad/fixtures/js-console-error.png",
  "context": "React application in development mode"
}'
```

**Expected Result**:
- Error type identified (e.g., `TypeError`, `ReferenceError`)
- Component/location identified
- React-specific guidance provided
- Common causes listed

---

### TC-08.3: Build/Compilation Error

**Preconditions**: Screenshot of build failure

**Steps**:
```bash
opencode --mcp-tool oh_snap diagnose_error_screenshot '{
  "image_source": ".scratchpad/fixtures/build-error.png",
  "context": "TypeScript compilation"
}'
```

**Expected Result**:
- Compilation error type
- File and line number
- TypeScript-specific solutions
- Type mismatch explanation if applicable

---

### TC-08.4: Database Error

**Preconditions**: Screenshot of SQL/database error

**Steps**:
```bash
opencode --mcp-tool oh_snap diagnose_error_screenshot '{
  "image_source": ".scratchpad/fixtures/db-error.png",
  "context": "PostgreSQL query execution"
}'
```

**Expected Result**:
- SQL error code and message
- Query problem identified
- Syntax or constraint explanation
- Fix suggestions

---

### TC-08.5: Network/API Error

**Preconditions**: Screenshot of HTTP error or API failure

**Steps**:
```bash
opencode --mcp-tool oh_snap diagnose_error_screenshot '{
  "image_source": ".scratchpad/fixtures/api-error.png",
  "context": "REST API call to external service"
}'
```

**Expected Result**:
- HTTP status code meaning
- Common causes for the error
- Debugging steps (check network, auth, etc.)
- Retry/recovery suggestions

---

### TC-08.6: Multi-Error Screenshot

**Preconditions**: Screenshot showing multiple errors

**Steps**:
```bash
opencode --mcp-tool oh_snap diagnose_error_screenshot '{
  "image_source": ".scratchpad/fixtures/multi-errors.png"
}'
```

**Expected Result**:
- All errors identified
- Primary/first error emphasized
- Cascading effects explained
- Fix order suggested

---

### TC-08.7: Partial Error Context

**Preconditions**: Screenshot showing only part of error

**Steps**:
```bash
opencode --mcp-tool oh_snap diagnose_error_screenshot '{
  "image_source": ".scratchpad/fixtures/partial-error.png",
  "context": "Docker container logs"
}'
```

**Expected Result**:
- Best-effort diagnosis
- Request for more context if needed
- Likely causes based on visible portion

---

### TC-08.8: Non-Error Screenshot Handling

**Preconditions**: Screenshot that doesn't contain an error

**Steps**:
```bash
opencode --mcp-tool oh_snap diagnose_error_screenshot '{
  "image_source": ".scratchpad/fixtures/no-error.png"
}'
```

**Expected Result**:
- Recognition that no error is visible
- Suggestion to use different tool (e.g., `analyze_screenshot`)
- Description of what is visible instead

---

## Output Structure

The diagnosis should follow this structure:

```markdown
## Error Analysis
- **Error Type**: Classification of the error
- **Message**: The error message text
- **Location**: File/line/component if visible

## Root Cause
Explanation of why this error occurred

## Solutions
1. Step-by-step fix
2. Alternative approaches
3. Quick fixes vs proper fixes

## Code Fix (if applicable)
```language
// Corrected code
```

## Prevention Tips
How to avoid this error in the future
```

---

## E2E Test Commands

```bash
#!/bin/bash
echo "=== Error Diagnosis E2E Test ==="

# Test 1: Capture error from terminal and diagnose
echo "1. Capture terminal error and diagnose..."
opencode --mcp-tool oh_snap capture_window '{"window_class": "terminal"}'
opencode --mcp-tool oh_snap diagnose_error_screenshot '{
  "image_source": "last",
  "context": "Running npm install"
}'

# Test 2: Diagnose from file
echo "2. Diagnose from saved screenshot..."
opencode --mcp-tool oh_snap diagnose_error_screenshot '{
  "image_source": ".scratchpad/fixtures/python-error.png",
  "context": "Flask web application"
}'

# Test 3: No context provided
echo "3. Diagnose without context..."
opencode --mcp-tool oh_snap diagnose_error_screenshot '{
  "image_source": ".scratchpad/fixtures/generic-error.png"
}'

echo "=== Test Complete ==="
```

---

## Test Evidence

### Screenshot 1: Python Error Diagnosis
![python error](../results/screenshots/08-python-error.png)

### Screenshot 2: JavaScript Error Diagnosis
![js error](../results/screenshots/08-js-error.png)

### Screenshot 3: Build Error Diagnosis
![build error](../results/screenshots/08-build-error.png)

---

## Success Criteria

- [ ] Error type correctly identified
- [ ] Error message extracted accurately
- [ ] Root cause explained clearly
- [ ] Actionable solutions provided
- [ ] Code fixes suggested when applicable
- [ ] Context improves diagnosis quality
- [ ] Multiple errors handled appropriately
- [ ] Non-error screenshots handled gracefully
- [ ] Prevention tips are relevant

---

## Context Examples

| Context Value | When to Use |
|---------------|-------------|
| `"Running tests with pytest"` | Python test failures |
| `"npm install"` | Node.js dependency issues |
| `"Docker build"` | Container build failures |
| `"React development server"` | Frontend errors |
| `"Database migration"` | SQL/ORM errors |
| `"CI/CD pipeline"` | Build/deploy failures |

---

## Comparison with extract_text_from_screenshot

| Feature | diagnose_error_screenshot | extract_text_from_screenshot |
|---------|---------------------------|------------------------------|
| Output | Analysis + solutions | Raw text |
| Value-add | Explains what's wrong | Enables search/copy |
| Context-aware | Yes | Limited |
| Best for | Debugging | Transcription |