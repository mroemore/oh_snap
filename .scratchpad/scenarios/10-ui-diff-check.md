# Test Scenario 10: UI Diff Checking

**Feature**: Compare two UI screenshots to identify visual differences
**Priority**: Medium
**Status**: Pending
**Category**: Vision Analysis

---

## Overview

oh_snap provides UI diff checking capabilities to compare expected/reference UI designs with actual implementations, identifying visual differences and implementation discrepancies for QA purposes.

---

## User Stories

### Perspective A: OpenCode User Prompting an Agent

> **Story 10.1**: "As a QA engineer, I want to compare a design mockup with the implemented UI, so I can identify visual regressions."

> **Story 10.2**: "As a frontend developer, I want to verify my implementation matches the design, so I can ensure quality before merging."

> **Story 10.3**: "As a product manager, I want to know if the UI matches the specification, so I can approve releases confidently."

### Perspective B: Agent Parsing NL Query and Using Tools

> **Story 10.4**: "As an agent, I need to compare two images and identify differences, so I can report discrepancies accurately."

> **Story 10.5**: "As an agent, I need to categorize differences by severity, so users can prioritize fixes."

> **Story 10.6**: "As an agent, I need to provide actionable recommendations, so developers know what to change."

---

## Test Cases

### TC-10.1: Identical UI Comparison

**Preconditions**: Two screenshots of the same UI (expected to match)

**Steps**:
```bash
opencode --mcp-tool oh_snap ui_diff_check '{
  "expected_image_source": ".scratchpad/fixtures/ui-expected.png",
  "actual_image_source": ".scratchpad/fixtures/ui-actual-identical.png",
  "prompt": "Are there any visual differences?"
}'
```

**Expected Result**:
```markdown
## UI Comparison Result

**Status**: ✅ Match

The actual implementation matches the expected design with no visual differences detected.

### Summary
- Colors: ✓ Match
- Layout: ✓ Match
- Typography: ✓ Match
- Spacing: ✓ Match
```

---

### TC-10.2: Color Difference Detection

**Preconditions**: Screenshots with different colors

**Steps**:
```bash
opencode --mcp-tool oh_snap ui_diff_check '{
  "expected_image_source": ".scratchpad/fixtures/ui-expected.png",
  "actual_image_source": ".scratchpad/fixtures/ui-different-color.png",
  "prompt": "Focus on color differences"
}'
```

**Expected Result**:
- Color differences identified
- Specific elements noted
- Hex/RGB values if determinable
- Severity: Minor/Moderate

---

### TC-10.3: Layout Difference Detection

**Preconditions**: Screenshots with different layouts

**Steps**:
```bash
opencode --mcp-tool oh_snap ui_diff_check '{
  "expected_image_source": ".scratchpad/fixtures/ui-expected.png",
  "actual_image_source": ".scratchpad/fixtures/ui-different-layout.png",
  "prompt": "Check layout and positioning"
}'
```

**Expected Result**:
- Element position differences
- Spacing issues
- Alignment problems
- Severity: Moderate/Critical

---

### TC-10.4: Missing Element Detection

**Preconditions**: Actual UI missing an element from expected

**Steps**:
```bash
opencode --mcp-tool oh_snap ui_diff_check '{
  "expected_image_source": ".scratchpad/fixtures/ui-expected.png",
  "actual_image_source": ".scratchpad/fixtures/ui-missing-element.png",
  "prompt": "Is everything present?"
}'
```

**Expected Result**:
```markdown
## UI Comparison Result

**Status**: ❌ Differences Found

### Missing Elements
1. **Search Button** - Present in expected, missing in actual
   - Location: Top navigation bar
   - Severity: Critical

2. **Footer Links** - "Privacy Policy" link missing
   - Location: Footer section
   - Severity: Moderate

### Recommendations
- Add search button to navigation
- Add missing footer link
```

---

### TC-10.5: Extra Element Detection

**Preconditions**: Actual UI has extra elements not in expected

**Steps**:
```bash
opencode --mcp-tool oh_snap ui_diff_check '{
  "expected_image_source": ".scratchpad/fixtures/ui-expected.png",
  "actual_image_source": ".scratchpad/fixtures/ui-extra-element.png",
  "prompt": "Is anything extra present?"
}'
```

**Expected Result**:
- Extra elements identified
- Potential causes (ads, notifications, debug info)
- Severity assessment

---

