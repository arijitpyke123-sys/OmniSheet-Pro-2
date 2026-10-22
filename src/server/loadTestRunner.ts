import { WebSocket } from 'ws';
import http from 'http';

export interface TestResult {
  id: string;
  name: string;
  passed: boolean;
  durationMs: number;
  details: string[];
  metrics: Record<string, any>;
  error?: string;
}

interface AckRecord {
  clientId: string;
  opId: string;
  clientTimestamp: number;
  serverTimestamp: number;
  revision: number;
  cellKey: string;
  cellValue: any;
  deduplicated?: boolean;
  status?: string;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function httpGet(url: string, token = 'test_token_admin_runner'): Promise<any> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const req = http.request({
      hostname: parsed.hostname,
      port: parsed.port,
      path: parsed.pathname + parsed.search,
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch {
          resolve(data);
        }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

function httpPost(url: string, body: any, token = 'test_token_admin_runner'): Promise<any> {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify(body);
    const parsed = new URL(url);
    const req = http.request({
      hostname: parsed.hostname,
      port: parsed.port,
      path: parsed.pathname + parsed.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
        'Authorization': `Bearer ${token}`,
      },
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch {
          resolve(data);
        }
      });
    });
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

class TestClient {
  public id: string;
  public ws: WebSocket | null = null;
  public spreadsheetId: string;
  public currentRevision: number = 0;
  public localCells: Record<string, any> = {};
  public pendingAcks: Map<string, (ack: AckRecord) => void> = new Map();
  public offlineQueue: any[] = [];
  public isConnected: boolean = false;
  public artificialDelayMs: number = 0;
  public token: string;
  private wsUrl: string;

  constructor(id: string, spreadsheetId: string, wsUrl: string, artificialDelayMs = 0, token?: string) {
    this.id = id;
    this.spreadsheetId = spreadsheetId;
    this.token = token || `test_token_${id}`;
    const separator = wsUrl.includes('?') ? '&' : '?';
    this.wsUrl = `${wsUrl}${separator}token=${this.token}`;
    this.artificialDelayMs = artificialDelayMs;
  }

  public connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.wsUrl);

      this.ws.on('open', () => {
        this.isConnected = true;
        // Authenticate with verified token
        this.ws!.send(JSON.stringify({
          type: 'AUTH',
          token: this.token,
        }));
        this.ws!.send(JSON.stringify({
          type: 'JOIN',
          spreadsheetId: this.spreadsheetId,
          clientId: this.id,
          lastRevision: this.currentRevision,
        }));
      });

      this.ws.on('message', (raw) => {
        try {
          const msg = JSON.parse(raw.toString());
          if (msg.type === 'JOINED') {
            this.currentRevision = msg.revision || 0;
            this.localCells = { ...msg.cells };
            resolve();
          } else if (msg.type === 'ACK') {
            if (msg.revision > this.currentRevision) {
              this.currentRevision = msg.revision;
            }
            if (msg.cellKey) {
              this.localCells[msg.cellKey] = msg.cellValue;
            }
            const resolver = this.pendingAcks.get(msg.opId);
            if (resolver) {
              this.pendingAcks.delete(msg.opId);
              resolver(msg as AckRecord);
            }
          } else if (msg.type === 'OP_BROADCAST') {
            if (msg.revision > this.currentRevision) {
              this.currentRevision = msg.revision;
            }
            if (msg.cellKey) {
              this.localCells[msg.cellKey] = msg.cellValue;
            }
          }
        } catch {
          // Ignore
        }
      });

      this.ws.on('error', (err) => {
        if (!this.isConnected) reject(err);
      });

