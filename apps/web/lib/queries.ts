import type { XAccountEntity } from '@draftorbit/shared';
import { apiFetch } from './api';

export async function startGeneration(data: {
  mode?: 'brief' | 'advanced';
  brief?: {
    objective: string;
    audience: string;
    tone: string;
    postType: string;
    cta: string;
    topicPreset: string;
  };
  advanced?: {
    customPrompt?: string;
  };
  prompt?: string;
  type?: string;
  language?: string;
  useStyle?: boolean;
}) {
  return apiFetch<{
    generationId: string;
    sessionId?: string;
    status?: string;
    streamUrl?: string;
    resultUrl?: string;
  }>('/v2/generate/run', {
    method: 'POST',
    body: JSON.stringify(data)
  });
}

export async function fetchGeneration(id: string) {
  return apiFetch<Record<string, unknown>>(`/v2/generate/${id}`);
}

export async function fetchHistory() {
  const payload = await apiFetch<Record<string, unknown>[] | { data?: Record<string, unknown>[] }>(
    '/v2/generate/history'
  );
  if (Array.isArray(payload)) return payload;
  if (payload && Array.isArray(payload.data)) return payload.data;
  return [];
}

export async function publishTweet(generationId: string, xAccountId?: string) {
  return apiFetch<Record<string, unknown>>('/v2/publish/queue', {
    method: 'POST',
    body: JSON.stringify({ generationId, xAccountId, channel: 'X_TWEET' })
  });
}

export async function fetchBillingPlans() {
  return apiFetch<{
    currency: string;
    trialDays: number;
    plans: Array<{
      key: 'STARTER' | 'PRO' | 'PREMIUM';
      name: string;
      monthly: {
        usd: number;
        usdCents: number;
      };
      yearly: {
        usd: number;
        usdCents: number;
      };
      features: string[];
      limits: {
        daily: number;
        monthly: number;
      };
    }>;
  }>('/v2/billing/plans');
}

export async function createCheckout(plan: 'STARTER' | 'PRO' | 'PREMIUM', cycle: 'MONTHLY' | 'YEARLY') {
  return apiFetch<{ url: string }>('/v2/billing/checkout', {
    method: 'POST',
    body: JSON.stringify({ plan, cycle })
  });
}

export async function fetchSubscription() {
  return apiFetch<Record<string, unknown>>('/v2/billing/subscription');
}

export async function fetchUsage() {
  return apiFetch<Record<string, unknown>>('/v2/billing/usage');
}

export async function cancelSubscription(mode: 'AT_PERIOD_END' | 'IMMEDIATE' = 'AT_PERIOD_END') {
  return apiFetch<Record<string, unknown>>('/v2/billing/subscription/cancel', {
    method: 'POST',
    body: JSON.stringify({ mode })
  });
}

export async function createRefund(input: {
  mode: 'PARTIAL' | 'FULL';
  amountUsd?: number;
  reason?: 'requested_by_customer' | 'duplicate' | 'fraudulent';
}) {
  return apiFetch<Record<string, unknown>>('/v2/billing/refund', {
    method: 'POST',
    body: JSON.stringify(input)
  });
}

export async function fetchMe() {
  return apiFetch<Record<string, unknown>>('/auth/me');
}

export async function startXOAuth() {
  return apiFetch<{ url: string; state: string }>('/auth/x/authorize');
}

export async function startXAccountOAuthBind() {
  return apiFetch<{ url: string; state: string; redirectUri: string }>('/v2/x-accounts/oauth/start', {
    method: 'POST'
  });
}

export async function finishXAccountOAuthBind(state: string, code: string) {
  return apiFetch<{ ok: boolean; account: Record<string, unknown> }>(
    `/v2/x-accounts/oauth/callback?state=${encodeURIComponent(state)}&code=${encodeURIComponent(code)}`
  );
}

export async function createLocalSession() {
  return apiFetch<{ token: string; user: Record<string, unknown> }>('/auth/local/session', {
    method: 'POST'
  });
}

export async function fetchXAccounts(options?: {
  page?: number;
  pageSize?: number;
  status?: 'ACTIVE' | 'EXPIRED' | 'REVOKED' | 'ERROR';
}) {
  const query = new URLSearchParams();
  if (options?.page) query.set('page', String(options.page));
  if (options?.pageSize) query.set('pageSize', String(options.pageSize));
  if (options?.status) query.set('status', options.status);
  const suffix = query.toString() ? `?${query.toString()}` : '';
  const payload = await apiFetch<XAccountEntity[] | { data?: XAccountEntity[] }>(`/v2/x-accounts${suffix}`);
  if (Array.isArray(payload)) return payload;
  if (payload && Array.isArray(payload.data)) return payload.data;
  return [];
}

export async function analyzeStyle() {
  return apiFetch<Record<string, unknown>>('/history/analyze', { method: 'POST' });
}

export async function fetchStyle() {
  return apiFetch<Record<string, unknown>>('/history/style');
}
