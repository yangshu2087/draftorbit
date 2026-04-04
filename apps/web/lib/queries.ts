import type {
  AuditLogEntity,
  DraftEntity,
  ProviderEntity,
  PublishJobEntity,
  ReplyJobEntity,
  TopicEntity,
  XAccountEntity
} from '@draftorbit/shared';
import { apiFetch } from './api';

export async function startGeneration(data: {
  prompt: string;
  type?: string;
  language?: string;
  useStyle?: boolean;
}) {
  return apiFetch<{ generationId: string }>('/generate/start', {
    method: 'POST',
    body: JSON.stringify(data)
  });
}

export async function fetchGeneration(id: string) {
  return apiFetch<Record<string, unknown>>(`/generate/${id}`);
}

export async function fetchHistory() {
  return apiFetch<Record<string, unknown>[]>('/generate/history');
}

export async function analyzeStyle() {
  return apiFetch<Record<string, unknown>>('/history/analyze', { method: 'POST' });
}

export async function fetchStyle() {
  return apiFetch<Record<string, unknown>>('/history/style');
}

export async function publishTweet(generationId: string) {
  return apiFetch<Record<string, unknown>>('/publish/tweet', {
    method: 'POST',
    body: JSON.stringify({ generationId })
  });
}

export async function fetchSubscription() {
  return apiFetch<Record<string, unknown>>('/billing/subscription');
}

export async function fetchBillingPlans() {
  return apiFetch<{
    currency: string;
    trialDays: number;
    plans: Array<{
      key: 'PRO' | 'PREMIUM';
      name: string;
      priceMonthlyUsd: number;
      priceMonthlyUsdCents: number;
      features: string[];
    }>;
  }>('/billing/plans');
}

export async function fetchUsage() {
  return apiFetch<Record<string, unknown>>('/billing/usage');
}

export async function createCheckout(plan: string) {
  return apiFetch<{ url: string }>('/billing/checkout', {
    method: 'POST',
    body: JSON.stringify({ plan })
  });
}

export async function fetchMe() {
  return apiFetch<Record<string, unknown>>('/auth/me');
}

export async function startXOAuth() {
  return apiFetch<{ url: string; state: string }>('/auth/x/authorize');
}

export async function startGoogleOAuth() {
  return apiFetch<{ url: string; state: string }>('/auth/google/authorize');
}

export async function createLocalSession() {
  return apiFetch<{ token: string; user: Record<string, unknown> }>('/auth/local/session', { method: 'POST' });
}

export async function fetchWorkspace() {
  return apiFetch<Record<string, unknown>>('/workspaces/me');
}

export async function bootstrapWorkspace() {
  return apiFetch<Record<string, unknown>>('/workspaces/bootstrap', { method: 'POST' });
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
  return apiFetch<XAccountEntity[]>(`/x-accounts${suffix}`);
}

export async function bindXAccountManual(input: {
  twitterUserId: string;
  handle: string;
  status?: string;
}) {
  return apiFetch<Record<string, unknown>>('/x-accounts/bind-manual', {
    method: 'POST',
    body: JSON.stringify(input)
  });
}

export async function fetchTopics(options?: {
  page?: number;
  pageSize?: number;
  status?: 'ACTIVE' | 'ARCHIVED';
}) {
  const query = new URLSearchParams();
  if (options?.page) query.set('page', String(options.page));
  if (options?.pageSize) query.set('pageSize', String(options.pageSize));
  if (options?.status) query.set('status', options.status);
  const suffix = query.toString() ? `?${query.toString()}` : '';
  return apiFetch<TopicEntity[]>(`/topics${suffix}`);
}

export async function createTopic(input: { title: string; description?: string }) {
  return apiFetch<TopicEntity>('/topics', { method: 'POST', body: JSON.stringify(input) });
}

export async function fetchLearningSources() {
  return apiFetch<Record<string, unknown>[]>('/learning-sources');
}

export async function createLearningSource(input: {
  sourceType: string;
  sourceRef: string;
  xAccountId?: string;
}) {
  return apiFetch<Record<string, unknown>>('/learning-sources', { method: 'POST', body: JSON.stringify(input) });
}

