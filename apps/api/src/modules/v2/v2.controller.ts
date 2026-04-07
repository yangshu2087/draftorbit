import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  MessageEvent,
  Param,
  Patch,
  ParseIntPipe,
  Post,
  Query,
  Req,
  Sse,
  UseGuards
} from '@nestjs/common';
import { Observable } from 'rxjs';
import type { AuthUser } from '@draftorbit/shared';
import { AuthGuard } from '../../common/auth.guard';
import { SubscriptionGuard } from '../../common/subscription.guard';
import { getRequestId } from '../../common/request-id';
import { withRequestId } from '../../common/response-with-request-id';
import { GenerateService } from '../generate/generate.service';
import {
  AddReplyCandidateV2Dto,
  BindXAccountManualV2Dto,
  CancelSubscriptionV2Dto,
  ChatMessageDto,
  CheckoutV2Dto,
  ConnectLocalFilesDto,
  ConnectObsidianDto,
  CreateChatSessionDto,
  GenerateRunDto,
  ImportKnowledgeUrlsDto,
  ListPublishJobsV2Dto,
  ListReplyJobsV2Dto,
  ListXAccountsV2Dto,
  QueuePublishDto,
  RebuildStyleProfileDto,
  RefundV2Dto,
  SendReplyV2Dto,
  SyncReplyMentionsV2Dto,
  UpdateXAccountStatusV2Dto
} from './v2.dto';
import { V2Service } from './v2.service';

type RequestWithUser = {
  headers: Record<string, string | string[] | undefined>;
  user?: AuthUser;
};

@Controller('v2')
export class V2Controller {
  constructor(
    @Inject(V2Service) private readonly v2: V2Service,
    @Inject(GenerateService) private readonly generate: GenerateService,
    @Inject(SubscriptionGuard) private readonly subscriptionGuard: SubscriptionGuard
  ) {}

  @Post('chat/sessions')
  @UseGuards(AuthGuard)
  async createChatSession(@Req() req: RequestWithUser, @Body() body: CreateChatSessionDto) {
    const result = await this.v2.createChatSession((req.user as AuthUser).userId, body.title);
    return withRequestId(req, result);
  }

  @Post('chat/messages')
  @UseGuards(AuthGuard)
  async sendChatMessage(@Req() req: RequestWithUser, @Body() body: ChatMessageDto) {
    await this.subscriptionGuard.assertCanGenerate(req.user as AuthUser);
    const result = await this.v2.runGeneration((req.user as AuthUser).userId, body);
    return withRequestId(req, result);
  }

  @Post('generate/run')
  @UseGuards(AuthGuard)
  async runGenerate(@Req() req: RequestWithUser, @Body() body: GenerateRunDto) {
    await this.subscriptionGuard.assertCanGenerate(req.user as AuthUser);
    const result = await this.v2.runGeneration((req.user as AuthUser).userId, body);
    return withRequestId(req, result);
  }

  @Get('generate/history')
  @UseGuards(AuthGuard)
  async generationHistory(
    @Req() req: RequestWithUser,
    @Query('limit', new ParseIntPipe({ optional: true })) limit?: number
  ) {
    const resolvedLimit = limit ? Math.min(100, Math.max(1, limit)) : 20;
    const result = await this.v2.listGenerationHistory((req.user as AuthUser).userId, resolvedLimit);
    return withRequestId(req, result);
  }

  @Get('generate/:id')
  @UseGuards(AuthGuard)
  async getGeneration(@Req() req: RequestWithUser, @Param('id') id: string) {
    const result = await this.generate.getGeneration(id, (req.user as AuthUser).userId);
    return withRequestId(req, result);
  }

  @Sse('generate/:id/stream')
  @UseGuards(AuthGuard)
  streamGeneration(@Req() req: RequestWithUser, @Param('id') id: string): Observable<MessageEvent> {
    const requestId = getRequestId(req);
    const user = req.user as AuthUser;

    return new Observable<MessageEvent>((subscriber) => {
      void (async () => {
        try {
          for await (const event of this.generate.runReasoningChain(id, user.userId)) {
            subscriber.next({ data: { ...event, requestId } } as MessageEvent);
          }
          subscriber.complete();
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          subscriber.next({ data: { step: 'error', status: 'failed', content: message, requestId } } as MessageEvent);
          subscriber.complete();
        }
      })();
    });
  }

