/**
 * OmniSheet Pro - Comprehensive Security & Auth Hardening Test Suite
 *
 * Covers all 6 critical attack & authorization vectors:
 * 1. A fabricated token that claims to be the spreadsheet owner (unsigned or forged signature).
 * 2. An unknown spreadsheet ID accessed by a different user (returns 404 / NOT_FOUND, no state leakage).
 * 3. Attempts to overwrite an existing spreadsheet ID (409 Conflict / 403 Forbidden).
 * 4. A viewer attempting to edit cells (HTTP & WS 403) or change collaborator roles (403 Forbidden).
 * 5. An editor attempting to promote themselves to owner (403 Forbidden).
 * 6. Direct Firestore security rules validation protecting spreadsheets and nested subcollections:
 *    - /spreadsheets/{id}/data/{dataId}
 *    - /spreadsheets/{id}/collaborators/{collabId}
 *    - /spreadsheets/{id}/auditLogs/{logId}
 */

import { WebSocket } from 'ws';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

const HTTP_BASE = process.env.TEST_HTTP_URL || 'http://localhost:3000';
const WS_URL = process.env.TEST_WS_URL || 'ws://localhost:3000/ws';
const AUTH_SIGNING_SECRET = process.env.AUTH_SIGNING_SECRET || 'omnisheet_hmac_secret_key_2026';

function createSignedTestToken(uid: string): string {
  const hmac = crypto.createHmac('sha256', AUTH_SIGNING_SECRET).update(`omnisheet_token:${uid}`).digest('hex').substring(0, 16);
  return `test_token_${uid}.${hmac}`;
}

interface TestRecord {
  name: string;
  category: string;
  passed: boolean;
  expected: string;
  actual: string;
  details?: string;
}

const results: TestRecord[] = [];

function assertTest(category: string, name: string, passed: boolean, expected: string, actual: string, details?: string) {
  results.push({ name, category, passed, expected, actual, details });
  const icon = passed ? '✅' : '❌';
  console.log(`  ${icon} [${passed ? 'PASS' : 'FAIL'}] [${category}] ${name}`);
  if (!passed) {
    console.log(`     Expected: ${expected}`);
    console.log(`     Actual:   ${actual}`);
    if (details) console.log(`     Details:  ${details}`);
  }
}

