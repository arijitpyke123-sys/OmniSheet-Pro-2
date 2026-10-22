import { 
  doc, 
  setDoc, 
  getDoc, 
  deleteDoc,
  collection, 
  getDocs, 
  onSnapshot,
  query, 
  where
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { SheetCells } from '../utils/formulaEngine';

export type CollaboratorRole = 'owner' | 'editor' | 'commenter' | 'viewer';

export interface SpreadsheetCollaborator {
  email: string;
  role: CollaboratorRole;
  userId?: string;
  displayName?: string;
  photoURL?: string;
  invitedAt?: string;
}

export interface SpreadsheetMeta {
  id: string;
  title: string;
  ownerId: string;
  ownerName?: string;
  ownerEmail?: string;
  isPublic: boolean;
  createdAt: string;
  updatedAt: string;
  sheetCount?: number;
  collaborators?: SpreadsheetCollaborator[];
  collaboratorEmails?: string[];
  collaboratorUserIds?: string[];
  myRole?: CollaboratorRole;
}

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  photoURL?: string;
  lastSeen?: string;
}

export interface UserPresence {
  userId: string;
  name: string;
  email: string;
  activeCell: string;
  activeSheet: string;
  color: string;
  lastActive: number;
}

const LOCAL_STORAGE_LIST_PREFIX = 'omnisheet_meta_user_';
const LOCAL_STORAGE_SHARED_PREFIX = 'omnisheet_shared_user_';
const LOCAL_STORAGE_KEY_PREFIX = 'omnisheet_doc_';
const LOCAL_STORAGE_USERS_KEY = 'omnisheet_registered_users_cache';

// Seed sample team users for testing collaborator invitations
const SAMPLE_TEAM_USERS: UserProfile[] = [
  {
    uid: 'usr_sarah_lead',
    email: 'sarah.lead@omnisheet.io',
    displayName: 'Sarah Lin (Product Lead)',
    photoURL: 'https://api.dicebear.com/7.x/initials/svg?seed=Sarah+Lin',
  },
  {
    uid: 'usr_alex_dev',
    email: 'alex.dev@omnisheet.io',
    displayName: 'Alex Rivera (Engineer)',
    photoURL: 'https://api.dicebear.com/7.x/initials/svg?seed=Alex+Rivera',
  },
  {
    uid: 'usr_david_analyst',
    email: 'david.analyst@omnisheet.io',
    displayName: 'David Kim (Financial Analyst)',
    photoURL: 'https://api.dicebear.com/7.x/initials/svg?seed=David+Kim',
  },
  {
    uid: 'usr_priya_designer',
    email: 'priya.designer@omnisheet.io',
    displayName: 'Priya Sharma (UX Designer)',
    photoURL: 'https://api.dicebear.com/7.x/initials/svg?seed=Priya+Sharma',
  }
];

// USER PROFILES: Sync current user to Firestore for collaborator discovery
export async function syncUserProfile(user: {
  uid: string;
  email?: string | null;
  displayName?: string | null;
  photoURL?: string | null;
}): Promise<void> {
  if (!user || !user.uid) return;
  const email = (user.email || '').trim().toLowerCase();
  const displayName = user.displayName || email.split('@')[0] || 'User';
  const photoURL = user.photoURL || `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(displayName)}`;

  const profile: UserProfile = {
    uid: user.uid,
    email,
    displayName,
    photoURL,
    lastSeen: new Date().toISOString(),
  };

  // 1. Update local cache
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_USERS_KEY);
    const users: UserProfile[] = raw ? JSON.parse(raw) : [];
    const index = users.findIndex(u => u.uid === user.uid || (email && u.email.toLowerCase() === email));
    if (index >= 0) {
      users[index] = { ...users[index], ...profile };
    } else {
      users.push(profile);
    }
    localStorage.setItem(LOCAL_STORAGE_USERS_KEY, JSON.stringify(users));
  } catch (e) {
    console.warn('Local users cache error:', e);
  }

  // 2. Persist to Firestore
  try {
    await setDoc(doc(db, 'users', user.uid), profile, { merge: true });
  } catch (err) {
    console.warn('Firestore syncUserProfile warning:', err);
  }
}

