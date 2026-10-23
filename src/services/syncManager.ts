/**
 * OmniSheet Pro - Real-Time Synchronization & Offline Replay Manager
 *
 * Coordinates between:
 * 1. Browser-side IndexedDB queue (`indexedDBQueue`)
 * 2. Real-Time WebSockets (`/ws`)
 * 3. Fallback HTTP Batch API (`/api/spreadsheets/:id/batch`)
 * 4. Authoritative Conflict Reconciliation (LWW by timestamp)
 */

import { CellData, SheetCells } from '../utils/formulaEngine';
import { indexedDBQueue, OfflineEditOp, ConflictRecord } from './indexedDBQueue';
import { executeBatchOperation } from '../utils/rangeManager';

export interface SyncStatus {
  isOnline: boolean;
  wsConnected: boolean;
  isReplaying: boolean;
  pendingCount: number;
  lastSyncedAt: string | null;
  lastConflict: ConflictRecord | null;
}

export type SyncStatusListener = (status: SyncStatus) => void;
export type RemoteMutationListener = (
  sheetName: string,
  cellKey: string,
  cellValue: CellData,
  revision: number,
  senderId?: string
) => void;

class SyncManager {
  private ws: WebSocket | null = null;
  private spreadsheetId: string | null = null;
  private userId: string = 'guest';
  private authToken: string | null = null;
  private currentRevision = 1;

  private isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;
  private wsConnected = false;
  private isReplaying = false;
  private pendingCount = 0;
  private lastSyncedAt: string | null = null;
  private lastConflict: ConflictRecord | null = null;

  private reconnectTimer: any = null;
  private heartbeatTimer: any = null;
  private reconnectAttempts = 0;

  private statusListeners: Set<SyncStatusListener> = new Set();
  private remoteMutationListeners: Set<RemoteMutationListener> = new Set();

  constructor() {
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => this.handleNetworkChange(true));
      window.addEventListener('offline', () => this.handleNetworkChange(false));

