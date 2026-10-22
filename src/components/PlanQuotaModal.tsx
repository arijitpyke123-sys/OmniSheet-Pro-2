import React from 'react';
import { 
  X, 
  Zap, 
  Check, 
  ShieldCheck, 
  TrendingUp, 
  Clock, 
  RotateCcw,
  Sparkles,
  Activity,
  Layers
} from 'lucide-react';
import { TENANT_PLANS, TenantPlan, QuotaStatus } from '../utils/rateLimiter';

interface PlanQuotaModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentPlanId: string;
  onSelectPlan: (planId: string) => void;
  quotaStatus: QuotaStatus;
  onResetQuotaDemo?: () => void;
  onSimulateLimitDemo?: () => void;
  theme?: 'dark' | 'light';
}

export const PlanQuotaModal: React.FC<PlanQuotaModalProps> = ({
  isOpen,
  onClose,
  currentPlanId,
  onSelectPlan,
  quotaStatus,
  onResetQuotaDemo,
  onSimulateLimitDemo,
  theme = 'dark',
}) => {
  const isDark = theme === 'dark';

  if (!isOpen) return null;

  const currentPlan = TENANT_PLANS[currentPlanId] || TENANT_PLANS.basic_50;
  const isNearLimit = quotaStatus.percentUsed >= 80;
  const isAtLimit = !quotaStatus.allowed && quotaStatus.remaining <= 0;

  const modalBg = isDark ? 'bg-slate-900 border-slate-800 text-slate-100' : 'bg-white border-slate-200 text-slate-900';
  const cardBg = isDark ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-xs">
      <div className={`flex flex-col w-full max-w-3xl rounded-2xl border shadow-2xl overflow-hidden max-h-[90vh] transition-colors ${modalBg}`}>
        {/* Header */}
        <div className={`flex items-center justify-between border-b px-6 py-4 ${isDark ? 'border-slate-800' : 'border-slate-200'}`}>
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-500 text-white shadow-md">
              <Zap className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold flex items-center gap-2">
                Tenant Quotas & Subscription Plans
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                  Netflix-Style Rate Limiter
                </span>
              </h2>
              <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                Rate of changes increases automatically as you upgrade your subscription plan
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

        <div className="p-6 overflow-y-auto space-y-6">
          {/* Current Live Usage Gauge */}
          <div className={`rounded-2xl p-5 border shadow-inner ${cardBg}`}>
            <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
              <div>
                <span className={`text-[11px] font-bold uppercase tracking-wider ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                  Current Tenant Plan
                </span>
                <div className="flex items-center gap-2 mt-0.5">
                  <h3 className="text-lg font-black text-emerald-500">
                    {currentPlan.name} (₹{currentPlan.priceRupees}/mo)
                  </h3>
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                    isAtLimit ? 'bg-red-500/20 text-red-400 border border-red-500/30' :
                    isNearLimit ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' :
                    'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                  }`}>
                    {quotaStatus.remaining} edits left this hr
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {onSimulateLimitDemo && (
                  <button
                    onClick={onSimulateLimitDemo}
                    className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium border transition ${
                      isDark 
                        ? 'bg-amber-950/40 border-amber-800/60 text-amber-300 hover:bg-amber-900/60' 
                        : 'bg-amber-50 border-amber-300 text-amber-700 hover:bg-amber-100'
                    }`}
                    title="Simulate reaching max quota to test Netflix-style rate limiting protection"
                  >
                    <TrendingUp className="h-3 w-3" />
                    Simulate Limit
                  </button>
                )}
                {onResetQuotaDemo && (
                  <button
                    onClick={onResetQuotaDemo}
                    className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium border transition ${
                      isDark 
                        ? 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700' 
                        : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-100'
                    }`}
                    title="Reset hourly usage counter for testing"
                  >
                    <RotateCcw className="h-3 w-3" />
                    Reset Quota
                  </button>
                )}
              </div>
            </div>

            {/* Progress Bar */}
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs font-mono">
                <span className={isDark ? 'text-slate-400' : 'text-slate-500'}>
                  Hourly Changes Used: <strong className="text-white">{quotaStatus.used}</strong> / {quotaStatus.total}
                </span>
                <span className="font-semibold text-emerald-500">
                  {quotaStatus.percentUsed}% consumed
                </span>
              </div>
              <div className={`w-full h-3 rounded-full overflow-hidden p-0.5 ${isDark ? 'bg-slate-900 border border-slate-800' : 'bg-slate-200 border border-slate-300'}`}>
                <div 
                  style={{ width: `${quotaStatus.percentUsed}%` }}
                  className={`h-full rounded-full transition-all duration-300 ${
                    isAtLimit ? 'bg-red-500' :
                    isNearLimit ? 'bg-amber-500' :
                    'bg-gradient-to-r from-emerald-500 to-teal-400'
                  }`}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-4 pt-3 border-t border-slate-800/60 text-xs">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-sky-400" />
                <span className={isDark ? 'text-slate-400' : 'text-slate-600'}>
                  Next reset in: <strong className={isDark ? 'text-white' : 'text-slate-900'}>{quotaStatus.resetMinutes}m</strong>
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Activity className="h-4 w-4 text-emerald-400" />
                <span className={isDark ? 'text-slate-400' : 'text-slate-600'}>
                  Burst limit: <strong className={isDark ? 'text-white' : 'text-slate-900'}>{currentPlan.burstPerMinute}/min</strong>
                </span>
              </div>
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-indigo-400" />
                <span className={isDark ? 'text-slate-400' : 'text-slate-600'}>
                  Sliding 60m window
                </span>
              </div>
            </div>
          </div>

          {/* Plan Tier Selection Cards */}
          <div>
            <h4 className={`text-xs font-bold uppercase tracking-wider mb-3 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
              Available Subscription Plans
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
              {Object.values(TENANT_PLANS).map((plan) => {
                const isSelected = currentPlanId === plan.id;
                return (
                  <div
                    key={plan.id}
                    className={`flex flex-col justify-between rounded-xl border p-4 transition-all duration-200 relative ${
                      isSelected
                        ? 'border-emerald-500 bg-emerald-500/5 shadow-md shadow-emerald-950/20 ring-1 ring-emerald-500'
                        : isDark
                          ? 'border-slate-800 bg-slate-950 hover:border-slate-700'
                          : 'border-slate-200 bg-white hover:border-slate-300'
                    }`}
                  >
                    {plan.recommended && (
                      <div className="absolute -top-2.5 right-3 px-2 py-0.5 rounded-full bg-emerald-600 text-white text-[9px] font-bold shadow-sm uppercase tracking-wider">
                        Popular
                      </div>
                    )}

                    <div>
                      <h5 className="text-sm font-bold">{plan.name}</h5>
                      <div className="flex items-baseline gap-1 my-2">
                        <span className="text-2xl font-black text-emerald-500">₹{plan.priceRupees}</span>
                        <span className={`text-[11px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>/month</span>
                      </div>

                      <div className={`p-2.5 rounded-lg my-2 border text-xs font-mono ${
                        isDark ? 'bg-slate-900 border-slate-800 text-emerald-400' : 'bg-slate-50 border-slate-200 text-emerald-700'
                      }`}>
                        <strong>{plan.hourlyQuota.toLocaleString()}</strong> changes/hr
                      </div>

                      <ul className={`text-[11px] space-y-1.5 my-3 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                        <li className="flex items-center gap-1.5">
                          <Check className="h-3 w-3 text-emerald-500 shrink-0" />
                          <span>{plan.burstPerMinute} changes/min burst</span>
                        </li>
                        <li className="flex items-center gap-1.5">
                          <Check className="h-3 w-3 text-emerald-500 shrink-0" />
                          <span>Real-time collaborative sync</span>
                        </li>
                        <li className="flex items-center gap-1.5">
                          <Check className="h-3 w-3 text-emerald-500 shrink-0" />
                          <span>Firestore cloud storage</span>
                        </li>
                      </ul>
                    </div>

                    <button
                      onClick={() => onSelectPlan(plan.id)}
                      disabled={isSelected}
                      className={`w-full py-2 px-3 rounded-lg text-xs font-bold transition mt-2 shadow-xs ${
                        isSelected
                          ? 'bg-emerald-600 text-white cursor-default opacity-90'
                          : isDark
                            ? 'bg-slate-800 text-slate-200 hover:bg-slate-700 hover:text-white border border-slate-700'
                            : 'bg-slate-100 text-slate-800 hover:bg-slate-200 border border-slate-200'
                      }`}
                    >
                      {isSelected ? 'Active Plan' : `Switch to ₹${plan.priceRupees}`}
                    </button>
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
