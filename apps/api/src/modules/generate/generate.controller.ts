import {
  Body,
  Controller,
  Get,
  Inject,
  MessageEvent,
  Param,
  Post,
  Query,
  Req,
  Sse,
  UseGuards
} from '@nestjs/common';
import { Observable } from 'rxjs';
import type { AuthUser } from '@draftorbit/shared';
import { GenerationType } from '@draftorbit/db';

type RequestWithUser = { headers: Record<string, string | string[] | undefined>; user: AuthUser };
import { AuthGuard } from '../../common/auth.guard';
import { SubscriptionGuard } from '../../common/subscription.guard';
import { GenerateService } from './generate.service';
import { StartGenerationDto, type GenerateStartMode } from './start-generation.dto';

@Controller('generate')
@UseGuards(AuthGuard)
export class GenerateController {
  constructor(
    @Inject(GenerateService) private readonly generateService: GenerateService,
    @Inject(SubscriptionGuard) private readonly subscriptionGuard: SubscriptionGuard
  ) {}

  @Post('start')
  async start(@Body() body: StartGenerationDto, @Req() req: RequestWithUser) {
    await this.subscriptionGuard.assertCanGenerate(req.user);

    const mode: GenerateStartMode = body.mode ?? (body.brief ? 'brief' : 'advanced');

    const generationId = await this.generateService.startGeneration(
      req.user.userId,
      {
        mode,
        brief: body.brief,
        customPrompt: body.advanced?.customPrompt,
        legacyPrompt: body.prompt,
        type: body.type ?? GenerationType.TWEET,
        language: body.language ?? 'zh',
        useStyle: body.useStyle
      }
    );
    return { generationId };
  }

  @Get('history')
  async history(
    @Req() req: RequestWithUser,
    @Query('limit') limitRaw?: string
  ) {
    const limit = limitRaw ? Math.min(100, Math.max(1, parseInt(limitRaw, 10) || 20)) : 20;
    return this.generateService.listGenerations(req.user.userId, limit);
  }

  @Sse(':id/stream')
  stream(
    @Param('id') id: string,
    @Req() req: RequestWithUser
  ): Observable<MessageEvent> {
    const user = req.user;
    return new Observable<MessageEvent>((subscriber) => {
      void (async () => {
        try {
          for await (const event of this.generateService.runReasoningChain(id, user.userId)) {
            subscriber.next({ data: event } as MessageEvent);
          }
          subscriber.complete();
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          subscriber.next({ data: { step: 'error', content: message } } as MessageEvent);
          subscriber.complete();
        }
      })();
    });
  }

  @Get(':id')
  async one(@Param('id') id: string, @Req() req: RequestWithUser) {
    return this.generateService.getGeneration(id, req.user.userId);
  }
}