      this.ws.on('close', () => {
        this.isConnected = false;
      });
    });
  }

  public async sendEdit(
    cellKey: string,
    cellValue: any,
    options: { customOpId?: string; simulateCrashBeforeAck?: boolean } = {}
  ): Promise<AckRecord> {
    if (this.artificialDelayMs > 0) {
      await sleep(this.artificialDelayMs);
    }

    const opId = options.customOpId || `op_${this.id}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const clientTimestamp = Date.now();

    if (!this.isConnected) {
      this.offlineQueue.push({ opId, cellKey, cellValue, clientTimestamp });
      this.localCells[cellKey] = typeof cellValue === 'object' ? cellValue : { value: cellValue };
      return {
        clientId: this.id,
        opId,
        clientTimestamp,
        serverTimestamp: 0,
        revision: this.currentRevision,
        cellKey,
        cellValue,
      };
    }

    return new Promise((resolve) => {
      this.pendingAcks.set(opId, resolve);
      this.ws!.send(JSON.stringify({
        type: 'EDIT',
        opId,
        spreadsheetId: this.spreadsheetId,
        sheetName: 'Sheet1',
        cellKey,
        cellValue,
        clientTimestamp,
        simulateCrashBeforeAck: options.simulateCrashBeforeAck || false,
      }));
    });
  }

  public disconnect() {
    this.isConnected = false;
    if (this.ws) {
      this.ws.terminate();
      this.ws = null;
    }
  }

  public async replayOfflineQueue(): Promise<AckRecord[]> {
    const acks: AckRecord[] = [];
    const queue = [...this.offlineQueue];
    this.offlineQueue = [];
    for (const item of queue) {
      const ack = await this.sendEdit(item.cellKey, item.cellValue, { customOpId: item.opId });
      acks.push(ack);
    }
    return acks;
  }
}

// TEST A: Concurrent LWW with 50 real WebSocket clients
export async function runTestA(port = 3000): Promise<TestResult> {
  const start = Date.now();
  const wsUrl = `ws://localhost:${port}/ws`;
  const httpBase = `http://localhost:${port}`;
  const sheetA = `test_lww_${Date.now()}`;
  const clientsA: TestClient[] = [];
  const clientCount = 50;
  const details: string[] = [];

  try {
    for (let i = 0; i < clientCount; i++) {
      clientsA.push(new TestClient(`ws_actor_${i + 1}`, sheetA, wsUrl));
    }
    await Promise.all(clientsA.map((c) => c.connect()));
    details.push(`Connected ${clientCount} real WebSocket clients`);

    const acksA: AckRecord[] = [];
    const writePromises = clientsA.map(async (client, idx) => {
      await sleep(Math.floor(Math.random() * 20));
      const val = { value: `WINNER_${idx + 1}`, bold: true };
      const ack = await client.sendEdit('B2', val);
      acksA.push(ack);
    });

    await Promise.all(writePromises);
    details.push(`Received 50/50 server acknowledgments across concurrent writes`);

    acksA.sort((a, b) => a.revision - b.revision);
    const highestAck = acksA[acksA.length - 1];
    details.push(`Authoritative Winner: "${highestAck.cellValue?.value}" at Rev ${highestAck.revision}`);

    await sleep(100);
    const serverRanges = await httpGet(`${httpBase}/api/spreadsheets/${sheetA}/ranges?sheetName=Sheet1&startRow=0&endRow=5&startCol=0&endCol=5`);
    const serverB2 = serverRanges.cells?.['B2'];

    let divergent = 0;
    for (const c of clientsA) {
      if (c.localCells['B2']?.value !== highestAck.cellValue?.value) divergent++;
    }

    const passed = serverB2?.value === highestAck.cellValue?.value && divergent === 0;
    clientsA.forEach((c) => c.disconnect());

    return {
      id: 'TEST_A',
      name: 'Concurrent LWW (50 Real WebSockets)',
      passed,
      durationMs: Date.now() - start,
      details,
      metrics: {
        clientsCount: clientCount,
        targetCell: 'B2',
        finalRevision: highestAck.revision,
        winningValue: highestAck.cellValue?.value,
        divergentReplicas: divergent,
        throughputOpsSec: Math.round(50 / ((Date.now() - start) / 1000)),
      },
    };
  } catch (err: any) {
    clientsA.forEach((c) => c.disconnect());
    return {
      id: 'TEST_A',
      name: 'Concurrent LWW (50 Real WebSockets)',
      passed: false,
      durationMs: Date.now() - start,
      details,
      metrics: {},
      error: err.message,
    };
  }
}

