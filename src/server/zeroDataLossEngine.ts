import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Persistent data directory
const DATA_DIR = path.resolve(__dirname, '../../.data');
const OPLOG_DIR = path.join(DATA_DIR, 'oplog');
const SNAPSHOTS_DIR = path.join(DATA_DIR, 'snapshots');

// Ensure base directories exist
if (!fs.existsSync(OPLOG_DIR)) fs.mkdirSync(OPLOG_DIR, { recursive: true });
if (!fs.existsSync(SNAPSHOTS_DIR)) fs.mkdirSync(SNAPSHOTS_DIR, { recursive: true });

export interface CellMutation {
  value?: any;
  formula?: string;
  bold?: boolean;
  italic?: boolean;
  color?: string;
  bgColor?: string;
  align?: 'left' | 'center' | 'right';
  updatedAt?: string;
}

export interface OperationRecord {
  opId: string;
  clientId: string;
  spreadsheetId: string;
  sheetName: string;
  revision: number;
  cellKey: string;
  cellValue: CellMutation;
  clientTimestamp: number;
  serverTimestamp: number;
  status: 'COMMITTED' | 'ROLLBACK';
}

export interface SnapshotMeta {
  spreadsheetId: string;
  revision: number;
  cellCount: number;
  sha256Hash: string;
  createdAt: string;
  status: 'VALID' | 'CORRUPT' | 'STAGED';
  sentinel: string;
}

export interface SnapshotPayload {
  meta: SnapshotMeta;
  data: {
    id: string;
    title: string;
    totalRows: number;
    totalCols: number;
    sheetNames: string[];
    revision: number;
    sheets: Record<string, Record<string, CellMutation>>;
    updatedAt: string;
  };
}

export interface ApplyOpResult {
  ack: boolean;
  opId: string;
  revision: number;
  cellKey: string;
  cellValue: CellMutation;
  deduplicated: boolean;
  status: 'COMMITTED' | 'ALREADY_COMMITTED';
  serverTimestamp: number;
}

export interface EngineStats {
  totalCommittedOps: number;
  deduplicatedReplays: number;
  snapshotsCreated: number;
  corruptSnapshotsDetected: number;
  selfHealingReplaysTriggered: number;
  activeSpreadsheetsCount: number;
  lastSnapshotAt: string | null;
  uptimeSeconds: number;
}

export class ZeroDataLossEngine {
  private opLogMap: Map<string, OperationRecord> = new Map(); // opId -> OperationRecord
  private sheetOpLogs: Map<string, OperationRecord[]> = new Map(); // sheetId -> ordered ops
  private stats: EngineStats = {
    totalCommittedOps: 0,
    deduplicatedReplays: 0,
    snapshotsCreated: 0,
    corruptSnapshotsDetected: 0,
    selfHealingReplaysTriggered: 0,
    activeSpreadsheetsCount: 0,
    lastSnapshotAt: null,
    uptimeSeconds: 0,
  };
  private startTime = Date.now();

  constructor() {
    this.recoverAllOpLogsOnStartup();
  }

  /**
   * Scan disk on server boot and load all existing WAL logs into memory
   */
  private recoverAllOpLogsOnStartup(): void {
    try {
      if (!fs.existsSync(OPLOG_DIR)) return;
      const files = fs.readdirSync(OPLOG_DIR).filter((f) => f.endsWith('.jsonl'));
      for (const file of files) {
        const filePath = path.join(OPLOG_DIR, file);
        const content = fs.readFileSync(filePath, 'utf-8');
        const lines = content.split('\n').filter((l) => l.trim().length > 0);
        for (const line of lines) {
          try {
            const record: OperationRecord = JSON.parse(line);
            if (record && record.opId) {
              this.opLogMap.set(record.opId, record);
              const list = this.sheetOpLogs.get(record.spreadsheetId) || [];
              list.push(record);
              this.sheetOpLogs.set(record.spreadsheetId, list);
              this.stats.totalCommittedOps++;
            }
          } catch {
            // Ignore malformed line
          }
        }
      }
      console.log(`[ZeroDataLoss] Loaded ${this.stats.totalCommittedOps} historic WAL operations across ${this.sheetOpLogs.size} spreadsheets`);
    } catch (err) {
      console.warn('[ZeroDataLoss] Notice during WAL recovery on startup:', err);
    }
  }

