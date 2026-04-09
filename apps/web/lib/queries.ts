import { apiFetch } from './api';

export type BillingPlanKey = 'STARTER' | 'PRO' | 'PREMIUM';
export type BillingCycle = 'MONTHLY' | 'YEARLY';
export type V3Format = 'tweet' | 'thread' | 'article';

export type BillingPlanView = {
  key: BillingPlanKey;
  name: string;
  monthly: { usd: number; usdCents: number };
  yearly: { usd: number; usdCents: number };
  features: string[];
  limits: { daily: number; monthly: number };
};

export type V3BootstrapResponse = {
  requestId?: string;
  user: { id: string; handle: string; plan: string };
  workspaceId: string;
  defaultXAccount: { id: string; handle: string; status: string; isDefault: boolean } | null;
  counts: { xAccounts: number; sources: number };
  sourceEvidence: string[];
  profile: {
    ready: boolean;
    styleSummary: string | null;
    sourceCount: number;
  };
  suggestedAction: string;
};

export type V3RunStartResponse = {
  requestId?: string;
  runId: string;
  stage: string;
  nextAction: string;
  blockingReason: string | null;
  streamUrl: string;
};

export type V3RunResponse = {
  requestId?: string;
  runId: string;
  status: string;
  format: V3Format;
  result: {
    text: string;
    variants: Array<{ tone: string; text: string }>;
    imageKeywords: string[];
    qualityScore: number | null;
    quality?: Record<string, number>;
    riskFlags: string[];
    requestCostUsd: number | null;
    whySummary: string[];
    evidenceSummary: string[];
    stepLatencyMs?: Record<string, number> | null;
  } | null;
  publish: Array<{
    id: string;
    status: string;
    publishKind: 'x_post' | 'x_article';
    publishMode: 'manual_x_web' | 'native_x_api';
    xAccountId: string | null;
    xAccountHandle: string | null;
    createdAt: string;
    updatedAt: string;
    externalUrl: string | null;
    externalPostId?: string | null;
    lastError?: string | null;
  }>;
  stages: Array<{
    stage: string;
    label: string;
    status: string;
    summary?: string | null;
  }>;
};

export type V3ProfileResponse = {
  requestId?: string;
  styleSummary: string | null;
  styleSampleCount: number;
  styleLastAnalyzedAt: string | null;
  sourceEvidence: string[];
  sources: Array<{
    id: string;
    sourceType: string;
    sourceRef: string;
    connector: string;
    createdAt: string;
  }>;
  xAccounts: Array<{
    id: string;
    handle: string;
    status: string;
    isDefault: boolean;
    tokenExpiresAt: string | null;
  }>;
};

export type V3QueueResponse = {
  requestId?: string;
  review: Array<{
    runId: string;
    format: V3Format;
    text: string | null;
    qualityScore: number | null;
    riskFlags: string[];
    createdAt: string;
    nextAction: string;
  }>;
  queued: Array<{
    id: string;
    runId: string;
    status: string;
    xAccountId: string | null;
    xAccountHandle: string | null;
    createdAt: string;
    updatedAt: string;
    lastError?: string | null;
    nextAction: string;
  }>;
  published: Array<{
    id: string;
    runId: string;
    status: string;
    publishKind: 'x_post' | 'x_article';
    publishMode: 'manual_x_web' | 'native_x_api';
    xAccountHandle: string | null;
    externalUrl: string | null;
    externalPostId?: string | null;
    updatedAt: string;
  }>;
  failed: Array<{
    id: string;
    runId: string;
    status: string;
    xAccountHandle: string | null;
    lastError?: string | null;
    updatedAt: string;
    nextAction: string;
  }>;
};

export async function fetchBillingPlans() {
  return apiFetch<{
    currency: string;
    trialDays: number;
    plans: BillingPlanView[];
  }>('/v3/billing/plans');
}

export async function createCheckout(plan: BillingPlanKey, cycle: BillingCycle) {
  return apiFetch<{ url: string }>('/v3/billing/checkout', {
    method: 'POST',
    body: JSON.stringify({ plan, cycle })
  });
}

export async function startXOAuth() {
  return apiFetch<{ url: string; state: string }>('/auth/x/authorize');
}

export async function startGoogleOAuth() {
  return apiFetch<{ url: string; state: string }>('/auth/google/authorize');
}

