/**
 * Types for nested X session management (multi-backend: Xvfb, Xdummy, Xephyr)
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
  /** X server process */
  xServerProcess: ChildProcess;
  /** X server process ID */
  xServerPid: number;
  /** Type of X server backend in use */
  xServerType: 'xvfb' | 'xdummy' | 'xephyr';
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
  /** Backend name that was actually selected (e.g., "xvfb", "xephyr") */
  xServerType?: string;
  /** Binary name/path for the selected backend (e.g., "Xvfb", "Xephyr") */
  xServerBinary?: string;
  /** Priority list that was configured (e.g., ["xvfb", "xephyr"]) */
  xServerPriority?: string[];
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
  /**
   * Preferred X server backend priority order.
   * The first available backend in the array is selected.
   */
  x_server_priority?: ('xvfb' | 'xdummy' | 'xephyr')[];
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