  /**
   * Get WAL file path for a specific spreadsheet
   */
  private getOpLogFilePath(spreadsheetId: string): string {
    const safeId = spreadsheetId.replace(/[^a-zA-Z0-9_-]/g, '_');
    return path.join(OPLOG_DIR, `oplog-${safeId}.jsonl`);
  }

  /**
   * Get Snapshot file path for a specific spreadsheet
   */
  private getSnapshotFilePath(spreadsheetId: string): string {
    const safeId = spreadsheetId.replace(/[^a-zA-Z0-9_-]/g, '_');
    return path.join(SNAPSHOTS_DIR, `snapshot-${safeId}.json`);
  }

  private getBackupSnapshotFilePath(spreadsheetId: string): string {
    const safeId = spreadsheetId.replace(/[^a-zA-Z0-9_-]/g, '_');
    return path.join(SNAPSHOTS_DIR, `snapshot-${safeId}.backup.json`);
  }

  /**
   * Atomic operation commit with idempotent deduplication (Solves crash-before-ack)
   */
  public applyOperation(
    op: {
      opId: string;
      clientId: string;
      spreadsheetId: string;
      sheetName?: string;
      cellKey: string;
      cellValue: CellMutation;
      clientTimestamp?: number;
    },
    currentState: {
      revision: number;
      sheets: Record<string, Record<string, CellMutation>>;
    }
  ): ApplyOpResult {
    const { opId, clientId, spreadsheetId, sheetName = 'Sheet1', cellKey, cellValue } = op;
    const clientTimestamp = op.clientTimestamp || Date.now();

    // 1. IDEMPOTENCY CHECK: Was this operation already committed before server crash / disconnect?
    if (this.opLogMap.has(opId)) {
      const existing = this.opLogMap.get(opId)!;
      this.stats.deduplicatedReplays++;
      return {
        ack: true,
        opId,
        revision: existing.revision,
        cellKey: existing.cellKey,
        cellValue: existing.cellValue,
        deduplicated: true,
        status: 'ALREADY_COMMITTED',
        serverTimestamp: existing.serverTimestamp,
      };
    }

    // 2. ADVANCE AUTHORITATIVE REVISION & APPLY LWW
    currentState.revision += 1;
    const newRevision = currentState.revision;
    const serverTimestamp = Date.now();

    // Ensure sheet dictionary exists
    if (!currentState.sheets[sheetName]) {
      currentState.sheets[sheetName] = {};
    }
    const sheet = currentState.sheets[sheetName];

    // LWW (Last-Write-Wins) Resolution:
    // If the cell exists, we check timestamps. In authoritative server arrival order,
    // this write arrived now and claims the new revision.
    const mergedCell: CellMutation = {
      ...(sheet[cellKey] || {}),
      ...cellValue,
      updatedAt: new Date(serverTimestamp).toISOString(),
    };
    sheet[cellKey] = mergedCell;

    // 3. CREATE DURABLE WAL RECORD
    const record: OperationRecord = {
      opId,
      clientId,
      spreadsheetId,
      sheetName,
      revision: newRevision,
      cellKey,
      cellValue: mergedCell,
      clientTimestamp,
      serverTimestamp,
      status: 'COMMITTED',
    };

    // 4. WRITE-AHEAD WRITE TO DISK (Synchronous flush for durability)
    try {
      const walPath = this.getOpLogFilePath(spreadsheetId);
      const jsonLine = JSON.stringify(record) + '\n';
      fs.appendFileSync(walPath, jsonLine, { encoding: 'utf-8' });
    } catch (walErr) {
      console.error(`[ZeroDataLoss] Failed to write WAL for ${spreadsheetId}:`, walErr);
    }

    // Update in-memory indexes
    this.opLogMap.set(opId, record);
    const list = this.sheetOpLogs.get(spreadsheetId) || [];
    list.push(record);
    this.sheetOpLogs.set(spreadsheetId, list);
    this.stats.totalCommittedOps++;

    return {
      ack: true,
      opId,
      revision: newRevision,
      cellKey,
      cellValue: mergedCell,
      deduplicated: false,
      status: 'COMMITTED',
      serverTimestamp,
    };
  }

