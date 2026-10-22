import React, { useState, useRef, useEffect } from 'react';
import { 
  Bold, 
  Italic, 
  AlignLeft, 
  AlignCenter, 
  AlignRight, 
  DollarSign, 
  Percent, 
  Hash, 
  PlusCircle,
  Sigma,
  Eraser,
  Layers,
  Image as ImageIcon,
  Sparkles,
  Copy,
  Clipboard,
  ChevronDown,
  Rows,
  Columns,
  Trash2,
  ArrowUp,
  ArrowDown,
  ArrowLeft,
  ArrowRight
} from 'lucide-react';

interface ToolbarProps {
  onFormat: (styleKey: string, value: any) => void;
  onInsertFormula: (formula: string) => void;
  onAddRow: () => void;
  onAddCol: () => void;
  onClearSelected?: () => void;
  onAutoSumSelected?: () => void;
  onOpenImageModal?: () => void;
  onOpenAIAnalysis?: () => void;
  onCopySelected?: () => void;
  onPasteSelected?: () => void;
  onInsertRowAbove?: () => void;
  onInsertRowBelow?: () => void;
  onInsertColLeft?: () => void;
  onInsertColRight?: () => void;
  onDeleteRow?: () => void;
  onDeleteCol?: () => void;
  selectedCellsCount?: number;
  selectionLabel?: string;
  theme?: 'dark' | 'light';
}