// USER PROFILES: Fetch all existing users in Firestore for collaborator invitations
export async function getExistingUsers(currentUserId?: string): Promise<UserProfile[]> {
  const userMap = new Map<string, UserProfile>();

  // Add default sample team users first
  for (const sample of SAMPLE_TEAM_USERS) {
    userMap.set(sample.email.toLowerCase(), sample);
  }

  // Add local cache users
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_USERS_KEY);
    if (raw) {
      const parsed: UserProfile[] = JSON.parse(raw);
      for (const u of parsed) {
        if (u.email) userMap.set(u.email.toLowerCase(), u);
      }
    }
  } catch (e) {
    console.warn('Error reading local users cache:', e);
  }

  // Fetch from Firestore users collection
  try {
    const snap = await getDocs(collection(db, 'users'));
    snap.forEach((d) => {
      const data = d.data() as UserProfile;
      if (data && data.email) {
        userMap.set(data.email.toLowerCase(), {
          uid: data.uid || d.id,
          email: data.email,
          displayName: data.displayName || data.email.split('@')[0],
          photoURL: data.photoURL || `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(data.displayName || data.email)}`,
          lastSeen: data.lastSeen,
        });
      }
    });

    // Update local cache with fresh merged list
    try {
      localStorage.setItem(LOCAL_STORAGE_USERS_KEY, JSON.stringify(Array.from(userMap.values())));
    } catch {}
  } catch (error) {
    console.warn('Firestore getExistingUsers error (using local/sample):', error);
  }

  const allUsers = Array.from(userMap.values());
  // Filter out the current user so they don't invite themselves
  return allUsers.filter(u => u.uid !== currentUserId);
}

const COLLABORATOR_COLORS = [
  '#10b981', // emerald
  '#3b82f6', // blue
  '#f59e0b', // amber
  '#ec4899', // pink
  '#8b5cf6', // purple
  '#06b6d4', // cyan
  '#f97316', // orange
  '#14b8a6', // teal
];

export function getUserColor(userId: string): string {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = userId.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % COLLABORATOR_COLORS.length;
  return COLLABORATOR_COLORS[index];
}

// 1. LIST SPREADSHEETS FILTERED SPECIFICALLY FOR THIS USER (Owned by user)
export async function listSpreadsheets(userId: string): Promise<SpreadsheetMeta[]> {
  if (!userId) return [];
  const userCacheKey = `${LOCAL_STORAGE_LIST_PREFIX}${userId}`;
  const metaList: SpreadsheetMeta[] = [];

  try {
    // Query Firestore specifically for spreadsheets owned by this user
    const q = query(collection(db, 'spreadsheets'), where('ownerId', '==', userId));
    const snap = await getDocs(q);

    snap.forEach((d) => {
      const data = d.data();
      metaList.push({
        id: d.id,
        title: data.title || 'Untitled Spreadsheet',
        ownerId: data.ownerId || userId,
        ownerName: data.ownerName || 'User',
        ownerEmail: data.ownerEmail,
        isPublic: data.isPublic ?? true,
        createdAt: data.createdAt || new Date().toISOString(),
        updatedAt: data.updatedAt || new Date().toISOString(),
        sheetCount: data.sheetCount || 2,
        collaborators: data.collaborators || [],
        collaboratorEmails: data.collaboratorEmails || [],
        collaboratorUserIds: data.collaboratorUserIds || [],
        myRole: 'owner',
      });
    });

    // Save this user's specific cache
    try {
      localStorage.setItem(userCacheKey, JSON.stringify(metaList));
    } catch (e) {
      console.warn('Local cache error:', e);
    }

    if (metaList.length > 0) {
      return metaList.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    }
  } catch (error) {
    console.warn('Firestore user-specific list error, falling back to user cache:', error);
  }

  // Fallback to user-scoped local storage
  const cached = localStorage.getItem(userCacheKey);
  if (cached) {
    try {
      const parsed: SpreadsheetMeta[] = JSON.parse(cached);
      return parsed.filter(item => item.ownerId === userId).map(item => ({ ...item, myRole: 'owner' as CollaboratorRole }));
    } catch {
      return [];
    }
  }

  return [];
}

