import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  DraftStatus,
  GenerationStatus,
  GenerationType,
  StepName,
  StepStatus
} from '@draftorbit/db';
import { PrismaService } from '../../common/prisma.service';
import { OpenRouterService } from '../../common/openrouter.service';

const STEP_ORDER: StepName[] = [
  StepName.HOTSPOT,
  StepName.OUTLINE,
  StepName.DRAFT,
  StepName.HUMANIZE,
  StepName.IMAGE,
  StepName.PACKAGE
];

const MODEL_DEEPSEEK = 'deepseek/deepseek-chat';
const MODEL_DRAFT = 'anthropic/claude-3.5-sonnet';

export type ChainSseEvent = {
  step: StepName | 'error';
  status: 'running' | 'done' | 'failed';
  content?: string;
};

export type PackageResult = {
  tweet: string;
  charCount: number;
  imageKeywords: string[];
  variants: { tone: string; text: string }[];
};

@Injectable()
export class GenerateService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(OpenRouterService) private readonly openRouter: OpenRouterService
  ) {}

  async startGeneration(
    userId: string,
    prompt: string,
    type: GenerationType = GenerationType.TWEET,
    language = 'zh',
    useStyle?: boolean
  ): Promise<string> {
    const member = await this.prisma.db.workspaceMember.findFirst({
      where: { userId },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }]
    });

    let style: string | null = null;
    if (useStyle) {
      const ts = await this.prisma.db.tweetStyle.findUnique({ where: { userId } });
      if (ts?.analysisResult !== undefined && ts.analysisResult !== null) {
        style = JSON.stringify(ts.analysisResult);
      }
    }

    const gen = await this.prisma.db.generation.create({
      data: {
        userId,
        workspaceId: member?.workspaceId ?? null,
        prompt,
        type,
        language,
        style,
        status: GenerationStatus.RUNNING,
        steps: {
          create: STEP_ORDER.map((step) => ({
            step,
            status: StepStatus.PENDING
          }))
        }
      }
    });

    return gen.id;
  }

  async *runReasoningChain(
    generationId: string,
    userId: string
  ): AsyncGenerator<ChainSseEvent> {
    const gen = await this.prisma.db.generation.findFirst({
      where: { id: generationId, userId },
      include: { steps: true }
    });

    if (!gen) throw new NotFoundException('Generation not found');

    if (gen.status === GenerationStatus.DONE) {
      for (const name of STEP_ORDER) {
        const s = gen.steps.find((t) => t.step === name);
        if (s?.content != null) {
          yield { step: s.step, status: 'done', content: s.content };
        }
      }
      return;
    }

    if (gen.status === GenerationStatus.FAILED) {
      yield { step: 'error', status: 'failed', content: 'Generation already failed' };
      return;
    }

    let hotspotContent = '';
    let outlineContent = '';
    let draftContent = '';
    let humanizedContent = '';
    let imageContent = '';

    const hydrateFromDone = () => {
      for (const s of gen.steps) {
        if (s.status !== StepStatus.DONE || s.content == null) continue;
        switch (s.step) {
          case StepName.HOTSPOT:
            hotspotContent = s.content;
            break;
          case StepName.OUTLINE:
            outlineContent = s.content;
            break;
          case StepName.DRAFT:
            draftContent = s.content;
            break;
          case StepName.HUMANIZE:
            humanizedContent = s.content;
            break;
          case StepName.IMAGE:
            imageContent = s.content;
            break;
          default:
            break;
        }
      }
    };
    hydrateFromDone();

    const prompt = gen.prompt;
    const language = gen.language;
    const styleInjection = gen.style
      ? `Match this learned voice/style (JSON hints): ${gen.style}. `
      : '';

    for (const stepName of STEP_ORDER) {
      const row = await this.prisma.db.generationStep.findUnique({
        where: { generationId_step: { generationId, step: stepName } }
      });
      if (!row) throw new Error(`Missing step ${stepName}`);

      if (row.status === StepStatus.DONE && row.content != null) {
        yield { step: stepName, status: 'done', content: row.content };
        continue;
      }

      yield { step: stepName, status: 'running' };

      await this.prisma.db.generationStep.update({
        where: { id: row.id },
        data: { status: StepStatus.RUNNING, startedAt: new Date() }
      });

      try {
        let content = '';

        if (stepName === StepName.HOTSPOT) {
          content = await this.openRouter.chat(
            MODEL_DEEPSEEK,
            [
              {
                role: 'user',
                content: `Based on this topic: '${prompt}', identify 2-3 current trending angles or hot topics related to it. Be concise, bullet points only.`
              }
            ],
            0.8
          );
          hotspotContent = content;
        } else if (stepName === StepName.OUTLINE) {
          content = await this.openRouter.chat(
            MODEL_DEEPSEEK,
            [
              {
                role: 'user',
                content: `Given these hot angles: ${hotspotContent}, create a brief tweet structure outline for: '${prompt}'. Format: hook → body → CTA.`
              }
            ],
            0.8
          );
          outlineContent = content;
        } else if (stepName === StepName.DRAFT) {
          content = await this.openRouter.chat(
            MODEL_DRAFT,
            [
              {
                role: 'user',
                content: `Write a Twitter post based on this outline: ${outlineContent}. Requirements: engaging, under 280 chars for tweet, natural voice. Language: ${language}. ${styleInjection}`
              }
            ],
            0.8
          );
          draftContent = content;
        } else if (stepName === StepName.HUMANIZE) {
          content = await this.openRouter.chat(
            MODEL_DEEPSEEK,
            [
              {
                role: 'user',
                content: `Rewrite this to sound completely natural and human-written. Remove any AI patterns, make it conversational: ${draftContent}`
              }
            ],
            0.8
          );
          humanizedContent = content;
        } else if (stepName === StepName.IMAGE) {
          content = await this.openRouter.chat(
            MODEL_DEEPSEEK,
            [
              {
                role: 'user',
                content: `Suggest 2-3 image ideas that would complement this tweet: ${humanizedContent}. Include keywords for image search and brief composition descriptions.`
              }
            ],
            0.8
          );
          imageContent = content;
        } else if (stepName === StepName.PACKAGE) {
          const formal = await this.openRouter.chat(
            MODEL_DEEPSEEK,
            [
              {
                role: 'user',
                content: `Rewrite this tweet in a more formal, professional tone. Keep under 280 characters. Text: ${humanizedContent}`
              }
            ],
            0.7
          );
          const casual = await this.openRouter.chat(
            MODEL_DEEPSEEK,
            [
              {
                role: 'user',
                content: `Rewrite this tweet in a casual, friendly tone. Keep under 280 characters. Text: ${humanizedContent}`
              }
            ],
            0.9
          );

          const imageKeywords = imageContent
            .split(/[\n,•\-]+/)
            .map((l) => l.trim())
            .filter(Boolean)
            .slice(0, 12);

          const pkg: PackageResult = {
            tweet: humanizedContent,
            charCount: [...humanizedContent].length,
            imageKeywords,
            variants: [
              { tone: 'formal', text: formal.trim() },
              { tone: 'casual', text: casual.trim() }
            ]
          };

          content = JSON.stringify(pkg);

          await this.prisma.db.generationStep.update({
            where: { id: row.id },
            data: {
              status: StepStatus.DONE,
              content,
              completedAt: new Date()
            }
          });

          await this.prisma.db.generation.update({
            where: { id: generationId },
            data: { status: GenerationStatus.DONE, result: pkg as object }
          });

          if (gen.workspaceId) {
            const draft = await this.prisma.db.draft.create({
              data: {
                workspaceId: gen.workspaceId,
                userId,
                language,
                status: DraftStatus.DRAFT,
                title: prompt.slice(0, 64),
                latestContent: pkg.tweet,
                currentVersion: 1
              }
            });

            await this.prisma.db.draftVersion.create({
              data: {
                draftId: draft.id,
                versionNo: 1,
                content: pkg.tweet,
                tone: 'main',
                createdById: userId
              }
            });
          }

          yield { step: StepName.PACKAGE, status: 'done', content };
          return;
        }

        await this.prisma.db.generationStep.update({
          where: { id: row.id },
          data: {
            status: StepStatus.DONE,
            content,
            completedAt: new Date()
          }
        });
        yield { step: stepName, status: 'done', content };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        await this.prisma.db.generationStep.update({
          where: { id: row.id },
          data: { status: StepStatus.FAILED, completedAt: new Date() }
        });
        await this.prisma.db.generation.update({
          where: { id: generationId },
          data: { status: GenerationStatus.FAILED }
        });
        yield { step: 'error', status: 'failed', content: message };
        return;
      }
    }
  }

  async getGeneration(id: string, userId: string) {
    const gen = await this.prisma.db.generation.findFirst({
      where: { id, userId },
      include: { steps: { orderBy: { step: 'asc' } } }
    });
    if (!gen) throw new NotFoundException('Generation not found');
    return gen;
  }

  async listGenerations(userId: string, limit = 20) {
    return this.prisma.db.generation.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: { steps: { orderBy: { step: 'asc' } } }
    });
  }
}
