import { useEffect, useState } from 'react';
import { syncManager, SyncStatus } from '../services/syncManager';
import { indexedDBQueue } from '../services/indexedDBQueue';

export function useOfflineQueue(spreadsheetId?: string | null) {
  const [status, setStatus] = useState<SyncStatus>(() => syncManager.getStatus());

  useEffect(() => {
    const unsubscribe = syncManager.subscribeStatus((newStatus) => {
      setStatus(newStatus);
    });

    if (spreadsheetId) {
      syncManager.refreshPendingCount();
    }

    return () => unsubscribe();
  }, [spreadsheetId]);

  const forceSync = () => syncManager.forceSync();

  return {
    isOnline: status.isOnline,
    wsConnected: status.wsConnected,
    isReplaying: status.isReplaying,
    pendingCount: status.pendingCount,
    lastSyncedAt: status.lastSyncedAt,
    lastConflict: status.lastConflict,
    forceSync,
  };
}
