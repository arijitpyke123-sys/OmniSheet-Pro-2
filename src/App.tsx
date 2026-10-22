import React, { useState, useEffect, useRef } from 'react';
import { AuthPage } from './components/AuthPage';
import { Dashboard } from './components/Dashboard';
import { Navbar } from './components/Navbar';
import { Toolbar } from './components/Toolbar';
import { FormulaBar } from './components/FormulaBar';
import { SpreadsheetGrid } from './components/SpreadsheetGrid';
import { ChartModal } from './components/ChartModal';
import { ShareModal } from './components/ShareModal';
import { PluginModal } from './components/PluginModal';
import { VersionHistoryModal } from './components/VersionHistoryModal';
import { PlanQuotaModal } from './components/PlanQuotaModal';
import { RenderDeployModal } from './components/RenderDeployModal';
import { ImageInsertModal } from './components/ImageInsertModal';
import { AIDataAnalysisModal } from './components/AIDataAnalysisModal';
import { SimulationModal } from './components/SimulationModal';
import { OfflineIndicator } from './components/OfflineIndicator';
import { 
  SheetCells, 
  getCellsInRange, 
  parseCellCoord, 
  cellCoordToString,
  colIndexToLetter,
  shiftCellsOnRowInsert,
  shiftCellsOnRowDelete,
  shiftCellsOnColInsert,
  shiftCellsOnColDelete,
  extractRangeToMatrix
} from './utils/formulaEngine';
import { 
  globalRangeCache, 
  fetchSpreadsheetRange, 
  executeBatchOperation, 
  ViewportRange 
} from './utils/rangeManager';
import { 
  tenantRateLimiter, 
  TENANT_PLANS, 
  QuotaStatus 
} from './utils/rateLimiter';
import { 
  AlertTriangle, 
  CheckCircle2, 
  Zap, 
  RotateCcw, 
  TrendingUp, 
  X 
} from 'lucide-react';
import { auth } from './lib/firebase';
import { onAuthStateChanged, signOut, getRedirectResult } from 'firebase/auth';
import { 
  saveSpreadsheetToFirestore, 
  loadSpreadsheetFromFirestore, 
  recordAuditLog,
  subscribeToSpreadsheetUpdates,
  subscribeToCollaboratorPresence,
  updateCollaboratorPresence,
  removeCollaboratorPresence,
  UserPresence,
  SpreadsheetCollaborator,
  CollaboratorRole,
  addCollaboratorToSpreadsheet,
  removeCollaboratorFromSpreadsheet,
  syncUserProfile
} from './services/firestoreService';
import Papa from 'papaparse';

