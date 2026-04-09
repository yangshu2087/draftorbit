export type XArticlePublishCapability = {
  mode: 'manual_x_web';
  nativeApiAvailable: false;
  nextAction: 'export_article';
  openUrl: string;
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
    nativeApiAvailable: false,
    nextAction: 'export_article',
    openUrl: X_ARTICLE_OPEN_URL,
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
