# Plan: Migrate Nested Session X Server Backend from Xephyr to Headless X

- **plan_id**: plan-xserver-backend-abstraction-20260520
- **plan_schema_version**: 2.1
- **maturity_level**: M2
- **status**: draft
- **generated_by**: plan_builder
- **updated_at**: 2026-05-20T00:00:00Z

## Background

The oh_snap MCP nested session subsystem currently uses Xephyr exclusively as its X server backend. Xephyr creates a visible nested window on the host display, which is heavyweight, can flash windows on the user's screen, and introduces unnecessary overhead for automated screenshot capture. The goal is to introduce a backend-agnostic X server abstraction that uses Xvfb (or Xdummy) as the primary headless backend while keeping Xephyr as a backward-compatible fallback.

## Goals

1. Introduce an `XServerBackend` interface with provider implementations for Xvfb, Xdummy, and Xephyr
2. Make Xvfb the default backend for new nested sessions
3. Maintain Xephyr as a fallback when headless backends are unavailable or when interactive debugging is needed
4. Rename Xephyr-specific type fields (`xephyrProcess`, `xephyrPid`) to generic names (`xServerProcess`, `xServerPid`)
5. Update health_check to report on all available X server backends
6. Update all 13 nested-session tool descriptions to remove Xephyr-specific language
7. Update tests to cover the new abstraction and both primary and fallback backends
8. Update README.md and CHANGELOG.md to document the new capability

## Non-Goals

- Changing the nested session API surface (tool names, parameters, return shapes)
- Adding Wayland-native backends (weston, sway)
- Modifying the capture pipeline (xwd→ffmpeg→base64)
- Changing the window manager fallback chain logic

## Scope Boundaries

**In scope**: `src/nested/types.ts`, `src/nested/process-utils.ts`, `src/nested/session-manager.ts`, `src/nested/index.ts`, `src/nested/session-manager.test.ts`, `src/index.ts` (tool descriptions, health_check, config schema), `README.md`, `CHANGELOG.md`

**New file**: `src/nested/xserver-backends.ts` — contains the `XServerBackend` interface and three provider implementations

**Out of scope**: Vision providers, platform adapters, policy system, capture tools, audit logging

## Architecture

Introduce a **provider pattern** for X server backends modeled after the existing `VisionProvider` / `ProviderFactory` pattern already used in index.ts:

```
XServerBackend (interface)
├── XvfbBackend      (primary — headless, lightweight)
├── XdummyBackend    (primary — headless, RANDR support)
└── XephyrBackend    (fallback — visible, interactive)

XServerBackendFactory
├── autoSelect()     → picks best available backend
├── select(name)     → picks specific backend by name
└── listAvailable()  → returns backends whose binaries exist
```

### Key Design Decisions (resolved)

1. **Interface-based abstraction**: `XServerBackend` defines `start()`, `stop()`, `isAvailable()`, `getName()`, `getBinary()`, `getDefaultArgs()`
2. **Configurable priority order**: `x_server_priority: ('xvfb' | 'xdummy' | 'xephyr')[]` field on `NestedSessionConfig`; `XServerBackendFactory` constructed with the user's priority. **Default**: `['xvfb', 'xephyr']` — Xdummy is opt-in since it requires bundled xorg config.
3. **Xdummy bundles its own xorg-dummy.conf**: `XdummyBackend` writes a generated `xorg-dummy.conf` (with requested dimensions) to a temp file, passes `-config` to Xorg, removes on cleanup. Self-contained, no system-level setup required.
4. **Config-level backend selection only**: No `x_server_backend` tool parameter on `start_nested_session`. Selection happens entirely from config; the response still includes the actual `x_server_type` that was used for transparency.
5. **SessionInfo stores backend metadata**: Add `xServerType` field to `SessionInfo`. No deprecation aliases — old `xephyrProcess`/`xephyrPid` are removed outright; all references updated in lockstep.
6. **Factory constructed once per manager**: The manager reads the config's priority list and instantiates a single `XServerBackendFactory`. `startSession()` calls `factory.autoSelect()`. No per-call options threading needed.

## Acceptance Criteria

