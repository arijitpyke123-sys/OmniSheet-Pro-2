import { CellData, SheetCells, cellCoordToString, parseCellCoord } from './formulaEngine';

export interface CellRange {
  startRow: number; // 0-based, inclusive
  endRow: number;   // 0-based, inclusive
  startCol: number; // 0-based, inclusive
  endCol: number;   // 0-based, inclusive
}

export type ViewportRange = CellRange;

export interface RangeResponse {
  spreadsheetId: string;
  sheetName: string;
  range: CellRange;
  cells: SheetCells;
  totalRows: number;
  totalCols: number;
  revision: number;
  timestamp: string;
}

export interface BatchOperation {
  type: 'set_cells' | 'clear_range' | 'fill_range' | 'format_range' | 'paste_cells';
  cells?: Array<{ key: string; cell: CellData }>;
  range?: { start: string; end: string };
  format?: Partial<CellData>;
  fillValue?: string;
  isFormula?: boolean;
  targetTopLeft?: string;
  matrix?: string[][];
}

export interface BatchRequest {
  spreadsheetId: string;
  sheetName: string;
  operations: BatchOperation[];
  idempotencyKey?: string;
}

export interface BatchResponse {
  success: boolean;
  affectedCellsCount: number;
  newRevision: number;
  updatedCells: SheetCells;
  clearedCellKeys?: string[];
  error?: string;
}

// Client-Side Range Cache with Chunking (e.g. 100 rows x 25 columns per chunk)
export const CHUNK_ROWS = 100;
export const CHUNK_COLS = 26;

export class SpreadsheetRangeCache {
  private cache = new Map<string, { cells: SheetCells; revision: number; fetchedAt: number }>();
  private inFlightRequests = new Map<string, AbortController>();
  private documentRevision = 0;

  private getChunkKey(sheetName: string, chunkRow: number, chunkCol: number): string {
    return `${sheetName}:${chunkRow}:${chunkCol}`;
  }

  public getDocumentRevision(): number {
    return this.documentRevision;
  }

  public setDocumentRevision(rev: number) {
    this.documentRevision = rev;
  }

  public getCachedCellsForRange(
    sheetName: string,
    startRow: number,
    endRow: number,
    startCol: number,
    endCol: number
  ): { cells: SheetCells; missingChunks: Array<{ chunkRow: number; chunkCol: number }> } {
    const result: SheetCells = {};
    const missingChunks: Array<{ chunkRow: number; chunkCol: number }> = [];

    const minChunkRow = Math.floor(startRow / CHUNK_ROWS);
    const maxChunkRow = Math.floor(endRow / CHUNK_ROWS);
    const minChunkCol = Math.floor(startCol / CHUNK_COLS);
    const maxChunkCol = Math.floor(endCol / CHUNK_COLS);

    for (let cr = minChunkRow; cr <= maxChunkRow; cr++) {
      for (let cc = minChunkCol; cc <= maxChunkCol; cc++) {
        const key = this.getChunkKey(sheetName, cr, cc);
        const cached = this.cache.get(key);
        if (cached) {
          Object.assign(result, cached.cells);
        } else {
          missingChunks.push({ chunkRow: cr, chunkCol: cc });
        }
      }
    }

    return { cells: result, missingChunks };
  }

  public storeChunk(sheetName: string, chunkRow: number, chunkCol: number, cells: SheetCells, revision: number) {
    const key = this.getChunkKey(sheetName, chunkRow, chunkCol);
    this.cache.set(key, {
      cells,
      revision,
      fetchedAt: Date.now(),
    });
    if (revision > this.documentRevision) {
      this.documentRevision = revision;
    }
  }

  public setInFlight(key: string, controller: AbortController) {
    this.inFlightRequests.set(key, controller);
  }

  public cancelInFlight(key: string) {
    const ctrl = this.inFlightRequests.get(key);
    if (ctrl) {
      ctrl.abort();
      this.inFlightRequests.delete(key);
    }
  }

  public clearInFlight() {
    for (const ctrl of this.inFlightRequests.values()) {
      ctrl.abort();
    }
    this.inFlightRequests.clear();
  }

  public invalidate(sheetName?: string) {
    if (!sheetName) {
      this.cache.clear();
    } else {
      for (const key of this.cache.keys()) {
        if (key.startsWith(`${sheetName}:`)) {
          this.cache.delete(key);
        }
      }
    }
  }

  public updateLocalEdits(sheetName: string, updatedCells: SheetCells, clearedKeys: string[] = []) {
    for (const [key, cell] of Object.entries(updatedCells)) {
      const coord = parseCellCoord(key);
      if (!coord) continue;
      const cr = Math.floor(coord.row / CHUNK_ROWS);
      const cc = Math.floor(coord.col / CHUNK_COLS);
      const chunkKey = this.getChunkKey(sheetName, cr, cc);
      const existing = this.cache.get(chunkKey);
      if (existing) {
        existing.cells[key] = cell;
      }
    }

    for (const key of clearedKeys) {
      const coord = parseCellCoord(key);
      if (!coord) continue;
      const cr = Math.floor(coord.row / CHUNK_ROWS);
      const cc = Math.floor(coord.col / CHUNK_COLS);
      const chunkKey = this.getChunkKey(sheetName, cr, cc);
      const existing = this.cache.get(chunkKey);
      if (existing) {
        delete existing.cells[key];
      }
    }
  }
}

// Global Singleton Client Cache
export const globalRangeCache = new SpreadsheetRangeCache();

// API Helper: Fetch Rectangular Range
export async function fetchSpreadsheetRange(
  spreadsheetId: string,
  sheetName: string,
  range: CellRange,
  signal?: AbortSignal
): Promise<RangeResponse> {
  const query = new URLSearchParams({
    sheetName,
    startRow: String(range.startRow),
    endRow: String(range.endRow),
    startCol: String(range.startCol),
    endCol: String(range.endCol),
  });

  const res = await fetch(`/api/spreadsheets/${encodeURIComponent(spreadsheetId)}/ranges?${query.toString()}`, {
    method: 'GET',
    headers: { 'Accept': 'application/json' },
    signal,
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Failed to fetch range: ${res.status} ${errorText}`);
  }

  return res.json();
}

// API Helper: Execute Batch Operation
export async function executeBatchOperation(
  batchReq: BatchRequest
): Promise<BatchResponse> {
  const res = await fetch(`/api/spreadsheets/${encodeURIComponent(batchReq.spreadsheetId)}/batch`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: JSON.stringify({
      sheetName: batchReq.sheetName,
      operations: batchReq.operations,
      idempotencyKey: batchReq.idempotencyKey || `batch_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    }),
  });

  if (!res.ok) {
    const errData = await res.json().catch(() => ({ error: 'Batch request failed' }));
    throw new Error(errData.error || `HTTP ${res.status}`);
  }

  return res.json();
}