export async function runLearningSource(id: string) {
  return apiFetch<Record<string, unknown>>(`/learning-sources/${id}/run`, { method: 'POST' });
}

export async function fetchVoiceProfiles() {
  return apiFetch<Record<string, unknown>[]>('/voice-profiles');
}

export async function createVoiceProfile(input: { name: string; xAccountId?: string; profile?: unknown }) {
  return apiFetch<Record<string, unknown>>('/voice-profiles', { method: 'POST', body: JSON.stringify(input) });
}

export async function fetchPlaybooks() {
  return apiFetch<Record<string, unknown>[]>('/playbooks');
}

export async function createPlaybook(input: { name: string; xAccountId?: string; rules?: unknown }) {
  return apiFetch<Record<string, unknown>>('/playbooks', { method: 'POST', body: JSON.stringify(input) });
}

export async function fetchDrafts(options?: {
  page?: number;
  pageSize?: number;
  status?: DraftEntity['status'];
}) {
  const query = new URLSearchParams();
  if (options?.page) query.set('page', String(options.page));
  if (options?.pageSize) query.set('pageSize', String(options.pageSize));
  if (options?.status) query.set('status', options.status);
  const suffix = query.toString() ? `?${query.toString()}` : '';
  return apiFetch<DraftEntity[]>(`/drafts${suffix}`);
}

export async function createDraft(input: { title: string; content: string; language?: string }) {
  return apiFetch<DraftEntity>('/drafts', { method: 'POST', body: JSON.stringify(input) });
}

export async function qualityCheckDraft(id: string) {
  return apiFetch<{
    draftId: string;
    passed: boolean;
    score: number;
    blockers: Array<{ code: string; message: string }>;
    warnings: Array<{ code: string; message: string }>;
  }>(`/drafts/${id}/quality-check`, { method: 'POST' });
}

export async function approveDraft(id: string) {
  return apiFetch<DraftEntity & { quality?: Record<string, unknown> }>(`/drafts/${id}/approve`, {
    method: 'POST'
  });
}

export async function fetchPublishJobs(options?: {
  limit?: number;
  page?: number;
  pageSize?: number;
  status?: PublishJobEntity['status'];
}) {
  const query = new URLSearchParams();
  if (options?.limit) query.set('limit', String(options.limit));
  if (options?.page) query.set('page', String(options.page));
  if (options?.pageSize) query.set('pageSize', String(options.pageSize));
  if (options?.status) query.set('status', options.status);
  const suffix = query.toString() ? `?${query.toString()}` : '';
  return apiFetch<PublishJobEntity[]>(`/publish/jobs${suffix}`);
}

export async function publishDraft(input: { draftId: string; scheduledFor?: string }) {
  return apiFetch<Record<string, unknown>>('/publish/draft', { method: 'POST', body: JSON.stringify(input) });
}

export async function retryPublishJob(id: string) {
  return apiFetch<Record<string, unknown>>(`/publish/jobs/${id}/retry`, { method: 'POST' });
}

export async function fetchReplyJobs(options?: {
  page?: number;
  pageSize?: number;
  status?: ReplyJobEntity['status'];
}) {
  const query = new URLSearchParams();
  if (options?.page) query.set('page', String(options.page));
  if (options?.pageSize) query.set('pageSize', String(options.pageSize));
  if (options?.status) query.set('status', options.status);
  const suffix = query.toString() ? `?${query.toString()}` : '';
  return apiFetch<ReplyJobEntity[]>(`/reply-jobs${suffix}`);
}

export async function syncMentions(input?: { xAccountId?: string; sourcePostId?: string }) {
  return apiFetch<Record<string, unknown>>('/reply-jobs/sync-mentions', {
    method: 'POST',
    body: JSON.stringify(input ?? {})
  });
}

export async function approveReplyCandidate(replyJobId: string, candidateId: string) {
  return apiFetch<Record<string, unknown>>(`/reply-jobs/${replyJobId}/candidates/${candidateId}/approve`, {
    method: 'POST'
  });
}

