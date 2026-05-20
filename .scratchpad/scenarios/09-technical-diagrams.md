# Test Scenario 09: Technical Diagram Understanding

**Feature**: Analyze and explain technical diagrams (architecture, flowcharts, UML, ER diagrams)
**Priority**: Medium
**Status**: Pending
**Category**: Vision Analysis

---

## Overview

oh_snap provides specialized analysis for technical diagrams, helping users understand architecture drawings, flowcharts, UML diagrams, ER diagrams, and other technical visualizations.

---

## User Stories

### Perspective A: OpenCode User Prompting an Agent

> **Story 9.1**: "As a developer joining a new team, I want to understand the system architecture from a diagram, so I can quickly get up to speed."

> **Story 9.2**: "As a technical writer, I want to describe a flowchart in text, so I can document the process in a README."

> **Story 9.3**: "As a database analyst, I want to understand an ER diagram's relationships, so I can write the correct queries."

### Perspective B: Agent Parsing NL Query and Using Tools

> **Story 9.4**: "As an agent, I need to identify diagram types and extract structured information, so I can provide accurate analysis."

> **Story 9.5**: "As an agent, I need to explain component relationships, so users understand how parts connect."

> **Story 9.6**: "As an agent, I need to identify flows and decision points in diagrams, so I can explain processes."

---

## Test Cases

### TC-09.1: Architecture Diagram Analysis

**Preconditions**: Screenshot of system architecture diagram

**Steps**:
```bash
opencode --mcp-tool oh_snap understand_technical_diagram '{
  "image_source": ".scratchpad/fixtures/architecture-diagram.png",
  "diagram_type": "architecture",
  "prompt": "Explain the main components and how they interact"
}'
```

**Expected Result**:
```markdown
## Architecture Overview

This diagram shows a microservices architecture with the following components:

### Components
1. **API Gateway** - Entry point for all client requests
2. **Auth Service** - Handles authentication and authorization
3. **User Service** - Manages user data and profiles
4. **Order Service** - Processes orders and payments
5. **Database Cluster** - Primary data storage

### Data Flow
1. Client → API Gateway
2. API Gateway → Auth Service (validate token)
3. API Gateway → User Service (get user data)
4. User Service → Database (read/write)

### Key Patterns
- Service isolation (each microservice is independent)
- Centralized authentication
- Database per service pattern
```

---

### TC-09.2: Flowchart Analysis

**Preconditions**: Screenshot of a process flowchart

**Steps**:
```bash
opencode --mcp-tool oh_snap understand_technical_diagram '{
  "image_source": ".scratchpad/fixtures/flowchart.png",
  "diagram_type": "flowchart",
  "prompt": "What are the decision points and possible paths?"
}'
```

**Expected Result**:
- Start/end points identified
- Decision diamonds with conditions
- All paths enumerated
- Process steps listed in order

---

### TC-09.3: UML Class Diagram

**Preconditions**: Screenshot of UML class diagram

**Steps**:
```bash
opencode --mcp-tool oh_snap understand_technical_diagram '{
  "image_source": ".scratchpad/fixtures/uml-class.png",
  "diagram_type": "uml",
  "prompt": "List all classes, their attributes, methods, and relationships"
}'
```

**Expected Result**:
```markdown
## Classes

### User
- **Attributes**: id, name, email, createdAt
- **Methods**: login(), logout(), updateProfile()

### Order
- **Attributes**: id, userId, total, status
- **Methods**: calculateTotal(), submit(), cancel()

## Relationships
- User → Order: One-to-Many (a user has many orders)
- Order → Product: Many-to-Many (orders contain products)
```

---

### TC-09.4: ER Diagram Analysis

**Preconditions**: Screenshot of Entity-Relationship diagram

**Steps**:
```bash
opencode --mcp-tool oh_snap understand_technical_diagram '{
  "image_source": ".scratchpad/fixtures/er-diagram.png",
  "diagram_type": "er-diagram",
  "prompt": "What are the entities and their relationships? Write the SQL to create these tables."
}'
```

**Expected Result**:
- Entities listed with attributes
- Primary/foreign keys identified
- Relationship cardinalities
- SQL CREATE statements

---

### TC-09.5: Sequence Diagram

**Preconditions**: Screenshot of sequence diagram

**Steps**:
```bash
opencode --mcp-tool oh_snap understand_technical_diagram '{
  "image_source": ".scratchpad/fixtures/sequence-diagram.png",
  "diagram_type": "sequence",
  "prompt": "Describe the message flow between actors"
}'
```