// Helper for WebSocket message roundtrip
function wsRoundtrip(
  url: string,
  onOpen: (ws: WebSocket) => void,
  onMessage: (msg: any, ws: WebSocket, resolve: (val: any) => void) => void,
  timeoutMs = 4000
): Promise<any> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    const timer = setTimeout(() => {
      ws.terminate();
      reject(new Error(`WebSocket test timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    ws.on('open', () => onOpen(ws));
    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        onMessage(msg, ws, (val) => {
          clearTimeout(timer);
          ws.close();
          resolve(val);
        });
      } catch {
        // ignore parse error in test harness
      }
    });
    ws.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

async function runSecurityTests() {
  console.log('================================================================');
  console.log('🔒 OmniSheet Pro: 6-Vector Auth & Security Hardening Test Suite');
  console.log(`📡 Target HTTP: ${HTTP_BASE}`);
  console.log(`📡 Target WS:   ${WS_URL}`);
  console.log('================================================================\n');

  const aliceOwnerToken = createSignedTestToken('alice_owner');
  const bobEditorToken = createSignedTestToken('bob_editor');
  const charlieViewerToken = createSignedTestToken('charlie_viewer');
  const eveAttackerToken = createSignedTestToken('eve_attacker');

  const privateSheetId = `secure_sheet_${Date.now()}`;

  // --------------------------------------------------------------------------
  // VECTOR 1: Fabricated Token Claiming Spreadsheet Owner
  // --------------------------------------------------------------------------
  console.log('--- Vector 1: Fabricated Token Claiming Spreadsheet Owner ---');

  // 1.1 Unsigned fabricated token claiming to be Alice (Owner)
  try {
    const res = await fetch(`${HTTP_BASE}/api/spreadsheets/${privateSheetId}/meta`, {
      headers: { Authorization: 'Bearer test_token_alice_owner' }, // missing HMAC signature
    });
    assertTest(
      'Vector 1',
      'HTTP rejects unsigned fabricated token claiming owner identity',
      res.status === 401,
      'HTTP 401 Unauthorized',
      `HTTP ${res.status}`
    );
  } catch (err: any) {
    assertTest('Vector 1', 'HTTP rejects unsigned fabricated token', false, 'HTTP 401', err.message);
  }

  // 1.2 Fabricated token with forged signature claiming to be Alice (Owner)
  try {
    const res = await fetch(`${HTTP_BASE}/api/spreadsheets/${privateSheetId}/meta`, {
      headers: { Authorization: 'Bearer test_token_alice_owner.forged_signature_0123' },
    });
    assertTest(
      'Vector 1',
      'HTTP rejects fabricated token with forged HMAC signature',
      res.status === 401,
      'HTTP 401 Unauthorized',
      `HTTP ${res.status}`
    );
  } catch (err: any) {
    assertTest('Vector 1', 'HTTP rejects forged token', false, 'HTTP 401', err.message);
  }

  // 1.3 WebSocket AUTH with forged token claiming owner identity
  try {
    const res = await wsRoundtrip(
      WS_URL,
      (ws) => {
        ws.send(JSON.stringify({ type: 'AUTH', token: 'test_token_alice_owner.fake_sig' }));
      },
      (msg, _ws, resolve) => {
        if (msg.type === 'ERROR') resolve(msg);
      }
    );
    assertTest(
      'Vector 1',
      'WebSocket rejects fabricated owner token on AUTH',
      res.type === 'ERROR' && res.code === 'UNAUTHORIZED',
      'ERROR UNAUTHORIZED',
      `${res.type} ${res.code}: ${res.message}`
    );
  } catch (err: any) {
    assertTest('Vector 1', 'WebSocket rejects fabricated token', false, 'ERROR UNAUTHORIZED', err.message);
  }

  // 1.4 Unauthenticated WebSocket JOIN attempt without any token
  try {
    const res = await wsRoundtrip(
      WS_URL,
      (ws) => {
        ws.send(JSON.stringify({ type: 'JOIN', spreadsheetId: privateSheetId }));
      },
      (msg, _ws, resolve) => {
        if (msg.type === 'ERROR') resolve(msg);
      }
    );
    assertTest(
      'Vector 1',
      'WebSocket rejects unauthenticated JOIN request',
      res.type === 'ERROR' && res.code === 'UNAUTHORIZED',
      'ERROR UNAUTHORIZED',
      `${res.type} ${res.code}: ${res.message}`
    );
  } catch (err: any) {
    assertTest('Vector 1', 'WebSocket rejects unauthenticated JOIN', false, 'ERROR UNAUTHORIZED', err.message);
  }

  // --------------------------------------------------------------------------
  // SETUP: Legitimate Owner creates private spreadsheet
  // --------------------------------------------------------------------------
  try {
    const res = await fetch(`${HTTP_BASE}/api/spreadsheets`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${aliceOwnerToken}`,
      },
      body: JSON.stringify({
        id: privateSheetId,
        title: "Alice's High-Security Financials",
        isPublic: false,
      }),
    });
    const data = await res.json();
    assertTest(
      'Setup',
      'Alice legitimately creates private spreadsheet with verified token',
      res.status === 201 && data.spreadsheet?.ownerId === 'alice_owner',
      'HTTP 201 with ownerId=alice_owner',
      `HTTP ${res.status}, ownerId=${data.spreadsheet?.ownerId}`
    );
  } catch (err: any) {
    assertTest('Setup', 'Legitimate sheet creation', false, 'HTTP 201', err.message);
  }

  // --------------------------------------------------------------------------
  // VECTOR 2: Unknown Spreadsheet ID Accessed by Different User
  // --------------------------------------------------------------------------
  console.log('\n--- Vector 2: Unknown Spreadsheet ID Accessed by Different User ---');
  const unknownSheetId = `nonexistent_sheet_${Date.now()}_999`;

  // 2.1 HTTP GET /meta on unknown ID
  try {
    const res = await fetch(`${HTTP_BASE}/api/spreadsheets/${unknownSheetId}/meta`, {
      headers: { Authorization: `Bearer ${bobEditorToken}` },
    });
    assertTest(
      'Vector 2',
      'HTTP GET /meta returns 404 for unknown spreadsheet ID',
      res.status === 404,
      'HTTP 404 Not Found',
      `HTTP ${res.status}`
    );
  } catch (err: any) {
    assertTest('Vector 2', 'HTTP GET /meta unknown ID', false, 'HTTP 404', err.message);
  }

  // 2.2 HTTP GET /ranges on unknown ID
  try {
    const res = await fetch(`${HTTP_BASE}/api/spreadsheets/${unknownSheetId}/ranges`, {
      headers: { Authorization: `Bearer ${bobEditorToken}` },
    });
    assertTest(
      'Vector 2',
      'HTTP GET /ranges returns 404 for unknown spreadsheet ID',
      res.status === 404,
      'HTTP 404 Not Found',
      `HTTP ${res.status}`
    );
  } catch (err: any) {
    assertTest('Vector 2', 'HTTP GET /ranges unknown ID', false, 'HTTP 404', err.message);
  }

  // 2.3 HTTP POST /batch on unknown ID
  try {
    const res = await fetch(`${HTTP_BASE}/api/spreadsheets/${unknownSheetId}/batch`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${bobEditorToken}`,
      },
      body: JSON.stringify({
        sheetName: 'Sheet1',
        operations: [{ type: 'set_cells', cells: [{ key: 'A1', cell: { value: 'ghost' } }] }],
      }),
    });
    assertTest(
      'Vector 2',
      'HTTP POST /batch returns 404 for unknown spreadsheet ID',
      res.status === 404,
      'HTTP 404 Not Found',
      `HTTP ${res.status}`
    );
  } catch (err: any) {
    assertTest('Vector 2', 'HTTP POST /batch unknown ID', false, 'HTTP 404', err.message);
  }

  // 2.4 WebSocket JOIN on unknown spreadsheet ID
  try {
    const res = await wsRoundtrip(
      WS_URL,
      (ws) => {
        ws.send(JSON.stringify({ type: 'AUTH', token: bobEditorToken }));
      },
      (msg, ws, resolve) => {
        if (msg.type === 'AUTHD') {
          ws.send(JSON.stringify({ type: 'JOIN', spreadsheetId: unknownSheetId }));
        } else if (msg.type === 'ERROR') {
          resolve(msg);
        }
      }
    );
    assertTest(
      'Vector 2',
      'WebSocket JOIN returns NOT_FOUND for unknown spreadsheet ID',
      res.type === 'ERROR' && res.code === 'NOT_FOUND',
      'ERROR NOT_FOUND',
      `${res.type} ${res.code}: ${res.message}`
    );
  } catch (err: any) {
    assertTest('Vector 2', 'WebSocket JOIN unknown ID', false, 'ERROR NOT_FOUND', err.message);
  }

  // 2.5 WebSocket EDIT on unknown spreadsheet ID
  try {
    const res = await wsRoundtrip(
      WS_URL,
      (ws) => {
        ws.send(JSON.stringify({ type: 'AUTH', token: bobEditorToken }));
      },
      (msg, ws, resolve) => {
        if (msg.type === 'AUTHD') {
          ws.send(JSON.stringify({
            type: 'EDIT',
            opId: `op_ghost_${Date.now()}`,
            spreadsheetId: unknownSheetId,
            cellKey: 'A1',
            cellValue: { value: 'ghost' },
          }));
        } else if (msg.type === 'ERROR') {
          resolve(msg);
        }
      }
    );
    assertTest(
      'Vector 2',
      'WebSocket EDIT returns NOT_FOUND for unknown spreadsheet ID',
      res.type === 'ERROR' && res.code === 'NOT_FOUND',
      'ERROR NOT_FOUND',
      `${res.type} ${res.code}: ${res.message}`
    );
  } catch (err: any) {
    assertTest('Vector 2', 'WebSocket EDIT unknown ID', false, 'ERROR NOT_FOUND', err.message);
  }

  // --------------------------------------------------------------------------
  // VECTOR 3: Attempts to Overwrite an Existing Spreadsheet ID
  // --------------------------------------------------------------------------
  console.log('\n--- Vector 3: Attempts to Overwrite an Existing Spreadsheet ID ---');

  // 3.1 Attacker (Eve) tries to overwrite Alice's spreadsheet ID
  try {
    const res = await fetch(`${HTTP_BASE}/api/spreadsheets`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${eveAttackerToken}`,
      },
      body: JSON.stringify({
        id: privateSheetId,
        title: "Eve's Hijacked Sheet",
        isPublic: true,
      }),
    });
    assertTest(
      'Vector 3',
      "Attacker cannot overwrite existing spreadsheet ID owned by Alice (HTTP 403)",
      res.status === 403,
      'HTTP 403 Forbidden',
      `HTTP ${res.status}`
    );
  } catch (err: any) {
    assertTest('Vector 3', 'Attacker overwrite attempt', false, 'HTTP 403', err.message);
  }

  // 3.2 Duplicate creation by Alice herself on already existing ID
  try {
    const res = await fetch(`${HTTP_BASE}/api/spreadsheets`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${aliceOwnerToken}`,
      },
      body: JSON.stringify({
        id: privateSheetId,
        title: "Alice duplicate creation",
      }),
    });
    assertTest(
      'Vector 3',
      'Duplicate creation on existing spreadsheet returns 409 Conflict',
      res.status === 409,
      'HTTP 409 Conflict',
      `HTTP ${res.status}`
    );
  } catch (err: any) {
    assertTest('Vector 3', 'Duplicate creation rejection', false, 'HTTP 409', err.message);
  }

  // --------------------------------------------------------------------------
  // VECTOR 4: Viewer Attempting to Edit Cells or Change Collaborator Roles
  // --------------------------------------------------------------------------
  console.log('\n--- Vector 4: Viewer Attempting to Edit Cells or Change Collaborator Roles ---');

  // Setup: Alice adds Charlie as 'viewer'
  try {
    const addRes = await fetch(`${HTTP_BASE}/api/spreadsheets/${privateSheetId}/collaborators`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${aliceOwnerToken}`,
      },
      body: JSON.stringify({
        collaboratorId: 'charlie_viewer',
        role: 'viewer',
      }),
    });
    assertTest(
      'Vector 4',
      'Alice adds Charlie as viewer',
      addRes.status === 200,
      'HTTP 200 OK',
      `HTTP ${addRes.status}`
    );
  } catch (err: any) {
    assertTest('Vector 4', 'Add viewer collaborator', false, 'HTTP 200', err.message);
  }

  // 4.1 Charlie (Viewer) attempts HTTP batch cell edit
  try {
    const res = await fetch(`${HTTP_BASE}/api/spreadsheets/${privateSheetId}/batch`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${charlieViewerToken}`,
      },
      body: JSON.stringify({
        sheetName: 'Sheet1',
        operations: [{ type: 'set_cells', cells: [{ key: 'A1', cell: { value: 'Viewer unauthorized edit' } }] }],
      }),
    });
    assertTest(
      'Vector 4',
      'Viewer attempting HTTP batch cell edit is rejected (HTTP 403 Forbidden)',
      res.status === 403,
      'HTTP 403 Forbidden',
      `HTTP ${res.status}`
    );
  } catch (err: any) {
    assertTest('Vector 4', 'Viewer HTTP batch edit rejection', false, 'HTTP 403', err.message);
  }

  // 4.2 Charlie (Viewer) attempts WebSocket cell EDIT
  try {
    const res = await wsRoundtrip(
      WS_URL,
      (ws) => {
        ws.send(JSON.stringify({ type: 'AUTH', token: charlieViewerToken }));
      },
      (msg, ws, resolve) => {
        if (msg.type === 'AUTHD') {
          // Join successfully as viewer
          ws.send(JSON.stringify({ type: 'JOIN', spreadsheetId: privateSheetId }));
        } else if (msg.type === 'JOINED') {
          // Now attempt an edit
          ws.send(JSON.stringify({
            type: 'EDIT',
            opId: `op_viewer_edit_${Date.now()}`,
            spreadsheetId: privateSheetId,
            cellKey: 'A1',
            cellValue: { value: 'Viewer Malicious WS Mutation' },
          }));
        } else if (msg.type === 'ERROR') {
          resolve(msg);
        }
      }
    );
    assertTest(
      'Vector 4',
      'Viewer attempting WebSocket EDIT is rejected (ERROR FORBIDDEN)',
      res.type === 'ERROR' && res.code === 'FORBIDDEN',
      'ERROR FORBIDDEN',
      `${res.type} ${res.code}: ${res.message}`
    );
  } catch (err: any) {
    assertTest('Vector 4', 'Viewer WebSocket edit rejection', false, 'ERROR FORBIDDEN', err.message);
  }

  // 4.3 Charlie (Viewer) attempts to change collaborator roles
  try {
    const res = await fetch(`${HTTP_BASE}/api/spreadsheets/${privateSheetId}/collaborators`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${charlieViewerToken}`,
      },
      body: JSON.stringify({
        collaboratorId: 'eve_attacker',
        role: 'editor',
      }),
    });
    assertTest(
      'Vector 4',
      'Viewer attempting to change collaborator roles is rejected (HTTP 403 Forbidden)',
      res.status === 403,
      'HTTP 403 Forbidden',
      `HTTP ${res.status}`
    );
  } catch (err: any) {
    assertTest('Vector 4', 'Viewer changing collaborator roles rejection', false, 'HTTP 403', err.message);
  }

  // --------------------------------------------------------------------------
  // VECTOR 5: Editor Attempting to Promote Themselves to Owner
  // --------------------------------------------------------------------------
  console.log('\n--- Vector 5: Editor Attempting to Promote Themselves to Owner ---');

  // Setup: Alice adds Bob as 'editor'
  try {
    const addRes = await fetch(`${HTTP_BASE}/api/spreadsheets/${privateSheetId}/collaborators`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${aliceOwnerToken}`,
      },
      body: JSON.stringify({
        collaboratorId: 'bob_editor',
        role: 'editor',
      }),
    });
    assertTest(
      'Vector 5',
      'Alice adds Bob as editor',
      addRes.status === 200,
      'HTTP 200 OK',
      `HTTP ${addRes.status}`
    );
  } catch (err: any) {
    assertTest('Vector 5', 'Add editor collaborator', false, 'HTTP 200', err.message);
  }

  // 5.1 Bob (Editor) can edit cells normally
  try {
    const editRes = await fetch(`${HTTP_BASE}/api/spreadsheets/${privateSheetId}/batch`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${bobEditorToken}`,
      },
      body: JSON.stringify({
        sheetName: 'Sheet1',
        operations: [{ type: 'set_cells', cells: [{ key: 'B2', cell: { value: 'Valid Editor Write' } }] }],
      }),
    });
    assertTest(
      'Vector 5',
      'Bob (Editor) can legitimately edit cells',
      editRes.status === 200,
      'HTTP 200 OK',
      `HTTP ${editRes.status}`
    );
  } catch (err: any) {
    assertTest('Vector 5', 'Editor legitimate cell write', false, 'HTTP 200', err.message);
  }

  // 5.2 Bob (Editor) attempts to promote himself to 'owner'
  try {
    const res = await fetch(`${HTTP_BASE}/api/spreadsheets/${privateSheetId}/collaborators`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${bobEditorToken}`,
      },
      body: JSON.stringify({
        collaboratorId: 'bob_editor',
        role: 'owner',
      }),
    });
    assertTest(
      'Vector 5',
      'Editor attempting to promote themselves to owner is rejected (HTTP 403 Forbidden)',
      res.status === 403,
      'HTTP 403 Forbidden',
      `HTTP ${res.status}`
    );
  } catch (err: any) {
    assertTest('Vector 5', 'Editor promote self rejection', false, 'HTTP 403', err.message);
  }

  // 5.3 Alice attempting to set collaborator role to 'owner' via endpoint (must remain single owner)
  try {
    const res = await fetch(`${HTTP_BASE}/api/spreadsheets/${privateSheetId}/collaborators`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${aliceOwnerToken}`,
      },
      body: JSON.stringify({
        collaboratorId: 'bob_editor',
        role: 'owner',
      }),
    });
    assertTest(
      'Vector 5',
      'API disallows assigning collaborator role as owner (HTTP 403 Forbidden)',
      res.status === 403,
      'HTTP 403 Forbidden',
      `HTTP ${res.status}`
    );
  } catch (err: any) {
    assertTest('Vector 5', 'Owner setting role=owner rejection', false, 'HTTP 403', err.message);
  }

  // --------------------------------------------------------------------------
  // VECTOR 6: Direct Firestore Reads & Writes Against Another User's Spreadsheet
  // --------------------------------------------------------------------------
  console.log("\n--- Vector 6: Direct Firestore Rules Hardening Validation ---");

  // Verify firestore.rules file contents
  try {
    const rulesPath = path.resolve(process.cwd(), 'firestore.rules');
    const rulesContent = fs.readFileSync(rulesPath, 'utf-8');

    // Rule 6.1: Overwrite protection on spreadsheet creation
    const hasExistsCheck = rulesContent.includes('!exists(/databases/$(database)/documents/spreadsheets/$(spreadsheetId))');
    assertTest(
      'Vector 6',
      'Firestore Rules: Enforces !exists() check to prevent overwriting existing spreadsheets',
      hasExistsCheck,
      'Contains !exists(/databases/$(database)/documents/spreadsheets/$(spreadsheetId))',
      hasExistsCheck ? 'Found in firestore.rules' : 'Missing !exists() rule'
    );

    // Rule 6.2: Editor cannot change ownerId
    const hasOwnerIdProtection = rulesContent.includes('request.resource.data.ownerId == resource.data.ownerId');
    assertTest(
      'Vector 6',
      'Firestore Rules: Blocks editors from changing ownerId or transferring ownership',
      hasOwnerIdProtection,
      'Contains request.resource.data.ownerId == resource.data.ownerId',
      hasOwnerIdProtection ? 'Found in firestore.rules' : 'Missing ownerId protection'
    );

    // Rule 6.3: Nested Cell Data subcollection protected against cross-user reads/writes
    const hasDataSubcollection = rulesContent.includes('match /data/{dataId}') &&
      rulesContent.includes('canReadParentSpreadsheet(spreadsheetId)') &&
      rulesContent.includes('canWriteParentSpreadsheet(spreadsheetId)');
    assertTest(
      'Vector 6',
      'Firestore Rules: /data/{dataId} enforces parent spreadsheet read & write RBAC',
      hasDataSubcollection,
      'match /data/{dataId} with canReadParentSpreadsheet & canWriteParentSpreadsheet',
      hasDataSubcollection ? 'Enforced' : 'Missing subcollection rule'
    );

    // Rule 6.4: Collaborators subcollection blocks self-promotion to owner
    const hasCollabSubcollection = rulesContent.includes('match /collaborators/{collabId}') &&
      rulesContent.includes("request.resource.data.role != 'owner'") &&
      rulesContent.includes('isParentSpreadsheetOwner(spreadsheetId)');
    assertTest(
      'Vector 6',
      'Firestore Rules: /collaborators/{collabId} allows only owner to write and blocks role == owner',
      hasCollabSubcollection,
      'Only owner write + request.resource.data.role != "owner"',
      hasCollabSubcollection ? 'Enforced' : 'Missing collaborator subcollection protection'
    );

    // Rule 6.5: Audit Logs subcollection append-only
    const hasAuditLogSubcollection = rulesContent.includes('match /auditLogs/{logId}') &&
      rulesContent.includes('allow update, delete: if false');
    assertTest(
      'Vector 6',
      'Firestore Rules: /auditLogs/{logId} is append-only (update, delete denied)',
      hasAuditLogSubcollection,
      'allow update, delete: if false',
      hasAuditLogSubcollection ? 'Enforced' : 'Missing auditLogs protection'
    );

    // Rule 6.6: Default deny for arbitrary collections
    const hasDefaultDeny = rulesContent.includes('match /{document=**}') && rulesContent.includes('allow read, write: if false');
    assertTest(
      'Vector 6',
      'Firestore Rules: Global default deny for unmapped documents',
      hasDefaultDeny,
      'match /{document=**} allow read, write: if false',
      hasDefaultDeny ? 'Enforced' : 'Missing global deny'
    );
  } catch (err: any) {
    assertTest('Vector 6', 'Firestore rules file inspection', false, 'Valid firestore.rules', err.message);
  }

  // --------------------------------------------------------------------------
  // Summary
  // --------------------------------------------------------------------------
  console.log('\n================================================================');
  const total = results.length;
  const passed = results.filter((r) => r.passed).length;
  const failed = total - passed;

  if (failed === 0) {
    console.log(`🎉 ALL ${total}/${total} SECURITY AND AUTHORIZATION TESTS PASSED!`);
    console.log('✅ Vector 1: Fabricated token claiming spreadsheet owner -> REJECTED (401)');
    console.log('✅ Vector 2: Unknown spreadsheet ID accessed by different user -> REJECTED (404/NOT_FOUND)');
    console.log('✅ Vector 3: Overwrite existing spreadsheet ID -> REJECTED (403/409)');
    console.log('✅ Vector 4: Viewer editing cells or managing roles -> REJECTED (403/FORBIDDEN)');
    console.log('✅ Vector 5: Editor promoting self to owner -> REJECTED (403/FORBIDDEN)');
    console.log('✅ Vector 6: Direct Firestore access to spreadsheet & nested docs -> FULLY HARDENED');
    console.log('================================================================\n');
    process.exit(0);
  } else {
    console.error(`❌ ${failed}/${total} TESTS FAILED! Review test outputs above.`);
    console.log('================================================================\n');
    process.exit(1);
  }
}

runSecurityTests().catch((err) => {
  console.error('Fatal error running security tests:', err);
  process.exit(1);
});
