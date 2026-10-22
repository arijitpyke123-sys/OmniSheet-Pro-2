import React, { useState, useEffect } from 'react';
import { 
  FileSpreadsheet, 
  Plus, 
  Search, 
  Clock, 
  Trash2, 
  LogOut, 
  Smartphone, 
  Sparkles, 
  TrendingUp, 
  Kanban, 
  DollarSign, 
  Layers, 
  FolderOpen, 
  ArrowRight,
  Sun,
  Moon,
  Zap,
  ShieldCheck,
  Rocket,
  Users,
  Eye,
  Edit3,
  MessageSquare,
  Share2,
  Lock
} from 'lucide-react';
import { 
  SpreadsheetMeta, 
  listSpreadsheets, 
  listSharedSpreadsheets,
  createNewSpreadsheet, 
  deleteSpreadsheet,
  syncUserProfile,
  CollaboratorRole
} from '../services/firestoreService';
import { usePWAInstall, useOnlineStatus } from '../hooks/usePWA';
import { SheetCells } from '../utils/formulaEngine';
import { QuotaStatus } from '../utils/rateLimiter';

interface DashboardProps {
  user: any;
  onOpenSpreadsheet: (sheetId: string) => void;
  onSignOut: () => void;
  theme?: 'dark' | 'light';
  onToggleTheme?: () => void;
  onOpenPlanQuota?: () => void;
  quotaStatus?: QuotaStatus;
  onOpenRenderDeploy?: () => void;
}

interface TemplateItem {
  id: string;
  title: string;
  subtitle: string;
  icon: any;
  color: string;
  initialData: {
    sheetNames: string[];
    sheets: Record<string, SheetCells>;
  };
}

const TEMPLATES: TemplateItem[] = [
  {
    id: 'blank',
    title: 'Blank Spreadsheet',
    subtitle: 'Start with clean grid',
    icon: Plus,
    color: 'from-emerald-500 to-teal-600',
    initialData: {
      sheetNames: ['Sheet1', 'Sheet2'],
      sheets: { Sheet1: {}, Sheet2: {} }
    }
  },
  {
    id: 'financial',
    title: 'Quarterly Financial Model',
    subtitle: 'Revenue, margins & projections',
    icon: TrendingUp,
    color: 'from-blue-500 to-indigo-600',
    initialData: {
      sheetNames: ['Q1-Q2 Forecast', 'Summary'],
      sheets: {
        'Q1-Q2 Forecast': {
          'A1': { value: 'Revenue Stream' },
          'B1': { value: 'Q1 Target' },
          'C1': { value: 'Q2 Target' },
          'D1': { value: 'Total', formula: '=B1+C1' },
          'A2': { value: 'Enterprise SaaS' },
          'B2': { value: '120000' },
          'C2': { value: '145000' },
          'D2': { formula: '=B2+C2' },
          'A3': { value: 'AI API Usage' },
          'B3': { value: '45000' },
          'C3': { value: '62000' },
          'D3': { formula: '=B3+C3' },
          'A4': { value: 'Support Packages' },
          'B4': { value: '15000' },
          'C4': { value: '18000' },
          'D4': { formula: '=B4+C4' },
          'A5': { value: 'Total Gross' },
          'B5': { formula: '=SUM(B2:B4)' },
          'C5': { formula: '=SUM(C2:C4)' },
          'D5': { formula: '=SUM(D2:D4)' },
        },
        'Summary': {
          'A1': { value: 'Metric' },
          'B1': { value: 'Value' },
          'A2': { value: 'ARR Run Rate' },
          'B2': { value: '890000' },
          'A3': { value: 'YoY Growth' },
          'B3': { value: '148%' },
        }
      }
    }
  },
  {
    id: 'project_tracker',
    title: 'Project Sprint & Tasks',
    subtitle: 'Track sprint deliverables',
    icon: Kanban,
    color: 'from-amber-500 to-orange-600',
    initialData: {
      sheetNames: ['Sprint 14', 'Backlog'],
      sheets: {
        'Sprint 14': {
          'A1': { value: 'Task Name' },
          'B1': { value: 'Owner' },
          'C1': { value: 'Status' },
          'D1': { value: 'Story Points' },
          'A2': { value: 'Implement Multi-Cell Range Select' },
          'B2': { value: 'Arijit P.' },
          'C2': { value: 'In Progress' },
          'D2': { value: '8' },
          'A3': { value: 'Dark and Light Theme Toggle' },
          'B3': { value: 'Sarah L.' },
          'C3': { value: 'Review' },
          'D3': { value: '5' },
          'A4': { value: 'PWA Service Worker Offline Cache' },
          'B4': { value: 'David K.' },
          'C4': { value: 'Done' },
          'D4': { value: '3' },
          'A5': { value: 'Total Points' },
          'D5': { formula: '=SUM(D2:D4)' },
        },
        'Backlog': {}
      }
    }
  },
  {
    id: 'budget',
    title: 'Monthly Operating Budget',
    subtitle: 'Expenses, variance & budget',
    icon: DollarSign,
    color: 'from-purple-500 to-pink-600',
    initialData: {
      sheetNames: ['October 2026', 'YTD'],
      sheets: {
        'October 2026': {
          'A1': { value: 'Department' },
          'B1': { value: 'Budget' },
          'C1': { value: 'Actual' },
          'D1': { value: 'Variance', formula: '=B1-C1' },
          'A2': { value: 'Engineering & Cloud' },
          'B2': { value: '45000' },
          'C2': { value: '41200' },
          'D2': { formula: '=B2-C2' },
          'A3': { value: 'Marketing & Growth' },
          'B3': { value: '25000' },
          'C3': { value: '27400' },
          'D3': { formula: '=B2-C2' },
          'A4': { value: 'Operations & Legal' },
          'B4': { value: '12000' },
          'C4': { value: '11500' },
          'D4': { formula: '=B4-C4' },
          'A5': { value: 'Total Expenses' },
          'B5': { formula: '=SUM(B2:B4)' },
          'C5': { formula: '=SUM(C2:C4)' },
          'D5': { formula: '=SUM(D2:D4)' },
        },
        'YTD': {}
      }
    }
  }
];

