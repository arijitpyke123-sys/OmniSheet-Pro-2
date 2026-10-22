import React from 'react';
import { FunctionSquare } from 'lucide-react';

interface FormulaBarProps {
  selectedCell: string;
  selectionLabel?: string;
  formulaValue: string;
  setFormulaValue: (val: string) => void;
  onCommitFormula: () => void;
  theme?: 'dark' | 'light';
}

export const FormulaBar: React.FC<FormulaBarProps> = ({
  selectedCell,
  selectionLabel,
  formulaValue,
  setFormulaValue,
  onCommitFormula,
  theme = 'dark',
}) => {
  const isDark = theme === 'dark';

  return (
    <div className={`flex items-center gap-3 border-b px-4 py-2 select-none transition-colors ${
      isDark 
        ? 'border-slate-800 bg-slate-900/90 text-slate-300' 
        : 'border-slate-200 bg-slate-50/90 text-slate-700'
    }`}>
      <div className={`flex items-center gap-1.5 font-mono text-xs font-bold min-w-[60px] px-2 py-1 rounded border ${
        isDark 
          ? 'bg-slate-950 border-slate-800 text-emerald-400' 
          : 'bg-white border-slate-300 text-emerald-700'
      }`}>
        <span>{selectionLabel || selectedCell}</span>
      </div>
      <div className="flex items-center gap-1 text-slate-400">
        <FunctionSquare className="h-4 w-4 text-emerald-500" />
        <span className="text-xs font-bold font-mono">fx</span>
      </div>
      <input
        type="text"
        value={formulaValue}
        onChange={(e) => setFormulaValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            onCommitFormula();
          }
        }}
        placeholder="Enter value or formula (e.g. =SUM(A1:A5), =A1*B1, =AVERAGE(C1:C10))"
        className={`w-full rounded-lg px-3 py-1.5 font-mono text-xs transition border focus:outline-none focus:ring-2 focus:ring-emerald-500 ${
          isDark 
            ? 'bg-slate-950 text-slate-100 placeholder-slate-500 border-slate-800' 
            : 'bg-white text-slate-900 placeholder-slate-400 border-slate-300 shadow-xs'
        }`}
      />
    </div>
  );
};