1. `start_nested_session` with default config (no `x_server_priority` set) creates a session using Xvfb by default when available
2. With `x_server_priority: ["xephyr"]` in config, `start_nested_session` creates a session using Xephyr (backward compatibility)
3. With `x_server_priority: ["xvfb", "xephyr"]` in config, the factory selects the first available backend and `start_nested_session` uses it
4. `health_check` reports availability of all three X server backends and the configured `x_server_priority`
5. `stop_nested_session` correctly cleans up processes regardless of backend type, and removes the temp xorg-dummy.conf when Xdummy was used
6. `capture_nested_window` produces valid PNG screenshots with headless backends
7. `start_nested_session` tool surface is **unchanged** — no new parameter
8. Response from `start_nested_session` includes `x_server_type` and effective `x_server_priority`
9. All existing integration tests pass with the new backend abstraction, with the `pgrep -a Xephyr` check generalized to also accept `Xvfb`/`Xorg`
10. New unit tests cover backend provider selection, argument generation, and bundled xorg-dummy.conf generation
11. README.md documents the three backends, their installation, and the `x_server_priority` config field
12. CHANGELOG.md documents the change with migration notes
13. No tool descriptions contain the word "Xephyr" as a requirement (may appear as a backend option in examples)
14. TypeScript compilation succeeds with no errors
15. `SessionInfo` no longer exposes `xephyrProcess`/`xephyrPid`; all callers updated

## Open Questions

All resolved by user decision (2026-06-10):

| # | Question | Resolution |
|---|----------|------------|
| OQ1 | Xdummy config bundling | **Bundle it** — generate xorg-dummy.conf to temp dir on spawn, pass `-config` to Xorg, cleanup on stop |
| OQ2 | Configurable priority order | **Yes** — add `x_server_priority` array to `NestedSessionConfig`; `XServerBackendFactory` takes the priority list at construction |
| OQ3 | Deprecated field aliases | **Removed** — no deprecation cycle; `xephyrProcess`/`xephyrPid` are renamed outright; all internal references updated in lockstep |
| OQ4 | Per-session backend control | **Config-level only** — no `x_server_backend` tool parameter; selection is entirely from config; response still reports the actual `x_server_type` used for transparency |

## Phase Plan

### Phase 1: Define XServerBackend Interface and Providers

#### 1.1 — Create XServerBackend interface
- **id**: `1.1-create-interface`
- **depends_on**: []
- **attributes**: [`code`]
- **deliverable**: `src/nested/xserver-backends.ts` with `XServerBackend` interface and `XServerBackendInfo` type
- **description**: Define the core XServerBackend interface with start/stop/availability methods and supporting types

#### 1.2 — Implement XvfbBackend
- **id**: `1.2-xvfb-backend`
- **depends_on**: [1.1-create-interface]
- **attributes**: [`code`]
- **deliverable**: XvfbBackend class in xserver-backends.ts
- **description**: Implement XvfbBackend with spawn args: `Xvfb :N -screen 0 WxHx24`

#### 1.3 — Implement XdummyBackend (with bundled xorg-dummy.conf)
- **id**: `1.3-xdummy-backend`
- **depends_on**: [1.1-create-interface]
- **attributes**: [`code`]
- **deliverable**: XdummyBackend class in xserver-backends.ts + bundled xorg-dummy.conf template generator
- **description**: Implement XdummyBackend that spawns `Xorg :N -config /tmp/oh-snap-xdummy-N.conf -noreset`. The class bundles a minimal xorg-dummy.conf template (Device/Monitor/Screen sections using the `dummy` driver, 256MB VideoRam, default depth 24) and generates a per-session config with the requested width/height modes written to a temp file under `/tmp/oh-snap-xdummy-${displayNumber}.conf`. `spawn()` writes the conf then launches Xorg; `cleanup()` removes the conf. `isAvailable()` requires both `Xorg` binary and that `xf86-video-dummy` (or distro equivalent) be loadable — probe with `Xorg -version` and check for `dummy` in the module path, or fall back to a soft-availability check (binary present) and surface failures via spawn error.

