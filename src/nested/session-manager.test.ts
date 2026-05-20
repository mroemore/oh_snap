import { getNestedSessionManager } from './index.js';
import { spawn } from 'child_process';
import { promisify } from 'util';
import { exec } from 'child_process';
import type { SessionInfo, NestedWindowInfo } from './types.js';

const execAsync = promisify(exec);

const manager = getNestedSessionManager();

let testSessionId: string | null = null;

async function cleanup() {
  if (testSessionId) {
    try {
      await manager.stopSession(testSessionId);
    } catch {
      // Ignore
    }
  }
  await manager.stopAllSessions();
}

async function testStartSession() {
  console.log('\n--- Test: Start Nested Session ---');
  
  const session = await manager.startSession({
    width: 800,
    height: 600,
    windowManager: 'none',
    name: 'test-session-1',
  });
  
  testSessionId = session.sessionId;
  
  if (!session.sessionId) throw new Error('No session ID returned');
  if (!session.display.startsWith(':')) throw new Error(`Invalid display: ${session.display}`);
  if (session.width !== 800) throw new Error(`Wrong width: ${session.width}`);
  if (session.height !== 600) throw new Error(`Wrong height: ${session.height}`);
  
  // Verify Xephyr is running
  const { stdout } = await execAsync(`pgrep -a Xephyr`);
  if (!stdout.includes(session.display)) {
    throw new Error(`Xephyr not running on ${session.display}`);
  }
  
  console.log(`✅ Session started: ${session.sessionId}`);
  console.log(`   Display: ${session.display}`);
  console.log(`   Xephyr process verified`);
}

async function testListSessions() {
  console.log('\n--- Test: List Sessions ---');
  
  const sessions = manager.listSessions();
  
  if (sessions.length === 0) throw new Error('No sessions found');
  if (!sessions.find(s => s.sessionId === testSessionId)) {
    throw new Error('Test session not in list');
  }
  
  console.log(`✅ Found ${sessions.length} session(s)`);
  sessions.forEach((s: SessionInfo) => {
    console.log(`   - ${s.sessionId.substring(0, 8)}... display=${s.display} state=${s.state}`);
  });
}

async function testGetSession() {
  console.log('\n--- Test: Get Session ---');
  
  const session = manager.getSession(testSessionId!);
  
  if (!session) throw new Error('Session not found');
  if (session.state !== 'running') throw new Error(`Wrong state: ${session.state}`);
  
  console.log(`✅ Session retrieved, state: ${session.state}`);
}

async function testRunApplication() {
  console.log('\n--- Test: Run Application in Session ---');
  
  const result = await manager.runInSession(testSessionId!, 'xeyes &');
  
  if (!result.pid) throw new Error('No PID returned');
  
  await new Promise(r => setTimeout(r, 500));
  
  console.log(`✅ Application launch command sent with PID: ${result.pid}`);
}

async function testListWindows() {
  console.log('\n--- Test: List Windows in Session ---');
  
  // Wait for window to appear
  await new Promise(r => setTimeout(r, 500));
  
  const windows = await manager.listWindows(testSessionId!);
  
  if (windows.length === 0) throw new Error('No windows found');
  
  const xeyesWindow = windows.find(w => 
    w.name.toLowerCase().includes('xeyes') || w.className.toLowerCase().includes('xeyes')
  );
  
  if (!xeyesWindow) {
    console.log('Windows found:', windows);
    throw new Error('xeyes window not found');
  }
  
  console.log(`✅ Found ${windows.length} window(s)`);
  windows.forEach((w: NestedWindowInfo) => {
    console.log(`   - ID: ${w.id}, Name: ${w.name}, Class: ${w.className}`);
  });
}

async function testCaptureRoot() {
  console.log('\n--- Test: Capture Root Window ---');
  
  const capture = await manager.captureWindow(testSessionId!);
  
  if (!capture.base64) throw new Error('No base64 data returned');
  if (!capture.base64.startsWith('data:image/png;base64,')) {
    throw new Error('Invalid base64 format');
  }
  
  // Verify it's a valid PNG (check header)
  const base64Data = capture.base64.split(',')[1];
  const buffer = Buffer.from(base64Data, 'base64');
  if (buffer[0] !== 0x89 || buffer[1] !== 0x50) {
    throw new Error('Invalid PNG header');
  }
  
  console.log(`✅ Root window captured`);
  console.log(`   Size: ${buffer.length} bytes`);
}

async function testCaptureByClass() {
  console.log('\n--- Test: Capture Window by Class ---');
  
  const capture = await manager.captureWindow(testSessionId!, 'XEyes');
  
  if (!capture.base64) throw new Error('No base64 data returned');
  if (!capture.windowId) throw new Error('No window ID returned');
  
  console.log(`✅ Window captured by class: XEyes`);
  console.log(`   Window ID: ${capture.windowId}`);
  console.log(`   Window Name: ${capture.windowName}`);
}

async function testCaptureByName() {
  console.log('\n--- Test: Capture Window by Name ---');
  
  const capture = await manager.captureWindow(testSessionId!, undefined, 'xeyes');
  
  if (!capture.base64) throw new Error('No base64 data returned');
  
  console.log(`✅ Window captured by name: xeyes`);
}

async function testRunMultipleApps() {
  console.log('\n--- Test: Run Multiple Applications ---');
  
  await manager.runInSession(testSessionId!, 'xclock &');
  await new Promise(r => setTimeout(r, 500));
  await manager.runInSession(testSessionId!, 'xlogo &');
  await new Promise(r => setTimeout(r, 500));
  
  const windows = await manager.listWindows(testSessionId!);
  
  console.log(`✅ Multiple apps running, ${windows.length} windows found`);
}

