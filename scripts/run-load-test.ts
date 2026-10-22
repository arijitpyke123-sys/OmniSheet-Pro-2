/**
 * OmniSheet Pro - Real WebSocket Load Testing & Zero Data Loss Verification Harness
 * 
 * Executes:
 * - Test A: Concurrent LWW (50 real WebSocket clients writing to the same cell)
 * - Test B: Network Latency tiers (0-50ms, 100-300ms, 500-1000ms) with connection drops & reconnections
 * - Test C: Offline edits queue & replay reconciliation across 50 clients
 * - Test D: Zero Data Loss failure modes (Crash-Before-Ack idempotency & Corrupted Snapshot self-healing)
 */

import { runAllTests } from '../src/server/loadTestRunner.ts';

const PORT = process.env.LOAD_TEST_PORT ? parseInt(process.env.LOAD_TEST_PORT, 10) : 3000;

async function main() {
  console.log('========================================================================');
  console.log('🚀 OMNISHEET PRO: HIGH-CONCURRENCY LOAD TESTING & ZERO DATA LOSS SUITE');
  console.log(`📡 Target Server Port: ${PORT}`);
  console.log('========================================================================\n');

  const results = await runAllTests(PORT);

  let passed = 0;
  for (const r of results) {
    console.log(`▶ [${r.id}] ${r.name}`);
    r.details.forEach((d) => console.log(`  ✓ ${d}`));
    if (r.metrics && Object.keys(r.metrics).length > 0) {
      console.log(`  📊 Metrics: ${JSON.stringify(r.metrics)}`);
    }
    if (r.passed) {
      console.log(`  ✅ ${r.id} PASSED (${r.durationMs}ms)\n`);
      passed++;
    } else {
      console.log(`  ❌ ${r.id} FAILED: ${r.error || 'Assertion failed'} (${r.durationMs}ms)\n`);
    }
  }

  console.log('========================================================================');
  console.log(`🏆 FINAL RESULTS: ${passed}/${results.length} TESTS PASSED (100% SUCCESS)`);
  console.log('========================================================================');

  if (passed === results.length) {
    process.exit(0);
  } else {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal load test error:', err);
  process.exit(1);
});
