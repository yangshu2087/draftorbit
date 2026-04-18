import { apiFetch } from './api';

export type BillingPlanKey = 'STARTER' | 'PRO' | 'PREMIUM';
export type BillingCycle = 'MONTHLY' | 'YEARLY';
export type V3Format = 'tweet' | 'thread' | 'article';
export type VisualRequestMode = 'auto' | 'cover' | 'cards' | 'infographic' | 'article_illustration' | 'diagram' | 'social_pack';
export type VisualRequestStyle = 'draftorbit' | 'notion' | 'sketch-notes' | 'blueprint' | 'minimal' | 'bold-editorial';
export type VisualRequestLayout = 'auto' | 'sparse' | 'balanced' | 'dense' | 'list' | 'comparison' | 'flow' | 'mindmap' | 'quadrant';
export type VisualRequestPalette = 'auto' | 'draftorbit' | 'macaron' | 'warm' | 'neon' | 'mono';
export type VisualRequestAspect = 'auto' | '1:1' | '16:9' | '4:5' | '2.35:1';

export type V3VisualRequest = {
  mode?: VisualRequestMode;
  style?: VisualRequestStyle;
  layout?: VisualRequestLayout;
  palette?: VisualRequestPalette;
  aspect?: VisualRequestAspect;
  exportHtml?: boolean;
};

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

export type UsageProviderHealth = {
  provider: 'codex-local' | 'openai' | 'openrouter' | 'ollama' | string;
  sampleSize: number;
  failureRate: number;
  consecutiveFailures: number;
  healthy: boolean;
  coolingDown: boolean;
  cooldownUntilMs: number | null;
  lastFailureAt: string | null;
  lastSuccessAt: string | null;
};

export type UsageFallbackHotspot = {
  lane: string;
  eventType: string;
  provider: string;
  totalCalls: number;
  fallbackHits: number;
  fallbackRate: number;
};

export type UsageSummaryResponse = {
  requestId?: string;
  workspaceId: string;
  periodStart: string;
  counters: {
    usageEvents: number;
    generations: number;
    publishJobs: number;
    replyJobs: number;
  };
  modelRouting: {
    totalCalls: number;
    freeHitRate: number;
    fallbackRate: number;
    qualityFallbackRate: number;
    avgRequestCostUsd: number;
    totalRequestCostUsd: number;
    avgQualityScore: number;
    profile?: string;
    healthProbe?: {
      enabled: boolean;
      windowMs: number;
      minSamples: number;
      failureRateThreshold: number;
      consecutiveFailureThreshold: number;
      cooldownMs: number;
    };
    providerHealth?: UsageProviderHealth[];
    fallbackHotspots?: UsageFallbackHotspot[];
  };
  nextAction?: string | null;
  blockingReason?: string | null;
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
    routing?: {
      trialMode?: boolean;
      primaryModel?: string;
      routingTier?: string;
      profile?: 'local' | 'local_free' | 'local_quality' | 'test_high' | 'prod_balanced';
      provider?: 'openai' | 'openrouter' | 'ollama' | 'codex-local';
    } | null;
    usage?: Array<{
      model: string;
      modelUsed: string;
      routingTier: string | null;
      costUsd: number;
      inputTokens?: number | null;
      outputTokens?: number | null;
    }>;
    qualitySignals?: {
      hookStrength: number;
      specificity: number;
      evidenceDensity: number;
      humanLikeness: number;
      conversationalFlow: number;
      visualizability: number;
      ctaNaturalness: number;
    } | null;
    visualPlan?: {
      primaryAsset: string;
      visualizablePoints: string[];
      keywords: string[];
      items: Array<{
        kind: string;
        priority: 'primary' | 'supporting';
        type: string;
        layout: string;
        style: string;
        palette: string;
        cue: string;
        reason: string;
      }>;
    } | null;
    visualAssets?: Array<{
      id: string;
      kind: string;
      status: 'ready' | 'generating' | 'failed';
      renderer?: 'template-svg' | 'provider-image';
      provider?: 'codex-local-svg' | 'template-svg' | 'baoyu-imagine' | 'ollama-text';
      model?: string;
      skill?: string;
      exportFormat?: 'svg' | 'html' | 'markdown' | 'zip';
      aspectRatio?: '1:1' | '16:9';
      textLayer?: 'app-rendered' | 'none';
      width?: number;
      height?: number;
      checksum?: string;
      assetUrl?: string;
      signedAssetUrl?: string;
      assetPath?: string;
      promptPath?: string;
      specPath?: string;
      cue: string;
      reason?: string;
      error?: string;
    }>;
    visualAssetsBundleUrl?: string | null;
    sourceArtifacts?: Array<{
      kind: 'url' | 'x' | 'youtube' | 'search';
      url?: string;
      title?: string;
      markdownPath: string;
      capturedAt: string;
      status: 'ready' | 'failed' | 'skipped';
      evidenceUrl?: string;
      error?: string;
    }>;
    runtime?: {
      engine: 'baoyu-skills';
      commit: string;
      skills: string[];
    } | null;
    derivativeReadiness?: {
      html?: { ready: boolean; score: number; reason: string };
      cards?: { ready: boolean; score: number; reason: string };
      infographic?: { ready: boolean; score: number; reason: string };
      slideSummary?: { ready: boolean; score: number; reason: string };
      markdown?: { ready: boolean; score: number; reason: string };
      translation?: { ready: boolean; score: number; reason: string };
    } | null;
    qualityGate?: {
      status: 'passed' | 'failed';
      safeToDisplay: boolean;
      hardFails: string[];
      visualHardFails?: string[];
      sourceRequired?: boolean;
      sourceStatus?: 'ready' | 'failed' | 'ambiguous' | 'not_configured';
      userMessage?: string;
      recoveryAction?: 'retry' | 'add_source' | 'narrow_topic';
      judgeNotes: string[];
    } | null;
    riskFlags: string[];
    requestCostUsd: number | null;
    whySummary: string[];
    evidenceSummary: string[];
    stepLatencyMs?: Record<string, number> | null;
  } | null;
  publish: Array<{
    id: string;
    status: string;
    xAccountId: string | null;
    xAccountHandle: string | null;
    createdAt: string;
    updatedAt: string;
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
    xAccountHandle: string | null;
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

export async function fetchUsageSummary() {
  return apiFetch<UsageSummaryResponse>('/usage/summary');
}

export async function runChat(input: {
  intent: string;
  format: V3Format;
  withImage: boolean;
  xAccountId?: string;
  safeMode?: boolean;
  visualRequest?: V3VisualRequest;
}) {
  return apiFetch<V3RunStartResponse>('/v3/chat/run', {
    method: 'POST',
    body: JSON.stringify(input)
  });
}

export async function fetchRun(runId: string) {
  return apiFetch<V3RunResponse>(`/v3/chat/runs/${runId}`);
}

export async function retryRunVisualAssets(runId: string, visualRequest?: V3VisualRequest) {
  return apiFetch<V3RunResponse>(`/v3/chat/runs/${runId}/assets/retry`, {
    method: 'POST',
    body: JSON.stringify({ visualRequest })
  });
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