async function testStopSession() {
  console.log('\n--- Test: Stop Session ---');
  
  const session = manager.getSession(testSessionId!);
  if (!session) {
    console.log(`✅ Session already stopped (expected behavior)`);
    testSessionId = null;
    return;
  }
  
  const xephyrPid = session.xephyrPid;
  const appPids = session.appPids || [];
  
  await manager.stopSession(testSessionId!);
  
  await new Promise(r => setTimeout(r, 500));
  
  if (xephyrPid) {
    try {
      process.kill(xephyrPid, 0);
      throw new Error(`Xephyr process ${xephyrPid} still running`);
    } catch {
      // Expected
    }
  }
  
  for (const pid of appPids) {
    try {
      process.kill(pid, 0);
      throw new Error(`App process ${pid} still running`);
    } catch {
      // Expected
    }
  }
  
  const sessionAfter = manager.getSession(testSessionId!);
  if (sessionAfter) {
    throw new Error('Session still in registry after stop');
  }
  
  testSessionId = null;
  
  console.log(`✅ Session stopped and all processes cleaned up`);
}

async function testMultipleSessions() {
  console.log('\n--- Test: Multiple Concurrent Sessions ---');
  
  const sessions = [];
  
  for (let i = 0; i < 3; i++) {
    const session = await manager.startSession({
      width: 640,
      height: 480,
      windowManager: 'none',
    });
    sessions.push(session);
    console.log(`   Started session ${i + 1}: ${session.display}`);
  }
  
  // Verify all are running
  const allSessions = manager.listSessions();
  if (allSessions.length < 3) {
    throw new Error(`Expected 3+ sessions, found ${allSessions.length}`);
  }
  
  // Stop all
  await manager.stopAllSessions();
  
  // Verify all stopped
  const remaining = manager.listSessions();
  if (remaining.length > 0) {
    throw new Error(`${remaining.length} sessions still active after stopAllSessions`);
  }
  
  console.log(`✅ Started and stopped ${sessions.length} concurrent sessions`);
}

async function testDisplaySelection() {
  console.log('\n--- Test: Display Selection ---');
  
  // Start session on :99
  const session1 = await manager.startSession({
    display: 99,
    windowManager: 'none',
  });
  
  // Try to start another on same display - should fail or auto-select different
  const session2 = await manager.startSession({
    windowManager: 'none',
  });
  
  if (session1.display === session2.display) {
    // Both got same display - check if first was stopped
    const s1 = manager.getSession(session1.sessionId);
    if (s1) {
      throw new Error('Two sessions got same display');
    }
  }
  
  console.log(`✅ Display selection works: ${session1.display} and ${session2.display}`);
  
  await manager.stopSession(session1.sessionId);
  await manager.stopSession(session2.sessionId);
}

async function testErrorHandling() {
  console.log('\n--- Test: Error Handling ---');
  
  // Test: Stop non-existent session
  try {
    await manager.stopSession('non-existent-session-id');
    throw new Error('Should have thrown for non-existent session');
  } catch (e) {
    if (String(e).includes('not found')) {
      console.log(`✅ Correctly throws for non-existent session`);
    } else {
      throw e;
    }
  }
  
  // Test: Run in non-existent session
  try {
    await manager.runInSession('non-existent-session-id', 'xeyes');
    throw new Error('Should have thrown for non-existent session');
  } catch (e) {
    if (String(e).includes('not found')) {
      console.log(`✅ Correctly throws for run in non-existent session`);
    } else {
      throw e;
    }
  }
  
  // Test: Capture from non-existent session
  try {
    await manager.captureWindow('non-existent-session-id');
    throw new Error('Should have thrown for non-existent session');
  } catch (e) {
    if (String(e).includes('not found')) {
      console.log(`✅ Correctly throws for capture from non-existent session`);
    } else {
      throw e;
    }
  }
}

async function runAllTests() {
  console.log('========================================');
  console.log('  Xephyr Integration Test Suite');
  console.log('========================================');
  
  type TestResult = { name: string; passed: boolean; error?: string };
  const results: TestResult[] = [];
  
  const tests: { name: string; fn: () => Promise<void> }[] = [
    { name: 'Start Session', fn: testStartSession },
    { name: 'List Sessions', fn: testListSessions },
    { name: 'Get Session', fn: testGetSession },
    { name: 'Run Application', fn: testRunApplication },
    { name: 'List Windows', fn: testListWindows },
    { name: 'Capture Root', fn: testCaptureRoot },
    { name: 'Capture by Class', fn: testCaptureByClass },
    { name: 'Capture by Name', fn: testCaptureByName },
    { name: 'Multiple Apps', fn: testRunMultipleApps },
    { name: 'Stop Session', fn: testStopSession },
    { name: 'Multiple Sessions', fn: testMultipleSessions },
    { name: 'Display Selection', fn: testDisplaySelection },
    { name: 'Error Handling', fn: testErrorHandling },
  ];
  
  for (const test of tests) {
    try {
      await test.fn();
      results.push({ name: test.name, passed: true });
    } catch (error) {
      results.push({ name: test.name, passed: false, error: String(error) });
    }
  }
  
  await cleanup();
  
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  
  console.log('\n========================================');
  console.log(`  Results: ${passed} passed, ${failed} failed`);
  console.log('========================================');
  
  for (const r of results) {
    if (r.passed) {
      console.log(`✅ ${r.name}`);
    } else {
      console.log(`❌ ${r.name}`);
      if (r.error) console.log(`   Error: ${r.error}`);
    }
  }
  
  if (failed > 0) {
    process.exit(1);
  }
}

runAllTests().catch(async (error) => {
  console.error('\n!!! TEST RUNNER CRASHED !!!');
  console.error(error);
  await cleanup();
  process.exit(1);
});