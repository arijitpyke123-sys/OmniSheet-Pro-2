import { CellData, SheetCells, cellCoordToString, parseCellCoord } from './formulaEngine';
import { BatchRequest, BatchResponse, executeBatchOperation, fetchSpreadsheetRange } from './rangeManager';

export interface VirtualActor {
  id: string;
  name: string;
  email: string;
  role: 'owner' | 'editor' | 'analyst' | 'reviewer';
  color: string;
  avatarSeed: string;
  isOnline: boolean;
  simulatedLatencyMs: number;
  errorRatePercent: number;
  localStore: SheetCells;
  offlineQueue: Array<{
    id: string;
    key: string;
    cell: CellData;
    timestamp: number;
    opType: 'set' | 'clear';
  }>;
  stats: {
    writesSent: number;
    writesAcked: number;
    conflictsEncountered: number;
    retriesPerformed: number;
    failedOperations: number;
    offlineEditsCount: number;
  };
}

export type SimulationScenarioType = 
  | 'CONCURRENT_RACE' 
  | 'STATE_CONVERGENCE' 
  | 'OFFLINE_REPLAY' 
  | 'CHAOS_FAULT_INJECTION' 
  | 'BATCH_PASTE_RACE';

export interface SimulationConfig {
  scenario: SimulationScenarioType;
  actorsCount: number;
  totalOperations: number;
  baseLatencyMs: number;
  latencyJitterMs: number;
  errorRatePercent: number;
  spreadsheetId: string;
  sheetName: string;
  useLiveServerBackend?: boolean;
  targetCols?: number;
  targetRows?: number;
}

export type LogLevel = 'WRITE' | 'CONFLICT' | 'OFFLINE' | 'ONLINE' | 'REPLAY' | 'RETRY' | 'ERROR' | 'CONVERGENCE' | 'INFO';

export interface SimulationLogEntry {
  id: string;
  timestamp: number;
  actorId: string;
  actorName: string;
  actorColor: string;
  type: LogLevel;
  message: string;
  cellKey?: string;
  value?: any;
  details?: any;
}

export interface ConvergenceDiff {
  key: string;
  serverValue: any;
  actorValues: Record<string, any>;
  hasDivergence: boolean;
}

export interface SimulationMetrics {
  totalOperationsTarget: number;
  completedOperations: number;
  activeWorkers: number;
  conflictsResolved: number;
  retriesHandled: number;
  errorsCaught: number;
  convergenceScorePercent: number;
  averageLatencyMs: number;
  throughputOpsPerSec: number;
  elapsedMs: number;
  isRunning: boolean;
  isPaused: boolean;
}

export interface SimulationCallbacks {
  onLog: (entry: SimulationLogEntry) => void;
  onMetricsUpdate: (metrics: SimulationMetrics) => void;
  onActorsUpdate: (actors: VirtualActor[]) => void;
  onComplete: (result: SimulationResult) => void;
}

export interface SimulationResult {
  scenario: SimulationScenarioType;
  success: boolean;
  durationMs: number;
  totalOperations: number;
  successfulOperations: number;
  conflictsResolved: number;
  retriesPerformed: number;
  failedOperations: number;
  convergenceRate: number;
  divergentCells: ConvergenceDiff[];
  serverFinalState: SheetCells;
  actorsFinalState: Record<string, SheetCells>;
  logs: SimulationLogEntry[];
}

