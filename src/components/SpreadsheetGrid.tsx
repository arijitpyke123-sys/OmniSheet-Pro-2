import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { 
  SheetCells, 
  colIndexToLetter, 
  colLetterToIndex,
  evaluateFormula, 
  isCoordInRange,
  getCellsInRange,
  computeRangeStats,
  parseCellCoord,
  cellCoordToString,
  extractRangeToMatrix
} from '../utils/formulaEngine';
import { 
  Plus, 
  Calculator, 
  Image as ImageIcon, 
  X, 
  Download, 
  Navigation,
  ArrowRight,
  Layers,
  Sparkles,
  Copy,
  Clipboard,
  Trash2,
  ArrowUp,
  ArrowDown,
  ArrowLeft,
  Check,
  Rows,
  Columns
} from 'lucide-react';

export interface ViewportRange {
  startRow: number; // 0-based, inclusive
  endRow: number;   // 0-based, inclusive
  startCol: number; // 0-based, inclusive
  endCol: number;   // 0-based, inclusive
}

interface SpreadsheetGridProps {
  cells: SheetCells;
  onCellChange: (cellKey: string, value: string, formula?: string) => void;
  onBatchPaste?: (targetTopLeft: string, matrix: string[][]) => void;
  selectedCell: string;
  setSelectedCell: (cell: string) => void;
  selectionRange: { start: string; end: string } | null;
  setSelectionRange: (range: { start: string; end: string } | null) => void;
  formulaValue: string;
  setFormulaValue: (val: string) => void;
  rowCount: number;
  colCount: number;
  sheets: string[];
  activeSheet: string;
  setActiveSheet: (sheet: string) => void;
  onAddSheet: () => void;
  collaboratorCursors?: Array<{ userId: string; name: string; cell: string; color: string }>;
  theme?: 'dark' | 'light';
  onOpenImageModal?: (cellKey: string) => void;
  onViewportChange?: (viewport: ViewportRange) => void;
  isRangeLoading?: boolean;
  onInsertRowAbove?: (rowIndex: number) => void;
  onInsertRowBelow?: (rowIndex: number) => void;
  onInsertColLeft?: (colIndex: number) => void;
  onInsertColRight?: (colIndex: number) => void;
  onDeleteRow?: (rowIndex: number) => void;
  onDeleteCol?: (colIndex: number) => void;
  onClearSelected?: () => void;
  copiedRange?: { start: string; end: string } | null;
  setCopiedRange?: (range: { start: string; end: string } | null) => void;
}

const DEFAULT_ROW_HEIGHT = 28;
const DEFAULT_COL_WIDTH = 105;
const ROW_HEADER_WIDTH = 56;
const COL_HEADER_HEIGHT = 28;
const OVERSCAN_ROWS = 8;
const OVERSCAN_COLS = 4;