export async function sendReplyJob(replyJobId: string, candidateId?: string) {
  return apiFetch<Record<string, unknown>>(`/reply-jobs/${replyJobId}/send`, {
    method: 'POST',
    body: JSON.stringify({ candidateId })
  });
}

export async function fetchProviders() {
  return apiFetch<ProviderEntity[]>('/providers');
}

export async function upsertProvider(input: Record<string, unknown>) {
  return apiFetch<Record<string, unknown>>('/providers', { method: 'POST', body: JSON.stringify(input) });
}

export async function routeProviderText(input: {
  prompt: string;
  taskType: string;
  model?: string;
  providerType?: string;
  temperature?: number;
}) {
  return apiFetch<Record<string, unknown>>('/providers/route/text', { method: 'POST', body: JSON.stringify(input) });
}

export async function fetchUsageSummary() {
  return apiFetch<Record<string, unknown>>('/usage/summary');
}

export async function fetchUsageEvents(limit = 100) {
  return apiFetch<Record<string, unknown>[]>(`/usage/events?limit=${limit}`);
}

export async function fetchUsageTrends(days = 14) {
  return apiFetch<{
    workspaceId: string;
    days: number;
    from: string;
    points: Array<{
      date: string;
      generation: number;
      naturalization: number;
      image: number;
      reply: number;
      publish: number;
      totalEvents: number;
      costUsd: number;
    }>;
  }>(`/usage/trends?days=${days}`);
}

export async function fetchAuditLogs(limit = 100) {
  return apiFetch<AuditLogEntity[]>(`/audit/logs?limit=${limit}`);
}

export async function fetchAuditSummary() {
  return apiFetch<Record<string, unknown>>('/audit/summary');
}

export async function fetchMediaAssets() {
  return apiFetch<Record<string, unknown>[]>('/media');
}

export async function generateMediaPlaceholder(input: { prompt: string; draftId?: string }) {
  return apiFetch<Record<string, unknown>>('/media/generate-placeholder', {
    method: 'POST',
    body: JSON.stringify(input)
  });
}

export async function uploadMediaPlaceholder(input: { sourceUrl: string; name?: string; draftId?: string }) {
  return apiFetch<Record<string, unknown>>('/media/upload-placeholder', {
    method: 'POST',
    body: JSON.stringify(input)
  });
}

export async function fetchWorkflowTemplates() {
  return apiFetch<Record<string, unknown>[]>('/workflow/templates');
}

export async function createWorkflowTemplate(input: { name: string; key: string; config?: unknown }) {
  return apiFetch<Record<string, unknown>>('/workflow/templates', { method: 'POST', body: JSON.stringify(input) });
}

export async function runWorkflowTemplate(id: string, input?: Record<string, unknown>) {
  return apiFetch<Record<string, unknown>>(`/workflow/templates/${id}/run`, {
    method: 'POST',
    body: JSON.stringify({ input: input ?? {} })
  });
}

export async function fetchWorkflowRuns() {
  return apiFetch<Record<string, unknown>[]>('/workflow/runs');
}

export async function fetchOperationTemplates() {
  return apiFetch<
    Array<{
      key: string;
      name: string;
      description: string;
      variables: string[];
      defaultTone: string;
    }>
  >('/workflow/operation-templates');
}

export async function applyOperationTemplate(
  key: string,
  input: { topic: string; audience?: string; tone?: string; cta?: string }
) {
  return apiFetch<Record<string, unknown>>(`/workflow/operation-templates/${key}/apply`, {
    method: 'POST',
    body: JSON.stringify(input)
  });
}

export async function runPresetPipeline(input?: Record<string, unknown>) {
  return apiFetch<Record<string, unknown>>('/workflow/presets/pipeline/run', {
    method: 'POST',
    body: JSON.stringify({ input: input ?? {} })
  });
}

export async function naturalizePreview(input: {
  text: string;
  tone?: string;
  strictness?: 'low' | 'medium' | 'high';
}) {
  return apiFetch<Record<string, unknown>>('/naturalization/preview', {
    method: 'POST',
    body: JSON.stringify(input)
  });
}

export async function fetchQueueHealth() {
  return apiFetch<Record<string, unknown>>('/ops/queues');
}
