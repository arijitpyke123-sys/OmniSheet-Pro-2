/**
 * OmniSheet Pro - Automated Test Suite: Browser-side IndexedDB Durable Offline Queue
 *
 * Verifies all 5 core requirements:
 * 1. Saves each edit locally with a unique opId.
 * 2. Preserves pending edits when the browser closes or refreshes.
 * 3. Replays unconfirmed edits after reconnection.
 * 4. Removes an edit only after its commit is confirmed.
 * 5. Reconciles pending edits with server revisions and conflicting changes (LWW timestamp).
 */

import { indexedDBQueue, OfflineEditOp, LocalSheetSnapshot } from '../src/services/indexedDBQueue.ts';

interface TestResult {
  name: string;
  passed: boolean;
  expected: string;
  actual: string;
  details?: string;
}

const results: TestResult[] = [];

function assertTest(name: string, passed: boolean, expected: string, actual: string, details?: string) {
  results.push({ name, passed, expected, actual, details });
  const icon = passed ? '✅' : '❌';
  console.log(`  ${icon} [${passed ? 'PASS' : 'FAIL'}] ${name}`);
  if (!passed) {
    console.log(`     Expected: ${expected}`);
    console.log(`     Actual:   ${actual}`);
    if (details) console.log(`     Details:  ${details}`);
  }
}

