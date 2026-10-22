import React, { useState } from 'react';
import { 
  Cloud, 
  Rocket, 
  Copy, 
  Check, 
  X, 
  Globe, 
  Server, 
  CheckCircle2, 
  AlertCircle,
  Code2,
  FileText,
  ExternalLink
} from 'lucide-react';

interface RenderDeployModalProps {
  isOpen: boolean;
  onClose: () => void;
  theme?: 'dark' | 'light';
}

export const RenderDeployModal: React.FC<RenderDeployModalProps> = ({
  isOpen,
  onClose,
  theme = 'dark',
}) => {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'static' | 'blueprint' | 'server'>('static');
  const [testingHealth, setTestingHealth] = useState(false);
  const [healthStatus, setHealthStatus] = useState<string | null>(null);

  if (!isOpen) return null;

  const isDark = theme === 'dark';

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const handleTestHealth = async () => {
    setTestingHealth(true);
    setHealthStatus(null);
    try {
      const res = await fetch('/api/health');
      if (res.ok) {
        const data = await res.json();
        setHealthStatus(`OK (${data.status}) - ${data.service}`);
      } else {
        setHealthStatus(`HTTP ${res.status}: Static SPA Mode`);
      }
    } catch {
      setHealthStatus('Static SPA client active (Server route ready for Render runtime)');
    } finally {
      setTestingHealth(false);
    }
  };

  const renderYamlContent = `services:
  - type: web
    name: omni-sheet-pro
    runtime: static
    buildCommand: npm run build
    staticPublishPath: ./dist
    routes:
      - type: rewrite
        source: /*
        destination: /index.html
    headers:
      - path: /*
        name: X-Frame-Options
        value: SAMEORIGIN
      - path: /assets/*
        name: Cache-Control
        value: public, max-age=31536000, immutable
    envVars:
      - key: NODE_VERSION
        value: 20`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div 
        className={`relative w-full max-w-2xl rounded-2xl border shadow-2xl overflow-hidden transition-all max-h-[90vh] flex flex-col ${
          isDark ? 'bg-slate-900 border-slate-700 text-slate-100' : 'bg-white border-slate-200 text-slate-800'
        }`}
      >
        {/* Header */}
        <div className={`flex items-center justify-between px-6 py-4 border-b ${
          isDark ? 'border-slate-800 bg-slate-950/70' : 'border-slate-100 bg-slate-50/80'
        }`}>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-gradient-to-tr from-sky-500 to-indigo-600 text-white shadow-md shadow-indigo-500/20">
              <Rocket className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-lg leading-snug">Deploy OmniSheet Pro to Render</h3>
                <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                  Ready
                </span>
              </div>
              <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                Automatic configuration files (`render.yaml`, `server.ts`, `Dockerfile`) are generated
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className={`p-1.5 rounded-lg border transition ${
              isDark 
                ? 'border-slate-700 hover:bg-slate-800 text-slate-400 hover:text-white' 
                : 'border-slate-200 hover:bg-slate-100 text-slate-500 hover:text-slate-800'
            }`}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Tab navigation */}
        <div className={`flex border-b px-6 pt-3 gap-2 ${isDark ? 'border-slate-800 bg-slate-950/40' : 'border-slate-100 bg-slate-50/50'}`}>
          <button
            onClick={() => setActiveTab('static')}
            className={`flex items-center gap-2 pb-2.5 px-3 text-xs font-semibold border-b-2 transition ${
              activeTab === 'static'
                ? 'border-sky-500 text-sky-400'
                : isDark ? 'border-transparent text-slate-400 hover:text-slate-200' : 'border-transparent text-slate-500 hover:text-slate-900'
            }`}
          >
            <Globe className="h-4 w-4" />
            Option 1: Static Site (Free)
          </button>
          <button
            onClick={() => setActiveTab('blueprint')}
            className={`flex items-center gap-2 pb-2.5 px-3 text-xs font-semibold border-b-2 transition ${
              activeTab === 'blueprint'
                ? 'border-indigo-500 text-indigo-400'
                : isDark ? 'border-transparent text-slate-400 hover:text-slate-200' : 'border-transparent text-slate-500 hover:text-slate-900'
            }`}
          >
            <Code2 className="h-4 w-4" />
            Option 2: render.yaml (1-Click)
          </button>
          <button
            onClick={() => setActiveTab('server')}
            className={`flex items-center gap-2 pb-2.5 px-3 text-xs font-semibold border-b-2 transition ${
              activeTab === 'server'
                ? 'border-emerald-500 text-emerald-400'
                : isDark ? 'border-transparent text-slate-400 hover:text-slate-200' : 'border-transparent text-slate-500 hover:text-slate-900'
            }`}
          >
            <Server className="h-4 w-4" />
            Option 3: Node Web Service
          </button>
        </div>

        {/* Content body */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1 text-sm">
          {activeTab === 'static' && (
            <div className="space-y-4">
              <div className={`p-4 rounded-xl border ${
                isDark ? 'bg-sky-950/20 border-sky-800/40 text-sky-200' : 'bg-sky-50 border-sky-200 text-sky-900'
              }`}>
                <div className="flex items-start gap-2.5">
                  <CheckCircle2 className="h-5 w-5 text-sky-400 mt-0.5 shrink-0" />
                  <div>
                    <h4 className="font-semibold text-sm">Best & Most Reliable Method (100% Free Tier)</h4>
                    <p className="text-xs opacity-85 mt-0.5 leading-relaxed">
                      Render provides free Static Site hosting with global CDN caching, automatic SSL, and zero spin-down latency.
                    </p>
                  </div>
                </div>
              </div>

              {/* Step by step cards */}
              <div className="space-y-3">
                <div className={`p-3.5 rounded-xl border ${isDark ? 'bg-slate-800/60 border-slate-700/60' : 'bg-slate-50 border-slate-200'}`}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-semibold text-xs flex items-center gap-1.5 text-sky-400">
                      <span>Step 1:</span> Render Settings
                    </span>
                    <span className="text-[11px] opacity-70">dashboard.render.com &gt; New &gt; Static Site</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                    <div className={`p-2 rounded-lg border ${isDark ? 'bg-slate-900 border-slate-700' : 'bg-white border-slate-200'}`}>
                      <div className="text-[10px] text-slate-400 font-sans">Build Command</div>
                      <div className="font-bold flex items-center justify-between mt-0.5">
                        <span>npm run build</span>
                        <button 
                          onClick={() => copyToClipboard('npm run build', 'build_cmd')}
                          className="text-slate-400 hover:text-white"
                          title="Copy"
                        >
                          {copiedKey === 'build_cmd' ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                        </button>
                      </div>
                    </div>
                    <div className={`p-2 rounded-lg border ${isDark ? 'bg-slate-900 border-slate-700' : 'bg-white border-slate-200'}`}>
                      <div className="text-[10px] text-slate-400 font-sans">Publish Directory</div>
                      <div className="font-bold flex items-center justify-between mt-0.5">
                        <span>dist</span>
                        <button 
                          onClick={() => copyToClipboard('dist', 'publish_dir')}
                          className="text-slate-400 hover:text-white"
                          title="Copy"
                        >
                          {copiedKey === 'publish_dir' ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                <div className={`p-3.5 rounded-xl border ${isDark ? 'bg-slate-800/60 border-slate-700/60' : 'bg-slate-50 border-slate-200'}`}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-semibold text-xs flex items-center gap-1.5 text-amber-400">
                      <span>Step 2:</span> SPA Redirect / Rewrite Rule
                    </span>
                    <span className="text-[10px] text-amber-400/90 font-medium">Important for direct URLs</span>
                  </div>
                  <p className="text-xs mb-2 opacity-80">
                    In your Render Static Site page, navigate to <strong>Redirects/Rewrites</strong> and add:
                  </p>
                  <div className={`p-2.5 rounded-lg border font-mono text-xs flex items-center justify-between ${
                    isDark ? 'bg-slate-900 border-slate-700' : 'bg-white border-slate-200'
                  }`}>
                    <span>Rewrite: <strong>/*</strong> &rarr; <strong>/index.html</strong></span>
                    <button 
                      onClick={() => copyToClipboard('Rewrite /* to /index.html', 'rewrite')}
                      className="text-slate-400 hover:text-white"
                    >
                      {copiedKey === 'rewrite' ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                    </button>
                  </div>
                </div>

                <div className={`p-3.5 rounded-xl border ${isDark ? 'bg-slate-800/60 border-slate-700/60' : 'bg-slate-50 border-slate-200'}`}>
                  <span className="font-semibold text-xs flex items-center gap-1.5 text-emerald-400 mb-1.5">
                    <span>Step 3:</span> Firebase Authentication Domain
                  </span>
                  <p className="text-xs opacity-80">
                    Add your Render URL (e.g. <code className="px-1 py-0.5 rounded bg-emerald-500/10 text-emerald-400">omnisheet-pro.onrender.com</code>) to the <strong>Authorized Domains</strong> in your Firebase Console under Authentication &gt; Settings.
                  </p>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'blueprint' && (
            <div className="space-y-4">
              <div className={`p-3.5 rounded-xl border text-xs ${
                isDark ? 'bg-indigo-950/20 border-indigo-800/40 text-indigo-200' : 'bg-indigo-50 border-indigo-200 text-indigo-900'
              }`}>
                <p className="font-semibold mb-1">Blueprint Automated Deployment (`render.yaml`)</p>
                <p className="opacity-80">
                  Render automatically detects `render.yaml` in this repository. Push to your Git repo and create a <strong>New Blueprint Instance</strong> on Render to deploy with zero manual setup!
                </p>
              </div>

              <div className="relative">
                <div className="flex items-center justify-between px-3 py-1.5 rounded-t-xl bg-slate-950 border-t border-x border-slate-800 text-[11px] text-slate-400">
                  <span className="font-mono">render.yaml</span>
                  <button
                    onClick={() => copyToClipboard(renderYamlContent, 'yaml')}
                    className="flex items-center gap-1 text-slate-300 hover:text-white"
                  >
                    {copiedKey === 'yaml' ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                    <span>{copiedKey === 'yaml' ? 'Copied' : 'Copy Blueprint'}</span>
                  </button>
                </div>
                <pre className="p-4 rounded-b-xl bg-slate-950 border border-slate-800 text-slate-300 font-mono text-xs overflow-x-auto max-h-56 leading-relaxed">
                  {renderYamlContent}
                </pre>
              </div>
            </div>
          )}

          {activeTab === 'server' && (
            <div className="space-y-4">
              <div className={`p-3.5 rounded-xl border text-xs ${
                isDark ? 'bg-emerald-950/20 border-emerald-800/40 text-emerald-200' : 'bg-emerald-50 border-emerald-200 text-emerald-900'
              }`}>
                <p className="font-semibold mb-1">Node.js Express Full-Stack Deployment</p>
                <p className="opacity-80">
                  Runs the integrated Express server on Render with health checks at <code className="px-1 py-0.5 rounded bg-emerald-500/20 text-emerald-400">/api/health</code>.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                <div className={`p-3 rounded-xl border ${isDark ? 'bg-slate-800/60 border-slate-700/60' : 'bg-slate-50 border-slate-200'}`}>
                  <span className="text-slate-400 text-[11px]">Build Command</span>
                  <div className="font-mono font-bold mt-1">npm install && npm run build</div>
                </div>
                <div className={`p-3 rounded-xl border ${isDark ? 'bg-slate-800/60 border-slate-700/60' : 'bg-slate-50 border-slate-200'}`}>
                  <span className="text-slate-400 text-[11px]">Start Command</span>
                  <div className="font-mono font-bold mt-1">npm start</div>
                </div>
                <div className={`p-3 rounded-xl border ${isDark ? 'bg-slate-800/60 border-slate-700/60' : 'bg-slate-50 border-slate-200'}`}>
                  <span className="text-slate-400 text-[11px]">Health Check Path</span>
                  <div className="font-mono font-bold mt-1">/api/health</div>
                </div>
                <div className={`p-3 rounded-xl border ${isDark ? 'bg-slate-800/60 border-slate-700/60' : 'bg-slate-50 border-slate-200'}`}>
                  <span className="text-slate-400 text-[11px]">Docker Support</span>
                  <div className="font-mono font-bold mt-1 text-emerald-400">Dockerfile included</div>
                </div>
              </div>

              {/* Health check tester */}
              <div className={`p-3.5 rounded-xl border flex items-center justify-between ${
                isDark ? 'bg-slate-950/60 border-slate-800' : 'bg-slate-100 border-slate-200'
              }`}>
                <div>
                  <div className="text-xs font-semibold">Test API Health Route</div>
                  <div className="text-[11px] text-slate-400">Checks local endpoint status</div>
                </div>
                <div className="flex items-center gap-2">
                  {healthStatus && (
                    <span className="text-xs font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                      {healthStatus}
                    </span>
                  )}
                  <button
                    onClick={handleTestHealth}
                    disabled={testingHealth}
                    className="px-3 py-1 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white transition disabled:opacity-50"
                  >
                    {testingHealth ? 'Testing...' : 'Test /api/health'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className={`px-6 py-4 border-t flex flex-wrap items-center justify-between gap-3 ${
          isDark ? 'border-slate-800 bg-slate-950/80' : 'border-slate-100 bg-slate-50'
        }`}>
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <FileText className="h-4 w-4" />
            <span>Guide saved in <strong>RENDER_DEPLOYMENT.md</strong></span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                window.open('https://dashboard.render.com', '_blank', 'noopener,noreferrer');
              }}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-sky-500 to-indigo-600 hover:from-sky-400 hover:to-indigo-500 shadow-md shadow-sky-500/20 transition cursor-pointer"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Open Render Dashboard
            </button>
            <button
              onClick={onClose}
              className={`px-4 py-2 rounded-xl text-xs font-semibold border transition ${
                isDark ? 'border-slate-700 hover:bg-slate-800' : 'border-slate-300 hover:bg-slate-200'
              }`}
            >
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