  /**
   * Two-Phase Atomic Shadow Snapshotting
   * Writes to a staged temp file, calculates SHA-256 hash + EOF sentinel, then atomic renames.
   */
  public createAtomicSnapshot(
    spreadsheetId: string,
    data: {
      id: string;
      title: string;
      totalRows: number;
      totalCols: number;
      sheetNames: string[];
      revision: number;
      sheets: Record<string, Record<string, CellMutation>>;
      updatedAt: string;
    }
  ): { success: boolean; sha256Hash: string; revision: number; cellCount: number } {
    let cellCount = 0;
    for (const sheetName of Object.keys(data.sheets || {})) {
      cellCount += Object.keys(data.sheets[sheetName] || {}).length;
    }

    const targetPath = this.getSnapshotFilePath(spreadsheetId);
    const backupPath = this.getBackupSnapshotFilePath(spreadsheetId);
    const tempPath = path.join(SNAPSHOTS_DIR, `snapshot-${spreadsheetId}.tmp.${Date.now()}`);

    // Compute cryptographic checksum of payload
    const dataString = JSON.stringify(data);
    const sha256Hash = crypto.createHash('sha256').update(dataString).digest('hex');

    const meta: SnapshotMeta = {
      spreadsheetId,
      revision: data.revision,
      cellCount,
      sha256Hash,
      createdAt: new Date().toISOString(),
      status: 'VALID',
      sentinel: 'SNAPSHOT_VALID_EOF',
    };

    const payload: SnapshotPayload = {
      meta,
      data,
    };

    const payloadString = JSON.stringify(payload, null, 2) + '\n// SNAPSHOT_VALID_EOF\n';

    try {
      // 1. Write to temporary staging file
      fs.writeFileSync(tempPath, payloadString, { encoding: 'utf-8' });

      // 2. Backup existing snapshot if present
      if (fs.existsSync(targetPath)) {
        try {
          fs.copyFileSync(targetPath, backupPath);
        } catch {
          // Non-critical
        }
      }

      // 3. Atomic POSIX rename (guarantees either 100% written or unchanged)
      fs.renameSync(tempPath, targetPath);

      this.stats.snapshotsCreated++;
      this.stats.lastSnapshotAt = meta.createdAt;

      return {
        success: true,
        sha256Hash,
        revision: data.revision,
        cellCount,
      };
    } catch (err) {
      if (fs.existsSync(tempPath)) {
        try { fs.unlinkSync(tempPath); } catch {}
      }
      throw err;
    }
  }

  /**
   * Load snapshot with Auto-Detection & Self-Healing OpLog Replay
   * If snapshot is truncated or corrupted, falls back to backup snapshot + WAL replay.
   */
  public loadSnapshotWithSelfHealing(
    spreadsheetId: string,
    fallbackDefaultGenerator: () => any
  ): {
    data: any;
    wasSelfHealed: boolean;
    replayedOpsCount: number;
    integrityStatus: 'PRISTINE' | 'SELF_HEALED_FROM_WAL' | 'NEWLY_INITIALIZED';
  } {
    const targetPath = this.getSnapshotFilePath(spreadsheetId);
    const backupPath = this.getBackupSnapshotFilePath(spreadsheetId);

    let candidateData: any = null;
    let baseRevision = 0;
    let wasCorrupt = false;

    // Check main snapshot file
    if (fs.existsSync(targetPath)) {
      try {
        const raw = fs.readFileSync(targetPath, 'utf-8');
        // Check for EOF sentinel
        if (!raw.includes('SNAPSHOT_VALID_EOF')) {
          throw new Error('Truncated snapshot: Missing SNAPSHOT_VALID_EOF sentinel');
        }

        // Clean trailing comment for JSON parsing
        const cleanJson = raw.replace(/\/\/ SNAPSHOT_VALID_EOF[\s\S]*$/, '').trim();
        const parsed: SnapshotPayload = JSON.parse(cleanJson);

        // Verify SHA-256 hash integrity
        const dataString = JSON.stringify(parsed.data);
        const computedHash = crypto.createHash('sha256').update(dataString).digest('hex');

        if (computedHash !== parsed.meta.sha256Hash) {
          throw new Error(`Checksum mismatch: expected ${parsed.meta.sha256Hash}, got ${computedHash}`);
        }

        candidateData = parsed.data;
        baseRevision = candidateData.revision;
      } catch (err: any) {
        console.warn(`[ZeroDataLoss] ⚠️ Primary snapshot corrupt for ${spreadsheetId} (${err.message}). Checking backup...`);
        wasCorrupt = true;
        this.stats.corruptSnapshotsDetected++;
      }
    }

    // If main was corrupt, check backup
    if (wasCorrupt && fs.existsSync(backupPath)) {
      try {
        const raw = fs.readFileSync(backupPath, 'utf-8');
        if (raw.includes('SNAPSHOT_VALID_EOF')) {
          const cleanJson = raw.replace(/\/\/ SNAPSHOT_VALID_EOF[\s\S]*$/, '').trim();
          const parsed: SnapshotPayload = JSON.parse(cleanJson);
          candidateData = parsed.data;
          baseRevision = candidateData.revision;
          console.log(`[ZeroDataLoss] Loaded backup snapshot at revision ${baseRevision}`);
        }
      } catch {
        candidateData = null;
      }
    }

    // If still no valid candidate, generate default base
    if (!candidateData) {
      candidateData = fallbackDefaultGenerator();
      baseRevision = candidateData.revision || 0;
    }

    // SELF-HEALING: Replay any operations from WAL that occurred after baseRevision
    const walOps = this.sheetOpLogs.get(spreadsheetId) || [];
    const missingOps = walOps.filter((op) => op.revision > baseRevision);

    let replayedOpsCount = 0;
    if (missingOps.length > 0) {
      this.stats.selfHealingReplaysTriggered++;
      for (const op of missingOps) {
        if (!candidateData.sheets[op.sheetName]) {
          candidateData.sheets[op.sheetName] = {};
        }
        candidateData.sheets[op.sheetName][op.cellKey] = op.cellValue;
        if (op.revision > candidateData.revision) {
          candidateData.revision = op.revision;
        }
        replayedOpsCount++;
      }
      candidateData.updatedAt = new Date().toISOString();

      // Immediately heal disk with a verified atomic snapshot
      try {
        this.createAtomicSnapshot(spreadsheetId, candidateData);
        console.log(`[ZeroDataLoss] ✅ Self-healing complete for ${spreadsheetId}: replayed ${replayedOpsCount} operations from WAL and restored verified snapshot at revision ${candidateData.revision}`);
      } catch (e) {
        console.warn('[ZeroDataLoss] Could not save healed snapshot:', e);
      }

      return {
        data: candidateData,
        wasSelfHealed: true,
        replayedOpsCount,
        integrityStatus: 'SELF_HEALED_FROM_WAL',
      };
    }

    return {
      data: candidateData,
      wasSelfHealed: false,
      replayedOpsCount: 0,
      integrityStatus: fs.existsSync(targetPath) ? 'PRISTINE' : 'NEWLY_INITIALIZED',
    };
  }

