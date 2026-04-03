import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@draftorbit/db';
import { PrismaService } from '../../common/prisma.service';
import { TwitterService } from '../../common/twitter.service';
import { OpenRouterService } from '../../common/openrouter.service';

const STYLE_MODEL = 'deepseek/deepseek-chat';

function parseJsonFromModelContent(content: string): unknown {
  let t = content.trim();
  const fence = /^```(?:json)?\s*\n?([\s\S]*?)\n?```$/m.exec(t);
  if (fence) t = fence[1].trim();
  return JSON.parse(t) as unknown;
}

@Injectable()
export class HistoryService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(TwitterService) private readonly twitter: TwitterService,
    @Inject(OpenRouterService) private readonly openRouter: OpenRouterService
  ) {}

  async analyzeStyle(userId: string): Promise<unknown> {
    const member = await this.prisma.db.workspaceMember.findFirst({
      where: { userId },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }]
    });

    const tweets = await this.twitter.getUserTimeline(userId, 100);
    const top = tweets.slice(0, 50);
    const corpus = top
      .map((t) => (typeof t.text === 'string' ? t.text : ''))
      .filter(Boolean)
      .join('\n---\n');

    if (!corpus.trim()) {
      throw new NotFoundException('未获取到可分析的推文内容');
    }

    const prompt =
      'Analyze this Twitter user\'s writing style from their recent tweets. Identify: tone, vocabulary preferences, emoji usage, sentence structure, topic preferences, hashtag habits. Return a structured JSON analysis.';

    const raw = await this.openRouter.chat(
      STYLE_MODEL,
      [
        { role: 'system', content: 'You respond with valid JSON only.' },
        { role: 'user', content: `${prompt}\n\nTweets:\n${corpus}` }
      ],
      0.5
    );

    let analysis: unknown;
    try {
      analysis = parseJsonFromModelContent(raw);
    } catch {
      analysis = { raw, parseError: true };
    }

    await this.prisma.db.tweetStyle.upsert({
      where: { userId },
      create: {
        userId,
        workspaceId: member?.workspaceId ?? null,
        analysisResult: analysis as Prisma.InputJsonValue,
        sampleCount: top.length,
        lastAnalyzedAt: new Date()
      },
      update: {
        workspaceId: member?.workspaceId ?? null,
        analysisResult: analysis as Prisma.InputJsonValue,
        sampleCount: top.length,
        lastAnalyzedAt: new Date()
      }
    });

    return analysis;
  }

  async getStyle(userId: string) {
    const style = await this.prisma.db.tweetStyle.findUnique({ where: { userId } });
    if (!style) throw new NotFoundException('尚未生成风格分析');
    return style;
  }
}
