import type { XArticlePublishCapability } from '@draftorbit/shared';

export const X_ARTICLE_PUBLISHER = Symbol('X_ARTICLE_PUBLISHER');

export type ArticlePublishPreparation = {
  capability: XArticlePublishCapability;
};

export type ArticlePublishRecordResult = {
  traceId: string;
  publishRecordId: string;
  generationId: string;
  status: 'MANUAL_RECORDED';
  externalUrl: string;
  publishedAt: Date;
  xAccountId: string | null;
  xAccountHandle: string | null;
};

export interface XArticlePublisherProvider {
  getCapability(userId: string): Promise<XArticlePublishCapability>;
  prepare(runId: string, userId: string): Promise<ArticlePublishPreparation>;
  recordManualCompletion(
    runId: string,
    userId: string,
    url: string,
    xAccountId?: string
  ): Promise<ArticlePublishRecordResult>;
}