#### 1.4 — Implement XephyrBackend
- **id**: `1.4-xephyr-backend`
- **depends_on**: [1.1-create-interface]
- **attributes**: [`code`]
- **deliverable**: XephyrBackend class in xserver-backends.ts
- **description**: Extract existing spawnXephyr logic into XephyrBackend implementation

#### 1.5 — Implement XServerBackendFactory
- **id**: `1.5-backend-factory`
- **depends_on**: [1.2-xvfb-backend, 1.3-xdummy-backend, 1.4-xephyr-backend]
- **attributes**: [`code`]
- **deliverable**: XServerBackendFactory class in xserver-backends.ts
- **description**: Implement factory with:
- Constructor: `XServerBackendFactory(priority: ('xvfb' | 'xdummy' | 'xephyr')[])` — stores the user's priority order
- `autoSelect(): Promise<XServerBackend>` — iterates the priority list, returns the first available backend
- `select(name: string): XServerBackend` — returns backend by name, throws if unknown
- `listAvailable(): Promise<XServerBackendInfo[]>` — returns all backends (xvfb, xdummy, xephyr) with availability status, regardless of priority
- `getPriority(): string[]` — returns the configured priority for diagnostics

Throws a clear error from `autoSelect()` if no backend in the priority list is available, listing what was tried and what is installed.

### Phase 2: Update Types and Config

#### 2.1 — Update SessionInfo type
- **id**: `2.1-update-session-info`
- **depends_on**: [1.1-create-interface]
- **attributes**: [`code`]
- **deliverable**: Updated SessionInfo in types.ts
- **description**: Direct rename, no deprecation cycle: `xephyrProcess` → `xServerProcess`, `xephyrPid` → `xServerPid`. Add `xServerType: 'xvfb' | 'xdummy' | 'xephyr'` field. All internal references in session-manager.ts, the test file, and the TOOLS handler are updated in the same change.

#### 2.2 — Update NestedSessionConfig and Zod schema
- **id**: `2.2-update-config-schema`
- **depends_on**: [1.1-create-interface]
- **attributes**: [`code`]
- **deliverable**: Updated NestedSessionConfig type and Zod schema
- **description**: Add `x_server_priority: z.array(z.enum(['xvfb', 'xdummy', 'xephyr'])).optional()` to `NestedSessionConfigSchema` and corresponding field to the TypeScript type. **Default** in `DEFAULT_CONFIG.nested_sessions`: `['xvfb', 'xephyr']` — keeps the common case working out of the box; Xdummy is opt-in by adding it to the priority list.

#### 2.3 — Update barrel exports
- **id**: `2.3-update-barrel-exports`
- **depends_on**: [1.5-backend-factory, 2.1-update-session-info, 2.2-update-config-schema]
- **attributes**: [`code`]
- **deliverable**: Updated src/nested/index.ts
- **description**: Export new backend types and factory from barrel

### Phase 3: Refactor Session Manager

#### 3.1 — Replace spawnXephyr with backend abstraction
- **id**: `3.1-refactor-session-manager`
- **depends_on**: [1.5-backend-factory, 2.1-update-session-info, 2.2-update-config-schema]
- **attributes**: [`code`, `risk-high`]
- **deliverable**: Refactored startSession/stopSession in session-manager.ts
- **description**: Replace spawnXephyr with backend factory; use backend.spawn/cleanup; update SessionInfo construction

#### 3.2 — Add per-session backend tracking
- **id**: `3.2-session-backend-tracking`
- **depends_on**: [3.1-refactor-session-manager]
- **attributes**: [`code`]
- **deliverable**: Per-session backend tracking map in session-manager.ts
- **description**: Add sessionBackends Map to track which backend each session uses

### Phase 4: Update MCP Server (index.ts)

#### 4.1 — Update tool descriptions
- **id**: `4.1-update-tool-descriptions`
- **depends_on**: [3.1-refactor-session-manager]
- **attributes**: [`writing`]
- **deliverable**: Updated TOOLS array for all 13 nested-session tools
- **description**: Replace Xephyr-specific language across all 13 nested-session tool descriptions. Per OQ4, no new tool parameter — only descriptive text changes (e.g., "Starts a new isolated X server session" instead of "Starts a new isolated Xephyr X session").

