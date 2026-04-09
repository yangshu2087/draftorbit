export type XArticlePublishMode = 'manual_x_web' | 'native_x_api';
export type XArticlePublishAvailability = 'available' | 'blocked' | 'degraded';
export type XArticlePublishNextAction = 'export_article' | 'publish_article';
export type XArticlePublishReasonCode =
  | 'NO_PUBLIC_API'
  | 'MISSING_X_ACCOUNT'
  | 'MISSING_SCOPE'
  | 'FEATURE_FLAG_OFF'
  | 'PROVIDER_UNAVAILABLE';

export type XArticlePublishCapability = {
  mode: XArticlePublishMode;
  availability: XArticlePublishAvailability;
  nativeApiAvailable: boolean;
  nextAction: XArticlePublishNextAction;
  openUrl?: string;
  reasonCode?: XArticlePublishReasonCode;
  description: string;
};

const SUPPORTED_X_ARTICLE_HOSTS = new Set([
  'x.com',
  'www.x.com',
  'twitter.com',
  'www.twitter.com'
]);

export const X_ARTICLE_OPEN_URL = 'https://x.com';
export const X_ARTICLE_PUBLISH_UNSUPPORTED_MESSAGE = '当前公开的 X Developer API 没有提供 Articles 发布端点，长文需要先在 X 网页端完成发布。';

export function resolveXArticlePublishCapability(): XArticlePublishCapability {
  return {
    mode: 'manual_x_web',
    availability: 'available',
    nativeApiAvailable: false,
    nextAction: 'export_article',
    openUrl: X_ARTICLE_OPEN_URL,
    reasonCode: 'NO_PUBLIC_API',
    description: X_ARTICLE_PUBLISH_UNSUPPORTED_MESSAGE
  };
}

export function normalizeXArticleUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'https:') return null;
    if (!SUPPORTED_X_ARTICLE_HOSTS.has(parsed.hostname.toLowerCase())) return null;
    parsed.hash = '';
    return parsed.toString().replace(/\/$/, '');
  } catch {
    return null;
  }
}