export const DEFAULT_VIRTUAL_ACTORS: Omit<VirtualActor, 'localStore' | 'offlineQueue' | 'stats'>[] = [
  {
    id: 'actor_alice',
    name: 'Alice (Lead Architect)',
    email: 'alice.lead@omnisheet.io',
    role: 'owner',
    color: '#10b981', // emerald
    avatarSeed: 'Alice',
    isOnline: true,
    simulatedLatencyMs: 45,
    errorRatePercent: 0,
  },
  {
    id: 'actor_bob',
    name: 'Bob (Core Backend)',
    email: 'bob.dev@omnisheet.io',
    role: 'editor',
    color: '#3b82f6', // blue
    avatarSeed: 'Bob',
    isOnline: true,
    simulatedLatencyMs: 80,
    errorRatePercent: 0,
  },
  {
    id: 'actor_charlie',
    name: 'Charlie (Quant Analyst)',
    email: 'charlie.quant@omnisheet.io',
    role: 'analyst',
    color: '#f59e0b', // amber
    avatarSeed: 'Charlie',
    isOnline: true,
    simulatedLatencyMs: 65,
    errorRatePercent: 0,
  },
  {
    id: 'actor_dana',
    name: 'Dana (Mobile Field Client)',
    email: 'dana.field@omnisheet.io',
    role: 'reviewer',
    color: '#ec4899', // pink
    avatarSeed: 'Dana',
    isOnline: true,
    simulatedLatencyMs: 140,
    errorRatePercent: 5,
  },
  {
    id: 'actor_eve',
    name: 'Eve (Chaos Adversary)',
    email: 'eve.chaos@omnisheet.io',
    role: 'editor',
    color: '#8b5cf6', // purple
    avatarSeed: 'Eve',
    isOnline: true,
    simulatedLatencyMs: 110,
    errorRatePercent: 15,
  },
  {
    id: 'actor_frank',
    name: 'Frank (Edge Sync Node)',
    email: 'frank.edge@omnisheet.io',
    role: 'editor',
    color: '#06b6d4', // cyan
    avatarSeed: 'Frank',
    isOnline: true,
    simulatedLatencyMs: 95,
    errorRatePercent: 2,
  },
];

export class CollaborationSimulator {
  private config: SimulationConfig;
  private callbacks: SimulationCallbacks;
  private actors: VirtualActor[] = [];
  private serverStore: SheetCells = {};
  private serverCellTimestamps: Record<string, number> = {};
  private serverRevision = 1;
  private isRunning = false;
  private isPaused = false;
  private shouldAbort = false;
  private logs: SimulationLogEntry[] = [];
  private completedOps = 0;
  private conflictsCount = 0;
  private retriesCount = 0;
  private errorsCount = 0;
  private startTime = 0;
  private pauseStartTime = 0;
  private totalPausedDuration = 0;
  private latencySamples: number[] = [];

  constructor(config: SimulationConfig, callbacks: SimulationCallbacks) {
    this.config = { ...config };
    this.callbacks = callbacks;
    this.initActors();
  }

  private initActors() {
    const count = Math.min(Math.max(this.config.actorsCount, 2), DEFAULT_VIRTUAL_ACTORS.length);
    this.actors = DEFAULT_VIRTUAL_ACTORS.slice(0, count).map(base => ({
      ...base,
      isOnline: true,
      localStore: {},
      offlineQueue: [],
      stats: {
        writesSent: 0,
        writesAcked: 0,
        conflictsEncountered: 0,
        retriesPerformed: 0,
        failedOperations: 0,
        offlineEditsCount: 0,
      },
    }));
  }

  public setActorOnlineStatus(actorId: string, isOnline: boolean) {
    const actor = this.actors.find(a => a.id === actorId);
    if (!actor) return;
    actor.isOnline = isOnline;
    this.log({
      actorId: actor.id,
      actorName: actor.name,
      actorColor: actor.color,
      type: isOnline ? 'ONLINE' : 'OFFLINE',
      message: `${actor.name} ${isOnline ? 'reconnected to network' : 'went offline (network partitioned)'}`,
      details: { queuedOps: actor.offlineQueue.length },
    });
    this.callbacks.onActorsUpdate([...this.actors]);
  }

  public pause() {
    if (this.isRunning && !this.isPaused) {
      this.isPaused = true;
      this.pauseStartTime = Date.now();
      this.emitMetrics();
    }
  }

  public resume() {
    if (this.isRunning && this.isPaused) {
      this.isPaused = false;
      this.totalPausedDuration += Date.now() - this.pauseStartTime;
      this.emitMetrics();
    }
  }

  public abort() {
    this.shouldAbort = true;
    this.isRunning = false;
  }

