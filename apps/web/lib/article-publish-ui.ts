import {
  X_ARTICLE_OPEN_URL,
  X_ARTICLE_PUBLISH_UNSUPPORTED_MESSAGE,
  type XArticlePublishCapability
} from '@draftorbit/shared';

export function getDefaultArticleCapability(): XArticlePublishCapability {
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

export function getArticlePrimaryAction(capability: XArticlePublishCapability) {
  if (capability.mode === 'native_x_api' && capability.availability === 'available') {
    return {
      label: '直接发布到 X',
      secondaryLabel: '复制长文备用'
    };
  }

  return {
    label: '复制并去 X 发布',
    secondaryLabel: '只复制长文'
  };
}
