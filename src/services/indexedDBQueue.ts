/**
 * OmniSheet Pro - Browser-side IndexedDB Durable Offline Queue
 *
 * Implements:
 * 1. Saves each edit locally with a unique opId.
 * 2. Preserves pending edits when the browser closes or refreshes.
 * 3. Replays unconfirmed edits after reconnection.
 * 4. Removes an edit only after its commit is confirmed.
 * 5. Reconciles pending edits with server revisions and conflicting changes (LWW by timestamp).
 */

import { CellData, SheetCells } from '../utils/formulaEngine';

export interface OfflineEditOp {
  opId: string;
  spreadsheetId: string;
  sheetName: string;
  cellKey: string;
  cellValue: CellData;
  clientTimestamp: number;
  baseRevision: number;
  status: 'pending' | 'in_flight' | 'confirmed';
  retryCount?: number;
  lastAttemptAt?: number;
  error?: string;
}

export interface LocalSheetSnapshot {
  spreadsheetId: string;
  title: string;
  sheetNames: string[];
  sheets: Record<string, SheetCells>;
  revision: number;
  updatedAt: string;
}

export interface ConflictRecord {
  id?: number;
  opId: string;
  spreadsheetId: string;
  sheetName: string;
  cellKey: string;
  clientTimestamp: number;
  serverTimestamp: number;
  serverRevision: number;
  localValue: any;
  serverValue: any;
  resolvedValue: any;
  winner: 'local' | 'server';
  timestamp: string;
}

const DB_NAME = 'OmniSheet_Offline_DB';
const DB_VERSION = 1;
const STORE_EDITS = 'pending_edits';
const STORE_SNAPSHOTS = 'sheet_snapshots';
const STORE_CONFLICTS = 'conflict_logs';

type QueueListener = (pendingCount: number, spreadsheetId?: string) => void;

class IndexedDBQueueService {
  private dbPromise: Promise<IDBDatabase | null> | null = null;
  private memoryEdits = new Map<string, OfflineEditOp>();
  private memorySnapshots = new Map<string, LocalSheetSnapshot>();
  private memoryConflicts: ConflictRecord[] = [];
  private listeners: Set<QueueListener> = new Set();

  constructor() {
    if (typeof window !== 'undefined' && 'indexedDB' in window) {
      this.initDB();
    }
  }