// 2. LIST SPREADSHEETS SHARED WITH THIS USER (With RBAC roles)
export async function listSharedSpreadsheets(user: { uid: string; email?: string | null }): Promise<SpreadsheetMeta[]> {
  if (!user || (!user.uid && !user.email)) return [];
  const userEmail = (user.email || '').trim().toLowerCase();
  const userId = user.uid;
  const sharedCacheKey = `${LOCAL_STORAGE_SHARED_PREFIX}${userId}`;
  const sharedMap = new Map<string, SpreadsheetMeta>();

  try {
    // 1. Try querying via array-contains on collaboratorEmails
    let docsList: any[] = [];
    if (userEmail) {
      try {
        const q = query(
          collection(db, 'spreadsheets'),
          where('collaboratorEmails', 'array-contains', userEmail)
        );
        const snap = await getDocs(q);
        snap.forEach(doc => docsList.push(doc));
      } catch (err) {
        // Fallback to general read if array indexing needs fallback
      }
    }

    // 2. If nothing found or query threw, also query collection to find any where collaboratorUserIds has user.uid or scan
    if (docsList.length === 0) {
      try {
        const allSnap = await getDocs(collection(db, 'spreadsheets'));
        allSnap.forEach(doc => docsList.push(doc));
      } catch (err) {
        console.warn('Could not read all spreadsheets for shared list:', err);
      }
    }

    // Deduplicate and filter docs
    for (const d of docsList) {
      const data = d.data();
      // Exclude spreadsheets owned by this user
      if (data.ownerId === userId) continue;

      const collabs: SpreadsheetCollaborator[] = data.collaborators || [];
      const collabEmails: string[] = (data.collaboratorEmails || []).map((e: string) => e.toLowerCase());
      const collabUserIds: string[] = data.collaboratorUserIds || [];

      // Check if user is matched by email or userId
      const matchedByEmail = userEmail ? (collabEmails.includes(userEmail) || collabs.some(c => c.email.toLowerCase() === userEmail)) : false;
      const matchedByUid = collabUserIds.includes(userId) || collabs.some(c => c.userId === userId);

      if (matchedByEmail || matchedByUid) {
        // Identify assigned RBAC role
        const matchedCollab = collabs.find(c => 
          (userEmail && c.email.toLowerCase() === userEmail) || (c.userId && c.userId === userId)
        );
        const myRole: CollaboratorRole = matchedCollab?.role || 'viewer';

        sharedMap.set(d.id, {
          id: d.id,
          title: data.title || 'Untitled Spreadsheet',
          ownerId: data.ownerId || 'teammate',
          ownerName: data.ownerName || 'Teammate',
          ownerEmail: data.ownerEmail,
          isPublic: data.isPublic ?? true,
          createdAt: data.createdAt || new Date().toISOString(),
          updatedAt: data.updatedAt || new Date().toISOString(),
          sheetCount: data.sheetCount || 2,
          collaborators: collabs,
          collaboratorEmails: collabEmails,
          collaboratorUserIds: collabUserIds,
          myRole,
        });
      }
    }

    const result = Array.from(sharedMap.values()).sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );

    // Save to user's shared cache
    try {
      localStorage.setItem(sharedCacheKey, JSON.stringify(result));
    } catch (e) {
      console.warn('Shared local cache error:', e);
    }

    if (result.length > 0) return result;
  } catch (err) {
    console.warn('Firestore listSharedSpreadsheets error, using cache:', err);
  }

  // Fallback to local storage cache
  try {
    const cached = localStorage.getItem(sharedCacheKey);
    if (cached) {
      return JSON.parse(cached);
    }
  } catch {}

  return [];
}

