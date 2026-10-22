import React, { useState } from 'react';
import { 
  FileSpreadsheet, 
  LogIn, 
  ShieldCheck, 
  Zap, 
  BarChart3, 
  Database, 
  Users, 
  Wifi, 
  ArrowRight,
  Sparkles,
  CheckCircle2,
  Lock,
  Copy,
  AlertTriangle,
  RefreshCw,
  KeyRound,
  ExternalLink
} from 'lucide-react';
import { 
  auth, 
  googleProvider, 
  signInWithPopup, 
  signInWithRedirect,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInAnonymously,
  updateProfile,
  User 
} from '../lib/firebase';
import { syncUserProfile } from '../services/firestoreService';

interface AuthPageProps {
  onLoginSuccess: (user: any) => void;
}

export const AuthPage: React.FC<AuthPageProps> = ({ onLoginSuccess }) => {
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [errorDetails, setErrorDetails] = useState<string | null>(null);
  const [unauthorizedDomain, setUnauthorizedDomain] = useState<string | null>(null);
  const [copiedDomain, setCopiedDomain] = useState(false);
  const [authMode, setAuthMode] = useState<'google' | 'email' | 'guest'>('google');

  // Form states for Email Auth
  const [emailInput, setEmailInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [nameInput, setNameInput] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);

  // Translate Firebase Auth error codes to user-friendly messages
  const parseFirebaseError = (err: any) => {
    const code = err?.code || '';
    const message = err?.message || String(err);
    console.error('Firebase Auth Error:', code, message);

    if (code === 'auth/unauthorized-domain') {
      const currentHost = typeof window !== 'undefined' ? window.location.hostname : '';
      setUnauthorizedDomain(currentHost);
      setErrorMsg('This domain is not yet authorized in your Firebase Project.');
      setErrorDetails(`Please add "${currentHost}" to Firebase Console -> Authentication -> Settings -> Authorized Domains.`);
      return;
    }

    if (code === 'auth/popup-blocked') {
      setErrorMsg('The sign-in popup was blocked by your browser.');
      setErrorDetails('Please click "Allow Popups" for this site, or use the "Continue with Redirect" option below.');
      return;
    }

    if (code === 'auth/popup-closed-by-user') {
      setErrorMsg('Sign-in popup was closed before completing. Please try again.');
      setErrorDetails(null);
      return;
    }

    if (code === 'auth/cancelled-popup-request') {
      setErrorMsg('Sign-in was cancelled. Please try again.');
      setErrorDetails(null);
      return;
    }

    if (code === 'auth/invalid-credential' || code === 'auth/wrong-password' || code === 'auth/user-not-found') {
      setErrorMsg('Invalid email or password. Please check your credentials.');
      setErrorDetails(null);
      return;
    }

    if (code === 'auth/email-already-in-use') {
      setErrorMsg('An account with this email already exists. Try signing in instead.');
      setIsSignUp(false);
      setErrorDetails(null);
      return;
    }

    if (code === 'auth/weak-password') {
      setErrorMsg('Password should be at least 6 characters.');
      setErrorDetails(null);
      return;
    }

    if (code === 'auth/operation-not-allowed') {
      setErrorMsg('This sign-in method is not enabled in Firebase Console.');
      setErrorDetails('Enable Google or Email/Password under Firebase Console -> Authentication -> Sign-in method.');
      return;
    }

    if (code === 'auth/network-request-failed') {
      setErrorMsg('Network error. Please check your internet connection.');
      setErrorDetails(null);
      return;
    }

    setErrorMsg(message || 'Authentication failed. Please try again.');
    setErrorDetails(code ? `Error code: ${code}` : null);
  };

  // 1. Google Sign-In with Popup
  const handleGoogleLoginPopup = async () => {
    setLoading(true);
    setErrorMsg(null);
    setErrorDetails(null);
    setUnauthorizedDomain(null);
    try {
      const result = await signInWithPopup(auth, googleProvider);
      if (result?.user) {
        await syncUserProfile(result.user);
        onLoginSuccess(result.user);
      }
    } catch (err: any) {
      parseFirebaseError(err);
    } finally {
      setLoading(false);
    }
  };

  // 2. Google Sign-In with Redirect (for iframes where popup is blocked)
  const handleGoogleLoginRedirect = async () => {
    setLoading(true);
    setErrorMsg(null);
    setErrorDetails(null);
    setUnauthorizedDomain(null);
    try {
      await signInWithRedirect(auth, googleProvider);
    } catch (err: any) {
      parseFirebaseError(err);
      setLoading(false);
    }
  };

  // 3. Email & Password Sign-In / Registration
  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!emailInput.trim()) {
      setErrorMsg('Please enter a valid email address');
      return;
    }
    if (!passwordInput || passwordInput.length < 6) {
      setErrorMsg('Password must be at least 6 characters');
      return;
    }

    setLoading(true);
    setErrorMsg(null);
    setErrorDetails(null);
    setUnauthorizedDomain(null);

    try {
      if (isSignUp) {
        // Register new Firebase user
        const cred = await createUserWithEmailAndPassword(auth, emailInput.trim(), passwordInput);
        if (cred?.user) {
          if (nameInput.trim()) {
            try {
              await updateProfile(cred.user, { displayName: nameInput.trim() });
            } catch {}
          }
          await syncUserProfile(cred.user);
          onLoginSuccess(cred.user);
        }
      } else {
        // Sign in existing user
        try {
          const cred = await signInWithEmailAndPassword(auth, emailInput.trim(), passwordInput);
          if (cred?.user) {
            await syncUserProfile(cred.user);
            onLoginSuccess(cred.user);
          }
        } catch (signInErr: any) {
          // If user doesn't exist yet, automatically attempt creation
          if (signInErr?.code === 'auth/user-not-found' || signInErr?.code === 'auth/invalid-credential') {
            try {
              const newCred = await createUserWithEmailAndPassword(auth, emailInput.trim(), passwordInput);
              if (newCred?.user) {
                if (nameInput.trim()) {
                  try {
                    await updateProfile(newCred.user, { displayName: nameInput.trim() });
                  } catch {}
                }
                await syncUserProfile(newCred.user);
                onLoginSuccess(newCred.user);
                return;
              }
            } catch (createErr) {
              parseFirebaseError(createErr);
              return;
            }
          }
          throw signInErr;
        }
      }
    } catch (err: any) {
      parseFirebaseError(err);
    } finally {
      setLoading(false);
    }
  };

  // 4. Anonymous / Offline Guest Access
  const handleGuestLogin = async () => {
    setLoading(true);
    setErrorMsg(null);
    setErrorDetails(null);
    setUnauthorizedDomain(null);
    try {
      // First attempt authentic Firebase anonymous auth
      const result = await signInAnonymously(auth);
      if (result?.user) {
        await syncUserProfile(result.user);
        onLoginSuccess(result.user);
        return;
      }
    } catch (anonErr: any) {
      console.warn('Firebase anonymous auth notice:', anonErr?.message || anonErr);
      // Fallback local guest session with clear offline notice
      const localGuestUser = {
        uid: 'guest_' + Math.random().toString(36).substring(2, 9),
        email: 'guest@omnisheet.local',
        displayName: 'Guest User (Local)',
        photoURL: 'https://api.dicebear.com/7.x/initials/svg?seed=Guest',
        isAnonymous: true,
      };
      await syncUserProfile(localGuestUser);
      onLoginSuccess(localGuestUser);
    } finally {
      setLoading(false);
    }
  };

  const copyHostToClipboard = () => {
    if (unauthorizedDomain && navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(unauthorizedDomain);
      setCopiedDomain(true);
      setTimeout(() => setCopiedDomain(false), 3000);
    }
  };

  return (
    <div className="min-h-screen w-screen flex flex-col justify-between bg-slate-950 text-slate-100 font-sans selection:bg-emerald-500 selection:text-white relative overflow-x-hidden">
      {/* Background ambient lighting */}
      <div className="absolute top-0 left-1/4 -z-10 h-96 w-96 rounded-full bg-emerald-600/15 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-0 right-1/4 -z-10 h-96 w-96 rounded-full bg-indigo-600/15 blur-[140px] pointer-events-none" />

      {/* Top Navigation */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-slate-800/80 backdrop-blur-md bg-slate-950/70">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-500 text-white shadow-lg shadow-emerald-950/50">
            <FileSpreadsheet className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight text-white flex items-center gap-2">
              OmniSheet <span className="text-emerald-400 font-extrabold">Pro</span>
            </h1>
            <p className="text-xs text-slate-400">Next-Gen Collaborative Cloud Spreadsheets</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-950/60 px-3 py-1 text-xs font-semibold text-emerald-400 border border-emerald-800/50">
            <ShieldCheck className="h-3.5 w-3.5" />
            Firebase Authentication & Firestore
          </span>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col lg:flex-row items-center justify-center max-w-7xl mx-auto px-6 py-12 gap-12 w-full">
        {/* Left Side: Product Value Proposition */}
        <div className="flex-1 max-w-xl space-y-8 text-center lg:text-left">
          <div className="space-y-4">
            <div className="inline-flex items-center gap-2 rounded-full bg-slate-900 border border-slate-800 px-3 py-1 text-xs font-medium text-emerald-400">
              <Sparkles className="h-3.5 w-3.5" />
              <span>Full Google Sheets Formula Engine & Data Visualization</span>
            </div>
            <h2 className="text-4xl lg:text-5xl font-extrabold tracking-tight text-white leading-tight">
              Collaborative spreadsheets built for <span className="bg-gradient-to-r from-emerald-400 to-teal-300 bg-clip-text text-transparent">speed and cloud power</span>.
            </h2>
            <p className="text-slate-400 text-base leading-relaxed">
              Real-time multi-sheet grid with live Firestore synchronization, complex formula evaluation (SUM, VLOOKUP, IF), rich charts, role-based security, and offline support.
            </p>
          </div>

          {/* Feature Highlights Grid */}
          <div className="grid grid-cols-2 gap-4 pt-2">
            <div className="flex items-start gap-3 p-3.5 rounded-xl bg-slate-900/60 border border-slate-800/60">
              <div className="p-2 rounded-lg bg-emerald-950 text-emerald-400 border border-emerald-800/50">
                <Database className="h-4 w-4" />
              </div>
              <div className="text-left">
                <h4 className="text-sm font-semibold text-slate-200">Firestore Storage</h4>
                <p className="text-xs text-slate-400">Automatic persistent cloud saves & real-time docs</p>
              </div>
            </div>

            <div className="flex items-start gap-3 p-3.5 rounded-xl bg-slate-900/60 border border-slate-800/60">
              <div className="p-2 rounded-lg bg-sky-950 text-sky-400 border border-sky-800/50">
                <BarChart3 className="h-4 w-4" />
              </div>
              <div className="text-left">
                <h4 className="text-sm font-semibold text-slate-200">Data Analytics</h4>
                <p className="text-xs text-slate-400">Interactive Bar, Line, Area & Pie charts</p>
              </div>
            </div>

            <div className="flex items-start gap-3 p-3.5 rounded-xl bg-slate-900/60 border border-slate-800/60">
              <div className="p-2 rounded-lg bg-indigo-950 text-indigo-400 border border-indigo-800/50">
                <Users className="h-4 w-4" />
              </div>
              <div className="text-left">
                <h4 className="text-sm font-semibold text-slate-200">RBAC Controls</h4>
                <p className="text-xs text-slate-400">Owner, Editor & Viewer security permissions</p>
              </div>
            </div>

            <div className="flex items-start gap-3 p-3.5 rounded-xl bg-slate-900/60 border border-slate-800/60">
              <div className="p-2 rounded-lg bg-amber-950 text-amber-400 border border-amber-800/50">
                <Wifi className="h-4 w-4" />
              </div>
              <div className="text-left">
                <h4 className="text-sm font-semibold text-slate-200">Offline Syncing</h4>
                <p className="text-xs text-slate-400">PWA compliant, local caching & sync queue</p>
              </div>
            </div>
          </div>
        </div>

        {/* Right Side: Authentication Box */}
        <div className="w-full max-w-md bg-slate-900/90 border border-slate-800 rounded-3xl p-8 shadow-2xl backdrop-blur-xl relative">
          <div className="mb-6 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-800 border border-slate-700 text-emerald-400 mb-3 shadow-inner">
              <Lock className="h-6 w-6" />
            </div>
            <h3 className="text-xl font-bold text-white">Sign In to OmniSheet Pro</h3>
            <p className="text-xs text-slate-400 mt-1">
              Authenticate via Firebase to access real-time spreadsheets & cloud sync
            </p>
          </div>

          {/* Error & Diagnostic Banner */}
          {errorMsg && (
            <div className="mb-5 rounded-2xl bg-red-950/60 border border-red-800/80 p-4 text-xs text-red-200 shadow-lg">
              <div className="flex items-start gap-2.5">
                <AlertTriangle className="h-4 w-4 shrink-0 text-red-400 mt-0.5" />
                <div className="flex-1 space-y-1">
                  <p className="font-semibold text-red-100">{errorMsg}</p>
                  {errorDetails && (
                    <p className="text-[11px] text-red-300/90 leading-relaxed font-mono">
                      {errorDetails}
                    </p>
                  )}
                </div>
              </div>

              {/* Special resolution helper for unauthorized domain */}
              {unauthorizedDomain && (
                <div className="mt-3 pt-3 border-t border-red-800/60">
                  <p className="text-[11px] text-slate-300 mb-2">
                    Add this domain to Firebase Console &gt; Authentication &gt; Settings &gt; Authorized domains:
                  </p>
                  <div className="flex items-center justify-between gap-2 bg-slate-950/90 rounded-xl px-3 py-1.5 border border-slate-800 font-mono text-[11px]">
                    <span className="truncate text-emerald-400">{unauthorizedDomain}</span>
                    <button
                      type="button"
                      onClick={copyHostToClipboard}
                      className="shrink-0 flex items-center gap-1 px-2 py-0.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-sans text-[10px] transition"
                    >
                      {copiedDomain ? <CheckCircle2 className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                      <span>{copiedDomain ? 'Copied' : 'Copy'}</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Mode Switch Tabs */}
          <div className="flex rounded-xl bg-slate-950 p-1 border border-slate-800 mb-6">
            <button
              onClick={() => {
                setAuthMode('google');
                setErrorMsg(null);
              }}
              className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition ${
                authMode === 'google' 
                  ? 'bg-emerald-600 text-white shadow-sm' 
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Google Auth
            </button>
            <button
              onClick={() => {
                setAuthMode('email');
                setErrorMsg(null);
              }}
              className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition ${
                authMode === 'email' 
                  ? 'bg-emerald-600 text-white shadow-sm' 
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Email &amp; Password
            </button>
            <button
              onClick={() => {
                setAuthMode('guest');
                setErrorMsg(null);
              }}
              className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition ${
                authMode === 'guest' 
                  ? 'bg-emerald-600 text-white shadow-sm' 
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Guest Demo
            </button>
          </div>

          {/* TAB 1: GOOGLE AUTH */}
          {authMode === 'google' && (
            <div className="space-y-4">
              <button
                onClick={handleGoogleLoginPopup}
                disabled={loading}
                className="w-full flex items-center justify-center gap-3 rounded-xl bg-white hover:bg-slate-100 text-slate-900 font-semibold py-3 px-4 shadow-lg transition active:scale-[0.99] disabled:opacity-50"
              >
                <svg className="h-5 w-5" viewBox="0 0 24 24">
                  <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                  />
                </svg>
                <span>{loading ? 'Connecting to Google...' : 'Continue with Google Account'}</span>
              </button>

              {/* Redirect Fallback if popup is blocked */}
              <div className="pt-2 text-center">
                <button
                  type="button"
                  onClick={handleGoogleLoginRedirect}
                  disabled={loading}
                  className="text-[11px] text-slate-400 hover:text-emerald-400 underline transition"
                >
                  Popup blocked? Try Redirect Sign-In instead
                </button>
              </div>
            </div>
          )}

          {/* TAB 2: EMAIL & PASSWORD AUTH */}
          {authMode === 'email' && (
            <form onSubmit={handleEmailAuth} className="space-y-3.5">
              {isSignUp && (
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Your Full Name</label>
                  <input
                    type="text"
                    value={nameInput}
                    onChange={(e) => setNameInput(e.target.value)}
                    placeholder="e.g. Arijit Pyne"
                    className="w-full rounded-xl bg-slate-950 px-3.5 py-2.5 text-sm text-white placeholder-slate-500 border border-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Email Address</label>
                <input
                  type="email"
                  value={emailInput}
                  onChange={(e) => setEmailInput(e.target.value)}
                  placeholder="name@example.com"
                  required
                  className="w-full rounded-xl bg-slate-950 px-3.5 py-2.5 text-sm text-white placeholder-slate-500 border border-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Password</label>
                <input
                  type="password"
                  value={passwordInput}
                  onChange={(e) => setPasswordInput(e.target.value)}
                  placeholder="At least 6 characters"
                  required
                  className="w-full rounded-xl bg-slate-950 px-3.5 py-2.5 text-sm text-white placeholder-slate-500 border border-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold py-3 px-4 shadow-lg shadow-emerald-950/40 transition active:scale-[0.99] disabled:opacity-50"
              >
                {loading ? (
                  <RefreshCw className="h-4 w-4 animate-spin" />
                ) : (
                  <KeyRound className="h-4 w-4" />
                )}
                <span>{isSignUp ? 'Create Firebase Account' : 'Sign In with Firebase'}</span>
              </button>

              <div className="flex items-center justify-between text-[11px] pt-1 text-slate-400">
                <button
                  type="button"
                  onClick={() => setIsSignUp(!isSignUp)}
                  className="hover:text-emerald-400 underline transition"
                >
                  {isSignUp ? 'Already have an account? Sign In' : 'Need an account? Register'}
                </button>
              </div>
            </form>
          )}

          {/* TAB 3: GUEST DEMO ACCESS */}
          {authMode === 'guest' && (
            <div className="space-y-4">
              <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 text-left space-y-2">
                <div className="flex items-center gap-2 text-amber-400 text-xs font-semibold">
                  <Zap className="h-4 w-4" />
                  <span>Sandbox Quick Access</span>
                </div>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Sign in anonymously or explore the app with local spreadsheet storage and full formula calculation.
                </p>
              </div>

              <button
                type="button"
                onClick={handleGuestLogin}
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-semibold py-3 px-4 shadow-lg border border-slate-700 transition active:scale-[0.99] disabled:opacity-50"
              >
                <LogIn className="h-4 w-4 text-emerald-400" />
                <span>{loading ? 'Entering Sandbox...' : 'Continue as Guest'}</span>
              </button>
            </div>
          )}

          <div className="mt-6 pt-5 border-t border-slate-800/80 text-center">
            <p className="text-[11px] text-slate-400">
              Secured with Firebase Authentication and Firestore Security Rules.
            </p>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="px-6 py-4 border-t border-slate-800/60 text-center text-xs text-slate-400 flex flex-col sm:flex-row items-center justify-between gap-2">
        <p>© 2026 OmniSheet Pro — All sheet data persisted to Google Cloud Firestore</p>
        <div className="flex items-center gap-4 text-slate-400">
          <span>Real-time Multi-Sheet</span>
          <span>•</span>
          <span>Offline Ready</span>
          <span>•</span>
          <span>Zero Configuration</span>
        </div>
      </footer>
    </div>
  );
};