// TEST B: Multi-Tier Network Latency & Drops
export async function runTestB(port = 3000): Promise<TestResult> {
  const start = Date.now();
  const wsUrl = `ws://localhost:${port}/ws`;
  const httpBase = `http://localhost:${port}`;
  const sheetB = `test_latency_${Date.now()}`;
  const clientsB: TestClient[] = [];
  const clientCount = 50;
  const details: string[] = [];

  try {
    for (let i = 0; i < clientCount; i++) {
      let delay = 0;
      if (i < 17) delay = Math.floor(Math.random() * 50);
      else if (i < 34) delay = 100 + Math.floor(Math.random() * 200);
      else delay = 500 + Math.floor(Math.random() * 500);
      clientsB.push(new TestClient(`latency_actor_${i + 1}`, sheetB, wsUrl, delay));
    }

    await Promise.all(clientsB.map((c) => c.connect()));
    details.push('Simulated 3 latency tiers: Tier 1 (0-50ms), Tier 2 (100-300ms), Tier 3 (500-1000ms)');

    const opPromises = clientsB.map((c, idx) => c.sendEdit(`C${idx + 1}`, { value: `Metric_${idx + 1}` }));

    await sleep(150);
    const droppedClients = clientsB.slice(20, 30);
    droppedClients.forEach((c) => c.disconnect());
    details.push('Induced network fault: dropped 10 connections midway');

    await Promise.all(opPromises.filter((_, idx) => idx < 20 || idx >= 30));

    for (const c of droppedClients) await c.connect();
    details.push('Reconnected dropped clients with state synchronization');

    await Promise.all(droppedClients.map((c, idx) => c.sendEdit(`C${20 + idx + 1}`, { value: `Metric_${20 + idx + 1}_recovered` })));

    await sleep(250);
    const finalServerB = await httpGet(`${httpBase}/api/spreadsheets/${sheetB}/ranges?sheetName=Sheet1&startRow=0&endRow=55&startCol=2&endCol=3`);

    let populatedCount = 0;
    for (let i = 1; i <= 50; i++) {
      if (finalServerB.cells?.[`C${i}`]) populatedCount++;
    }

    const passed = populatedCount === 50;
    clientsB.forEach((c) => c.disconnect());

    return {
      id: 'TEST_B',
      name: 'Network Latency & Drop Resilience (50 Clients)',
      passed,
      durationMs: Date.now() - start,
      details,
      metrics: {
        totalClients: clientCount,
        droppedClientsCount: droppedClients.length,
        convergedCells: `${populatedCount}/50`,
      },
    };
  } catch (err: any) {
    clientsB.forEach((c) => c.disconnect());
    return {
      id: 'TEST_B',
      name: 'Network Latency & Drop Resilience (50 Clients)',
      passed: false,
      durationMs: Date.now() - start,
      details,
      metrics: {},
      error: err.message,
    };
  }
}

// TEST C: Offline Queue Replay Reconciliation
export async function runTestC(port = 3000): Promise<TestResult> {
  const start = Date.now();
  const wsUrl = `ws://localhost:${port}/ws`;
  const httpBase = `http://localhost:${port}`;
  const sheetC = `test_offline_${Date.now()}`;
  const clientsC: TestClient[] = [];
  const details: string[] = [];

  try {
    for (let i = 0; i < 50; i++) {
      clientsC.push(new TestClient(`client_${i + 1}`, sheetC, wsUrl));
    }
    await Promise.all(clientsC.map((c) => c.connect()));

    const offlineClients = clientsC.slice(40, 50);
    const onlineClients = clientsC.slice(0, 40);
    offlineClients.forEach((c) => c.disconnect());
    details.push('Entered offline partition mode for 10 clients');

    await Promise.all(onlineClients.map((c, idx) => c.sendEdit(`D${idx + 1}`, { value: `Online_${idx + 1}` })));
    await onlineClients[0].sendEdit('E1', { value: 'Online_E1_PreOffline' });

    for (let i = 0; i < offlineClients.length; i++) {
      await offlineClients[i].sendEdit(`F${i + 1}`, { value: `Offline_Queued_${i + 1}` });
      if (i === 9) {
        await offlineClients[i].sendEdit('E1', { value: 'Offline_Queued_E1_Winner' });
      }
    }
    details.push('10 offline clients accumulated local mutation queues');

    for (const c of offlineClients) await c.connect();
    for (const c of offlineClients) await c.replayOfflineQueue();
    details.push('Replayed offline outbox queue with original opIds');

    await sleep(250);
    const finalServerC = await httpGet(`${httpBase}/api/spreadsheets/${sheetC}/ranges?sheetName=Sheet1&startRow=0&endRow=50&startCol=0&endCol=10`);
    const finalCells = finalServerC.cells || {};

    let missingCount = 0;
    for (let i = 1; i <= 40; i++) if (!finalCells[`D${i}`]) missingCount++;
    for (let i = 1; i <= 10; i++) if (!finalCells[`F${i}`]) missingCount++;
    const conflictingWinner = finalCells['E1']?.value;

    const passed = missingCount === 0 && conflictingWinner === 'Offline_Queued_E1_Winner';
    clientsC.forEach((c) => c.disconnect());

    return {
      id: 'TEST_C',
      name: 'Offline Outbox Queue Replay Reconciliation',
      passed,
      durationMs: Date.now() - start,
      details,
      metrics: {
        onlineClients: 40,
        offlineClients: 10,
        conflictingCellWinner: conflictingWinner,
        missingCellsCount: missingCount,
      },
    };
  } catch (err: any) {
    clientsC.forEach((c) => c.disconnect());
    return {
      id: 'TEST_C',
      name: 'Offline Outbox Queue Replay Reconciliation',
      passed: false,
      durationMs: Date.now() - start,
      details,
      metrics: {},
      error: err.message,
    };
  }
}

