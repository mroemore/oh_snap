/**
 * Types for nested X session management (Xephyr)
 */

import { ChildProcess } from 'child_process';

/**
 * Options for starting a nested session
 */
export interface NestedSessionOptions {
  display?: number;
  width?: number;
  height?: number;
  windowManager?: 'evilwm' | 'matchbox' | 'openbox' | 'none';
  name?: string;
}

/**
 * Information about an active nested session
 */
export interface SessionInfo {
  /** Unique session identifier */
  sessionId: string;
  /** Display string (e.g., ":99") */
  display: string;
  /** Display number (e.g., 99) */
  displayNumber: number;
  /** Xephyr process */
  xephyrProcess: ChildProcess;
  /** Xephyr process ID */
  xephyrPid: number;
  /** Window manager process (if any) */
  wmProcess: ChildProcess | null;
  /** Window manager process ID (if any) */
  wmPid: number | null;
  /** Application processes spawned in this session */
  appPids: number[];
  /** Named applications in this session */
  namedApps: Map<string, NamedAppInfo>;
  /** Session creation timestamp */
  createdAt: Date;
  /** Optional session name */
  name?: string;
  /** Session state */
  state: 'starting' | 'running' | 'stopping' | 'stopped';
}

/**
 * Result of starting a nested session
 */
export interface StartSessionResult {
  sessionId: string;
  display: string;
  displayNumber: number;
  width: number;
  height: number;
}

/**
 * Result of running a command in a session
 */
export interface RunInSessionResult {
  pid: number;
  command: string;
}

/**
 * Result of capturing from a nested session
 */
export interface CaptureNestedResult {
  /** Base64-encoded PNG data URI */
  base64: string;
  /** Window ID that was captured */
  windowId?: string;
  /** Window name if available */
  windowName?: string;
  /** Window class if available */
  windowClass?: string;
}

/**
 * Window information in a nested session
 */
export interface NestedWindowInfo {
  id: string;
  name: string;
  className: string;
}

/**
 * Process health status
 */
export interface ProcessHealth {
  pid: number;
  name: string;
  running: boolean;
  exitCode: number | null;
  signal: string | null;
}

export interface NestedSessionConfig {
  default_width?: number;
  default_height?: number;
  default_window_manager?: 'evilwm' | 'matchbox' | 'openbox' | 'none';
  wm_fallback_chain?: ('evilwm' | 'matchbox' | 'openbox' | 'none')[];
  auto_cleanup?: boolean;
  idle_timeout_ms?: number;
}

export interface NamedAppInfo {
  name: string;
  pid: number;
  command: string;
  startedAt: Date;
}

export interface WaitForWindowOptions {
  timeout_ms?: number;
  poll_interval_ms?: number;
  window_name_pattern?: string;
  window_class_pattern?: string;
}