export async function createLocalSession() {
  return apiFetch<{ token: string; user: Record<string, unknown> }>('/auth/local/session', {
    method: 'POST'
  });
}

export async function finishXAccountOAuthBind(state: string, code: string) {
  return apiFetch<{ ok: boolean; account: Record<string, unknown> }>(
    `/v3/connections/x-self/callback?state=${encodeURIComponent(state)}&code=${encodeURIComponent(code)}`
  );
}

export async function fetchBootstrap() {
  return apiFetch<V3BootstrapResponse>('/v3/session/bootstrap', { method: 'POST' });
}

export async function runChat(input: {
  intent: string;
  format: V3Format;
  withImage: boolean;
  xAccountId?: string;
  safeMode?: boolean;
}) {
  return apiFetch<V3RunStartResponse>('/v3/chat/run', {
    method: 'POST',
    body: JSON.stringify(input)
  });
}

export async function fetchRun(runId: string) {
  return apiFetch<V3RunResponse>(`/v3/chat/runs/${runId}`);
}

export async function fetchProfile() {
  return apiFetch<V3ProfileResponse>('/v3/profile');
}

export async function rebuildProfile() {
  return apiFetch<{ ok: boolean; styleSummary: string | null; nextAction: string }>('/v3/profile/rebuild', {
    method: 'POST',
    body: JSON.stringify({})
  });
}

export async function fetchQueue(limit = 20) {
  return apiFetch<V3QueueResponse>(`/v3/queue?limit=${encodeURIComponent(String(limit))}`);
}

export async function preparePublish(input: { runId: string; xAccountId?: string; safeMode?: boolean }) {
  return apiFetch<{
    requestId?: string;
    runId: string;
    xAccount: { id: string; handle: string; status: string; isDefault: boolean } | null;
    safeMode: boolean;
    blockingReason: string | null;
    nextAction: string;
    exportGuide: {
      mode: string;
      openUrl: string;
      nativeApiAvailable: boolean;
      description: string;
    } | null;
    preview: {
      text: string;
      charCount: number;
      qualityScore: number;
      riskFlags: string[];
      imageKeywords: string[];
    } | null;
  }>('/v3/publish/prepare', {
    method: 'POST',
    body: JSON.stringify(input)
  });
}

export async function completeArticlePublish(input: { runId: string; url: string; xAccountId?: string }) {
  return apiFetch<{
    requestId?: string;
    traceId: string;
    publishRecordId: string;
    generationId: string;
    runId: string;
    status: string;
    externalUrl: string;
    publishedAt: string;
    xAccountId: string | null;
    xAccountHandle: string | null;
    nextAction: string;
  }>('/v3/publish/article/complete', {
    method: 'POST',
    body: JSON.stringify(input)
  });
}

export async function confirmPublish(input: { runId: string; xAccountId?: string; safeMode?: boolean }) {
  return apiFetch<{
    requestId?: string;
    traceId: string;
    publishJobId: string;
    status: string;
    generationId: string;
    requestedXAccountId: string | null;
    resolvedXAccountId: string | null;
    xAccountId: string | null;
    nextAction: string;
  }>('/v3/publish/confirm', {
    method: 'POST',
    body: JSON.stringify(input)
  });
}

export async function connectSelfX() {
  return apiFetch<{ url: string; state: string; redirectUri: string }>('/v3/connections/x-self', {
    method: 'POST',
    body: JSON.stringify({})
  });
}

export async function connectTargetX(handleOrUrl: string) {
  return apiFetch<{ ok: boolean; nextAction: string }>('/v3/connections/x-target', {
    method: 'POST',
    body: JSON.stringify({ handleOrUrl })
  });
}

export async function connectObsidianVault(input: { vaultPath: string; includePatterns?: string[] }) {
  return apiFetch<{ ok: boolean; nextAction: string }>('/v3/connections/obsidian', {
    method: 'POST',
    body: JSON.stringify(input)
  });
}

export async function connectLocalKnowledgeFiles(input: { paths: string[] }) {
  return apiFetch<{ ok: boolean; count: number; nextAction: string }>('/v3/connections/local-files', {
    method: 'POST',
    body: JSON.stringify(input)
  });
}

export async function importKnowledgeUrls(input: { urls: string[] }) {
  return apiFetch<{ ok: boolean; count: number; nextAction: string }>('/v3/connections/urls', {
    method: 'POST',
    body: JSON.stringify(input)
  });
}