export default function App() {
  const [user, setUser] = useState<any>(() => {
    try {
      const saved = localStorage.getItem('omnisheet_active_user');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });
  const [authChecking, setAuthChecking] = useState(true);

  // Theme state: dark / light
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    try {
      return (localStorage.getItem('omnisheet_theme') as 'dark' | 'light') || 'dark';
    } catch {
      return 'dark';
    }
  });

  const handleToggleTheme = () => {
    setTheme((prev) => {
      const next = prev === 'dark' ? 'light' : 'dark';
      try {
        localStorage.setItem('omnisheet_theme', next);
      } catch {}
      return next;
    });
  };

  // activeSpreadsheetId: null means the user is on the Sheets Dashboard!
  const [activeSpreadsheetId, setActiveSpreadsheetId] = useState<string | null>(null);

  const [title, setTitle] = useState('Untitled Spreadsheet');
  const [activeRole, setActiveRole] = useState<CollaboratorRole>('owner');

  const [sheets, setSheets] = useState<string[]>(['Sheet1', 'Sheet2']);
  const [activeSheet, setActiveSheet] = useState<string>('Sheet1');
  
  // Sheet data storage per sheet name
  const [allSheetCells, setAllSheetCells] = useState<Record<string, SheetCells>>({
    Sheet1: {},
    Sheet2: {},
  });

  // Single cell vs Multi-cell range selection
  const [selectedCell, setSelectedCell] = useState('A1');
  const [selectionRange, setSelectionRange] = useState<{ start: string; end: string } | null>(null);
  const [formulaValue, setFormulaValue] = useState('');
  const [rowCount, setRowCount] = useState(100000); // 100,000 virtual rows scalable grid
  const [colCount, setColCount] = useState(50);     // 50 columns (A through AX)
  const [isRangeLoading, setIsRangeLoading] = useState(false);
  const [documentRevision, setDocumentRevision] = useState(1);
  const [copiedRange, setCopiedRange] = useState<{ start: string; end: string } | null>(null);

  // Firestore Sync & Real-time Concurrent Collaboration State
  const [isSaving, setIsSaving] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [collaboratorsPresence, setCollaboratorsPresence] = useState<UserPresence[]>([]);
  const saveTimeoutRef = useRef<any>(null);
  const isLocalMutationRef = useRef(false);

  // Modals state
  const [isChartsOpen, setIsChartsOpen] = useState(false);
  const [isShareOpen, setIsShareOpen] = useState(false);
  const [isPluginsOpen, setIsPluginsOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isPlanQuotaOpen, setIsPlanQuotaOpen] = useState(false);
  const [isRenderDeployOpen, setIsRenderDeployOpen] = useState(false);
  const [isImageModalOpen, setIsImageModalOpen] = useState(false);
  const [imageTargetCell, setImageTargetCell] = useState<string>('A1');
  const [isAIAnalysisOpen, setIsAIAnalysisOpen] = useState(false);
  const [isSimulationOpen, setIsSimulationOpen] = useState(false);

  // Tenant Plan & Rate Limiting state (Netflix-style rolling quota)
  const [tenantPlanId, setTenantPlanId] = useState<string>(() => {
    try {
      return localStorage.getItem('omnisheet_tenant_plan_' + (user?.uid || 'guest')) || 'basic_50';
    } catch {
      return 'basic_50';
    }
  });
  const [quotaStatus, setQuotaStatus] = useState<QuotaStatus>(() => 
    tenantRateLimiter.getQuotaStatus(user?.uid || 'guest', tenantPlanId)
  );
  const [quotaAlertMessage, setQuotaAlertMessage] = useState<string | null>(null);
  const [planUpgradeToast, setPlanUpgradeToast] = useState<string | null>(null);

  // Sync tenant plan when user logs in
  useEffect(() => {
    if (user?.uid) {
      const savedPlan = localStorage.getItem('omnisheet_tenant_plan_' + user.uid) || 'basic_50';
      setTenantPlanId(savedPlan);
      setQuotaStatus(tenantRateLimiter.getQuotaStatus(user.uid, savedPlan));
    }
  }, [user]);

  // Periodic refresh of quota status (sliding window token replenishment)
  useEffect(() => {
    const currentTenant = user?.uid || 'guest';
    const interval = setInterval(() => {
      setQuotaStatus(tenantRateLimiter.getQuotaStatus(currentTenant, tenantPlanId));
    }, 8000);
    return () => clearInterval(interval);
  }, [user, tenantPlanId]);

  const handleSelectPlan = (newPlanId: string) => {
    const currentTenant = user?.uid || 'guest';
    setTenantPlanId(newPlanId);
    try {
      localStorage.setItem('omnisheet_tenant_plan_' + currentTenant, newPlanId);
    } catch {}
    const newStatus = tenantRateLimiter.getQuotaStatus(currentTenant, newPlanId);
    setQuotaStatus(newStatus);
    setQuotaAlertMessage(null);
    const plan = TENANT_PLANS[newPlanId] || TENANT_PLANS.basic_50;
    setPlanUpgradeToast(`Tenant plan changed to ${plan.name} (₹${plan.priceRupees}/mo)! Your quota is now ${plan.hourlyQuota.toLocaleString()} changes/hr.`);
    setTimeout(() => setPlanUpgradeToast(null), 5000);
  };

  const handleResetQuotaDemo = () => {
    const currentTenant = user?.uid || 'guest';
    tenantRateLimiter.resetQuota(currentTenant);
    setQuotaStatus(tenantRateLimiter.getQuotaStatus(currentTenant, tenantPlanId));
    setQuotaAlertMessage(null);
  };

  const handleSimulateLimitDemo = () => {
    const currentTenant = user?.uid || 'guest';
    const plan = TENANT_PLANS[tenantPlanId] || TENANT_PLANS.basic_50;
    tenantRateLimiter.simulateUsage(currentTenant, plan.hourlyQuota);
    const status = tenantRateLimiter.getQuotaStatus(currentTenant, tenantPlanId);
    setQuotaStatus(status);
    setQuotaAlertMessage(status.error || `Rate limit reached: ${plan.hourlyQuota}/${plan.hourlyQuota} changes used.`);
  };

  // Collaborators & Audit logs
  const [collaborators, setCollaborators] = useState<SpreadsheetCollaborator[]>([
    { email: 'arijitpyke123@gmail.com', role: 'owner' },
  ]);
  const [isPublic, setIsPublic] = useState(true);
  const [auditLogs, setAuditLogs] = useState<Array<{ action: string; timestamp: string; userId: string }>>([]);

  // Compute selected target cells
  const getSelectedTargetCells = (): string[] => {
    if (selectionRange) {
      return getCellsInRange(selectionRange.start, selectionRange.end);
    }
    return [selectedCell];
  };

  const selectedTargetCells = getSelectedTargetCells();
  const selectionLabel = selectionRange && selectionRange.start !== selectionRange.end
    ? `${selectionRange.start}:${selectionRange.end}`
    : selectedCell;

  // 1. Auth observer on boot
  useEffect(() => {
    let unsubscribe = () => {};
    try {
      if (auth) {
        // Handle returning from redirect sign-in
        getRedirectResult(auth)
          .then((result) => {
            if (result?.user) {
              setUser(result.user);
              syncUserProfile(result.user);
            }
          })
          .catch((err) => {
            console.warn('Redirect auth result note:', err);
          });

        unsubscribe = onAuthStateChanged(auth, (currentUser) => {
          if (currentUser) {
            setUser(currentUser);
            syncUserProfile(currentUser);
            try {
              localStorage.setItem('omnisheet_active_user', JSON.stringify({
                uid: currentUser.uid,
                email: currentUser.email,
                displayName: currentUser.displayName,
                photoURL: currentUser.photoURL,
              }));
            } catch {}
            if (currentUser.email) {
              setCollaborators(prev => {
                if (!prev.some(c => c.email.toLowerCase() === currentUser.email!.toLowerCase())) {
                  return [...prev, { email: currentUser.email!, role: 'owner' }];
                }
                return prev;
              });
            }
          } else {
            // Not authenticated in Firebase - clear session
            setUser(null);
            localStorage.removeItem('omnisheet_active_user');
          }
          setAuthChecking(false);
        });
      } else {
        setAuthChecking(false);
      }
    } catch {
      setAuthChecking(false);
    }
    return () => unsubscribe();
  }, []);

  // 2. Load active spreadsheet and subscribe to concurrent updates
  useEffect(() => {
    if (!user || !activeSpreadsheetId) return;

    // Load initial state
    const loadData = async () => {
      try {
        const loaded = await loadSpreadsheetFromFirestore(activeSpreadsheetId);
        if (loaded) {
          if (loaded.title) setTitle(loaded.title);
          if (loaded.sheets && Object.keys(loaded.sheets).length > 0) {
            setAllSheetCells(loaded.sheets);
          }
          if (loaded.sheetNames && loaded.sheetNames.length > 0) {
            setSheets(loaded.sheetNames);
            if (!loaded.sheetNames.includes(activeSheet)) {
              setActiveSheet(loaded.sheetNames[0]);
            }
          }
          if (loaded.isPublic !== undefined) setIsPublic(loaded.isPublic);

          if (loaded.collaborators && loaded.collaborators.length > 0) {
            setCollaborators(loaded.collaborators);
          }

          // Determine current user's effective RBAC role
          const userEmail = (user.email || '').toLowerCase();
          if (user.uid === loaded.ownerId || (loaded.ownerEmail && userEmail === loaded.ownerEmail.toLowerCase())) {
            setActiveRole('owner');
          } else {
            const matched = (loaded.collaborators || []).find(
              c => (userEmail && c.email.toLowerCase() === userEmail) || (c.userId && c.userId === user.uid)
            );
            if (matched) {
              setActiveRole(matched.role);
            } else if (loaded.isPublic) {
              setActiveRole('editor');
            } else {
              setActiveRole('viewer');
            }
          }

          setLastSavedAt(new Date().toLocaleTimeString());
        }
      } catch (err) {
        console.warn('Initial load from Firestore note:', err);
      }
    };
    loadData();

    // Subscribe to live concurrent spreadsheet updates from other collaborators
    const unsubscribeSpreadsheet = subscribeToSpreadsheetUpdates(
      activeSpreadsheetId,
      (remoteData) => {
        if (!isLocalMutationRef.current) {
          setAllSheetCells(remoteData.sheets);
          if (remoteData.sheetNames && remoteData.sheetNames.length > 0) {
            setSheets(remoteData.sheetNames);
          }
          setLastSavedAt(new Date().toLocaleTimeString());
        }
      }
    );

    // Subscribe to live collaborator presence (cursors)
    const unsubscribePresence = subscribeToCollaboratorPresence(
      activeSpreadsheetId,
      user.uid,
      (activePresence) => {
        setCollaboratorsPresence(activePresence);
      }
    );

    // Initial presence ping
    updateCollaboratorPresence(activeSpreadsheetId, user, selectedCell, activeSheet);

    // Periodic presence heartbeat every 15 seconds
    const heartbeat = setInterval(() => {
      updateCollaboratorPresence(activeSpreadsheetId, user, selectedCell, activeSheet);
    }, 15000);

    return () => {
      unsubscribeSpreadsheet();
      unsubscribePresence();
      clearInterval(heartbeat);
      removeCollaboratorPresence(activeSpreadsheetId, user.uid);
    };
  }, [user, activeSpreadsheetId]);

  // 3. Update presence whenever user switches selected cell or active sheet
  useEffect(() => {
    if (user && activeSpreadsheetId) {
      updateCollaboratorPresence(activeSpreadsheetId, user, selectedCell, activeSheet);
    }
  }, [selectedCell, activeSheet, user, activeSpreadsheetId]);

  // 4. Trigger debounced Firestore save
  const triggerFirestoreSave = (
    newTitle = title,
    newSheets = allSheetCells,
    sheetList = sheets
  ) => {
    if (!user || !activeSpreadsheetId) return;
    setIsSaving(true);
    isLocalMutationRef.current = true;

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = setTimeout(async () => {
      try {
        await saveSpreadsheetToFirestore(
          activeSpreadsheetId,
          newTitle,
          user.uid,
          sheetList,
          newSheets,
          isPublic
        );
        setLastSavedAt(new Date().toLocaleTimeString());
      } catch (err) {
        console.warn('Auto-save to Firestore caught:', err);
      } finally {
        setIsSaving(false);
        setTimeout(() => {
          isLocalMutationRef.current = false;
        }, 300);
      }
    }, 800);
  };

  const handleManualSave = async () => {
    if (!user || !activeSpreadsheetId) return;
    setIsSaving(true);
    try {
      await saveSpreadsheetToFirestore(
        activeSpreadsheetId,
        title,
        user.uid,
        sheets,
        allSheetCells,
        isPublic
      );
      setLastSavedAt(new Date().toLocaleTimeString());
      recordAuditLog(activeSpreadsheetId, user.email || user.uid, 'Manual sync to Firestore');
    } catch (err) {
      console.warn('Manual save warning:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const currentCells = allSheetCells[activeSheet] || {};

  const handleCellChange = (cellKey: string, value: string, formula?: string) => {
    if (activeRole === 'viewer') {
      setQuotaAlertMessage('You have Viewer (read-only) permissions for this shared spreadsheet. Cell edits are disabled.');
      return;
    }

    const currentTenant = user?.uid || 'guest';
    const newQuota = tenantRateLimiter.consumeQuota(currentTenant, tenantPlanId, 1);
    setQuotaStatus(newQuota);

    if (!newQuota.allowed) {
      setQuotaAlertMessage(newQuota.error || 'Write rate limit reached. Upgrade your subscription plan or wait for the hourly reset.');
      return;
    }

    const updated = {
      ...allSheetCells,
      [activeSheet]: {
        ...allSheetCells[activeSheet],
        [cellKey]: {
          ...allSheetCells[activeSheet]?.[cellKey],
          value: formula ? '' : value,
          formula: formula,
        }
      }
    };

    setAllSheetCells(updated);
    triggerFirestoreSave(title, updated, sheets);

    const logEntry = {
      action: `Updated cell ${cellKey} in ${activeSheet}`,
      timestamp: new Date().toISOString(),
      userId: user?.email || 'User'
    };
    setAuditLogs(prev => [logEntry, ...prev]);
    if (activeSpreadsheetId) {
      updateCollaboratorPresence(activeSpreadsheetId, user, cellKey, activeSheet);
      recordAuditLog(activeSpreadsheetId, user?.email || 'User', logEntry.action);
    }
  };

  const handleCommitFormula = () => {
    if (formulaValue.startsWith('=')) {
      handleCellChange(selectedCell, '', formulaValue);
    } else {
      handleCellChange(selectedCell, formulaValue);
    }
  };

  // 5. Operations on Selected Cells (Multi-Cell batch formatting & clearing)
  const handleFormat = (styleKey: string, val: any) => {
    if (activeRole === 'viewer') {
      setQuotaAlertMessage('You have Viewer (read-only) permissions for this shared spreadsheet. Formatting is disabled.');
      return;
    }

    const targets = getSelectedTargetCells();
    const currentTenant = user?.uid || 'guest';
    const newQuota = tenantRateLimiter.consumeQuota(currentTenant, tenantPlanId, targets.length);
    setQuotaStatus(newQuota);

    if (!newQuota.allowed) {
      setQuotaAlertMessage(newQuota.error || 'Batch formatting exceeds your tenant quota limit.');
      return;
    }

    const updatedCurrentSheet = { ...allSheetCells[activeSheet] };

    for (const key of targets) {
      const cell = updatedCurrentSheet[key] || { value: '' };
      updatedCurrentSheet[key] = {
        ...cell,
        [styleKey]: val,
      };
    }

    const updated = {
      ...allSheetCells,
      [activeSheet]: updatedCurrentSheet
    };
    setAllSheetCells(updated);
    triggerFirestoreSave(title, updated, sheets);
  };

  const handleClearSelected = () => {
    const targets = getSelectedTargetCells();
    const currentTenant = user?.uid || 'guest';
    const newQuota = tenantRateLimiter.consumeQuota(currentTenant, tenantPlanId, targets.length);
    setQuotaStatus(newQuota);

    if (!newQuota.allowed) {
      setQuotaAlertMessage(newQuota.error || 'Batch clear exceeds your tenant quota limit.');
      return;
    }

    const updatedCurrentSheet = { ...allSheetCells[activeSheet] };

    for (const key of targets) {
      delete updatedCurrentSheet[key];
    }

    const updated = {
      ...allSheetCells,
      [activeSheet]: updatedCurrentSheet
    };
    setAllSheetCells(updated);
    triggerFirestoreSave(title, updated, sheets);

    const logEntry = {
      action: `Cleared ${targets.length} cells in ${activeSheet}`,
      timestamp: new Date().toISOString(),
      userId: user?.email || 'User'
    };
    setAuditLogs(prev => [logEntry, ...prev]);
    if (activeSpreadsheetId) {
      recordAuditLog(activeSpreadsheetId, user?.email || 'User', logEntry.action);
      executeBatchOperation({
        spreadsheetId: activeSpreadsheetId,
        sheetName: activeSheet,
        operations: [{
          type: selectionRange ? 'clear_range' : 'set_cells',
          range: selectionRange ? { start: selectionRange.start, end: selectionRange.end } : undefined,
          cells: !selectionRange ? targets.map(key => ({ key, cell: {} })) : undefined,
        }],
      }).then(res => {
        if (res && res.newRevision) {
          setDocumentRevision(res.newRevision);
          globalRangeCache.updateLocalEdits(activeSheet, {}, targets);
        }
      }).catch(err => console.warn('Batch clear server note:', err));
    }
  };

  const handleBatchPaste = async (targetTopLeft: string, matrix: string[][]) => {
    if (activeRole === 'viewer') return;
    const currentTenant = user?.uid || 'guest';
    const totalCells = matrix.length * (matrix[0]?.length || 1);
    const quotaCheck = tenantRateLimiter.consumeQuota(currentTenant, tenantPlanId, totalCells);
    setQuotaStatus(quotaCheck);

    if (!quotaCheck.allowed) {
      setQuotaAlertMessage(quotaCheck.error || 'Batch paste exceeds quota limit');
      return;
    }

    const startCoord = parseCellCoord(targetTopLeft);
    if (!startCoord) return;

    const optimisticCells: SheetCells = {};
    for (let r = 0; r < matrix.length; r++) {
      for (let c = 0; c < matrix[r].length; c++) {
        const val = matrix[r][c];
        const key = cellCoordToString(startCoord.col + c, startCoord.row + r);
        if (val.startsWith('=')) {
          optimisticCells[key] = { formula: val, value: '' };
        } else {
          optimisticCells[key] = { value: val };
        }
      }
    }

    setAllSheetCells(prev => {
      const updated = {
        ...prev,
        [activeSheet]: {
          ...(prev[activeSheet] || {}),
          ...optimisticCells,
        },
      };
      isLocalMutationRef.current = true;
      triggerFirestoreSave(title, updated, sheets);
      return updated;
    });

    if (activeSpreadsheetId) {
      try {
        const res = await executeBatchOperation({
          spreadsheetId: activeSpreadsheetId,
          sheetName: activeSheet,
          operations: [{
            type: 'paste_cells',
            targetTopLeft,
            matrix,
          }],
        });
        if (res && res.newRevision) {
          setDocumentRevision(res.newRevision);
          globalRangeCache.updateLocalEdits(activeSheet, optimisticCells);
        }
      } catch (e) {
        console.warn('Batch paste server note:', e);
      }
    }

    const logEntry = {
      action: `Pasted block of ${totalCells} cells starting at ${targetTopLeft}`,
      timestamp: new Date().toISOString(),
      userId: user?.email || 'User'
    };
    setAuditLogs(prev => [logEntry, ...prev]);
  };

  const prefetchTimeoutRef = useRef<any>(null);
  const currentAbortCtrlRef = useRef<AbortController | null>(null);

  const handleViewportChange = (viewport: ViewportRange) => {
    if (!activeSpreadsheetId) return;

    if (prefetchTimeoutRef.current) {
      clearTimeout(prefetchTimeoutRef.current);
    }

    prefetchTimeoutRef.current = setTimeout(async () => {
      const prefetchStartRow = Math.max(0, viewport.startRow - 50);
      const prefetchEndRow = Math.min(rowCount - 1, viewport.endRow + 100);
      const prefetchStartCol = Math.max(0, viewport.startCol - 5);
      const prefetchEndCol = Math.min(colCount - 1, viewport.endCol + 10);

      const { missingChunks } = globalRangeCache.getCachedCellsForRange(
        activeSheet,
        prefetchStartRow,
        prefetchEndRow,
        prefetchStartCol,
        prefetchEndCol
      );

      if (missingChunks.length === 0) return;

      if (currentAbortCtrlRef.current) {
        currentAbortCtrlRef.current.abort();
      }
      const abortCtrl = new AbortController();
      currentAbortCtrlRef.current = abortCtrl;

      setIsRangeLoading(true);
      try {
        const response = await fetchSpreadsheetRange(
          activeSpreadsheetId,
          activeSheet,
          {
            startRow: prefetchStartRow,
            endRow: prefetchEndRow,
            startCol: prefetchStartCol,
            endCol: prefetchEndCol,
          },
          abortCtrl.signal
        );

        if (response && response.cells) {
          for (const chunk of missingChunks) {
            globalRangeCache.storeChunk(activeSheet, chunk.chunkRow, chunk.chunkCol, response.cells, response.revision);
          }
          setDocumentRevision(response.revision);

          setAllSheetCells(prev => {
            const current = prev[activeSheet] || {};
            const merged = { ...response.cells, ...current };
            return {
              ...prev,
              [activeSheet]: merged,
            };
          });
        }
      } catch (err: any) {
        if (err.name !== 'AbortError') {
          console.warn('Range prefetch info:', err?.message);
        }
      } finally {
        setIsRangeLoading(false);
      }
    }, 120);
  };

  const handleCopySelected = () => {
    const start = selectionRange?.start || selectedCell;
    const end = selectionRange?.end || selectedCell;
    const current = allSheetCells[activeSheet] || {};
    const { tsv } = extractRangeToMatrix(current, start, end);

    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(tsv).catch(err => console.warn('Clipboard write error:', err));
    }
    setCopiedRange({ start, end });
  };

  const handlePasteSelected = async () => {
    if (activeRole === 'viewer') return;
    try {
      if (navigator?.clipboard?.readText) {
        const text = await navigator.clipboard.readText();
        if (text) {
          const rows = text.split(/\r?\n/).filter(r => r.length > 0);
          if (rows.length > 0) {
            const matrix = rows.map(r => r.split('\t'));
            handleBatchPaste(selectedCell, matrix);
          }
        }
      }
    } catch (err) {
      console.warn('Clipboard read note:', err);
    }
  };

  const handleInsertRowAbove = (customRowIndex?: number) => {
    if (activeRole === 'viewer') return;
    const targetRow = customRowIndex !== undefined 
      ? customRowIndex 
      : (parseCellCoord(selectedCell)?.row ?? 0);
    const insertAt = targetRow;

    setAllSheetCells(prev => {
      const current = prev[activeSheet] || {};
      const shifted = shiftCellsOnRowInsert(current, insertAt);
      const updated = {
        ...prev,
        [activeSheet]: shifted,
      };
      isLocalMutationRef.current = true;
      triggerFirestoreSave(title, updated, sheets);
      return updated;
    });

    setRowCount(prev => prev + 1);
    globalRangeCache.invalidate(activeSheet);

    const logEntry = {
      action: `Inserted row above row ${targetRow + 1} in ${activeSheet}`,
      timestamp: new Date().toISOString(),
      userId: user?.email || 'User'
    };
    setAuditLogs(prev => [logEntry, ...prev]);
    if (activeSpreadsheetId) {
      recordAuditLog(activeSpreadsheetId, user?.email || 'User', logEntry.action);
    }
  };

  const handleInsertRowBelow = (customRowIndex?: number) => {
    if (activeRole === 'viewer') return;
    const targetRow = customRowIndex !== undefined 
      ? customRowIndex 
      : (parseCellCoord(selectedCell)?.row ?? 0);
    const insertAt = targetRow + 1;

    setAllSheetCells(prev => {
      const current = prev[activeSheet] || {};
      const shifted = shiftCellsOnRowInsert(current, insertAt);
      const updated = {
        ...prev,
        [activeSheet]: shifted,
      };
      isLocalMutationRef.current = true;
      triggerFirestoreSave(title, updated, sheets);
      return updated;
    });

    setRowCount(prev => prev + 1);
    globalRangeCache.invalidate(activeSheet);

    const logEntry = {
      action: `Inserted row below row ${targetRow + 1} in ${activeSheet}`,
      timestamp: new Date().toISOString(),
      userId: user?.email || 'User'
    };
    setAuditLogs(prev => [logEntry, ...prev]);
    if (activeSpreadsheetId) {
      recordAuditLog(activeSpreadsheetId, user?.email || 'User', logEntry.action);
    }
  };

  const handleInsertColLeft = (customColIndex?: number) => {
    if (activeRole === 'viewer') return;
    const targetCol = customColIndex !== undefined 
      ? customColIndex 
      : (parseCellCoord(selectedCell)?.col ?? 0);
    const insertAt = targetCol;

    setAllSheetCells(prev => {
      const current = prev[activeSheet] || {};
      const shifted = shiftCellsOnColInsert(current, insertAt);
      const updated = {
        ...prev,
        [activeSheet]: shifted,
      };
      isLocalMutationRef.current = true;
      triggerFirestoreSave(title, updated, sheets);
      return updated;
    });

    setColCount(prev => prev + 1);
    globalRangeCache.invalidate(activeSheet);

    const logEntry = {
      action: `Inserted column to the left of column ${colIndexToLetter(targetCol)} in ${activeSheet}`,
      timestamp: new Date().toISOString(),
      userId: user?.email || 'User'
    };
    setAuditLogs(prev => [logEntry, ...prev]);
    if (activeSpreadsheetId) {
      recordAuditLog(activeSpreadsheetId, user?.email || 'User', logEntry.action);
    }
  };

  const handleInsertColRight = (customColIndex?: number) => {
    if (activeRole === 'viewer') return;
    const targetCol = customColIndex !== undefined 
      ? customColIndex 
      : (parseCellCoord(selectedCell)?.col ?? 0);
    const insertAt = targetCol + 1;

    setAllSheetCells(prev => {
      const current = prev[activeSheet] || {};
      const shifted = shiftCellsOnColInsert(current, insertAt);
      const updated = {
        ...prev,
        [activeSheet]: shifted,
      };
      isLocalMutationRef.current = true;
      triggerFirestoreSave(title, updated, sheets);
      return updated;
    });

    setColCount(prev => prev + 1);
    globalRangeCache.invalidate(activeSheet);

    const logEntry = {
      action: `Inserted column to the right of column ${colIndexToLetter(targetCol)} in ${activeSheet}`,
      timestamp: new Date().toISOString(),
      userId: user?.email || 'User'
    };
    setAuditLogs(prev => [logEntry, ...prev]);
    if (activeSpreadsheetId) {
      recordAuditLog(activeSpreadsheetId, user?.email || 'User', logEntry.action);
    }
  };

  const handleDeleteRow = (customRowIndex?: number) => {
    if (activeRole === 'viewer') return;
    const targetRow = customRowIndex !== undefined 
      ? customRowIndex 
      : (parseCellCoord(selectedCell)?.row ?? 0);

    setAllSheetCells(prev => {
      const current = prev[activeSheet] || {};
      const shifted = shiftCellsOnRowDelete(current, targetRow);
      const updated = {
        ...prev,
        [activeSheet]: shifted,
      };
      isLocalMutationRef.current = true;
      triggerFirestoreSave(title, updated, sheets);
      return updated;
    });

    setRowCount(prev => Math.max(1, prev - 1));
    globalRangeCache.invalidate(activeSheet);

    const logEntry = {
      action: `Deleted row ${targetRow + 1} in ${activeSheet}`,
      timestamp: new Date().toISOString(),
      userId: user?.email || 'User'
    };
    setAuditLogs(prev => [logEntry, ...prev]);
    if (activeSpreadsheetId) {
      recordAuditLog(activeSpreadsheetId, user?.email || 'User', logEntry.action);
    }
  };

  const handleDeleteCol = (customColIndex?: number) => {
    if (activeRole === 'viewer') return;
    const targetCol = customColIndex !== undefined 
      ? customColIndex 
      : (parseCellCoord(selectedCell)?.col ?? 0);

    setAllSheetCells(prev => {
      const current = prev[activeSheet] || {};
      const shifted = shiftCellsOnColDelete(current, targetCol);
      const updated = {
        ...prev,
        [activeSheet]: shifted,
      };
      isLocalMutationRef.current = true;
      triggerFirestoreSave(title, updated, sheets);
      return updated;
    });

    setColCount(prev => Math.max(1, prev - 1));
    globalRangeCache.invalidate(activeSheet);

    const logEntry = {
      action: `Deleted column ${colIndexToLetter(targetCol)} in ${activeSheet}`,
      timestamp: new Date().toISOString(),
      userId: user?.email || 'User'
    };
    setAuditLogs(prev => [logEntry, ...prev]);
    if (activeSpreadsheetId) {
      recordAuditLog(activeSpreadsheetId, user?.email || 'User', logEntry.action);
    }
  };

  const handleAutoSumSelected = () => {
    const targets = getSelectedTargetCells();
    if (targets.length <= 1) return;

    const coords = targets.map(t => parseCellCoord(t)!).filter(Boolean);
    const maxRow = Math.max(...coords.map(c => c.row));
    const minRow = Math.min(...coords.map(c => c.row));
    const minCol = Math.min(...coords.map(c => c.col));
    const maxCol = Math.max(...coords.map(c => c.col));

    const targetRow = maxRow + 1;
    const targetCellKey = cellCoordToString(minCol, targetRow);
    const startCellKey = cellCoordToString(minCol, minRow);
    const endCellKey = cellCoordToString(maxCol, maxRow);

    const sumFormula = `=SUM(${startCellKey}:${endCellKey})`;
    handleCellChange(targetCellKey, '', sumFormula);
    setSelectedCell(targetCellKey);
    setSelectionRange({ start: targetCellKey, end: targetCellKey });
  };

  // Keyboard Delete / Backspace shortcut to clear selection
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        return;
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        handleClearSelected();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectionRange, selectedCell, allSheetCells, activeSheet, user, activeSpreadsheetId]);

  const handleSaveImage = (
    cellKey: string,
    imageData: { url: string; alt?: string; fit?: 'contain' | 'cover' } | null,
    asFormula?: boolean
  ) => {
    if (activeRole === 'viewer') return;

    // Check quota
    const currentTenant = user?.uid || 'guest';
    const quotaCheck = tenantRateLimiter.consumeQuota(currentTenant, tenantPlanId);
    setQuotaStatus(quotaCheck);

    if (!quotaCheck.allowed) {
      setQuotaAlertMessage(quotaCheck.error || 'Rate limit exceeded');
      return;
    }

    setAllSheetCells(prev => {
      const currentSheetCells = { ...(prev[activeSheet] || {}) };
      if (!imageData) {
        if (currentSheetCells[cellKey]) {
          const { image, ...rest } = currentSheetCells[cellKey];
          currentSheetCells[cellKey] = rest;
        }
      } else if (asFormula) {
        currentSheetCells[cellKey] = {
          ...currentSheetCells[cellKey],
          formula: `=IMAGE("${imageData.url}")`,
          value: imageData.alt || '[Image]',
          image: imageData,
        };
      } else {
        currentSheetCells[cellKey] = {
          ...currentSheetCells[cellKey],
          value: imageData.alt || '[Image]',
          image: imageData,
        };
      }

      const updatedAll = {
        ...prev,
        [activeSheet]: currentSheetCells,
      };

      isLocalMutationRef.current = true;
      triggerFirestoreSave(title, updatedAll, sheets);
      return updatedAll;
    });

    const actionText = imageData 
      ? `Inserted image in ${cellKey} (${activeSheet})` 
      : `Removed image from ${cellKey} (${activeSheet})`;
    const logEntry = {
      action: actionText,
      timestamp: new Date().toISOString(),
      userId: user?.email || 'User'
    };
    setAuditLogs(prev => [logEntry, ...prev]);
    if (activeSpreadsheetId) {
      recordAuditLog(activeSpreadsheetId, user?.email || 'User', actionText);
    }

    setIsImageModalOpen(false);
  };

  const handleInsertFormula = (formulaTemp: string) => {
    setFormulaValue(formulaTemp);
    handleCellChange(selectedCell, '', formulaTemp);
  };

  const handleAddSheet = () => {
    const newName = `Sheet${sheets.length + 1}`;
    const newSheetList = [...sheets, newName];
    const updated = { ...allSheetCells, [newName]: {} };
    setSheets(newSheetList);
    setAllSheetCells(updated);
    setActiveSheet(newName);
    triggerFirestoreSave(title, updated, newSheetList);
  };

  const handleExportCSV = () => {
    const rows: string[][] = [];
    for (let r = 1; r <= rowCount; r++) {
      const rowData: string[] = [];
      for (let c = 0; c < colCount; c++) {
        const colLetter = String.fromCharCode(65 + c);
        const cell = currentCells[`${colLetter}${r}`];
        rowData.push(cell?.formula || cell?.value || '');
      }
      rows.push(rowData);
    }
    const csv = Papa.unparse(rows);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `${title.toLowerCase().replace(/\s+/g, '_')}_${activeSheet}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleImportCSV = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    Papa.parse(file, {
      complete: (results) => {
        const newCells: SheetCells = {};
        results.data.forEach((row: any, rIndex: number) => {
          row.forEach((val: any, cIndex: number) => {
            if (cIndex < 26) {
              const colLetter = String.fromCharCode(65 + cIndex);
              const cellKey = `${colLetter}${rIndex + 1}`;
              if (val) {
                newCells[cellKey] = { value: String(val) };
              }
            }
          });
        });
        const updated = { ...allSheetCells, [activeSheet]: newCells };
        setAllSheetCells(updated);
        triggerFirestoreSave(title, updated, sheets);
      }
    });
  };

  const handleRunScript = (scriptStr: string) => {
    try {
      const cells = currentCells;
      const updateCell = (key: string, val: string) => {
        handleCellChange(key, val);
      };
      // eslint-disable-next-line no-new-func
      const fn = new Function('cells', 'updateCell', scriptStr);
      fn(cells, updateCell);
    } catch (err) {
      console.error("Macro execution error:", err);
    }
  };

  // If still checking initial auth state, show minimal loader
  if (authChecking) {
    return (
      <div className={`flex h-screen w-screen items-center justify-center ${theme === 'dark' ? 'bg-slate-950 text-slate-100' : 'bg-slate-50 text-slate-900'}`}>
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
          <p className="text-xs text-slate-400 font-medium">Initializing OmniSheet Pro...</p>
        </div>
      </div>
    );
  }

  const handleLoginSuccess = (authenticatedUser: any) => {
    setUser(authenticatedUser);
    try {
      localStorage.setItem('omnisheet_active_user', JSON.stringify({
        uid: authenticatedUser.uid,
        email: authenticatedUser.email,
        displayName: authenticatedUser.displayName,
        photoURL: authenticatedUser.photoURL,
      }));
    } catch {}
    if (authenticatedUser.email) {
      setCollaborators(prev => {
        if (!prev.some(c => c.email === authenticatedUser.email)) {
          return [...prev, { email: authenticatedUser.email!, role: 'owner' }];
        }
        return prev;
      });
    }
  };

  const handleSignOut = async () => {
    try {
      localStorage.removeItem('omnisheet_active_user');
      if (auth) {
        await signOut(auth);
      }
    } catch (err) {
      console.warn('Sign out warning:', err);
    }
    setUser(null);
    setActiveSpreadsheetId(null);
  };

  // 1. AUTHENTICATION PAGE BEFORE APPLICATION OPENS
  if (!user) {
    return (
      <AuthPage 
        onLoginSuccess={handleLoginSuccess} 
      />
    );
  }

  // 2. SPREADSHEETS DASHBOARD LANDING PAGE (Multiple sheets available to user)
  if (!activeSpreadsheetId) {
    return (
      <>
        <Dashboard
          user={user}
          onOpenSpreadsheet={(sheetId) => {
            setActiveSpreadsheetId(sheetId);
          }}
          onSignOut={handleSignOut}
          theme={theme}
          onToggleTheme={handleToggleTheme}
          onOpenPlanQuota={() => setIsPlanQuotaOpen(true)}
          quotaStatus={quotaStatus}
          onOpenRenderDeploy={() => setIsRenderDeployOpen(true)}
        />

        {/* Plan & Quota Modal accessible from Dashboard */}
        <PlanQuotaModal
          isOpen={isPlanQuotaOpen}
          onClose={() => setIsPlanQuotaOpen(false)}
          currentPlanId={tenantPlanId}
          onSelectPlan={handleSelectPlan}
          quotaStatus={quotaStatus}
          onResetQuotaDemo={handleResetQuotaDemo}
          onSimulateLimitDemo={handleSimulateLimitDemo}
          theme={theme}
        />

        {/* Render Deployment Modal */}
        <RenderDeployModal
          isOpen={isRenderDeployOpen}
          onClose={() => setIsRenderDeployOpen(false)}
          theme={theme}
        />

        {/* Upgrade Toast Notification */}
        {planUpgradeToast && (
          <div className="fixed bottom-5 right-5 z-50 flex items-center gap-3 rounded-2xl bg-emerald-600 px-4 py-3 text-xs font-semibold text-white shadow-2xl animate-in fade-in slide-in-from-bottom-3 duration-200">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-white" />
            <span>{planUpgradeToast}</span>
            <button onClick={() => setPlanUpgradeToast(null)} className="ml-2 hover:opacity-80">
              <X className="h-4 w-4" />
            </button>
          </div>
        )}
      </>
    );
  }

  // 3. MAIN SPREADSHEET WORKSPACE (With multi-cell selection & concurrent editing)
  return (
    <div className={`flex flex-col h-screen w-screen overflow-hidden font-sans antialiased transition-colors ${
      theme === 'dark' ? 'bg-slate-950 text-slate-100' : 'bg-slate-50 text-slate-900'
    }`}>
      <Navbar
        title={title}
        setTitle={(newTitle) => {
          setTitle(newTitle);
          triggerFirestoreSave(newTitle, allSheetCells, sheets);
        }}
        onBackToDashboard={() => {
          setActiveSpreadsheetId(null);
        }}
        onOpenShare={() => setIsShareOpen(true)}
        onOpenCharts={() => setIsChartsOpen(true)}
        onOpenAIAnalysis={() => setIsAIAnalysisOpen(true)}
        onOpenPlugins={() => setIsPluginsOpen(true)}
        onOpenHistory={() => setIsHistoryOpen(true)}
        onExportCSV={handleExportCSV}
        onImportCSV={handleImportCSV}
        user={user}
        setUser={setUser}
        activeRole={activeRole}
        isSaving={isSaving}
        lastSavedAt={lastSavedAt}
        onManualSave={handleManualSave}
        collaboratorsPresence={collaboratorsPresence}
        theme={theme}
        onToggleTheme={handleToggleTheme}
        onOpenPlanQuota={() => setIsPlanQuotaOpen(true)}
        quotaStatus={quotaStatus}
        onOpenRenderDeploy={() => setIsRenderDeployOpen(true)}
        onOpenSimulation={() => setIsSimulationOpen(true)}
      />

      {/* Viewer Mode RBAC Banner */}
      {activeRole === 'viewer' && (
        <div className="flex items-center justify-between px-6 py-2 bg-purple-950/80 border-b border-purple-800 text-xs text-purple-200">
          <div className="flex items-center gap-2">
            <span className="flex h-2 w-2 rounded-full bg-purple-400 animate-pulse" />
            <span>
              <strong>Viewer Mode (Read Only):</strong> You have viewer permissions for this shared spreadsheet. Cell edits and formula changes are disabled.
            </span>
          </div>
          <span className="font-mono text-[10px] px-2.5 py-0.5 rounded-full bg-purple-900 border border-purple-700 text-purple-200 font-bold">
            RBAC: Viewer
          </span>
        </div>
      )}

      <Toolbar
        onFormat={handleFormat}
        onInsertFormula={handleInsertFormula}
        onAddRow={() => setRowCount(prev => prev + 1000)}
        onAddCol={() => setColCount(prev => prev + 5)}
        onClearSelected={handleClearSelected}
        onAutoSumSelected={handleAutoSumSelected}
        onCopySelected={handleCopySelected}
        onPasteSelected={handlePasteSelected}
        onInsertRowAbove={() => handleInsertRowAbove()}
        onInsertRowBelow={() => handleInsertRowBelow()}
        onInsertColLeft={() => handleInsertColLeft()}
        onInsertColRight={() => handleInsertColRight()}
        onDeleteRow={() => handleDeleteRow()}
        onDeleteCol={() => handleDeleteCol()}
        onOpenImageModal={() => {
          setImageTargetCell(selectedCell);
          setIsImageModalOpen(true);
        }}
        onOpenAIAnalysis={() => setIsAIAnalysisOpen(true)}
        selectedCellsCount={selectedTargetCells.length}
        selectionLabel={selectionLabel}
        theme={theme}
      />

      <FormulaBar
        selectedCell={selectedCell}
        selectionLabel={selectionLabel}
        formulaValue={formulaValue}
        setFormulaValue={setFormulaValue}
        onCommitFormula={handleCommitFormula}
        theme={theme}
      />

      <SpreadsheetGrid
        cells={currentCells}
        onCellChange={handleCellChange}
        onBatchPaste={handleBatchPaste}
        onViewportChange={handleViewportChange}
        isRangeLoading={isRangeLoading}
        selectedCell={selectedCell}
        setSelectedCell={(cell) => {
          setSelectedCell(cell);
          setSelectionRange(null);
        }}
        selectionRange={selectionRange}
        setSelectionRange={setSelectionRange}
        copiedRange={copiedRange}
        setCopiedRange={setCopiedRange}
        formulaValue={formulaValue}
        setFormulaValue={setFormulaValue}
        rowCount={rowCount}
        colCount={colCount}
        sheets={sheets}
        activeSheet={activeSheet}
        setActiveSheet={setActiveSheet}
        onAddSheet={handleAddSheet}
        onInsertRowAbove={handleInsertRowAbove}
        onInsertRowBelow={handleInsertRowBelow}
        onInsertColLeft={handleInsertColLeft}
        onInsertColRight={handleInsertColRight}
        onDeleteRow={handleDeleteRow}
        onDeleteCol={handleDeleteCol}
        onClearSelected={handleClearSelected}
        onOpenImageModal={(cellKey) => {
          setImageTargetCell(cellKey);
          setIsImageModalOpen(true);
        }}
        collaboratorCursors={collaboratorsPresence
          .filter(c => c.activeSheet === activeSheet)
          .map(c => ({
            userId: c.userId,
            name: c.name,
            cell: c.activeCell,
            color: c.color
          }))}
        theme={theme}
      />

      {/* Floating Rate Limit Exceeded Alert Banner */}
      {quotaAlertMessage && (
        <div className="fixed bottom-5 right-5 z-50 max-w-md rounded-2xl border border-red-500/50 bg-slate-900/95 p-4 shadow-2xl backdrop-blur-md text-slate-100 ring-1 ring-red-500/30 animate-in fade-in slide-in-from-bottom-3 duration-200">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-red-500/20 text-red-400 border border-red-500/30">
              <Zap className="h-5 w-5 animate-pulse" />
            </div>
            <div className="flex-1">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold uppercase tracking-wider text-red-400">
                  Rate Limit Exceeded (Netflix-Style)
                </h4>
                <button 
                  onClick={() => setQuotaAlertMessage(null)}
                  className="rounded-lg p-1 text-slate-400 hover:text-white hover:bg-slate-800 transition"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <p className="mt-1 text-xs text-slate-300 leading-relaxed">
                {quotaAlertMessage}
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button
                  onClick={() => setIsPlanQuotaOpen(true)}
                  className="rounded-xl bg-gradient-to-r from-emerald-600 to-teal-500 px-3 py-1.5 text-xs font-bold text-white shadow-sm hover:from-emerald-500 hover:to-teal-400 transition"
                >
                  Upgrade Plan (₹199 / ₹499)
                </button>
                <button
                  onClick={handleResetQuotaDemo}
                  className="flex items-center gap-1 rounded-xl border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-xs font-medium text-slate-300 hover:bg-slate-700 hover:text-white transition"
                  title="Reset usage counter for demo testing"
                >
                  <RotateCcw className="h-3 w-3" />
                  Reset Quota
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Plan Upgrade Toast */}
      {planUpgradeToast && (
        <div className="fixed bottom-5 left-5 z-50 flex items-center gap-3 rounded-2xl bg-emerald-600 px-4 py-3 text-xs font-semibold text-white shadow-2xl animate-in fade-in slide-in-from-bottom-3 duration-200">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-white" />
          <span>{planUpgradeToast}</span>
          <button onClick={() => setPlanUpgradeToast(null)} className="ml-2 hover:opacity-80">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Modals */}
      <PlanQuotaModal
        isOpen={isPlanQuotaOpen}
        onClose={() => setIsPlanQuotaOpen(false)}
        currentPlanId={tenantPlanId}
        onSelectPlan={handleSelectPlan}
        quotaStatus={quotaStatus}
        onResetQuotaDemo={handleResetQuotaDemo}
        onSimulateLimitDemo={handleSimulateLimitDemo}
        theme={theme}
      />

      <RenderDeployModal
        isOpen={isRenderDeployOpen}
        onClose={() => setIsRenderDeployOpen(false)}
        theme={theme}
      />

      <ChartModal
        isOpen={isChartsOpen}
        onClose={() => setIsChartsOpen(false)}
        cells={currentCells}
        theme={theme}
      />

      <ShareModal
        isOpen={isShareOpen}
        onClose={() => setIsShareOpen(false)}
        spreadsheetId={activeSpreadsheetId}
        currentUser={user}
        collaborators={collaborators}
        onAddCollaborator={async (collab) => {
          if (!activeSpreadsheetId) return;
          const res = await addCollaboratorToSpreadsheet(activeSpreadsheetId, collab, user?.displayName || user?.email);
          if (res.success) {
            setCollaborators(res.collaborators);
          }
        }}
        onRemoveCollaborator={async (collabEmail) => {
          if (!activeSpreadsheetId) return;
          const updated = await removeCollaboratorFromSpreadsheet(activeSpreadsheetId, collabEmail);
          setCollaborators(updated);
        }}
        isPublic={isPublic}
        setIsPublic={(val) => {
          setIsPublic(val);
          triggerFirestoreSave(title, allSheetCells, sheets);
        }}
        theme={theme}
      />

      <PluginModal
        isOpen={isPluginsOpen}
        onClose={() => setIsPluginsOpen(false)}
        onRunScript={handleRunScript}
        theme={theme}
      />

      <VersionHistoryModal
        isOpen={isHistoryOpen}
        onClose={() => setIsHistoryOpen(false)}
        logs={auditLogs}
        theme={theme}
      />

      <ImageInsertModal
        isOpen={isImageModalOpen}
        onClose={() => setIsImageModalOpen(false)}
        targetCell={imageTargetCell}
        currentImage={currentCells[imageTargetCell]?.image || null}
        onSaveImage={handleSaveImage}
        theme={theme}
      />

      <AIDataAnalysisModal
        isOpen={isAIAnalysisOpen}
        onClose={() => setIsAIAnalysisOpen(false)}
        spreadsheetTitle={title}
        activeSheetName={activeSheet}
        sheetCells={currentCells}
        selectedRange={selectionRange ? `${selectionRange.start}:${selectionRange.end}` : selectedCell}
        onApplyFormula={(targetCell, formula) => {
          handleCellChange(targetCell, '', formula);
        }}
        onOpenCharts={() => {
          setIsAIAnalysisOpen(false);
          setIsChartsOpen(true);
        }}
        theme={theme}
      />

      <SimulationModal
        isOpen={isSimulationOpen}
        onClose={() => setIsSimulationOpen(false)}
        spreadsheetId={activeSpreadsheetId || 'demo_sheet'}
        sheetName={activeSheet}
        onApplyResultsToSheet={(convergedCells) => {
          setAllSheetCells((prev) => {
            const next = {
              ...prev,
              [activeSheet]: {
                ...prev[activeSheet],
                ...convergedCells,
              },
            };
            triggerFirestoreSave(title, next, sheets);
            return next;
          });
          globalRangeCache.updateLocalEdits(activeSheet, convergedCells);
        }}
        theme={theme}
      />

      <OfflineIndicator />
    </div>
  );
}
