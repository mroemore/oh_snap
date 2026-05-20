# Test Scenario 07: OCR Text Extraction

**Feature**: Extract text from screenshots using vision model OCR
**Priority**: Medium
**Status**: Pending
**Category**: Vision Analysis

---

## Overview

oh_snap provides specialized OCR capabilities for extracting text from screenshots. This is particularly useful for code, terminal output, documentation, and general text extraction scenarios.

---

## User Stories

### Perspective A: OpenCode User Prompting an Agent

> **Story 7.1**: "As a developer debugging an error, I want to extract the error message from a screenshot, so I can search for solutions without manually transcribing."

> **Story 7.2**: "As a user reading documentation in an image, I want to extract all the text, so I can copy-paste it into my notes."

> **Story 7.3**: "As a developer reviewing a code screenshot, I want the code extracted with proper formatting, so I can run or analyze it."

### Perspective B: Agent Parsing NL Query and Using Tools

> **Story 7.4**: "As an agent, I need to extract text from screenshots with proper formatting, so I can analyze or search the content."

> **Story 7.5**: "As an agent, I need to handle code specifically with syntax awareness, so formatting is preserved."

> **Story 7.6**: "As an agent, I need to extract text from terminal output, so I can parse command results programmatically."

---

## Test Cases

### TC-07.1: Basic Text Extraction

**Preconditions**: Screenshot containing readable text

**Steps**:
```bash
opencode --mcp-tool oh_snap extract_text_from_screenshot '{
  "image_source": ".scratchpad/fixtures/sample-text.png"
}'
```

**Expected Result**:
- All visible text extracted
- Proper formatting preserved
- No hallucinated text

---

### TC-07.2: Code Extraction with Language Hint

**Preconditions**: Screenshot of Python code

**Steps**:
```bash
opencode --mcp-tool oh_snap extract_text_from_screenshot '{
  "image_source": ".scratchpad/fixtures/sample-python-code.png",
  "programming_language": "python"
}'
```

**Expected Result**:
- Code extracted with proper indentation
- Python syntax recognized
- Comments preserved
- Import statements at top

---

### TC-07.3: Terminal Output Extraction

**Preconditions**: Screenshot of terminal with command output

**Steps**:
```bash
opencode --mcp-tool oh_snap extract_text_from_screenshot '{
  "image_source": ".scratchpad/fixtures/sample-terminal.png",
  "context": "terminal output"
}'
```

**Expected Result**:
- Command prompt preserved (e.g., `$`, `#`, `(venv)`)
- Output formatted correctly
- ANSI colors may be noted but not preserved as text

---

### TC-07.4: Error Message Extraction

**Preconditions**: Screenshot of error/stack trace

**Steps**:
```bash
opencode --mcp-tool oh_snap extract_text_from_screenshot '{
  "image_source": ".scratchpad/fixtures/sample-error.png",
  "context": "error message"
}'
```

**Expected Result**:
- Error type extracted (e.g., "TypeError", "NullPointerException")
- Stack trace formatted
- Line numbers preserved
- File paths extracted

---

### TC-07.5: Mixed Content Extraction

**Preconditions**: Screenshot with text and images mixed

**Steps**:
```bash
opencode --mcp-tool oh_snap extract_text_from_screenshot '{
  "image_source": ".scratchpad/fixtures/sample-mixed.png"
}'
```

**Expected Result**:
- Text extracted
- Visual elements described briefly or skipped
- Logical flow maintained

---

### TC-07.6: Small/Blurry Text Handling

**Preconditions**: Screenshot with small or slightly blurry text

**Steps**:
```bash
opencode --mcp-tool oh_snap extract_text_from_screenshot '{
  "image_source": ".scratchpad/fixtures/sample-small-text.png"
}'
```

**Expected Result**:
- Best effort extraction
- Uncertain characters marked or noted
- Context used to infer ambiguous characters

---

### TC-07.7: Multi-Language Text

**Preconditions**: Screenshot with text in multiple languages

