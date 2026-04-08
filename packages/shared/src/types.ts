export interface AuthUser {
  userId: string;
  twitterId?: string;
  handle: string;
  plan: 'FREE' | 'STARTER' | 'PRO' | 'PREMIUM';
  workspaceId?: string;
  role?: string;
}

export interface AppErrorPayload {
  code: string;
  message: string;
  details?: unknown;
  requestId?: string;
  statusCode?: number;
}

export interface TopicEntity {
  id: string;
  title: string;
  description: string | null;
  status: 'ACTIVE' | 'ARCHIVED';
  createdAt: string;
  updatedAt: string;
}

export interface DraftEntity {
  id: string;
  title: string | null;
  language: string;
  status: 'DRAFT' | 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED' | 'QUEUED' | 'PUBLISHED' | 'FAILED';
  latestContent: string | null;
  currentVersion: number;
  approvedAt: string | null;
  publishedAt: string | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PublishJobEntity {
  id: string;
  draftId: string | null;
  generationId: string | null;
  channel: 'X_TWEET' | 'X_THREAD';
  status: 'PENDING' | 'QUEUED' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'CANCELED';
  payload: Record<string, unknown>;
  scheduledFor: string | null;
  attempts: number;
  maxAttempts: number;
  lastError: string | null;
  externalPostId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ReplyCandidateEntity {
  id: string;
  content: string;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  riskScore: string;
  approvalStatus: 'PENDING' | 'APPROVED' | 'REJECTED';
  approvedAt: string | null;
}

export interface ReplyJobEntity {
  id: string;
  xAccountId: string | null;
  sourcePostId: string | null;
  status: 'PENDING' | 'QUEUED' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'CANCELED';
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
  candidates?: ReplyCandidateEntity[];
}

export interface ProviderEntity {
  id: string;
  name: string;
  providerType: 'OPENROUTER' | 'OPENAI' | 'ANTHROPIC' | 'GEMINI' | 'MOCK';
  isEnabled: boolean;
  apiKeyMasked?: string;
  baseUrl?: string | null;
}

export type WorkspaceRoleValue = 'OWNER' | 'ADMIN' | 'EDITOR' | 'VIEWER';

export type AuditVisibilityDomain =
  | 'CONTENT'
  | 'LEARNING'
  | 'MEDIA'
  | 'PUBLISHING'
  | 'REPLY'
  | 'WORKFLOW'
  | 'INTEGRATIONS'
  | 'BILLING'
  | 'WORKSPACE_ADMIN'
  | 'UNKNOWN';

export type AuditVisibilityScope = 'FULL_WORKSPACE' | 'OPERATIONS_ONLY';
export type AuditPayloadAccess = 'FULL' | 'NONE';

export interface AuditVisibility {
  role: WorkspaceRoleValue;
  scope: AuditVisibilityScope;
  payloadAccess: AuditPayloadAccess;
  visibleDomains: AuditVisibilityDomain[];
  hiddenDomains: AuditVisibilityDomain[];
}

export interface AuditLogEntity {
  id: string;
  action: string;
  resourceType: string;
  resourceId: string | null;
  payload: Record<string, unknown> | null;
  createdAt: string;
  visibilityDomain?: AuditVisibilityDomain;
  payloadRedacted?: boolean;
}

export interface AuditLogsResponse {
  items: AuditLogEntity[];
  hiddenCount: number;
  visibility: AuditVisibility;
  limit: number;
}

export interface AuditSummaryEntity {
  workspaceId: string;
  total: number;
  last24h: number;
  workspaceTotal: number;
  workspaceLast24h: number;
  hiddenTotal: number;
  hiddenLast24h: number;
  visibility: AuditVisibility;
}

export type UsageSnapshotAccessTier = 'FULL' | 'LIMITED' | 'OVERVIEW';

export interface UsageVisibility {
  role: WorkspaceRoleValue;
  accessTier: UsageSnapshotAccessTier;
  canViewCosts: boolean;
  canViewLedgerDetails: boolean;
  canManageCredits: boolean;
  redactedFields: string[];
}

export interface UsageBillingSnapshot {
  plan: string;
  status: string;
  monthlyQuota: number;
  remainingCredits: number;
  cycleStart: string | null;
  cycleEnd: string | null;
  stripeCustomerId?: string | null;
}

export interface UsageTokenCostSnapshot {
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

export interface CreditLedgerSnapshot {
  id: string;
  direction: string;
  amount: number;
  balanceAfter: number | null;
  reason: string;
  createdAt: string;
  metadata?: Record<string, unknown> | null;
}

export interface UsageSummaryEntity {
  workspaceId: string;
  periodStart: string;
  billing: UsageBillingSnapshot | null;
  counters: {
    usageEvents: number;
    generations: number;
    publishJobs: number;
    replyJobs: number;
  };
  tokenCost: UsageTokenCostSnapshot | null;
  latestLedgers: CreditLedgerSnapshot[];
  visibility: UsageVisibility;
}

export interface UsageEventEntity {
  id: string;
  eventType: string;
  model: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  costUsd: number | null;
  createdAt: string;
  detailsRedacted: boolean;
}

export interface UsageTrendPoint {
  date: string;
  generation: number;
  naturalization: number;
  image: number;
  reply: number;
  publish: number;
  totalEvents: number;
  costUsd: number | null;
}

export interface UsageTrendsEntity {
  workspaceId: string;
  days: number;
  from: string;
  visibility: UsageVisibility;
  points: UsageTrendPoint[];
}

export interface XAccountEntity {
  id: string;
  twitterUserId: string;
  handle: string;
  status: 'ACTIVE' | 'EXPIRED' | 'REVOKED' | 'ERROR';
  createdAt: string;
  updatedAt: string;
}
