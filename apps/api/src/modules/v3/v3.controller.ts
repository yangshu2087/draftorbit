import {
  Body,
  Controller,
  Get,
  Inject,
  MessageEvent,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  Sse,
  UseGuards
} from '@nestjs/common';
import { Observable } from 'rxjs';
import type { AuthUser } from '@draftorbit/shared';
import { AuthGuard } from '../../common/auth.guard';
import { getRequestId } from '../../common/request-id';
import { withRequestId } from '../../common/response-with-request-id';
import { SubscriptionGuard } from '../../common/subscription.guard';
import type { VisualRequest } from '../generate/visual-request';
import {
  V3BillingCheckoutDto,
  V3ConnectLocalFilesDto,
  V3ConnectObsidianDto,
  V3ConnectTargetDto,
  V3ConnectUrlsDto,
  V3CreateProjectDto,
  V3ProjectGenerateDto,
  V3PublishArticleCompleteDto,
  V3PublishConfirmDto,
  V3PublishPrepareDto,
  V3QueueQueryDto,
  V3RunChatDto,
  V3UpdateProjectDto
} from './v3.dto';
import { V3Service } from './v3.service';

type RequestWithUser = {
  headers: Record<string, string | string[] | undefined>;
  user?: AuthUser;
};

@Controller('v3')
export class V3Controller {
  constructor(
    @Inject(V3Service) private readonly v3: V3Service,
    @Inject(SubscriptionGuard) private readonly subscriptionGuard: SubscriptionGuard
  ) {}

  @Post('session/bootstrap')
  @UseGuards(AuthGuard)
  async bootstrap(@Req() req: RequestWithUser) {
    const result = await this.v3.bootstrapSession((req.user as AuthUser).userId);
    return withRequestId(req, result);
  }

  @Get('projects')
  @UseGuards(AuthGuard)
  async listProjects(@Req() req: RequestWithUser) {
    const result = await this.v3.listProjects((req.user as AuthUser).userId);
    return withRequestId(req, result);
  }

  @Post('projects')
  @UseGuards(AuthGuard)
  async createProject(@Req() req: RequestWithUser, @Body() body: V3CreateProjectDto) {
    const result = await this.v3.createProject((req.user as AuthUser).userId, body);
    return withRequestId(req, result);
  }

  @Get('projects/:id')
  @UseGuards(AuthGuard)
  async getProject(@Req() req: RequestWithUser, @Param('id') id: string) {
    const result = await this.v3.getProject((req.user as AuthUser).userId, id);
    return withRequestId(req, result);
  }

  @Patch('projects/:id')
  @UseGuards(AuthGuard)
  async updateProject(@Req() req: RequestWithUser, @Param('id') id: string, @Body() body: V3UpdateProjectDto) {
    const result = await this.v3.updateProject((req.user as AuthUser).userId, id, body);
    return withRequestId(req, result);
  }

  @Post('projects/:id/generate')
  @UseGuards(AuthGuard)
  async generateProjectRun(@Req() req: RequestWithUser, @Param('id') id: string, @Body() body: V3ProjectGenerateDto) {
    await this.subscriptionGuard.assertCanGenerate(req.user as AuthUser);
    const result = await this.v3.generateProjectRun((req.user as AuthUser).userId, id, body);
    return withRequestId(req, result);
  }

  @Post('chat/run')
  @UseGuards(AuthGuard)
  async runChat(@Req() req: RequestWithUser, @Body() body: V3RunChatDto) {
    await this.subscriptionGuard.assertCanGenerate(req.user as AuthUser);
    const result = await this.v3.runChat((req.user as AuthUser).userId, body);
    return withRequestId(req, result);
  }

  @Get('chat/runs/:id')
  @UseGuards(AuthGuard)
  async getRun(@Req() req: RequestWithUser, @Param('id') id: string) {
    const result = await this.v3.getRun((req.user as AuthUser).userId, id);
    return withRequestId(req, result);
  }

  @Get('chat/runs/:id/assets/:assetId')
  async getRunAsset(
    @Param('id') id: string,
    @Param('assetId') assetId: string,
    @Query('token') token: string | undefined,
    @Res() res: any
  ) {
    const result = await this.v3.getRunAssetPublic(id, assetId, token);
    res.type(result.contentType).send(result.data);
  }

  @Get('chat/runs/:id/assets.zip')
  async getRunAssetsZip(@Param('id') id: string, @Query('token') token: string | undefined, @Res() res: any) {
    const result = await this.v3.getRunAssetsZipPublic(id, token);
    res
      .type(result.contentType)
      .setHeader('Content-Disposition', `attachment; filename="${result.filename}"`)
      .send(result.data);
  }

  @Post('chat/runs/:id/assets/retry')
  @UseGuards(AuthGuard)
  async retryRunAssets(@Req() req: RequestWithUser, @Param('id') id: string, @Body() body: { visualRequest?: unknown }) {
    const result = await this.v3.retryRunVisualAssets((req.user as AuthUser).userId, id, body.visualRequest as VisualRequest | undefined);
    return withRequestId(req, result);
  }

