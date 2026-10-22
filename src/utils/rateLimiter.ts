/**
 * Netflix-style Sliding Window & Token Bucket Rate Limiting for multi-tenant plans.
 * Tracks change quotas per tenant with rolling hourly limits and per-minute burst protection.
 */

export interface TenantPlan {
  id: string;
  name: string;
  priceRupees: number;
  hourlyQuota: number;       // e.g. 500 changes for the ₹50 plan
  burstPerMinute: number;    // peak burst allowed per minute
  description: string;
  badgeColor: string;
  recommended?: boolean;
}

export const TENANT_PLANS: Record<string, TenantPlan> = {
  free: {
    id: 'free',
    name: 'Starter Tier',
    priceRupees: 0,
    hourlyQuota: 10,
    burstPerMinute: 25,
    description: '10 changes / hour • Basic personal formulas & sheets',
    badgeColor: '#64748b',
  },
  basic_50: {
    id: 'basic_50',
    name: 'Basic Plan',
    priceRupees: 50,
    hourlyQuota: 500,
    burstPerMinute: 80,
    description: '500 changes / hour • Perfect for active spreadsheets & calculations',
    badgeColor: '#10b981',
    recommended: true,
  },
  pro_199: {
    id: 'pro_199',
    name: 'Pro Collaborative',
    priceRupees: 199,
    hourlyQuota: 2500,
    burstPerMinute: 250,
    description: '2,500 changes / hour • High-concurrency team collaboration & macros',
    badgeColor: '#3b82f6',
  },
  enterprise_499: {
    id: 'enterprise_499',
    name: 'Enterprise Scale',
    priceRupees: 499,
    hourlyQuota: 10000,
    burstPerMinute: 1000,
    description: '10,000 changes / hour • Ultra high throughput, unbounded charts & audit logs',
    badgeColor: '#8b5cf6',
  },
};

export interface QuotaStatus {
  allowed: boolean;
  remaining: number;
  total: number;
  used: number;
  percentUsed: number;
  burstRemaining: number;
  resetMinutes: number;
  plan: TenantPlan;
  error?: string;
}

class TenantRateLimiter {
  private history: Record<string, number[]> = {};
  private readonly WINDOW_MS = 60 * 60 * 1000; // 1 hour sliding window
  private readonly BURST_WINDOW_MS = 60 * 1000; // 1 minute burst window

  private getTimestamps(tenantId: string): number[] {
    if (!this.history[tenantId]) {
      // Try restore from localStorage
      try {
        const stored = localStorage.getItem(`omnisheet_quota_history_${tenantId}`);
        if (stored) {
          this.history[tenantId] = JSON.parse(stored);
        } else {
          this.history[tenantId] = [];
        }
      } catch {
        this.history[tenantId] = [];
      }
    }

    const now = Date.now();
    // Prune events older than 1 hour
    this.history[tenantId] = this.history[tenantId].filter(t => now - t < this.WINDOW_MS);
    return this.history[tenantId];
  }

  private persist(tenantId: string) {
    try {
      localStorage.setItem(`omnisheet_quota_history_${tenantId}`, JSON.stringify(this.history[tenantId]));
    } catch {
      // Ignore
    }
  }

  getQuotaStatus(tenantId: string, planId: string = 'basic_50'): QuotaStatus {
    const plan = TENANT_PLANS[planId] || TENANT_PLANS.basic_50;
    const now = Date.now();
    const timestamps = this.getTimestamps(tenantId);

    const used = timestamps.length;
    const remaining = Math.max(0, plan.hourlyQuota - used);
    const percentUsed = Math.min(100, Math.round((used / plan.hourlyQuota) * 100));

    // Check burst in last 60 seconds
    const recentMinuteCount = timestamps.filter(t => now - t < this.BURST_WINDOW_MS).length;
    const burstRemaining = Math.max(0, plan.burstPerMinute - recentMinuteCount);

    // Oldest timestamp determines when the next token frees up
    const oldest = timestamps[0] || now;
    const resetMs = Math.max(0, this.WINDOW_MS - (now - oldest));
    const resetMinutes = Math.max(1, Math.ceil(resetMs / 60000));

    let allowed = true;
    let error: string | undefined;

    if (remaining <= 0) {
      allowed = false;
      error = `Hourly change quota reached (${plan.hourlyQuota}/${plan.hourlyQuota} changes on ${plan.name} at ₹${plan.priceRupees}). Rate limiting is active (Netflix-style protection). Quota resets in ${resetMinutes}m.`;
    } else if (burstRemaining <= 0) {
      allowed = false;
      error = `Burst limit reached (${plan.burstPerMinute} edits/min on ${plan.name}). Please pause for a few seconds.`;
    }

    return {
      allowed,
      remaining,
      total: plan.hourlyQuota,
      used,
      percentUsed,
      burstRemaining,
      resetMinutes,
      plan,
      error,
    };
  }

  canConsume(tenantId: string, planId: string = 'basic_50', count: number = 1): { allowed: boolean; error?: string } {
    const status = this.getQuotaStatus(tenantId, planId);
    if (!status.allowed) {
      return { allowed: false, error: status.error };
    }
    if (status.remaining < count) {
      return {
        allowed: false,
        error: `Batch operation requires ${count} change tokens, but only ${status.remaining} remaining on your ${status.plan.name} (₹${status.plan.priceRupees}/mo). Upgrade your plan to increase limits.`,
      };
    }
    return { allowed: true };
  }

  consumeQuota(tenantId: string, planId: string = 'basic_50', count: number = 1): QuotaStatus {
    const check = this.canConsume(tenantId, planId, count);
    if (!check.allowed) {
      const status = this.getQuotaStatus(tenantId, planId);
      return {
        ...status,
        allowed: false,
        error: check.error || status.error,
      };
    }

    const now = Date.now();
    for (let i = 0; i < count; i++) {
      this.history[tenantId].push(now);
    }
    this.persist(tenantId);

    return this.getQuotaStatus(tenantId, planId);
  }

  // Simulate usage for testing/demonstration of Netflix-style rate limiting
  simulateUsage(tenantId: string, count: number) {
    const now = Date.now();
    const timestamps = this.getTimestamps(tenantId);
    for (let i = 0; i < count; i++) {
      timestamps.push(now - Math.floor(Math.random() * 10 * 60 * 1000)); // Spread within last 10m
    }
    this.history[tenantId] = timestamps;
    this.persist(tenantId);
  }

  // Reset usage for demo purposes
  resetQuota(tenantId: string) {
    this.history[tenantId] = [];
    this.persist(tenantId);
  }
}

export const tenantRateLimiter = new TenantRateLimiter();

// Backward compatibility alias for single write check
export const writeRateLimiter = {
  canExecute(tenantId: string = 'default', planId: string = 'basic_50'): boolean {
    const res = tenantRateLimiter.consumeQuota(tenantId, planId, 1);
    return res.allowed;
  },
  getQuotaStatus(tenantId: string = 'default', planId: string = 'basic_50'): QuotaStatus {
    return tenantRateLimiter.getQuotaStatus(tenantId, planId);
  }
};
