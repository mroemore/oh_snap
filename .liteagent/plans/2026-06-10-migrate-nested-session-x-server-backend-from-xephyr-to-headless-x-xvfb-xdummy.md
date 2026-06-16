# Plan: Migrate Nested Session X Server Backend from Xephyr to Headless X

- **plan_id**: plan-xserver-backend-abstraction-20260520
- **plan_schema_version**: 2.1
- **maturity_level**: M2
- **status**: draft
- **generated_by**: plan_builder
- **updated_at**: 2026-06-10T00:00:00Z

## Goals
1. Introduce an XServerBackend interface with provider implementations for Xvfb, Xdummy, and Xephyr
2. Make Xvfb the default backend for new nested sessions
3. Maintain Xephyr as a fallback when headless backends are unavailable or when interactive debugging is needed
4. Rename Xephyr-specific type fields (xephyrProcess, xephyrPid) to generic names (xServerProcess, xServerPid) — no deprecation aliases
5. Update health_check to report on all available X server backends
6. Update all 13 nested-session tool descriptions to remove Xephyr-specific language
7. Update tests to cover the new abstraction and both primary and fallback backends
8. Update README.md and CHANGELOG.md to document the new capability
9. Xdummy bundles its own xorg-dummy.conf (no system-level setup required)
10. Backend priority order is config-driven via x_server_priority; no new tool parameters

## Architecture
Provider pattern with config-driven priority and bundled xorg-dummy.conf for Xdummy. Default x_server_priority: ['xvfb', 'xephyr']. Tool surface unchanged — selection is fully config-driven.