export const SpreadsheetGrid: React.FC<SpreadsheetGridProps> = ({
  cells,
  onCellChange,
  onBatchPaste,
  selectedCell,
  setSelectedCell,
  selectionRange,
  setSelectionRange,
  formulaValue,
  setFormulaValue,
  rowCount,
  colCount,
  sheets,
  activeSheet,
  setActiveSheet,
  onAddSheet,
  collaboratorCursors = [],
  theme = 'dark',
  onOpenImageModal,
  onViewportChange,
  isRangeLoading = false,
  onInsertRowAbove,
  onInsertRowBelow,
  onInsertColLeft,
  onInsertColRight,
  onDeleteRow,
  onDeleteCol,
  onClearSelected,
  copiedRange: externalCopiedRange,
  setCopiedRange: externalSetCopiedRange,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);

  // Column width overrides state (colIndex -> width in px)
  const [colWidths, setColWidths] = useState<Record<number, number>>({});
  const [resizingCol, setResizingCol] = useState<{ colIndex: number; startX: number; startWidth: number } | null>(null);

  // In-cell inline editing state
  const [editingCell, setEditingCell] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [isMouseDown, setIsMouseDown] = useState(false);
  const [dragStartCell, setDragStartCell] = useState<string | null>(null);

  // Copied Range state (for animated dashed border and internal paste)
  const [internalCopiedRange, setInternalCopiedRange] = useState<{ start: string; end: string } | null>(null);
  const activeCopiedRange = externalCopiedRange !== undefined ? externalCopiedRange : internalCopiedRange;
  const updateCopiedRange = externalSetCopiedRange || setInternalCopiedRange;
  const [copyToast, setCopyToast] = useState<string | null>(null);

  // Lightbox enlarged image preview
  const [enlargedImage, setEnlargedImage] = useState<{ url: string; alt?: string } | null>(null);

  // "Go to row" quick jump dialog
  const [showJumpDialog, setShowJumpDialog] = useState(false);
  const [jumpTargetInput, setJumpTargetInput] = useState('');

  // Right-Click Context Menu
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    type: 'cell' | 'row' | 'col';
    cellKey?: string;
    rowIndex?: number;
    colIndex?: number;
  } | null>(null);

  // Scroll position & viewport dimensions
  const [scrollState, setScrollState] = useState({
    scrollTop: 0,
    scrollLeft: 0,
    clientWidth: 1200,
    clientHeight: 600,
  });

  const isDark = theme === 'dark';

  // Compute column widths & cumulative left offsets
  const { colOffsets, totalColsWidth } = useMemo(() => {
    const offsets: number[] = [0];
    let runningWidth = 0;
    for (let c = 0; c < colCount; c++) {
      const width = colWidths[c] || DEFAULT_COL_WIDTH;
      runningWidth += width;
      offsets.push(runningWidth);
    }
    return { colOffsets: offsets, totalColsWidth: runningWidth };
  }, [colCount, colWidths]);

  const totalGridHeight = rowCount * DEFAULT_ROW_HEIGHT;

  // Compute visible rows and columns using 2D virtualization
  const { startRow, endRow, startCol, endCol } = useMemo(() => {
    const { scrollTop, scrollLeft, clientWidth, clientHeight } = scrollState;

    const rawStartRow = Math.floor(scrollTop / DEFAULT_ROW_HEIGHT);
    const rawEndRow = Math.ceil((scrollTop + clientHeight) / DEFAULT_ROW_HEIGHT);

    const sRow = Math.max(0, rawStartRow - OVERSCAN_ROWS);
    const eRow = Math.min(rowCount - 1, rawEndRow + OVERSCAN_ROWS);

    let sCol = 0;
    while (sCol < colCount && colOffsets[sCol + 1] < scrollLeft) {
      sCol++;
    }
    sCol = Math.max(0, sCol - OVERSCAN_COLS);

    let eCol = sCol;
    const rightEdge = scrollLeft + clientWidth;
    while (eCol < colCount && colOffsets[eCol] < rightEdge) {
      eCol++;
    }
    eCol = Math.min(colCount - 1, eCol + OVERSCAN_COLS);

    return {
      startRow: sRow,
      endRow: eRow,
      startCol: sCol,
      endCol: eCol,
    };
  }, [scrollState, rowCount, colCount, colOffsets]);

  // Notify parent on viewport change for lazy range loading
  const prevViewportRef = useRef<string>('');
  useEffect(() => {
    const key = `${startRow}-${endRow}-${startCol}-${endCol}`;
    if (key !== prevViewportRef.current) {
      prevViewportRef.current = key;
      if (onViewportChange) {
        onViewportChange({ startRow, endRow, startCol, endCol });
      }
    }
  }, [startRow, endRow, startCol, endCol, onViewportChange]);

  // Sync scroll container measurements
  const handleScroll = useCallback(() => {
    if (!containerRef.current) return;
    const { scrollTop, scrollLeft, clientWidth, clientHeight } = containerRef.current;
    setScrollState({ scrollTop, scrollLeft, clientWidth, clientHeight });
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    setScrollState({
      scrollTop: el.scrollTop,
      scrollLeft: el.scrollLeft,
      clientWidth: el.clientWidth || 1200,
      clientHeight: el.clientHeight || 600,
    });

    const resizeObserver = new ResizeObserver(() => {
      if (containerRef.current) {
        setScrollState(prev => ({
          ...prev,
          clientWidth: containerRef.current!.clientWidth,
          clientHeight: containerRef.current!.clientHeight,
        }));
      }
    });

    resizeObserver.observe(el);
    return () => resizeObserver.disconnect();
  }, []);

  // Compute selected cells array
  const selectedCells = useMemo(() => {
    if (selectionRange) {
      return getCellsInRange(selectionRange.start, selectionRange.end);
    }
    return [selectedCell];
  }, [selectionRange, selectedCell]);

  // Compute range statistics
  const rangeStats = useMemo(() => {
    return selectedCells.length > 1 ? computeRangeStats(selectedCells, cells) : null;
  }, [selectedCells, cells]);

  // Auto-scroll to cell if outside visible viewport
  const scrollToCell = useCallback((cellKey: string) => {
    const coords = parseCellCoord(cellKey);
    if (!coords || !containerRef.current) return;

    const el = containerRef.current;
    const targetTop = coords.row * DEFAULT_ROW_HEIGHT;
    const targetLeft = colOffsets[coords.col];
    const targetWidth = colWidths[coords.col] || DEFAULT_COL_WIDTH;

    if (targetTop < el.scrollTop) {
      el.scrollTop = targetTop;
    } else if (targetTop + DEFAULT_ROW_HEIGHT > el.scrollTop + el.clientHeight - COL_HEADER_HEIGHT) {
      el.scrollTop = targetTop - el.clientHeight + DEFAULT_ROW_HEIGHT + COL_HEADER_HEIGHT + 20;
    }

    if (targetLeft < el.scrollLeft) {
      el.scrollLeft = targetLeft;
    } else if (targetLeft + targetWidth > el.scrollLeft + el.clientWidth - ROW_HEADER_WIDTH) {
      el.scrollLeft = targetLeft - el.clientWidth + targetWidth + ROW_HEADER_WIDTH + 20;
    }
  }, [colOffsets, colWidths]);

  // Copy Selected Multi-Cells (TSV to Clipboard & Visual Marching Ants)
  const handleCopy = useCallback(() => {
    const start = selectionRange?.start || selectedCell;
    const end = selectionRange?.end || selectedCell;
    const { tsv, count } = extractRangeToMatrix(cells, start, end);

    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(tsv).catch(err => console.warn('Clipboard write error:', err));
    }
    updateCopiedRange({ start, end });
    setCopyToast(`Copied ${count} cell${count > 1 ? 's' : ''} to clipboard`);
    setTimeout(() => setCopyToast(null), 2500);
  }, [selectionRange, selectedCell, cells, updateCopiedRange]);

  // Paste Action
  const handlePasteTrigger = useCallback(async () => {
    try {
      if (navigator?.clipboard?.readText) {
        const text = await navigator.clipboard.readText();
        if (text) {
          const rows = text.split(/\r?\n/).filter(r => r.length > 0);
          if (rows.length > 0) {
            const matrix = rows.map(r => r.split('\t'));
            if (onBatchPaste) {
              onBatchPaste(selectedCell, matrix);
            } else {
              onCellChange(selectedCell, matrix[0][0]);
            }
          }
        }
      }
    } catch (e) {
      console.warn('Clipboard read error, use Ctrl+V keyboard paste:', e);
    }
  }, [selectedCell, onBatchPaste, onCellChange]);

  // Jump to specific row or cell
  const handleJumpToTarget = (target: string) => {
    const trimmed = target.trim().toUpperCase();
    if (!trimmed) return;

    if (/^\d+$/.test(trimmed)) {
      const row = parseInt(trimmed, 10);
      if (row >= 1 && row <= rowCount) {
        const key = `A${row}`;
        setSelectedCell(key);
        setSelectionRange({ start: key, end: key });
        scrollToCell(key);
        setShowJumpDialog(false);
      }
      return;
    }

    const coords = parseCellCoord(trimmed);
    if (coords && coords.row >= 0 && coords.row < rowCount && coords.col >= 0 && coords.col < colCount) {
      const key = cellCoordToString(coords.col, coords.row);
      setSelectedCell(key);
      setSelectionRange({ start: key, end: key });
      scrollToCell(key);
      setShowJumpDialog(false);
    }
  };

  // Cell Click & Drag Handlers
  const handleCellMouseDown = (e: React.MouseEvent, cellKey: string) => {
    if (editingCell) return;
    if (contextMenu) setContextMenu(null);

    if (e.button === 2) {
      // Right click context menu
      return;
    }

    if (e.shiftKey) {
      const start = selectionRange?.start || selectedCell;
      setSelectionRange({ start, end: cellKey });
      return;
    }

    setIsMouseDown(true);
    setDragStartCell(cellKey);
    setSelectedCell(cellKey);
    setSelectionRange({ start: cellKey, end: cellKey });

    const cell = cells[cellKey];
    setFormulaValue(cell?.formula || cell?.value || '');
  };

  const handleCellMouseEnter = (cellKey: string) => {
    if (isMouseDown && dragStartCell) {
      setSelectionRange({ start: dragStartCell, end: cellKey });
    }
  };

  // Global mouse up to end drag selection and context menu dismissal
  useEffect(() => {
    const handleMouseUp = () => {
      setIsMouseDown(false);
      setDragStartCell(null);
      setResizingCol(null);
    };
    const handleClick = () => {
      setContextMenu(null);
    };
    window.addEventListener('mouseup', handleMouseUp);
    window.addEventListener('click', handleClick);
    return () => {
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('click', handleClick);
    };
  }, []);

  // Column width resize mouse handlers
  useEffect(() => {
    if (!resizingCol) return;

    const handleMouseMove = (e: MouseEvent) => {
      const deltaX = e.clientX - resizingCol.startX;
      const newWidth = Math.max(50, resizingCol.startWidth + deltaX);
      setColWidths(prev => ({
        ...prev,
        [resizingCol.colIndex]: newWidth,
      }));
    };

    const handleMouseUp = () => {
      setResizingCol(null);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [resizingCol]);

  const handleCellDoubleClick = (cellKey: string) => {
    setEditingCell(cellKey);
    const cell = cells[cellKey];
    setEditValue(cell?.formula || cell?.value || '');
  };

  const handleCommitEdit = (cellKey: string, val: string) => {
    if (val.startsWith('=')) {
      onCellChange(cellKey, '', val);
    } else {
      onCellChange(cellKey, val);
    }
    setEditingCell(null);
  };

  // Keyboard navigation & Shortcuts (Arrows, Tab, Enter, Escape, Copy, Paste, Jump)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (editingCell) {
        if (e.key === 'Enter') {
          e.preventDefault();
          handleCommitEdit(editingCell, editValue);
          const coords = parseCellCoord(editingCell);
          if (coords && coords.row < rowCount - 1) {
            const nextKey = cellCoordToString(coords.col, coords.row + 1);
            setSelectedCell(nextKey);
            setSelectionRange({ start: nextKey, end: nextKey });
            scrollToCell(nextKey);
          }
        } else if (e.key === 'Escape') {
          setEditingCell(null);
        }
        return;
      }

      const activeEl = document.activeElement;
      if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || (activeEl as HTMLElement).isContentEditable)) {
        return;
      }

      // Ctrl + C / Cmd + C: Copy Multi Cells
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c') {
        e.preventDefault();
        handleCopy();
        return;
      }

      // Ctrl + G / Cmd + G: Quick Jump dialog
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'g') {
        e.preventDefault();
        setShowJumpDialog(true);
        return;
      }

      const coords = parseCellCoord(selectedCell);
      if (!coords) return;

      let nextCol = coords.col;
      let nextRow = coords.row;
      let handled = false;

      if (e.key === 'ArrowUp') {
        nextRow = Math.max(0, coords.row - 1);
        handled = true;
      } else if (e.key === 'ArrowDown') {
        nextRow = Math.min(rowCount - 1, coords.row + 1);
        handled = true;
      } else if (e.key === 'ArrowLeft') {
        nextCol = Math.max(0, coords.col - 1);
        handled = true;
      } else if (e.key === 'ArrowRight') {
        nextCol = Math.min(colCount - 1, coords.col + 1);
        handled = true;
      } else if (e.key === 'Tab') {
        handled = true;
        if (e.shiftKey) {
          nextCol = Math.max(0, coords.col - 1);
        } else {
          nextCol = Math.min(colCount - 1, coords.col + 1);
        }
      } else if (e.key === 'Enter') {
        handled = true;
        if (e.shiftKey) {
          nextRow = Math.max(0, coords.row - 1);
        } else {
          nextRow = Math.min(rowCount - 1, coords.row + 1);
        }
      } else if (e.key === 'PageDown') {
        nextRow = Math.min(rowCount - 1, coords.row + 25);
        handled = true;
      } else if (e.key === 'PageUp') {
        nextRow = Math.max(0, coords.row - 25);
        handled = true;
      } else if (e.key === 'Home') {
        nextCol = 0;
        handled = true;
      }

      if (handled) {
        e.preventDefault();
        const nextKey = cellCoordToString(nextCol, nextRow);
        if (e.shiftKey && e.key.startsWith('Arrow')) {
          const anchor = selectionRange?.start || selectedCell;
          setSelectionRange({ start: anchor, end: nextKey });
        } else {
          setSelectedCell(nextKey);
          setSelectionRange({ start: nextKey, end: nextKey });
          const cell = cells[nextKey];
          setFormulaValue(cell?.formula || cell?.value || '');
        }
        scrollToCell(nextKey);
      } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        setEditingCell(selectedCell);
        setEditValue(e.key);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [editingCell, editValue, selectedCell, selectionRange, rowCount, colCount, cells, scrollToCell, handleCopy]);

  // Clipboard Paste support for multi-cell blocks
  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const text = e.clipboardData.getData('text/plain');
    if (!text) return;

    const rows = text.split(/\r?\n/).filter(r => r.length > 0);
    if (rows.length === 0) return;

    const matrix = rows.map(r => r.split('\t'));
    if (matrix.length > 1 || matrix[0].length > 1) {
      e.preventDefault();
      if (onBatchPaste) {
        onBatchPaste(selectedCell, matrix);
      } else {
        onCellChange(selectedCell, matrix[0][0]);
      }
    }
  }, [selectedCell, onBatchPaste, onCellChange]);

  // Context Menu Handlers
  const handleCellContextMenu = (e: React.MouseEvent, cellKey: string) => {
    e.preventDefault();
    setSelectedCell(cellKey);
    const coords = parseCellCoord(cellKey);
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      type: 'cell',
      cellKey,
      rowIndex: coords?.row,
      colIndex: coords?.col,
    });
  };

  const handleRowHeaderContextMenu = (e: React.MouseEvent, rowIndex: number) => {
    e.preventDefault();
    const cellKey = `A${rowIndex + 1}`;
    setSelectedCell(cellKey);
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      type: 'row',
      cellKey,
      rowIndex,
    });
  };

  const handleColHeaderContextMenu = (e: React.MouseEvent, colIndex: number) => {
    e.preventDefault();
    const colLetter = colIndexToLetter(colIndex);
    const cellKey = `${colLetter}1`;
    setSelectedCell(cellKey);
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      type: 'col',
      cellKey,
      colIndex,
    });
  };

  // Style tokens
  const containerBg = isDark ? 'bg-slate-950 text-slate-100' : 'bg-slate-100 text-slate-900';
  const headerBg = isDark ? 'bg-slate-900 text-slate-400 border-slate-700' : 'bg-slate-100 text-slate-600 border-slate-300';
  const rowNumberBg = isDark ? 'bg-slate-900 text-slate-500 border-slate-800' : 'bg-slate-50 text-slate-400 border-slate-200';
  const gridBorder = isDark ? 'border-slate-800/80' : 'border-slate-200';
  const cellDefaultText = isDark ? '#e2e8f0' : '#1e293b';
  const rangeSelectedBg = isDark ? 'rgba(16, 185, 129, 0.16)' : 'rgba(16, 185, 129, 0.20)';

  const visibleRows: number[] = [];
  for (let r = startRow; r <= endRow; r++) {
    visibleRows.push(r);
  }

  const visibleCols: number[] = [];
  for (let c = startCol; c <= endCol; c++) {
    visibleCols.push(c);
  }

  const currentCoords = parseCellCoord(selectedCell) || { row: 0, col: 0 };

  return (
    <div 
      onPaste={handlePaste}
      tabIndex={0}
      className={`flex flex-col flex-1 overflow-hidden select-none outline-none transition-colors ${containerBg}`}
    >
      {/* Quick Jump & Scale Bar */}
      <div className={`flex items-center justify-between border-b px-3 py-1 text-xs font-mono border-slate-800/50 ${
        isDark ? 'bg-slate-900/60 text-slate-400' : 'bg-slate-50 text-slate-600'
      }`}>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="font-semibold text-emerald-400">Virtualized 2D Engine</span>
          </div>
          <span className="text-slate-500">|</span>
          <span>Rows: <strong>{rowCount.toLocaleString()}</strong></span>
          <span className="text-slate-500">•</span>
          <span>Cols: <strong>{colCount}</strong></span>
          <span className="text-slate-500">•</span>
          <span>Viewport: Row {startRow + 1}-{endRow + 1} ({endRow - startRow + 1} rendered DOM rows)</span>
        </div>

        <div className="flex items-center gap-2">
          {copyToast && (
            <span className="flex items-center gap-1 px-2 py-0.5 rounded-lg bg-emerald-500/20 text-emerald-400 text-xs font-sans font-semibold border border-emerald-500/30 animate-in fade-in duration-200">
              <Check className="h-3 w-3" />
              {copyToast}
            </span>
          )}

          {isRangeLoading && (
            <span className="flex items-center gap-1 text-[11px] text-amber-400 font-sans">
              <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-amber-400 border-t-transparent" />
              Prefetching range...
            </span>
          )}

          <button
            onClick={() => setShowJumpDialog(true)}
            className={`flex items-center gap-1 rounded px-2 py-0.5 text-xs font-sans font-medium border transition ${
              isDark 
                ? 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700 hover:text-white' 
                : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
            }`}
            title="Jump to any row or cell (Ctrl+G)"
          >
            <Navigation className="h-3 w-3 text-emerald-400" />
            <span>Go to Row / Cell</span>
          </button>
        </div>
      </div>

      {/* Virtual Scroll Viewport Container */}
      <div 
        ref={containerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-auto relative focus:outline-none"
      >
        <div 
          style={{
            width: totalColsWidth + ROW_HEADER_WIDTH,
            height: totalGridHeight + COL_HEADER_HEIGHT,
            position: 'relative',
          }}
        >
          {/* TOP-LEFT FIXED CORNER */}
          <div 
            style={{
              position: 'sticky',
              top: 0,
              left: 0,
              width: ROW_HEADER_WIDTH,
              height: COL_HEADER_HEIGHT,
              zIndex: 40,
            }}
            className={`flex items-center justify-center font-bold text-xs border-r border-b ${headerBg}`}
          >
            #
          </div>

          {/* STICKY COLUMN HEADERS (A, B, C...) */}
          <div 
            style={{
              position: 'sticky',
              top: 0,
              left: ROW_HEADER_WIDTH,
              height: COL_HEADER_HEIGHT,
              width: totalColsWidth,
              zIndex: 30,
              pointerEvents: 'none',
            }}
          >
            {visibleCols.map((c) => {
              const letter = colIndexToLetter(c);
              const left = colOffsets[c];
              const width = colWidths[c] || DEFAULT_COL_WIDTH;

              return (
                <div
                  key={`col-hdr-${c}`}
                  onContextMenu={(e) => handleColHeaderContextMenu(e, c)}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left,
                    width,
                    height: COL_HEADER_HEIGHT,
                    pointerEvents: 'auto',
                  }}
                  className={`flex items-center justify-center font-bold text-xs border-r border-b truncate group/col select-none cursor-pointer hover:bg-emerald-500/10 transition-colors ${headerBg}`}
                  title={`Column ${letter} (Right-click to insert/delete)`}
                >
                  <span>{letter}</span>

                  {/* Resizable Column Border Handle */}
                  <div
                    onMouseDown={(e) => {
                      e.stopPropagation();
                      setResizingCol({
                        colIndex: c,
                        startX: e.clientX,
                        startWidth: width,
                      });
                    }}
                    className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-emerald-500 transition-colors z-10"
                    title={`Drag to resize column ${letter}`}
                  />
                </div>
              );
            })}
          </div>

          {/* STICKY ROW NUMBER HEADERS (1, 2, 3...) */}
          <div
            style={{
              position: 'sticky',
              left: 0,
              top: COL_HEADER_HEIGHT,
              width: ROW_HEADER_WIDTH,
              height: totalGridHeight,
              zIndex: 20,
              pointerEvents: 'none',
            }}
          >
            {visibleRows.map((r) => {
              const top = r * DEFAULT_ROW_HEIGHT;
              const rowNumber = r + 1;

              return (
                <div
                  key={`row-hdr-${r}`}
                  onContextMenu={(e) => handleRowHeaderContextMenu(e, r)}
                  style={{
                    position: 'absolute',
                    top,
                    left: 0,
                    width: ROW_HEADER_WIDTH,
                    height: DEFAULT_ROW_HEIGHT,
                    pointerEvents: 'auto',
                  }}
                  className={`flex items-center justify-center font-semibold text-[11px] border-r border-b select-none cursor-pointer hover:bg-emerald-500/10 transition-colors ${rowNumberBg}`}
                  title={`Row ${rowNumber} (Right-click to insert/delete)`}
                >
                  {rowNumber}
                </div>
              );
            })}
          </div>

          {/* VIRTUALIZED CELLS GRID */}
          <div
            style={{
              position: 'absolute',
              top: COL_HEADER_HEIGHT,
              left: ROW_HEADER_WIDTH,
              width: totalColsWidth,
              height: totalGridHeight,
            }}
          >
            {visibleRows.map((r) => {
              const top = r * DEFAULT_ROW_HEIGHT;
              const rowNumber = r + 1;

              return visibleCols.map((c) => {
                const colLetter = colIndexToLetter(c);
                const cellKey = `${colLetter}${rowNumber}`;
                const left = colOffsets[c];
                const width = colWidths[c] || DEFAULT_COL_WIDTH;

                const isPrimarySelected = selectedCell === cellKey;
                const inRange = selectionRange
                  ? isCoordInRange(cellKey, selectionRange.start, selectionRange.end)
                  : isPrimarySelected;
                
                // Check if inside copied range for animated marching ants
                const isCopied = activeCopiedRange
                  ? isCoordInRange(cellKey, activeCopiedRange.start, activeCopiedRange.end)
                  : false;

                const isEditing = editingCell === cellKey;
                const cell = cells[cellKey];

                const remoteCollab = collaboratorCursors.find((cr) => cr.cell === cellKey);

                let displayValue = '';
                if (cell) {
                  if (cell.formula) {
                    displayValue = String(evaluateFormula(cell.formula, cells));
                  } else {
                    displayValue = cell.value || '';
                    if (cell.format === 'currency' && !isNaN(Number(displayValue))) {
                      displayValue = `$${Number(displayValue).toFixed(2)}`;
                    } else if (cell.format === 'percent' && !isNaN(Number(displayValue))) {
                      displayValue = `${(Number(displayValue) * 100).toFixed(1)}%`;
                    }
                  }
                }

                const isImageCandidate = Boolean(
                  cell?.image?.url ||
                  (cell?.formula && cell.formula.toUpperCase().startsWith('=IMAGE(')) ||
                  (typeof displayValue === 'string' && (displayValue.startsWith('data:image/') || (displayValue.startsWith('http') && (displayValue.match(/\.(jpeg|jpg|gif|png|webp|svg)($|\?)/i) || displayValue.includes('images.unsplash.com') || displayValue.includes('dicebear')))))
                );
                const cellImageUrl = cell?.image?.url || (isImageCandidate ? displayValue : null);

                return (
                  <div
                    key={cellKey}
                    onMouseDown={(e) => handleCellMouseDown(e, cellKey)}
                    onMouseEnter={() => handleCellMouseEnter(cellKey)}
                    onDoubleClick={() => handleCellDoubleClick(cellKey)}
                    onContextMenu={(e) => handleCellContextMenu(e, cellKey)}
                    style={{
                      position: 'absolute',
                      top,
                      left,
                      width,
                      height: DEFAULT_ROW_HEIGHT,
                      backgroundColor: cell?.bgColor 
                        ? cell.bgColor 
                        : inRange 
                          ? rangeSelectedBg 
                          : remoteCollab 
                            ? `${remoteCollab.color}15` 
                            : isDark ? undefined : '#ffffff',
                      color: cell?.color || cellDefaultText,
                      fontWeight: cell?.bold ? 'bold' : 'normal',
                      fontStyle: cell?.italic ? 'italic' : 'normal',
                      textAlign: cell?.align || 'left',
                      boxShadow: remoteCollab && !isPrimarySelected ? `inset 0 0 0 2px ${remoteCollab.color}` : undefined,
                    }}
                    className={`px-2 flex items-center border-r border-b ${gridBorder} truncate cursor-cell transition-colors text-xs ${
                      isPrimarySelected 
                        ? 'ring-2 ring-emerald-500 z-10' 
                        : inRange 
                          ? 'outline-1 outline-emerald-500/60' 
                          : ''
                    } ${isCopied ? 'border-dashed border-2 border-emerald-400 animate-pulse' : ''}`}
                  >
                    {remoteCollab && (
                      <div
                        style={{ backgroundColor: remoteCollab.color }}
                        className="absolute top-0 right-0 z-20 px-1 py-0.5 rounded-bl text-[8.5px] font-bold text-white shadow-sm pointer-events-none whitespace-nowrap leading-none flex items-center gap-1 max-w-[85px] overflow-hidden"
                        title={`${remoteCollab.name} is on ${cellKey}`}
                      >
                        <span className="w-1.5 h-1.5 rounded-full bg-white shrink-0 animate-pulse" />
                        <span className="truncate">{remoteCollab.name}</span>
                      </div>
                    )}

                    {isEditing ? (
                      <input
                        type="text"
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        onBlur={() => handleCommitEdit(cellKey, editValue)}
                        autoFocus
                        className={`absolute inset-0 w-full h-full px-2 outline-none font-mono text-xs z-30 border border-emerald-500 ${
                          isDark ? 'bg-slate-900 text-white' : 'bg-white text-slate-900'
                        }`}
                      />
                    ) : cellImageUrl ? (
                      <div className="flex items-center gap-1.5 h-full w-full py-0.5 group/img overflow-hidden">
                        <div 
                          onClick={(e) => {
                            e.stopPropagation();
                            setEnlargedImage({ url: cellImageUrl, alt: cell?.image?.alt || cellKey });
                          }}
                          className="relative flex items-center justify-center h-5 w-6 shrink-0 rounded bg-black/10 overflow-hidden cursor-zoom-in border border-slate-700/30 hover:scale-105 transition-transform"
                          title="Click to view full image"
                        >
                          <img
                            src={cellImageUrl}
                            alt={cell?.image?.alt || cellKey}
                            className={`max-h-full max-w-full ${cell?.image?.fit === 'cover' ? 'object-cover w-full h-full' : 'object-contain'}`}
                          />
                        </div>
                        {cell?.image?.alt && cell.image.alt !== cellKey ? (
                          <span className="text-[11px] truncate opacity-90">{cell.image.alt}</span>
                        ) : cell?.value && !cell.value.startsWith('data:image') && !cell.value.startsWith('http') ? (
                          <span className="text-[11px] truncate opacity-90">{cell.value}</span>
                        ) : (
                          <span className="text-[10px] text-emerald-400 font-mono truncate">[Image]</span>
                        )}

                        {onOpenImageModal && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onOpenImageModal(cellKey);
                            }}
                            className="opacity-0 group-hover/img:opacity-100 ml-auto p-0.5 rounded text-slate-400 hover:text-emerald-400 transition"
                            title="Edit cell image"
                          >
                            <ImageIcon className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                    ) : (
                      <span className="block truncate w-full">{displayValue}</span>
                    )}
                  </div>
                );
              });
            })}
          </div>
        </div>
      </div>

      {/* Sheets bottom bar & Range Calculations */}
      <div className={`flex flex-wrap items-center justify-between border-t px-4 py-2 transition-colors ${
        isDark ? 'border-slate-800 bg-slate-900' : 'border-slate-200 bg-white'
      }`}>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 overflow-x-auto">
            {sheets.map((sheet) => (
              <button
                key={sheet}
                onClick={() => setActiveSheet(sheet)}
                className={`rounded-lg px-3 py-1 text-xs font-semibold transition ${
                  activeSheet === sheet
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : isDark 
                      ? 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-slate-200' 
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900'
                }`}
              >
                {sheet}
              </button>
            ))}
          </div>
          <button
            onClick={onAddSheet}
            title="Add New Sheet"
            className={`flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
              isDark 
                ? 'bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white' 
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200 hover:text-slate-900'
            }`}
          >
            <Plus className="h-3.5 w-3.5 text-emerald-500" />
            <span>Add Sheet</span>
          </button>
        </div>

        {/* Range Statistics (Google Sheets style) */}
        {rangeStats && rangeStats.numericCount > 0 ? (
          <div className={`flex items-center gap-3 px-3 py-1 rounded-xl text-xs font-medium border shadow-inner ${
            isDark 
              ? 'bg-slate-950 border-slate-800 text-slate-300' 
              : 'bg-slate-50 border-slate-200 text-slate-700'
          }`}>
            <div className="flex items-center gap-1 text-emerald-500 font-semibold">
              <Calculator className="h-3.5 w-3.5" />
              <span>Selection:</span>
            </div>
            <div className="flex items-center gap-3 font-mono text-[11px]">
              <span>Sum: <strong className="text-emerald-500 font-bold">{rangeStats.sum.toLocaleString()}</strong></span>
              <span className="text-slate-400">•</span>
              <span>Avg: <strong>{rangeStats.avg.toLocaleString()}</strong></span>
              <span className="text-slate-400">•</span>
              <span>Count: <strong>{rangeStats.numericCount}</strong></span>
              <span className="text-slate-400">•</span>
              <span>Min: <strong>{rangeStats.min.toLocaleString()}</strong></span>
              <span className="text-slate-400">•</span>
              <span>Max: <strong>{rangeStats.max.toLocaleString()}</strong></span>
            </div>
          </div>
        ) : selectedCells.length > 1 ? (
          <div className="text-[11px] text-slate-400 font-mono">
            {selectedCells.length} cells selected
          </div>
        ) : null}
      </div>

      {/* Right Click Context Menu */}
      {contextMenu && (
        <div 
          style={{ top: contextMenu.y, left: contextMenu.x }}
          className={`fixed z-50 w-56 rounded-2xl border py-2 shadow-2xl animate-in fade-in duration-150 ${
            isDark ? 'bg-slate-900 border-slate-800 text-slate-200' : 'bg-white border-slate-200 text-slate-800'
          }`}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Clipboard Section */}
          <button
            onClick={() => {
              handleCopy();
              setContextMenu(null);
            }}
            className={`flex items-center justify-between w-full px-3.5 py-1.5 text-xs text-left transition ${
              isDark ? 'hover:bg-slate-800 hover:text-emerald-400' : 'hover:bg-slate-100 hover:text-emerald-600'
            }`}
          >
            <div className="flex items-center gap-2">
              <Copy className="h-3.5 w-3.5 text-emerald-400" />
              <span>Copy</span>
            </div>
            <span className="text-[10px] text-slate-500 font-mono">Ctrl+C</span>
          </button>

          <button
            onClick={() => {
              handlePasteTrigger();
              setContextMenu(null);
            }}
            className={`flex items-center justify-between w-full px-3.5 py-1.5 text-xs text-left transition ${
              isDark ? 'hover:bg-slate-800 hover:text-emerald-400' : 'hover:bg-slate-100 hover:text-emerald-600'
            }`}
          >
            <div className="flex items-center gap-2">
              <Clipboard className="h-3.5 w-3.5 text-sky-400" />
              <span>Paste</span>
            </div>
            <span className="text-[10px] text-slate-500 font-mono">Ctrl+V</span>
          </button>

          <div className={`my-1.5 border-t ${isDark ? 'border-slate-800' : 'border-slate-100'}`} />

          {/* Row In-Between Actions */}
          {onInsertRowAbove && (
            <button
              onClick={() => {
                onInsertRowAbove(contextMenu.rowIndex ?? currentCoords.row);
                setContextMenu(null);
              }}
              className={`flex items-center gap-2 w-full px-3.5 py-1.5 text-xs text-left transition ${
                isDark ? 'hover:bg-slate-800 hover:text-emerald-400' : 'hover:bg-slate-100 hover:text-emerald-600'
              }`}
            >
              <ArrowUp className="h-3.5 w-3.5 text-emerald-400" />
              <span>Insert 1 row above</span>
            </button>
          )}

          {onInsertRowBelow && (
            <button
              onClick={() => {
                onInsertRowBelow(contextMenu.rowIndex ?? currentCoords.row);
                setContextMenu(null);
              }}
              className={`flex items-center gap-2 w-full px-3.5 py-1.5 text-xs text-left transition ${
                isDark ? 'hover:bg-slate-800 hover:text-emerald-400' : 'hover:bg-slate-100 hover:text-emerald-600'
              }`}
            >
              <ArrowDown className="h-3.5 w-3.5 text-emerald-400" />
              <span>Insert 1 row below</span>
            </button>
          )}

          <div className={`my-1.5 border-t ${isDark ? 'border-slate-800' : 'border-slate-100'}`} />

          {/* Column In-Between Actions */}
          {onInsertColLeft && (
            <button
              onClick={() => {
                onInsertColLeft(contextMenu.colIndex ?? currentCoords.col);
                setContextMenu(null);
              }}
              className={`flex items-center gap-2 w-full px-3.5 py-1.5 text-xs text-left transition ${
                isDark ? 'hover:bg-slate-800 hover:text-sky-400' : 'hover:bg-slate-100 hover:text-sky-600'
              }`}
            >
              <ArrowLeft className="h-3.5 w-3.5 text-sky-400" />
              <span>Insert 1 column left</span>
            </button>
          )}

          {onInsertColRight && (
            <button
              onClick={() => {
                onInsertColRight(contextMenu.colIndex ?? currentCoords.col);
                setContextMenu(null);
              }}
              className={`flex items-center gap-2 w-full px-3.5 py-1.5 text-xs text-left transition ${
                isDark ? 'hover:bg-slate-800 hover:text-sky-400' : 'hover:bg-slate-100 hover:text-sky-600'
              }`}
            >
              <ArrowRight className="h-3.5 w-3.5 text-sky-400" />
              <span>Insert 1 column right</span>
            </button>
          )}

          <div className={`my-1.5 border-t ${isDark ? 'border-slate-800' : 'border-slate-100'}`} />

          {/* Deletions */}
          {onDeleteRow && (
            <button
              onClick={() => {
                onDeleteRow(contextMenu.rowIndex ?? currentCoords.row);
                setContextMenu(null);
              }}
              className={`flex items-center gap-2 w-full px-3.5 py-1.5 text-xs text-left text-red-400 transition ${
                isDark ? 'hover:bg-red-950/40 hover:text-red-300' : 'hover:bg-red-50 hover:text-red-600'
              }`}
            >
              <Rows className="h-3.5 w-3.5" />
              <span>Delete row {(contextMenu.rowIndex ?? currentCoords.row) + 1}</span>
            </button>
          )}

          {onDeleteCol && (
            <button
              onClick={() => {
                onDeleteCol(contextMenu.colIndex ?? currentCoords.col);
                setContextMenu(null);
              }}
              className={`flex items-center gap-2 w-full px-3.5 py-1.5 text-xs text-left text-red-400 transition ${
                isDark ? 'hover:bg-red-950/40 hover:text-red-300' : 'hover:bg-red-50 hover:text-red-600'
              }`}
            >
              <Columns className="h-3.5 w-3.5" />
              <span>Delete column {colIndexToLetter(contextMenu.colIndex ?? currentCoords.col)}</span>
            </button>
          )}

          {onClearSelected && (
            <button
              onClick={() => {
                onClearSelected();
                setContextMenu(null);
              }}
              className={`flex items-center justify-between w-full px-3.5 py-1.5 text-xs text-left text-slate-400 transition ${
                isDark ? 'hover:bg-slate-800 hover:text-white' : 'hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              <div className="flex items-center gap-2">
                <Trash2 className="h-3.5 w-3.5" />
                <span>Clear contents</span>
              </div>
              <span className="text-[10px] text-slate-500 font-mono">Del</span>
            </button>
          )}
        </div>
      )}

      {/* Quick Jump Dialog */}
      {showJumpDialog && (
        <div 
          onClick={() => setShowJumpDialog(false)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4"
        >
          <div 
            onClick={(e) => e.stopPropagation()}
            className={`w-full max-w-sm rounded-2xl border p-5 shadow-2xl ${
              isDark ? 'bg-slate-900 border-slate-800 text-white' : 'bg-white border-slate-200 text-slate-900'
            }`}
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Navigation className="h-4 w-4 text-emerald-400" />
                <h3 className="text-sm font-bold">Go to Row / Cell</h3>
              </div>
              <button 
                onClick={() => setShowJumpDialog(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <p className="text-xs text-slate-400 mt-3 mb-2">
              Enter a row number (e.g. <strong>5000</strong>, <strong>50000</strong>) or cell reference (e.g. <strong>D500</strong>, <strong>Z1000</strong>) to scroll instantaneously across {rowCount.toLocaleString()} virtual rows.
            </p>

            <form 
              onSubmit={(e) => {
                e.preventDefault();
                handleJumpToTarget(jumpTargetInput);
              }}
              className="mt-3 space-y-3"
            >
              <input
                type="text"
                autoFocus
                placeholder="e.g. 5000 or Z100"
                value={jumpTargetInput}
                onChange={(e) => setJumpTargetInput(e.target.value)}
                className={`w-full rounded-xl border px-3 py-2 text-sm font-mono outline-none focus:border-emerald-500 ${
                  isDark ? 'bg-slate-950 border-slate-700 text-white' : 'bg-slate-50 border-slate-300 text-slate-900'
                }`}
              />

              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setShowJumpDialog(false)}
                  className={`rounded-xl px-3 py-1.5 text-xs font-semibold ${
                    isDark ? 'text-slate-400 hover:text-white' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-1.5 text-xs font-bold text-white shadow-sm hover:bg-emerald-500 transition"
                >
                  <span>Jump Now</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Lightbox / Enlarged Image Preview Modal */}
      {enlargedImage && (
        <div 
          onClick={() => setEnlargedImage(null)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-xs p-4"
        >
          <div 
            onClick={(e) => e.stopPropagation()}
            className={`relative flex flex-col max-w-2xl max-h-[85vh] rounded-2xl border p-4 shadow-2xl overflow-hidden ${
              isDark ? 'bg-slate-900 border-slate-800 text-white' : 'bg-white border-slate-200 text-slate-900'
            }`}
          >
            <div className={`flex items-center justify-between pb-3 border-b ${isDark ? 'border-slate-800' : 'border-slate-200'}`}>
              <div className="flex items-center gap-2">
                <ImageIcon className="h-4 w-4 text-emerald-400" />
                <h3 className="text-xs font-bold">{enlargedImage.alt || 'Cell Image Preview'}</h3>
              </div>
              <div className="flex items-center gap-2">
                <a
                  href={enlargedImage.url}
                  download="cell-image"
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs border border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700 transition"
                >
                  <Download className="h-3.5 w-3.5" />
                  <span>Full View</span>
                </a>
                <button
                  onClick={() => setEnlargedImage(null)}
                  className="rounded-lg p-1 text-slate-400 hover:text-white hover:bg-slate-800 transition"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="flex items-center justify-center p-4 overflow-auto max-h-[70vh]">
              <img
                src={enlargedImage.url}
                alt={enlargedImage.alt || 'Cell image'}
                className="max-h-[60vh] max-w-full rounded-xl object-contain shadow-lg"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
