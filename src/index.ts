#!/usr/bin/env node

/**
 * Alibaba Vision MCP Server
 * 
 * Provides vision analysis tools using Alibaba Coding Plan models:
 * - Kimi K2.5 (vision-capable)
 * - Qwen3.5-Plus (vision-capable)
 * 
 * API Endpoint: https://coding-intl.dashscope.aliyuncs.com/v1
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ErrorCode,
  McpError,
  LoggingMessageNotificationSchema,
} from "@modelcontextprotocol/sdk/types.js";
import fs from "fs/promises";
import path from "path";
import os from "os";
import crypto from "crypto";
import { exec } from "child_process";
import { promisify } from "util";
import { Monitor } from "node-screenshots";
import { z } from "zod";

const execAsync = promisify(exec);

const ALIBABA_API_BASE = "https://coding-intl.dashscope.aliyuncs.com/v1";

// Structured logging utility with API key obfuscation
function obfuscateApiKey(text: string): string {
  return text.replace(/sk-sp-[a-zA-Z0-9]+/g, (key) => {
    if (key.length < 10) return "****";
    return key.substring(0, 6) + "***...***" + key.substring(key.length - 3);
  });
}

function log(level: string, message: string, meta?: Record<string, unknown>): void {
  const obfuscatedMessage = obfuscateApiKey(message);
  const obfuscatedMeta = meta ? Object.fromEntries(
    Object.entries(meta).map(([k, v]) => [k, typeof v === 'string' ? obfuscateApiKey(v) : v])
  ) : undefined;
  console.error(JSON.stringify({
    timestamp: new Date().toISOString(),
    level,
    message: obfuscatedMessage,
    ...obfuscatedMeta
  }));
}

const logger = {
  debug: (msg: string, meta?: Record<string, unknown>) => log('debug', msg, meta),
  info: (msg: string, meta?: Record<string, unknown>) => log('info', msg, meta),
  warn: (msg: string, meta?: Record<string, unknown>) => log('warn', msg, meta),
  error: (msg: string, meta?: Record<string, unknown>) => log('error', msg, meta)
};

// Audit event types for capture logging
type AuditEvent = {
  timestamp: string;
  action: 'capture_window' | 'capture_screen' | 'policy_blocked' | 'blur_applied' | 'policy_permissions_fixed';
  windowId?: string;
  windowName?: string;
  windowClass?: string;
  pattern?: string;
  result: 'success' | 'blocked' | 'error';
  reason?: string;
  regionsBlurred?: number;
};

// Audit log file path
const AUDIT_LOG_DIR = path.join(os.homedir(), '.local', 'share', 'alibaba-vision');
const AUDIT_LOG_FILE = path.join(AUDIT_LOG_DIR, 'capture-audit.log');

// Audit logging function - writes JSON lines to file
async function logAuditEvent(event: AuditEvent): Promise<void> {
  try {
    // Ensure directory exists
    await fs.mkdir(AUDIT_LOG_DIR, { recursive: true });
    
    // Append JSON line to audit log
    const logEntry = JSON.stringify(event) + '\n';
    await fs.appendFile(AUDIT_LOG_FILE, logEntry, 'utf-8');
  } catch (error) {
    // Gracefully handle logging failures - never break functionality
    console.error('Failed to write audit log:', error);
  }
}


// Template substitution with command injection prevention
const ALLOWED_PLACEHOLDERS = ['window_id', 'window_class', 'window_title', 'output_path'];

function substituteTemplate(template: string, values: Record<string, string>): string {
  let result = template;
  
  for (const [key, value] of Object.entries(values)) {
    if (!ALLOWED_PLACEHOLDERS.includes(key)) {
      throw new McpError(
        ErrorCode.InvalidParams,
        `Unknown placeholder: ${key}. Allowed: ${ALLOWED_PLACEHOLDERS.join(', ')}`
      );
    }
    
    // Sanitize the value to prevent command injection
    const sanitized = value.replace(/['"\`$]/g, '').replace(/[;&|<>]/g, '').replace(/[\n\r]/g, '').trim();
    
    result = result.replace(new RegExp(`{${key}}`, 'g'), sanitized);
  }
  
  return result;
}

// Default screenshot commands for different platforms
function getDefaultScreenshotCommands(): ScreenshotConfig {
  if (process.platform === 'darwin') {
    return {
      fullscreen_command: 'screencapture -x {output_path}',
      window_command: 'screencapture -l {window_id} {output_path}',
      list_windows_command: 'osascript -e "tell application \\"System Events\\" to get name of every process whose visible is true"',
      temp_dir: '/tmp/alibaba-vision'
    };
  }
  
  // Linux/X11 defaults
  return {
    fullscreen_command: undefined,
    window_command: 'xwd -id {window_id} -out {output_path}.xwd && ffmpeg -y -i {output_path}.xwd {output_path} 2>/dev/null',
    list_windows_command: 'xdotool search --onlyvisible ".*"',
    temp_dir: '/tmp'
  };
}

// Default screenshot commands for different platforms



type ModelInfo = {
  display_name: string;
  description: string;
  pros: string[];
  cons: string[];
  best_for: string[];
};

type ScreenshotConfig = {
  fullscreen_command?: string;
  window_command?: string;
  list_windows_command?: string;
  temp_dir?: string;
  keep_screenshots?: number;
};

type VisionConfig = {
  default_model: string;
  allow_model_selection: boolean;
  models: Record<string, ModelInfo>;
  screenshot?: ScreenshotConfig;
  allow_offscreen_capture?: boolean;
};

// Zod schemas for config validation
const ModelInfoSchema = z.object({
  display_name: z.string(),
  description: z.string(),
  pros: z.array(z.string()),
  cons: z.array(z.string()),
  best_for: z.array(z.string())
});

const ScreenshotConfigSchema = z.object({
  fullscreen_command: z.string().optional(),
  window_command: z.string().optional(),
  list_windows_command: z.string().optional(),
  temp_dir: z.string().optional(),
  keep_screenshots: z.number().optional()
}).optional();

const VisionConfigSchema = z.object({
  default_model: z.string(),
  allow_model_selection: z.boolean(),
  models: z.record(z.string(), ModelInfoSchema),
  screenshot: ScreenshotConfigSchema,
  allow_offscreen_capture: z.boolean().optional()
});

// Window Capture Policy types
type WindowCapturePolicy = {
  version: string;
  offscreen_capture: { allow: boolean };
  whitelist: { enabled: boolean; patterns: string[] };
  blacklist: { enabled: boolean; patterns: string[]; priority: boolean };
  fullscreen_policy: { mode: 'blur' | 'reject' | 'allow'; blur_strength: string };
  audit: { log_captures: boolean };
};

// Default blacklist for password managers
const DEFAULT_BLACKLIST = [
  'KeePassXC',
  'KeePass',
  'Bitwarden',
  '1Password',
  '*password*',
  '*secret*',
  '*vault*',
  '*credential*'
];

/**
 * Match a glob pattern against text for window capture security policy.
 * Supports:
 * - * (matches any sequence of characters)
 * - ? (matches single character)
 * - Case-insensitive matching
 * 
 * Security: Escapes special regex characters to prevent regex DoS.
 * Does NOT support character classes [a-z] or globstar **.
 */
function matchGlob(pattern: string, text: string): boolean {
  // Escape special regex characters except * and ?
  // . + ^ $ { } ( ) | [ ] \ are all escaped
  let regexPattern = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*')
    .replace(/\?/g, '.');
  
  const regex = new RegExp('^' + regexPattern + '$', 'i');
  return regex.test(text);
}

// ============================================================
// Platform Adapter Interface for Window Capture Security
// ============================================================

/**
 * Window information returned by platform adapters
 */
interface WindowInfo {
  id: string;
  name: string;
  className: string;
  x: number;
  y: number;
  width: number;
  height: number;
  isMinimized: boolean;
  isVisible: boolean;
  isOffScreen: boolean;
}

/**
 * Region to blur in an image
 */
interface BlurRegion {
  x: number;
  y: number;
  width: number;
  height: number;
  reason: string;
}

/**
 * Platform adapter interface for window management and capture
 */
interface PlatformAdapter {
  /**
   * List all visible windows on the system
   */
  listVisibleWindows(): Promise<WindowInfo[]>;
  
  /**
   * Get geometry information for a specific window
   */
  getWindowGeometry(id: string): Promise<WindowInfo>;
  
  /**
   * Apply blur regions to an image and return the path to the blurred image
   */
  blurRegions(imagePath: string, regions: BlurRegion[], strength?: string): Promise<string>;
}

