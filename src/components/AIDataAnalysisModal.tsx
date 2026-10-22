import React, { useState, useEffect } from 'react';
import { 
  X, 
  Sparkles, 
  TrendingUp, 
  AlertTriangle, 
  Calculator, 
  BarChart3, 
  Send, 
  Copy, 
  Check, 
  Layers, 
  ArrowRight, 
  RefreshCw,
  Lightbulb,
  Zap,
  Info
} from 'lucide-react';
import { SheetCells } from '../utils/formulaEngine';

interface AIDataAnalysisModalProps {
  isOpen: boolean;
  onClose: () => void;
  spreadsheetTitle: string;
  activeSheetName: string;
  sheetCells: SheetCells;
  selectedRange?: string | null;
  onApplyFormula?: (targetCell: string, formula: string) => void;
  onOpenCharts?: () => void;
  theme?: 'dark' | 'light';
}

interface AnalysisResult {
  summary: string;
  keyMetrics: Array<{ label: string; value: string; trend?: 'up' | 'down' | 'neutral'; description?: string }>;
  insights: string[];
  anomalies: string[];
  recommendedFormulas: Array<{ targetCell: string; formula: string; explanation: string }>;
  recommendedChart?: { type: string; title: string; explanation: string };
  actionableRecommendations: string[];
  chatAnswer?: string;
  suggestedNewColumn?: { title: string; formula: string; explanation: string };
}