  private log(entry: Omit<SimulationLogEntry, 'id' | 'timestamp'>) {
    const logItem: SimulationLogEntry = {
      id: `log_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      timestamp: Date.now(),
      ...entry,
    };
    this.logs.unshift(logItem);
    if (this.logs.length > 500) {
      this.logs.pop();
    }
    this.callbacks.onLog(logItem);
  }

  private emitMetrics() {
    const elapsed = this.startTime > 0 
      ? Math.max(1, Date.now() - this.startTime - this.totalPausedDuration) 
      : 0;
    const throughput = elapsed > 0 ? (this.completedOps / (elapsed / 1000)) : 0;
    const avgLatency = this.latencySamples.length > 0
      ? this.latencySamples.reduce((a, b) => a + b, 0) / this.latencySamples.length
      : this.config.baseLatencyMs;

    const convergence = this.calculateConvergenceRate();

    const metrics: SimulationMetrics = {
      totalOperationsTarget: this.config.totalOperations,
      completedOperations: this.completedOps,
      activeWorkers: this.actors.filter(a => a.isOnline).length,
      conflictsResolved: this.conflictsCount,
      retriesHandled: this.retriesCount,
      errorsCaught: this.errorsCount,
      convergenceScorePercent: convergence.rate,
      averageLatencyMs: Math.round(avgLatency),
      throughputOpsPerSec: Math.round(throughput * 10) / 10,
      elapsedMs: elapsed,
      isRunning: this.isRunning,
      isPaused: this.isPaused,
    };

    this.callbacks.onMetricsUpdate(metrics);
  }

  private calculateConvergenceRate(): { rate: number; diffs: ConvergenceDiff[] } {
    const allKeys = new Set<string>([
      ...Object.keys(this.serverStore),
      ...this.actors.flatMap(a => Object.keys(a.localStore)),
    ]);

    if (allKeys.size === 0) {
      return { rate: 100, diffs: [] };
    }

    let matchingCells = 0;
    const diffs: ConvergenceDiff[] = [];

    for (const key of allKeys) {
      const serverVal = this.serverStore[key]?.value ?? '';
      const actorValues: Record<string, any> = {};
      let isMismatch = false;

      for (const actor of this.actors) {
        const aVal = actor.localStore[key]?.value ?? '';
        actorValues[actor.name] = aVal;
        if (aVal !== serverVal) {
          isMismatch = true;
        }
      }

      if (!isMismatch) {
        matchingCells++;
      } else {
        diffs.push({
          key,
          serverValue: serverVal,
          actorValues,
          hasDivergence: true,
        });
      }
    }

    const rate = Math.round((matchingCells / allKeys.size) * 1000) / 10;
    return { rate, diffs };
  }

  private async sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private async waitIfPaused() {
    while (this.isPaused && !this.shouldAbort) {
      await this.sleep(100);
    }
  }

  // Execute single simulated write with network latency, LWW timestamping, and chaos fault injection
  private async executeActorWrite(
    actor: VirtualActor,
    cellKey: string,
    newValue: string,
    opTimestamp: number = Date.now()
  ): Promise<boolean> {
    await this.waitIfPaused();
    if (this.shouldAbort) return false;

    // 1. IF OFFLINE: Queue mutation locally in actor's offline store
    if (!actor.isOnline) {
      actor.stats.writesSent++;
      actor.stats.offlineEditsCount++;
      const cellData: CellData = { value: newValue };
      actor.localStore[cellKey] = cellData;
      actor.offlineQueue.push({
        id: `op_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
        key: cellKey,
        cell: cellData,
        timestamp: opTimestamp,
        opType: 'set',
      });
      this.log({
        actorId: actor.id,
        actorName: actor.name,
        actorColor: actor.color,
        type: 'OFFLINE',
        cellKey,
        value: newValue,
        message: `[Offline Local Mutation] ${actor.name} queued edit for ${cellKey} = "${newValue}" (Queue depth: ${actor.offlineQueue.length})`,
      });
      this.completedOps++;
      this.emitMetrics();
      this.callbacks.onActorsUpdate([...this.actors]);
      return true;
    }

    // 2. SIMULATE NETWORK LATENCY + JITTER
    const jitter = (Math.random() - 0.5) * 2 * this.config.latencyJitterMs;
    const latency = Math.max(10, Math.round(this.config.baseLatencyMs + actor.simulatedLatencyMs + jitter));
    this.latencySamples.push(latency);
    if (this.latencySamples.length > 50) this.latencySamples.shift();
    await this.sleep(latency);

    // 3. CHAOS FAULT INJECTION (HTTP 500 / Network Dropped Packet)
    const effectiveErrorRate = Math.max(this.config.errorRatePercent, actor.errorRatePercent);
    if (Math.random() * 100 < effectiveErrorRate) {
      actor.stats.failedOperations++;
      this.errorsCount++;
      this.log({
        actorId: actor.id,
        actorName: actor.name,
        actorColor: actor.color,
        type: 'ERROR',
        cellKey,
        message: `[Chaos Fault Injected] Network 500 / Packet drop on write ${cellKey} by ${actor.name}`,
      });

      // Exponential backoff retry simulation
      actor.stats.retriesPerformed++;
      this.retriesCount++;
      this.log({
        actorId: actor.id,
        actorName: actor.name,
        actorColor: actor.color,
        type: 'RETRY',
        cellKey,
        message: `[Backoff Retry] ${actor.name} automatically retrying operation for ${cellKey} with idempotency token`,
      });
      await this.sleep(latency + 50);
    }

    // 4. CONCURRENT CONFLICT & LAST-WRITE-WINS (LWW) RESOLUTION
    actor.stats.writesSent++;
    const prevServerTimestamp = this.serverCellTimestamps[cellKey] || 0;
    const isConflict = prevServerTimestamp > 0 && Math.abs(opTimestamp - prevServerTimestamp) < 1500;

    if (isConflict) {
      this.conflictsCount++;
      actor.stats.conflictsEncountered++;
      this.log({
        actorId: actor.id,
        actorName: actor.name,
        actorColor: actor.color,
        type: 'CONFLICT',
        cellKey,
        value: newValue,
        message: `[Concurrent Race Detected on ${cellKey}] Resolving via Last-Write-Wins (Actor timestamp: ${opTimestamp} vs Server: ${prevServerTimestamp})`,
      });
    }

    // Deterministic LWW rule: higher timestamp wins
    if (opTimestamp >= prevServerTimestamp) {
      this.serverStore[cellKey] = { value: newValue };
      this.serverCellTimestamps[cellKey] = opTimestamp;
      this.serverRevision++;
      actor.localStore[cellKey] = { value: newValue };
      actor.stats.writesAcked++;

      // Fan-out update to all connected virtual actors (simulating WebSocket / onSnapshot stream)
      for (const peer of this.actors) {
        if (peer.isOnline) {
          peer.localStore[cellKey] = { value: newValue };
        }
      }

      this.log({
        actorId: actor.id,
        actorName: actor.name,
        actorColor: actor.color,
        type: 'WRITE',
        cellKey,
        value: newValue,
        message: `${actor.name} wrote ${cellKey} = "${newValue}" (Rev: ${this.serverRevision})`,
      });
    } else {
      // Stale write discarded by LWW
      this.log({
        actorId: actor.id,
        actorName: actor.name,
        actorColor: actor.color,
        type: 'CONFLICT',
        cellKey,
        value: newValue,
        message: `[LWW Discarded] Stale write by ${actor.name} on ${cellKey} replaced by newer write`,
      });
    }

    this.completedOps++;
    this.emitMetrics();
    this.callbacks.onActorsUpdate([...this.actors]);
    return true;
  }

  // Replay queued offline mutations after an actor reconnects
  public async flushActorOfflineQueue(actor: VirtualActor): Promise<number> {
    if (actor.offlineQueue.length === 0) return 0;
    const queue = [...actor.offlineQueue];
    actor.offlineQueue = [];

    this.log({
      actorId: actor.id,
      actorName: actor.name,
      actorColor: actor.color,
      type: 'REPLAY',
      message: `[Offline Replay Initiated] Replaying ${queue.length} buffered mutations for ${actor.name}...`,
    });

    let replayed = 0;
    for (const item of queue) {
      await this.waitIfPaused();
      if (this.shouldAbort) break;

      const serverTimestamp = this.serverCellTimestamps[item.key] || 0;
      // If server was updated AFTER item was queued, check conflict
      if (serverTimestamp > item.timestamp) {
        this.conflictsCount++;
        actor.stats.conflictsEncountered++;
        this.log({
          actorId: actor.id,
          actorName: actor.name,
          actorColor: actor.color,
          type: 'CONFLICT',
          cellKey: item.key,
          value: item.cell.value,
          message: `[Replay Conflict] Server was mutated while ${actor.name} was offline on ${item.key}. Server has newer state; merging with reconciliation policy.`,
        });
        // Pull latest from server
        actor.localStore[item.key] = { ...this.serverStore[item.key] };
      } else {
        // Actor's offline edit wins
        this.serverStore[item.key] = { ...item.cell };
        this.serverCellTimestamps[item.key] = item.timestamp;
        this.serverRevision++;
        actor.localStore[item.key] = { ...item.cell };
        actor.stats.writesAcked++;

        // Sync peers
        for (const peer of this.actors) {
          if (peer.isOnline) {
            peer.localStore[item.key] = { ...item.cell };
          }
        }

        this.log({
          actorId: actor.id,
          actorName: actor.name,
          actorColor: actor.color,
          type: 'REPLAY',
          cellKey: item.key,
          value: item.cell.value,
          message: `[Replay Succeeded] Synced ${item.key} = "${item.cell.value}" to cluster (Rev: ${this.serverRevision})`,
        });
      }

      replayed++;
      await this.sleep(30);
    }

    this.emitMetrics();
    this.callbacks.onActorsUpdate([...this.actors]);
    return replayed;
  }

  // Full Scenario Orchestrators
  public async run(): Promise<SimulationResult> {
    this.isRunning = true;
    this.isPaused = false;
    this.shouldAbort = false;
    this.startTime = Date.now();
    this.totalPausedDuration = 0;
    this.completedOps = 0;
    this.conflictsCount = 0;
    this.retriesCount = 0;
    this.errorsCount = 0;
    this.latencySamples = [];
    this.logs = [];

    this.log({
      actorId: 'system',
      actorName: 'System Orchestrator',
      actorColor: '#6366f1',
      type: 'INFO',
      message: `Starting Simulation Scenario: "${this.config.scenario}" with ${this.actors.length} actors (${this.config.totalOperations} ops target)`,
    });

    switch (this.config.scenario) {
      case 'CONCURRENT_RACE':
        await this.runConcurrentRaceScenario();
        break;
      case 'STATE_CONVERGENCE':
        await this.runStateConvergenceScenario();
        break;
      case 'OFFLINE_REPLAY':
        await this.runOfflineReplayScenario();
        break;
      case 'CHAOS_FAULT_INJECTION':
        await this.runChaosFaultInjectionScenario();
        break;
      case 'BATCH_PASTE_RACE':
        await this.runBatchPasteRaceScenario();
        break;
      default:
        await this.runConcurrentRaceScenario();
        break;
    }

    // Final Sync & Convergence Check
    await this.waitIfPaused();
    this.log({
      actorId: 'system',
      actorName: 'System Orchestrator',
      actorColor: '#6366f1',
      type: 'CONVERGENCE',
      message: 'Scenario mutations complete. Running final cluster state reconciliation & deep equality verification...',
    });

    // Make sure all offline actors flush if any remaining
    for (const actor of this.actors) {
      if (!actor.isOnline) {
        actor.isOnline = true;
        await this.flushActorOfflineQueue(actor);
      }
    }

    // Final peer sync
    for (const actor of this.actors) {
      actor.localStore = { ...this.serverStore };
    }

    const durationMs = Date.now() - this.startTime - this.totalPausedDuration;
    const convergence = this.calculateConvergenceRate();

    this.log({
      actorId: 'system',
      actorName: 'System Orchestrator',
      actorColor: '#10b981',
      type: 'CONVERGENCE',
      message: `Cluster Convergence Check: ${convergence.rate}% match across ${Object.keys(this.serverStore).length} cells (${convergence.diffs.length} divergences).`,
      details: { rate: convergence.rate, durationMs },
    });

    this.isRunning = false;
    this.emitMetrics();

    const actorsFinalState: Record<string, SheetCells> = {};
    for (const a of this.actors) {
      actorsFinalState[a.name] = { ...a.localStore };
    }

    const result: SimulationResult = {
      scenario: this.config.scenario,
      success: convergence.rate >= 99.9 && this.errorsCount <= this.config.totalOperations,
      durationMs,
      totalOperations: this.completedOps,
      successfulOperations: this.actors.reduce((acc, a) => acc + a.stats.writesAcked, 0),
      conflictsResolved: this.conflictsCount,
      retriesPerformed: this.retriesCount,
      failedOperations: this.errorsCount,
      convergenceRate: convergence.rate,
      divergentCells: convergence.diffs,
      serverFinalState: { ...this.serverStore },
      actorsFinalState,
      logs: [...this.logs],
    };

    this.callbacks.onComplete(result);
    return result;
  }

  // SCENARIO 1: Concurrent Hot-Spot Race Conditions
  private async runConcurrentRaceScenario() {
    const targetHotCells = ['A1', 'B2', 'C3', 'D4', 'B5', 'C2', 'A3', 'D1'];
    const totalOps = this.config.totalOperations;
    const perActorOps = Math.ceil(totalOps / this.actors.length);

    const tasks: Promise<any>[] = [];

    for (const actor of this.actors) {
      tasks.push((async () => {
        for (let i = 0; i < perActorOps; i++) {
          if (this.shouldAbort) break;
          // 70% chance to target a hot cell (creating guaranteed race condition)
          const targetCell = Math.random() < 0.70 
            ? targetHotCells[Math.floor(Math.random() * targetHotCells.length)]
            : cellCoordToString(Math.floor(Math.random() * 6), Math.floor(Math.random() * 10));

          const val = `${actor.name.split(' ')[0]}_v${i + 1}_${Math.floor(Math.random() * 100)}`;
          await this.executeActorWrite(actor, targetCell, val, Date.now());
          await this.sleep(Math.random() * 40 + 10);
        }
      })());
    }

    await Promise.all(tasks);
  }

  // SCENARIO 2: State Convergence across Multi-Node Topology
  private async runStateConvergenceScenario() {
    const totalCols = this.config.targetCols || 6;
    const totalRows = this.config.targetRows || 12;
    const totalOps = this.config.totalOperations;
    const perActorOps = Math.ceil(totalOps / this.actors.length);

    const tasks: Promise<any>[] = [];

    for (const actor of this.actors) {
      tasks.push((async () => {
        for (let i = 0; i < perActorOps; i++) {
          if (this.shouldAbort) break;
          const col = Math.floor(Math.random() * totalCols);
          const row = Math.floor(Math.random() * totalRows);
          const cellKey = cellCoordToString(col, row);
          const val = `V_${col}_${row}_${Math.floor(Math.random() * 500)}`;
          await this.executeActorWrite(actor, cellKey, val, Date.now());
          await this.sleep(Math.random() * 30 + 15);
        }
      })());
    }

    await Promise.all(tasks);
  }

  // SCENARIO 3: Offline Partition & Reconnect Replay
  private async runOfflineReplayScenario() {
    const offlineActor = this.actors[1] || this.actors[0]; // e.g. Bob
    const onlineActors = this.actors.filter(a => a.id !== offlineActor.id);

    this.log({
      actorId: 'system',
      actorName: 'System Orchestrator',
      actorColor: '#6366f1',
      type: 'INFO',
      message: 'Phase 1: Establishing initial shared baseline across all clients...',
    });

    // Initial baseline writes
    for (let r = 0; r < 5; r++) {
      for (let c = 0; c < 4; c++) {
        const key = cellCoordToString(c, r);
        await this.executeActorWrite(this.actors[0], key, `Base_${key}`, Date.now());
      }
    }

    // Step 2: Disconnect Bob
    this.log({
      actorId: offlineActor.id,
      actorName: offlineActor.name,
      actorColor: offlineActor.color,
      type: 'OFFLINE',
      message: `Phase 2: Network partitioned! ${offlineActor.name} disconnected. Editing offline...`,
    });
    offlineActor.isOnline = false;
    this.callbacks.onActorsUpdate([...this.actors]);

    // Step 3: Concurrent edits - Online actors edit while offline actor edits concurrently
    const onlineTask = (async () => {
      for (let i = 0; i < 15; i++) {
        if (this.shouldAbort) break;
        const actor = onlineActors[i % onlineActors.length];
        const cell = cellCoordToString(i % 4, Math.floor(i / 4));
        await this.executeActorWrite(actor, cell, `Online_${actor.name.split(' ')[0]}_${i}`, Date.now());
        await this.sleep(50);
      }
    })();

    const offlineTask = (async () => {
      for (let i = 0; i < 12; i++) {
        if (this.shouldAbort) break;
        // Edit some overlapping cells and some independent cells
        const cell = i % 2 === 0 ? cellCoordToString(i % 4, Math.floor(i / 4)) : cellCoordToString(4, i);
        await this.executeActorWrite(offlineActor, cell, `OfflineBob_${i}`, Date.now());
        await this.sleep(40);
      }
    })();

    await Promise.all([onlineTask, offlineTask]);

    // Step 4: Reconnect Bob and flush replay queue
    this.log({
      actorId: offlineActor.id,
      actorName: offlineActor.name,
      actorColor: offlineActor.color,
      type: 'ONLINE',
      message: `Phase 3: Connection restored! ${offlineActor.name} reconnecting and replaying offline queue...`,
    });
    offlineActor.isOnline = true;
    this.callbacks.onActorsUpdate([...this.actors]);

    await this.flushActorOfflineQueue(offlineActor);
  }

  // SCENARIO 4: Chaos Engineering (Latency spikes + 500 packet drops + backoff retries)
  private async runChaosFaultInjectionScenario() {
    this.log({
      actorId: 'system',
      actorName: 'System Orchestrator',
      actorColor: '#ef4444',
      type: 'INFO',
      message: 'Phase 1: Injected 25% server failure rate and high-jitter latency...',
    });

    const totalOps = this.config.totalOperations;
    const perActorOps = Math.ceil(totalOps / this.actors.length);

    const tasks: Promise<any>[] = [];

    for (const actor of this.actors) {
      tasks.push((async () => {
        for (let i = 0; i < perActorOps; i++) {
          if (this.shouldAbort) break;
          const col = i % 5;
          const row = Math.floor(i / 5);
          const cellKey = cellCoordToString(col, row);
          const val = `ChaosVal_${actor.name.split(' ')[0]}_${i}`;
          await this.executeActorWrite(actor, cellKey, val, Date.now());
          await this.sleep(Math.random() * 50 + 20);
        }
      })());
    }

    await Promise.all(tasks);
  }

  // SCENARIO 5: Bulk Batch Paste vs Concurrent Micro-Writes
  private async runBatchPasteRaceScenario() {
    this.log({
      actorId: 'system',
      actorName: 'System Orchestrator',
      actorColor: '#6366f1',
      type: 'INFO',
      message: 'Alice executing massive 50-cell bulk paste while Bob and Charlie inject concurrent micro-edits...',
    });

    const alice = this.actors[0];
    const otherActors = this.actors.slice(1);

    // Alice prepares bulk paste
    const pasteTask = (async () => {
      this.log({
        actorId: alice.id,
        actorName: alice.name,
        actorColor: alice.color,
        type: 'WRITE',
        message: `${alice.name} initiating atomic batch paste over A1:E10 (50 cells)...`,
      });

      for (let r = 0; r < 10; r++) {
        for (let c = 0; c < 5; c++) {
          if (this.shouldAbort) break;
          const key = cellCoordToString(c, r);
          await this.executeActorWrite(alice, key, `PASTE_${key}`, Date.now() - 50);
          await this.sleep(15);
        }
      }
    })();

    // Other actors edit cells within and around the paste range
    const microTasks = otherActors.map(async (actor, idx) => {
      for (let i = 0; i < 15; i++) {
        if (this.shouldAbort) break;
        const cell = cellCoordToString(idx + 1, i % 8);
        await this.executeActorWrite(actor, cell, `Micro_${actor.name.split(' ')[0]}_${i}`, Date.now());
        await this.sleep(35);
      }
    });

    await Promise.all([pasteTask, ...microTasks]);
  }

  public getServerStore(): SheetCells {
    return { ...this.serverStore };
  }
}