export const Toolbar: React.FC<ToolbarProps> = ({
  onFormat,
  onInsertFormula,
  onAddRow,
  onAddCol,
  onClearSelected,
  onAutoSumSelected,
  onOpenImageModal,
  onOpenAIAnalysis,
  onCopySelected,
  onPasteSelected,
  onInsertRowAbove,
  onInsertRowBelow,
  onInsertColLeft,
  onInsertColRight,
  onDeleteRow,
  onDeleteCol,
  selectedCellsCount = 1,
  selectionLabel = 'A1',
  theme = 'dark',
}) => {
  const isDark = theme === 'dark';
  const [insertDropdownOpen, setInsertDropdownOpen] = useState(false);
  const [deleteDropdownOpen, setDeleteDropdownOpen] = useState(false);
  const insertMenuRef = useRef<HTMLDivElement>(null);
  const deleteMenuRef = useRef<HTMLDivElement>(null);

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (insertMenuRef.current && !insertMenuRef.current.contains(e.target as Node)) {
        setInsertDropdownOpen(false);
      }
      if (deleteMenuRef.current && !deleteMenuRef.current.contains(e.target as Node)) {
        setDeleteDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const containerClasses = isDark
    ? 'border-slate-800 bg-slate-900 text-slate-300'
    : 'border-slate-200 bg-white text-slate-700 shadow-xs';

  const btnClasses = isDark
    ? 'rounded p-1.5 hover:bg-slate-800 hover:text-white transition'
    : 'rounded p-1.5 hover:bg-slate-100 hover:text-slate-900 transition';

  const dividerClasses = isDark ? 'border-slate-800' : 'border-slate-200';
  const subBtnClasses = isDark
    ? 'rounded bg-slate-800/80 px-2 py-1 text-xs font-medium border border-slate-700 hover:bg-slate-700 hover:text-white transition'
    : 'rounded bg-slate-100 px-2 py-1 text-xs font-medium border border-slate-200 hover:bg-slate-200 hover:text-slate-900 transition';

  const dropdownMenuClasses = isDark
    ? 'bg-slate-900 border-slate-800 text-slate-200 shadow-2xl'
    : 'bg-white border-slate-200 text-slate-800 shadow-xl';

  const menuItemClasses = isDark
    ? 'flex items-center gap-2 w-full px-3 py-1.5 text-xs text-left hover:bg-slate-800 hover:text-emerald-400 transition'
    : 'flex items-center gap-2 w-full px-3 py-1.5 text-xs text-left hover:bg-slate-100 hover:text-emerald-600 transition';

  return (
    <div className={`flex flex-wrap items-center justify-between gap-2 border-b px-4 py-1.5 select-none ${containerClasses}`}>
      <div className="flex flex-wrap items-center gap-1.5">
        {/* Selection badge */}
        <div className={`flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs font-mono font-semibold border ${
          isDark 
            ? 'bg-slate-950/80 border-slate-800 text-emerald-400' 
            : 'bg-emerald-50 border-emerald-200 text-emerald-700'
        }`}>
          <Layers className="h-3 w-3" />
          <span>{selectionLabel}</span>
          {selectedCellsCount > 1 && (
            <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-sans font-medium ${
              isDark ? 'bg-slate-800 text-slate-300' : 'bg-emerald-100 text-emerald-800'
            }`}>
              {selectedCellsCount} cells
            </span>
          )}
        </div>

        {/* Copy & Paste Tools */}
        <div className={`flex items-center gap-0.5 border-r pr-1.5 ${dividerClasses}`}>
          {onCopySelected && (
            <button
              onClick={onCopySelected}
              title="Copy Selected Cells (Ctrl+C)"
              className={`flex items-center gap-1 px-2 py-1 text-xs font-medium rounded ${
                isDark ? 'hover:bg-slate-800 text-slate-200' : 'hover:bg-slate-100 text-slate-700'
              }`}
            >
              <Copy className="h-3.5 w-3.5 text-emerald-400" />
              <span>Copy</span>
            </button>
          )}

          {onPasteSelected && (
            <button
              onClick={onPasteSelected}
              title="Paste (Ctrl+V)"
              className={`flex items-center gap-1 px-2 py-1 text-xs font-medium rounded ${
                isDark ? 'hover:bg-slate-800 text-slate-200' : 'hover:bg-slate-100 text-slate-700'
              }`}
            >
              <Clipboard className="h-3.5 w-3.5 text-sky-400" />
              <span>Paste</span>
            </button>
          )}
        </div>

        {/* Text Formatting */}
        <div className={`flex items-center gap-0.5 border-r pr-1.5 ${dividerClasses}`}>
          <button
            onClick={() => onFormat('bold', true)}
            title="Bold (Selection)"
            className={btnClasses}
          >
            <Bold className="h-4 w-4" />
          </button>
          <button
            onClick={() => onFormat('italic', true)}
            title="Italic (Selection)"
            className={btnClasses}
          >
            <Italic className="h-4 w-4" />
          </button>
        </div>

        {/* Alignment */}
        <div className={`flex items-center gap-0.5 border-r pr-1.5 ${dividerClasses}`}>
          <button
            onClick={() => onFormat('align', 'left')}
            title="Align Left (Selection)"
            className={btnClasses}
          >
            <AlignLeft className="h-4 w-4" />
          </button>
          <button
            onClick={() => onFormat('align', 'center')}
            title="Align Center (Selection)"
            className={btnClasses}
          >
            <AlignCenter className="h-4 w-4" />
          </button>
          <button
            onClick={() => onFormat('align', 'right')}
            title="Align Right (Selection)"
            className={btnClasses}
          >
            <AlignRight className="h-4 w-4" />
          </button>
        </div>

        {/* Number Formats */}
        <div className={`flex items-center gap-0.5 border-r pr-1.5 ${dividerClasses}`}>
          <button
            onClick={() => onFormat('format', 'currency')}
            title="Format as Currency ($)"
            className={btnClasses}
          >
            <DollarSign className="h-4 w-4 text-emerald-500" />
          </button>
          <button
            onClick={() => onFormat('format', 'percent')}
            title="Format as Percent (%)"
            className={btnClasses}
          >
            <Percent className="h-4 w-4 text-sky-500" />
          </button>
          <button
            onClick={() => onFormat('format', 'general')}
            title="General Number Format"
            className={btnClasses}
          >
            <Hash className="h-4 w-4 text-amber-500" />
          </button>
        </div>

        {/* Colors */}
        <div className={`flex items-center gap-2 border-r pr-2 ${dividerClasses}`}>
          <div className="flex items-center gap-1">
            <span className={`text-[11px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Text:</span>
            <input
              type="color"
              onChange={(e) => onFormat('color', e.target.value)}
              defaultValue={isDark ? '#e2e8f0' : '#1e293b'}
              className="h-5 w-5 cursor-pointer rounded border-0 bg-transparent p-0"
              title="Text Color"
            />
          </div>
          <div className="flex items-center gap-1">
            <span className={`text-[11px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Fill:</span>
            <input
              type="color"
              onChange={(e) => onFormat('bgColor', e.target.value)}
              defaultValue={isDark ? '#1e293b' : '#f1f5f9'}
              className="h-5 w-5 cursor-pointer rounded border-0 bg-transparent p-0"
              title="Cell Fill Background Color"
            />
          </div>
        </div>

        {/* Multi-Cell Range Operations */}
        <div className={`flex items-center gap-1 border-r pr-2 ${dividerClasses}`}>
          {selectedCellsCount > 1 && onAutoSumSelected && (
            <button
              onClick={onAutoSumSelected}
              className={`flex items-center gap-1 ${subBtnClasses} text-emerald-500 font-semibold`}
              title="Auto-Sum selected numbers"
            >
              <Sigma className="h-3.5 w-3.5" />
              Auto-Sum
            </button>
          )}

          {onClearSelected && (
            <button
              onClick={onClearSelected}
              className={`flex items-center gap-1 ${subBtnClasses} text-red-400 hover:text-red-500`}
              title="Clear contents & formats of selected cell(s)"
            >
              <Eraser className="h-3.5 w-3.5" />
              Clear
            </button>
          )}
        </div>

        {/* Formula Shortcuts */}
        <div className="hidden sm:flex items-center gap-1">
          <button
            onClick={() => onInsertFormula('=SUM()')}
            className={`flex items-center gap-1 ${subBtnClasses} text-emerald-500`}
          >
            <Sigma className="h-3 w-3" />
            SUM
          </button>
          <button
            onClick={() => onInsertFormula('=AVERAGE()')}
            className={`flex items-center gap-1 ${subBtnClasses} text-sky-500`}
          >
            AVERAGE
          </button>
          <button
            onClick={() => onInsertFormula('=IF()')}
            className={`flex items-center gap-1 ${subBtnClasses} text-amber-500`}
          >
            IF
          </button>
        </div>

        {/* Insert Image & AI Analysis Buttons */}
        <div className={`flex items-center gap-1.5 border-l pl-2 ${dividerClasses}`}>
          {onOpenImageModal && (
            <button
              onClick={onOpenImageModal}
              className={`flex items-center gap-1.5 ${subBtnClasses} text-emerald-400 hover:text-emerald-300 font-semibold`}
              title="Insert Image in Selected Cell"
            >
              <ImageIcon className="h-3.5 w-3.5" />
              <span>Image</span>
            </button>
          )}

          {onOpenAIAnalysis && (
            <button
              onClick={onOpenAIAnalysis}
              className="flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-bold text-white bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 shadow-sm transition"
              title="Open Gemini AI Data Analysis & Insights"
            >
              <Sparkles className="h-3.5 w-3.5 animate-pulse text-amber-300" />
              <span>AI Analysis</span>
            </button>
          )}
        </div>
      </div>

      {/* Grid Structure & Insert/Delete in between */}
      <div className="flex items-center gap-1.5">
        {/* Insert In-Between Dropdown */}
        <div className="relative" ref={insertMenuRef}>
          <button
            onClick={() => setInsertDropdownOpen(prev => !prev)}
            className={`flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-lg border transition ${
              isDark 
                ? 'bg-slate-800/90 border-slate-700 text-emerald-400 hover:bg-slate-700 hover:text-white' 
                : 'bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100'
            }`}
            title="Insert row or column in between"
          >
            <PlusCircle className="h-3.5 w-3.5" />
            <span>Insert</span>
            <ChevronDown className="h-3 w-3 opacity-70" />
          </button>

          {insertDropdownOpen && (
            <div className={`absolute right-0 top-full mt-1 w-48 rounded-xl border py-1.5 z-50 ${dropdownMenuClasses}`}>
              <div className="px-3 py-1 text-[10px] uppercase font-bold tracking-wider text-slate-400">
                Insert in between
              </div>

              {onInsertRowAbove && (
                <button
                  onClick={() => {
                    onInsertRowAbove();
                    setInsertDropdownOpen(false);
                  }}
                  className={menuItemClasses}
                >
                  <ArrowUp className="h-3.5 w-3.5 text-emerald-400" />
                  <span>Row Above ({selectionLabel})</span>
                </button>
              )}

              {onInsertRowBelow && (
                <button
                  onClick={() => {
                    onInsertRowBelow();
                    setInsertDropdownOpen(false);
                  }}
                  className={menuItemClasses}
                >
                  <ArrowDown className="h-3.5 w-3.5 text-emerald-400" />
                  <span>Row Below ({selectionLabel})</span>
                </button>
              )}

              <div className={`my-1 border-t ${isDark ? 'border-slate-800' : 'border-slate-100'}`} />

              {onInsertColLeft && (
                <button
                  onClick={() => {
                    onInsertColLeft();
                    setInsertDropdownOpen(false);
                  }}
                  className={menuItemClasses}
                >
                  <ArrowLeft className="h-3.5 w-3.5 text-sky-400" />
                  <span>Column Left ({selectionLabel})</span>
                </button>
              )}

              {onInsertColRight && (
                <button
                  onClick={() => {
                    onInsertColRight();
                    setInsertDropdownOpen(false);
                  }}
                  className={menuItemClasses}
                >
                  <ArrowRight className="h-3.5 w-3.5 text-sky-400" />
                  <span>Column Right ({selectionLabel})</span>
                </button>
              )}
            </div>
          )}
        </div>

        {/* Delete Row/Col Dropdown */}
        <div className="relative" ref={deleteMenuRef}>
          <button
            onClick={() => setDeleteDropdownOpen(prev => !prev)}
            className={`flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-lg border transition ${
              isDark 
                ? 'bg-slate-800/90 border-slate-700 text-red-400 hover:bg-red-950/40 hover:border-red-800' 
                : 'bg-red-50 border-red-200 text-red-600 hover:bg-red-100'
            }`}
            title="Delete current row or column"
          >
            <Trash2 className="h-3.5 w-3.5" />
            <span>Delete</span>
            <ChevronDown className="h-3 w-3 opacity-70" />
          </button>

          {deleteDropdownOpen && (
            <div className={`absolute right-0 top-full mt-1 w-44 rounded-xl border py-1.5 z-50 ${dropdownMenuClasses}`}>
              {onDeleteRow && (
                <button
                  onClick={() => {
                    onDeleteRow();
                    setDeleteDropdownOpen(false);
                  }}
                  className={menuItemClasses}
                >
                  <Rows className="h-3.5 w-3.5 text-red-400" />
                  <span>Delete Current Row</span>
                </button>
              )}

              {onDeleteCol && (
                <button
                  onClick={() => {
                    onDeleteCol();
                    setDeleteDropdownOpen(false);
                  }}
                  className={menuItemClasses}
                >
                  <Columns className="h-3.5 w-3.5 text-red-400" />
                  <span>Delete Current Column</span>
                </button>
              )}
            </div>
          )}
        </div>

        {/* Quick Add at End */}
        <div className="flex items-center gap-1 pl-1 border-l border-slate-800/50">
          <button
            onClick={onAddRow}
            className={`flex items-center gap-1 ${subBtnClasses}`}
            title="Add 1,000 rows at end"
          >
            <PlusCircle className="h-3 w-3 text-emerald-500" />
            <span className="text-xs">+1k Rows</span>
          </button>
          <button
            onClick={onAddCol}
            className={`flex items-center gap-1 ${subBtnClasses}`}
            title="Add 5 columns at end"
          >
            <PlusCircle className="h-3 w-3 text-sky-500" />
            <span className="text-xs">+5 Cols</span>
          </button>
        </div>
      </div>
    </div>
  );
};
