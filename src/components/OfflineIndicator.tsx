import React from 'react';
import { WifiOff } from 'lucide-react';
import { useOnlineStatus } from '../hooks/usePWA';

export const OfflineIndicator: React.FC = () => {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div className="fixed bottom-4 left-4 z-50 flex items-center gap-2 rounded-xl bg-amber-600 px-4 py-2.5 text-xs font-semibold text-white shadow-xl border border-amber-500 animate-bounce">
      <WifiOff className="h-4 w-4" />
      <span>Offline Mode — Changes saved locally and will sync when online.</span>
    </div>
  );
};