// 3. CREATE NEW SPREADSHEET FOR SPECIFIC USER
export async function createNewSpreadsheet(
  title: string,
  ownerId: string,
  ownerName: string = 'User',
  initialSheets?: { sheets: Record<string, SheetCells>; sheetNames: string[] },
  ownerEmail?: string
): Promise<string> {
  const id = 'sheet_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 6);
  const now = new Date().toISOString();
  const cleanEmail = (ownerEmail || '').trim().toLowerCase();

  const defaultSheets = initialSheets?.sheets || {
    Sheet1: {
      'A1': { value: 'Item' },
      'B1': { value: 'Qty' },
      'C1': { value: 'Rate' },
      'D1': { value: 'Total', formula: '=B1*C1' },
      'A2': { value: 'Pro License' },
      'B2': { value: '10' },
      'C2': { value: '99' },
      'D2': { formula: '=B2*C2' },
      'A3': { value: 'Cloud Compute' },
      'B3': { value: '5' },
      'C3': { value: '250' },
      'D3': { formula: '=B3*C3' },
      'A4': { value: 'Total' },
      'D4': { formula: '=SUM(D2:D3)' },
    },
    Sheet2: {}
  };

  const defaultSheetNames = initialSheets?.sheetNames || ['Sheet1', 'Sheet2'];

  const initialCollaborators: SpreadsheetCollaborator[] = cleanEmail ? [{
    email: cleanEmail,
    role: 'owner',
    userId: ownerId,
    displayName: ownerName,
    invitedAt: now,
  }] : [];

  const metaData: SpreadsheetMeta = {
    id,
    title,
    ownerId, // Bound specifically to this user
    ownerName,
    ownerEmail: cleanEmail || undefined,
    isPublic: true,
    createdAt: now,
    updatedAt: now,
    sheetCount: defaultSheetNames.length,
    collaborators: initialCollaborators,
    collaboratorEmails: cleanEmail ? [cleanEmail] : [],
    collaboratorUserIds: [ownerId],
    myRole: 'owner',
  };

  // Cache locally scoped to this user
  const userCacheKey = `${LOCAL_STORAGE_LIST_PREFIX}${ownerId}`;
  try {
    localStorage.setItem(
      `${LOCAL_STORAGE_KEY_PREFIX}${id}`,
      JSON.stringify({
        ...metaData,
        sheetNames: defaultSheetNames,
        sheets: defaultSheets,
      })
    );

    const existingList = localStorage.getItem(userCacheKey);
    const list: SpreadsheetMeta[] = existingList ? JSON.parse(existingList) : [];
    list.unshift(metaData);
    localStorage.setItem(userCacheKey, JSON.stringify(list));
  } catch (e) {
    console.warn('Local storage error:', e);
  }

  // Persist to Firestore with ownerId
  try {
    await setDoc(doc(db, `spreadsheets/${id}`), metaData);
    await setDoc(doc(db, `spreadsheets/${id}/data/cells`), {
      spreadsheetId: id,
      sheetNames: defaultSheetNames,
      sheets: JSON.stringify(defaultSheets),
      updatedAt: now,
    });
    if (cleanEmail) {
      await setDoc(doc(db, `spreadsheets/${id}/collaborators/${cleanEmail.replace(/[^a-zA-Z0-9]/g, '_')}`), {
        spreadsheetId: id,
        email: cleanEmail,
        role: 'owner',
        userId: ownerId,
        displayName: ownerName,
        invitedAt: now,
      });
    }
  } catch (err) {
    console.warn('Firestore create spreadsheet warning:', err);
  }

  return id;
}

// 3. DELETE SPREADSHEET (SCOPED TO USER)
export async function deleteSpreadsheet(id: string, userId?: string): Promise<void> {
  // Remove local
  try {
    localStorage.removeItem(`${LOCAL_STORAGE_KEY_PREFIX}${id}`);
    if (userId) {
      const userCacheKey = `${LOCAL_STORAGE_LIST_PREFIX}${userId}`;
      const existingList = localStorage.getItem(userCacheKey);
      if (existingList) {
        const list: SpreadsheetMeta[] = JSON.parse(existingList);
        const filtered = list.filter((item) => item.id !== id);
        localStorage.setItem(userCacheKey, JSON.stringify(filtered));
      }
    }
  } catch (e) {
    console.warn('Local delete cache error:', e);
  }

  // Delete from Firestore
  try {
    await deleteDoc(doc(db, `spreadsheets/${id}/data/cells`));
    await deleteDoc(doc(db, `spreadsheets/${id}`));
  } catch (e) {
    console.warn('Firestore delete error:', e);
  }
}