/**
 * X11 platform adapter (stub implementation)
 */
class X11Adapter implements PlatformAdapter {
  async listVisibleWindows(): Promise<WindowInfo[]> {
    try {
      const { stdout } = await execAsync('xdotool search --onlyvisible "." 2>/dev/null');
      const ids = stdout.trim().split('\n').filter(Boolean);
      
      const windows: WindowInfo[] = [];
      for (const id of ids) {
        try {
          const trimmedId = id.trim();
          if (!trimmedId) continue;
          
          const [nameResult, classResult, geoResult] = await Promise.all([
            execAsync(`xdotool getwindowname ${trimmedId} 2>/dev/null`).catch(() => ({ stdout: '' })),
            execAsync(`xdotool getwindowclassname ${trimmedId} 2>/dev/null`).catch(() => ({ stdout: '' })),
            execAsync(`xdotool getwindowgeometry ${trimmedId} 2>/dev/null`).catch(() => ({ stdout: '' }))
          ]);
          
          const name = nameResult.stdout.trim();
          const className = classResult.stdout.trim();
          const geo = geoResult.stdout;
          
          // Parse geometry: X: 100 Y: 200 Width: 800 Height: 600
          const xMatch = geo.match(/X:\s*(-?\d+)/);
          const yMatch = geo.match(/Y:\s*(-?\d+)/);
          const wMatch = geo.match(/Width:\s*(\d+)/);
          const hMatch = geo.match(/Height:\s*(\d+)/);
          
          const x = parseInt(xMatch?.[1] || '0', 10);
          const y = parseInt(yMatch?.[1] || '0', 10);
          const width = parseInt(wMatch?.[1] || '0', 10);
          const height = parseInt(hMatch?.[1] || '0', 10);
          
          windows.push({
            id: trimmedId,
            name,
            className,
            x,
            y,
            width,
            height,
            isMinimized: false,
            isVisible: true,
            isOffScreen: x < 0 || y < 0
          });
        } catch {
          // Skip windows that can't be queried
        }
      }
      
      return windows;
    } catch (error) {
      logger.error('Failed to list visible windows:', { error });
      return [];
    }
  }
  
  async getWindowGeometry(id: string): Promise<WindowInfo> {
    // TODO: Implement X11 geometry query
    throw new Error('Not implemented: X11Adapter.getWindowGeometry');
  }
  
  async blurRegions(imagePath: string, regions: BlurRegion[], strength: string = 'heavy'): Promise<string> {
    const blurStrengthMap: Record<string, string> = {
      light: '5:2',
      medium: '10:3',
      heavy: '20:5'
    };
    
    const blurValue = blurStrengthMap[strength] || blurStrengthMap.heavy;
    
    const ext = path.extname(imagePath);
    const base = imagePath.slice(0, -ext.length);
    const outputPath = `${base}-blurred${ext}`;
    
    if (regions.length === 0) {
      await fs.copyFile(imagePath, outputPath);
      return outputPath;
    }
    
    const splitCount = regions.length + 1;
    let filterComplex = `[0:v]split=${splitCount}`;
    for (let i = 0; i < splitCount; i++) {
      filterComplex += `[base${i}]`;
    }
    filterComplex += ';';
    
    for (let i = 0; i < regions.length; i++) {
      const r = regions[i];
      const x = Math.max(0, r.x - 10);
      const y = Math.max(0, r.y - 10);
      const w = r.width + 20;
      const h = r.height + 20;
      
      filterComplex += `[base${i}]crop=${w}:${h}:${x}:${y},boxblur=${blurValue}[blur${i}];`;
    }
    
    let lastOutput = `[base${regions.length}]`;
    for (let i = 0; i < regions.length; i++) {
      const r = regions[i];
      const x = Math.max(0, r.x - 10);
      const y = Math.max(0, r.y - 10);
      
      if (i === regions.length - 1) {
        filterComplex += `${lastOutput}[blur${i}]overlay=${x}:${y}`;
      } else {
        filterComplex += `${lastOutput}[blur${i}]overlay=${x}:${y}[tmp${i}];`;
        lastOutput = `[tmp${i}]`;
      }
    }
    
    try {
      await execAsync(`ffmpeg -y -i "${imagePath}" -filter_complex "${filterComplex}" -update 1 "${outputPath}" 2>/dev/null`);
    } catch (error) {
      logger.error('Failed to blur regions', { error, imagePath });
      await fs.copyFile(imagePath, outputPath);
    }
    
    return outputPath;
  }
}

/**
 * macOS platform adapter (stub implementation)
 */
class MacOSAdapter implements PlatformAdapter {
  async listVisibleWindows(): Promise<WindowInfo[]> {
    // TODO: Implement macOS window listing using osascript
    return [];
  }
  
  async getWindowGeometry(id: string): Promise<WindowInfo> {
    // TODO: Implement macOS geometry query
    throw new Error('Not implemented: MacOSAdapter.getWindowGeometry');
  }
  
  async blurRegions(imagePath: string, regions: BlurRegion[], strength?: string): Promise<string> {
    // TODO: Implement macOS blur using sips or native APIs
    throw new Error('Not implemented: MacOSAdapter.blurRegions');
  }
}

/**
 * Windows platform adapter (stub implementation)
 */
class WindowsAdapter implements PlatformAdapter {
  async listVisibleWindows(): Promise<WindowInfo[]> {
    // TODO: Implement Windows window listing using PowerShell or native APIs
    return [];
  }
  
  async getWindowGeometry(id: string): Promise<WindowInfo> {
    // TODO: Implement Windows geometry query
    throw new Error('Not implemented: WindowsAdapter.getWindowGeometry');
  }
  
  async blurRegions(imagePath: string, regions: BlurRegion[], strength?: string): Promise<string> {
    // TODO: Implement Windows blur using PowerShell or native APIs
    throw new Error('Not implemented: WindowsAdapter.blurRegions');
  }
}

/**
 * Factory function to get the appropriate platform adapter
 */
function getPlatformAdapter(): PlatformAdapter {
  if (process.platform === 'linux') {
    // Check for Wayland vs X11
    if (process.env.WAYLAND_DISPLAY || process.env.XDG_SESSION_TYPE === 'wayland') {
      logger.warn('Wayland detected - using X11Adapter (limited support)');
    }
    return new X11Adapter();
  }
  if (process.platform === 'darwin') return new MacOSAdapter();
  if (process.platform === 'win32') return new WindowsAdapter();
  throw new Error(`Unsupported platform: ${process.platform}`);
}

// ============================================================
// End Platform Adapter Interface
// ============================================================

// Zod schema for WindowCapturePolicy validation
const WindowCapturePolicySchema = z.object({
  version: z.string(),
  offscreen_capture: z.object({
    allow: z.boolean()
  }),
  whitelist: z.object({
    enabled: z.boolean(),
    patterns: z.array(z.string())
  }),
  blacklist: z.object({
    enabled: z.boolean(),
    patterns: z.array(z.string()),
    priority: z.boolean()
  }),
  fullscreen_policy: z.object({
    mode: z.enum(['blur', 'reject', 'allow']),
    blur_strength: z.string()
  }),
  audit: z.object({
    log_captures: z.boolean()
  })
});

/**
 * Validate a glob pattern for security.
 * Rejects patterns containing regex special characters that could cause DoS.
 * Only allows glob wildcards: * and ?
 */
