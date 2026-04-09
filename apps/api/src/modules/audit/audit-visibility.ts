import type {
  AuditLogEntity,
  AuditPayloadAccess,
  AuditVisibility,
  AuditVisibilityDomain,
  WorkspaceRoleValue
} from '@draftorbit/shared';

const AUDIT_RESOURCE_DOMAIN: Record<string, AuditVisibilityDomain> = {
  draft: 'CONTENT',
  topic: 'CONTENT',
  playbook: 'CONTENT',
  voice_profile: 'CONTENT',
  learning_source: 'LEARNING',
  media_asset: 'MEDIA',
  publish_job: 'PUBLISHING',
  reply_job: 'REPLY',
  reply_candidate: 'REPLY',
  workflow_template: 'WORKFLOW',
  workflow_run: 'WORKFLOW',
  provider_connection: 'INTEGRATIONS',
  x_account: 'INTEGRATIONS',
  billing_account: 'BILLING',
  workspace: 'WORKSPACE_ADMIN'
};

const ALL_AUDIT_DOMAINS: AuditVisibilityDomain[] = [
  'CONTENT',
  'LEARNING',
  'MEDIA',
  'PUBLISHING',
  'REPLY',
  'WORKFLOW',
  'INTEGRATIONS',
  'BILLING',
  'WORKSPACE_ADMIN',
  'UNKNOWN'
];

const EDITOR_VISIBLE_DOMAINS: AuditVisibilityDomain[] = [
  'CONTENT',
  'LEARNING',
  'MEDIA',
  'PUBLISHING',
  'REPLY',
  'WORKFLOW'
];

function sortDomains(domains: AuditVisibilityDomain[]) {
  return [...domains].sort((a, b) => ALL_AUDIT_DOMAINS.indexOf(a) - ALL_AUDIT_DOMAINS.indexOf(b));
}

function payloadToRecord(payload: unknown): Record<string, unknown> | null {
  if (payload == null) return null;
  if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
    return payload as Record<string, unknown>;
  }
  return { value: payload };
}

export function classifyAuditDomain(resourceType: string): AuditVisibilityDomain {
  return AUDIT_RESOURCE_DOMAIN[resourceType] ?? 'UNKNOWN';
}

export function buildAuditVisibility(role: WorkspaceRoleValue): AuditVisibility {
  if (role === 'OWNER' || role === 'ADMIN') {
    return {
      role,
      scope: 'FULL_WORKSPACE',
      payloadAccess: 'FULL',
      visibleDomains: [...ALL_AUDIT_DOMAINS],
      hiddenDomains: []
    };
  }

  const visibleDomains = sortDomains(EDITOR_VISIBLE_DOMAINS);
  const hiddenDomains = sortDomains(ALL_AUDIT_DOMAINS.filter((domain) => !visibleDomains.includes(domain)));

  return {
    role,
    scope: 'OPERATIONS_ONLY',
    payloadAccess: role === 'EDITOR' ? 'FULL' : 'NONE',
    visibleDomains,
    hiddenDomains
  };
}

export function getVisibleAuditResourceTypes(role: WorkspaceRoleValue): string[] | null {
  const visibility = buildAuditVisibility(role);
  if (visibility.scope === 'FULL_WORKSPACE') {
    return null;
  }

  return Object.entries(AUDIT_RESOURCE_DOMAIN)
    .filter(([, domain]) => visibility.visibleDomains.includes(domain))
    .map(([resourceType]) => resourceType)
    .sort();
}

export function sanitizeAuditLog(
  log: {
    id: string;
    action: string;
    resourceType: string;
    resourceId: string | null;
    payload: unknown;
    createdAt: Date | string;
  },
  payloadAccess: AuditPayloadAccess
): AuditLogEntity {
  return {
    id: log.id,
    action: log.action,
    resourceType: log.resourceType,
    resourceId: log.resourceId ?? null,
    payload: payloadAccess === 'FULL' ? payloadToRecord(log.payload) : null,
    createdAt: log.createdAt instanceof Date ? log.createdAt.toISOString() : log.createdAt,
    visibilityDomain: classifyAuditDomain(log.resourceType),
    payloadRedacted: payloadAccess !== 'FULL' && log.payload != null
  };
}