// 4. SAVE SPREADSHEET (Auto-save / concurrent push)
export async function saveSpreadsheetToFirestore(
  spreadsheetId: string,
  title: string,
  ownerId: string,
  sheetNames: string[],
  sheets: Record<string, SheetCells>,
  isPublic: boolean = true
): Promise<void> {
  const now = new Date().toISOString();

  // Cache locally
  try {
    localStorage.setItem(
      `${LOCAL_STORAGE_KEY_PREFIX}${spreadsheetId}`,
      JSON.stringify({
        id: spreadsheetId,
        title,
        ownerId,
        sheetNames,
        sheets,
        isPublic,
        updatedAt: now,
      })
    );
  } catch (e) {
    console.warn('LocalStorage cache warning:', e);
  }

  // Persist to Firestore
  const spreadsheetPath = `spreadsheets/${spreadsheetId}`;
  try {
    await setDoc(doc(db, spreadsheetPath), {
      id: spreadsheetId,
      title,
      ownerId: ownerId || 'user',
      isPublic,
      updatedAt: now,
    }, { merge: true });
  } catch (error) {
    try {
      handleFirestoreError(error, OperationType.WRITE, spreadsheetPath);
    } catch (e) {
      console.warn('Firestore write logged:', e);
    }
  }

  const dataPath = `spreadsheets/${spreadsheetId}/data/cells`;
  try {
    await setDoc(doc(db, dataPath), {
      spreadsheetId,
      sheetNames,
      sheets: JSON.stringify(sheets),
      updatedAt: now,
    }, { merge: true });
  } catch (error) {
    try {
      handleFirestoreError(error, OperationType.WRITE, dataPath);
    } catch (e) {
      console.warn('Firestore data write logged:', e);
    }
  }
}

// 5. LOAD SPREADSHEET (Includes RBAC collaborators & ownership)
export async function loadSpreadsheetFromFirestore(
  spreadsheetId: string
): Promise<{
  title: string;
  sheets: Record<string, SheetCells>;
  sheetNames: string[];
  isPublic: boolean;
  ownerId?: string;
  ownerName?: string;
  ownerEmail?: string;
  collaborators?: SpreadsheetCollaborator[];
} | null> {
  const spreadsheetPath = `spreadsheets/${spreadsheetId}`;
  const dataPath = `spreadsheets/${spreadsheetId}/data/cells`;

  try {
    const sheetDoc = await getDoc(doc(db, spreadsheetPath));
    const dataDoc = await getDoc(doc(db, dataPath));

    if (sheetDoc.exists() && dataDoc.exists()) {
      const sheetData = sheetDoc.data();
      const cellData = dataDoc.data();
      let parsedSheets: Record<string, SheetCells> = {};
      try {
        parsedSheets = JSON.parse(cellData.sheets);
      } catch {
        parsedSheets = {};
      }

      return {
        title: sheetData.title || 'Untitled Spreadsheet',
        isPublic: sheetData.isPublic ?? true,
        sheetNames: cellData.sheetNames || ['Sheet1', 'Sheet2'],
        sheets: parsedSheets,
        ownerId: sheetData.ownerId,
        ownerName: sheetData.ownerName,
        ownerEmail: sheetData.ownerEmail,
        collaborators: sheetData.collaborators || [],
      };
    }
  } catch (error) {
    console.warn('Could not read from Firestore, checking offline cache:', error);
  }

  // Fallback to local storage
  const local = localStorage.getItem(`${LOCAL_STORAGE_KEY_PREFIX}${spreadsheetId}`);
  if (local) {
    try {
      const parsed = JSON.parse(local);
      return {
        title: parsed.title,
        sheetNames: parsed.sheetNames || ['Sheet1', 'Sheet2'],
        sheets: parsed.sheets,
        isPublic: parsed.isPublic ?? true,
        ownerId: parsed.ownerId,
        ownerName: parsed.ownerName,
        ownerEmail: parsed.ownerEmail,
        collaborators: parsed.collaborators || [],
      };
    } catch {
      return null;
    }
  }

  return null;
}