  @Post('knowledge/connectors/obsidian')
  @UseGuards(AuthGuard)
  async connectObsidian(@Req() req: RequestWithUser, @Body() body: ConnectObsidianDto) {
    const result = await this.v2.connectObsidian((req.user as AuthUser).userId, body);
    return withRequestId(req, result);
  }

  @Post('knowledge/connectors/local-files')
  @UseGuards(AuthGuard)
  async connectLocalFiles(@Req() req: RequestWithUser, @Body() body: ConnectLocalFilesDto) {
    const result = await this.v2.connectLocalFiles((req.user as AuthUser).userId, body);
    return withRequestId(req, result);
  }

  @Post('knowledge/urls/import')
  @UseGuards(AuthGuard)
  async importKnowledgeUrls(@Req() req: RequestWithUser, @Body() body: ImportKnowledgeUrlsDto) {
    const result = await this.v2.importKnowledgeUrls((req.user as AuthUser).userId, body);
    return withRequestId(req, result);
  }

  @Post('x-accounts/oauth/start')
  @UseGuards(AuthGuard)
  async startXOAuth(@Req() req: RequestWithUser) {
    const result = await this.v2.startXOAuth((req.user as AuthUser).userId);
    return withRequestId(req, result);
  }

  @Get('x-accounts')
  @UseGuards(AuthGuard)
  async listXAccounts(@Req() req: RequestWithUser, @Query() query: ListXAccountsV2Dto) {
    const result = await this.v2.listXAccounts((req.user as AuthUser).userId, query);
    return withRequestId(req, result);
  }

  @Post('x-accounts/bind-manual')
  @UseGuards(AuthGuard)
  async bindXAccountManual(@Req() req: RequestWithUser, @Body() body: BindXAccountManualV2Dto) {
    const result = await this.v2.bindXAccountManual((req.user as AuthUser).userId, body);
    return withRequestId(req, result);
  }

  @Patch('x-accounts/:id/default')
  @UseGuards(AuthGuard)
  async setDefaultXAccount(@Req() req: RequestWithUser, @Param('id') id: string) {
    const result = await this.v2.setDefaultXAccount((req.user as AuthUser).userId, id);
    return withRequestId(req, result);
  }

  @Patch('x-accounts/:id/status')
  @UseGuards(AuthGuard)
  async updateXAccountStatus(
    @Req() req: RequestWithUser,
    @Param('id') id: string,
    @Body() body: UpdateXAccountStatusV2Dto
  ) {
    const result = await this.v2.updateXAccountStatus((req.user as AuthUser).userId, id, body.status);
    return withRequestId(req, result);
  }

  @Delete('x-accounts/:id')
  @UseGuards(AuthGuard)
  async deleteXAccount(@Req() req: RequestWithUser, @Param('id') id: string) {
    const result = await this.v2.removeXAccount((req.user as AuthUser).userId, id);
    return withRequestId(req, result);
  }

  @Get('x-accounts/oauth/callback')
  async xOAuthCallback(
    @Req() req: RequestWithUser,
    @Query('state') state?: string,
    @Query('code') code?: string
  ) {
    if (!state || !code) {
      return withRequestId(req, {
        ok: false,
        message: 'Missing state or code'
      });
    }
    const result = await this.v2.handleXOAuthCallback(state, code);
    return withRequestId(req, result);
  }

  @Post('style/profile/rebuild')
  @UseGuards(AuthGuard)
  async rebuildStyleProfile(@Req() req: RequestWithUser, @Body() body: RebuildStyleProfileDto) {
    const result = await this.v2.rebuildStyleProfile((req.user as AuthUser).userId, body.profileId);
    return withRequestId(req, result);
  }

  @Post('publish/queue')
  @UseGuards(AuthGuard)
  async queuePublish(@Req() req: RequestWithUser, @Body() body: QueuePublishDto) {
    const result = await this.v2.queuePublish((req.user as AuthUser).userId, body);
    return withRequestId(req, result);
  }

  @Get('publish/jobs')
  @UseGuards(AuthGuard)
  async listPublishJobs(@Req() req: RequestWithUser, @Query() query: ListPublishJobsV2Dto) {
    const result = await this.v2.listPublishJobs((req.user as AuthUser).userId, query);
    return withRequestId(req, result);
  }

  @Post('publish/jobs/:id/retry')
  @UseGuards(AuthGuard)
  async retryPublishJob(@Req() req: RequestWithUser, @Param('id') id: string) {
    const result = await this.v2.retryPublishJob((req.user as AuthUser).userId, id);
    return withRequestId(req, result);
  }

