import React, { useState, useEffect } from 'react';
import { 
  X, 
  Users, 
  Shield, 
  UserPlus, 
  Globe, 
  Lock, 
  Search, 
  Check, 
  Trash2, 
  Eye, 
  Edit3, 
  MessageSquare,
  Sparkles,
  ShieldAlert,
  ShieldCheck
} from 'lucide-react';
import { 
  SpreadsheetCollaborator, 
  CollaboratorRole, 
  UserProfile, 
  getExistingUsers 
} from '../services/firestoreService';

interface ShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  spreadsheetId: string | null;
  currentUser: any;
  collaborators: SpreadsheetCollaborator[];
  onAddCollaborator: (collaborator: SpreadsheetCollaborator) => Promise<void> | void;
  onRemoveCollaborator?: (email: string) => Promise<void> | void;
  isPublic: boolean;
  setIsPublic: (isPublic: boolean) => void;
  theme?: 'dark' | 'light';
}

export const ShareModal: React.FC<ShareModalProps> = ({
  isOpen,
  onClose,
  spreadsheetId,
  currentUser,
  collaborators,
  onAddCollaborator,
  onRemoveCollaborator,
  isPublic,
  setIsPublic,
  theme = 'dark',
}) => {
  const [email, setEmail] = useState('');
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);
  const [role, setRole] = useState<CollaboratorRole>('editor');
  const [existingUsers, setExistingUsers] = useState<UserProfile[]>([]);
  const [userSearchQuery, setUserSearchQuery] = useState('');
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [inviting, setInviting] = useState(false);
  const [successToast, setSuccessToast] = useState<string | null>(null);

  const isDark = theme === 'dark';

  useEffect(() => {
    if (isOpen) {
      setLoadingUsers(true);
      getExistingUsers(currentUser?.uid)
        .then((users) => {
          setExistingUsers(users);
        })
        .finally(() => {
          setLoadingUsers(false);
        });
    } else {
      setEmail('');
      setSelectedUser(null);
      setUserSearchQuery('');
      setSuccessToast(null);
    }
  }, [isOpen, currentUser]);

  if (!isOpen) return null;

  const handleSelectUser = (user: UserProfile) => {
    setSelectedUser(user);
    setEmail(user.email);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const targetEmail = (email || selectedUser?.email || '').trim().toLowerCase();
    if (!targetEmail) return;

    setInviting(true);
    try {
      const newCollab: SpreadsheetCollaborator = {
        email: targetEmail,
        role,
        userId: selectedUser?.uid,
        displayName: selectedUser?.displayName || targetEmail.split('@')[0],
        photoURL: selectedUser?.photoURL,
        invitedAt: new Date().toISOString(),
      };

      await onAddCollaborator(newCollab);
      setSuccessToast(`Invited ${newCollab.displayName || targetEmail} as ${role.toUpperCase()}! This spreadsheet will now appear in their dashboard under "Shared with You".`);
      setEmail('');
      setSelectedUser(null);
      setTimeout(() => setSuccessToast(null), 5000);
    } catch (err) {
      console.error('Failed to invite collaborator:', err);
    } finally {
      setInviting(false);
    }
  };

  const handleRemove = async (collabEmail: string) => {
    if (onRemoveCollaborator) {
      await onRemoveCollaborator(collabEmail);
      setSuccessToast(`Removed ${collabEmail} from spreadsheet.`);
      setTimeout(() => setSuccessToast(null), 4000);
    }
  };

  // Filter existing users by search query
  const filteredExistingUsers = existingUsers.filter((u) => {
    const q = userSearchQuery.toLowerCase();
    return u.email.toLowerCase().includes(q) || u.displayName.toLowerCase().includes(q);
  });

  const modalBg = isDark ? 'bg-slate-900 border-slate-800 text-slate-100' : 'bg-white border-slate-200 text-slate-900';
  const cardBg = isDark ? 'bg-slate-950/80 border-slate-800' : 'bg-slate-50 border-slate-200';
  const inputBg = isDark ? 'bg-slate-950 border-slate-800 text-white placeholder-slate-500' : 'bg-white border-slate-300 text-slate-900 placeholder-slate-400';

  const getRoleBadge = (r: CollaboratorRole) => {
    switch (r) {
      case 'owner':
        return (
          <span className="flex items-center gap-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 px-2.5 py-0.5 text-[10px] font-bold text-emerald-400">
            <ShieldCheck className="h-3 w-3" /> Owner
          </span>
        );
      case 'editor':
        return (
          <span className="flex items-center gap-1 rounded-full bg-blue-500/10 border border-blue-500/30 px-2.5 py-0.5 text-[10px] font-bold text-blue-400">
            <Edit3 className="h-3 w-3" /> Editor (Full Edit)
          </span>
        );
      case 'commenter':
        return (
          <span className="flex items-center gap-1 rounded-full bg-amber-500/10 border border-amber-500/30 px-2.5 py-0.5 text-[10px] font-bold text-amber-400">
            <MessageSquare className="h-3 w-3" /> Commenter
          </span>
        );
      case 'viewer':
      default:
        return (
          <span className="flex items-center gap-1 rounded-full bg-purple-500/10 border border-purple-500/30 px-2.5 py-0.5 text-[10px] font-bold text-purple-400">
            <Eye className="h-3 w-3" /> Viewer (Read Only)
          </span>
        );
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-4">
      <div className={`flex flex-col w-full max-w-xl max-h-[90vh] rounded-2xl border shadow-2xl overflow-hidden transition-colors ${modalBg}`}>
        {/* Header */}
        <div className={`flex items-center justify-between border-b px-6 py-4 ${isDark ? 'border-slate-800' : 'border-slate-200'}`}>
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-500">
              <Users className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-base font-bold">Share Spreadsheet & RBAC Access</h2>
              <p className={`text-[11px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                Invite Firestore users and manage role-based permissions
              </p>
            </div>
          </div>
          <button 
            onClick={onClose} 
            className={`rounded-lg p-1.5 transition ${isDark ? 'text-slate-400 hover:bg-slate-800 hover:text-white' : 'text-slate-500 hover:bg-slate-100'}`}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="p-6 space-y-6 overflow-y-auto">
          {/* Success Notification */}
          {successToast && (
            <div className="flex items-start gap-2.5 rounded-xl border border-emerald-500/30 bg-emerald-950/40 p-3 text-xs text-emerald-300">
              <Sparkles className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
              <span>{successToast}</span>
            </div>
          )}

          {/* Public Link toggle */}
          <div className={`flex items-center justify-between rounded-xl p-3.5 border ${cardBg}`}>
            <div className="flex items-center gap-3">
              {isPublic ? <Globe className="h-5 w-5 text-emerald-500" /> : <Lock className="h-5 w-5 text-slate-400" />}
              <div>
                <h4 className="text-xs font-bold">{isPublic ? 'Public Access Enabled' : 'Restricted Access'}</h4>
                <p className={`text-[11px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                  {isPublic ? 'Anyone with the link can view. Specific RBAC permissions apply to invited users.' : 'Only invited collaborators can access this document.'}
                </p>
              </div>
            </div>
            <button
              onClick={() => setIsPublic(!isPublic)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                isPublic ? 'bg-emerald-600 text-white hover:bg-emerald-500' : isDark ? 'bg-slate-800 text-slate-300 hover:bg-slate-700' : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
              }`}
            >
              {isPublic ? 'Make Private' : 'Make Public'}
            </button>
          </div>

          {/* 1. SELECT EXISTING FIRESTORE USERS */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <h3 className={`text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 ${isDark ? 'text-emerald-400' : 'text-emerald-600'}`}>
                <Users className="h-3.5 w-3.5" />
                Existing Users in Firestore
              </h3>
              <span className={`text-[10px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                {filteredExistingUsers.length} user{filteredExistingUsers.length === 1 ? '' : 's'} available
              </span>
            </div>

            {/* Quick search existing users */}
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
              <input
                type="text"
                placeholder="Search registered Firestore users by name or email..."
                value={userSearchQuery}
                onChange={(e) => setUserSearchQuery(e.target.value)}
                className={`w-full rounded-xl py-2 pl-9 pr-3 text-xs border focus:outline-none focus:ring-2 focus:ring-emerald-500 ${inputBg}`}
              />
            </div>

            {/* User pills / cards list */}
            {loadingUsers ? (
              <div className="py-4 text-center text-xs text-slate-400">Loading Firestore users...</div>
            ) : filteredExistingUsers.length === 0 ? (
              <div className={`p-3 text-center text-xs rounded-xl border border-dashed ${isDark ? 'border-slate-800 text-slate-500' : 'border-slate-200 text-slate-400'}`}>
                No other registered users found. You can invite anyone by typing their email below!
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-36 overflow-y-auto pr-1">
                {filteredExistingUsers.map((u) => {
                  const isSelected = selectedUser?.uid === u.uid || email.toLowerCase() === u.email.toLowerCase();
                  const alreadyInvited = collaborators.some(c => c.email.toLowerCase() === u.email.toLowerCase());

                  return (
                    <button
                      key={u.uid}
                      type="button"
                      onClick={() => handleSelectUser(u)}
                      className={`flex items-center gap-2.5 p-2 rounded-xl border text-left transition ${
                        isSelected
                          ? 'border-emerald-500 bg-emerald-500/10'
                          : alreadyInvited
                          ? isDark ? 'border-slate-800 bg-slate-900/50 opacity-60' : 'border-slate-200 bg-slate-100 opacity-60'
                          : isDark ? 'border-slate-800 bg-slate-950 hover:border-slate-700 hover:bg-slate-900' : 'border-slate-200 bg-white hover:border-slate-300'
                      }`}
                    >
                      <img
                        src={u.photoURL || `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(u.displayName)}`}
                        alt={u.displayName}
                        className="h-7 w-7 rounded-full border border-emerald-500/40 object-cover shrink-0"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold truncate leading-tight flex items-center gap-1">
                          {u.displayName}
                          {isSelected && <Check className="h-3 w-3 text-emerald-500 shrink-0" />}
                        </p>
                        <p className={`text-[10px] truncate ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                          {u.email}
                        </p>
                      </div>
                      {alreadyInvited && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 font-mono">
                          Invited
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* 2. INVITE FORM WITH RBAC ROLES */}
          <form onSubmit={handleSubmit} className="space-y-3.5 pt-2 border-t border-slate-800/80">
            <div className="flex items-center justify-between">
              <h3 className={`text-xs font-bold uppercase tracking-wider ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                Invite Collaborator & Assign RBAC
              </h3>
              {selectedUser && (
                <button
                  type="button"
                  onClick={() => { setSelectedUser(null); setEmail(''); }}
                  className="text-[10px] text-emerald-500 hover:underline"
                >
                  Clear Selection
                </button>
              )}
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
              <input
                type="email"
                placeholder="colleague@example.com"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (selectedUser && e.target.value.toLowerCase() !== selectedUser.email.toLowerCase()) {
                    setSelectedUser(null);
                  }
                }}
                required
                className={`flex-1 rounded-xl px-3.5 py-2 text-xs border focus:outline-none focus:ring-2 focus:ring-emerald-500 ${inputBg}`}
              />

              <select
                value={role}
                onChange={(e) => setRole(e.target.value as CollaboratorRole)}
                className={`rounded-xl px-3.5 py-2 text-xs border focus:outline-none focus:ring-2 focus:ring-emerald-500 ${inputBg}`}
              >
                <option value="editor">Editor (Can edit & calculate)</option>
                <option value="commenter">Commenter (Can view & comment)</option>
                <option value="viewer">Viewer (Read-only access)</option>
              </select>

              <button
                type="submit"
                disabled={inviting || !email.trim()}
                className="flex items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-500 transition shadow-sm disabled:opacity-50"
              >
                <UserPlus className="h-4 w-4" />
                {inviting ? 'Sharing...' : 'Share Sheet'}
              </button>
            </div>

            {/* RBAC Role descriptions */}
            <div className={`p-2.5 rounded-xl border text-[11px] grid grid-cols-3 gap-2 text-center ${cardBg}`}>
              <div className="space-y-0.5">
                <p className="font-bold text-blue-400">Editor</p>
                <p className={`text-[10px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Edits cells & formulas</p>
              </div>
              <div className="space-y-0.5">
                <p className="font-bold text-amber-400">Commenter</p>
                <p className={`text-[10px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Views & logs feedback</p>
              </div>
              <div className="space-y-0.5">
                <p className="font-bold text-purple-400">Viewer</p>
                <p className={`text-[10px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Strictly read-only</p>
              </div>
            </div>
          </form>

          {/* 3. CURRENT COLLABORATORS LIST */}
          <div className="space-y-2.5 pt-2 border-t border-slate-800/80">
            <div className="flex items-center justify-between">
              <h3 className={`text-xs font-bold uppercase tracking-wider ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                Collaborators on this Sheet ({collaborators.length})
              </h3>
            </div>

            <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
              {collaborators.map((c, i) => {
                const isOwner = c.role === 'owner';
                const isCurrent = currentUser?.email && c.email.toLowerCase() === currentUser.email.toLowerCase();

                return (
                  <div key={i} className={`flex items-center justify-between rounded-xl px-3.5 py-2.5 border ${cardBg}`}>
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-950 text-emerald-400 font-bold text-xs border border-emerald-800 shrink-0">
                        {c.displayName ? c.displayName.charAt(0).toUpperCase() : c.email.charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p className="text-xs font-semibold truncate">
                            {c.displayName || c.email.split('@')[0]}
                          </p>
                          {isCurrent && (
                            <span className="text-[9px] px-1 rounded bg-slate-800 text-slate-300 font-mono">You</span>
                          )}
                        </div>
                        <p className={`text-[10px] truncate ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{c.email}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {getRoleBadge(c.role)}

                      {!isOwner && onRemoveCollaborator && (
                        <button
                          type="button"
                          onClick={() => handleRemove(c.email)}
                          title="Revoke collaborator access"
                          className="rounded-lg p-1 text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