function validatePattern(pattern: string): void {
  const regexChars = /[(){}[\]^$+|\\]/;
  const shellChars = /[;&|<>`$\x00-\x1f]/;
  if (regexChars.test(pattern) || shellChars.test(pattern)) {
    throw new Error(`Pattern "${pattern}" contains regex or shell characters. Only glob (* and ?) allowed.`);
  }
}

/**
 * Validate all patterns in a policy's whitelist and blacklist.
 * Throws if any pattern contains regex special characters.
 */
function validatePolicyPatterns(policy: WindowCapturePolicy): void {
  // Validate whitelist patterns
  if (policy.whitelist.enabled && policy.whitelist.patterns) {
    for (const pattern of policy.whitelist.patterns) {
      validatePattern(pattern);
    }
  }

  // Validate blacklist patterns
  if (policy.blacklist.enabled && policy.blacklist.patterns) {
    for (const pattern of policy.blacklist.patterns) {
      validatePattern(pattern);
    }
  }
}

/**
 * Validate a policy object using Zod schema and pattern security checks.
 * Returns the validated policy or throws with clear error.
 */
function validatePolicy(policy: unknown): WindowCapturePolicy {
  // First validate the schema
  const validationResult = WindowCapturePolicySchema.safeParse(policy);
  if (!validationResult.success) {
    const errors = validationResult.error.errors.map(e =>
      `${e.path.join('.')}: ${e.message}`
    ).join(', ');
    throw new Error(`Policy schema validation failed: ${errors}`);
  }

  // Then validate patterns for regex characters (security check)
  validatePolicyPatterns(validationResult.data);

  return validationResult.data;
}

// Default policy configuration
const DEFAULT_POLICY: WindowCapturePolicy = {
  version: "1.0",
  offscreen_capture: { allow: false },
  whitelist: { enabled: false, patterns: [] },
  blacklist: {
    enabled: true,
    patterns: DEFAULT_BLACKLIST,
    priority: true
  },
  fullscreen_policy: { mode: 'blur', blur_strength: 'heavy' },
  audit: { log_captures: true }
};

let cachedPolicy: WindowCapturePolicy | null = null;
let cachedPolicyPath: string | null = null;

/**
 * Check file permissions and warn if insecure (> 600)
 */
async function checkFilePermissions(filePath: string): Promise<void> {
  try {
    const stats = await fs.stat(filePath);
    const mode = stats.mode & 0o777;
    
    // Warn if permissions are more permissive than 600
    if (mode > 0o600) {
      logger.warn(`Insecure file permissions on ${filePath}: ${mode.toString(8)}. Recommended: 600`);
    }
  } catch {
    // File doesn't exist yet, that's okay
  }
}

/**
 * Check and enforce policy file permissions (chmod 600)
 * Called on startup to ensure policy file has secure permissions
 */
async function checkPolicyFilePermissions(): Promise<void> {
  const policyPath = path.join(os.homedir(), '.config', 'opencode', 'window-capture-policy.json');
  
  try {
    const stats = await fs.stat(policyPath);
    const mode = stats.mode & 0o777;
    
    if (mode !== 0o600) {
      logger.warn(`Policy file permissions are too permissive (current: 0o${mode.toString(8)}, expected: 0o600). Fixing...`);
      
      await fs.chmod(policyPath, 0o600);
      
      await logAuditEvent({
        timestamp: new Date().toISOString(),
        action: 'policy_permissions_fixed',
        result: 'success',
        reason: `Changed from 0o${mode.toString(8)} to 0o600`
      });
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      logger.warn(`Failed to check policy file permissions: ${error}`);
    }
  }
}

/**
 * Load window capture policy from config file
 * Creates default policy if not exists
 */
async function loadPolicy(): Promise<WindowCapturePolicy> {
  if (cachedPolicy) return cachedPolicy;

  const policyPath = path.join(os.homedir(), '.config', 'opencode', 'window-capture-policy.json');
  
  // Check file permissions (warn if insecure)
  await checkFilePermissions(policyPath);

  try {
    const content = await fs.readFile(policyPath, "utf-8");
    const parsed = JSON.parse(content);
    
    // Validate policy using Zod schema and pattern security checks
    const validated = validatePolicy(parsed);
    
    // Merge user blacklist with defaults (user patterns extend, not replace)
    const mergedPolicy: WindowCapturePolicy = {
      ...DEFAULT_POLICY,
      ...validated,
      blacklist: {
        ...DEFAULT_POLICY.blacklist,
        ...validated.blacklist,
        patterns: [
          ...DEFAULT_BLACKLIST,
          ...(validated.blacklist?.patterns || [])
        ]
      }
    };
    
    cachedPolicy = mergedPolicy;
    cachedPolicyPath = policyPath;
    return mergedPolicy;
  } catch (error) {
    // Policy file doesn't exist, create default
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      logger.info(`Creating default window capture policy at ${policyPath}`);
      
      // Ensure directory exists
      const configDir = path.dirname(policyPath);
      await fs.mkdir(configDir, { recursive: true });
      
      // Write default policy with secure permissions
      await fs.writeFile(policyPath, JSON.stringify(DEFAULT_POLICY, null, 2), { mode: 0o600 });
      
      cachedPolicy = DEFAULT_POLICY;
      cachedPolicyPath = policyPath;
      return DEFAULT_POLICY;
    }
    
    // Invalid policy or other error, use default and log warning
    logger.warn('Invalid policy file, using defaults', { error: String(error) });
    cachedPolicy = DEFAULT_POLICY;
    cachedPolicyPath = null;
    return DEFAULT_POLICY;
  }
}

// Zod schemas for tool inputs
const AnalyzeScreenshotSchema = z.object({
  image_source: z.string(),
  prompt: z.string(),
  model: z.enum(['kimi-k2.5', 'qwen3.5-plus']).optional()
});

const ExtractTextSchema = z.object({
  image_source: z.string(),
  programming_language: z.string().optional(),
  context: z.string().optional()
});

const DiagnoseErrorSchema = z.object({
  image_source: z.string(),
  prompt: z.string().optional(),
  context: z.string().optional()
});

const UiToArtifactSchema = z.object({
  image_source: z.string(),
  output_type: z.enum(['code', 'prompt', 'spec', 'description']),
  prompt: z.string()
});

const UnderstandDiagramSchema = z.object({
  image_source: z.string(),
  prompt: z.string(),
  diagram_type: z.enum(['architecture', 'flowchart', 'uml', 'er-diagram', 'sequence', 'auto']).optional()
});

const AnalyzeDataVizSchema = z.object({
  image_source: z.string(),
  prompt: z.string(),
  analysis_focus: z.enum(['trends', 'anomalies', 'comparisons', 'performance-metrics', 'comprehensive']).optional()
});

const UiDiffCheckSchema = z.object({
  expected_image_source: z.string(),
  actual_image_source: z.string(),
  prompt: z.string()
});

const CaptureWindowSchema = z.object({
  window_class: z.string().optional(),
  window_name: z.string().optional(),
  analyze: z.boolean().optional(),
  prompt: z.string().optional()
});

const CaptureScreenSchema = z.object({
  analyze: z.boolean().optional(),
  prompt: z.string().optional()
});

const ListModelsSchema = z.object({
  include_descriptions: z.boolean().optional()
});

// Validation helper function
function validateArgs<T>(schema: z.ZodSchema<T>, args: unknown, toolName: string): T {
  const result = schema.safeParse(args);
  if (!result.success) {
    const issues = result.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new McpError(ErrorCode.InvalidParams, `Invalid ${toolName} args: ${issues}`);
  }
  return result.data;
}


/**
 * Create a helpful, formatted error message
 * Outputs to stderr (console.error) for visibility
 */
function createErrorMessage(
  title: string,
  description: string,
  steps: string[],
  link?: string
): string {
  const message = [
    `Error: ${title}`,
    "",
    description,
    "",
    "To fix this:",
    ...steps,
    "",
    link ? `See: ${link}` : ""
  ].filter(Boolean).join("\n");
  
  console.error(message);
  return message;
}

function maskApiKey(key: string): string {
  if (!key || key.length < 8) return "****";
  return key.substring(0, 7) + "****" + key.substring(key.length - 4);
}

function validateApiKey(key: string): { valid: boolean; error?: string } {
  if (!key) {
    return { valid: false, error: "API key is empty" };
  }
  if (!key.startsWith("sk-")) {
    return { valid: false, error: "API key must start with 'sk-'" };
  }
  if (key.length < 20) {
    return { valid: false, error: "API key appears too short" };
  }
  return { valid: true };
}

const DEFAULT_CONFIG: VisionConfig = {
  default_model: "kimi-k2.5",
  allow_model_selection: true,
  models: {
    "kimi-k2.5": {
      display_name: "Kimi K2.5",
      description: "Excellent image understanding with detailed visual analysis capabilities",
      pros: ["Best overall vision quality", "Excellent at detailed descriptions", "Good at understanding UI/UX elements", "Strong OCR capabilities"],
      cons: ["Slightly slower response time", "Higher token usage for complex images"],
      best_for: ["Complex screenshots", "UI analysis", "Detailed image descriptions", "OCR"]
    },
    "qwen3.5-plus": {
      display_name: "Qwen3.5 Plus",
      description: "Fast vision model with 1M token context window for large screenshots",
      pros: ["Very fast response time", "1M token context window", "Good OCR performance", "Efficient token usage"],
      cons: ["Slightly less detailed vision analysis", "May miss fine details in complex images"],
      best_for: ["Large screenshots", "Quick analysis", "OCR tasks", "Batch processing"]
    }
  }
};

let cachedConfig: VisionConfig | null = null;
let cachedApiKey: string | null = null;

// Capture caching for shortcuts
let lastCaptureBase64: string | null = null;
let lastCaptureType: 'screen' | 'window' | null = null;
let cachedConfigPath: string | null = null;
/**
 * Detect the current platform for display/screenshot capabilities
 */
function detectPlatform(): string {
  // Check for macOS first
  if (process.platform === 'darwin') {
    return 'macOS (untested)';
  }
  
  // Check for Wayland
  if (process.env.WAYLAND_DISPLAY || process.env.XDG_SESSION_TYPE === 'wayland') {
    return 'Wayland (limited support)';
  }
  
  // Check for X11
  if (process.env.DISPLAY) {
    return 'X11';
  }
  
  return 'unknown';
}

/**
 * Print startup banner with version, platform, config, and model info
 */
function printStartupBanner(version: string, configPath: string | null, defaultModel: string): void {
  const platform = detectPlatform();
  const configInfo = configPath || 'default (no config file found)';
  
  const banner = [
    `Alibaba Vision MCP Server v${version}`,
    `Platform: ${platform}`,
    `Config: ${configInfo}`,
    `Default Model: ${defaultModel}`,
    'Server started successfully'
  ].join('\n');
  
  console.error(banner);
}

async function loadVisionConfig(): Promise<VisionConfig> {
  if (cachedConfig) return cachedConfig;

  const configPaths = [
    path.join(os.homedir(), ".config", "opencode", "vision-config.json"),
    path.join(os.homedir(), ".opencode", "vision-config.json"),
    path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config"), "opencode", "vision-config.json")
  ];

  for (const configPath of configPaths) {
    try {
      const content = await fs.readFile(configPath, "utf-8");
      const config = JSON.parse(content);
      
      const validationResult = VisionConfigSchema.safeParse(config);
      if (!validationResult.success) {
        const errors = validationResult.error.errors.map(e => 
          `${e.path.join('.')}: ${e.message}`
        ).join(', ');
        throw new McpError(
          ErrorCode.InternalError,
          `Invalid vision-config.json: ${errors}\n\nConfig path: ${configPath}`
        );
      }
      
      cachedConfig = config;
      cachedConfigPath = configPath;
      return config;
    } catch (error) {
      if (error instanceof McpError) throw error;
      continue;
    }
  }

  cachedConfig = DEFAULT_CONFIG;
  cachedConfigPath = null;
  return DEFAULT_CONFIG;
}

async function getApiKey(): Promise<string> {
  if (cachedApiKey) return cachedApiKey;

  const envKey = process.env.ALIBABA_VISION_API_KEY;
  if (envKey) {
    const validation = validateApiKey(envKey);
    if (!validation.valid) {
      throw new McpError(
        ErrorCode.InternalError,
        `Invalid API key from environment: ${validation.error}`
      );
    }
    cachedApiKey = envKey;
    return envKey;
  }

  createErrorMessage(
    "ALIBABA_VISION_API_KEY not set",
    "An API key is required to use Alibaba Coding Plan vision models",
    [
      "1. Get an API key from https://dashscope.console.aliyun.com/",
      "2. Set the environment variable: export ALIBABA_VISION_API_KEY=\"sk-sp-xxx\""
    ],
    "https://github.com/alibaba/alibaba-vision-mcp/blob/main/docs/setup.md"
  );
  
  throw new McpError(
    ErrorCode.InternalError,
    "ALIBABA_VISION_API_KEY not set. Run with verbose error output above."
  );
}

const TOOLS = [
  {
    name: "list_models",
    description: "List available vision models with their descriptions, pros, and cons. Use this to help choose the best model for a specific task.",
    inputSchema: {
      type: "object" as const,
      properties: {
        include_descriptions: {
          type: "boolean",
          description: "Whether to include detailed model descriptions (pros, cons, best_for). Default: true."
        }
      },
      required: []
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false
    }
  },
  {
    name: "analyze_screenshot",
    description: "Analyze a screenshot or image using Alibaba Coding Plan vision models (Kimi K2.5 or Qwen3.5-Plus). Use for general image understanding, screenshot analysis, and visual content description.",
    inputSchema: {
      type: "object" as const,
      properties: {
        image_source: {
          type: "string",
          description: "Local file path or URL to the image. Can also be a base64 data URI."
        },
        prompt: {
          type: "string",
          description: "What to analyze or extract from the image. Be specific about what you're looking for."
        },
        model: {
          type: "string",
          enum: ["kimi-k2.5", "qwen3.5-plus"],
          description: "Vision model to use. Default: kimi-k2.5"
        }
      },
      required: ["image_source", "prompt"]
    }
  },
  {
    name: "extract_text_from_screenshot",
    description: "Extract and recognize text from screenshots using OCR capabilities of vision models. Specialized for code, terminal output, documentation, and general text extraction.",
    inputSchema: {
      type: "object" as const,
      properties: {
        image_source: {
          type: "string",
          description: "Local file path, URL, or base64 data URI of the image containing text."
        },
        programming_language: {
          type: "string",
          description: "Optional: specify the programming language if the screenshot contains code (e.g., 'python', 'javascript', 'java'). Helps with better formatting."
        },
        context: {
          type: "string",
          description: "Optional: additional context about the screenshot (e.g., 'terminal output', 'IDE screenshot', 'error message')."
        }
      },
      required: ["image_source"]
    }
  },
  {
    name: "diagnose_error_screenshot",
    description: "Diagnose and analyze error messages, stack traces, and exception screenshots. Provides actionable solutions for debugging.",
    inputSchema: {
      type: "object" as const,
      properties: {
        image_source: {
          type: "string",
          description: "Local file path, URL, or base64 data URI of the error screenshot."
        },
        context: {
          type: "string",
          description: "Optional: additional context about when the error occurred (e.g., 'during npm install', 'when running tests')."
        }
      },
      required: ["image_source"]
    }
  },
  {
    name: "ui_to_artifact",
    description: "Convert UI screenshots into various artifacts: code, prompts, design specifications, or descriptions. Use for generating frontend code from UI designs.",
    inputSchema: {
      type: "object" as const,
      properties: {
        image_source: {
          type: "string",
          description: "Local file path, URL, or base64 data URI of the UI screenshot."
        },
        output_type: {
          type: "string",
          enum: ["code", "prompt", "spec", "description"],
          description: "Type of output to generate: 'code' (frontend code), 'prompt' (AI prompt), 'spec' (design specification), 'description' (natural language description)."
        },
        prompt: {
          type: "string",
          description: "Detailed instructions describing what to generate from this UI image."
        }
      },
      required: ["image_source", "output_type", "prompt"]
    }
  },
  {
    name: "understand_technical_diagram",
    description: "Analyze and explain technical diagrams including architecture diagrams, flowcharts, UML, ER diagrams, and system design diagrams.",
    inputSchema: {
      type: "object" as const,
      properties: {
        image_source: {
          type: "string",
          description: "Local file path, URL, or base64 data URI of the technical diagram."
        },
        diagram_type: {
          type: "string",
          enum: ["architecture", "flowchart", "uml", "er-diagram", "sequence", "auto"],
          description: "Optional: specify the diagram type if known. Default: 'auto' for auto-detection."
        },
        prompt: {
          type: "string",
          description: "What you want to understand or extract from this diagram."
        }
      },
      required: ["image_source", "prompt"]
    }
  },
  {
    name: "analyze_data_visualization",
    description: "Analyze data visualizations, charts, graphs, and dashboards to extract insights and trends.",
    inputSchema: {
      type: "object" as const,
      properties: {
        image_source: {
          type: "string",
          description: "Local file path, URL, or base64 data URI of the data visualization."
        },
        analysis_focus: {
          type: "string",
          enum: ["trends", "anomalies", "comparisons", "performance-metrics", "comprehensive"],
          description: "Optional: specify what to focus on in the analysis. Default: 'comprehensive'."
        },
        prompt: {
          type: "string",
          description: "What insights or information you want to extract from this visualization."
        }
      },
      required: ["image_source", "prompt"]
    }
  },
  {
    name: "ui_diff_check",
    description: "Compare two UI screenshots to identify visual differences and implementation discrepancies. Use for UI quality assurance.",
    inputSchema: {
      type: "object" as const,
      properties: {
        expected_image_source: {
          type: "string",
          description: "Local file path, URL, or base64 data URI of the expected/reference UI."
        },
        actual_image_source: {
          type: "string",
          description: "Local file path, URL, or base64 data URI of the actual implementation."
        },
        prompt: {
          type: "string",
          description: "Instructions for the comparison. Specify what aspects to focus on."
        }
      },
      required: ["expected_image_source", "actual_image_source", "prompt"]
    }
  },
  {
    name: "list_windows",
    description: "List all visible windows with their IDs, names, and classes. Use this to find window identifiers for capture.",
    inputSchema: {
      type: "object" as const,
      properties: {},
      required: []
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false
    }
  },
  {
    name: "capture_window",
    description: "Capture a screenshot of a specific window by class name or window title. Returns base64-encoded PNG.",
    inputSchema: {
      type: "object" as const,
      properties: {
        window_class: {
          type: "string",
          description: "Window class to capture (e.g., 'firefox', 'code', 'org.wezfurlong.wezterm'). Use list_windows to find available classes."
        },
        window_name: {
          type: "string",
          description: "Window title/name pattern to match (e.g., 'KeePassXC', 'Firefox'). Alternative to window_class."
        },
        analyze: {
          type: "boolean",
          description: "If true, also analyze the screenshot with vision model after capture. Default: false."
        },
        prompt: {
          type: "string",
          description: "Analysis prompt if analyze=true. Required if analyze is true."
        }
      }
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false
    }
  },
  {
    name: "capture_screen",
    description: "Capture a full screenshot of the primary monitor. Returns base64-encoded PNG.",
    inputSchema: {
      type: "object" as const,
      properties: {
        analyze: {
          type: "boolean",
          description: "If true, also analyze the screenshot with vision model after capture. Default: false."
        },
        prompt: {
          type: "string",
          description: "Analysis prompt if analyze=true. Required if analyze is true."
        }
      }
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false
    }
  },
  {
    name: "health_check",
    description: "Validate API key and configuration. Returns status of authentication and config file permissions.",
    inputSchema: {
      type: "object" as const,
      properties: {},
      required: []
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false
    }
  }
];
async function prepareImageSource(imageSource: string): Promise<string> {
  // Handle capture shortcuts
  if (imageSource === "last" || imageSource === "latest") {
    if (lastCaptureBase64) {
      return lastCaptureBase64;
    }
    throw new McpError(
      ErrorCode.InvalidParams,
      "No capture available. Run capture_screen or capture_window first."
    );
  }
  
  if (imageSource === "screen" || imageSource === "capture_screen") {
    if (lastCaptureType === 'screen' && lastCaptureBase64) {
      return lastCaptureBase64;
    }
    throw new McpError(
      ErrorCode.InvalidParams,
      "No screen capture available. Run capture_screen first."
    );
  }
  
  if (imageSource === "window" || imageSource === "capture_window") {
    if (lastCaptureType === 'window' && lastCaptureBase64) {
      return lastCaptureBase64;
    }
    throw new McpError(
      ErrorCode.InvalidParams,
      "No window capture available. Run capture_window first."
    );
  }
  
  // Handle base64 data URIs
  if (imageSource.startsWith("data:")) {
    return imageSource;
  }
  
  // Handle URLs
  if (imageSource.startsWith("http://") || imageSource.startsWith("https://")) {
    return imageSource;
  }
  
  // Handle file paths
  try {
    const fileBuffer = await fs.readFile(imageSource);
    const ext = path.extname(imageSource).toLowerCase();
    const mimeTypes: Record<string, string> = {
      ".png": "image/png",
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".gif": "image/gif",
      ".webp": "image/webp",
      ".svg": "image/svg+xml"
    };
    const mimeType = mimeTypes[ext] || "image/png";
    const base64 = fileBuffer.toString("base64");
    return `data:${mimeType};base64,${base64}`;
  } catch (error) {
    throw new McpError(
      ErrorCode.InvalidParams,
      `Failed to read image file: ${imageSource}. Error: ${error}`
    );
  }
}

async function callVisionApi(
  imageSource: string,
  prompt: string,
  model?: string
): Promise<string> {
  const config = await loadVisionConfig();
  const effectiveModel = model || config.default_model;
  const apiKey = await getApiKey();
  const imageUrl = await prepareImageSource(imageSource);
  
  const response = await fetch(`${ALIBABA_API_BASE}/chat/completions`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: effectiveModel,
      messages: [
        {
          role: "user",
          content: [
            { type: "image_url", image_url: { url: imageUrl } },
            { type: "text", text: prompt }
          ]
        }
      ]
    })
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    throw new McpError(
      ErrorCode.InternalError,
      `Alibaba API error (${response.status}): ${errorText}`
    );
  }
  
  const data = await response.json() as {
    choices: Array<{ message: { content: string } }>;
  };
  
  return data.choices[0]?.message?.content || "No response from model";
}

async function handleAnalyzeScreenshot(args: Record<string, unknown>): Promise<string> {
  const { image_source, prompt, model } = validateArgs(AnalyzeScreenshotSchema, args, 'analyze_screenshot');
  
  return callVisionApi(image_source, prompt, model);
}

async function handleExtractText(args: Record<string, unknown>): Promise<string> {
  const { image_source, programming_language, context } = validateArgs(ExtractTextSchema, args, 'extract_text_from_screenshot');
  
  let prompt = "Extract all text from this image. ";
  if (programming_language) {
    prompt += `The image contains ${programming_language} code. Format the code properly. `;
  }
  if (context) {
    prompt += `Context: ${context}. `;
  }
  prompt += "Return the extracted text in a clean, readable format.";
  
  return callVisionApi(image_source, prompt);
}

async function handleDiagnoseError(args: Record<string, unknown>): Promise<string> {
  const { image_source, context } = validateArgs(DiagnoseErrorSchema, args, 'diagnose_error_screenshot');
  
  let prompt = `Analyze this error screenshot and provide:
 1. A clear explanation of what the error means
 2. The root cause of the error
 3. Step-by-step solutions to fix it
 4. Prevention tips if applicable

 `;
  if (context) {
    prompt += `Context: ${context}\n\n`;
  }
  prompt += "Please be specific and actionable in your diagnosis.";
  
  return callVisionApi(image_source, prompt);
}

async function handleUiToArtifact(args: Record<string, unknown>): Promise<string> {
  const { image_source, output_type, prompt } = validateArgs(UiToArtifactSchema, args, 'ui_to_artifact');
  
  const typeInstructions: Record<string, string> = {
    code: "Generate clean, production-ready frontend code (HTML/CSS/React/Vue) that implements this UI design.",
    prompt: "Create an AI prompt that could be used to recreate this UI design.",
    spec: "Generate a detailed design specification document including colors, typography, spacing, components, and layout details.",
    description: "Provide a detailed natural language description of this UI design."
  };
  
  const fullPrompt = `${typeInstructions[output_type] || typeInstructions.description}

 User instructions: ${prompt}`;
  
  return callVisionApi(image_source, fullPrompt);
}

async function handleUnderstandDiagram(args: Record<string, unknown>): Promise<string> {
  const { image_source, diagram_type, prompt } = validateArgs(UnderstandDiagramSchema, args, 'understand_technical_diagram');
  
  let fullPrompt = `Analyze this ${diagram_type === "auto" || !diagram_type ? "technical diagram" : diagram_type} and explain its structure and components.

 `;
  fullPrompt += `What to understand: ${prompt}

Please provide:
 1. An overview of what this diagram represents
 2. Key components and their relationships
 3. Important flows or interactions (if applicable)
 4. Any notable patterns or design decisions`;
  
  return callVisionApi(image_source, fullPrompt);
}

async function handleAnalyzeVisualization(args: Record<string, unknown>): Promise<string> {
  const { image_source, analysis_focus, prompt } = validateArgs(AnalyzeDataVizSchema, args, 'analyze_data_visualization');
  
  const focusInstructions: Record<string, string> = {
    trends: "Focus on identifying trends, patterns, and directional movements in the data.",
    anomalies: "Focus on identifying outliers, unusual data points, and anomalies.",
    comparisons: "Focus on comparing different data series, categories, or time periods.",
    "performance-metrics": "Focus on extracting and interpreting key performance metrics.",
    comprehensive: "Provide a comprehensive analysis covering all aspects."
  };
  
  const fullPrompt = `Analyze this data visualization. ${focusInstructions[analysis_focus || "comprehensive"]}

User request: ${prompt}

Please provide specific insights, numbers where visible, and actionable conclusions.`;
  
  return callVisionApi(image_source, fullPrompt);
}

async function handleUiDiffCheck(args: Record<string, unknown>): Promise<string> {
  const { expected_image_source, actual_image_source, prompt } = validateArgs(UiDiffCheckSchema, args, 'ui_diff_check');
  
  const apiKey = await getApiKey();
  const expectedUrl = await prepareImageSource(expected_image_source);
  const actualUrl = await prepareImageSource(actual_image_source);
  
  const response = await fetch(`${ALIBABA_API_BASE}/chat/completions`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: "kimi-k2.5",
      messages: [
        {
          role: "user",
          content: [
            { type: "image_url", image_url: { url: expectedUrl } },
            { type: "text", text: "This is the EXPECTED/REFERENCE UI design." }
          ]
        },
        {
          role: "user",
          content: [
            { type: "image_url", image_url: { url: actualUrl } },
            { type: "text", text: `This is the ACTUAL implementation. Compare both and identify differences.

User instructions: ${prompt}

Please provide:
1. List of visual differences found
2. Severity of each difference (minor/moderate/critical)
3. Recommendations for fixing discrepancies` }
          ]
        }
      ]
    })
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    throw new McpError(
      ErrorCode.InternalError,
      `Alibaba API error (${response.status}): ${errorText}`
    );
  }
  
  const data = await response.json() as {
    choices: Array<{ message: { content: string } }>;
  };
  
  return data.choices[0]?.message?.content || "No response from model";
}

async function handleListWindows(): Promise<string> {
  try {
    const config = await loadVisionConfig();
    const screenshotConfig = config.screenshot || getDefaultScreenshotCommands();
    
    // Use configured command or default
    const listCmd = screenshotConfig.list_windows_command || 'xdotool search --onlyvisible ".*"';
    
    const { stdout: windowIdsOut } = await execAsync(listCmd + ' 2>/dev/null');
    
    const ids = windowIdsOut.trim().split('\n').filter(Boolean);
    const windows = [];
    
    for (const id of ids) {
      try {
        const { stdout: name } = await execAsync('xdotool getwindowname ' + id + ' 2>/dev/null || echo ""');
        const { stdout: className } = await execAsync('xdotool getwindowclassname ' + id + ' 2>/dev/null || echo ""');
        
        const nameTrimmed = name.trim();
        const classTrimmed = className.trim();
        
        if (nameTrimmed || classTrimmed) {
          windows.push({
            id: id.trim(),
            name: nameTrimmed || "(unnamed)",
            class: classTrimmed || "(no class)"
          });
        }
      } catch {
        // Skip windows we can't query
      }
    }
    
    if (windows.length === 0) {
      return "No visible windows found. Ensure xdotool is installed and X11 is running.";
    }
    
    const windowList = windows.map((w, i) => (i+1) + '. ID: ' + w.id + '\n   Name: ' + w.name + '\n   Class: ' + w.class).join('\n\n');
    return 'Found ' + windows.length + ' visible windows:\n\n' + windowList;
  } catch (error) {
    return 'Error listing windows: ' + error + '. Ensure xdotool is installed.';
  }
}


// Default: do not allow capturing off-screen windows
const DEFAULT_ALLOW_OFFSCREEN_CAPTURE = false;

/**
 * Check if a window is visible on-screen using xdotool geometry.
 * Returns visibility status with reason if off-screen.
 */
async function checkWindowVisibility(windowId: string): Promise<{ visible: boolean; reason?: string }> {
  try {
    const { stdout } = await execAsync(`xdotool getwindowgeometry ${windowId}`);
    const xMatch = stdout.match(/X:\s*(-?\d+)/);
    const yMatch = stdout.match(/Y:\s*(-?\d+)/);
    const x = parseInt(xMatch?.[1] || '0', 10);
    const y = parseInt(yMatch?.[1] || '0', 10);
    
    if (x < 0 || y < 0) {
      return { visible: false, reason: `Window at (${x}, ${y}) is off-screen and cannot be captured` };
    }
    return { visible: true };
  } catch (error) {
    // If we can't get geometry, assume visible (fail open for safety)
    return { visible: true };
  }
}

async function handleCaptureWindow(args: Record<string, unknown>): Promise<string> {
  const { window_class, window_name, analyze, prompt } = validateArgs(CaptureWindowSchema, args, 'capture_window');
  
  if (!window_class && !window_name) {
    throw new McpError(
      ErrorCode.InvalidParams,
      "Either window_class or window_name must be provided"
    );
  }
  
  if (analyze && !prompt) {
    throw new McpError(
      ErrorCode.InvalidParams,
      "prompt is required when analyze=true"
    );
  }
  
  let windowId: string;
  let matchedInfo: string = "";
  
  try {
    if (window_class) {
      // Search for windows with matching class (suppress stderr)
      const { stdout } = await execAsync(
        `xdotool search --onlyvisible --class "${window_class}" 2>/dev/null | head -1`
      );
      windowId = stdout.trim();
      
      if (windowId) {
        // Get the actual class name to verify and log
        try {
          const { stdout: actualClass } = await execAsync(
            `xdotool getwindowclassname ${windowId} 2>/dev/null`
          );
          const { stdout: actualName } = await execAsync(
            `xdotool getwindowname ${windowId} 2>/dev/null`
          );
          matchedInfo = `Matched: "${actualName.trim()}" (class: ${actualClass.trim()})`;
        } catch {
          matchedInfo = `Matched window ID: ${windowId}`;
        }
      }
    } else {
      const { stdout } = await execAsync(
        `xdotool search --onlyvisible --name "${window_name}" 2>/dev/null | head -1`
      );
      windowId = stdout.trim();
    }
    
    if (!windowId) {
      return `Window not found. Use list_windows to see available windows.`;
    }
    
    // Load policy and check blacklist before capture
    const policy = await loadPolicy();
    if (policy.blacklist.enabled) {
      try {
        const { stdout: windowClass } = await execAsync(`xdotool getwindowclassname ${windowId} 2>/dev/null`);
        const { stdout: windowName } = await execAsync(`xdotool getwindowname ${windowId} 2>/dev/null`);
        
        const className = windowClass.trim();
        const name = windowName.trim();
        
        for (const pattern of policy.blacklist.patterns) {
          if (matchGlob(pattern, className) || matchGlob(pattern, name)) {
            // Log to audit if enabled
            if (policy.audit.log_captures) {
              logger.warn('Window capture blocked', { 
                windowId, 
                name, 
                className, 
                pattern, 
                reason: 'blacklist' 
              });
              await logAuditEvent({
                timestamp: new Date().toISOString(),
                action: 'policy_blocked',
                windowId,
                windowName: name,
                windowClass: className,
                pattern,
                result: 'blocked',
                reason: 'blacklist'
              });
            }
            
            throw new McpError(
              ErrorCode.InvalidParams,
              `Window capture blocked: "${name}" matches blacklist pattern "${pattern}". Use fullscreen capture instead.`
            );
          }
        }
      } catch (error) {
        // Re-throw McpError, otherwise continue
        if (error instanceof McpError) throw error;
      }
    }
    
    // Check whitelist if enabled
    if (policy.whitelist.enabled) {
      try {
        const { stdout: windowClass } = await execAsync(`xdotool getwindowclassname ${windowId} 2>/dev/null`);
        const { stdout: windowName } = await execAsync(`xdotool getwindowname ${windowId} 2>/dev/null`);
        
        const className = windowClass.trim();
        const name = windowName.trim();
        
        let whitelisted = false;
        for (const pattern of policy.whitelist.patterns) {
          if (matchGlob(pattern, className) || matchGlob(pattern, name)) {
            whitelisted = true;
            break;
          }
        }
        
        if (!whitelisted) {
          if (policy.audit.log_captures) {
            logger.warn('Window capture blocked - not in whitelist', { windowId, name, className });
            await logAuditEvent({
              timestamp: new Date().toISOString(),
              action: 'policy_blocked',
              windowId,
              windowName: name,
              windowClass: className,
              result: 'blocked',
              reason: 'not_in_whitelist'
            });
          }
          throw new McpError(
            ErrorCode.InvalidParams,
            `Window capture blocked: "${name}" not in whitelist. Allowed patterns: ${policy.whitelist.patterns.join(', ')}`
          );
        }
      } catch (error) {
        // Re-throw McpError, otherwise continue
        if (error instanceof McpError) throw error;
      }
    }
    
    // Check if window is on-screen before capturing
    const visibility = await checkWindowVisibility(windowId);
    if (!visibility.visible) {
      // Check config for allow_offscreen_capture (default: false)
      let allowOffscreen = DEFAULT_ALLOW_OFFSCREEN_CAPTURE;
      try {
        const config = await loadVisionConfig();
        allowOffscreen = config.allow_offscreen_capture ?? DEFAULT_ALLOW_OFFSCREEN_CAPTURE;
      } catch {
        // Config not found or invalid, use default
      }
      
      if (!allowOffscreen) {
        const policy = await loadPolicy();
        if (policy.audit.log_captures) {
          const { stdout: windowClass } = await execAsync(`xdotool getwindowclassname ${windowId} 2>/dev/null`).catch(() => ({ stdout: '' }));
          const { stdout: windowName } = await execAsync(`xdotool getwindowname ${windowId} 2>/dev/null`).catch(() => ({ stdout: '' }));
          await logAuditEvent({
            timestamp: new Date().toISOString(),
            action: 'policy_blocked',
            windowId,
            windowName: windowName.trim(),
            windowClass: windowClass.trim(),
            result: 'blocked',
            reason: 'off_screen'
          });
        }
        throw new McpError(ErrorCode.InvalidParams, visibility.reason || 'Window is off-screen');
      }
    }
    
    const uuid = crypto.randomUUID();
    const tmpXwd = `/tmp/mcp-window-${uuid}.xwd`;
    const tmpPng = `/tmp/mcp-window-${uuid}.png`;
    
    await execAsync(`xwd -id ${windowId} -out ${tmpXwd}`);
    await execAsync(`ffmpeg -y -i ${tmpXwd} ${tmpPng} 2>/dev/null`);
    
    const imageBuffer = await fs.readFile(tmpPng);
    const base64 = `data:image/png;base64,${imageBuffer.toString('base64')}`;

    // Cache the capture for shortcuts
    lastCaptureBase64 = base64;
    lastCaptureType = 'window';
    
    await fs.unlink(tmpXwd).catch(() => {});
    await fs.unlink(tmpPng).catch(() => {});
    
    // Log successful capture
    if (policy.audit.log_captures) {
      const { stdout: windowClass } = await execAsync(`xdotool getwindowclassname ${windowId} 2>/dev/null`).catch(() => ({ stdout: '' }));
      const { stdout: windowName } = await execAsync(`xdotool getwindowname ${windowId} 2>/dev/null`).catch(() => ({ stdout: '' }));
      await logAuditEvent({
        timestamp: new Date().toISOString(),
        action: 'capture_window',
        windowId,
        windowName: windowName.trim(),
        windowClass: windowClass.trim(),
        result: 'success'
      });
    }
    
    if (analyze && prompt) {
      return callVisionApi(base64, prompt);
    }
    
    return `Screenshot captured. ${matchedInfo}\n\nBase64 (first 100 chars): ${base64.substring(0, 100)}...`;
  } catch (error) {
    if (error instanceof McpError) throw error;
    throw new McpError(
      ErrorCode.InternalError,
      `Failed to capture window: ${error}`
    );
  }
}

async function handleListModels(args: Record<string, unknown>): Promise<string> {
  const { include_descriptions } = validateArgs(ListModelsSchema, args, 'list_models');
  const config = await loadVisionConfig();
  
  const models: string[] = Object.keys(config.models);
  
  if (!include_descriptions || !config.allow_model_selection) {
    return `Available vision models: ${models.join(', ')}`;
  }
  
  const modelDetails = models.map(modelId => {
    const info = config.models[modelId];
    return `## ${info.display_name} (${modelId})

${info.description}

**Pros:**
${info.pros.map(p => `- ${p}`).join('\n')}

**Cons:**
${info.cons.map(c => `- ${c}`).join('\n')}

**Best for:** ${info.best_for.join(', ')}`;
  }).join('\n\n---\n\n');
  
  return `# Available Vision Models

Default model: **${config.default_model}**

${modelDetails}`;
}


async function handleHealthCheck(): Promise<string> {
  const results: string[] = [];
  let allHealthy = true;

  const config = await loadVisionConfig();
  results.push(`## Configuration`);
  results.push(`- Default model: ${config.default_model}`);
  results.push(`- Model selection allowed: ${config.allow_model_selection}`);
  results.push(`- Available models: ${Object.keys(config.models).join(', ')}`);

  const configPath = path.join(os.homedir(), ".config", "opencode", "vision-config.json");

  results.push(`\n## Config File`);
  try {
    await fs.access(configPath);
    results.push(`- ${configPath}: ✅ Found`);
  } catch {
    results.push(`- ${configPath}: ⚠️ Not found (using defaults)`);
  }

  results.push(`\n## API Key Validation`);
  try {
    const apiKey = await getApiKey();
    const validation = validateApiKey(apiKey);
    if (validation.valid) {
      results.push(`- API key: ✅ Valid (${maskApiKey(apiKey)})`);
    } else {
      results.push(`- API key: ❌ Invalid - ${validation.error}`);
      allHealthy = false;
    }
  } catch (error) {
    results.push(`- API key: ❌ ${error instanceof Error ? error.message : String(error)}`);
    allHealthy = false;
  }

  results.push(`\n## Vision API Connectivity`);
  try {
    const apiKey = await getApiKey();
    const response = await fetch(`${ALIBABA_API_BASE}/models`, {
      headers: { "Authorization": `Bearer ${apiKey}` }
    });
    if (response.ok) {
      results.push(`- API endpoint: ✅ Reachable`);
    } else {
      results.push(`- API endpoint: ⚠️ HTTP ${response.status}`);
    }
  } catch (error) {
    results.push(`- API endpoint: ❌ ${error instanceof Error ? error.message : String(error)}`);
    allHealthy = false;
  }

  // External tool checks
  results.push(`\n## External Tools`);
  const tools = ['xdotool', 'ffmpeg', 'xwd'];
  const toolStatus: Record<string, { installed: boolean; path?: string }> = {};
  
  for (const tool of tools) {
    try {
      const { stdout } = await execAsync(`which ${tool} 2>/dev/null`);
      const toolPath = stdout.trim();
      toolStatus[tool] = { installed: true, path: toolPath };
      results.push(`- ${tool}: ✅ Installed (${toolPath})`);
    } catch {
      toolStatus[tool] = { installed: false };
      results.push(`- ${tool}: ⚠️ Not installed`);
    }
  }

  // Display server check
  results.push(`\n## Display Server`);
  const display = process.env.DISPLAY;
  const wayland = process.env.WAYLAND_DISPLAY || process.env.XDG_SESSION_TYPE === 'wayland';
  
  if (process.platform === 'darwin') {
    results.push(`- Platform: macOS (native screenshot support)`);
  } else if (wayland) {
    results.push(`- Platform: Wayland (⚠️ limited window capture support)`);
    results.push(`- Recommendation: Use XWayland for full functionality`);
  } else if (display) {
    results.push(`- Platform: X11 (✅ full support)`);
    results.push(`- Display: ${display}`);
  } else {
    results.push(`- Platform: Unknown (❌ no display detected)`);
    results.push(`- Screenshot capture may not work`);
    allHealthy = false;
  }

  const header = allHealthy 
    ? "# Health Check: ✅ All Systems Healthy" 
    : "# Health Check: ⚠️ Issues Detected";

  return `${header}\n\n${results.join('\n')}`;
}

async function handleCaptureScreen(args: Record<string, unknown>): Promise<string> {
  const { analyze, prompt } = validateArgs(CaptureScreenSchema, args, 'capture_screen');
  
  if (analyze && !prompt) {
    throw new McpError(
      ErrorCode.InvalidParams,
      "prompt is required when analyze=true"
    );
  }
  
  try {
    // Load policy and check fullscreen policy
    const policy = await loadPolicy();
    
    // Get platform adapter for window enumeration and blur
    const adapter = getPlatformAdapter();
    
    // Check fullscreen policy mode
    const fullscreenMode = policy.fullscreen_policy.mode;
    
    // If mode is 'allow', skip all policy checks
    if (fullscreenMode !== 'allow') {
      // Get visible windows for policy check
      const visibleWindows = await adapter.listVisibleWindows();
      
      // Build list of regions to blur based on policy
      const regionsToBlur: BlurRegion[] = [];
      
      for (const window of visibleWindows) {
        // Skip windows that are off-screen or minimized
        if (window.isOffScreen || window.isMinimized) {
          continue;
        }
        
        // Check blacklist first (priority over whitelist)
        if (policy.blacklist.enabled) {
          for (const pattern of policy.blacklist.patterns) {
            if (matchGlob(pattern, window.className) || matchGlob(pattern, window.name)) {
              if (fullscreenMode === 'reject') {
                // Log to audit if enabled
                if (policy.audit.log_captures) {
                  logger.warn('Fullscreen capture blocked', {
                    windowId: window.id,
                    name: window.name,
                    className: window.className,
                    pattern,
                    reason: 'blacklist'
                  });
                  await logAuditEvent({
                    timestamp: new Date().toISOString(),
                    action: 'policy_blocked',
                    windowId: window.id,
                    windowName: window.name,
                    windowClass: window.className,
                    pattern,
                    result: 'blocked',
                    reason: 'blacklist'
                  });
                }
                throw new McpError(
                  ErrorCode.InvalidParams,
                  `Fullscreen capture blocked: window "${window.name}" matches blacklist pattern "${pattern}"`
                );
              } else if (fullscreenMode === 'blur') {
                regionsToBlur.push({
                  x: Math.max(0, window.x - 10),
                  y: Math.max(0, window.y - 10),
                  width: window.width + 20,
                  height: window.height + 20,
                  reason: 'blacklisted'
                });
              }
              break; // Stop checking patterns for this window
            }
          }
        }
        
        // Check whitelist if enabled
        if (policy.whitelist.enabled) {
          let whitelisted = false;
          for (const pattern of policy.whitelist.patterns) {
            if (matchGlob(pattern, window.className) || matchGlob(pattern, window.name)) {
              whitelisted = true;
              break;
            }
          }
          
          if (!whitelisted) {
            if (fullscreenMode === 'reject') {
              // Log to audit if enabled
              if (policy.audit.log_captures) {
                logger.warn('Fullscreen capture blocked - not in whitelist', {
                  windowId: window.id,
                  name: window.name,
                  className: window.className
                });
                await logAuditEvent({
                  timestamp: new Date().toISOString(),
                  action: 'policy_blocked',
                  windowId: window.id,
                  windowName: window.name,
                  windowClass: window.className,
                  result: 'blocked',
                  reason: 'not_in_whitelist'
                });
              }
              throw new McpError(
                ErrorCode.InvalidParams,
                `Fullscreen capture blocked: window "${window.name}" not in whitelist`
              );
            } else if (fullscreenMode === 'blur') {
              regionsToBlur.push({
                x: Math.max(0, window.x - 10),
                y: Math.max(0, window.y - 10),
                width: window.width + 20,
                height: window.height + 20,
                reason: 'not_in_whitelist'
              });
            }
          }
        }
      }
      
      // Log capture if audit is enabled and we have regions to blur
      if (regionsToBlur.length > 0 && policy.audit.log_captures) {
        logger.warn('Fullscreen capture with blur applied', {
          regionsCount: regionsToBlur.length,
          reasons: regionsToBlur.map(r => r.reason)
        });
        await logAuditEvent({
          timestamp: new Date().toISOString(),
          action: 'blur_applied',
          result: 'success',
          regionsBlurred: regionsToBlur.length
        });
      }
      
      // Capture screen first
      const monitor = Monitor.fromPoint(0, 0);
      if (!monitor) {
        throw new McpError(ErrorCode.InternalError, "No monitor found");
      }
      
      const image = await monitor.captureImage();
      
      // Apply blur if needed
      if (regionsToBlur.length > 0) {
        // Save to temp file, blur, then read back
        const uuid = crypto.randomUUID();
        const tempPath = `/tmp/mcp-screen-${uuid}.png`;
        const png = await image.toPng();
        await fs.writeFile(tempPath, png);
        
        const blurredPath = await adapter.blurRegions(
          tempPath,
          regionsToBlur,
          policy.fullscreen_policy.blur_strength
        );
        
        const blurredBuffer = await fs.readFile(blurredPath);
        const base64 = `data:image/png;base64,${blurredBuffer.toString('base64')}`;
        
        // Cleanup temp files
        await fs.unlink(tempPath).catch(() => {});
        await fs.unlink(blurredPath).catch(() => {});
        
        // Cache the capture for shortcuts
        lastCaptureBase64 = base64;
        lastCaptureType = 'screen';
        
        // Log successful capture with blur
        if (policy.audit.log_captures) {
          await logAuditEvent({
            timestamp: new Date().toISOString(),
            action: 'capture_screen',
            result: 'success',
            regionsBlurred: regionsToBlur.length
          });
        }
        
        if (analyze && prompt) {
          return callVisionApi(base64, prompt);
        }
        
        return `Screenshot captured successfully (${image.width}x${image.height}) with ${regionsToBlur.length} region(s) blurred.\n\nBase64 image data (first 100 chars): ${base64.substring(0, 100)}...\n\nTo analyze, call again with analyze=true and a prompt.`;
      }
      
      // No blur needed, return normal capture
      const png = await image.toPng();
      const base64 = `data:image/png;base64,${Buffer.from(png).toString('base64')}`;
      
      // Cache the capture for shortcuts
      lastCaptureBase64 = base64;
      lastCaptureType = 'screen';
      
      // Log successful capture without blur
      if (policy.audit.log_captures) {
        await logAuditEvent({
          timestamp: new Date().toISOString(),
          action: 'capture_screen',
          result: 'success'
        });
      }
      
      if (analyze && prompt) {
        return callVisionApi(base64, prompt);
      }
      
      return `Screenshot captured successfully (${image.width}x${image.height}).\n\nBase64 image data (first 100 chars): ${base64.substring(0, 100)}...\n\nTo analyze, call again with analyze=true and a prompt.`;
    }
    
    // Mode is 'allow' - skip policy checks and capture normally
    const monitor = Monitor.fromPoint(0, 0);
    if (!monitor) {
      throw new McpError(ErrorCode.InternalError, "No monitor found");
    }
    
    const image = await monitor.captureImage();
    const png = await image.toPng();
    const base64 = `data:image/png;base64,${Buffer.from(png).toString('base64')}`;
    
    // Cache the capture for shortcuts
    lastCaptureBase64 = base64;
    lastCaptureType = 'screen';
    
    // Log successful capture in allow mode
    const allowPolicy = await loadPolicy();
    if (allowPolicy.audit.log_captures) {
      await logAuditEvent({
        timestamp: new Date().toISOString(),
        action: 'capture_screen',
        result: 'success'
      });
    }
    
    if (analyze && prompt) {
      return callVisionApi(base64, prompt);
    }
    
    return `Screenshot captured successfully (${image.width}x${image.height}).\n\nBase64 image data (first 100 chars): ${base64.substring(0, 100)}...\n\nTo analyze, call again with analyze=true and a prompt.`;
  } catch (error) {
    if (error instanceof McpError) throw error;
    throw new McpError(
      ErrorCode.InternalError,
      `Failed to capture screen: ${error}`
    );
  }
}

async function main() {
  await checkPolicyFilePermissions();
  
  const server = new Server(
    {
      name: "alibaba-vision-mcp",
      version: "1.0.0"
    },
    {
      capabilities: {
        tools: {}
      }
    }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return { tools: TOOLS };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    const toolArgs = args || {};
    
    try {
      let result: string;
      
      switch (name) {
        case "analyze_screenshot":
          result = await handleAnalyzeScreenshot(toolArgs);
          break;
        case "extract_text_from_screenshot":
          result = await handleExtractText(toolArgs);
          break;
        case "diagnose_error_screenshot":
          result = await handleDiagnoseError(toolArgs);
          break;
        case "ui_to_artifact":
          result = await handleUiToArtifact(toolArgs);
          break;
        case "understand_technical_diagram":
          result = await handleUnderstandDiagram(toolArgs);
          break;
        case "analyze_data_visualization":
          result = await handleAnalyzeVisualization(toolArgs);
          break;
        case "ui_diff_check":
          result = await handleUiDiffCheck(toolArgs);
          break;
        case "list_windows":
          result = await handleListWindows();
          break;
        case "capture_window":
          result = await handleCaptureWindow(toolArgs);
          break;
        case "list_models":
          result = await handleListModels(toolArgs);
          break;
        case "capture_screen":
          result = await handleCaptureScreen(toolArgs);
          break;
        case "health_check":
          result = await handleHealthCheck();
          break;
        default:
          throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
      }
      
      return {
        content: [
          {
            type: "text",
            text: result
          }
        ]
      };
    } catch (error) {
      if (error instanceof McpError) {
        throw error;
      }
      throw new McpError(
        ErrorCode.InternalError,
        `Tool execution failed: ${error}`
      );
    }
  });

  const config = await loadVisionConfig();
  printStartupBanner("1.0.0", cachedConfigPath, config.default_model);
  
  const transport = new StdioServerTransport();
  
  // Graceful shutdown handlers
  const shutdown = (signal: string) => {
    logger.info(`Received ${signal}, shutting down gracefully...`);
    process.exit(0);
  };
  
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  
  await server.connect(transport);
}

main().catch((error) => {
  console.error("Server error:", error);
  process.exit(1);
});

// Export security functions for testing and external use
export { matchGlob, validatePattern, checkWindowVisibility, X11Adapter };
export type { BlurRegion };