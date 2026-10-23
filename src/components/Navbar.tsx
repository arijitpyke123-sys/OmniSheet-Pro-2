import React, { useState } from 'react';
import { 
  FileSpreadsheet, 
  Share2, 
  BarChart3, 
  Download, 
  Upload, 
  Cpu, 
  History, 
  LogOut, 
  Smartphone, 
  WifiOff, 
  Cloud, 
  RefreshCw,
  ArrowLeft,
  Sun,
  Moon,
  Zap,
  Rocket,
  Sparkles,
  Activity,
  Database
} from 'lucide-react';
import { usePWAInstall, useOnlineStatus } from '../hooks/usePWA';
import { useOfflineQueue } from '../hooks/useOfflineQueue';
import { auth } from '../lib/firebase';
import { signOut } from 'firebase/auth';
import { UserPresence } from '../services/firestoreService';
import { QuotaStatus } from '../utils/rateLimiter';

interface NavbarProps {
  title: string;
  setTitle: (t: string) => void;
  onBackToDashboard: () => void;
  onOpenShare: () => void;
  onOpenCharts: () => void;
  onOpenAIAnalysis?: () => void;
  onOpenPlugins: () => void;
  onOpenHistory: () => void;
  onExportCSV: () => void;
  onImportCSV: (e: React.ChangeEvent<HTMLInputElement>) => void;
  user: any;
  setUser: (u: any) => void;
  activeRole: string;
  isSaving: boolean;
  lastSavedAt: string | null;
  onManualSave: () => void;
  collaboratorsPresence: UserPresence[];
  theme?: 'dark' | 'light';
  onToggleTheme?: () => void;
  onOpenPlanQuota?: () => void;
  quotaStatus?: QuotaStatus;
  onOpenRenderDeploy?: () => void;
  onOpenSimulation?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  title,
  setTitle,
  onBackToDashboard,
  onOpenShare,
  onOpenCharts,
  onOpenAIAnalysis,
  onOpenPlugins,
  onOpenHistory,
  onExportCSV,
  onImportCSV,
  user,
  setUser,
  activeRole,
  isSaving,
  lastSavedAt,
  onManualSave,
  collaboratorsPresence = [],
  theme = 'dark',
  onToggleTheme,
  onOpenPlanQuota,
  quotaStatus,
  onOpenRenderDeploy,
  onOpenSimulation,
}) => {
  const { isInstallable, isInstalled, install, isIOS } = usePWAInstall();
  const isOnline = useOnlineStatus();
  const { pendingCount, isReplaying, forceSync } = useOfflineQueue();
  const [showIOSModal, setShowIOSModal] = useState(false);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const isDark = theme === 'dark';

  const handleLogout = async () => {
    try {
      localStorage.removeItem('omnisheet_active_user');
      if (auth) {
        await signOut(auth);
      }
    } catch (err) {
      console.warn('Sign out warning:', err);
    }
    setUser(null);
  };

  const navClasses = isDark
    ? 'border-slate-800 bg-slate-900 text-slate-100 shadow-md'
    : 'border-slate-200 bg-white text-slate-800 shadow-sm';

  const actionBtnClasses = isDark
    ? 'rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-200 border border-slate-700 hover:bg-slate-700 transition'
    : 'rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-700 border border-slate-200 hover:bg-slate-200 transition';

  return (
    <header className={`flex flex-col border-b select-none transition-colors ${navClasses}`}>
      <div className="flex flex-wrap items-center justify-between px-4 py-2 gap-2">
        {/* Left: Back to Dashboard & Title */}
        <div className="flex items-center gap-2.5">
          <button
            onClick={onBackToDashboard}
            className={`flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-xs font-semibold border transition ${
              isDark 
                ? 'bg-slate-800/80 hover:bg-slate-700 text-slate-200 border-slate-700' 
                : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-300'
            }`}
            title="Return to Sheets Dashboard"
          >
            <ArrowLeft className="h-3.5 w-3.5 text-emerald-500" />
            <span className="hidden sm:inline">Sheets</span>
          </button>

          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-500 text-white shadow-md shadow-emerald-950/30">
            <FileSpreadsheet className="h-5 w-5" />
          </div>

          <div>
            <div className="flex items-center gap-2">
              {isEditingTitle ? (
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  onBlur={() => setIsEditingTitle(false)}
                  autoFocus
                  className={`rounded px-2 py-0.5 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-emerald-500 ${
                    isDark ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-900 border border-slate-300'
                  }`}
                />
              ) : (
                <h1 
                  onClick={() => setIsEditingTitle(true)}
                  className="cursor-pointer text-sm font-bold hover:text-emerald-500 transition leading-tight"
                  title="Click to rename"
                >
                  {title}
                </h1>
              )}
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold border capitalize ${
                isDark 
                  ? 'bg-slate-800 border-slate-700 text-emerald-400' 
                  : 'bg-emerald-50 border-emerald-200 text-emerald-700'
              }`}>
                {activeRole}
              </span>
            </div>
            
            {/* Firestore Cloud Sync Status */}
            <div className="flex items-center gap-2 mt-0.5">
              <button
                onClick={onManualSave}
                disabled={isSaving}
                className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-emerald-400 transition"
                title="Click to sync current changes to Firestore"
              >
                {isSaving ? (
                  <>
                    <RefreshCw className="h-3 w-3 animate-spin text-amber-500" />
                    <span className="text-amber-500">Syncing to Firestore...</span>
                  </>
                ) : (
                  <>
                    <Cloud className="h-3 w-3 text-emerald-500" />
                    <span>Firestore synced {lastSavedAt ? `(${lastSavedAt})` : ''}</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Center/Right: Collaborator Avatars & Controls */}
        <div className="flex items-center gap-2">
          {/* Live Collaborator Avatars */}
          {collaboratorsPresence.length > 0 && (
            <div className={`flex items-center gap-1.5 mr-1 px-2 py-1 rounded-xl border ${
              isDark ? 'bg-slate-950 border-slate-800' : 'bg-slate-100 border-slate-200'
            }`}>
              <div className="flex -space-x-1.5 overflow-hidden items-center">
                {collaboratorsPresence.map((collab) => (
                  <div
                    key={collab.userId}
                    style={{ borderColor: collab.color }}
                    className="relative inline-block h-6 w-6 rounded-full border-2 text-[10px] font-bold text-white bg-slate-800 flex items-center justify-center cursor-default shadow-sm"
                    title={`${collab.name} (${collab.email}) on ${collab.activeCell || 'cell'}`}
                  >
                    {collab.name.charAt(0).toUpperCase()}
                  </div>
                ))}
              </div>
              <span className="text-[11px] text-emerald-500 font-semibold hidden md:inline ml-1">
                {collaboratorsPresence.length} online
              </span>
            </div>
          )}

          {!isOnline ? (
            <div className="flex items-center gap-1.5 rounded-lg bg-amber-500/20 px-2.5 py-1 text-xs font-medium text-amber-500 border border-amber-500/30">
              <WifiOff className="h-3.5 w-3.5 animate-pulse" />
              <span>Offline</span>
              {pendingCount > 0 && (
                <span className="bg-amber-500/30 text-amber-300 font-mono text-[10px] px-1.5 py-0.2 rounded-full font-bold">
                  {pendingCount}
                </span>
              )}
            </div>
          ) : pendingCount > 0 ? (
            <button
              onClick={forceSync}
              className="flex items-center gap-1.5 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 px-2.5 py-1 text-xs font-medium text-amber-400 border border-amber-500/30 transition"
              title={`${pendingCount} unconfirmed edits in IndexedDB. Click to sync immediately.`}
            >
              <Database className={`h-3.5 w-3.5 ${isReplaying ? 'animate-spin' : ''}`} />
              <span>{pendingCount} pending</span>
            </button>
          ) : null}

          {/* Tenant Quotas & Subscription Plan (Netflix-style Rate Limiter) */}
          {onOpenPlanQuota && quotaStatus && (
            <button
              onClick={onOpenPlanQuota}
              className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold border transition ${
                !quotaStatus.allowed || quotaStatus.remaining <= 0
                  ? 'bg-red-500/20 text-red-400 border-red-500/40 hover:bg-red-500/30 animate-pulse'
                  : quotaStatus.percentUsed >= 80
                  ? 'bg-amber-500/20 text-amber-400 border-amber-500/40 hover:bg-amber-500/30'
                  : isDark
                  ? 'bg-slate-800 text-slate-200 border-slate-700 hover:border-emerald-500/50 hover:bg-slate-700'
                  : 'bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100'
              }`}
              title={`Tenant Plan Quota: ${quotaStatus.remaining}/${quotaStatus.total} edits left this hour (₹${quotaStatus.plan.priceRupees} Plan). Click to view plan quotas or upgrade.`}
            >
              <Zap className={`h-3.5 w-3.5 ${
                !quotaStatus.allowed || quotaStatus.remaining <= 0 ? 'text-red-400' : 'text-emerald-500'
              }`} />
              <span className="font-mono">{quotaStatus.remaining}/{quotaStatus.total}</span>
              <span className="text-[10.5px] hidden sm:inline font-sans opacity-85">
                (₹{quotaStatus.plan.priceRupees})
              </span>
            </button>
          )}

          {/* Theme Toggle (Dark / Light Mode) */}
          {onToggleTheme && (
            <button
              onClick={onToggleTheme}
              className={`flex items-center justify-center rounded-lg p-1.5 border transition ${
                isDark 
                  ? 'bg-slate-800 text-amber-400 border-slate-700 hover:bg-slate-700' 
                  : 'bg-slate-100 text-slate-700 border-slate-300 hover:bg-slate-200'
              }`}
              title={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
            >
              {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
          )}

          {/* Deploy to Render */}
          {onOpenRenderDeploy && (
            <button
              onClick={onOpenRenderDeploy}
              className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold border transition ${
                isDark 
                  ? 'bg-sky-950/40 text-sky-400 border-sky-800/60 hover:bg-sky-900/50 hover:border-sky-500' 
                  : 'bg-sky-50 text-sky-700 border-sky-200 hover:bg-sky-100'
              }`}
              title="Deploy OmniSheet Pro to Render (Static Site or Node Web Service)"
            >
              <Rocket className="h-3.5 w-3.5 text-sky-400" />
              <span className="hidden sm:inline">Deploy</span>
            </button>
          )}

          {!isInstalled && isInstallable && (
            <button
              onClick={install}
              className="flex items-center gap-1.5 rounded-lg bg-emerald-600/20 px-2.5 py-1.5 text-xs font-semibold text-emerald-500 border border-emerald-500/30 hover:bg-emerald-600/30 transition"
            >
              <Smartphone className="h-3.5 w-3.5" />
              Install
            </button>
          )}

          {!isInstalled && isIOS && (
            <button
              onClick={() => setShowIOSModal(true)}
              className={actionBtnClasses}
            >
              <Smartphone className="h-3.5 w-3.5" />
              iOS
            </button>
          )}

          <button
            onClick={onOpenCharts}
            className={actionBtnClasses}
          >
            <BarChart3 className="h-4 w-4 text-emerald-500" />
            Charts
          </button>

          {onOpenAIAnalysis && (
            <button
              onClick={onOpenAIAnalysis}
              className="flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-purple-600 to-indigo-600 px-3 py-1.5 text-xs font-bold text-white shadow-sm hover:from-purple-500 hover:to-indigo-500 transition"
              title="Open Gemini AI Data Analysis & Insights"
            >
              <Sparkles className="h-4 w-4 text-amber-300 animate-pulse" />
              <span>AI Analysis</span>
            </button>
          )}

          {onOpenSimulation && (
            <button
              onClick={onOpenSimulation}
              className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-bold border transition ${
                isDark 
                  ? 'bg-indigo-950/40 text-indigo-400 border-indigo-800/60 hover:bg-indigo-900/50 hover:border-indigo-500' 
                  : 'bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100'
              }`}
              title="Open Collaboration & Chaos Simulation Studio (Test Concurrent Writes, Convergence & Offline Replay)"
            >
              <Activity className="h-3.5 w-3.5 text-indigo-400 animate-pulse" />
              <span>Simulator</span>
            </button>
          )}

          <button
            onClick={onOpenPlugins}
            className={actionBtnClasses}
          >
            <Cpu className="h-4 w-4 text-indigo-500" />
            Macros
          </button>

          <button
            onClick={onOpenHistory}
            className={actionBtnClasses}
          >
            <History className="h-4 w-4 text-sky-500" />
            Log
          </button>

          <label className={`flex cursor-pointer items-center gap-1.5 ${actionBtnClasses}`}>
            <Upload className="h-4 w-4 text-amber-500" />
            Import
            <input type="file" accept=".csv" onChange={onImportCSV} className="hidden" />
          </label>

          <button
            onClick={onExportCSV}
            className={actionBtnClasses}
          >
            <Download className="h-4 w-4 text-emerald-500" />
            Export
          </button>

          <button
            onClick={onOpenShare}
            className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-emerald-500 transition"
          >
            <Share2 className="h-4 w-4" />
            Share
          </button>

          {/* User Profile & Logout */}
          {user && (
            <div className={`flex items-center gap-2 pl-2 border-l ${isDark ? 'border-slate-800' : 'border-slate-200'}`}>
              <img 
                src={user.photoURL || `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(user.displayName || user.email || 'User')}`} 
                alt="User" 
                className="h-7 w-7 rounded-full border border-emerald-500 object-cover" 
              />
              <button
                onClick={handleLogout}
                title="Sign out of OmniSheet Pro"
                className={`flex items-center rounded-lg p-1.5 border transition ${
                  isDark 
                    ? 'bg-slate-800 text-slate-300 hover:bg-red-950/60 hover:text-red-400 border-slate-700 hover:border-red-800/60' 
                    : 'bg-slate-100 text-slate-600 hover:bg-red-50 hover:text-red-600 border-slate-200'
                }`}
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>
      </div>

      {showIOSModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className={`w-full max-w-sm rounded-2xl p-6 shadow-2xl border ${
            isDark ? 'bg-slate-900 border-slate-800 text-slate-100' : 'bg-white border-slate-200 text-slate-800'
          }`}>
            <h3 className="text-lg font-bold">Install on iPhone / iPad</h3>
            <p className="mt-2 text-sm text-slate-400">
              1. Tap the <strong>Share</strong> button in Safari toolbar.<br />
              2. Scroll down and tap <strong className="text-emerald-500">Add to Home Screen</strong>.
            </p>
            <button
              onClick={() => setShowIOSModal(false)}
              className={`mt-6 w-full rounded-xl py-2.5 text-sm font-semibold transition ${
                isDark ? 'bg-slate-800 hover:bg-slate-700 text-white' : 'bg-slate-100 hover:bg-slate-200 text-slate-900'
              }`}
            >
              Close
            </button>
          </div>
        </div>
      )}
    </header>
  );
};