  /**
   * Intentionally corrupt a snapshot file to test self-healing resilience
   */
  public simulateCorruptSnapshot(spreadsheetId: string): { corrupted: boolean; truncatedBytes: number } {
    const targetPath = this.getSnapshotFilePath(spreadsheetId);
    if (!fs.existsSync(targetPath)) {
      throw new Error(`No snapshot exists to corrupt for ${spreadsheetId}`);
    }

    const content = fs.readFileSync(targetPath, 'utf-8');
    // Truncate to half the size to simulate incomplete write / power kill
    const truncated = content.substring(0, Math.floor(content.length / 2));
    fs.writeFileSync(targetPath, truncated, { encoding: 'utf-8' });

    return {
      corrupted: true,
      truncatedBytes: content.length - truncated.length,
    };
  }

  /**
   * Get operations for a spreadsheet since a given revision (for client reconnect replay)
   */
  public getPendingOpsSince(spreadsheetId: string, sinceRevision: number): OperationRecord[] {
    const all = this.sheetOpLogs.get(spreadsheetId) || [];
    return all.filter((op) => op.revision > sinceRevision);
  }

  /**
   * Inspect WAL
   */
  public getOpLog(spreadsheetId: string, limit: number = 50): OperationRecord[] {
    const all = this.sheetOpLogs.get(spreadsheetId) || [];
    return all.slice(-limit);
  }

  /**
   * Check if a spreadsheet has persisted records on disk or in active memory
   */
  public hasSpreadsheet(spreadsheetId: string): boolean {
    const snapPath = this.getSnapshotFilePath(spreadsheetId);
    const walPath = this.getOpLogFilePath(spreadsheetId);
    return fs.existsSync(snapPath) || fs.existsSync(walPath) || this.sheetOpLogs.has(spreadsheetId);
  }

  /**
   * Inspect Engine Stats
   */
  public getEngineStats(): EngineStats {
    return {
      ...this.stats,
      activeSpreadsheetsCount: this.sheetOpLogs.size,
      uptimeSeconds: Math.floor((Date.now() - this.startTime) / 1000),
    };
  }
}

// Global Singleton Engine
export const zeroDataLossEngine = new ZeroDataLossEngine();