// TEST D: Zero Data Loss Proof
export async function runTestD(port = 3000): Promise<TestResult> {
  const start = Date.now();
  const wsUrl = `ws://localhost:${port}/ws`;
  const httpBase = `http://localhost:${port}`;
  const sheetD = `test_zdl_${Date.now()}`;
  const clientD = new TestClient('zdl_actor', sheetD, wsUrl);
  const details: string[] = [];

  try {
    await clientD.connect();

    // 1. Crash-Before-Ack
    const customOpId = `zdl_crash_op_${Date.now()}`;
    const expectedVal = 'CRITICAL_FINANCIAL_VALUE_9999';
    try {
      clientD.sendEdit('A1', { value: expectedVal }, { customOpId, simulateCrashBeforeAck: true });
    } catch {}

    await sleep(150);
    details.push('1. Simulated crash-before-ack: socket severed before server ACK');

    await clientD.connect();
    const retryAck = await clientD.sendEdit('A1', { value: expectedVal }, { customOpId });
    details.push(`2. Client resent with identical opId -> Server deduplicated (Status: ${retryAck.status}, Deduplicated: ${retryAck.deduplicated})`);

    // 2. Corrupt Snapshot Self-Healing
    const snapRes = await httpPost(`${httpBase}/api/zero-data-loss/snapshot/${sheetD}`, {});
    details.push(`3. Atomic shadow snapshot created with SHA-256: ${snapRes.result?.sha256Hash?.substring(0, 16)}...`);

    await clientD.sendEdit('A2', { value: 'POST_SNAPSHOT_WAL_VALUE' });

    const corruptRes = await httpPost(`${httpBase}/api/zero-data-loss/corrupt-snapshot/${sheetD}`, {});
    details.push(`4. Truncated snapshot by ${corruptRes.result?.truncatedBytes} bytes to simulate corrupt snapshot`);

    const healRes = await httpPost(`${httpBase}/api/zero-data-loss/self-heal/${sheetD}`, {});
    details.push(`5. Self-healing triggered: loaded backup + replayed WAL ops to Rev ${healRes.revision}`);

    const serverD = await httpGet(`${httpBase}/api/spreadsheets/${sheetD}/ranges?sheetName=Sheet1&startRow=0&endRow=5&startCol=0&endCol=5`);
    const healedA1 = serverD.cells?.['A1']?.value;
    const healedA2 = serverD.cells?.['A2']?.value;

    const isDeduplicated = retryAck.deduplicated === true || retryAck.status === 'ALREADY_COMMITTED';
    const passed = isDeduplicated && healedA1 === expectedVal && healedA2 === 'POST_SNAPSHOT_WAL_VALUE';
    clientD.disconnect();

    return {
      id: 'TEST_D',
      name: 'Zero Data Loss Proof (Crash-Before-Ack & Corrupt Snapshot Replay)',
      passed,
      durationMs: Date.now() - start,
      details,
      metrics: {
        crashBeforeAckDeduplicated: isDeduplicated,
        corruptSnapshotRestored: healedA1 === expectedVal && healedA2 === 'POST_SNAPSHOT_WAL_VALUE',
        restoredCellA1: healedA1,
        restoredCellA2: healedA2,
      },
    };
  } catch (err: any) {
    clientD.disconnect();
    return {
      id: 'TEST_D',
      name: 'Zero Data Loss Proof (Crash-Before-Ack & Corrupt Snapshot Replay)',
      passed: false,
      durationMs: Date.now() - start,
      details,
      metrics: {},
      error: err.message,
    };
  }
}

export async function runAllTests(port = 3000): Promise<TestResult[]> {
  const resA = await runTestA(port);
  const resB = await runTestB(port);
  const resC = await runTestC(port);
  const resD = await runTestD(port);
  return [resA, resB, resC, resD];
}