### TC-10.6: Typography Difference Detection

**Preconditions**: Screenshots with different fonts/typography

**Steps**:
```bash
opencode --mcp-tool oh_snap ui_diff_check '{
  "expected_image_source": ".scratchpad/fixtures/ui-expected.png",
  "actual_image_source": ".scratchpad/fixtures/ui-different-font.png",
  "prompt": "Check typography and text styling"
}'
```

**Expected Result**:
- Font family differences
- Font size differences
- Font weight differences
- Text color differences

---

### TC-10.7: Responsive/Size Comparison

**Preconditions**: Same UI at different viewport sizes

**Steps**:
```bash
opencode --mcp-tool oh_snap ui_diff_check '{
  "expected_image_source": ".scratchpad/fixtures/ui-desktop.png",
  "actual_image_source": ".scratchpad/fixtures/ui-mobile.png",
  "prompt": "Compare responsive behavior"
}'
```

**Expected Result**:
- Layout changes acknowledged
- Responsive behavior validated
- Mobile-specific differences noted
- Context-aware analysis

---

### TC-10.8: Dark Mode Comparison

**Preconditions**: Expected in light mode, actual in dark mode (or vice versa)

**Steps**:
```bash
opencode --mcp-tool oh_snap ui_diff_check '{
  "expected_image_source": ".scratchpad/fixtures/ui-light.png",
  "actual_image_source": ".scratchpad/fixtures/ui-dark.png",
  "prompt": "Is this just a theme difference?"
}'
```

**Expected Result**:
- Theme difference recognized
- Functional differences still checked
- Color contrast noted
- Severity appropriate (likely minor if intentional)

---

## Severity Classification

| Severity | Description | Examples |
|----------|-------------|----------|
| **Critical** | Blocks functionality, major UX issue | Missing buttons, broken layout, wrong page |
| **Moderate** | Noticeable, affects experience | Color mismatch, wrong font, alignment off |
| **Minor** | Cosmetic, barely noticeable | 1-2px spacing, slight shade difference |

---

## E2E Test Commands

```bash
#!/bin/bash
echo "=== UI Diff Check E2E Test ==="

# Test 1: Identical UI
echo "1. Testing identical UI..."
opencode --mcp-tool oh_snap ui_diff_check '{
  "expected_image_source": ".scratchpad/fixtures/ui-expected.png",
  "actual_image_source": ".scratchpad/fixtures/ui-expected.png",
  "prompt": "Check for any differences"
}'

# Test 2: Different UI
echo "2. Testing different UI..."
opencode --mcp-tool oh_snap ui_diff_check '{
  "expected_image_source": ".scratchpad/fixtures/ui-expected.png",
  "actual_image_source": ".scratchpad/fixtures/ui-different.png",
  "prompt": "List all differences"
}'

# Test 3: Capture and compare
echo "3. Capture actual and compare with expected..."
opencode --mcp-tool oh_snap capture_window '{"window_class": "firefox"}'
opencode --mcp-tool oh_snap ui_diff_check '{
  "expected_image_source": ".scratchpad/fixtures/ui-mockup.png",
  "actual_image_source": "last",
  "prompt": "Does the implementation match the design?"
}'

echo "=== Test Complete ==="
```

---

## Test Evidence

### Screenshot 1: Identical UI Match
![identical match](../results/screenshots/10-identical-match.png)

### Screenshot 2: Color Differences
![color diff](../results/screenshots/10-color-diff.png)

### Screenshot 3: Layout Differences
![layout diff](../results/screenshots/10-layout-diff.png)

---

## Success Criteria

- [ ] Identical UIs reported as matching
- [ ] Color differences detected and reported
- [ ] Layout differences detected
- [ ] Missing elements identified
- [ ] Extra elements identified
- [ ] Typography differences detected
- [ ] Severity classification provided
- [ ] Actionable recommendations given
- [ ] Shortcuts work with this tool

---

## Output Template

```markdown
## UI Comparison Result

**Status**: [✅ Match / ❌ Differences Found]

### Summary
- [Category]: [✓ Match / ✗ Difference]
- [Category]: [✓ Match / ✗ Difference]

### Differences Found (if any)
1. **[Element Name]**
   - Expected: [description]
   - Actual: [description]
   - Severity: [Critical/Moderate/Minor]
   - Location: [where in UI]

### Recommendations
- [Actionable fix suggestions]
```