#### 4.2 — Update health_check
- **id**: `4.2-update-health-check`
- **depends_on**: [1.5-backend-factory]
- **attributes**: [`code`]
- **deliverable**: Updated handleHealthCheck in index.ts
- **description**: Replace xephyr_installed with x_server_backends array

#### 4.3 — Update handler response to report x_server_type
- **id**: `4.3-update-start-schema`
- **depends_on**: [2.2-update-config-schema, 4.1-update-tool-descriptions]
- **attributes**: [`code`]
- **deliverable**: Updated handleStartNestedSession in index.ts
- **description**: Per OQ4, **no new tool parameter** is added — the `StartNestedSessionSchema` is unchanged. The handler still gets updated to include `x_server_type` in its JSON response (read from the selected backend) so users can see which backend actually started. Also include the backend `binary` path and the effective `x_server_priority` for transparency.

### Phase 5: Update Tests

#### 5.1 — Update integration tests
- **id**: `5.1-update-integration-tests`
- **depends_on**: [3.1-refactor-session-manager]
- **attributes**: [`code`]
- **deliverable**: Updated session-manager.test.ts
- **description**: Update for new field names; add Xephyr fallback and auto-selection tests

#### 5.2 — Add backend unit tests
- **id**: `5.2-add-backend-unit-tests`
- **depends_on**: [1.5-backend-factory]
- **attributes**: [`code`]
- **deliverable**: New xserver-backends.test.ts
- **description**: Unit tests for availability checks, argument generation, factory selection

### Phase 6: Documentation

#### 6.1 — Update README.md
- **id**: `6.1-update-readme`
- **depends_on**: [4.1-update-tool-descriptions, 4.2-update-health-check]
- **attributes**: [`writing`]
- **deliverable**: Updated README.md
- **description**: Document three backends, update prerequisites, add Nested Session Backends section

#### 6.2 — Update CHANGELOG.md
- **id**: `6.2-update-changelog`
- **depends_on**: [6.1-update-readme]
- **attributes**: [`writing`]
- **deliverable**: Updated CHANGELOG.md
- **description**: Add new version entry with Added/Changed/Deprecated sections

## Risk Blocking Rules

- **R1 — No backend available**: If the configured `x_server_priority` is exhausted (no backends available), `start_nested_session` must fail with a clear error message listing the priority order and which backends were probed and their statuses
- **R2 — Backend crash recovery**: If the selected backend crashes during `spawn()`, the session must not leak partial state — the session must not be registered in the map, and any temp files (e.g. xorg-dummy.conf) must be cleaned up
- **R3 — Xdummy driver missing**: If `Xorg` is installed but `xf86-video-dummy` is not loadable, `XdummyBackend.isAvailable()` must report `false` (not silently fail at spawn). The temp xorg-dummy.conf is only written when the backend actually spawns, not on availability checks
- **R4 — Default config compatibility**: Default `x_server_priority` is `['xvfb', 'xephyr']` (not `['xvfb', 'xdummy', 'xephyr']`) so users who haven't installed xf86-video-dummy aren't surprised by autoSelect attempts at Xdummy. Xdummy is purely opt-in
- **R5 — No deprecation safety net**: Per OQ3, old field names are removed outright. Any external code referencing `xephyrProcess`/`xephyrPid` breaks immediately. Acceptance test must grep the codebase for these names post-refactor and confirm zero hits

## Assumptions

| # | Assertion | Basis |
|---|-----------|-------|
| A1 | Xvfb is available on most Linux distributions | Standard packaging |
| A2 | xwd works identically on Xvfb/Xdummy/Xephyr displays | X11 client |
| A3 | xdpyinfo works identically on all X server backends | X11 client |
| A4 | Window managers (evilwm, matchbox, openbox) work on headless X servers | X11 clients |
| A5 | `findAvailableDisplay()` works for all X server types | Check /tmp/.X{N}-lock |
| A6 | `xf86-video-dummy` is installable on any system that can run Xorg | Standard packaging |
| A7 | Bundled xorg-dummy.conf with the `dummy` driver and 256MB VideoRam is sufficient for typical capture use cases | Standard practice for headless Xorg |