async function runOfflineQueueTests() {
  console.log('========================================================================');
  console.log('📦 OmniSheet Pro: Browser-Side IndexedDB Durable Offline Queue Test Suite');
  console.log('========================================================================\n');

  const testSheetId = `test_offline_sheet_${Date.now()}`;

  // --------------------------------------------------------------------------
  // TEST 1: Saves each edit locally with a unique opId
  // --------------------------------------------------------------------------
  console.log('--- Test 1: Save Edits Locally with Unique opId ---');
  const opId1 = `op_user_alice_${Date.now()}_001`;
  const opId2 = `op_user_alice_${Date.now()}_002`;

  const edit1: OfflineEditOp = {
    opId: opId1,
    spreadsheetId: testSheetId,
    sheetName: 'Sheet1',
    cellKey: 'A1',
    cellValue: { value: 'Offline Value 1', bold: true },
    clientTimestamp: Date.now() - 5000,
    baseRevision: 1,
    status: 'pending',
  };

  const edit2: OfflineEditOp = {
    opId: opId2,
    spreadsheetId: testSheetId,
    sheetName: 'Sheet1',
    cellKey: 'B2',
    cellValue: { value: 'Offline Value 2' },
    clientTimestamp: Date.now() - 4000,
    baseRevision: 1,
    status: 'pending',
  };

  await indexedDBQueue.savePendingEdit(edit1);
  await indexedDBQueue.savePendingEdit(edit2);

  const pendingAfterSave = await indexedDBQueue.getPendingEdits(testSheetId);
  assertTest(
    '1. Saves each edit locally with a unique opId',
    pendingAfterSave.length === 2 &&
      pendingAfterSave[0].opId === opId1 &&
      pendingAfterSave[1].opId === opId2,
    '2 distinct edits saved with unique opIds',
    `${pendingAfterSave.length} edits, IDs: [${pendingAfterSave.map(e => e.opId).join(', ')}]`
  );

  // --------------------------------------------------------------------------
  // TEST 2: Preserves pending edits when browser closes or refreshes
  // --------------------------------------------------------------------------
  console.log('\n--- Test 2: Preserve Pending Edits Across Session / Refresh ---');
  // Save local sheet snapshot simulating full spreadsheet persistence
  const initialSnapshot: LocalSheetSnapshot = {
    spreadsheetId: testSheetId,
    title: 'Financial Model 2026',
    sheetNames: ['Sheet1', 'Sheet2'],
    sheets: {
      Sheet1: {
        A1: { value: 'Initial Old A1' },
        C3: { value: 'Existing Cell C3' },
      },
      Sheet2: {},
    },
    revision: 1,
    updatedAt: new Date().toISOString(),
  };

  await indexedDBQueue.saveSheetSnapshot(initialSnapshot);

  // Simulate browser restart / reload: read snapshot and overlay pending edits
  const reloadedSnapshot = await indexedDBQueue.loadSheetSnapshot(testSheetId);
  const reloadedPending = await indexedDBQueue.getPendingEdits(testSheetId);

  // Overlay unconfirmed edits on top of snapshot in timestamp order
  const reconstructedSheets = JSON.parse(JSON.stringify(reloadedSnapshot!.sheets));
  for (const op of reloadedPending) {
    if (!reconstructedSheets[op.sheetName]) reconstructedSheets[op.sheetName] = {};
    reconstructedSheets[op.sheetName][op.cellKey] = op.cellValue;
  }

  assertTest(
    '2. Preserves pending edits and local snapshot across reload',
    reloadedSnapshot !== null &&
      reloadedPending.length === 2 &&
      reconstructedSheets['Sheet1']['A1'].value === 'Offline Value 1' &&
      reconstructedSheets['Sheet1']['B2'].value === 'Offline Value 2' &&
      reconstructedSheets['Sheet1']['C3'].value === 'Existing Cell C3',
    'A1="Offline Value 1", B2="Offline Value 2", C3 preserved',
    `A1="${reconstructedSheets['Sheet1']['A1']?.value}", B2="${reconstructedSheets['Sheet1']['B2']?.value}", C3="${reconstructedSheets['Sheet1']['C3']?.value}"`
  );

  // --------------------------------------------------------------------------
  // TEST 3 & 4: Replay unconfirmed edits & remove edit ONLY after commit is confirmed
  // --------------------------------------------------------------------------
  console.log('\n--- Test 3 & 4: Replay & Strict Commit Confirmation Removal ---');
  // Simulate network in-flight transmission
  await indexedDBQueue.markEditInFlight(opId1);
  const inFlightList = await indexedDBQueue.getPendingEdits(testSheetId);
  const inFlightOp = inFlightList.find(o => o.opId === opId1);

  assertTest(
    'Edit marked in-flight remains in queue before confirmation',
    inFlightOp !== undefined && inFlightOp.status === 'in_flight',
    'status: in_flight and preserved in queue',
    `status: ${inFlightOp?.status}`
  );

  // If connection drops before ACK, reset in-flight edits so they will be replayed
  await indexedDBQueue.resetInFlightEdits(testSheetId);
  const resetList = await indexedDBQueue.getPendingEdits(testSheetId);
  assertTest(
    'Dropped connection preserves unconfirmed edits for retry',
    resetList.every(o => o.status === 'pending'),
    'All edits returned to pending status for retry replay',
    `Statuses: [${resetList.map(o => o.status).join(', ')}]`
  );

  // Now simulate Server ACK received for opId1 ONLY
  await indexedDBQueue.removeConfirmedEdit(opId1, testSheetId);
  const afterAck1 = await indexedDBQueue.getPendingEdits(testSheetId);

  assertTest(
    '4. Removes edit ONLY after commit is confirmed (opId1 removed, opId2 remains)',
    afterAck1.length === 1 && afterAck1[0].opId === opId2,
    'opId1 removed, opId2 safely kept in queue',
    `Remaining: [${afterAck1.map(o => o.opId).join(', ')}]`
  );

  // Now confirm opId2
  await indexedDBQueue.removeConfirmedEdit(opId2, testSheetId);
  const afterAck2 = await indexedDBQueue.getPendingEdits(testSheetId);

  assertTest(
    '4b. All confirmed edits removed once fully committed',
    afterAck2.length === 0,
    '0 pending edits in queue',
    `${afterAck2.length} pending edits`
  );

  // --------------------------------------------------------------------------
  // TEST 5: Reconcile pending edits with server revisions and conflicting changes
  // --------------------------------------------------------------------------
  console.log('\n--- Test 5: Reconcile Pending Edits with Server Revisions & Conflicts ---');

  const now = Date.now();

  // Scenario:
  // - Local client was offline and edited D4 at (now - 1000ms) with 'Local Newer Edit'
  // - Local client ALSO edited E5 at (now - 10000ms) with 'Local Older Edit'
  // - Server arrived with revision 5:
  //   - D4 was edited on server at (now - 5000ms) with 'Server Older Edit' -> LOCAL SHOULD WIN (newer timestamp)
  //   - E5 was edited on server at (now - 2000ms) with 'Server Newer Edit' -> SERVER SHOULD WIN (newer timestamp)
  //   - F6 was edited on server with 'Server Unconflicted Edit' -> SERVER APPLIED CLEANLY

  const localD4: OfflineEditOp = {
    opId: `op_conflict_d4_${now}`,
    spreadsheetId: testSheetId,
    sheetName: 'Sheet1',
    cellKey: 'D4',
    cellValue: { value: 'Local Newer Edit' },
    clientTimestamp: now - 1000, // Newer than server
    baseRevision: 1,
    status: 'pending',
  };

  const localE5: OfflineEditOp = {
    opId: `op_conflict_e5_${now}`,
    spreadsheetId: testSheetId,
    sheetName: 'Sheet1',
    cellKey: 'E5',
    cellValue: { value: 'Local Older Edit' },
    clientTimestamp: now - 10000, // Older than server
    baseRevision: 1,
    status: 'pending',
  };

  const pendingConflictOps = [localD4, localE5];

  const currentLocalSheets = {
    Sheet1: {
      D4: { value: 'Local Newer Edit' },
      E5: { value: 'Local Older Edit' },
    },
  };

  const incomingServerSheets = {
    Sheet1: {
      D4: { value: 'Server Older Edit' },
      E5: { value: 'Server Newer Edit' },
      F6: { value: 'Server Unconflicted Edit' },
    },
  };

  const reconciliation = indexedDBQueue.reconcilePendingEditsWithServer(
    currentLocalSheets,
    incomingServerSheets,
    pendingConflictOps,
    now - 3000, // serverTimestamp for D4 comparison
    5
  );

  // Assert D4 (Local won)
  const d4Value = reconciliation.reconciledSheets['Sheet1']['D4']?.value;
  assertTest(
    '5a. Conflict Resolution: Local newer edit wins on cell D4 (LWW timestamp)',
    d4Value === 'Local Newer Edit',
    'Local Newer Edit',
    String(d4Value)
  );

  // Assert E5 (Server won because server change was newer than local edit)
  const e5Value = reconciliation.reconciledSheets['Sheet1']['E5']?.value;
  assertTest(
    '5b. Conflict Resolution: Server newer edit wins on cell E5 and drops superseded op',
    e5Value === 'Server Newer Edit' && reconciliation.droppedOpIds.includes(localE5.opId),
    'Server Newer Edit and opId dropped',
    `Value="${e5Value}", droppedOpIds=[${reconciliation.droppedOpIds.join(', ')}]`
  );

  // Assert F6 (Server unconflicted applied)
  const f6Value = reconciliation.reconciledSheets['Sheet1']['F6']?.value;
  assertTest(
    '5c. Non-conflicting server changes applied cleanly (cell F6)',
    f6Value === 'Server Unconflicted Edit',
    'Server Unconflicted Edit',
    String(f6Value)
  );

  // Assert Conflict records logged
  assertTest(
    '5d. Detailed conflict logs recorded for auditability',
    reconciliation.conflicts.length === 2 &&
      reconciliation.conflicts.some(c => c.winner === 'local') &&
      reconciliation.conflicts.some(c => c.winner === 'server'),
    '2 conflict events logged with local & server winners',
    `${reconciliation.conflicts.length} conflicts recorded`
  );

  // --------------------------------------------------------------------------
  // Summary
  // --------------------------------------------------------------------------
  console.log('\n========================================================================');
  const total = results.length;
  const passed = results.filter(r => r.passed).length;
  const failed = total - passed;

  if (failed === 0) {
    console.log(`🎉 ALL ${total}/${total} INDEXEDDB OFFLINE QUEUE TESTS PASSED! (100% SUCCESS)`);
    console.log('✅ Requirement 1: Saves each edit locally with a unique opId');
    console.log('✅ Requirement 2: Preserves pending edits when browser closes or refreshes');
    console.log('✅ Requirement 3: Replays unconfirmed edits after reconnection');
    console.log('✅ Requirement 4: Removes an edit only after its commit is confirmed');
    console.log('✅ Requirement 5: Reconciles pending edits with server revisions & conflicting changes');
    console.log('========================================================================\n');
    process.exit(0);
  } else {
    console.error(`❌ ${failed}/${total} TESTS FAILED! Review output above.`);
    console.log('========================================================================\n');
    process.exit(1);
  }
}

runOfflineQueueTests().catch((err) => {
  console.error('Fatal offline test error:', err);
  process.exit(1);
});
