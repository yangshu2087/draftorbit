import { Module } from '@nestjs/common';
import { PublishController } from './publish.controller';
import { ManualXWebArticlePublisher } from './manual-x-web-article.publisher';
import { PublishService } from './publish.service';
import { X_ARTICLE_PUBLISHER } from './x-article-publisher';

@Module({
  controllers: [PublishController],
  providers: [
    PublishService,
    ManualXWebArticlePublisher,
    {
      provide: X_ARTICLE_PUBLISHER,
      useExisting: ManualXWebArticlePublisher
    }
  ],
  exports: [PublishService, X_ARTICLE_PUBLISHER]
})
export class PublishModule {}