// 5b. COLLABORATOR MANAGEMENT: Add / Invite collaborator with explicit RBAC role
export async function addCollaboratorToSpreadsheet(
  spreadsheetId: string,
  collaborator: SpreadsheetCollaborator,
  inviterName?: string
): Promise<{ success: boolean; collaborators: SpreadsheetCollaborator[] }> {
  const cleanEmail = collaborator.email.trim().toLowerCase();
  const now = new Date().toISOString();
  let updatedCollaborators: SpreadsheetCollaborator[] = [];
  let updatedEmails: string[] = [];
  let updatedUserIds: string[] = [];

  try {
    // 1. Fetch current spreadsheet document
    const sheetRef = doc(db, 'spreadsheets', spreadsheetId);
    const sheetSnap = await getDoc(sheetRef);
    let sheetData: any = {};
    if (sheetSnap.exists()) {
      sheetData = sheetSnap.data();
      const existing: SpreadsheetCollaborator[] = sheetData.collaborators || [];
      const filtered = existing.filter(c => c.email.toLowerCase() !== cleanEmail);
      updatedCollaborators = [
        ...filtered,
        {
          ...collaborator,
          email: cleanEmail,
          invitedAt: now,
        }
      ];
    } else {
      updatedCollaborators = [
        {
          ...collaborator,
          email: cleanEmail,
          invitedAt: now,
        }
      ];
    }

    updatedEmails = Array.from(new Set(updatedCollaborators.map(c => c.email.toLowerCase())));
    updatedUserIds = Array.from(new Set(
      updatedCollaborators
        .map(c => c.userId)
        .filter((uid): uid is string => Boolean(uid))
    ));
    if (sheetData.ownerId && !updatedUserIds.includes(sheetData.ownerId)) {
      updatedUserIds.push(sheetData.ownerId);
    }

    // 2. Update Firestore document
    await setDoc(sheetRef, {
      collaborators: updatedCollaborators,
      collaboratorEmails: updatedEmails,
      collaboratorUserIds: updatedUserIds,
      updatedAt: now,
    }, { merge: true });

    // 3. Subcollection entry for RBAC rules and auditing
    const safeCollabId = cleanEmail.replace(/[^a-zA-Z0-9]/g, '_');
    await setDoc(doc(db, `spreadsheets/${spreadsheetId}/collaborators/${safeCollabId}`), {
      spreadsheetId,
      email: cleanEmail,
      role: collaborator.role,
      userId: collaborator.userId || null,
      displayName: collaborator.displayName || cleanEmail.split('@')[0],
      invitedAt: now,
      inviter: inviterName || 'Owner'
    }, { merge: true });

    // 4. Record audit log
    await recordAuditLog(
      spreadsheetId,
      inviterName || 'Owner',
      `Invited ${cleanEmail} as ${collaborator.role.toUpperCase()}`
    );

    // 5. Update local cache for this spreadsheet
    const docCacheKey = `${LOCAL_STORAGE_KEY_PREFIX}${spreadsheetId}`;
    try {
      const raw = localStorage.getItem(docCacheKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        parsed.collaborators = updatedCollaborators;
        parsed.collaboratorEmails = updatedEmails;
        parsed.collaboratorUserIds = updatedUserIds;
        localStorage.setItem(docCacheKey, JSON.stringify(parsed));
      }
    } catch {}

    return { success: true, collaborators: updatedCollaborators };
  } catch (error) {
    console.error('Error adding collaborator to spreadsheet:', error);
    return { success: false, collaborators: updatedCollaborators };
  }
}

