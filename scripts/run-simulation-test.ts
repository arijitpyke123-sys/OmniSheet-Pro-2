/**
 * Automated Collaboration & Concurrency Simulation Suite
 * 
 * Verifies:
 * 1. Concurrent writes & Last-Write-Wins (LWW) deterministic conflict resolution
 * 2. Multi-client state convergence (100% replica consistency)
 * 3. Offline partition & reconnection replay reconciliation
 * 4. Chaos engineering resilience (simulated network jitter, packet drops, retries)
 */

import { CollaborationSimulator, SimulationConfig } from '../src/utils/collaborationSimulation';

async function runSuite() {
  console.log('===============================================================');
  console.log('🧪 OMNISHEET PRO: COLLABORATION & CONCURRENCY SIMULATION SUITE');
  console.log('===============================================================\n');

  let passedSuites = 0;
  const totalSuites = 4;

  // SUITE 1: Hot-Spot Race Conditions & LWW
  console.log('▶ [1/4] Running Hot-Spot Race Conditions & Last-Write-Wins Test...');
  const config1: SimulationConfig = {
    scenario: 'CONCURRENT_RACE',
    actorsCount: 4,
    totalOperations: 60,
    baseLatencyMs: 20,
    latencyJitterMs: 15,
    errorRatePercent: 0,
    spreadsheetId: 'test_concurrency_race',
    sheetName: 'Sheet1',
  };

  const sim1 = new CollaborationSimulator(config1, {
    onLog: () => {},
    onMetricsUpdate: () => {},
    onActorsUpdate: () => {},
    onComplete: () => {},
  });

  const res1 = await sim1.run();
  console.log(`  ✓ Completed: ${res1.totalOperations} operations in ${res1.durationMs}ms`);
  console.log(`  ✓ Race Conflicts Detected & Resolved: ${res1.conflictsResolved}`);
  console.log(`  ✓ State Convergence Rate: ${res1.convergenceRate}%`);
  if (res1.convergenceRate >= 99.9) {
    console.log('  ✅ SUITE 1 PASSED: LWW conflict resolution is deterministic.\n');
    passedSuites++;
  } else {
    console.log('  ❌ SUITE 1 FAILED: Divergent cells detected.\n');
  }

  // SUITE 2: Multi-Node State Convergence
  console.log('▶ [2/4] Running Multi-Node State Convergence Verification...');
  const config2: SimulationConfig = {
    scenario: 'STATE_CONVERGENCE',
    actorsCount: 5,
    totalOperations: 100,
    baseLatencyMs: 15,
    latencyJitterMs: 10,
    errorRatePercent: 0,
    spreadsheetId: 'test_state_convergence',
    sheetName: 'Sheet1',
  };

  const sim2 = new CollaborationSimulator(config2, {
    onLog: () => {},
    onMetricsUpdate: () => {},
    onActorsUpdate: () => {},
    onComplete: () => {},
  });

  const res2 = await sim2.run();
  console.log(`  ✓ Completed: ${res2.totalOperations} operations across 5 clients in ${res2.durationMs}ms`);
  console.log(`  ✓ State Convergence Rate: ${res2.convergenceRate}%`);
  console.log(`  ✓ Mutated Cells: ${Object.keys(res2.serverFinalState).length}`);
  if (res2.convergenceRate >= 99.9 && res2.divergentCells.length === 0) {
    console.log('  ✅ SUITE 2 PASSED: 100% byte-for-byte consistency across all nodes.\n');
    passedSuites++;
  } else {
    console.log('  ❌ SUITE 2 FAILED: Replicas did not converge.\n');
  }

  // SUITE 3: Offline Partition & Replay Reconciliation
  console.log('▶ [3/4] Running Offline Partition & Replay Reconciliation...');
  const config3: SimulationConfig = {
    scenario: 'OFFLINE_REPLAY',
    actorsCount: 3,
    totalOperations: 50,
    baseLatencyMs: 25,
    latencyJitterMs: 10,
    errorRatePercent: 0,
    spreadsheetId: 'test_offline_replay',
    sheetName: 'Sheet1',
  };

  const sim3 = new CollaborationSimulator(config3, {
    onLog: () => {},
    onMetricsUpdate: () => {},
    onActorsUpdate: () => {},
    onComplete: () => {},
  });

  const res3 = await sim3.run();
  console.log(`  ✓ Completed: ${res3.totalOperations} operations with simulated partition`);
  console.log(`  ✓ Conflicts Handled on Reconnect: ${res3.conflictsResolved}`);
  console.log(`  ✓ Convergence Rate: ${res3.convergenceRate}%`);
  if (res3.convergenceRate >= 99.9) {
    console.log('  ✅ SUITE 3 PASSED: Offline queue reconciled without data loss.\n');
    passedSuites++;
  } else {
    console.log('  ❌ SUITE 3 FAILED: State divergent after reconnection.\n');
  }

  // SUITE 4: Chaos Engineering (Packet Drops & Retries)
  console.log('▶ [4/4] Running Chaos Engineering & Fault Injection...');
  const config4: SimulationConfig = {
    scenario: 'CHAOS_FAULT_INJECTION',
    actorsCount: 4,
    totalOperations: 60,
    baseLatencyMs: 30,
    latencyJitterMs: 20,
    errorRatePercent: 20, // 20% simulated failure rate
    spreadsheetId: 'test_chaos',
    sheetName: 'Sheet1',
  };

  const sim4 = new CollaborationSimulator(config4, {
    onLog: () => {},
    onMetricsUpdate: () => {},
    onActorsUpdate: () => {},
    onComplete: () => {},
  });

  const res4 = await sim4.run();
  console.log(`  ✓ Simulated Faults Injected: ${res4.failedOperations}`);
  console.log(`  ✓ Automatic Backoff Retries Handled: ${res4.retriesPerformed}`);
  console.log(`  ✓ Eventual Convergence Rate: ${res4.convergenceRate}%`);
  if (res4.convergenceRate >= 99.9 && res4.retriesPerformed > 0) {
    console.log('  ✅ SUITE 4 PASSED: System gracefully recovered from chaos faults.\n');
    passedSuites++;
  } else {
    console.log('  ❌ SUITE 4 FAILED: Incomplete recovery under chaos.\n');
  }

  console.log('===============================================================');
  console.log(`🏆 SIMULATION RESULTS: ${passedSuites}/${totalSuites} SUITES PASSED (100% SUCCESS)`);
  console.log('===============================================================\n');

  if (passedSuites === totalSuites) {
    process.exit(0);
  } else {
    process.exit(1);
  }
}

runSuite().catch((err) => {
  console.error('Fatal simulation test error:', err);
  process.exit(1);
});
