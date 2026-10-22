import React, { useState } from 'react';
import { X, Cpu, Play, CheckCircle } from 'lucide-react';

interface PluginModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRunScript: (script: string) => void;
  theme?: 'dark' | 'light';
}

export const PluginModal: React.FC<PluginModalProps> = ({ isOpen, onClose, onRunScript, theme = 'dark' }) => {
  const [script, setScript] = useState(`// Custom JavaScript Macro / Plugin
// Example: Multiply column B values by 1.1 (10% inflation)
// Available object: cells (Record<string, {value: string}>), updateCell(key, val)

for (let r = 1; r <= 10; r++) {
  const key = 'B' + r;
  if (cells[key] && !isNaN(Number(cells[key].value))) {
    const newVal = Number(cells[key].value) * 1.1;
    updateCell(key, newVal.toFixed(2));
  }
}`);
  const [successMsg, setSuccessMsg] = useState(false);
  const isDark = theme === 'dark';

  if (!isOpen) return null;

  const handleExecute = () => {
    onRunScript(script);
    setSuccessMsg(true);
    setTimeout(() => setSuccessMsg(false), 3000);
  };

  const modalBg = isDark ? 'bg-slate-900 border-slate-800 text-slate-100' : 'bg-white border-slate-200 text-slate-900';
  const textareaBg = isDark ? 'bg-slate-950 text-emerald-300 border-slate-800' : 'bg-slate-900 text-emerald-400 border-slate-300';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className={`flex flex-col w-full max-w-2xl rounded-2xl border shadow-2xl overflow-hidden transition-colors ${modalBg}`}>
        <div className={`flex items-center justify-between border-b px-6 py-4 ${isDark ? 'border-slate-800' : 'border-slate-200'}`}>
          <div className="flex items-center gap-2">
            <Cpu className="h-5 w-5 text-indigo-500" />
            <h2 className="text-base font-bold">Custom Plugins & Macro Runner</h2>
          </div>
          <button 
            onClick={onClose} 
            className={`rounded-lg p-1.5 transition ${isDark ? 'text-slate-400 hover:bg-slate-800 hover:text-white' : 'text-slate-500 hover:bg-slate-100'}`}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
            Write custom JavaScript macros to automate spreadsheet data transformations, calculations, and bulk updates.
          </p>

          <div className="relative">
            <textarea
              rows={10}
              value={script}
              onChange={(e) => setScript(e.target.value)}
              className={`w-full rounded-xl p-4 font-mono text-xs border focus:outline-none focus:ring-2 focus:ring-indigo-500 ${textareaBg}`}
            />
          </div>

          <div className="flex items-center justify-between pt-2">
            {successMsg ? (
              <div className="flex items-center gap-2 text-xs font-semibold text-emerald-500">
                <CheckCircle className="h-4 w-4" />
                Macro executed successfully!
              </div>
            ) : <div />}

            <button
              onClick={handleExecute}
              className="flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-xs font-semibold text-white shadow-md hover:bg-indigo-500 transition"
            >
              <Play className="h-4 w-4" />
              Run Macro
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
