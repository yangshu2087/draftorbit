import { Global, Module } from '@nestjs/common';
import { PrismaService } from './common/prisma.service';
import { ModelGatewayService } from './common/model-gateway.service';
import { OpenRouterService } from './common/openrouter.service';
import { TwitterService } from './common/twitter.service';
import { SubscriptionGuard } from './common/subscription.guard';
import { QueueService } from './common/queue.service';
import { OAuthStateService } from './common/oauth-state.service';
import { GoogleClientService } from './common/google-client.service';
import { SelfHostAuthService } from './common/self-host-auth.service';
import { WorkspaceContextService } from './common/workspace-context.service';

@Global()
@Module({
  providers: [
    PrismaService,
    OpenRouterService,
    {
      provide: ModelGatewayService,
      useFactory: (openRouter: OpenRouterService) => new ModelGatewayService(openRouter),
      inject: [OpenRouterService]
    },
    TwitterService,
    SubscriptionGuard,
    QueueService,
    OAuthStateService,
    GoogleClientService,
    SelfHostAuthService,
    WorkspaceContextService
  ],
  exports: [
    PrismaService,
    ModelGatewayService,
    OpenRouterService,
    TwitterService,
    SubscriptionGuard,
    QueueService,
    OAuthStateService,
    GoogleClientService,
    SelfHostAuthService,
    WorkspaceContextService
  ]
})
export class CoreModule {}