      // Subscribe to IndexedDB changes to keep pending count synced
      indexedDBQueue.subscribe((count, sheetId) => {
        if (!sheetId || sheetId === this.spreadsheetId) {
          this.pendingCount = count;
          this.emitStatus();
        }
      });
    }
  }

  public subscribeStatus(listener: SyncStatusListener): () => void {
    this.statusListeners.add(listener);
    listener(this.getStatus());
    return () => this.statusListeners.delete(listener);
  }

  public subscribeRemoteMutations(listener: RemoteMutationListener): () => void {
    this.remoteMutationListeners.add(listener);
    return () => this.remoteMutationListeners.delete(listener);
  }

  public getStatus(): SyncStatus {
    return {
      isOnline: this.isOnline,
      wsConnected: this.wsConnected,
      isReplaying: this.isReplaying,
      pendingCount: this.pendingCount,
      lastSyncedAt: this.lastSyncedAt,
      lastConflict: this.lastConflict,
    };
  }

  private emitStatus() {
    const status = this.getStatus();
    for (const l of this.statusListeners) {
      try {
        l(status);
      } catch (err) {
        console.warn('[SyncManager] Status listener error:', err);
      }
    }
  }

  public setContext(spreadsheetId: string, userId: string, authToken?: string, baseRevision = 1) {
    const changed = this.spreadsheetId !== spreadsheetId;
    this.spreadsheetId = spreadsheetId;
    this.userId = userId || 'guest';
    this.authToken = authToken || null;
    this.currentRevision = baseRevision;

    if (changed) {
      this.reconnectAttempts = 0;
      this.connectWebSocket();
      this.refreshPendingCount();
    }
  }

  public updateRevision(revision: number) {
    if (revision > this.currentRevision) {
      this.currentRevision = revision;
    }
  }

  public async refreshPendingCount() {
    if (!this.spreadsheetId) return;
    this.pendingCount = await indexedDBQueue.getPendingCount(this.spreadsheetId);
    this.emitStatus();
  }

  private handleNetworkChange(online: boolean) {
    this.isOnline = online;
    this.emitStatus();

    if (online) {
      this.reconnectAttempts = 0;
      this.connectWebSocket();
      this.replayPendingQueue();
    } else {
      this.cleanupWebSocket();
    }
  }

  /**
   * Connects to WebSocket server at /ws
   */
  public connectWebSocket() {
    if (!this.isOnline || typeof window === 'undefined' || !this.spreadsheetId) return;
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    this.cleanupWebSocket();

    try {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/ws`;

      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        this.wsConnected = true;
        this.reconnectAttempts = 0;
        this.emitStatus();

        // 1. Send AUTH if token is available
        const tokenToSend = this.authToken || `test_token_${this.userId}`;
        this.ws?.send(JSON.stringify({ type: 'AUTH', token: tokenToSend }));

        // 2. Start heartbeat
        this.startHeartbeat();
      };

      this.ws.onmessage = async (event) => {
        try {
          const msg = JSON.parse(event.data);
          await this.handleServerMessage(msg);
        } catch (e) {
          console.warn('[SyncManager] Failed to parse server message:', e);
        }
      };

      this.ws.onclose = () => {
        this.wsConnected = false;
        this.emitStatus();
        this.stopHeartbeat();
        this.scheduleReconnect();
      };

      this.ws.onerror = () => {
        this.wsConnected = false;
        this.emitStatus();
      };
    } catch (err) {
      console.warn('[SyncManager] WebSocket connection error:', err);
      this.scheduleReconnect();
    }
  }

  private startHeartbeat() {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: 'PING' }));
      }
    }, 25000);
  }

  private stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private scheduleReconnect() {
    if (!this.isOnline || this.reconnectTimer) return;
    const delay = Math.min(1000 * Math.pow(1.5, this.reconnectAttempts), 15000);
    this.reconnectAttempts++;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connectWebSocket();
    }, delay);
  }

  private cleanupWebSocket() {
    this.stopHeartbeat();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      try {
        this.ws.close();
      } catch {}
      this.ws = null;
    }
    this.wsConnected = false;
  }

  /**
   * Server Message Dispatcher
   */
  private async handleServerMessage(msg: any) {
    switch (msg.type) {
      case 'AUTHD': {
        // Authenticated! Now join spreadsheet room
        if (this.spreadsheetId && this.ws?.readyState === WebSocket.OPEN) {
          this.ws.send(JSON.stringify({
            type: 'JOIN',
            spreadsheetId: this.spreadsheetId,
            clientId: this.userId,
            lastRevision: this.currentRevision,
          }));
        }
        break;
      }

      case 'JOINED': {
        if (msg.revision > this.currentRevision) {
          this.currentRevision = msg.revision;
        }

        // Replay any pending unconfirmed edits stored in IndexedDB!
        this.replayPendingQueue();
        break;
      }

      case 'ACK': {
        // 4. Removes an edit ONLY after its commit is confirmed by the server
        if (msg.opId) {
          await indexedDBQueue.removeConfirmedEdit(msg.opId, this.spreadsheetId || undefined);
          if (msg.revision && msg.revision > this.currentRevision) {
            this.currentRevision = msg.revision;
          }
          this.lastSyncedAt = new Date().toLocaleTimeString();
          this.refreshPendingCount();
        }
        break;
      }

      case 'OP_BROADCAST': {
        // Remote collaborator edit received from server
        if (msg.revision && msg.revision > this.currentRevision) {
          this.currentRevision = msg.revision;
        }

        // Notify app to reconcile remote mutation
        for (const listener of this.remoteMutationListeners) {
          listener(msg.sheetName, msg.cellKey, msg.cellValue, msg.revision, msg.senderId);
        }
        break;
      }

      case 'SYNC_RESPONSE': {
        // Server returned status of pending operations
        if (Array.isArray(msg.committedAcks)) {
          for (const ack of msg.committedAcks) {
            if (ack.opId) {
              await indexedDBQueue.removeConfirmedEdit(ack.opId, this.spreadsheetId || undefined);
            }
          }
        }
        if (msg.currentRevision && msg.currentRevision > this.currentRevision) {
          this.currentRevision = msg.currentRevision;
        }
        this.lastSyncedAt = new Date().toLocaleTimeString();
        this.refreshPendingCount();
        break;
      }

      case 'ERROR': {
        console.warn('[SyncManager] Server error message:', msg.code, msg.message);
        break;
      }
    }
  }

  /**
   * 1. Saves each edit locally with a unique opId into IndexedDB
   * and attempts immediate transmission if connected.
   */
  public async enqueueEdit(
    sheetName: string,
    cellKey: string,
    cellValue: CellData
  ): Promise<OfflineEditOp> {
    if (!this.spreadsheetId) {
      throw new Error('Cannot enqueue edit: active spreadsheetId not set');
    }

    const opId = `op_${this.userId}_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const clientTimestamp = Date.now();

    const op: OfflineEditOp = {
      opId,
      spreadsheetId: this.spreadsheetId,
      sheetName,
      cellKey,
      cellValue,
      clientTimestamp,
      baseRevision: this.currentRevision,
      status: 'pending',
      retryCount: 0,
    };

    // 1. Durably save into IndexedDB FIRST
    await indexedDBQueue.savePendingEdit(op);
    this.refreshPendingCount();

    // 2. If online and WebSocket connected, immediately send to server
    if (this.isOnline && this.wsConnected && this.ws?.readyState === WebSocket.OPEN) {
      await indexedDBQueue.markEditInFlight(op.opId);
      this.ws.send(JSON.stringify({
        type: 'EDIT',
        opId: op.opId,
        spreadsheetId: this.spreadsheetId,
        sheetName,
        cellKey,
        cellValue,
        clientTimestamp,
      }));
    } else if (this.isOnline && !this.wsConnected) {
      // WebSocket temporarily unavailable; attempt HTTP fallback
      this.replayViaHttp([op]);
    }

    return op;
  }

  /**
   * 3. Replays unconfirmed edits after reconnection
   */
  public async replayPendingQueue(): Promise<void> {
    if (!this.spreadsheetId || this.isReplaying) return;

    const pending = await indexedDBQueue.getPendingEdits(this.spreadsheetId);
    if (pending.length === 0) return;

    this.isReplaying = true;
    this.emitStatus();

    try {
      if (this.wsConnected && this.ws?.readyState === WebSocket.OPEN) {
        // Replay over WebSocket
        for (const op of pending) {
          await indexedDBQueue.markEditInFlight(op.opId);
          this.ws.send(JSON.stringify({
            type: 'EDIT',
            opId: op.opId,
            spreadsheetId: op.spreadsheetId,
            sheetName: op.sheetName,
            cellKey: op.cellKey,
            cellValue: op.cellValue,
            clientTimestamp: op.clientTimestamp,
          }));
          // Small pacing to avoid frame starvation
          await new Promise((r) => setTimeout(r, 10));
        }
      } else if (this.isOnline) {
        // Fallback: Replay via HTTP Batch API
        await this.replayViaHttp(pending);
      }
    } catch (err) {
      console.warn('[SyncManager] Error replaying pending queue:', err);
    } finally {
      this.isReplaying = false;
      await this.refreshPendingCount();
    }
  }

  /**
   * HTTP Batch fallback replay
   */
  private async replayViaHttp(ops: OfflineEditOp[]) {
    if (!this.spreadsheetId || ops.length === 0) return;

    try {
      // Group by sheetName
      const opsBySheet = new Map<string, OfflineEditOp[]>();
      for (const op of ops) {
        const list = opsBySheet.get(op.sheetName) || [];
        list.push(op);
        opsBySheet.set(op.sheetName, list);
      }

      for (const [sheetName, sheetOps] of opsBySheet.entries()) {
        const batchOperations = sheetOps.map((o) => ({
          type: 'set_cells' as const,
          cells: [{ key: o.cellKey, cell: o.cellValue }],
        }));

        const res = await executeBatchOperation({
          spreadsheetId: this.spreadsheetId,
          sheetName,
          operations: batchOperations,
          idempotencyKey: `replay_${sheetOps[0].opId}_${sheetOps.length}`,
        });

        if (res && res.success) {
          // 4. Removes an edit ONLY after commit is confirmed
          for (const op of sheetOps) {
            await indexedDBQueue.removeConfirmedEdit(op.opId, this.spreadsheetId);
          }
          if (res.newRevision && res.newRevision > this.currentRevision) {
            this.currentRevision = res.newRevision;
          }
          this.lastSyncedAt = new Date().toLocaleTimeString();
        }
      }
    } catch (err) {
      console.warn('[SyncManager] HTTP replay failed:', err);
    }
  }

  /**
   * Trigger manual sync replay
   */
  public async forceSync(): Promise<void> {
    if (!this.isOnline) {
      this.handleNetworkChange(true);
    } else if (!this.wsConnected) {
      this.connectWebSocket();
    }
    await this.replayPendingQueue();
  }
}

export const syncManager = new SyncManager();