**Expected Result**:
- Actors/participants listed
- Messages in order
- Response flows
- Time ordering clear

---

### TC-09.6: Auto-Detection of Diagram Type

**Preconditions**: Screenshot of unknown diagram type

**Steps**:
```bash
opencode --mcp-tool oh_snap understand_technical_diagram '{
  "image_source": ".scratchpad/fixtures/unknown-diagram.png",
  "diagram_type": "auto",
  "prompt": "What type of diagram is this and what does it show?"
}'
```

**Expected Result**:
- Diagram type detected automatically
- Appropriate analysis provided
- If uncertain, mentions confidence level

---

### TC-09.7: Complex Diagram with Multiple Types

**Preconditions**: Screenshot combining multiple diagram elements

**Steps**:
```bash
opencode --mcp-tool oh_snap understand_technical_diagram '{
  "image_source": ".scratchpad/fixtures/complex-diagram.png",
  "prompt": "Explain this diagram comprehensively"
}'
```

**Expected Result**:
- All elements identified
- Hybrid nature acknowledged
- Multiple analysis perspectives provided

---

### TC-09.8: Low Quality/Unclear Diagram

**Preconditions**: Screenshot of blurry or low-resolution diagram

**Steps**:
```bash
opencode --mcp-tool oh_snap understand_technical_diagram '{
  "image_source": ".scratchpad/fixtures/blurry-diagram.png",
  "prompt": "Describe what you can see"
}'
```

**Expected Result**:
- Best-effort analysis
- Acknowledgment of image quality issues
- Request for clearer image if needed

---

## Supported Diagram Types

| Type | Description | Best For |
|------|-------------|----------|
| `architecture` | System/component diagrams | Understanding system structure |
| `flowchart` | Process flow diagrams | Understanding workflows |
| `uml` | Class, use case, activity diagrams | OOP design understanding |
| `er-diagram` | Entity-relationship diagrams | Database schema understanding |
| `sequence` | Sequence/timing diagrams | Understanding interactions |
| `auto` | Automatic detection | Unknown diagram types |

---

## E2E Test Commands

```bash
#!/bin/bash
echo "=== Technical Diagram Understanding E2E Test ==="

# Test 1: Architecture diagram
echo "1. Analyzing architecture diagram..."
opencode --mcp-tool oh_snap understand_technical_diagram '{
  "image_source": ".scratchpad/fixtures/architecture-diagram.png",
  "diagram_type": "architecture",
  "prompt": "What are the main components?"
}'

# Test 2: Flowchart
echo "2. Analyzing flowchart..."
opencode --mcp-tool oh_snap understand_technical_diagram '{
  "image_source": ".scratchpad/fixtures/flowchart.png",
  "diagram_type": "flowchart",
  "prompt": "What are the decision points?"
}'

# Test 3: Auto-detection
echo "3. Auto-detecting diagram type..."
opencode --mcp-tool oh_snap understand_technical_diagram '{
  "image_source": ".scratchpad/fixtures/er-diagram.png",
  "diagram_type": "auto",
  "prompt": "What does this diagram represent?"
}'

# Test 4: From capture
echo "4. Capture and analyze..."
opencode --mcp-tool oh_snap capture_window '{"window_class": "draw.io"}'
opencode --mcp-tool oh_snap understand_technical_diagram '{
  "image_source": "last",
  "prompt": "Explain this diagram"
}'

echo "=== Test Complete ==="
```

---

## Test Evidence

### Screenshot 1: Architecture Diagram Analysis
![architecture](../results/screenshots/09-architecture.png)

### Screenshot 2: Flowchart Analysis
![flowchart](../results/screenshots/09-flowchart.png)

### Screenshot 3: ER Diagram Analysis
![er-diagram](../results/screenshots/09-er-diagram.png)

---

## Success Criteria

- [ ] Architecture diagrams analyzed with components and flows
- [ ] Flowcharts with decision points explained
- [ ] UML diagrams with classes and relationships extracted
- [ ] ER diagrams with entities and SQL generated
- [ ] Sequence diagrams with message flows described
- [ ] Auto-detection works for known diagram types
- [ ] Complex diagrams handled appropriately
- [ ] Low-quality images handled gracefully
- [ ] Shortcuts work with this tool

---

## Output Template

```markdown
## Diagram Overview
[What this diagram represents]

## Components/Entities
[List of main elements]

## Relationships/Flows
[How elements connect or interact]

## Key Insights
[Important observations]

## Recommendations (if applicable)
[Suggestions for improvement or understanding]
```