  @Sse('chat/runs/:id/stream')
  @UseGuards(AuthGuard)
  streamRun(@Req() req: RequestWithUser, @Param('id') id: string): Observable<MessageEvent> {
    const requestId = getRequestId(req);
    const user = req.user as AuthUser;

    return new Observable<MessageEvent>((subscriber) => {
      void (async () => {
        try {
          for await (const event of this.v3.streamRun(id, user.userId)) {
            subscriber.next({ data: { ...event, requestId } } as MessageEvent);
          }
          subscriber.complete();
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          subscriber.next({ data: { stage: 'error', label: '生成失败', status: 'failed', summary: message, requestId } } as MessageEvent);
          subscriber.complete();
        }
      })();
    });
  }

  @Post('connections/x-self')
  @UseGuards(AuthGuard)
  async connectSelfX(@Req() req: RequestWithUser) {
    const result = await this.v3.connectSelfX((req.user as AuthUser).userId);
    return withRequestId(req, result);
  }

  @Get('connections/x-self/callback')
  async finishConnectSelfX(
    @Req() req: RequestWithUser,
    @Query('state') state?: string,
    @Query('code') code?: string
  ) {
    if (!state || !code) {
      return withRequestId(req, {
        ok: false,
        message: 'Missing state or code',
        nextAction: 'connect_x_self',
        blockingReason: 'MISSING_OAUTH_PARAMS'
      });
    }
    const result = await this.v3.finishSelfXOAuth(state, code);
    return withRequestId(req, result);
  }

  @Post('connections/x-target')
  @UseGuards(AuthGuard)
  async connectTargetX(@Req() req: RequestWithUser, @Body() body: V3ConnectTargetDto) {
    const result = await this.v3.connectTargetX((req.user as AuthUser).userId, body);
    return withRequestId(req, result);
  }

  @Post('connections/obsidian')
  @UseGuards(AuthGuard)
  async connectObsidian(@Req() req: RequestWithUser, @Body() body: V3ConnectObsidianDto) {
    const result = await this.v3.connectObsidian((req.user as AuthUser).userId, body);
    return withRequestId(req, result);
  }

  @Post('connections/local-files')
  @UseGuards(AuthGuard)
  async connectLocalFiles(@Req() req: RequestWithUser, @Body() body: V3ConnectLocalFilesDto) {
    const result = await this.v3.connectLocalFiles((req.user as AuthUser).userId, body);
    return withRequestId(req, result);
  }

  @Post('connections/urls')
  @UseGuards(AuthGuard)
  async connectUrls(@Req() req: RequestWithUser, @Body() body: V3ConnectUrlsDto) {
    const result = await this.v3.connectUrls((req.user as AuthUser).userId, body);
    return withRequestId(req, result);
  }

  @Get('profile')
  @UseGuards(AuthGuard)
  async getProfile(@Req() req: RequestWithUser) {
    const result = await this.v3.getProfile((req.user as AuthUser).userId);
    return withRequestId(req, result);
  }

  @Post('profile/rebuild')
  @UseGuards(AuthGuard)
  async rebuildProfile(@Req() req: RequestWithUser) {
    const result = await this.v3.rebuildProfile((req.user as AuthUser).userId);
    return withRequestId(req, result);
  }

  @Post('publish/prepare')
  @UseGuards(AuthGuard)
  async preparePublish(@Req() req: RequestWithUser, @Body() body: V3PublishPrepareDto) {
    const result = await this.v3.preparePublish((req.user as AuthUser).userId, body);
    return withRequestId(req, result);
  }

  @Post('publish/confirm')
  @UseGuards(AuthGuard)
  async confirmPublish(@Req() req: RequestWithUser, @Body() body: V3PublishConfirmDto) {
    const result = await this.v3.confirmPublish((req.user as AuthUser).userId, body);
    return withRequestId(req, result);
  }

  @Post('publish/article/complete')
  @UseGuards(AuthGuard)
  async completeArticlePublish(@Req() req: RequestWithUser, @Body() body: V3PublishArticleCompleteDto) {
    const result = await this.v3.completeArticlePublish((req.user as AuthUser).userId, body);
    return withRequestId(req, result);
  }

  @Get('queue')
  @UseGuards(AuthGuard)
  async getQueue(@Req() req: RequestWithUser, @Query() query: V3QueueQueryDto) {
    const result = await this.v3.getQueue((req.user as AuthUser).userId, query.limit);
    return withRequestId(req, result);
  }

  @Get('billing/plans')
  async billingPlans(@Req() req: RequestWithUser) {
    const result = this.v3.getBillingPlans();
    return withRequestId(req, result);
  }

  @Post('billing/checkout')
  @UseGuards(AuthGuard)
  async billingCheckout(@Req() req: RequestWithUser, @Body() body: V3BillingCheckoutDto) {
    const result = await this.v3.createCheckout((req.user as AuthUser).userId, body.plan, body.cycle);
    return withRequestId(req, result);
  }
}