export const AIDataAnalysisModal: React.FC<AIDataAnalysisModalProps> = ({
  isOpen,
  onClose,
  spreadsheetTitle,
  activeSheetName,
  sheetCells,
  selectedRange,
  onApplyFormula,
  onOpenCharts,
  theme = 'dark',
}) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'anomalies' | 'formulas' | 'chat'>('overview');
  const [loading, setLoading] = useState(false);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [userQuery, setUserQuery] = useState('');
  const [chatHistory, setChatHistory] = useState<Array<{ sender: 'user' | 'ai'; text: string; timestamp: string }>>([]);
  const [copied, setCopied] = useState(false);
  const [appliedFormula, setAppliedFormula] = useState<string | null>(null);

  const isDark = theme === 'dark';

  const runAnalysis = async (customQuery?: string) => {
    setLoading(true);
    try {
      const response = await fetch('/api/ai/analyze-sheet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          spreadsheetTitle,
          activeSheetName,
          sheetData: sheetCells,
          selectedRange: selectedRange || undefined,
          analysisMode: activeTab,
          userQuery: customQuery || undefined,
        }),
      });

      const data = await response.json();
      if (data && data.analysis) {
        setAnalysis(data.analysis);
        if (customQuery && data.analysis.chatAnswer) {
          setChatHistory(prev => [
            ...prev,
            { sender: 'user', text: customQuery, timestamp: new Date().toLocaleTimeString() },
            { sender: 'ai', text: data.analysis.chatAnswer, timestamp: new Date().toLocaleTimeString() }
          ]);
        }
      }
    } catch (err) {
      console.warn('AI analysis request error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      runAnalysis();
    } else {
      setUserQuery('');
      setAppliedFormula(null);
    }
  }, [isOpen, activeSheetName]);

  if (!isOpen) return null;

  const handleSendChat = (e: React.FormEvent) => {
    e.preventDefault();
    if (!userQuery.trim() || loading) return;
    const q = userQuery.trim();
    setUserQuery('');
    runAnalysis(q);
  };

  const handleApply = (targetCell: string, formula: string) => {
    if (onApplyFormula) {
      onApplyFormula(targetCell, formula);
      setAppliedFormula(`${formula} applied to ${targetCell}`);
      setTimeout(() => setAppliedFormula(null), 4000);
    }
  };

  const handleCopySummary = () => {
    if (!analysis) return;
    const text = `OmniSheet Pro AI Analysis: ${spreadsheetTitle} (${activeSheetName})\n\n${analysis.summary}\n\nKey Insights:\n${analysis.insights.map(i => `• ${i}`).join('\n')}`;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 3000);
  };

  const modalBg = isDark ? 'bg-slate-900 border-slate-800 text-slate-100' : 'bg-white border-slate-200 text-slate-900';
  const cardBg = isDark ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200';
  const inputBg = isDark ? 'bg-slate-950 border-slate-800 text-white' : 'bg-white border-slate-300 text-slate-900';

  const PREMADE_PROMPTS = [
    'What is the highest grossing product or category?',
    'Identify any negative balances or cost outliers',
    'Calculate total volume and running averages',
    'What is the recommended chart to visualize this sheet?'
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-4">
      <div className={`flex flex-col w-full max-w-2xl max-h-[90vh] rounded-2xl border shadow-2xl overflow-hidden transition-colors ${modalBg}`}>
        {/* Header */}
        <div className={`flex items-center justify-between border-b px-6 py-4 ${isDark ? 'border-slate-800' : 'border-slate-200'}`}>
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-500 text-white shadow-md">
              <Sparkles className="h-5 w-5 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold">OmniSheet AI Data Analyst</h2>
                <span className="rounded-full bg-emerald-500/10 border border-emerald-500/30 px-2 py-0.5 text-[10px] font-bold text-emerald-400">
                  Gemini 3.8 Flash
                </span>
              </div>
              <p className={`text-[11px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                Active Sheet: <strong>{activeSheetName}</strong> • {selectedRange ? `Range: ${selectedRange}` : 'Full Sheet'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => runAnalysis()}
              disabled={loading}
              className={`rounded-lg p-1.5 transition ${isDark ? 'text-slate-400 hover:text-white hover:bg-slate-800' : 'text-slate-500 hover:bg-slate-100'}`}
              title="Refresh Analysis"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin text-emerald-400' : ''}`} />
            </button>
            <button 
              onClick={onClose} 
              className={`rounded-lg p-1.5 transition ${isDark ? 'text-slate-400 hover:bg-slate-800 hover:text-white' : 'text-slate-500 hover:bg-slate-100'}`}
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Applied Formula Banner */}
        {appliedFormula && (
          <div className="flex items-center justify-between px-6 py-2 bg-emerald-600 text-white text-xs font-semibold">
            <span className="flex items-center gap-1.5">
              <Check className="h-4 w-4" />
              {appliedFormula}
            </span>
          </div>
        )}

        {/* Mode Selector Tabs */}
        <div className={`flex items-center gap-1 px-6 pt-3 border-b text-xs font-bold ${isDark ? 'border-slate-800' : 'border-slate-200'}`}>
          <button
            onClick={() => setActiveTab('overview')}
            className={`flex items-center gap-1.5 pb-2.5 border-b-2 transition ${
              activeTab === 'overview'
                ? 'border-emerald-500 text-emerald-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <TrendingUp className="h-4 w-4" />
            Overview & Insights
          </button>

          <button
            onClick={() => setActiveTab('anomalies')}
            className={`flex items-center gap-1.5 pb-2.5 border-b-2 transition ${
              activeTab === 'anomalies'
                ? 'border-amber-500 text-amber-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <AlertTriangle className="h-4 w-4" />
            Anomalies & Quality
          </button>

          <button
            onClick={() => setActiveTab('formulas')}
            className={`flex items-center gap-1.5 pb-2.5 border-b-2 transition ${
              activeTab === 'formulas'
                ? 'border-sky-500 text-sky-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Calculator className="h-4 w-4" />
            Suggested Formulas
          </button>

          <button
            onClick={() => setActiveTab('chat')}
            className={`flex items-center gap-1.5 pb-2.5 border-b-2 transition ${
              activeTab === 'chat'
                ? 'border-purple-500 text-purple-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Sparkles className="h-4 w-4" />
            Ask AI Assistant
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="p-6 space-y-6 overflow-y-auto max-h-[70vh]">
          {loading && !analysis ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-slate-400">
              <div className="h-9 w-9 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
              <p className="text-xs font-semibold">Gemini AI is analyzing formulas, data trends, and anomalies...</p>
            </div>
          ) : analysis ? (
            <>
              {/* TAB 1: OVERVIEW */}
              {activeTab === 'overview' && (
                <div className="space-y-5">
                  {/* Executive Summary */}
                  <div className={`p-4 rounded-xl border relative ${cardBg}`}>
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="text-xs font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
                        <Lightbulb className="h-4 w-4" />
                        Executive Summary
                      </h3>
                      <button
                        onClick={handleCopySummary}
                        className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-white transition"
                        title="Copy Summary"
                      >
                        {copied ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
                        <span>{copied ? 'Copied' : 'Copy'}</span>
                      </button>
                    </div>
                    <p className={`text-xs leading-relaxed ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                      {analysis.summary}
                    </p>
                  </div>

                  {/* Key Metrics Grid */}
                  {analysis.keyMetrics && analysis.keyMetrics.length > 0 && (
                    <div className="space-y-2">
                      <h4 className={`text-[11px] font-bold uppercase tracking-wider ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                        Key Aggregate Metrics
                      </h4>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        {analysis.keyMetrics.map((metric, i) => (
                          <div key={i} className={`p-3 rounded-xl border ${cardBg}`}>
                            <p className="text-[10px] text-slate-400 font-medium truncate">{metric.label}</p>
                            <p className="text-sm font-black text-emerald-400 mt-1 font-mono">{metric.value}</p>
                            {metric.description && (
                              <p className="text-[9px] text-slate-500 truncate mt-0.5">{metric.description}</p>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Key Insights List */}
                  {analysis.insights && analysis.insights.length > 0 && (
                    <div className="space-y-2">
                      <h4 className={`text-[11px] font-bold uppercase tracking-wider ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                        Trend & Pattern Insights
                      </h4>
                      <div className="space-y-2">
                        {analysis.insights.map((insight, i) => (
                          <div key={i} className={`flex items-start gap-2.5 p-3 rounded-xl border text-xs ${cardBg}`}>
                            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-400 font-bold text-[10px] mt-0.5">
                              {i + 1}
                            </span>
                            <span className={isDark ? 'text-slate-300' : 'text-slate-700'}>{insight}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Recommended Chart */}
                  {analysis.recommendedChart && (
                    <div className={`flex items-center justify-between p-3.5 rounded-xl border border-sky-800/60 bg-sky-950/30 text-xs`}>
                      <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-500/20 text-sky-400 shrink-0">
                          <BarChart3 className="h-4 w-4" />
                        </div>
                        <div>
                          <p className="font-bold text-sky-300">Recommended Visualization: {analysis.recommendedChart.title}</p>
                          <p className="text-[11px] text-slate-400">{analysis.recommendedChart.explanation}</p>
                        </div>
                      </div>
                      {onOpenCharts && (
                        <button
                          onClick={onOpenCharts}
                          className="flex items-center gap-1 rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-sky-500 transition shrink-0"
                        >
                          <span>Open Chart</span>
                          <ArrowRight className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* TAB 2: ANOMALIES & DATA QUALITY */}
              {activeTab === 'anomalies' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
                      <AlertTriangle className="h-4 w-4" />
                      Detected Anomalies & Data Inconsistencies
                    </h3>
                  </div>

                  {analysis.anomalies && analysis.anomalies.length > 0 ? (
                    <div className="space-y-2.5">
                      {analysis.anomalies.map((anom, i) => (
                        <div key={i} className={`flex items-start gap-3 p-3.5 rounded-xl border border-amber-900/40 bg-amber-950/20 text-xs text-amber-200`}>
                          <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
                          <span>{anom}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className={`p-8 text-center text-xs rounded-xl border ${cardBg} text-slate-400`}>
                      No critical outliers or formula anomalies were detected. Data integrity is solid!
                    </div>
                  )}

                  {/* Actionable recommendations */}
                  {analysis.actionableRecommendations && (
                    <div className="space-y-2 pt-2">
                      <h4 className={`text-[11px] font-bold uppercase tracking-wider ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                        Quality Improvement Recommendations
                      </h4>
                      <div className="space-y-2">
                        {analysis.actionableRecommendations.map((rec, i) => (
                          <div key={i} className={`flex items-start gap-2.5 p-3 rounded-xl border text-xs ${cardBg}`}>
                            <Zap className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
                            <span className={isDark ? 'text-slate-300' : 'text-slate-700'}>{rec}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* TAB 3: SUGGESTED FORMULAS */}
              {activeTab === 'formulas' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-sky-400 flex items-center gap-1.5">
                      <Calculator className="h-4 w-4" />
                      AI Suggested Formulas & Aggregations
                    </h3>
                  </div>

                  {analysis.recommendedFormulas && analysis.recommendedFormulas.length > 0 ? (
                    <div className="space-y-3">
                      {analysis.recommendedFormulas.map((item, i) => (
                        <div key={i} className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-xl border ${cardBg}`}>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-xs font-bold text-sky-400 bg-sky-950/60 border border-sky-800/60 px-2 py-0.5 rounded">
                                {item.formula}
                              </span>
                              {item.targetCell && (
                                <span className="text-[10px] text-slate-400 font-mono">
                                  Target: {item.targetCell}
                                </span>
                              )}
                            </div>
                            <p className={`text-[11px] mt-1 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                              {item.explanation}
                            </p>
                          </div>

                          <button
                            onClick={() => handleApply(item.targetCell || 'D10', item.formula)}
                            className="flex items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500 transition shrink-0"
                          >
                            <Check className="h-3.5 w-3.5" />
                            <span>Insert Formula</span>
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className={`p-8 text-center text-xs rounded-xl border ${cardBg} text-slate-400`}>
                      All primary formula aggregates are already configured on this sheet!
                    </div>
                  )}

                  {/* Suggested New Column */}
                  {analysis.suggestedNewColumn && (
                    <div className={`p-4 rounded-xl border border-purple-800/60 bg-purple-950/20 text-xs space-y-2`}>
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-purple-300">Suggested Metric Column: {analysis.suggestedNewColumn.title}</span>
                        <code className="text-[10px] px-1.5 py-0.5 rounded bg-purple-900/60 text-purple-200">
                          {analysis.suggestedNewColumn.formula}
                        </code>
                      </div>
                      <p className="text-[11px] text-slate-300">{analysis.suggestedNewColumn.explanation}</p>
                    </div>
                  )}
                </div>
              )}

              {/* TAB 4: CHAT WITH SPREADSHEET */}
              {activeTab === 'chat' && (
                <div className="space-y-4">
                  {/* Chat messages */}
                  <div className="space-y-3 min-h-[160px] max-h-[300px] overflow-y-auto pr-1">
                    {chatHistory.length === 0 ? (
                      <div className={`p-6 text-center text-xs rounded-xl border ${cardBg} text-slate-400 space-y-2`}>
                        <Sparkles className="h-6 w-6 text-emerald-400 mx-auto" />
                        <p className="font-semibold text-slate-300">Ask any question about your spreadsheet!</p>
                        <p className="text-[11px] text-slate-500">
                          OmniSheet AI parses row-by-row figures, percentages, totals, and formulas to answer you instantly.
                        </p>
                      </div>
                    ) : (
                      chatHistory.map((msg, i) => (
                        <div
                          key={i}
                          className={`flex flex-col ${msg.sender === 'user' ? 'items-end' : 'items-start'}`}
                        >
                          <div className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-xs ${
                            msg.sender === 'user'
                              ? 'bg-emerald-600 text-white rounded-br-xs'
                              : isDark ? 'bg-slate-950 border border-slate-800 text-slate-200 rounded-bl-xs' : 'bg-slate-100 border border-slate-200 text-slate-800 rounded-bl-xs'
                          }`}>
                            <p className="leading-relaxed whitespace-pre-wrap">{msg.text}</p>
                          </div>
                          <span className="text-[9px] text-slate-500 mt-1 px-1">{msg.timestamp}</span>
                        </div>
                      ))
                    )}
                  </div>

                  {/* Premade Question Chips */}
                  <div className="space-y-1.5">
                    <p className={`text-[10px] font-bold uppercase tracking-wider ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                      Sample Questions:
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {PREMADE_PROMPTS.map((prompt, i) => (
                        <button
                          key={i}
                          type="button"
                          onClick={() => {
                            setUserQuery(prompt);
                            runAnalysis(prompt);
                          }}
                          className={`rounded-lg px-2.5 py-1 text-[11px] border text-left transition ${
                            isDark 
                              ? 'bg-slate-950 border-slate-800 hover:border-slate-700 text-slate-300 hover:text-white' 
                              : 'bg-slate-50 border-slate-200 hover:border-slate-300 text-slate-700'
                          }`}
                        >
                          {prompt}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Question input */}
                  <form onSubmit={handleSendChat} className="flex items-center gap-2 pt-2">
                    <input
                      type="text"
                      placeholder="Ask OmniSheet AI anything about this spreadsheet..."
                      value={userQuery}
                      onChange={(e) => setUserQuery(e.target.value)}
                      className={`flex-1 rounded-xl px-3.5 py-2.5 text-xs border focus:outline-none focus:ring-2 focus:ring-emerald-500 ${inputBg}`}
                    />
                    <button
                      type="submit"
                      disabled={loading || !userQuery.trim()}
                      className="flex items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-bold text-white hover:bg-emerald-500 transition shadow-sm disabled:opacity-50"
                    >
                      <Send className="h-4 w-4" />
                      <span>{loading ? 'Thinking...' : 'Ask AI'}</span>
                    </button>
                  </form>
                </div>
              )}
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
};