  public subscribe(listener: QueueListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notifyListeners(spreadsheetId?: string) {
    this.getPendingCount(spreadsheetId).then((count) => {
      for (const listener of this.listeners) {
        try {
          listener(count, spreadsheetId);
        } catch (e) {
          console.warn('[IndexedDBQueue] Listener error:', e);
        }
      }
    });
  }

  /**
   * Initializes or upgrades IndexedDB database
   */
  private async initDB(): Promise<IDBDatabase | null> {
    if (typeof window === 'undefined' || !('indexedDB' in window)) {
      return null;
    }

    if (!this.dbPromise) {
      this.dbPromise = new Promise((resolve) => {
        try {
          const req = indexedDB.open(DB_NAME, DB_VERSION);

          req.onupgradeneeded = (event: IDBVersionChangeEvent) => {
            const db = (event.target as IDBOpenDBRequest).result;

            // 1. Pending edits store
            if (!db.objectStoreNames.contains(STORE_EDITS)) {
              const editStore = db.createObjectStore(STORE_EDITS, { keyPath: 'opId' });
              editStore.createIndex('spreadsheetId', 'spreadsheetId', { unique: false });
              editStore.createIndex('clientTimestamp', 'clientTimestamp', { unique: false });
              editStore.createIndex('status', 'status', { unique: false });
              editStore.createIndex('cellLookup', ['spreadsheetId', 'sheetName', 'cellKey'], { unique: false });
            }

            // 2. Local sheet snapshot store
            if (!db.objectStoreNames.contains(STORE_SNAPSHOTS)) {
              db.createObjectStore(STORE_SNAPSHOTS, { keyPath: 'spreadsheetId' });
            }

            // 3. Conflict logs store
            if (!db.objectStoreNames.contains(STORE_CONFLICTS)) {
              const conflictStore = db.createObjectStore(STORE_CONFLICTS, { keyPath: 'id', autoIncrement: true });
              conflictStore.createIndex('spreadsheetId', 'spreadsheetId', { unique: false });
            }
          };

          req.onsuccess = () => {
            resolve(req.result);
          };

          req.onerror = () => {
            console.warn('[IndexedDBQueue] Could not open IndexedDB, falling back to in-memory store:', req.error);
            resolve(null);
          };
        } catch (err) {
          console.warn('[IndexedDBQueue] IndexedDB initialization error:', err);
          resolve(null);
        }
      });
    }

    return this.dbPromise;
  }

  /**
   * 1. Saves each edit locally with a unique opId.
   */
  public async savePendingEdit(op: OfflineEditOp): Promise<void> {
    const db = await this.initDB();
    if (!db) {
      this.memoryEdits.set(op.opId, op);
      this.notifyListeners(op.spreadsheetId);
      return;
    }

    return new Promise((resolve, reject) => {
      try {
        const tx = db.transaction(STORE_EDITS, 'readwrite');
        const store = tx.objectStore(STORE_EDITS);
        const req = store.put(op);
        req.onsuccess = () => {
          this.notifyListeners(op.spreadsheetId);
          resolve();
        };
        req.onerror = () => reject(req.error);
      } catch (err) {
        this.memoryEdits.set(op.opId, op);
        this.notifyListeners(op.spreadsheetId);
        resolve();
      }
    });
  }

  /**
   * 2. Preserves pending edits when the browser closes or refreshes.
   * Retrieves all unconfirmed edits for a given spreadsheet in clientTimestamp order.
   */
  public async getPendingEdits(spreadsheetId?: string): Promise<OfflineEditOp[]> {
    const db = await this.initDB();
    if (!db) {
      let ops = Array.from(this.memoryEdits.values());
      if (spreadsheetId) {
        ops = ops.filter((o) => o.spreadsheetId === spreadsheetId);
      }
      return ops
        .filter((o) => o.status !== 'confirmed')
        .sort((a, b) => a.clientTimestamp - b.clientTimestamp);
    }

    return new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE_EDITS, 'readonly');
        const store = tx.objectStore(STORE_EDITS);
        const req = store.getAll();

        req.onsuccess = () => {
          let list: OfflineEditOp[] = req.result || [];
          if (spreadsheetId) {
            list = list.filter((item) => item.spreadsheetId === spreadsheetId);
          }
          list = list
            .filter((item) => item.status !== 'confirmed')
            .sort((a, b) => a.clientTimestamp - b.clientTimestamp);
          resolve(list);
        };

        req.onerror = () => {
          resolve([]);
        };
      } catch {
        resolve([]);
      }
    });
  }

  /**
   * Counts unconfirmed pending edits waiting in IndexedDB
   */
  public async getPendingCount(spreadsheetId?: string): Promise<number> {
    const edits = await this.getPendingEdits(spreadsheetId);
    return edits.length;
  }

  /**
   * Marks an edit in-flight during network transmission
   */
  public async markEditInFlight(opId: string): Promise<void> {
    const db = await this.initDB();
    if (!db) {
      const op = this.memoryEdits.get(opId);
      if (op) {
        op.status = 'in_flight';
        op.lastAttemptAt = Date.now();
        op.retryCount = (op.retryCount || 0) + 1;
      }
      return;
    }

    return new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE_EDITS, 'readwrite');
        const store = tx.objectStore(STORE_EDITS);
        const getReq = store.get(opId);
        getReq.onsuccess = () => {
          const op: OfflineEditOp | undefined = getReq.result;
          if (op) {
            op.status = 'in_flight';
            op.lastAttemptAt = Date.now();
            op.retryCount = (op.retryCount || 0) + 1;
            store.put(op);
          }
          resolve();
        };
        getReq.onerror = () => resolve();
      } catch {
        resolve();
      }
    });
  }

  /**
   * Reset in-flight edit back to pending (e.g. if network severed mid-flight)
   */
  public async resetInFlightEdits(spreadsheetId?: string): Promise<void> {
    const pending = await this.getPendingEdits(spreadsheetId);
    const inFlight = pending.filter((p) => p.status === 'in_flight');
    for (const op of inFlight) {
      op.status = 'pending';
      await this.savePendingEdit(op);
    }
  }

  /**
   * 4. Removes an edit ONLY after its commit is confirmed by the server (ACK or sync response).
   */
  public async removeConfirmedEdit(opId: string, spreadsheetId?: string): Promise<void> {
    const db = await this.initDB();
    if (!db) {
      this.memoryEdits.delete(opId);
      this.notifyListeners(spreadsheetId);
      return;
    }

    return new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE_EDITS, 'readwrite');
        const store = tx.objectStore(STORE_EDITS);
        const req = store.delete(opId);
        req.onsuccess = () => {
          this.notifyListeners(spreadsheetId);
          resolve();
        };
        req.onerror = () => resolve();
      } catch {
        this.memoryEdits.delete(opId);
        this.notifyListeners(spreadsheetId);
        resolve();
      }
    });
  }

  /**
   * Removes a batch of confirmed edits
   */
  public async removeConfirmedEdits(opIds: string[], spreadsheetId?: string): Promise<void> {
    for (const id of opIds) {
      await this.removeConfirmedEdit(id, spreadsheetId);
    }
    this.notifyListeners(spreadsheetId);
  }

  /**
   * Saves a full local snapshot of the spreadsheet into IndexedDB
   * so that refreshing or opening the app offline immediately renders local data.
   */
  public async saveSheetSnapshot(snapshot: LocalSheetSnapshot): Promise<void> {
    const db = await this.initDB();
    if (!db) {
      this.memorySnapshots.set(snapshot.spreadsheetId, snapshot);
      return;
    }

    return new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE_SNAPSHOTS, 'readwrite');
        const store = tx.objectStore(STORE_SNAPSHOTS);
        const req = store.put(snapshot);
        req.onsuccess = () => resolve();
        req.onerror = () => resolve();
      } catch {
        this.memorySnapshots.set(snapshot.spreadsheetId, snapshot);
        resolve();
      }
    });
  }

  /**
   * Loads full local snapshot of the spreadsheet from IndexedDB.
   */
  public async loadSheetSnapshot(spreadsheetId: string): Promise<LocalSheetSnapshot | null> {
    const db = await this.initDB();
    if (!db) {
      return this.memorySnapshots.get(spreadsheetId) || null;
    }

    return new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE_SNAPSHOTS, 'readonly');
        const store = tx.objectStore(STORE_SNAPSHOTS);
        const req = store.get(spreadsheetId);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  }

  /**
   * Record a conflict resolution event for auditing & visibility
   */
  public async recordConflict(conflict: ConflictRecord): Promise<void> {
    const db = await this.initDB();
    if (!db) {
      this.memoryConflicts.push(conflict);
      return;
    }

    try {
      const tx = db.transaction(STORE_CONFLICTS, 'readwrite');
      const store = tx.objectStore(STORE_CONFLICTS);
      store.add(conflict);
    } catch {
      this.memoryConflicts.push(conflict);
    }
  }

  public async getConflictLogs(spreadsheetId?: string): Promise<ConflictRecord[]> {
    const db = await this.initDB();
    if (!db) {
      return spreadsheetId
        ? this.memoryConflicts.filter((c) => c.spreadsheetId === spreadsheetId)
        : [...this.memoryConflicts];
    }

    return new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE_CONFLICTS, 'readonly');
        const store = tx.objectStore(STORE_CONFLICTS);
        const req = store.getAll();
        req.onsuccess = () => {
          let list: ConflictRecord[] = req.result || [];
          if (spreadsheetId) {
            list = list.filter((c) => c.spreadsheetId === spreadsheetId);
          }
          resolve(list);
        };
        req.onerror = () => resolve([]);
      } catch {
        resolve([]);
      }
    });
  }

  /**
   * 5. Reconciles pending edits with server revisions and conflicting changes.
   *
   * Strategy:
   * - Last-Write-Wins (LWW) by timestamp.
   * - If a remote change arrives for a cell that has a pending offline edit:
   *   a) If local pending edit has clientTimestamp > serverTimestamp:
   *      Local edit is newer! Keep local pending edit in queue and retain local value.
   *      When the queue replays, it will authoritatively commit to the server.
   *   b) If remote change has serverTimestamp >= clientTimestamp:
   *      Remote change is newer! Adopt server value into local cells and discard
   *      the superseded local pending edit.
   * - For cells with NO pending edits, immediately apply the server change.
   *
   * Returns:
   * - reconciledCells: The authoritative merged state
   * - droppedOpIds: Local ops superseded by newer server edits
   * - activePendingOps: Local ops that still need to be replayed
   */
  public reconcilePendingEditsWithServer(
    currentLocalCells: Record<string, SheetCells>,
    serverSheets: Record<string, SheetCells>,
    pendingOps: OfflineEditOp[],
    serverTimestamp = Date.now(),
    serverRevision = 1
  ): {
    reconciledSheets: Record<string, SheetCells>;
    droppedOpIds: string[];
    activePendingOps: OfflineEditOp[];
    conflicts: ConflictRecord[];
  } {
    const mergedSheets: Record<string, SheetCells> = JSON.parse(JSON.stringify(serverSheets || {}));
    const droppedOpIds: string[] = [];
    const activePendingOps: OfflineEditOp[] = [];
    const conflicts: ConflictRecord[] = [];

    // Group pending ops by sheet and cell
    const opsByCell = new Map<string, OfflineEditOp>();
    for (const op of pendingOps) {
      const key = `${op.sheetName}:${op.cellKey}`;
      // If multiple pending ops for same cell, latest local edit wins
      const existing = opsByCell.get(key);
      if (!existing || op.clientTimestamp > existing.clientTimestamp) {
        opsByCell.set(key, op);
      }
    }

    // Process each pending op against server state
    for (const [key, op] of opsByCell.entries()) {
      const [sheetName, cellKey] = key.split(':');
      if (!mergedSheets[sheetName]) {
        mergedSheets[sheetName] = {};
      }

      const serverCell = mergedSheets[sheetName][cellKey];
      const localCell = op.cellValue;

      // Check if server cell has conflicting data modified during offline period
      const serverVal = serverCell?.value ?? '';
      const localVal = localCell?.value ?? '';

      if (serverCell && serverVal !== localVal) {
        // Conflict detected! Reconcile using LWW by timestamp
        if (op.clientTimestamp >= serverTimestamp) {
          // Local edit was made after server change -> Local edit wins
          mergedSheets[sheetName][cellKey] = { ...serverCell, ...localCell };
          activePendingOps.push(op);

          const conflict: ConflictRecord = {
            opId: op.opId,
            spreadsheetId: op.spreadsheetId,
            sheetName,
            cellKey,
            clientTimestamp: op.clientTimestamp,
            serverTimestamp,
            serverRevision,
            localValue: localVal,
            serverValue: serverVal,
            resolvedValue: localVal,
            winner: 'local',
            timestamp: new Date().toISOString(),
          };
          conflicts.push(conflict);
          this.recordConflict(conflict);
        } else {
          // Server change was newer than local offline edit -> Server wins
          // Drop the superseded pending edit
          droppedOpIds.push(op.opId);

          const conflict: ConflictRecord = {
            opId: op.opId,
            spreadsheetId: op.spreadsheetId,
            sheetName,
            cellKey,
            clientTimestamp: op.clientTimestamp,
            serverTimestamp,
            serverRevision,
            localValue: localVal,
            serverValue: serverVal,
            resolvedValue: serverVal,
            winner: 'server',
            timestamp: new Date().toISOString(),
          };
          conflicts.push(conflict);
          this.recordConflict(conflict);
        }
      } else {
        // No conflict, or cell was only modified locally -> Apply local edit
        mergedSheets[sheetName][cellKey] = {
          ...(mergedSheets[sheetName][cellKey] || {}),
          ...localCell,
        };
        activePendingOps.push(op);
      }
    }

    // Clean up dropped ops from IndexedDB
    if (droppedOpIds.length > 0) {
      for (const id of droppedOpIds) {
        this.removeConfirmedEdit(id);
      }
    }

    return {
      reconciledSheets: mergedSheets,
      droppedOpIds,
      activePendingOps,
      conflicts,
    };
  }
}

export const indexedDBQueue = new IndexedDBQueueService();