**Steps**:
```bash
opencode --mcp-tool oh_snap extract_text_from_screenshot '{
  "image_source": ".scratchpad/fixtures/sample-multilang.png"
}'
```

**Expected Result**:
- Each language extracted correctly
- Character sets preserved (Latin, CJK, Cyrillic, etc.)

---

### TC-07.8: Table/Structured Data Extraction

**Preconditions**: Screenshot of a table or structured data

**Steps**:
```bash
opencode --mcp-tool oh_snap extract_text_from_screenshot '{
  "image_source": ".scratchpad/fixtures/sample-table.png",
  "context": "table data"
}'
```

**Expected Result**:
- Table structure preserved
- Columns aligned
- Headers identified

---

### TC-07.9: Using Shortcuts with OCR

**Steps**:
```bash
# Capture and extract in two steps
opencode --mcp-tool oh_snap capture_window '{"window_class": "code"}'

opencode --mcp-tool oh_snap extract_text_from_screenshot '{
  "image_source": "last"
}'
```

**Expected Result**:
- Shortcut resolves to captured image
- OCR works on the captured window

---

## Supported Languages for Code

| Language | Parameter Value |
|----------|-----------------|
| Python | `python` |
| JavaScript | `javascript` |
| TypeScript | `typescript` |
| Java | `java` |
| C/C++ | `c`, `cpp` |
| Go | `go` |
| Rust | `rust` |
| Ruby | `ruby` |
| PHP | `php` |
| Shell/Bash | `bash`, `shell` |
| SQL | `sql` |
| HTML/CSS | `html`, `css` |

---

## E2E Test Commands

```bash
#!/bin/bash
echo "=== OCR Text Extraction E2E Test ==="

# Test 1: Basic extraction
echo "1. Basic text extraction..."
opencode --mcp-tool oh_snap capture_screen '{}'
opencode --mcp-tool oh_snap extract_text_from_screenshot '{"image_source": "last"}'

# Test 2: Code extraction
echo "2. Code extraction with language hint..."
opencode --mcp-tool oh_snap extract_text_from_screenshot '{
  "image_source": ".scratchpad/fixtures/sample-python-code.png",
  "programming_language": "python"
}'

# Test 3: Terminal output
echo "3. Terminal output extraction..."
opencode --mcp-tool oh_snap extract_text_from_screenshot '{
  "image_source": ".scratchpad/fixtures/sample-terminal.png",
  "context": "terminal output"
}'

# Test 4: Combined with capture
echo "4. Capture + OCR workflow..."
opencode --mcp-tool oh_snap capture_window '{"window_class": "code"}'
opencode --mcp-tool oh_snap extract_text_from_screenshot '{
  "image_source": "last",
  "programming_language": "typescript"
}'

echo "=== Test Complete ==="
```

---

## Test Evidence

### Screenshot 1: Basic Text Extraction
![basic ocr](../results/screenshots/07-basic-ocr.png)

### Screenshot 2: Code Extraction
![code ocr](../results/screenshots/07-code-ocr.png)

### Screenshot 3: Terminal Output
![terminal ocr](../results/screenshots/07-terminal-ocr.png)

---

## Success Criteria

- [ ] Basic text extracted accurately
- [ ] Code formatted correctly with language hint
- [ ] Terminal output formatted properly
- [ ] Error messages extracted with structure
- [ ] Tables preserved with alignment
- [ ] Mixed content handled appropriately
- [ ] Shortcuts work with OCR tool
- [ ] Context parameter improves extraction quality
- [ ] Multi-language text supported

---

## Comparison with diagnose_error_screenshot

| Feature | extract_text_from_screenshot | diagnose_error_screenshot |
|---------|------------------------------|---------------------------|
| Purpose | Extract text verbatim | Analyze and explain errors |
| Output | Raw text | Diagnosis + solutions |
| Use case | Copy-paste, search | Debug, fix issues |
| Context param | Optional metadata | Error context |