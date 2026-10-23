import React, { useState, useEffect } from 'react';
import { WifiOff, RefreshCw, CheckCircle2, Database, AlertCircle } from 'lucide-react';
import { useOfflineQueue } from '../hooks/useOfflineQueue';

export const OfflineIndicator: React.FC<{ spreadsheetId?: string | null }> = ({ spreadsheetId }) => {
  const { isOnline, isReplaying, pendingCount, forceSync } = useOfflineQueue(spreadsheetId);
  const [showSyncedToast, setShowSyncedToast] = useState(false);
  const [prevPending, setPrevPending] = useState(pendingCount);

  useEffect(() => {
    if (prevPending > 0 && pendingCount === 0 && isOnline) {
      setShowSyncedToast(true);
      const timer = setTimeout(() => setShowSyncedToast(false), 4000);
      return () => clearTimeout(timer);
    }
    setPrevPending(pendingCount);
  }, [pendingCount, isOnline, prevPending]);

  // If online and nothing pending and no synced toast, hide
  if (isOnline && pendingCount === 0 && !isReplaying && !showSyncedToast) {
    return null;
  }

  // Brief celebration toast when all offline edits successfully commit to server
  if (showSyncedToast) {
    return (
      <div className="fixed bottom-4 left-4 z-50 flex items-center gap-2.5 rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-semibold text-white shadow-2xl border border-emerald-400 animate-fade-in">
        <CheckCircle2 className="h-4 w-4 text-emerald-100" />
        <span>All offline edits committed to server (Zero Data Loss)</span>
      </div>
    );
  }

  // Active sync replay in progress
  if (isReplaying) {
    return (
      <div className="fixed bottom-4 left-4 z-50 flex items-center gap-2.5 rounded-xl bg-sky-600 px-4 py-2.5 text-xs font-semibold text-white shadow-2xl border border-sky-400">
        <RefreshCw className="h-4 w-4 animate-spin text-sky-200" />
        <span>Replaying {pendingCount} offline edit{pendingCount === 1 ? '' : 's'} from IndexedDB...</span>
      </div>
    );
  }

  // Offline or with pending unconfirmed edits in IndexedDB
  return (
    <div className="fixed bottom-4 left-4 z-50 flex items-center gap-3 rounded-xl bg-amber-600/95 backdrop-blur px-4 py-2.5 text-xs font-semibold text-white shadow-2xl border border-amber-400">
      <div className="flex items-center gap-2">
        {!isOnline ? (
          <WifiOff className="h-4 w-4 text-amber-200 animate-pulse" />
        ) : (
          <Database className="h-4 w-4 text-amber-200" />
        )}
        <div>
          <span>
            {!isOnline ? 'Offline Mode' : 'Pending Server Commit'}:{' '}
          </span>
          <span className="font-mono bg-amber-700/60 px-1.5 py-0.5 rounded text-[11px]">
            {pendingCount} edit{pendingCount === 1 ? '' : 's'}
          </span>
          <span className="opacity-90 ml-1.5 hidden sm:inline">
            safely preserved in browser IndexedDB
          </span>
        </div>
      </div>

      {isOnline && pendingCount > 0 && (
        <button
          onClick={forceSync}
          className="flex items-center gap-1 bg-amber-800 hover:bg-amber-900 text-amber-100 px-2.5 py-1 rounded-lg text-[11px] font-bold transition shadow-sm"
          title="Force immediate replay to server"
        >
          <RefreshCw className="h-3 w-3" />
          Sync Now
        </button>
      )}
    </div>
  );
};
