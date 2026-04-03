export interface AuthUser {
  userId: string;
  twitterId?: string;
  handle: string;
  plan: 'FREE' | 'PRO' | 'PREMIUM';
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

export interface AuditLogEntity {
  id: string;
  action: string;
  resourceType: string;
  resourceId: string | null;
  payload: Record<string, unknown> | null;
  createdAt: string;
}

export interface XAccountEntity {
  id: string;
  twitterUserId: string;
  handle: string;
  status: 'ACTIVE' | 'EXPIRED' | 'REVOKED' | 'ERROR';
  createdAt: string;
  updatedAt: string;
}
