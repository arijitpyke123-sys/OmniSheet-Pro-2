import React from 'react';
import { X, History, Clock } from 'lucide-react';

interface AuditLog {
  action: string;
  timestamp: string;
  userId: string;
}

interface VersionHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  logs: AuditLog[];
  theme?: 'dark' | 'light';
}

export const VersionHistoryModal: React.FC<VersionHistoryModalProps> = ({ isOpen, onClose, logs, theme = 'dark' }) => {
  const isDark = theme === 'dark';

  if (!isOpen) return null;

  const modalBg = isDark ? 'bg-slate-900 border-slate-800 text-slate-100' : 'bg-white border-slate-200 text-slate-900';
  const cardBg = isDark ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className={`flex flex-col w-full max-w-lg rounded-2xl border shadow-2xl overflow-hidden max-h-[80vh] transition-colors ${modalBg}`}>
        <div className={`flex items-center justify-between border-b px-6 py-4 ${isDark ? 'border-slate-800' : 'border-slate-200'}`}>
          <div className="flex items-center gap-2">
            <History className="h-5 w-5 text-sky-500" />
            <h2 className="text-base font-bold">Audit Log & Version History</h2>
          </div>
          <button 
            onClick={onClose} 
            className={`rounded-lg p-1.5 transition ${isDark ? 'text-slate-400 hover:bg-slate-800 hover:text-white' : 'text-slate-500 hover:bg-slate-100'}`}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto space-y-3">
          {logs.length === 0 ? (
            <div className={`text-center py-8 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
              <Clock className="mx-auto h-10 w-10 mb-2 opacity-50" />
              <p className="text-xs">No activity recorded yet in this session.</p>
            </div>
          ) : (
            logs.map((log, index) => (
              <div key={index} className={`flex items-center justify-between rounded-xl px-4 py-3 border ${cardBg}`}>
                <div className="flex items-center gap-3">
                  <div className={`flex h-8 w-8 items-center justify-center rounded-lg border ${
                    isDark ? 'bg-sky-950 text-sky-400 border-sky-800' : 'bg-sky-50 text-sky-600 border-sky-200'
                  }`}>
                    <Clock className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold">{log.action}</p>
                    <p className={`text-[10px] ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>User: {log.userId}</p>
                  </div>
                </div>
                <span className={`text-[10px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                  {new Date(log.timestamp).toLocaleTimeString()}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