// 5c. COLLABORATOR MANAGEMENT: Remove collaborator
export async function removeCollaboratorFromSpreadsheet(
  spreadsheetId: string,
  email: string
): Promise<SpreadsheetCollaborator[]> {
  const cleanEmail = email.trim().toLowerCase();
  try {
    const sheetRef = doc(db, 'spreadsheets', spreadsheetId);
    const sheetSnap = await getDoc(sheetRef);
    if (sheetSnap.exists()) {
      const sheetData = sheetSnap.data();
      const existing: SpreadsheetCollaborator[] = sheetData.collaborators || [];
      const updated = existing.filter(c => c.email.toLowerCase() !== cleanEmail);
      const updatedEmails = updated.map(c => c.email.toLowerCase());
      const updatedUserIds = updated.map(c => c.userId).filter(Boolean) as string[];

      await setDoc(sheetRef, {
        collaborators: updated,
        collaboratorEmails: updatedEmails,
        collaboratorUserIds: updatedUserIds,
        updatedAt: new Date().toISOString()
      }, { merge: true });

      const safeCollabId = cleanEmail.replace(/[^a-zA-Z0-9]/g, '_');
      await deleteDoc(doc(db, `spreadsheets/${spreadsheetId}/collaborators/${safeCollabId}`));

      return updated;
    }
  } catch (err) {
    console.error('Error removing collaborator:', err);
  }
  return [];
}

// 6. REAL-TIME CONCURRENT SYNC (onSnapshot listener)
export function subscribeToSpreadsheetUpdates(
  spreadsheetId: string,
  onRemoteChange: (data: { sheets: Record<string, SheetCells>; sheetNames: string[]; title?: string }) => void
): () => void {
  const dataPath = `spreadsheets/${spreadsheetId}/data/cells`;

  const unsubscribe = onSnapshot(
    doc(db, dataPath),
    (snapshot) => {
      if (snapshot.exists()) {
        const d = snapshot.data();
        if (d && d.sheets) {
          try {
            const parsedSheets = JSON.parse(d.sheets);
            onRemoteChange({
              sheets: parsedSheets,
              sheetNames: d.sheetNames || ['Sheet1'],
            });
          } catch (e) {
            console.warn('Parse snapshot error:', e);
          }
        }
      }
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.GET, dataPath);
      } catch (err) {
        console.warn('Firestore subscription notice:', err);
      }
    }
  );

  return unsubscribe;
}

// 7. REAL-TIME PRESENCE & CURSOR TRACKING
export async function updateCollaboratorPresence(
  spreadsheetId: string,
  user: { uid: string; displayName?: string; email?: string },
  activeCell: string,
  activeSheet: string
): Promise<void> {
  if (!spreadsheetId || !user?.uid) return;
  const presencePath = `spreadsheets/${spreadsheetId}/presence/${user.uid}`;
  const color = getUserColor(user.uid);

  try {
    await setDoc(doc(db, presencePath), {
      userId: user.uid,
      name: user.displayName || user.email?.split('@')[0] || 'User',
      email: user.email || 'user@omnisheet.io',
      activeCell,
      activeSheet,
      color,
      lastActive: Date.now(),
    });
  } catch (e) {
    // Non-blocking
  }
}

export function subscribeToCollaboratorPresence(
  spreadsheetId: string,
  currentUserId: string,
  onPresenceUpdate: (collaborators: UserPresence[]) => void
): () => void {
  const presenceCollectionPath = `spreadsheets/${spreadsheetId}/presence`;

  const unsubscribe = onSnapshot(
    collection(db, presenceCollectionPath),
    (snapshot) => {
      const active: UserPresence[] = [];
      const threshold = Date.now() - 60000; // active in last 60 seconds

      snapshot.forEach((d) => {
        const data = d.data() as UserPresence;
        // Don't include self and ignore stale presence
        if (data.userId !== currentUserId && data.lastActive > threshold) {
          active.push(data);
        }
      });

      onPresenceUpdate(active);
    },
    (error) => {
      console.warn('Presence snapshot warning:', error);
    }
  );

  return unsubscribe;
}

export async function removeCollaboratorPresence(
  spreadsheetId: string,
  userId: string
): Promise<void> {
  if (!spreadsheetId || !userId) return;
  try {
    await deleteDoc(doc(db, `spreadsheets/${spreadsheetId}/presence/${userId}`));
  } catch (e) {
    // Ignore cleanup errors
  }
}

// 8. AUDIT LOGS
export async function recordAuditLog(
  spreadsheetId: string,
  userId: string,
  action: string
): Promise<void> {
  const auditPath = `spreadsheets/${spreadsheetId}/auditLogs`;
  try {
    await setDoc(doc(collection(db, auditPath)), {
      spreadsheetId,
      userId,
      action,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.warn('Audit log write warning:', error);
  }
}