  @Get('reply/jobs')
  @UseGuards(AuthGuard)
  async listReplyJobs(@Req() req: RequestWithUser, @Query() query: ListReplyJobsV2Dto) {
    const result = await this.v2.listReplyJobs((req.user as AuthUser).userId, query);
    return withRequestId(req, result);
  }

  @Post('reply/sync-mentions')
  @UseGuards(AuthGuard)
  async syncReplyMentions(@Req() req: RequestWithUser, @Body() body: SyncReplyMentionsV2Dto) {
    const result = await this.v2.syncReplyMentions((req.user as AuthUser).userId, body);
    return withRequestId(req, result);
  }

  @Post('reply/:replyJobId/candidates')
  @UseGuards(AuthGuard)
  async addReplyCandidate(
    @Req() req: RequestWithUser,
    @Param('replyJobId') replyJobId: string,
    @Body() body: AddReplyCandidateV2Dto
  ) {
    const result = await this.v2.addReplyCandidate((req.user as AuthUser).userId, replyJobId, body);
    return withRequestId(req, result);
  }

  @Post('reply/:replyJobId/candidates/:candidateId/approve')
  @UseGuards(AuthGuard)
  async approveReplyCandidate(
    @Req() req: RequestWithUser,
    @Param('replyJobId') replyJobId: string,
    @Param('candidateId') candidateId: string
  ) {
    const result = await this.v2.approveReplyCandidate(
      (req.user as AuthUser).userId,
      replyJobId,
      candidateId
    );
    return withRequestId(req, result);
  }

  @Post('reply/:replyJobId/send')
  @UseGuards(AuthGuard)
  async sendReply(
    @Req() req: RequestWithUser,
    @Param('replyJobId') replyJobId: string,
    @Body() body: SendReplyV2Dto
  ) {
    const result = await this.v2.sendReply((req.user as AuthUser).userId, replyJobId, body.candidateId);
    return withRequestId(req, result);
  }

  @Get('ops/dashboard')
  @UseGuards(AuthGuard)
  async dashboard(@Req() req: RequestWithUser) {
    const result = await this.v2.getOpsDashboard((req.user as AuthUser).userId);
    return withRequestId(req, result);
  }

  @Get('usage/overview')
  @UseGuards(AuthGuard)
  async usageOverview(
    @Req() req: RequestWithUser,
    @Query('eventsLimit', new ParseIntPipe({ optional: true })) eventsLimit?: number,
    @Query('days', new ParseIntPipe({ optional: true })) days?: number
  ) {
    const result = await this.v2.getUsageOverview((req.user as AuthUser).userId, { eventsLimit, days });
    return withRequestId(req, result);
  }

  @Get('billing/plans')
  async plans(@Req() req: RequestWithUser) {
    return withRequestId(req, this.v2.getBillingPlans());
  }

  @Get('billing/subscription')
  @UseGuards(AuthGuard)
  async subscription(@Req() req: RequestWithUser) {
    const result = await this.v2.getBillingSubscription((req.user as AuthUser).userId);
    return withRequestId(req, result);
  }

  @Get('billing/usage')
  @UseGuards(AuthGuard)
  async billingUsage(@Req() req: RequestWithUser) {
    const result = await this.v2.getBillingUsage((req.user as AuthUser).userId);
    return withRequestId(req, result);
  }

  @Post('billing/subscription/cancel')
  @UseGuards(AuthGuard)
  async cancelSubscription(@Req() req: RequestWithUser, @Body() body: CancelSubscriptionV2Dto) {
    const result = await this.v2.cancelBillingSubscription((req.user as AuthUser).userId, body.mode);
    return withRequestId(req, result);
  }

  @Post('billing/refund')
  @UseGuards(AuthGuard)
  async refund(@Req() req: RequestWithUser, @Body() body: RefundV2Dto) {
    const result = await this.v2.refundBilling((req.user as AuthUser).userId, body);
    return withRequestId(req, result);
  }

  @Post('billing/checkout')
  @UseGuards(AuthGuard)
  async checkout(@Req() req: RequestWithUser, @Body() body: CheckoutV2Dto) {
    const result = await this.v2.createCheckout((req.user as AuthUser).userId, body.plan, body.cycle);
    return withRequestId(req, result);
  }
}