export const Dashboard: React.FC<DashboardProps> = ({ 
  user, 
  onOpenSpreadsheet, 
  onSignOut,
  theme = 'dark',
  onToggleTheme,
  onOpenPlanQuota,
  quotaStatus,
  onOpenRenderDeploy,
}) => {
  const [spreadsheets, setSpreadsheets] = useState<SpreadsheetMeta[]>([]);
  const [sharedSpreadsheets, setSharedSpreadsheets] = useState<SpreadsheetMeta[]>([]);
  const [activeTab, setActiveTab] = useState<'all' | 'owned' | 'shared'>('all');
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [creating, setCreating] = useState(false);
  const { isInstallable, isInstalled, install } = usePWAInstall();
  const isOnline = useOnlineStatus();
  const isDark = theme === 'dark';

  const fetchSheets = async () => {
    setLoading(true);
    try {
      if (user?.uid) {
        await syncUserProfile(user);
      }

      const [ownedList, sharedList] = await Promise.all([
        listSpreadsheets(user?.uid || 'user'),
        listSharedSpreadsheets(user)
      ]);

      if (ownedList.length === 0 && user?.uid) {
        // Auto-seed a user-specific starter sheet so each user has their own sheet
        await createNewSpreadsheet(
          `${user.displayName || 'Personal'} Financial Plan`,
          user.uid,
          user.displayName || user.email?.split('@')[0] || 'User',
          TEMPLATES[1].initialData,
          user.email
        );
        const refreshedOwned = await listSpreadsheets(user.uid);
        setSpreadsheets(refreshedOwned);
      } else {
        setSpreadsheets(ownedList);
      }

      setSharedSpreadsheets(sharedList);
    } catch (err) {
      console.warn('Load sheets list warning:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSheets();
  }, [user]);

  const handleCreateFromTemplate = async (tmpl: typeof TEMPLATES[0]) => {
    setCreating(true);
    try {
      const newId = await createNewSpreadsheet(
        tmpl.id === 'blank' ? 'Untitled Spreadsheet' : tmpl.title,
        user.uid,
        user.displayName || user.email?.split('@')[0] || 'User',
        tmpl.initialData,
        user.email
      );
      onOpenSpreadsheet(newId);
    } catch (e) {
      console.error('Failed to create sheet:', e);
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (confirm('Are you sure you want to delete this spreadsheet from Firestore?')) {
      await deleteSpreadsheet(id, user?.uid);
      setSpreadsheets(prev => prev.filter(s => s.id !== id));
    }
  };

  const filterSheetList = (list: SpreadsheetMeta[]) => {
    return list.filter(s => s.title.toLowerCase().includes(searchQuery.toLowerCase()));
  };

  const filteredOwned = filterSheetList(spreadsheets);
  const filteredShared = filterSheetList(sharedSpreadsheets);

  const renderRoleBadge = (role?: CollaboratorRole) => {
    switch (role) {
      case 'owner':
        return (
          <span className="flex items-center gap-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 px-2 py-0.5 text-[10px] font-bold text-emerald-400">
            <ShieldCheck className="h-3 w-3" /> Owner
          </span>
        );
      case 'editor':
        return (
          <span className="flex items-center gap-1 rounded-full bg-blue-500/10 border border-blue-500/30 px-2 py-0.5 text-[10px] font-bold text-blue-400">
            <Edit3 className="h-3 w-3" /> Editor (Full Edit)
          </span>
        );
      case 'commenter':
        return (
          <span className="flex items-center gap-1 rounded-full bg-amber-500/10 border border-amber-500/30 px-2 py-0.5 text-[10px] font-bold text-amber-400">
            <MessageSquare className="h-3 w-3" /> Commenter
          </span>
        );
      case 'viewer':
      default:
        return (
          <span className="flex items-center gap-1 rounded-full bg-purple-500/10 border border-purple-500/30 px-2 py-0.5 text-[10px] font-bold text-purple-400">
            <Eye className="h-3 w-3" /> Viewer (Read Only)
          </span>
        );
    }
  };

  return (
    <div className={`min-h-screen w-screen font-sans flex flex-col selection:bg-emerald-500 selection:text-white transition-colors ${
      isDark ? 'bg-slate-950 text-slate-100' : 'bg-slate-50 text-slate-900'
    }`}>
      {/* Top Header */}
      <header className={`sticky top-0 z-30 flex items-center justify-between px-6 py-3.5 backdrop-blur-md border-b shadow-xs transition-colors ${
        isDark ? 'bg-slate-900/95 border-slate-800' : 'bg-white/95 border-slate-200'
      }`}>
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-500 text-white shadow-md shadow-emerald-950/30">
            <FileSpreadsheet className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-base font-bold tracking-tight flex items-center gap-2">
              OmniSheet <span className="text-emerald-500 font-black">Pro</span>
            </h1>
            <p className={`text-[11px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Collaborative Sheets Dashboard</p>
          </div>
        </div>

        {/* Search Bar */}
        <div className="hidden md:flex flex-1 max-w-md mx-8">
          <div className="relative w-full">
            <Search className="absolute left-3.5 top-2.5 h-4 w-4 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search your spreadsheets and shared sheets in Firestore..."
              className={`w-full rounded-xl py-2 pl-10 pr-4 text-xs placeholder-slate-400 border focus:outline-none focus:ring-2 focus:ring-emerald-500 transition ${
                isDark 
                  ? 'bg-slate-950 text-white border-slate-800' 
                  : 'bg-slate-100 text-slate-900 border-slate-200 focus:bg-white'
              }`}
            />
          </div>
        </div>

        {/* Right Section */}
        <div className="flex items-center gap-3">
          {/* Tenant Quotas & Subscription Plan */}
          {onOpenPlanQuota && quotaStatus && (
            <button
              onClick={onOpenPlanQuota}
              className={`flex items-center gap-2 rounded-xl px-3 py-1.5 text-xs font-semibold border transition shadow-xs ${
                !quotaStatus.allowed || quotaStatus.remaining <= 0
                  ? 'bg-red-500/20 text-red-400 border-red-500/40 hover:bg-red-500/30 animate-pulse'
                  : quotaStatus.percentUsed >= 80
                  ? 'bg-amber-500/20 text-amber-400 border-amber-500/40 hover:bg-amber-500/30'
                  : isDark
                  ? 'bg-slate-800 text-slate-200 border-slate-700 hover:border-emerald-500/60 hover:bg-slate-700'
                  : 'bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100'
              }`}
              title="Manage Tenant Plan & Netflix-Style Quotas"
            >
              <Zap className="h-4 w-4 text-emerald-500" />
              <div className="flex flex-col text-left leading-none">
                <span className="font-mono text-xs">{quotaStatus.remaining} / {quotaStatus.total} edits</span>
                <span className="text-[9.5px] opacity-75">{quotaStatus.plan.name} (₹{quotaStatus.plan.priceRupees})</span>
              </div>
            </button>
          )}

          {/* Theme Toggle (Dark / Light) */}
          {onToggleTheme && (
            <button
              onClick={onToggleTheme}
              className={`flex items-center justify-center rounded-xl p-2 border transition ${
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
              className={`flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold border transition ${
                isDark 
                  ? 'bg-sky-950/40 text-sky-400 border-sky-800/60 hover:bg-sky-900/50 hover:border-sky-500 shadow-sm' 
                  : 'bg-sky-50 text-sky-700 border-sky-200 hover:bg-sky-100 shadow-sm'
              }`}
              title="Deploy OmniSheet Pro to Render (Free Static Site or Node Web Service)"
            >
              <Rocket className="h-4 w-4 text-sky-400" />
              <span className="hidden md:inline">Deploy to Render</span>
            </button>
          )}

          {!isInstalled && isInstallable && (
            <button
              onClick={install}
              className="hidden sm:flex items-center gap-1.5 rounded-lg bg-emerald-600/20 px-3 py-1.5 text-xs font-semibold text-emerald-500 border border-emerald-500/30 hover:bg-emerald-600/30 transition"
            >
              <Smartphone className="h-3.5 w-3.5" />
              Install PWA
            </button>
          )}

          {/* User profile & Logout */}
          <div className={`flex items-center gap-2 pl-2 border-l ${isDark ? 'border-slate-800' : 'border-slate-200'}`}>
            <img
              src={user.photoURL || `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(user.displayName || user.email || 'User')}`}
              alt="User"
              className="h-8 w-8 rounded-full border border-emerald-500 object-cover"
            />
            <div className="hidden sm:block text-left">
              <p className="text-xs font-semibold leading-tight">
                {user.displayName || user.email?.split('@')[0]}
              </p>
              <p className={`text-[10px] leading-tight truncate max-w-[140px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                {user.email}
              </p>
            </div>
            <button
              onClick={onSignOut}
              title="Sign Out"
              className={`flex items-center gap-1 rounded-lg p-2 border transition ml-1 ${
                isDark 
                  ? 'bg-slate-800 text-slate-300 hover:bg-red-950/60 hover:text-red-400 border-slate-700 hover:border-red-800/60' 
                  : 'bg-slate-100 text-slate-600 hover:bg-red-50 hover:text-red-600 border-slate-200'
              }`}
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-7xl mx-auto w-full px-6 py-8 space-y-8">
        {/* Tenant Quotas Banner */}
        {quotaStatus && (
          <div className={`flex flex-wrap items-center justify-between gap-4 p-4 rounded-2xl border shadow-sm ${
            isDark 
              ? 'bg-gradient-to-r from-slate-900 via-slate-900/90 to-emerald-950/30 border-slate-800' 
              : 'bg-gradient-to-r from-emerald-50 via-teal-50 to-white border-emerald-100'
          }`}>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-500">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-emerald-500">
                    Tenant Rate Limiting & Quotas (Netflix-Style)
                  </h3>
                  <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full border ${
                    isDark ? 'bg-slate-800 border-slate-700 text-slate-300' : 'bg-white border-emerald-200 text-emerald-800'
                  }`}>
                    {quotaStatus.plan.name} (₹{quotaStatus.plan.priceRupees}/mo)
                  </span>
                </div>
                <p className={`text-xs mt-0.5 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                  Your tenant has <strong>{quotaStatus.remaining}</strong> of {quotaStatus.total} edits remaining this hour.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2.5">
              <button
                onClick={onOpenPlanQuota}
                className="flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-1.5 text-xs font-bold text-white shadow-sm hover:bg-emerald-500 transition"
              >
                <Zap className="h-3.5 w-3.5" />
                Manage Quotas & Upgrade Plan
              </button>
            </div>
          </div>
        )}

        {/* Template Gallery: Start a new spreadsheet */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className={`text-xs font-bold uppercase tracking-wider flex items-center gap-2 ${
              isDark ? 'text-slate-400' : 'text-slate-500'
            }`}>
              <Sparkles className="h-4 w-4 text-emerald-500" />
              Start a New Spreadsheet
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {TEMPLATES.map((tmpl) => {
              const IconComp = tmpl.icon;
              return (
                <button
                  key={tmpl.id}
                  disabled={creating}
                  onClick={() => handleCreateFromTemplate(tmpl)}
                  className={`flex flex-col text-left rounded-2xl border p-5 transition-all duration-200 group active:scale-[0.99] disabled:opacity-50 ${
                    isDark 
                      ? 'bg-slate-900 border-slate-800 hover:border-emerald-500/60 hover:shadow-xl hover:shadow-emerald-950/30' 
                      : 'bg-white border-slate-200 hover:border-emerald-500 hover:shadow-lg shadow-xs'
                  }`}
                >
                  <div className={`flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br ${tmpl.color} text-white shadow-md mb-4 group-hover:scale-105 transition-transform`}>
                    <IconComp className="h-6 w-6" />
                  </div>
                  <h3 className="text-sm font-bold group-hover:text-emerald-500 transition">
                    {tmpl.title}
                  </h3>
                  <p className={`text-xs mt-1 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                    {tmpl.subtitle}
                  </p>
                </button>
              );
            })}
          </div>
        </section>

        {/* Navigation Tabs (All / Owned / Shared) */}
        <div className="flex items-center justify-between border-b pb-3 border-slate-800/80">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveTab('all')}
              className={`flex items-center gap-2 rounded-xl px-3.5 py-1.5 text-xs font-bold transition ${
                activeTab === 'all'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : isDark ? 'text-slate-400 hover:text-white hover:bg-slate-900' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <span>All Spreadsheets</span>
              <span className="rounded-full px-1.5 py-0.2 bg-black/20 text-[10px]">
                {spreadsheets.length + sharedSpreadsheets.length}
              </span>
            </button>

            <button
              onClick={() => setActiveTab('owned')}
              className={`flex items-center gap-2 rounded-xl px-3.5 py-1.5 text-xs font-bold transition ${
                activeTab === 'owned'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : isDark ? 'text-slate-400 hover:text-white hover:bg-slate-900' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <Layers className="h-3.5 w-3.5" />
              <span>Owned by You</span>
              <span className="rounded-full px-1.5 py-0.2 bg-black/20 text-[10px]">
                {spreadsheets.length}
              </span>
            </button>

            <button
              onClick={() => setActiveTab('shared')}
              className={`flex items-center gap-2 rounded-xl px-3.5 py-1.5 text-xs font-bold transition ${
                activeTab === 'shared'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : isDark ? 'text-slate-400 hover:text-white hover:bg-slate-900' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <Users className="h-3.5 w-3.5 text-sky-400" />
              <span>Shared with You</span>
              <span className="rounded-full px-1.5 py-0.2 bg-sky-500/20 text-sky-300 text-[10px]">
                {sharedSpreadsheets.length}
              </span>
            </button>
          </div>

          <button
            onClick={fetchSheets}
            className={`text-xs transition hover:text-emerald-500 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}
          >
            Refresh Firestore Data
          </button>
        </div>

        {/* SECTION 1: SHARED WITH YOU (Prominently displayed) */}
        {(activeTab === 'all' || activeTab === 'shared') && (
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h2 className={`text-xs font-bold uppercase tracking-wider flex items-center gap-2 ${
                  isDark ? 'text-sky-400' : 'text-sky-600'
                }`}>
                  <Share2 className="h-4 w-4" />
                  Shared with You (RBAC Access)
                </h2>
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold border ${
                  isDark ? 'bg-sky-950/60 text-sky-300 border-sky-800/60' : 'bg-sky-50 text-sky-700 border-sky-200'
                }`}>
                  {sharedSpreadsheets.length} shared
                </span>
              </div>
            </div>

            {loading ? (
              <div className="py-8 text-center text-xs text-slate-400">Loading shared documents...</div>
            ) : filteredShared.length === 0 ? (
              activeTab === 'shared' || sharedSpreadsheets.length === 0 ? (
                <div className={`flex flex-col items-center justify-center rounded-2xl border border-dashed py-10 px-6 text-center ${
                  isDark ? 'bg-slate-900/40 border-slate-800' : 'bg-white border-slate-300'
                }`}>
                  <Users className="h-10 w-10 text-slate-500 mb-2.5" />
                  <h3 className="text-sm font-bold">No spreadsheets shared with you yet</h3>
                  <p className={`text-xs max-w-md mt-1 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                    When other team members or Firestore users invite you to their spreadsheets, they will immediately appear in this section with your assigned RBAC role (<strong>Editor</strong>, <strong>Viewer</strong>, or <strong>Commenter</strong>).
                  </p>
                </div>
              ) : null
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {filteredShared.map((sheet) => (
                  <div
                    key={sheet.id}
                    onClick={() => onOpenSpreadsheet(sheet.id)}
                    className={`flex flex-col justify-between rounded-2xl border cursor-pointer transition-all duration-200 p-4 group ${
                      isDark 
                        ? 'bg-gradient-to-b from-slate-900 to-slate-900/90 border-sky-900/40 hover:border-sky-500/80 hover:shadow-xl hover:shadow-sky-950/30' 
                        : 'bg-white border-sky-200 hover:border-sky-500 hover:shadow-md shadow-xs'
                    }`}
                  >
                    <div>
                      {/* Top Header with RBAC Access Badge */}
                      <div className="flex items-center justify-between mb-3">
                        <div className={`flex h-9 w-9 items-center justify-center rounded-lg border ${
                          isDark 
                            ? 'bg-sky-950/80 text-sky-400 border-sky-800/50' 
                            : 'bg-sky-50 text-sky-600 border-sky-200'
                        }`}>
                          <Share2 className="h-5 w-5" />
                        </div>
                        
                        {/* RBAC Role Tag */}
                        {renderRoleBadge(sheet.myRole)}
                      </div>

                      <h3 className="text-sm font-bold group-hover:text-sky-400 transition line-clamp-1">
                        {sheet.title}
                      </h3>
                      
                      <p className={`text-[11px] mt-1 flex items-center gap-1.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                        <span>Shared by <strong>{sheet.ownerName || sheet.ownerEmail?.split('@')[0] || 'Teammate'}</strong></span>
                      </p>
                    </div>

                    {/* Bottom Footer Info */}
                    <div className={`pt-3.5 mt-3.5 border-t flex items-center justify-between text-[11px] ${
                      isDark ? 'border-slate-800/80 text-slate-400' : 'border-slate-100 text-slate-500'
                    }`}>
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {new Date(sheet.updatedAt).toLocaleDateString()}
                      </span>
                      <span className="flex items-center gap-1 font-semibold text-sky-400 group-hover:translate-x-0.5 transition-transform">
                        Open Sheet <ArrowRight className="h-3 w-3" />
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {/* SECTION 2: OWNED BY YOU */}
        {(activeTab === 'all' || activeTab === 'owned') && (
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h2 className={`text-xs font-bold uppercase tracking-wider flex items-center gap-2 ${
                  isDark ? 'text-slate-400' : 'text-slate-500'
                }`}>
                  <Layers className="h-4 w-4 text-emerald-500" />
                  Your Spreadsheets (Owned by You)
                </h2>
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold border ${
                  isDark ? 'bg-slate-800 text-slate-300 border-slate-700' : 'bg-slate-100 text-slate-700 border-slate-200'
                }`}>
                  {spreadsheets.length}
                </span>
              </div>
            </div>

            {loading ? (
              <div className="flex flex-col items-center justify-center py-16 gap-3 text-slate-400">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
                <p className="text-xs">Loading your spreadsheets from Firestore...</p>
              </div>
            ) : filteredOwned.length === 0 ? (
              <div className={`flex flex-col items-center justify-center rounded-2xl border border-dashed py-16 px-6 text-center ${
                isDark ? 'bg-slate-900/40 border-slate-800' : 'bg-white border-slate-300'
              }`}>
                <FolderOpen className="h-12 w-12 text-slate-400 mb-3" />
                <h3 className="text-base font-bold">No personal spreadsheets found</h3>
                <p className={`text-xs max-w-sm mt-1 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                  {searchQuery ? `No results match "${searchQuery}".` : 'Create your first sheet using the template gallery above.'}
                </p>
                <button
                  onClick={() => handleCreateFromTemplate(TEMPLATES[0])}
                  className="mt-5 flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-semibold text-white shadow-md hover:bg-emerald-500 transition"
                >
                  <Plus className="h-4 w-4" />
                  Create Blank Spreadsheet
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {filteredOwned.map((sheet) => (
                  <div
                    key={sheet.id}
                    onClick={() => onOpenSpreadsheet(sheet.id)}
                    className={`flex flex-col justify-between rounded-2xl border cursor-pointer transition-all duration-200 p-4 group ${
                      isDark 
                        ? 'bg-slate-900 border-slate-800 hover:border-emerald-500/50 hover:bg-slate-900/90 hover:shadow-xl hover:shadow-emerald-950/20' 
                        : 'bg-white border-slate-200 hover:border-emerald-500 hover:shadow-md shadow-xs'
                    }`}
                  >
                    {/* Top Preview Card */}
                    <div>
                      <div className="flex items-center justify-between mb-3">
                        <div className={`flex h-9 w-9 items-center justify-center rounded-lg border ${
                          isDark 
                            ? 'bg-emerald-950/80 text-emerald-400 border-emerald-800/50' 
                            : 'bg-emerald-50 text-emerald-600 border-emerald-200'
                        }`}>
                          <FileSpreadsheet className="h-5 w-5" />
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="flex items-center gap-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 px-2 py-0.5 text-[10px] font-bold text-emerald-400">
                            <ShieldCheck className="h-3 w-3" /> Owner
                          </span>
                          <button
                            onClick={(e) => handleDelete(e, sheet.id)}
                            title="Delete spreadsheet"
                            className="rounded-lg p-1.5 text-slate-400 hover:bg-red-500/20 hover:text-red-400 transition"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>

                      <h3 className="text-sm font-bold group-hover:text-emerald-500 transition line-clamp-1">
                        {sheet.title}
                      </h3>
                      <p className={`text-[11px] mt-0.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                        {sheet.sheetCount || 2} sheets • Firestore Cloud
                      </p>
                    </div>

                    {/* Bottom Footer Info */}
                    <div className={`pt-4 mt-4 border-t flex items-center justify-between text-[11px] ${
                      isDark ? 'border-slate-800/80 text-slate-400' : 'border-slate-100 text-slate-500'
                    }`}>
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {new Date(sheet.updatedAt).toLocaleDateString()}
                      </span>
                      <span className="flex items-center gap-1 font-semibold text-emerald-500 group-hover:translate-x-0.5 transition-transform">
                        Open <ArrowRight className="h-3 w-3" />
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}
      </main>
    </div>
  );
};
