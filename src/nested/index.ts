export { NestedSessionManager, getNestedSessionManager } from './session-manager.js';
export type {
  NestedSessionOptions,
  NestedSessionConfig,
  NamedAppInfo,
  WaitForWindowOptions,
  SessionInfo,
  StartSessionResult,
  RunInSessionResult,
  CaptureNestedResult,
  NestedWindowInfo,
  ProcessHealth,
} from './types.js';
export { killProcessTree, findAvailableDisplay, waitForDisplay, execInDisplay } from './process-utils.js';
export { XServerBackendFactory } from './xserver-backends.js';
export type { XServerBackendName, XServerBackendInfo } from './xserver-backends.js';